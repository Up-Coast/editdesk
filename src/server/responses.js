/**
 * The few response shapes the local server sends.
 */

import { open } from "node:fs/promises";
import { messages } from "../messages.js";

const NEVER_CACHE = "no-store";

/**
 * Sends a short plain-text answer.
 * @param {import("node:http").ServerResponse} response
 * @param {number} status HTTP status code.
 * @param {string} message A sentence from the message catalog.
 */
export function sendText(response, status, message) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": NEVER_CACHE,
  });
  response.end(message);
}

/**
 * Sends a JSON answer.
 * @param {import("node:http").ServerResponse} response
 * @param {number} status HTTP status code.
 * @param {unknown} body Any JSON-serializable value.
 */
export function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": NEVER_CACHE,
  });
  response.end(JSON.stringify(body));
}

/**
 * Sends an HTML page.
 * @param {import("node:http").ServerResponse} response
 * @param {string} html The page.
 */
export function sendHtml(response, html) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": NEVER_CACHE,
  });
  response.end(html);
}

/**
 * Sends a file from disk, or "not found" when it cannot be opened.
 * @param {import("node:http").ServerResponse} response
 * @param {string} filePath The file to send.
 * @param {string} contentType Its Content-Type header value.
 */
export async function sendFile(response, filePath, contentType) {
  let file;
  try {
    file = await open(filePath);
  } catch {
    sendText(response, 404, messages.pageNotFound);
    return;
  }
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": NEVER_CACHE,
  });
  file
    .createReadStream()
    .on("error", () => response.destroy())
    .pipe(response);
}
