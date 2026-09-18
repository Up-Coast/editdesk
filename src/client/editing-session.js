/**
 * One editing session: a page element made editable in place, from the click
 * that starts it to the commit or cancel that ends it.
 *
 * The element keeps its own styles while it is edited, so the text looks
 * exactly as it will on the finished page. Only text may change: the session
 * refuses any input that would add or remove an element.
 */

import {
  captureTree,
  listDividers,
  readSlots,
  restoreTree,
  sameDividers,
  writeSlot,
} from "./slots.js";

/** Marks the element being edited, for the page stylesheet. */
export const ACTIVE_ATTRIBUTE = "data-editdesk-active";

const NO_BREAK_SPACE = " ";

const INPUT_TYPES_THAT_MEAN_ENTER = new Set([
  "insertParagraph",
  "insertLineBreak",
]);

const INPUT_TYPES_THAT_ADD_STRUCTURE = new Set([
  "insertOrderedList",
  "insertUnorderedList",
  "insertHorizontalRule",
  "insertLink",
]);

const ELEMENTS_THAT_ARE_NOT_COPY = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "OPTION",
  "IFRAME",
  "CANVAS",
  "VIDEO",
  "AUDIO",
  "SCRIPT",
  "STYLE",
]);

/**
 * A slot whose text the session changed.
 * @typedef {{ target: Element, slot: number, oldText: string, newText: string }} SlotChange
 */

/**
 * Finds the element to edit for a click: the block of text the click landed
 * in, including any bold, links or other inline formatting inside it.
 * @param {EventTarget | null} target The click's target.
 * @returns {HTMLElement | null} The element, or null when the click was not on text.
 */
export function findEditableHost(target) {
  if (
    !(target instanceof HTMLElement) ||
    ELEMENTS_THAT_ARE_NOT_COPY.has(target.tagName) ||
    !readSlots(target).some((text) => text.trim() !== "")
  ) {
    return null;
  }
  let host = target;
  while (
    host.parentElement instanceof HTMLElement &&
    host.parentElement !== document.body &&
    getComputedStyle(host).display === "inline"
  ) {
    host = host.parentElement;
  }
  return host;
}

/**
 * Starts editing an element.
 * @param {HTMLElement} host The element from {@link findEditableHost}.
 * @param {{ x: number, y: number }} point Where the click landed, to place the caret.
 * @param {object} callbacks
 * @param {() => void} callbacks.onRefusedInput Called when input is refused because it would remove formatting.
 * @param {() => void} callbacks.onEnter Called when the person presses Enter, which ends the edit instead of adding a line.
 * @returns {{ host: HTMLElement, commit: () => SlotChange[], cancel: () => void }} The session.
 */
export function startEditingSession(host, point, { onRefusedInput, onEnter }) {
  const elements = [host, ...host.querySelectorAll("*")];
  const originalSlots = new Map(
    elements.map((element) => [element, readSlots(element)]),
  );
  const originalDividers = listDividers(host);
  let lastGoodTree = captureTree(host);
  const previousAttributes = {
    contenteditable: host.getAttribute("contenteditable"),
    spellcheck: host.getAttribute("spellcheck"),
  };

  /** @param {InputEvent} event */
  function guardInput(event) {
    if (INPUT_TYPES_THAT_MEAN_ENTER.has(event.inputType)) {
      event.preventDefault();
      onEnter();
      return;
    }
    const changesStructure =
      INPUT_TYPES_THAT_ADD_STRUCTURE.has(event.inputType) ||
      event.inputType.startsWith("format");
    const ranges = affectedRanges(event);
    const crossesFormatting = ranges.some((range) =>
      rangeContainsDivider(range),
    );
    if (changesStructure || crossesFormatting) {
      event.preventDefault();
      if (crossesFormatting) {
        onRefusedInput();
      }
      return;
    }
    if (!replaceWholeInlineTextByHand(event, ranges, host)) {
      insertAtInlineEdgeByHand(event, ranges, host);
    }
  }

  function keepOrRestoreStructure() {
    if (sameDividers(listDividers(host), originalDividers)) {
      lastGoodTree = captureTree(host);
      return;
    }
    restoreTree(lastGoodTree);
    getSelection()?.selectAllChildren(host);
    getSelection()?.collapseToEnd();
    onRefusedInput();
  }

  function end() {
    host.removeEventListener("beforeinput", guardInput);
    host.removeEventListener("input", keepOrRestoreStructure);
    restoreAttribute(
      host,
      "contenteditable",
      previousAttributes.contenteditable,
    );
    restoreAttribute(host, "spellcheck", previousAttributes.spellcheck);
    host.removeAttribute(ACTIVE_ATTRIBUTE);
    host.blur();
    getSelection()?.removeAllRanges();
  }

  host.setAttribute("contenteditable", "plaintext-only");
  if (!host.isContentEditable) {
    host.setAttribute("contenteditable", "true");
  }
  host.setAttribute("spellcheck", "true");
  host.setAttribute(ACTIVE_ATTRIBUTE, "");
  host.addEventListener("beforeinput", guardInput);
  host.addEventListener("input", keepOrRestoreStructure);
  host.focus({ preventScroll: true });
  placeCaret(point);

  return {
    host,
    commit() {
      end();
      /** @type {SlotChange[]} */
      const changes = [];
      for (const [element, slots] of originalSlots) {
        if (!element.isConnected) {
          continue;
        }
        readSlots(element).forEach((text, slot) => {
          const oldText = slots[slot] ?? "";
          const newText = oldText.includes(NO_BREAK_SPACE)
            ? text
            : text.replaceAll(NO_BREAK_SPACE, " ");
          if (newText !== text) {
            writeSlot(element, slot, newText);
          }
          if (newText !== oldText) {
            changes.push({ target: element, slot, oldText, newText });
          }
        });
      }
      return changes;
    },
    cancel() {
      end();
      for (const [element, slots] of originalSlots) {
        if (!element.isConnected) {
          continue;
        }
        readSlots(element).forEach((text, slot) => {
          if (text !== slots[slot]) {
            writeSlot(element, slot, slots[slot] ?? "");
          }
        });
      }
    },
  };
}

