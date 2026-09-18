/**
 * Turning the command line into a decision about what to show and where
 * edits may be saved.
 */

import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { messages } from "../messages.js";
import { isHtmlFile } from "../server/content-types.js";
import { isLoopbackHostName } from "../server/security.js";

const URL_TARGET = /^https?:\/\//i;

/**
 * A mistake in how the command was typed; its message is ready to print.
 */
export class UsageError extends Error {}

/**
 * What the command line asked for.
 * @typedef {object} Invocation
 * @property {"help" | "version" | "serve"} action
 * @property {URL | null} upstream A site to show through the proxy.
 * @property {string | null} root The folder whose files may be edited; null when nothing can be saved.
 * @property {string} startPath The URL path to open first.
 * @property {number} port 0 for any free port.
 * @property {boolean} openBrowser
 */

/**
 * Reads the command line.
 * @param {string[]} argv Arguments after the program name.
 * @param {string} currentFolder The folder the command was run in.
 * @returns {Promise<Invocation>} What to do.
 * @throws {UsageError} When the arguments cannot be understood.
 */
export async function readInvocation(argv, currentFolder) {
  const { values, positionals } = parseCommandLine(argv);
  /** @type {Invocation} */
  const invocation = {
    action: values.help ? "help" : values.version ? "version" : "serve",
    upstream: null,
    root: null,
    startPath: "/",
    port: readPort(values.port),
    openBrowser: !values["no-open"],
  };
  if (invocation.action !== "serve") {
    return invocation;
  }
  if (positionals.length > 1) {
    throw new UsageError(messages.tooManyTargets);
  }

  const target = positionals[0] ?? ".";
  const givenRoot = values.root
    ? await realFolder(path.resolve(currentFolder, values.root))
    : null;

  if (URL_TARGET.test(target)) {
    const url = new URL(target);
    invocation.upstream = new URL(url.origin);
    invocation.startPath = url.pathname + url.search;
    invocation.root = isLoopbackHostName(url.hostname)
      ? (givenRoot ?? (await realFolder(currentFolder)))
      : null;
    return invocation;
  }

  const targetPath = await realTarget(
    path.resolve(currentFolder, target),
    target,
  );
  if ((await stat(targetPath)).isDirectory()) {
    invocation.root = givenRoot ?? targetPath;
    invocation.startPath = startPathFor(invocation.root, targetPath, true);
    return invocation;
  }
  if (!isHtmlFile(targetPath)) {
    throw new UsageError(messages.targetNotHtml(target));
  }
  invocation.root = givenRoot ?? path.dirname(targetPath);
  invocation.startPath = startPathFor(invocation.root, targetPath, false);
  return invocation;
}

/**
 * @param {string[]} argv
 */
function parseCommandLine(argv) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        root: { type: "string" },
        port: { type: "string" },
        "no-open": { type: "boolean" },
        version: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    const code = /** @type {{ code?: string }} */ (error).code;
    const message = /** @type {Error} */ (error).message;
    const option = message.match(/'(-{1,2}[^' ]+)/)?.[1] ?? "";
    throw new UsageError(
      code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE"
        ? messages.missingValue(option)
        : messages.unknownOption(option),
    );
  }
}

/**
 * @param {string | undefined} value
 */
function readPort(value) {
  if (value === undefined) {
    return 0;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UsageError(messages.invalidPort(value));
  }
  return port;
}

/**
 * @param {string} folder
 */
async function realFolder(folder) {
  try {
    const resolved = await realpath(folder);
    if ((await stat(resolved)).isDirectory()) {
      return resolved;
    }
  } catch {
    // Reported below, the same way as a path that is not a folder.
  }
  throw new UsageError(messages.rootNotFolder(folder));
}

/**
 * @param {string} absolutePath
 * @param {string} asTyped
 */
async function realTarget(absolutePath, asTyped) {
  try {
    return await realpath(absolutePath);
  } catch {
    throw new UsageError(messages.targetNotFound(asTyped));
  }
}

/**
 * @param {string} root
 * @param {string} targetPath
 * @param {boolean} isFolder
 */
function startPathFor(root, targetPath, isFolder) {
  const relative = path.relative(root, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new UsageError(messages.fileOutsideRoot(targetPath, root));
  }
  const urlPath = relative
    .split(path.sep)
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/${urlPath}${isFolder && urlPath !== "" ? "/" : ""}`;
}
