/**
 * Maps the text of an HTML file to its exact position in the source.
 *
 * Every element is divided into "slots": the gaps before, between and after
 * its child elements, where text can sit. A slot always has a position in the
 * source, even when it is empty, so an edit is a replacement of one slot's
 * range and nothing else in the file moves.
 */

import { parse } from "parse5";
import { decodeHtmlText, rewriteHtmlText } from "./html-text.js";

/** The attribute that carries an element's number in the served copy. */
export const ELEMENT_ATTRIBUTE = "data-editdesk-el";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

const ELEMENTS_WITHOUT_EDITABLE_TEXT = new Set([
  "head",
  "script",
  "style",
  "template",
  "noscript",
  "textarea",
  "title",
  "select",
  "option",
  "iframe",
  "object",
  "svg",
  "math",
]);

/**
 * One gap inside an element where text can sit.
 * @typedef {{ start: number, end: number, text: string }} SourceSlot
 */

/**
 * An element of the source whose text can be edited.
 * @typedef {{ id: number, attributeOffset: number, slots: SourceSlot[] }} SourceElement
 */

/**
 * What Editdesk knows about one HTML source file.
 * @typedef {{ elements: SourceElement[], headOffset: number }} HtmlDescription
 */

/**
 * Finds every element with editable text, and where the editor script goes.
 * @param {string} source The HTML file's contents.
 * @returns {HtmlDescription} The elements in document order.
 */
export function describeHtml(source) {
  const document = parse(source, { sourceCodeLocationInfo: true });
  /** @type {SourceElement[]} */
  const elements = [];
  collectElements(document, source, elements);
  return { elements, headOffset: findHeadOffset(document) };
}

/**
 * Builds the copy of an HTML file that the browser receives: the same source
 * with each editable element numbered and one snippet added to the head.
 * @param {string} source The HTML file's contents.
 * @param {string} headSnippet Markup to add inside the head.
 * @returns {string} The served copy.
 */
export function annotateHtml(source, headSnippet) {
  const { elements, headOffset } = describeHtml(source);
  const insertions = elements.map((element) => ({
    offset: element.attributeOffset,
    text: ` ${ELEMENT_ATTRIBUTE}="${element.id}"`,
  }));
  insertions.push({ offset: headOffset, text: headSnippet });
  return insertAll(source, insertions);
}

/**
 * Adds one snippet to the head of an HTML page and changes nothing else.
 * @param {string} source The HTML page.
 * @param {string} headSnippet Markup to add inside the head.
 * @returns {string} The page with the snippet added.
 */
export function injectIntoHead(source, headSnippet) {
  const document = parse(source, { sourceCodeLocationInfo: true });
  return insertAll(source, [
    { offset: findHeadOffset(document), text: headSnippet },
  ]);
}

/**
 * Rewrites one slot of an HTML file.
 * @param {string} source The HTML file's contents.
 * @param {SourceSlot} slot The slot, as returned by {@link describeHtml} for this same source.
 * @param {string} newText The text the slot should show.
 * @returns {string} The file's new contents.
 */
export function rewriteSlot(source, slot, newText) {
  const raw = source.slice(slot.start, slot.end);
  return (
    source.slice(0, slot.start) +
    rewriteHtmlText(raw, newText) +
    source.slice(slot.end)
  );
}

/**
 * @param {any} node A parse5 node.
 * @param {string} source
 * @param {SourceElement[]} elements Collected so far; appended to.
 */
function collectElements(node, source, elements) {
  for (const child of node.childNodes ?? []) {
    if (!child.tagName) {
      continue;
    }
    if (
      ELEMENTS_WITHOUT_EDITABLE_TEXT.has(child.tagName) ||
      child.namespaceURI !== HTML_NAMESPACE
    ) {
      continue;
    }
    const slots = findSlots(child, source);
    if (slots) {
      const startTag = child.sourceCodeLocation.startTag;
      elements.push({
        id: elements.length,
        attributeOffset: startTag.startOffset + 1 + child.tagName.length,
        slots,
      });
    }
    collectElements(child, source, elements);
  }
}

/**
 * Returns an element's slots, or null when its text cannot be mapped to the
 * source with certainty.
 * @param {any} element A parse5 element.
 * @param {string} source
 * @returns {SourceSlot[] | null}
 */
function findSlots(element, source) {
  const location = element.sourceCodeLocation;
  if (
    !location?.startTag ||
    location.startTag.endOffset === location.endOffset
  ) {
    return null;
  }

  /** @type {SourceSlot[]} */
  const slots = [];
  let slotStart = location.startTag.endOffset;
  let slotText = "";
  for (const child of element.childNodes) {
    if (child.nodeName === "#text") {
      slotText += child.value;
      continue;
    }
    if (!child.sourceCodeLocation) {
      return null;
    }
    slots.push({
      start: slotStart,
      end: child.sourceCodeLocation.startOffset,
      text: slotText,
    });
    slotStart = child.sourceCodeLocation.endOffset;
    slotText = "";
  }
  const elementEnd = location.endTag?.startOffset ?? location.endOffset;
  slots.push({ start: slotStart, end: elementEnd, text: slotText });

  const mapsExactly = slots.every(
    (slot) =>
      slot.start <= slot.end &&
      decodeHtmlText(source.slice(slot.start, slot.end)) === slot.text,
  );
  return mapsExactly ? slots : null;
}

/**
 * Finds where a snippet can join the head without disturbing the page.
 * @param {any} document A parse5 document.
 * @returns {number} An offset into the source.
 */
function findHeadOffset(document) {
  const html = document.childNodes.find(
    (/** @type {any} */ node) => node.tagName === "html",
  );
  const head = html?.childNodes.find(
    (/** @type {any} */ node) => node.tagName === "head",
  );
  const doctype = document.childNodes.find(
    (/** @type {any} */ node) => node.nodeName === "#documentType",
  );
  return (
    head?.sourceCodeLocation?.startTag?.endOffset ??
    html?.sourceCodeLocation?.startTag?.endOffset ??
    doctype?.sourceCodeLocation?.endOffset ??
    0
  );
}

/**
 * @param {string} source
 * @param {{ offset: number, text: string }[]} insertions
 */
function insertAll(source, insertions) {
  const ordered = [...insertions].sort((a, b) => a.offset - b.offset);
  let result = "";
  let position = 0;
  for (const insertion of ordered) {
    result += source.slice(position, insertion.offset) + insertion.text;
    position = insertion.offset;
  }
  return result + source.slice(position);
}
