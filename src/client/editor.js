/**
 * The in-page editor: wires clicks and keys to editing sessions, keeps edits
 * through a saver, and reports what happened in the toolbar.
 */

import { formatChangeList, summarizeChanges } from "./change-list.js";
import { readConfig } from "./config.js";
import { findEditableHost, startEditingSession } from "./editing-session.js";
import { createHistory } from "./history.js";
import { createCollectingSaver, createSourceSaver } from "./savers.js";
import { writeSlot } from "./slots.js";
import { strings } from "./strings.js";
import { createToolbar, TOOLBAR_ELEMENT } from "./toolbar.js";

const PAGE_STYLESHEET = "/__editdesk/client/page.css";

const MODE_STORAGE_KEY = "editdesk-mode";

const HOVER_ATTRIBUTE = "data-editdesk-hover";

const POINTER_EVENTS_KEPT_FROM_THE_PAGE = [
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "dblclick",
  "auxclick",
];

const KEY_EVENTS_KEPT_FROM_THE_PAGE = ["keyup", "keypress"];

const config = readConfig();
const save = config.canSave
  ? createSourceSaver(config)
  : createCollectingSaver();

/** @type {"edit" | "browse"} */
let mode = "edit";
/** @type {ReturnType<typeof startEditingSession> | null} */
let session = null;
/** @type {Element | null} */
let hovered = null;

const history = createHistory(showHistory);

const toolbar = createToolbar(
  {
    onModeChange: setMode,
    onUndo: () => replay("undo"),
    onRedo: () => replay("redo"),
    onCopyChanges: copyChanges,
  },
  { showsChangeList: !config.canSave },
);

function showHistory() {
  toolbar.setHistory({
    canUndo: history.canUndo(),
    canRedo: history.canRedo(),
    changeCount: summarizeChanges(history.entries()).length,
  });
}

/**
 * @param {"edit" | "browse"} next
 */
function setMode(next) {
  commitSession();
  mode = next;
  try {
    sessionStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // The mode then lasts for this page only.
  }
  setHovered(null);
  toolbar.setMode(mode);
  toolbar.setStatus(
    mode === "edit" ? strings.statusReady : strings.statusBrowsing,
  );
}

/**
 * @param {Element | null} element
 */
function setHovered(element) {
  hovered?.removeAttribute(HOVER_ATTRIBUTE);
  hovered = element;
  hovered?.setAttribute(HOVER_ATTRIBUTE, "");
}

/**
 * @param {Event} event
 */
function isInsideToolbar(event) {
  return event
    .composedPath()
    .some(
      (node) => node instanceof Element && node.localName === TOOLBAR_ELEMENT,
    );
}

/**
 * @param {MouseEvent} event
 */
function handleClick(event) {
  if (mode !== "edit" || isInsideToolbar(event)) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  if (
    session &&
    event.target instanceof Node &&
    session.host.contains(event.target)
  ) {
    return;
  }
  commitSession();
  const host = findEditableHost(event.target);
  if (!host) {
    return;
  }
  setHovered(null);
  toolbar.closePanel();
  session = startEditingSession(
    host,
    { x: event.clientX, y: event.clientY },
    {
      onRefusedInput: () =>
        toolbar.showProblem(strings.problemAcrossFormatting),
      onEnter: commitSession,
    },
  );
  toolbar.setStatus(strings.statusEditing);
}

/**
 * @param {KeyboardEvent} event
 */
function handleKeyDown(event) {
  if (!session) {
    return;
  }
  event.stopImmediatePropagation();
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    commitSession();
  } else if (event.key === " " && session.host.closest("button, summary")) {
    event.preventDefault();
    document.execCommand("insertText", false, " ");
  } else if (event.key === "Escape") {
    event.preventDefault();
    session.cancel();
    session = null;
    toolbar.setStatus(strings.statusReady);
  }
}

function commitSession() {
  if (!session) {
    return;
  }
  const changes = session.commit();
  session = null;
  toolbar.setStatus(strings.statusReady);
  void keepChanges(changes);
}

/**
 * @param {import("./editing-session.js").SlotChange[]} changes
 */
async function keepChanges(changes) {
  for (const change of changes) {
    const number = change.target.getAttribute(config.elementAttribute);
    await keep(
      {
        page: location.pathname,
        element: number === null ? null : Number(number),
        slot: change.slot,
        oldText: change.oldText,
        newText: change.newText,
        location: null,
      },
      change.target,
    );
  }
}

/**
 * Keeps one edit, asking the person when the source has more than one place
 * for it, and putting the old text back on the page when it cannot be kept.
 * @param {import("./savers.js").Edit} edit
 * @param {Element} target
 */
