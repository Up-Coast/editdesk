/**
 * Showing a site that another server renders (a development server, or a live
 * site) with the editor added to every HTML page.
 */

import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { injectIntoHead } from "../source/html-document.js";
import { messages } from "../messages.js";
import { sendText } from "./responses.js";

const HEADERS_THAT_WOULD_BLOCK_THE_EDITOR = [
  "content-security-policy",
  "content-security-policy-report-only",
];

const DESTINATIONS_THAT_ARE_PAGES = new Set([
  undefined,
  "document",
  "iframe",
  "frame",
]);

const DEFAULT_PORTS = { "http:": 80, "https:": 443 };

/**
 * Creates the proxy for one upstream site.
 * @param {object} options
 * @param {URL} options.upstream The site to show.
 * @param {string} options.headSnippet Markup that loads the editor.
 * @returns {{ handle: (request: http.IncomingMessage, response: http.ServerResponse) => void, handleUpgrade: (request: http.IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => void }}
 */
export function createProxySite({ upstream, headSnippet }) {
  const isSecure = upstream.protocol === "https:";
  const upstreamPort =
    Number(upstream.port) || DEFAULT_PORTS[isSecure ? "https:" : "http:"];

  /**
   * Rewrites the headers of a browser request so the upstream accepts it.
   * @param {http.IncomingMessage} request
   */
  function upstreamHeaders(request) {
    const ownOrigin = `http://${request.headers.host}`;
    /** @type {http.OutgoingHttpHeaders} */
    const headers = { ...request.headers, host: upstream.host };
    delete headers["accept-encoding"];
    for (const name of ["origin", "referer"]) {
      const value = request.headers[name];
      if (typeof value === "string" && value.startsWith(ownOrigin)) {
        headers[name] = upstream.origin + value.slice(ownOrigin.length);
      }
    }
    return headers;
  }

  /**
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   */
  function handle(request, response) {
    const send = isSecure ? https.request : http.request;
    const upstreamRequest = send(
      {
        hostname: upstream.hostname,
        port: upstreamPort,
        method: request.method,
        path: request.url,
        headers: upstreamHeaders(request),
      },
      (upstreamResponse) => relay(request, upstreamResponse, response),
    );
    upstreamRequest.on("error", () => {
      if (!response.headersSent) {
        sendText(response, 502, messages.upstreamUnreachable(upstream.origin));
      } else {
        response.destroy();
      }
    });
    request.pipe(upstreamRequest);
  }

  /**
   * @param {http.IncomingMessage} request
   * @param {http.IncomingMessage} upstreamResponse
   * @param {http.ServerResponse} response
   */
  function relay(request, upstreamResponse, response) {
    const headers = { ...upstreamResponse.headers };
    for (const name of HEADERS_THAT_WOULD_BLOCK_THE_EDITOR) {
      delete headers[name];
    }
    const ownOrigin = `http://${request.headers.host}`;
    if (headers.location?.startsWith(upstream.origin)) {
      headers.location =
        ownOrigin + headers.location.slice(upstream.origin.length);
    }
    if (headers["set-cookie"]) {
      headers["set-cookie"] = headers["set-cookie"].map((cookie) =>
        cookie.replace(/;\s*domain=[^;]*/i, "").replace(/;\s*secure/i, ""),
      );
    }

    const isPage =
      headers["content-type"]?.includes("text/html") &&
      DESTINATIONS_THAT_ARE_PAGES.has(
        /** @type {string | undefined} */ (request.headers["sec-fetch-dest"]),
      );
    if (!isPage) {
      response.writeHead(upstreamResponse.statusCode ?? 502, headers);
      upstreamResponse.pipe(response);
      return;
    }

    /** @type {Buffer[]} */
    const chunks = [];
    upstreamResponse.on("data", (chunk) => chunks.push(chunk));
    upstreamResponse.on("end", () => {
      const page = injectIntoHead(
        Buffer.concat(chunks).toString("utf8"),
        headSnippet,
      );
      delete headers["content-length"];
      delete headers["transfer-encoding"];
      headers["cache-control"] = "no-store";
      response.writeHead(upstreamResponse.statusCode ?? 502, headers);
      response.end(page);
    });
    upstreamResponse.on("error", () => response.destroy());
  }

  /**
   * Passes a WebSocket connection through, so live reload keeps working.
   * @param {http.IncomingMessage} request
   * @param {import("node:stream").Duplex} socket
   * @param {Buffer} head
   */
  function handleUpgrade(request, socket, head) {
    const target = { host: upstream.hostname, port: upstreamPort };
    const upstreamSocket = isSecure
      ? tls.connect({ ...target, servername: upstream.hostname })
      : net.connect(target);
    const headerLines = Object.entries(upstreamHeaders(request)).flatMap(
      ([name, value]) =>
        (Array.isArray(value) ? value : [value]).map(
          (one) => `${name}: ${one}`,
        ),
    );
    upstreamSocket.on(isSecure ? "secureConnect" : "connect", () => {
      upstreamSocket.write(
        `${request.method} ${request.url} HTTP/1.1\r\n${headerLines.join("\r\n")}\r\n\r\n`,
      );
      upstreamSocket.write(head);
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
    });
    upstreamSocket.on("error", () => socket.destroy());
    upstreamSocket.on("close", () => socket.destroy());
    socket.on("error", () => upstreamSocket.destroy());
    socket.on("close", () => upstreamSocket.destroy());
  }

  return { handle, handleUpgrade };
}
