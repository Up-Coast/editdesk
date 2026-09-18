/**
 * Every sentence the command-line tool and the local server show a person.
 * The editor in the browser keeps its own sentences in client/strings.js.
 */

export const messages = {
  usage: `Usage: editdesk [target] [options]

Edit the copy on a web page in place and save it back to the source file.

Target (default: the current folder):
  page.html              Open one HTML file.
  folder                 Serve a folder and list its HTML pages.
  http://localhost:3000  Open a running development server.
  https://example.com    Open a live site (changes are collected, not saved).

Options:
  --root <folder>   The folder whose source files may be edited.
                    Default: the folder served, or the current folder for a URL.
  --port <number>   The port to listen on. Default: any free port.
  --no-open         Do not open the browser.
  -v, --version     Print the version.
  -h, --help        Print this help.`,

  /** @param {string} option */
  unknownOption: (option) => `Unknown option: ${option}`,
  /** @param {string} option */
  missingValue: (option) => `Option ${option} needs a value.`,
  /** @param {string} value */
  invalidPort: (value) => `Not a valid port: ${value}`,
  tooManyTargets: "Give one target: a file, a folder or a URL.",
  /** @param {string} target */
  targetNotFound: (target) => `Nothing found at ${target}`,
  /** @param {string} target */
  targetNotHtml: (target) => `${target} is not an HTML file.`,
  /** @param {string} root */
  rootNotFolder: (root) => `--root must be a folder: ${root}`,
  /** @param {string} file @param {string} root */
  fileOutsideRoot: (file, root) => `${file} is not inside --root ${root}`,
  seeHelp: "Run editdesk --help to see how to use it.",

  /** @param {string} url */
  ready: (url) => `Editdesk is ready at ${url}`,
  /** @param {string} root */
  savingTo: (root) => `Edits are saved to files in ${root}`,
  notSaving:
    "This is a live site, so there is no file to save to. Edits are collected in a change list you can copy.",
  stopHint: "Press Ctrl+C to stop.",
  /** @param {string} file @param {number} line */
  saved: (file, line) => `Saved ${file}:${line}`,
  /** @param {string} url */
  couldNotOpenBrowser: (url) =>
    `Could not open a browser. Open ${url} yourself.`,
  /** @param {number} port */
  portInUse: (port) =>
    `Port ${port} is already in use. Choose another with --port.`,

  pageNotFound: "Editdesk found no page here.",
  forbiddenHost: "Editdesk only answers requests made to this computer.",
  forbiddenRequest: "This request did not come from an Editdesk page.",
  badRequest: "Editdesk could not read this request.",
  methodNotAllowed: "Editdesk does not accept this kind of request here.",
  /** @param {string} upstream */
  upstreamUnreachable: (upstream) =>
    `Editdesk could not reach ${upstream}. Check that it is running, then reload.`,

  listingTitle: "Pages in this folder",
  listingEmpty: "There are no HTML pages in this folder.",
  listingParent: "Up one folder",
};
