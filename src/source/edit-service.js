/**
 * Applies one copy edit to the project's source files.
 *
 * An edit is tried two ways, in order. If the page is an HTML file on disk
 * and the edited element maps exactly to its source, that range is rewritten.
 * Otherwise the old text is searched for across the project's source files.
 * The service never guesses: text it cannot place with certainty is reported
 * back, not written.
 *
 * It also remembers what each saved edit did to its file, so Undo and Redo
 * put whole file contents back and work for every kind of edit.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceFileContents } from "./atomic-write.js";
import { describeHtml, rewriteSlot } from "./html-document.js";
import { listSourceFiles, searchProject } from "./project-search.js";
import { hasBreak, LINE_BREAK, PARAGRAPH_BREAK } from "./breaks.js";
import { rewriteMatch, splitWords, whyNotWritable } from "./source-text.js";

const LONGEST_TEXT = 100_000;

const MOST_CANDIDATES = 20;

const MOST_REMEMBERED_EDITS = 200;

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
 * @property {boolean} keepsLineBreaks True when the page shows the line breaks of the text in the edited element.
 */

/**
 * A place offered to the person to choose from.
 * @typedef {{ file: string, start: number, line: number, preview: import("./project-search.js").MatchPreview }} Candidate
 */

/**
 * Whether there is anything to undo or redo.
 * @typedef {{ canUndo: boolean, canRedo: boolean }} HistoryState
 */

/**
 * A saved change to a file. `id` names the edit; `changedStructure` is true
 * when it added or removed a line or paragraph break, so the page's elements
 * no longer match the ones the browser holds.
 * @typedef {{ outcome: "saved", id: number, file: string, line: number, location: { file: string, start: number } | null, changedStructure: boolean, history: HistoryState }} SavedOutcome
 */

/**
 * What happened to an edit, an undo or a redo.
 * @typedef {SavedOutcome
 *   | { outcome: "choose", reason: "several" | "confirm", candidates: Candidate[] }
 *   | { outcome: "not-found" }
 *   | { outcome: "nothing-to-replay" }
 *   | { outcome: "refused", reason: "unsafe-characters" | "line-break-not-shown" | "changed-on-disk" | "empty-text" }} EditOutcome
 */

/**
 * @typedef {{ id: number, file: string, line: number, location: { file: string, start: number } | null, changedStructure: boolean, before: string, after: string }} RememberedEdit
 */

/**
 * Creates the service for one project.
 * @param {object} options
 * @param {string} options.root The project folder; nothing outside it is read or written.
 * @param {(page: string) => Promise<string | null>} options.resolvePageFile Returns the HTML file behind a page path, relative to the root, or null.
 * @returns {{ applyEdit: (request: EditRequest) => Promise<EditOutcome>, undo: () => Promise<EditOutcome>, redo: () => Promise<EditOutcome>, historyState: () => HistoryState }}
 */
export function createEditService({ root, resolvePageFile }) {
  /** @type {Promise<unknown>} */
  let lastEdit = Promise.resolve();
  /** @type {RememberedEdit[]} */
  const done = [];
  /** @type {RememberedEdit[]} */
  const undone = [];
  let nextId = 1;

  const historyState = () => ({
    canUndo: done.length > 0,
    canRedo: undone.length > 0,
  });

  /**
   * Runs one file-changing task after the ones before it have finished.
   * @param {() => Promise<EditOutcome>} task
   * @returns {Promise<EditOutcome>}
   */
  function inTurn(task) {
    const result = lastEdit.then(task);
    lastEdit = result.catch(() => {});
    return result;
  }

  /**
   * Writes a file and remembers what it held before and after.
   * @param {object} change
   * @param {string} change.file
   * @param {string} change.before
   * @param {string} change.after
   * @param {number} change.line
   * @param {{ file: string, start: number } | null} change.location
   * @param {EditRequest} change.request
   * @returns {Promise<SavedOutcome>}
   */
  async function save({ file, before, after, line, location, request }) {
    await replaceFileContents(path.join(root, file), after);
    const changedStructure =
      hasBreak(request.oldText) || hasBreak(request.newText);
    const remembered = {
      id: nextId,
      file,
      line,
      location,
      changedStructure,
      before,
      after,
    };
    nextId += 1;
    done.push(remembered);
    done.splice(0, done.length - MOST_REMEMBERED_EDITS);
    undone.length = 0;
    return describeSaved(remembered);
  }

  /**
   * @param {RememberedEdit} remembered
   * @returns {SavedOutcome}
   */
  function describeSaved({ id, file, line, location, changedStructure }) {
    return {
      outcome: "saved",
      id,
      file,
      line,
      location,
      changedStructure,
      history: historyState(),
    };
  }

  /**
   * Moves the newest edit from one list to the other, writing the file
   * contents it should now hold. Refuses when the file is not as the edit
   * left it.
   * @param {RememberedEdit[]} from
   * @param {RememberedEdit[]} to
   * @param {"before" | "after"} expected Which contents the file should hold now.
   * @param {"before" | "after"} wanted Which contents to write.
   * @returns {Promise<EditOutcome>}
   */
  async function replay(from, to, expected, wanted) {
    const remembered = from.at(-1);
    if (!remembered) {
      return { outcome: "nothing-to-replay" };
    }
    const absolutePath = path.join(root, remembered.file);
    const current = await readFile(absolutePath, "utf8").catch(() => null);
    if (current !== remembered[expected]) {
      return { outcome: "refused", reason: "changed-on-disk" };
    }
    await replaceFileContents(absolutePath, remembered[wanted]);
    from.pop();
    to.push(remembered);
    return describeSaved(remembered);
  }

  /**
   * @param {EditRequest} request
   * @returns {Promise<EditOutcome>}
   */
  async function applyEditNow(request) {
    const mapped = await applyToMappedSlot(request);
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
    const source = await readFile(path.join(root, file), "utf8");
    const element = describeHtml(source).elements[request.element];
    const slot = element?.slots[request.slot];
    if (slot?.text !== request.oldText) {
      return null;
    }
    return save({
      file,
      before: source,
      after: rewriteSlot(source, slot, request.newText, element.paragraphBreak),
      line: lineAt(source, slot.start),
      location: null,
      request,
    });
  }

  /**
   * @param {EditRequest} givenRequest A paragraph break has no meaning outside a page's own HTML file, so it is written as two line breaks.
   * @returns {Promise<EditOutcome>}
   */
  async function applyBySearch(givenRequest) {
    const request = {
      ...givenRequest,
      newText: givenRequest.newText.replaceAll(
        PARAGRAPH_BREAK,
        LINE_BREAK + LINE_BREAK,
      ),
    };
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
    const reason = whyNotWritable(
      match.context,
      request.newText,
      request.keepsLineBreaks,
    );
    if (reason !== null) {
      return { outcome: "refused", reason };
    }
    const source = await readFile(path.join(root, match.file), "utf8");
    return save({
      file: match.file,
      before: source,
      after: rewriteMatch(source, match, request.oldText, request.newText),
      line: match.line,
      location: { file: match.file, start: match.start },
      request,
    });
  }

  return {
    applyEdit: (request) => inTurn(() => applyEditNow(request)),
    undo: () => inTurn(() => replay(done, undone, "after", "before")),
    redo: () => inTurn(() => replay(undone, done, "before", "after")),
    historyState,
  };
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
  const { page, element, slot, oldText, newText, location, keepsLineBreaks } =
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
    typeof keepsLineBreaks !== "boolean" ||
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
    keepsLineBreaks,
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
