/**
 * The command-line program.
 */

import { readFile } from "node:fs/promises";
import { messages } from "../messages.js";
import { startServer } from "../server/server.js";
import { readInvocation, UsageError } from "./arguments.js";
import { openBrowser } from "./open-browser.js";

/**
 * Runs the command.
 * @param {string[]} argv Arguments after the program name.
 * @returns {Promise<number | null>} An exit code, or null while the server keeps running.
 */
export async function run(argv) {
  let invocation;
  try {
    invocation = await readInvocation(argv, process.cwd());
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n${messages.seeHelp}`);
      return 2;
    }
    throw error;
  }

  if (invocation.action === "help") {
    console.log(messages.usage);
    return 0;
  }
  if (invocation.action === "version") {
    console.log(await readVersion());
    return 0;
  }

  let server;
  try {
    server = await startServer({
      upstream: invocation.upstream,
      root: invocation.root,
      port: invocation.port,
      onSaved: (file, line) => console.log(messages.saved(file, line)),
    });
  } catch (error) {
    if (/** @type {{ code?: string }} */ (error).code === "EADDRINUSE") {
      console.error(messages.portInUse(invocation.port));
      return 1;
    }
    throw error;
  }

  const startUrl = server.url + invocation.startPath;
  console.log(messages.ready(startUrl));
  console.log(
    invocation.root === null
      ? messages.notSaving
      : messages.savingTo(invocation.root),
  );
  console.log(messages.stopHint);
  if (invocation.openBrowser && !(await openBrowser(startUrl))) {
    console.log(messages.couldNotOpenBrowser(startUrl));
  }
  return null;
}

/**
 * Reads the version from the one file that holds it.
 * @returns {Promise<string>}
 */
async function readVersion() {
  const manifest = await readFile(
    new URL("../../package.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(manifest).version;
}
