/**
 * The in-page editor: wires clicks and keys to editing sessions, keeps edits
 * through a saver, and reports what happened in the toolbar.
 */

import { formatChangeList, summarizeChanges } from "./change-list.js";
import { readConfig } from "./config.js";
import { findEditableHost, startEditingSession } from "./editing-session.js";
import { createCollectingKeeper, createSourceKeeper } from "./keepers.js";
import { hasParagraphBreak, writeSlot } from "./slots.js";
import { strings } from "./strings.js";
import { createToolbar, TOOLBAR_ELEMENT } from "./toolbar.js";

const PAGE_STYLESHEET = "/__editdesk/client/page.css";

const MODE_STORAGE_KEY = "editdesk-mode";

const STATUS_AFTER_RELOAD_KEY = "editdesk-status";

const ELEMENTS_THAT_SPLIT_INTO_PARAGRAPHS = new Set(["p", "li"]);

const WHITE_SPACE_THAT_KEEPS_LINE_BREAKS = new Set([
  "pre",
  "pre-wrap",
  "pre-line",
  "break-spaces",
]);

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
const keeper = config.canSave
  ? createSourceKeeper(config)
  : createCollectingKeeper();
/** @type {Map<number, import("./keepers.js").KeptEdit>} Edits kept since this page loaded, by id. */
const keptEdits = new Map();

/** @type {"edit" | "browse"} */
let mode = "edit";
/** @type {ReturnType<typeof startEditingSession> | null} */
let session = null;
/** @type {Element | null} */
let hovered = null;
/** @type {Promise<void>} */
let lastSave = Promise.resolve();
/** @type {string | null} The status to show after loading the page again, once the file no longer matches it. */
let statusOnceReloaded = null;

const toolbar = createToolbar(
  {
    onModeChange: setMode,
    onUndo: () => replayInTurn("undo"),
    onRedo: () => replayInTurn("redo"),
    onCopyChanges: copyChanges,
    onPanelClosed: reloadIfStale,
  },
  { showsChangeList: !config.canSave },
);

/**
 * @param {import("./keepers.js").HistoryState} state
 */
function showHistory(state) {
  toolbar.setHistory({
    ...state,
    changeCount: summarizeChanges(editsInEffect()).length,
  });
}

function editsInEffect() {
  return keeper
    .idsInEffect()
    .map((id) => keptEdits.get(id))
    .filter((kept) => kept !== undefined);
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
    config.canSave &&
      host.hasAttribute(config.elementAttribute) &&
      ELEMENTS_THAT_SPLIT_INTO_PARAGRAPHS.has(host.localName),
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
    if (event.shiftKey) {
      session.insertBreak();
    } else {
      commitSession();
    }
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
  inTurn(() => keepChanges(changes));
}

/**
 * Runs saves, undos and redos one at a time, in the order they were asked
 * for, so none of them acts on a file or a history another is still changing.
 * @param {() => Promise<void>} task
 */
function inTurn(task) {
  lastSave = lastSave.then(task, task).then(reloadIfStale);
}

/**
 * @param {import("./editing-session.js").SlotChange[]} changes
 */
async function keepChanges(changes) {
  for (const change of inSavingOrder(changes)) {
    const number = change.target.getAttribute(config.elementAttribute);
    const keepsLineBreaks = WHITE_SPACE_THAT_KEEPS_LINE_BREAKS.has(
      getComputedStyle(change.target).whiteSpace,
    );
    const asSourceText = (/** @type {string} */ text) =>
      number === null && keepsLineBreaks
        ? text.replaceAll("\n", config.lineBreak)
        : text;
    await keep(
      {
        page: location.pathname,
        element: number === null ? null : Number(number),
        slot: change.slot,
        oldText: asSourceText(change.oldText),
        newText: asSourceText(change.newText),
        location: null,
        keepsLineBreaks,
      },
      change.target,
    );
  }
}

/**
 * Orders a session's changes so that none of them moves the place another is
 * aimed at. Splitting a paragraph renumbers the elements and slots after the
 * split, so splits go last, and the later split goes first.
 * @param {import("./editing-session.js").SlotChange[]} changes In document order.
 */
function inSavingOrder(changes) {
  const splits = changes.filter((change) => hasParagraphBreak(change.newText));
  const others = changes.filter((change) => !splits.includes(change));
  return [...others, ...splits.reverse()];
}

