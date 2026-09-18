/**
 * Replacing a file's contents in one step, so nothing that reads the file
 * (a development server, a browser reload) ever sees it empty or half
 * written.
 */

import { randomBytes } from "node:crypto";
import { rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Replaces the contents of an existing file, keeping its permissions.
 * @param {string} filePath The file to replace.
 * @param {string} contents Its new contents.
 * @returns {Promise<void>}
 */
export async function replaceFileContents(filePath, contents) {
  const { mode } = await stat(filePath);
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomBytes(6).toString("hex")}.editdesk`,
  );
  try {
    await writeFile(temporaryPath, contents, { mode, flag: "wx" });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
