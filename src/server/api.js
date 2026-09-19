/**
 * The calls the in-page editor makes: apply an edit, undo, redo, and ask
 * whether there is anything to undo or redo.
 */

import { parseEditRequest } from "../source/edit-service.js";
import { messages } from "../messages.js";
import { EDITDESK_PREFIX } from "./editor-assets.js";
import { sendJson, sendText } from "./responses.js";
import { isOwnOrigin, tokensMatch } from "./security.js";

const API_PREFIX = `${EDITDESK_PREFIX}api/`;

const LARGEST_BODY_BYTES = 1_000_000;

/** The request header that carries the per-run token. */
export const TOKEN_HEADER = "x-editdesk-token";

/** Where the in-page editor sends each call. Every call is a POST. */
export const ENDPOINTS = {
  edit: `${API_PREFIX}edit`,
  undo: `${API_PREFIX}undo`,
  redo: `${API_PREFIX}redo`,
  history: `${API_PREFIX}history`,
};

/**
 * Creates the API handler.
 * @param {object} options
 * @param {string} options.token The per-run secret.
 * @param {() => number} options.getPort Returns the port the server listens on.
 * @param {ReturnType<typeof import("../source/edit-service.js").createEditService> | null} options.editService Null when there is nowhere to save.
 * @param {(file: string, line: number) => void} options.onSaved Called after each saved edit.
 * @returns {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, url: URL) => Promise<boolean>} A handler that resolves to true when it answered.
 */
export function createApiHandler({ token, getPort, editService, onSaved }) {
  return async (request, response, url) => {
    if (!url.pathname.startsWith(API_PREFIX)) {
      return false;
    }
    const isTrusted =
      tokensMatch(request.headers[TOKEN_HEADER], token) &&
      isOwnOrigin(request.headers.origin, getPort());
    if (!isTrusted || editService === null) {
      sendText(response, 403, messages.forbiddenRequest);
      return true;
    }

    if (request.method !== "POST") {
      sendText(response, 405, messages.methodNotAllowed);
      return true;
    }
    const body = await readJsonBody(request);
    if (body === null) {
      sendText(response, 400, messages.badRequest);
      return true;
    }
    if (url.pathname === ENDPOINTS.edit) {
      const edit = parseEditRequest(body);
      if (edit === null) {
        sendText(response, 400, messages.badRequest);
        return true;
      }
      sendOutcome(response, await editService.applyEdit(edit), onSaved);
      return true;
    }
    if (url.pathname === ENDPOINTS.undo) {
      sendOutcome(response, await editService.undo(), onSaved);
      return true;
    }
    if (url.pathname === ENDPOINTS.redo) {
      sendOutcome(response, await editService.redo(), onSaved);
      return true;
    }
    if (url.pathname === ENDPOINTS.history) {
      sendJson(response, 200, editService.historyState());
      return true;
    }
    sendText(response, 404, messages.pageNotFound);
    return true;
  };
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {import("../source/edit-service.js").EditOutcome} outcome
 * @param {(file: string, line: number) => void} onSaved
 */
function sendOutcome(response, outcome, onSaved) {
  if (outcome.outcome === "saved") {
    onSaved(outcome.file, outcome.line);
  }
  sendJson(response, 200, outcome);
}

/**
 * @param {import("node:http").IncomingMessage} request
 * @returns {Promise<unknown>} The parsed body, or null when it is not acceptable JSON.
 */
async function readJsonBody(request) {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    return null;
  }
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > LARGEST_BODY_BYTES) {
      return null;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}
