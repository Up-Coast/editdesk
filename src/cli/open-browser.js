/**
 * Opening a URL in the person's default browser.
 */

import { spawn } from "node:child_process";

/** @type {Record<string, { command: string, args: string[] }>} */
const OPENERS = {
  darwin: { command: "open", args: [] },
  win32: { command: "cmd", args: ["/c", "start", ""] },
  linux: { command: "xdg-open", args: [] },
};

/**
 * Opens a URL in the default browser.
 * @param {string} url The URL to open.
 * @returns {Promise<boolean>} False when no browser could be started.
 */
export function openBrowser(url) {
  const opener = OPENERS[process.platform] ?? OPENERS.linux;
  return new Promise((resolve) => {
    const child = spawn(opener.command, [...opener.args, url], {
      stdio: "ignore",
      detached: true,
    });
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}
