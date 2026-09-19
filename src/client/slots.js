/**
 * Reading and writing the text "slots" of a page element.
 *
 * A slot is a gap before, between or after an element's child elements,
 * where text can sit. The server divides source elements the same way, so a
 * slot number means the same place in the page and in the file.
 *
 * A plain `br` is part of the text, not a divider: it reads as the line-break
 * character. So does the marker the editor shows for a paragraph break.
 */

import { readConfig } from "./config.js";

const { lineBreak, paragraphBreak } = readConfig();

/** Marks the element the editor shows where a paragraph will be split. */
export const PARAGRAPH_MARKER_ATTRIBUTE = "data-editdesk-paragraph";

/**
 * Returns the character a node stands for inside text, or null when the node
 * is not a break.
 * @param {Node} node
 * @returns {string | null}
 */
export function breakCharacterOf(node) {
  if (!(node instanceof Element)) {
    return null;
  }
  if (node.hasAttribute(PARAGRAPH_MARKER_ATTRIBUTE)) {
    return paragraphBreak;
  }
  return node.localName === "br" && node.attributes.length === 0
    ? lineBreak
    : null;
}

/**
 * Removes line breaks from the end of a piece of slot text. A break with
 * nothing after it shows nothing on the page.
 * @param {string} text
 * @returns {string}
 */
export function dropTrailingLineBreaks(text) {
  let end = text.length;
  while (end > 0 && text[end - 1] === lineBreak) {
    end -= 1;
  }
  return text.slice(0, end);
}

/**
 * Says whether a piece of slot text holds a paragraph break.
 * @param {string} text
 * @returns {boolean}
 */
export function hasParagraphBreak(text) {
  return text.includes(paragraphBreak);
}

/**
 * Says whether a node divides an element's text into slots.
 * @param {Node} node
 * @returns {boolean} True for comments and for elements that are not breaks.
 */
export function isDivider(node) {
  return node.nodeType !== Node.TEXT_NODE && breakCharacterOf(node) === null;
}

/**
 * Creates the element the editor shows where a paragraph will be split.
 * @returns {HTMLElement}
 */
export function createParagraphMarker() {
  const marker = document.createElement("span");
  marker.setAttribute(PARAGRAPH_MARKER_ATTRIBUTE, "");
  return marker;
}

/**
 * Returns the text of each slot of an element.
 * @param {Element} element
 * @returns {string[]} One entry per slot; always one more than the number of dividers.
 */
export function readSlots(element) {
  const slots = [""];
  for (const child of element.childNodes) {
    if (isDivider(child)) {
      slots.push("");
    } else {
      slots[slots.length - 1] += breakCharacterOf(child) ?? child.nodeValue;
    }
  }
  return slots;
}

/**
 * Builds the nodes that show a piece of slot text.
 * @param {string} text Slot text, which may hold break characters.
 * @returns {Node[]} Text nodes, `br` elements and paragraph markers, in order.
 */
export function buildSlotNodes(text) {
  /** @type {Node[]} */
  const nodes = [];
  let run = "";
  const endRun = () => {
    if (run !== "") {
      nodes.push(document.createTextNode(run));
      run = "";
    }
  };
  for (const character of text) {
    if (character === lineBreak) {
      endRun();
      nodes.push(document.createElement("br"));
    } else if (character === paragraphBreak) {
      endRun();
      nodes.push(createParagraphMarker());
    } else {
      run += character;
    }
  }
  endRun();
  return nodes;
}

/**
 * Replaces the text of one slot, leaving every divider in place.
 * @param {Element} element
 * @param {number} slotIndex
 * @param {string} text
 */
export function writeSlot(element, slotIndex, text) {
  let currentSlot = 0;
  /** @type {ChildNode | null} */
  let boundary = null;
  for (const child of [...element.childNodes]) {
    if (isDivider(child)) {
      if (currentSlot === slotIndex) {
        boundary = child;
        break;
      }
      currentSlot += 1;
    } else if (currentSlot === slotIndex) {
      child.remove();
    }
  }
  for (const node of buildSlotNodes(text)) {
    element.insertBefore(node, boundary);
  }
}

/**
 * Lists every divider under a root, in document order.
 * @param {Element} root
 * @returns {Node[]}
 */
export function listDividers(root) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
  );
  const dividers = [];
  while (walker.nextNode()) {
    if (isDivider(walker.currentNode)) {
      dividers.push(walker.currentNode);
    }
  }
  return dividers;
}

/**
 * Says whether two divider lists hold the same nodes in the same order.
 * @param {Node[]} first
 * @param {Node[]} second
 * @returns {boolean}
 */
export function sameDividers(first, second) {
  return (
    first.length === second.length &&
    first.every((node, index) => node === second[index])
  );
}

/**
 * The text and dividers of every element under a root, as they were at one
 * moment.
 * @typedef {{ element: Element, dividers: Node[], slots: string[] }[]} TreeSnapshot
 */

/**
 * Records the text and structure of a root and everything under it.
 * @param {Element} root
 * @returns {TreeSnapshot}
 */
export function captureTree(root) {
  return [root, ...root.querySelectorAll("*")]
    .filter((element) => breakCharacterOf(element) === null)
    .map((element) => ({
      element,
      dividers: [...element.childNodes].filter(isDivider),
      slots: readSlots(element),
    }));
}

/**
 * Puts a root back exactly as a snapshot recorded it, reusing the same
 * elements, so anything that holds a reference to them still works.
 * @param {TreeSnapshot} snapshot
 */
export function restoreTree(snapshot) {
  for (const { element, dividers, slots } of snapshot) {
    const children = slots.flatMap((text, index) => [
      ...buildSlotNodes(text),
      ...(index < dividers.length ? [dividers[index]] : []),
    ]);
    element.replaceChildren(...children);
  }
}
