/**
 * What the local server told this page about the current run.
 */

const CONFIG_ELEMENT_ID = "editdesk-config";

/**
 * @typedef {object} EditorConfig
 * @property {string} token The secret for API calls.
 * @property {string} tokenHeader The request header that carries the token.
 * @property {{ edit: string, undo: string, redo: string, history: string }} endpoints Where each call is sent.
 * @property {string} lineBreak The character that stands for a line break inside a piece of text.
 * @property {string} paragraphBreak The character that stands for a paragraph break inside a piece of text.
 * @property {string} elementAttribute The attribute that carries an element's number in the source.
 * @property {boolean} canSave False for a live site, where edits are only collected.
 */

/**
 * Reads the configuration the server placed in the page.
 * @returns {EditorConfig}
 */
export function readConfig() {
  const element = document.getElementById(CONFIG_ELEMENT_ID);
  return JSON.parse(element?.textContent ?? "{}");
}
