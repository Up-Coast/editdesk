/**
 * The list of edits made on this page, for undo, redo and the change list.
 */

/**
 * A kept edit and the page element it changed.
 * @typedef {{ edit: import("./savers.js").Edit, target: Element }} HistoryEntry
 */

/**
 * Creates an empty history.
 * @param {() => void} onChange Called whenever the history changes.
 */
export function createHistory(onChange) {
  /** @type {HistoryEntry[]} */
  const done = [];
  /** @type {HistoryEntry[]} */
  const undone = [];

  return {
    /** @param {HistoryEntry} entry */
    record(entry) {
      done.push(entry);
      undone.length = 0;
      onChange();
    },
    /** @returns {HistoryEntry | undefined} The entry to undo; call {@link confirmUndo} once it is undone. */
    peekUndo: () => done.at(-1),
    /** @returns {HistoryEntry | undefined} The entry to redo; call {@link confirmRedo} once it is redone. */
    peekRedo: () => undone.at(-1),
    confirmUndo() {
      const entry = done.pop();
      if (entry) {
        undone.push(entry);
      }
      onChange();
    },
    confirmRedo() {
      const entry = undone.pop();
      if (entry) {
        done.push(entry);
      }
      onChange();
    },
    /** @returns {HistoryEntry[]} The edits currently in effect, oldest first. */
    entries: () => [...done],
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
  };
}
