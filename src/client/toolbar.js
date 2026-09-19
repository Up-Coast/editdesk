/**
 * The editor's toolbar: a small bar fixed to the bottom of the page, kept in
 * a shadow root so the page's styles and Editdesk's never affect each other.
 */

import { strings } from "./strings.js";

const THEME_STYLESHEET = "/__editdesk/client/theme.css";

/** The toolbar's element name; clicks inside it are never treated as page clicks. */
export const TOOLBAR_ELEMENT = "editdesk-toolbar";

/**
 * @typedef {object} ToolbarActions
 * @property {(mode: "edit" | "browse") => void} onModeChange
 * @property {() => void} onUndo
 * @property {() => void} onRedo
 * @property {() => void} onCopyChanges
 * @property {() => void} onPanelClosed Called after the panel closes, whatever closed it.
 */

/**
 * A choice offered in the panel.
 * @typedef {{ label: string, detail: { before: string, match: string, after: string }, choose: () => void }} PanelChoice
 */

/**
 * Creates the toolbar and adds it to the page.
 * @param {ToolbarActions} actions
 * @param {{ showsChangeList: boolean }} options
 * @returns {ReturnType<typeof buildToolbar>}
 */
export function createToolbar(actions, options) {
  const host = document.createElement(TOOLBAR_ELEMENT);
  const root = host.attachShadow({ mode: "open" });
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = THEME_STYLESHEET;
  root.append(stylesheet);
  const toolbar = buildToolbar(root, actions, options);
  document.documentElement.append(host);
  return toolbar;
}

/**
 * @param {ShadowRoot} root
 * @param {ToolbarActions} actions
 * @param {{ showsChangeList: boolean }} options
 */
function buildToolbar(root, actions, options) {
  const panel = element("div", "panel");
  panel.hidden = true;
  panel.setAttribute("role", "alertdialog");

  const bar = element("div", "bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", strings.toolbarLabel);

  const editButton = button(strings.modeEdit, () =>
    actions.onModeChange("edit"),
  );
  const browseButton = button(strings.modeBrowse, () =>
    actions.onModeChange("browse"),
  );
  editButton.title = strings.modeEditHint;
  browseButton.title = strings.modeBrowseHint;
  const modes = element("div", "modes");
  modes.append(editButton, browseButton);

  const undoButton = button(strings.undo, actions.onUndo);
  const redoButton = button(strings.redo, actions.onRedo);
  const copyButton = button(strings.copyChanges(0), actions.onCopyChanges);
  copyButton.hidden = !options.showsChangeList;

  const status = element("span", "status");
  status.setAttribute("role", "status");

  bar.append(modes, undoButton, redoButton, copyButton, status);
  root.append(panel, bar);

  /** @type {(() => void) | null} */
  let cancelOpenQuestion = null;

  /**
   * Closes the panel. A question still open in it is answered "cancel", so
   * text waiting on that answer is never left on the page unsaved.
   */
  function closePanel() {
    const cancel = cancelOpenQuestion;
    cancelOpenQuestion = null;
    panel.hidden = true;
    panel.replaceChildren();
    cancel?.();
    actions.onPanelClosed();
  }

  return {
    /** @param {"edit" | "browse"} mode */
    setMode(mode) {
      editButton.setAttribute("aria-pressed", String(mode === "edit"));
      browseButton.setAttribute("aria-pressed", String(mode === "browse"));
    },
    /** @param {string} text */
    setStatus(text) {
      status.textContent = text;
    },
    /** @param {{ canUndo: boolean, canRedo: boolean, changeCount: number }} state */
    setHistory({ canUndo, canRedo, changeCount }) {
      undoButton.disabled = !canUndo;
      redoButton.disabled = !canRedo;
      copyButton.disabled = changeCount === 0;
      copyButton.textContent = strings.copyChanges(changeCount);
    },
    /** @param {string} message */
    showProblem(message) {
      closePanel();
      const text = element("p", "panel-text");
      text.textContent = message;
      panel.replaceChildren(text, button(strings.close, closePanel));
      panel.hidden = false;
    },
    /**
     * @param {string} question
     * @param {PanelChoice[]} choices
     * @param {() => void} onCancel
     */
    showChoices(question, choices, onCancel) {
      closePanel();
      cancelOpenQuestion = onCancel;
      const text = element("p", "panel-text");
      text.textContent = question;
      const list = element("div", "choices");
      for (const choice of choices) {
        const choiceButton = button(choice.label, () => {
          cancelOpenQuestion = null;
          closePanel();
          choice.choose();
        });
        choiceButton.className = "choice";
        const detail = element("code", "choice-detail");
        const match = element("mark", "choice-match");
        match.textContent = choice.detail.match;
        detail.append(choice.detail.before, match, choice.detail.after);
        choiceButton.append(detail);
        list.append(choiceButton);
      }
      const cancelButton = button(strings.cancel, closePanel);
      panel.replaceChildren(text, list, cancelButton);
      panel.hidden = false;
    },
    closePanel,
    /** @returns {boolean} True while the panel is showing a question or a problem. */
    isPanelOpen: () => !panel.hidden,
  };
}

/**
 * @param {string} tagName
 * @param {string} className
 */
function element(tagName, className) {
  const created = document.createElement(tagName);
  created.className = className;
  return created;
}

/**
 * @param {string} label
 * @param {() => void} onClick
 */
function button(label, onClick) {
  const created = document.createElement("button");
  created.type = "button";
  created.textContent = label;
  created.addEventListener("click", onClick);
  return created;
}
