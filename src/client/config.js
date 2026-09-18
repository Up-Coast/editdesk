/**
 * What the local server told this page about the current run.
 */

const CONFIG_ELEMENT_ID = "editdesk-config";

/**
 * @typedef {object} EditorConfig
 * @property {string} token The secret for API calls.
 * @property {string} tokenHeader The request header that carries the token.
 * @property {string} editEndpoint Where edits are sent.
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
