/**
 * Serving a folder of files, with every HTML page made editable.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { annotateHtml } from "../source/html-document.js";
import { messages } from "../messages.js";
import { contentTypeFor, isHtmlFile } from "./content-types.js";
import { buildListingPage } from "./listing-page.js";
import { sendFile, sendHtml, sendText } from "./responses.js";
import { resolveInsideRoot } from "./security.js";

const INDEX_PAGE = "index.html";

/**
 * Creates the static site for one folder.
 * @param {object} options
 * @param {string} options.root The folder to serve; must be a real path.
 * @param {string} options.headSnippet Markup that loads the editor.
 * @returns {{ handle: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, pathname: string) => Promise<void>, resolvePageFile: (page: string) => Promise<string | null> }}
 */
export function createStaticSite({ root, headSnippet }) {
  /**
   * Finds the file a URL path shows: the file itself, or a folder's index page.
   * @param {string} pathname
   * @returns {Promise<{ path: string, isFolder: boolean } | null>}
   */
  async function findTarget(pathname) {
    const resolved = await resolveInsideRoot(root, pathname);
    if (resolved === null) {
      return null;
    }
    if (!(await stat(resolved)).isDirectory()) {
      return { path: resolved, isFolder: false };
    }
    const indexPath = await resolveInsideRoot(
      root,
      path.posix.join(pathname, INDEX_PAGE),
    );
    return indexPath === null
      ? { path: resolved, isFolder: true }
      : { path: indexPath, isFolder: false };
  }

  /**
   * @param {string} page
   */
  async function resolvePageFile(page) {
    const target = await findTarget(page);
    if (target === null || target.isFolder || !isHtmlFile(target.path)) {
      return null;
    }
    return path.relative(root, target.path).split(path.sep).join("/");
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {string} pathname
   */
  async function handle(request, response, pathname) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, messages.methodNotAllowed);
      return;
    }
    const target = await findTarget(pathname);
    if (target === null) {
      sendText(response, 404, messages.pageNotFound);
      return;
    }
    const showsFolder =
      target.isFolder || path.basename(target.path) === INDEX_PAGE;
    if (showsFolder && !pathname.endsWith("/") && !isHtmlFile(pathname)) {
      response.writeHead(302, { location: `${pathname}/` });
      response.end();
      return;
    }
    if (target.isFolder) {
      sendHtml(response, await listFolder(target.path, pathname));
      return;
    }
    if (isHtmlFile(target.path)) {
      const source = await readFile(target.path, "utf8");
      sendHtml(response, annotateHtml(source, headSnippet));
      return;
    }
    await sendFile(response, target.path, contentTypeFor(target.path));
  }

  return { handle, resolvePageFile };
}

/**
 * @param {string} folder
 * @param {string} pathname
 */
async function listFolder(folder, pathname) {
  const entries = await readdir(folder, { withFileTypes: true });
  const visible = entries.filter((entry) => !entry.name.startsWith("."));
  return buildListingPage({
    pathname,
    folders: visible
      .filter((entry) => entry.isDirectory() && entry.name !== "node_modules")
      .map((entry) => entry.name)
      .sort(),
    pages: visible
      .filter((entry) => entry.isFile() && isHtmlFile(entry.name))
      .map((entry) => entry.name)
      .sort(),
  });
}
