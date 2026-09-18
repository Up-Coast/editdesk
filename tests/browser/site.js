/**
 * Starts Editdesk on a throwaway copy of the fixture site, so tests can edit
 * real files without changing the fixture.
 */

import { cp, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../src/server/server.js";

const FIXTURE_SITE = fileURLToPath(
  new URL("../fixtures/site", import.meta.url),
);

/**
 * @returns {Promise<{ url: string, read: (file: string) => Promise<string>, original: (file: string) => Promise<string>, stop: () => Promise<void> }>}
 */
export async function startFixtureSite() {
  const folder = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "editdesk-")),
  );
  await cp(FIXTURE_SITE, folder, { recursive: true });
  const server = await startServer({ upstream: null, root: folder, port: 0 });
  return {
    url: server.url,
    read: (file) => readFile(path.join(folder, file), "utf8"),
    original: (file) => readFile(path.join(FIXTURE_SITE, file), "utf8"),
    async stop() {
      await server.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
}
