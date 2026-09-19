/**
 * The two ways edits can be kept: written to the source by the local server,
 * or only remembered, for a live site that has no source to write to. Each
 * keeper saves edits and can undo and redo them.
 */

/**
 * One changed slot.
 * @typedef {object} Edit
 * @property {string} page
 * @property {number | null} element
 * @property {number} slot
 * @property {string} oldText
 * @property {string} newText
 * @property {{ file: string, start: number } | null} location
 * @property {boolean} keepsLineBreaks True when the page shows the line breaks of the text in the edited element.
 */

/**
 * A kept edit and the page element it changed.
 * @typedef {{ edit: Edit, target: Element }} KeptEdit
 */

/**
 * Whether there is anything to undo or redo.
 * @typedef {{ canUndo: boolean, canRedo: boolean }} HistoryState
 */

/**
 * An edit that was kept. `id` names it, so an undo or redo can say which edit
 * it replayed. `changedStructure` is true when the page must be loaded again
 * to match the file.
 * @typedef {{ outcome: "saved", id: number, file: string, line: number, location: { file: string, start: number } | null, changedStructure: boolean, history: HistoryState }
 *   | { outcome: "collected", id: number, history: HistoryState }} KeptOutcome
 */

/**
 * What a keeper said about an edit, an undo or a redo.
 * @typedef {KeptOutcome
 *   | { outcome: "choose", reason: "several" | "confirm", candidates: { file: string, start: number, line: number, preview: { before: string, match: string, after: string } }[] }
 *   | { outcome: "not-found" }
 *   | { outcome: "nothing-to-replay" }
 *   | { outcome: "refused", reason: "unsafe-characters" | "line-break-not-shown" | "changed-on-disk" | "empty-text" }
 *   | { outcome: "unreachable" }} KeepOutcome
 */

/**
 * @typedef {object} Keeper
 * @property {(edit: Edit) => Promise<KeepOutcome>} save
 * @property {() => Promise<KeepOutcome>} undo
 * @property {() => Promise<KeepOutcome>} redo
 * @property {() => Promise<HistoryState>} history
 * @property {() => number[]} idsInEffect Ids of kept edits that are not undone, oldest first; empty when the keeper does not track them.
 */

/**
 * Creates the keeper that writes edits to the source files.
 * @param {import("./config.js").EditorConfig} config
 * @returns {Keeper}
 */
export function createSourceKeeper({ token, tokenHeader, endpoints }) {
  /**
   * @param {string} endpoint
   * @param {unknown} body
   */
  async function call(endpoint, body) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", [tokenHeader]: token },
        body: JSON.stringify(body),
      });
      return response.ok ? await response.json() : { outcome: "unreachable" };
    } catch {
      return { outcome: "unreachable" };
    }
  }
  return {
    save: (edit) => call(endpoints.edit, edit),
    undo: () => call(endpoints.undo, {}),
    redo: () => call(endpoints.redo, {}),
    async history() {
      const state = await call(endpoints.history, {});
      return "canUndo" in state ? state : { canUndo: false, canRedo: false };
    },
    idsInEffect: () => [],
  };
}

/**
 * Creates the keeper for a live site: every edit is accepted and remembered
 * only in this page, from which the change list is made.
 * @returns {Keeper}
 */
export function createCollectingKeeper() {
  /** @type {number[]} */
  const done = [];
  /** @type {number[]} */
  const undone = [];
  let nextId = 1;
  const history = () => ({
    canUndo: done.length > 0,
    canRedo: undone.length > 0,
  });

  /**
   * @param {number[]} from
   * @param {number[]} to
   * @returns {KeepOutcome}
   */
  function move(from, to) {
    const id = from.pop();
    if (id === undefined) {
      return { outcome: "nothing-to-replay" };
    }
    to.push(id);
    return { outcome: "collected", id, history: history() };
  }

  return {
    async save() {
      done.push(nextId);
      undone.length = 0;
      nextId += 1;
      return { outcome: "collected", id: nextId - 1, history: history() };
    },
    undo: async () => move(done, undone),
    redo: async () => move(undone, done),
    history: async () => history(),
    idsInEffect: () => [...done],
  };
}