async function keep(edit, target) {
  toolbar.setStatus(strings.statusSaving);
  const outcome = await save(edit);
  if (outcome.outcome === "saved" || outcome.outcome === "collected") {
    const location = outcome.outcome === "saved" ? outcome.location : null;
    history.record({ edit: { ...edit, location }, target });
    toolbar.setStatus(describeKept(outcome));
    return;
  }
  toolbar.setStatus(strings.statusReady);
  const putBack = () => writeSlot(target, edit.slot, edit.oldText);
  if (outcome.outcome === "choose") {
    toolbar.showChoices(
      outcome.reason === "several"
        ? strings.chooseSeveral
        : strings.chooseConfirm,
      outcome.candidates.map((candidate) => ({
        label: strings.candidatePlace(candidate.file, candidate.line),
        detail: candidate.preview,
        choose: () =>
          void keep(
            {
              ...edit,
              location: { file: candidate.file, start: candidate.start },
            },
            target,
          ),
      })),
      putBack,
    );
    return;
  }
  putBack();
  const addedWhereNoneWas =
    outcome.outcome === "not-found" && edit.oldText.trim() === "";
  toolbar.showProblem(
    addedWhereNoneWas ? strings.problemNewText : describeProblem(outcome),
  );
}

/**
 * @param {"undo" | "redo"} direction
 */
async function replay(direction) {
  commitSession();
  const entry = direction === "undo" ? history.peekUndo() : history.peekRedo();
  if (!entry) {
    return;
  }
  const { edit, target } = entry;
  const step =
    direction === "undo"
      ? { ...edit, oldText: edit.newText, newText: edit.oldText }
      : edit;
  toolbar.setStatus(strings.statusSaving);
  const outcome = await save(step);
  if (outcome.outcome !== "saved" && outcome.outcome !== "collected") {
    toolbar.setStatus(strings.statusReady);
    toolbar.showProblem(
      describeProblem(
        outcome.outcome === "choose"
          ? { outcome: "refused", reason: "changed-on-disk" }
          : outcome,
      ),
    );
    return;
  }
  if (target.isConnected) {
    writeSlot(target, step.slot, step.newText);
  }
  if (direction === "undo") {
    history.confirmUndo();
    toolbar.setStatus(strings.statusUndone);
  } else {
    history.confirmRedo();
    toolbar.setStatus(strings.statusRedone);
  }
}

async function copyChanges() {
  await navigator.clipboard.writeText(formatChangeList(history.entries()));
  toolbar.setStatus(strings.changesCopied);
}

/**
 * @param {Extract<import("./savers.js").SaveOutcome, { outcome: "saved" | "collected" }>} outcome
 */
function describeKept(outcome) {
  return outcome.outcome === "saved"
    ? strings.statusSaved(outcome.file, outcome.line)
    : strings.statusCollected;
}

/**
 * @param {Exclude<import("./savers.js").SaveOutcome, { outcome: "saved" | "collected" | "choose" }>} outcome
 */
function describeProblem(outcome) {
  if (outcome.outcome === "not-found") {
    return strings.problemNotFound;
  }
  if (outcome.outcome === "unreachable") {
    return strings.problemUnreachable;
  }
  return {
    "unsafe-characters": strings.problemUnsafeCharacters,
    "changed-on-disk": strings.problemChangedOnDisk,
    "empty-text": strings.problemEmptyText,
  }[outcome.reason];
}

function readStoredMode() {
  try {
    return sessionStorage.getItem(MODE_STORAGE_KEY) === "browse"
      ? "browse"
      : "edit";
  } catch {
    return "edit";
  }
}

const pageStylesheet = document.createElement("link");
pageStylesheet.rel = "stylesheet";
pageStylesheet.href = PAGE_STYLESHEET;
document.head.append(pageStylesheet);

window.addEventListener("click", handleClick, true);
window.addEventListener("keydown", handleKeyDown, true);
for (const type of POINTER_EVENTS_KEPT_FROM_THE_PAGE) {
  window.addEventListener(
    type,
    (event) => {
      if (mode === "edit" && !isInsideToolbar(event)) {
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}
for (const type of KEY_EVENTS_KEPT_FROM_THE_PAGE) {
  window.addEventListener(
    type,
    (event) => {
      if (session) {
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}
window.addEventListener(
  "submit",
  (event) => {
    if (mode === "edit") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
window.addEventListener(
  "mouseover",
  (event) => {
    if (mode !== "edit" || isInsideToolbar(event)) {
      return;
    }
    const host = findEditableHost(event.target);
    setHovered(host && host !== session?.host ? host : null);
  },
  true,
);
window.addEventListener("pagehide", commitSession);

setMode(readStoredMode());
showHistory();