/**
 * Keeps one edit, asking the person when the source has more than one place
 * for it, and putting the old text back on the page when it cannot be kept.
 * @param {import("./keepers.js").Edit} edit
 * @param {Element} target
 */
async function keep(edit, target) {
  toolbar.setStatus(strings.statusSaving);
  const outcome = await keeper.save(edit);
  if (outcome.outcome === "saved" || outcome.outcome === "collected") {
    keptEdits.set(outcome.id, { edit, target });
    showHistory(outcome.history);
    showKept(outcome, edit, describeKept(outcome));
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
  if (outcome.outcome === "nothing-to-replay") {
    return;
  }
  const addedWhereNoneWas =
    outcome.outcome === "not-found" && edit.oldText.trim() === "";
  toolbar.showProblem(
    addedWhereNoneWas ? strings.problemNewText : describeProblem(outcome),
  );
}

/**
 * @param {"undo" | "redo"} direction
 */
function replayInTurn(direction) {
  commitSession();
  inTurn(() => replay(direction));
}

/**
 * @param {"undo" | "redo"} direction
 */
async function replay(direction) {
  toolbar.setStatus(strings.statusSaving);
  const outcome = await keeper[direction]();
  if (outcome.outcome !== "saved" && outcome.outcome !== "collected") {
    toolbar.setStatus(strings.statusReady);
    if (
      outcome.outcome !== "nothing-to-replay" &&
      outcome.outcome !== "choose"
    ) {
      toolbar.showProblem(describeProblem(outcome));
    }
    return;
  }
  showHistory(outcome.history);
  const status =
    direction === "undo" ? strings.statusUndone : strings.statusRedone;
  const kept = keptEdits.get(outcome.id);
  if (!kept?.target.isConnected) {
    reloadShowing(status);
    return;
  }
  const { edit, target } = kept;
  writeSlot(
    target,
    edit.slot,
    direction === "undo" ? edit.oldText : edit.newText,
  );
  showKept(outcome, edit, status);
}

/**
 * Shows that an edit was kept. When the file's elements no longer match the
 * page's (a paragraph was split or joined, or an app's source gained or lost
 * a line break), the page is marked to be loaded again, so the two agree.
 * @param {import("./keepers.js").KeptOutcome} outcome
 * @param {import("./keepers.js").Edit} edit
 * @param {string} status
 */
function showKept(outcome, edit, status) {
  const splitsParagraph =
    hasParagraphBreak(edit.oldText) || hasParagraphBreak(edit.newText);
  const pageIsStale =
    outcome.outcome === "saved" &&
    outcome.changedStructure &&
    (splitsParagraph || outcome.location !== null);
  if (pageIsStale) {
    statusOnceReloaded = status;
  }
  toolbar.setStatus(status);
}

/**
 * Loads the page again when a kept edit left it out of step with the file.
 * Waits while the panel is open: a question's answer is another edit to keep,
 * and a problem must be read before it disappears.
 */
function reloadIfStale() {
  if (statusOnceReloaded !== null && !toolbar.isPanelOpen()) {
    reloadShowing(statusOnceReloaded);
  }
}

/**
 * @param {string} status Shown in the toolbar once the page has loaded again.
 */
function reloadShowing(status) {
  try {
    sessionStorage.setItem(STATUS_AFTER_RELOAD_KEY, status);
  } catch {
    // The status is then not shown after the reload.
  }
  location.reload();
}

function takeStatusAfterReload() {
  try {
    const status = sessionStorage.getItem(STATUS_AFTER_RELOAD_KEY);
    sessionStorage.removeItem(STATUS_AFTER_RELOAD_KEY);
    return status;
  } catch {
    return null;
  }
}

async function copyChanges() {
  await navigator.clipboard.writeText(formatChangeList(editsInEffect()));
  toolbar.setStatus(strings.changesCopied);
}

/**
 * @param {import("./keepers.js").KeptOutcome} outcome
 */
function describeKept(outcome) {
  return outcome.outcome === "saved"
    ? strings.statusSaved(outcome.file, outcome.line)
    : strings.statusCollected;
}

/**
 * @param {Exclude<import("./keepers.js").KeepOutcome, import("./keepers.js").KeptOutcome | { outcome: "choose" | "nothing-to-replay" }>} outcome
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
    "line-break-not-shown": strings.problemLineBreakNotShown,
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
toolbar.setStatus(takeStatusAfterReload() ?? strings.statusReady);
void keeper.history().then(showHistory);
