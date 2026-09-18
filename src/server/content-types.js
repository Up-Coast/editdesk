/**
 * Content types for the files a static site is made of.
 */

import path from "node:path";

/** @type {Record<string, string>} */
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

const HTML_EXTENSIONS = new Set([".html", ".htm"]);

/**
 * Returns the content type for a file name.
 * @param {string} fileName A file name or path.
 * @returns {string} A Content-Type header value.
 */
export function contentTypeFor(fileName) {
  return (
    CONTENT_TYPES[path.extname(fileName).toLowerCase()] ??
    "application/octet-stream"
  );
}

/**
 * Says whether a file name is an HTML page.
 * @param {string} fileName A file name or path.
 * @returns {boolean} True for .html and .htm.
 */
export function isHtmlFile(fileName) {
  return HTML_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}
