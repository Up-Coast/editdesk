/**
 * The page shown for a folder that has no index page: its HTML pages and
 * sub-folders, as links.
 */

import { encodeHtmlText } from "../source/html-text.js";
import { messages } from "../messages.js";
import { EDITDESK_PREFIX } from "./editor-assets.js";

/**
 * Builds the listing page for a folder.
 * @param {object} listing
 * @param {string} listing.pathname The folder's URL path, ending in a slash.
 * @param {string[]} listing.folders Names of its sub-folders.
 * @param {string[]} listing.pages Names of its HTML pages.
 * @returns {string} An HTML page.
 */
export function buildListingPage({ pathname, folders, pages }) {
  const links = [
    ...(pathname === "/" ? [] : [link("../", messages.listingParent)]),
    ...folders.map((name) => link(`${encodeURIComponent(name)}/`, `${name}/`)),
    ...pages.map((name) => link(encodeURIComponent(name), name)),
  ];
  const body =
    folders.length + pages.length === 0
      ? `<p class="editdesk-listing-empty">${encodeHtmlText(messages.listingEmpty)}</p>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${encodeHtmlText(messages.listingTitle)}</title>
<link rel="stylesheet" href="${EDITDESK_PREFIX}client/theme.css">
</head>
<body class="editdesk-listing">
<main>
<h1>${encodeHtmlText(messages.listingTitle)}</h1>
<p class="editdesk-listing-path">${encodeHtmlText(decodeURIComponent(pathname))}</p>
${body}<ul>
${links.join("\n")}
</ul>
</main>
</body>
</html>
`;
}

/**
 * @param {string} href An already URL-encoded relative link.
 * @param {string} label
 */
function link(href, label) {
  return `<li><a href="${href}">${encodeHtmlText(label)}</a></li>`;
}
