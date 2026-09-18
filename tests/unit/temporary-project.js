/**
 * Creates throwaway project folders for tests.
 */

import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Creates a folder holding the given files.
 * @param {Record<string, string>} files Contents by relative path.
 * @returns {Promise<{ root: string, read: (file: string) => Promise<string>, remove: () => Promise<void> }>}
 */
export async function createProject(files) {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "editdesk-test-")),
  );
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), contents);
  }
  return {
    root,
    read: (file) => readFile(path.join(root, file), "utf8"),
    remove: () => rm(root, { recursive: true, force: true }),
  };
}
