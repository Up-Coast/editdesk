/**
 * The two ways an edit can be kept: written to the source by the local
 * server, or only remembered, for a live site that has no source to write to.
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
 * @property {boolean} mappedOnly True when replaying an edit that was saved to the page's own file.
 */

/**
 * What the server said about an edit, plus "unreachable" when it said nothing.
 * @typedef {{ outcome: "saved", file: string, line: number, location: { file: string, start: number } | null }
 *   | { outcome: "collected" }
 *   | { outcome: "choose", reason: "several" | "confirm", candidates: { file: string, start: number, line: number, preview: { before: string, match: string, after: string } }[] }
 *   | { outcome: "not-found" }
 *   | { outcome: "refused", reason: "unsafe-characters" | "changed-on-disk" | "empty-text" }
 *   | { outcome: "unreachable" }} SaveOutcome
 */

/**
 * Creates the saver that writes edits to the source files.
 * @param {import("./config.js").EditorConfig} config
 * @returns {(edit: Edit) => Promise<SaveOutcome>}
 */
export function createSourceSaver({ token, tokenHeader, editEndpoint }) {
  return async (edit) => {
    try {
      const response = await fetch(editEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json", [tokenHeader]: token },
        body: JSON.stringify(edit),
      });
      return response.ok ? await response.json() : { outcome: "unreachable" };
    } catch {
      return { outcome: "unreachable" };
    }
  };
}

/**
 * Creates the saver for a live site: every edit is accepted and kept only in
 * the editor's history, from which the change list is made.
 * @returns {(edit: Edit) => Promise<SaveOutcome>}
 */
export function createCollectingSaver() {
  return async () => ({ outcome: "collected" });
}
