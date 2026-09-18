/**
 * Searching a project's source files for a piece of on-screen text.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { findInSource } from "./source-text.js";

const SEARCHED_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
  ".astro",
  ".md",
  ".markdown",
  ".mdx",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".njk",
  ".liquid",
  ".hbs",
  ".ejs",
  ".erb",
  ".php",
  ".twig",
]);

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "test-results",
]);

const LARGEST_SEARCHED_FILE_BYTES = 1_000_000;

const PREVIEW_CONTEXT_LENGTH = 60;

/**
 * One place in the project where the searched text was found.
 * @typedef {{ before: string, match: string, after: string }} MatchPreview The matched text with the rest of its line around it.
 * @typedef {import("./source-text.js").SourceMatch & { file: string, line: number, preview: MatchPreview }} ProjectMatch
 */

/**
 * Says whether Editdesk reads and writes files with this name.
 * @param {string} fileName A file name or path.
 * @returns {boolean} True for source files that can hold copy.
 */
export function isSearchedFile(fileName) {
  return SEARCHED_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

/**
 * Lists the source files of a project, skipping dependencies, build output
 * and hidden folders.
 * @param {string} root The project folder.
 * @returns {Promise<string[]>} Paths relative to the root, with forward slashes, sorted.
 */
export async function listSourceFiles(root) {
  /** @type {string[]} */
  const files = [];
  await collectFiles(root, "", files);
  return files.sort();
}

/**
 * Finds every place a piece of on-screen text appears in the project.
 * @param {string} root The project folder.
 * @param {string} text On-screen text; must contain at least one word.
 * @param {string[]} [files] Limit the search to these files (relative to the root).
 * @returns {Promise<ProjectMatch[]>} Matches, by file then position.
 */
export async function searchProject(root, text, files) {
  /** @type {ProjectMatch[]} */
  const matches = [];
  for (const file of files ?? (await listSourceFiles(root))) {
    const source = await readFile(path.join(root, file), "utf8");
    const extension = path.extname(file).toLowerCase();
    for (const match of findInSource(source, extension, text)) {
      matches.push({ ...match, file, ...describePlace(source, match) });
    }
  }
  return matches;
}

/**
 * @param {string} root
 * @param {string} relativeDirectory
 * @param {string[]} files
 */
async function collectFiles(root, relativeDirectory, files) {
  const entries = await readdir(path.join(root, relativeDirectory), {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && !SKIPPED_DIRECTORIES.has(entry.name)) {
        await collectFiles(root, relativePath, files);
      }
    } else if (entry.isFile() && isSearchedFile(entry.name)) {
      const { size } = await stat(path.join(root, relativePath));
      if (size <= LARGEST_SEARCHED_FILE_BYTES) {
        files.push(relativePath);
      }
    }
  }
}

/**
 * @param {string} source
 * @param {import("./source-text.js").SourceMatch} match
 */
function describePlace(source, { start, end }) {
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = source.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? source.length : nextBreak;
  return {
    line: source.slice(0, start).split("\n").length,
    preview: {
      before: source
        .slice(Math.max(lineStart, start - PREVIEW_CONTEXT_LENGTH), start)
        .trimStart(),
      match: source.slice(start, end),
      after: source
        .slice(end, Math.min(lineEnd, end + PREVIEW_CONTEXT_LENGTH))
        .trimEnd(),
    },
  };
}
