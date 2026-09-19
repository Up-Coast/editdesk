/**
 * Serving the in-page editor, and the snippet that loads it into a page.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentTypeFor } from "./content-types.js";
import { messages } from "../messages.js";
import { sendFile, sendText } from "./responses.js";

/** The URL prefix of everything the server adds to a site. */
export const EDITDESK_PREFIX = "/__editdesk/";

const CLIENT_PREFIX = `${EDITDESK_PREFIX}client/`;

const CLIENT_FOLDER = fileURLToPath(new URL("../client/", import.meta.url));

/**
 * What the editor in the browser is told about this run.
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
 * Builds the markup that loads the editor into a page.
 * @param {EditorConfig} config
 * @returns {string} Markup for the page's head.
 */
export function buildHeadSnippet(config) {
  const json = JSON.stringify(config).replaceAll(
    /[<\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  return (
    `<script type="application/json" id="editdesk-config">${json}</script>` +
    `<script type="module" src="${CLIENT_PREFIX}editor.js"></script>`
  );
}

/**
 * Creates the handler for the editor's own files.
 * @returns {Promise<(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, pathname: string) => boolean>} A handler that returns true when it answered.
 */
export async function createEditorAssetHandler() {
  const clientFiles = new Set(await readdir(CLIENT_FOLDER));
  return (request, response, pathname) => {
    if (!pathname.startsWith(CLIENT_PREFIX)) {
      return false;
    }
    const name = pathname.slice(CLIENT_PREFIX.length);
    if (!clientFiles.has(name)) {
      sendText(response, 404, messages.pageNotFound);
      return true;
    }
    void sendFile(
      response,
      path.join(CLIENT_FOLDER, name),
      contentTypeFor(name),
    );
    return true;
  };
}
