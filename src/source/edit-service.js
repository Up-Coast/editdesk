/**
 * Applies one copy edit to the project's source files.
 *
 * An edit is tried two ways, in order. If the page is an HTML file on disk
 * and the edited element maps exactly to its source, that range is rewritten.
 * Otherwise the old text is searched for across the project's source files.
 * The service never guesses: text it cannot place with certainty is reported
 * back, not written.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceFileContents } from "./atomic-write.js";
import { describeHtml, rewriteSlot } from "./html-document.js";
import { listSourceFiles, searchProject } from "./project-search.js";
import { canWrite, rewriteMatch, splitWords } from "./source-text.js";

const LONGEST_TEXT = 100_000;

const MOST_CANDIDATES = 20;

const PATHS_LISTED_LAST =
  /(^|\/)(tests?|__tests__|docs?|examples?|fixtures)\/|\.(test|spec)\.[^/]+$/;

/**
 * An edit as the editor in the browser sends it.
 * @typedef {object} EditRequest
 * @property {string} page The page's URL path.
 * @property {number | null} element The edited element's number, when the page carries numbers.
 * @property {number} slot Which slot of the element was edited.
 * @property {string} oldText The slot's text before the edit.
 * @property {string} newText The slot's text after the edit.
 * @property {{ file: string, start: number } | null} location A place the person picked, or where an earlier edit landed.
 * @property {boolean} mappedOnly True when the edit replays one that was saved to the page's own file, so it must land there or nowhere.
 */

/**
 * A place offered to the person to choose from.
 * @typedef {{ file: string, start: number, line: number, preview: import("./project-search.js").MatchPreview }} Candidate
 */

/**
 * What happened to an edit.
 * @typedef {{ outcome: "saved", file: string, line: number, location: { file: string, start: number } | null }
 *   | { outcome: "choose", reason: "several" | "confirm", candidates: Candidate[] }
 *   | { outcome: "not-found" }
 *   | { outcome: "refused", reason: "unsafe-characters" | "changed-on-disk" | "empty-text" }} EditOutcome
 */

/**
 * Creates the service for one project.
 * @param {object} options
 * @param {string} options.root The project folder; nothing outside it is read or written.
 * @param {(page: string) => Promise<string | null>} options.resolvePageFile Returns the HTML file behind a page path, relative to the root, or null.
 * @returns {{ applyEdit: (request: EditRequest) => Promise<EditOutcome> }}
 */