/**
 * @param {AbstractRange} range
 */
function rangeContainsDivider(range) {
  if (range.startContainer === range.endContainer) {
    return false;
  }
  const live = document.createRange();
  live.setStart(range.startContainer, range.startOffset);
  live.setEnd(range.endContainer, range.endOffset);
  const contents = live.cloneContents();
  return (
    contents.querySelector("*") !== null ||
    [...contents.childNodes].some(
      (node) => node.nodeType === Node.COMMENT_NODE,
    ) ||
    range.startContainer.parentNode !== range.endContainer.parentNode
  );
}

/**
 * Returns the ranges an input will change. Browsers leave the event's own
 * list empty for plain-text editing, so the selection stands in for it.
 * @param {InputEvent} event
 * @returns {AbstractRange[]}
 */
function affectedRanges(event) {
  const ranges = event.getTargetRanges();
  const selection = getSelection();
  if (ranges.length > 0 || !selection || selection.rangeCount === 0) {
    return ranges;
  }
  return [selection.getRangeAt(0)];
}

/**
 * Browsers remove an inline element, such as a bold, when all of its text is
 * deleted or typed over. This makes that change by hand so the element stays.
 * @param {InputEvent} event
 * @param {AbstractRange[]} ranges
 * @param {HTMLElement} host
 * @returns {boolean} True when the change was made here.
 */
function replaceWholeInlineTextByHand(event, ranges, host) {
  const node =
    event.cancelable && ranges.length === 1 ? wholeTextNodeIn(ranges[0]) : null;
  if (!node || node.parentNode === host) {
    return false;
  }
  event.preventDefault();
  node.data = insertedText(event);
  getSelection()?.collapse(node, node.length);
  host.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return true;
}

/**
 * Browsers move text typed at the very start or end of a link outside the
 * link. This inserts it by hand so it joins the text the caret is in.
 * @param {InputEvent} event
 * @param {AbstractRange[]} ranges
 * @param {HTMLElement} host
 */
function insertAtInlineEdgeByHand(event, ranges, host) {
  const [range] = ranges;
  const node = range?.startContainer;
  const text = insertedText(event);
  const isAtEdge =
    event.cancelable &&
    ranges.length === 1 &&
    range.collapsed &&
    node instanceof Text &&
    node.parentNode !== host &&
    (range.startOffset === 0 || range.startOffset === node.length);
  if (!isAtEdge || text === "") {
    return;
  }
  event.preventDefault();
  node.insertData(range.startOffset, text);
  getSelection()?.collapse(node, range.startOffset + text.length);
  host.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

/**
 * Returns the plain text an input event adds, on one line.
 * @param {InputEvent} event
 */
function insertedText(event) {
  const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
  return text.replaceAll(/[\r\n]+/g, " ");
}

/**
 * Returns the text node a range covers from its first to its last character,
 * or null when the range covers anything else. An emptied inline element
 * counts: the caret inside it covers all of its (no) text.
 * @param {AbstractRange} range
 * @returns {Text | null}
 */
function wholeTextNodeIn(range) {
  const { startContainer, startOffset, endContainer, endOffset } = range;
  if (range.collapsed) {
    if (startContainer instanceof Text) {
      return startContainer.length === 0 ? startContainer : null;
    }
    return startContainer.childNodes.length === 0
      ? startContainer.appendChild(document.createTextNode(""))
      : null;
  }
  const first =
    startContainer instanceof Text
      ? startOffset === 0 && startContainer
      : startContainer.childNodes[startOffset];
  const last =
    endContainer instanceof Text
      ? endOffset === endContainer.length && endContainer
      : endContainer.childNodes[endOffset - 1];
  return first instanceof Text && first === last ? first : null;
}

/**
 * @param {{ x: number, y: number }} point
 */
function placeCaret(point) {
  const selection = getSelection();
  if (!selection) {
    return;
  }
  if ("caretPositionFromPoint" in document) {
    const position = document.caretPositionFromPoint(point.x, point.y);
    if (position) {
      selection.collapse(position.offsetNode, position.offset);
    }
  } else if ("caretRangeFromPoint" in document) {
    const range = /** @type {Document} */ (document).caretRangeFromPoint(
      point.x,
      point.y,
    );
    if (range) {
      selection.collapse(range.startContainer, range.startOffset);
    }
  }
}

/**
 * @param {Element} element
 * @param {string} name
 * @param {string | null} value
 */
function restoreAttribute(element, name, value) {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}
