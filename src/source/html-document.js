/**
 * Maps the text of an HTML file to its exact position in the source.
 *
 * Every element is divided into "slots": the gaps before, between and after
 * its child elements, where text can sit. A slot always has a position in the
 * source, even when it is empty, so an edit is a replacement of one slot's
 * range and nothing else in the file moves.
 */

import { parse } from "parse5";
import { LINE_BREAK } from "./breaks.js";
import { decodeHtmlText, rewriteHtmlText } from "./html-text.js";

/** The attribute that carries an element's number in the served copy. */
export const ELEMENT_ATTRIBUTE = "data-editdesk-el";

const BYTE_ORDER_MARK = "\uFEFF";

const ELEMENTS_THAT_SPLIT_INTO_PARAGRAPHS = new Set(["p", "li"]);

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
 * @typedef {{ id: number, attributeOffset: number, slots: SourceSlot[], paragraphBreak: string | undefined }} SourceElement `paragraphBreak` is the markup that ends this element and starts a copy of it, when it is a paragraph or list item.
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
  const markLength = source.startsWith(BYTE_ORDER_MARK) ? 1 : 0;
  const markup = source.slice(markLength);
  const document = parse(markup, { sourceCodeLocationInfo: true });
  /** @type {SourceElement[]} */
  const elements = [];
  collectElements(document, markup, elements);
  return {
    elements: elements.map((element) => ({
      id: element.id,
      attributeOffset: element.attributeOffset + markLength,
      paragraphBreak: element.paragraphBreak,
      slots: element.slots.map((slot) => ({
        start: slot.start + markLength,
        end: slot.end + markLength,
        text: slot.text,
      })),
    })),
    headOffset: findHeadOffset(document) + markLength,
  };
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
  return insertAll(source, [
    { offset: describeHtml(source).headOffset, text: headSnippet },
  ]);
}

/**
 * Rewrites one slot of an HTML file.
 * @param {string} source The HTML file's contents.
 * @param {SourceSlot} slot The slot, as returned by {@link describeHtml} for this same source.
 * @param {string} newText The text the slot should show.
 * @param {string} [paragraphBreak] The slot's element's `paragraphBreak`.
 * @returns {string} The file's new contents.
 */
export function rewriteSlot(source, slot, newText, paragraphBreak) {
  const raw = source.slice(slot.start, slot.end);
  return (
    source.slice(0, slot.start) +
    rewriteHtmlText(raw, newText, paragraphBreak) +
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
        paragraphBreak: paragraphBreakFor(child, source),
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
    if (child.tagName === "br" && child.attrs.length === 0) {
      slotText += LINE_BREAK;
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
 * Builds the markup that splits a paragraph or list item in two: its end
 * tag, then its own start tag again on a new line at the same indentation.
 * The copy drops the `id`, which must stay unique.
 * @param {any} element A parse5 element with a located start tag.
 * @param {string} source
 * @returns {string | undefined} Undefined for an element that cannot be split.
 */
function paragraphBreakFor(element, source) {
  if (!ELEMENTS_THAT_SPLIT_INTO_PARAGRAPHS.has(element.tagName)) {
    return undefined;
  }
  const { startOffset, endOffset } = element.sourceCodeLocation.startTag;
  const lineStart = source.lastIndexOf("\n", startOffset - 1) + 1;
  const beforeTag = source.slice(lineStart, startOffset);
  const indentation = beforeTag.trim() === "" ? `\n${beforeTag}` : "";
  const id = element.sourceCodeLocation.attrs?.id;
  const startTag = id
    ? source.slice(startOffset, id.startOffset).trimEnd() +
      source.slice(id.endOffset, endOffset)
    : source.slice(startOffset, endOffset);
  return `</${element.tagName}>${indentation}${startTag}`;
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
