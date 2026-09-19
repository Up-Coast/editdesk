/**
 * The change list: the edits made on a live site, written out so they can be
 * handed to whoever can change the real source.
 */

import { strings } from "./strings.js";

/**
 * Combines repeated edits of the same text into one change each.
 * @param {import("./keepers.js").KeptEdit[]} entries Edits in effect, oldest first.
 * @returns {{ page: string, oldText: string, newText: string }[]} One change per edited text that ended up different.
 */
export function summarizeChanges(entries) {
  /** @type {Map<Element, Map<number, { page: string, oldText: string, newText: string }>>} */
  const byTarget = new Map();
  for (const { edit, target } of entries) {
    const slots = byTarget.get(target) ?? new Map();
    byTarget.set(target, slots);
    const existing = slots.get(edit.slot);
    slots.set(edit.slot, {
      page: edit.page,
      oldText: existing?.oldText ?? edit.oldText,
      newText: edit.newText,
    });
  }
  return [...byTarget.values()]
    .flatMap((slots) => [...slots.values()])
    .filter((change) => change.oldText !== change.newText);
}

/**
 * Writes the change list as plain text.
 * @param {import("./keepers.js").KeptEdit[]} entries Edits in effect, oldest first.
 * @returns {string} Old and new text for every change, grouped by page.
 */
export function formatChangeList(entries) {
  /** @type {Map<string, string[]>} */
  const byPage = new Map();
  for (const change of summarizeChanges(entries)) {
    const lines = byPage.get(change.page) ?? [];
    byPage.set(change.page, lines);
    lines.push(`- ${change.oldText.trim()}\n+ ${change.newText.trim()}`);
  }
  return [...byPage]
    .map(
      ([page, lines]) =>
        `${strings.changeListPage(page)}\n\n${lines.join("\n\n")}`,
    )
    .join("\n\n");
}
