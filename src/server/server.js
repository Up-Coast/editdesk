/**
 * The local server: one site (a folder, or another server shown through a
 * proxy) plus the editor's files and API.
 */

import http from "node:http";
import { createEditService } from "../source/edit-service.js";
import { messages } from "../messages.js";
import { ELEMENT_ATTRIBUTE } from "../source/html-document.js";
import { createApiHandler, EDIT_ENDPOINT, TOKEN_HEADER } from "./api.js";
import { buildHeadSnippet, createEditorAssetHandler } from "./editor-assets.js";
import { createProxySite } from "./proxy-site.js";
import { sendText } from "./responses.js";
import {
  createToken,
  isOwnHost,
  isOwnOrigin,
  LOOPBACK_ADDRESS,
} from "./security.js";
import { createStaticSite } from "./static-site.js";

/**
 * What to show and where edits may be saved.
 * @typedef {object} SiteOptions
 * @property {URL | null} upstream A site to show through the proxy, or null to serve the root folder.
 * @property {string | null} root The folder whose files may be edited (a real path), or null when nothing can be saved.
 * @property {number} port The port to listen on; 0 for any free port.
 * @property {(file: string, line: number) => void} [onSaved] Called after each saved edit.
 */

/**
 * Starts the local server.
 * @param {SiteOptions} options
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void> }>} The running server.
 */
export async function startServer({
  upstream,
  root,
  port,
  onSaved = () => {},
}) {
  const token = createToken();
  const headSnippet = buildHeadSnippet({
    token,
    tokenHeader: TOKEN_HEADER,
    editEndpoint: EDIT_ENDPOINT,
    elementAttribute: ELEMENT_ATTRIBUTE,
    canSave: root !== null,
  });
  const staticSite =
    upstream === null && root !== null
      ? createStaticSite({ root, headSnippet })
      : null;
  const proxySite =
    upstream === null ? null : createProxySite({ upstream, headSnippet });
  const editService =
    root === null
      ? null
      : createEditService({
          root,
          resolvePageFile: staticSite?.resolvePageFile ?? (async () => null),
        });

  let listeningPort = port;
  const serveEditorAsset = await createEditorAssetHandler();
  const serveApi = createApiHandler({
    token,
    getPort: () => listeningPort,
    editService,
    onSaved,
  });

  const server = http.createServer(async (request, response) => {
    try {
      if (!isOwnHost(request.headers.host, listeningPort)) {
        sendText(response, 403, messages.forbiddenHost);
        return;
      }
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      if (serveEditorAsset(request, response, url.pathname)) {
        return;
      }
      if (await serveApi(request, response, url)) {
        return;
      }
      if (proxySite) {
        proxySite.handle(request, response);
      } else if (staticSite) {
        await staticSite.handle(request, response, url.pathname);
      }
    } catch {
      if (!response.headersSent) {
        sendText(response, 500, messages.badRequest);
      } else {
        response.destroy();
      }
    }
  });
  /** @type {Set<import("node:stream").Duplex>} */
  const upgradedSockets = new Set();
  server.on("upgrade", (request, socket, head) => {
    if (
      proxySite &&
      isOwnHost(request.headers.host, listeningPort) &&
      isOwnOrigin(request.headers.origin, listeningPort)
    ) {
      upgradedSockets.add(socket);
      socket.once("close", () => upgradedSockets.delete(socket));
      proxySite.handleUpgrade(request, socket, head);
    } else {
      socket.destroy();
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, LOOPBACK_ADDRESS, () => resolve(undefined));
  });
  const address = server.address();
  listeningPort = typeof address === "object" && address ? address.port : port;

  return {
    url: `http://localhost:${listeningPort}`,
    port: listeningPort,
    close: () =>
      new Promise((resolve) => {
        for (const socket of upgradedSockets) {
          socket.destroy();
        }
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
