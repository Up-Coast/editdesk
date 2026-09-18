/**
 * The checks that keep the local server private to the person running it.
 *
 * The server can write to files, so it accepts requests only from pages it
 * served itself: it listens on the loopback address, refuses any Host it does
 * not own (which stops DNS rebinding), and requires a per-run token on every
 * request that reads or changes source files.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { realpath } from "node:fs/promises";
import path from "node:path";

/** The only address the server listens on. */
export const LOOPBACK_ADDRESS = "127.0.0.1";

const LOOPBACK_HOST_NAMES = ["localhost", LOOPBACK_ADDRESS, "[::1]"];

/**
 * Says whether a URL's host name means "this computer".
 * @param {string} hostName A host name as the URL class reports it.
 * @returns {boolean} True for loopback names and the any-address a dev server may print.
 */
export function isLoopbackHostName(hostName) {
  return LOOPBACK_HOST_NAMES.includes(hostName) || hostName === "0.0.0.0";
}

/**
 * Creates the secret that the served pages use to call the API.
 * @returns {string} A new random token.
 */
export function createToken() {
  return randomBytes(32).toString("hex");
}

/**
 * Compares a presented token with the real one in constant time.
 * @param {unknown} presented The value from the request.
 * @param {string} expected The token created at startup.
 * @returns {boolean} True when they are the same.
 */
export function tokensMatch(presented, expected) {
  if (typeof presented !== "string") {
    return false;
  }
  const presentedBytes = Buffer.from(presented);
  const expectedBytes = Buffer.from(expected);
  return (
    presentedBytes.length === expectedBytes.length &&
    timingSafeEqual(presentedBytes, expectedBytes)
  );
}

/**
 * Says whether a Host header names this server.
 * @param {string | undefined} hostHeader The request's Host header.
 * @param {number} port The port this server listens on.
 * @returns {boolean} True for a loopback name with this port.
 */
export function isOwnHost(hostHeader, port) {
  return LOOPBACK_HOST_NAMES.some((name) => hostHeader === `${name}:${port}`);
}

/**
 * Says whether a request's Origin header, when present, is this server.
 * @param {string | undefined} originHeader The request's Origin header.
 * @param {number} port The port this server listens on.
 * @returns {boolean} True when absent or naming this server.
 */
export function isOwnOrigin(originHeader, port) {
  return (
    originHeader === undefined ||
    LOOPBACK_HOST_NAMES.some(
      (name) => originHeader === `http://${name}:${port}`,
    )
  );
}

/**
 * Resolves a URL path to a real path inside the root folder.
 * @param {string} root The folder being served; must already be a real path.
 * @param {string} urlPath The path part of a URL, still percent-encoded.
 * @returns {Promise<string | null>} The real path, or null when it is malformed, missing, hidden or outside the root.
 */
export async function resolveInsideRoot(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const segments = decoded.split("/").filter((segment) => segment !== "");
  if (
    decoded.includes("\0") ||
    segments.some((segment) => segment.startsWith("."))
  ) {
    return null;
  }
  try {
    const resolved = await realpath(path.join(root, ...segments));
    const isInside = resolved === root || resolved.startsWith(root + path.sep);
    return isInside ? resolved : null;
  } catch {
    return null;
  }
}
