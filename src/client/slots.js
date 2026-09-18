/**
 * Reading and writing the text "slots" of a page element.
 *
 * A slot is a gap before, between or after an element's child elements,
 * where text can sit. The server divides source elements the same way, so a
 * slot number means the same place in the page and in the file.
 */

/**
 * Returns the text of each slot of an element.
 * @param {Element} element
 * @returns {string[]} One entry per slot; always one more than the number of non-text children.
 */
export function readSlots(element) {
  const slots = [""];
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      slots[slots.length - 1] += child.nodeValue;
    } else {
      slots.push("");
    }
  }
  return slots;
}

/**
 * Replaces the text of one slot, leaving every other child in place.
 * @param {Element} element
 * @param {number} slotIndex
 * @param {string} text
 */
export function writeSlot(element, slotIndex, text) {
  let currentSlot = 0;
  /** @type {ChildNode | null} */
  let boundary = null;
  for (const child of [...element.childNodes]) {
    if (child.nodeType !== Node.TEXT_NODE) {
      if (currentSlot === slotIndex) {
        boundary = child;
        break;
      }
      currentSlot += 1;
    } else if (currentSlot === slotIndex) {
      child.remove();
    }
  }
  if (text !== "") {
    element.insertBefore(document.createTextNode(text), boundary);
  }
}

/**
 * Lists every element and comment under a root, in document order.
 * @param {Element} root
 * @returns {Node[]} The nodes that divide text into slots.
 */
export function listDividers(root) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
  );
  const dividers = [];
  while (walker.nextNode()) {
    dividers.push(walker.currentNode);
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
 * The text and child elements of every element under a root, as they were at
 * one moment.
 * @typedef {{ element: Element, dividers: Node[], slots: string[] }[]} TreeSnapshot
 */

/**
 * Records the text and structure of a root and everything under it.
 * @param {Element} root
 * @returns {TreeSnapshot}
 */
export function captureTree(root) {
  return [root, ...root.querySelectorAll("*")].map((element) => ({
    element,
    dividers: [...element.childNodes].filter(
      (child) => child.nodeType !== Node.TEXT_NODE,
    ),
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
      ...(text === "" ? [] : [document.createTextNode(text)]),
      ...(index < dividers.length ? [dividers[index]] : []),
    ]);
    element.replaceChildren(...children);
  }
}