export function createEditService({ root, resolvePageFile }) {
  /** @type {Promise<unknown>} */
  let lastEdit = Promise.resolve();

  /**
   * @param {EditRequest} request
   * @returns {Promise<EditOutcome>}
   */
  function applyEdit(request) {
    const result = lastEdit.then(() => applyEditNow(request));
    lastEdit = result.catch(() => {});
    return result;
  }

  /**
   * @param {EditRequest} request
   * @returns {Promise<EditOutcome>}
   */
  async function applyEditNow(request) {
    const mapped = await applyToMappedSlot(request);
    if (mapped === null && request.mappedOnly) {
      return { outcome: "refused", reason: "changed-on-disk" };
    }
    return mapped ?? applyBySearch(request);
  }

  /**
   * @param {EditRequest} request
   * @returns {Promise<EditOutcome | null>}
   */
  async function applyToMappedSlot(request) {
    if (request.element === null || request.location !== null) {
      return null;
    }
    const file = await resolvePageFile(request.page);
    if (file === null) {
      return null;
    }
    const absolutePath = path.join(root, file);
    const source = await readFile(absolutePath, "utf8");
    const slot =
      describeHtml(source).elements[request.element]?.slots[request.slot];
    if (slot?.text !== request.oldText) {
      return null;
    }
    await replaceFileContents(
      absolutePath,
      rewriteSlot(source, slot, request.newText),
    );
    return {
      outcome: "saved",
      file,
      line: lineAt(source, slot.start),
      location: null,
    };
  }

  /**
   * @param {EditRequest} request
   * @returns {Promise<EditOutcome>}
   */
  async function applyBySearch(request) {
    if (splitWords(request.oldText).length === 0) {
      return { outcome: "not-found" };
    }
    if (splitWords(request.newText).length === 0) {
      return { outcome: "refused", reason: "empty-text" };
    }
    const location = request.location;
    if (location !== null) {
      const known = await listSourceFiles(root);
      if (!known.includes(location.file)) {
        return { outcome: "refused", reason: "changed-on-disk" };
      }
      const matches = await searchProject(root, request.oldText, [
        location.file,
      ]);
      const picked = matches.find((match) => match.start === location.start);
      return picked
        ? writeMatch(picked, request)
        : { outcome: "refused", reason: "changed-on-disk" };
    }

    const matches = await searchProject(root, request.oldText);
    const certain = matches.filter((match) => match.context.kind !== "partial");
    if (certain.length === 1) {
      return writeMatch(certain[0], request);
    }
    if (matches.length === 0) {
      return { outcome: "not-found" };
    }
    const offered = listSourceBeforeTestsAndDocs(
      certain.length > 1 ? certain : matches,
    );
    return {
      outcome: "choose",
      reason: certain.length > 1 ? "several" : "confirm",
      candidates: offered
        .slice(0, MOST_CANDIDATES)
        .map(({ file, start, line, preview }) => ({
          file,
          start,
          line,
          preview,
        })),
    };
  }

  /**
   * @param {import("./project-search.js").ProjectMatch} match
   * @param {EditRequest} request
   * @returns {Promise<EditOutcome>}
   */
  async function writeMatch(match, request) {
    if (!canWrite(match.context, request.newText)) {
      return { outcome: "refused", reason: "unsafe-characters" };
    }
    const absolutePath = path.join(root, match.file);
    const source = await readFile(absolutePath, "utf8");
    await replaceFileContents(
      absolutePath,
      rewriteMatch(source, match, request.oldText, request.newText),
    );
    return {
      outcome: "saved",
      file: match.file,
      line: match.line,
      location: { file: match.file, start: match.start },
    };
  }

  return { applyEdit };
}

/**
 * Orders places so the app's own source comes before its tests and documents,
 * which often repeat the same words.
 * @template {{ file: string }} Place
 * @param {Place[]} places
 * @returns {Place[]} The same places; the order within each group is kept.
 */
function listSourceBeforeTestsAndDocs(places) {
  const isListedLast = (/** @type {Place} */ place) =>
    PATHS_LISTED_LAST.test(place.file);
  return [
    ...places.filter((place) => !isListedLast(place)),
    ...places.filter(isListedLast),
  ];
}

/**
 * Checks that a request body has the shape of an edit.
 * @param {unknown} body Parsed JSON from the browser.
 * @returns {EditRequest | null} The edit, or null when the body is not one.
 */
export function parseEditRequest(body) {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { page, element, slot, oldText, newText, location, mappedOnly } =
    /** @type {Record<string, unknown>} */ (body);
  const isText = (/** @type {unknown} */ value) =>
    typeof value === "string" && value.length <= LONGEST_TEXT;
  const isIndex = (/** @type {unknown} */ value) =>
    Number.isInteger(value) && /** @type {number} */ (value) >= 0;
  const locationIsValid =
    location === null ||
    (typeof location === "object" &&
      isText(/** @type {any} */ (location).file) &&
      isIndex(/** @type {any} */ (location).start));
  if (
    !isText(page) ||
    !(element === null || isIndex(element)) ||
    !isIndex(slot) ||
    !isText(oldText) ||
    !isText(newText) ||
    typeof mappedOnly !== "boolean" ||
    !locationIsValid
  ) {
    return null;
  }
  return /** @type {EditRequest} */ ({
    page,
    element,
    slot,
    oldText,
    newText,
    mappedOnly,
    location: location === null ? null : { ...location },
  });
}

/**
 * @param {string} source
 * @param {number} offset
 */
function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}
