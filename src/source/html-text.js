/**
 * Reading and rewriting the raw source of one run of HTML text.
 *
 * A run of text in an HTML file is not the same string the browser shows:
 * `&amp;` shows as `&`, and a Windows line ending shows as one newline. These
 * functions translate between the two, and rewrite only the part of the raw
 * source that an edit changed, so every untouched entity and line break stays
 * exactly as its author wrote it.
 */

import { decodeHTML } from "entities";

const CHARACTER_REFERENCE_OR_LINE_ENDING =
  /&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);?|\r\n?/g;

const NO_BREAK_SPACE = "\u00a0";

/**
 * One indivisible piece of raw HTML text and the text a browser shows for it.
 * @typedef {{ raw: string, text: string }} HtmlTextUnit
 */

/**
 * Splits raw HTML text into units: one per character reference, line ending
 * or plain character.
 * @param {string} raw Raw source between two tags.
 * @returns {HtmlTextUnit[]} The units, in order.
 */
export function tokenizeHtmlText(raw) {
  /** @type {HtmlTextUnit[]} */
  const units = [];
  let position = 0;
  for (const match of raw.matchAll(CHARACTER_REFERENCE_OR_LINE_ENDING)) {
    pushPlainCharacters(units, raw.slice(position, match.index));
    const matched = match[0];
    const text = matched.startsWith("&") ? decodeHTML(matched) : "\n";
    units.push({ raw: matched, text });
    position = match.index + matched.length;
  }
  pushPlainCharacters(units, raw.slice(position));
  return units;
}

/**
 * Returns the text a browser shows for a run of raw HTML text.
 * @param {string} raw Raw source between two tags.
 * @returns {string} The decoded text.
 */
export function decodeHtmlText(raw) {
  return tokenizeHtmlText(raw)
    .map((unit) => unit.text)
    .join("");
}

/**
 * Encodes text so it can be written between two HTML tags.
 * @param {string} text The text a person typed.
 * @returns {string} Raw HTML that a browser shows as that text.
 */
export function encodeHtmlText(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(NO_BREAK_SPACE, "&nbsp;");
}

/**
 * Rewrites raw HTML text so it shows `newText`, changing only the part that
 * differs from what it shows now.
 * @param {string} raw Raw source between two tags.
 * @param {string} newText The text it should show.
 * @returns {string} The rewritten raw source.
 */
export function rewriteHtmlText(raw, newText) {
  const units = tokenizeHtmlText(raw);
  const oldText = units.map((unit) => unit.text).join("");
  const sharedStart = commonPrefixLength(oldText, newText);
  const sharedEnd = commonSuffixLength(oldText, newText, sharedStart);

  const kept = keepWholeUnits(units, sharedStart, sharedEnd);
  const middle = newText.slice(
    kept.startTextLength,
    newText.length - kept.endTextLength,
  );
  return kept.startRaw + encodeHtmlText(middle) + kept.endRaw;
}

/**
 * @param {HtmlTextUnit[]} units
 * @param {string} plain
 */
function pushPlainCharacters(units, plain) {
  for (const character of plain) {
    units.push({ raw: character, text: character });
  }
}

/**
 * @param {string} first
 * @param {string} second
 */
function commonPrefixLength(first, second) {
  const limit = Math.min(first.length, second.length);
  let length = 0;
  while (length < limit && first[length] === second[length]) {
    length += 1;
  }
  return length;
}

/**
 * @param {string} first
 * @param {string} second
 * @param {number} alreadyShared Characters at the start that must not be reused.
 */
function commonSuffixLength(first, second, alreadyShared) {
  const limit = Math.min(first.length, second.length) - alreadyShared;
  let length = 0;
  while (
    length < limit &&
    first[first.length - 1 - length] === second[second.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

/**
 * Finds the whole units that fit inside the shared start and shared end.
 * @param {HtmlTextUnit[]} units
 * @param {number} sharedStart
 * @param {number} sharedEnd
 */
function keepWholeUnits(units, sharedStart, sharedEnd) {
  let startCount = 0;
  let startTextLength = 0;
  while (
    startCount < units.length &&
    startTextLength + units[startCount].text.length <= sharedStart
  ) {
    startTextLength += units[startCount].text.length;
    startCount += 1;
  }

  let endCount = 0;
  let endTextLength = 0;
  while (
    endCount < units.length - startCount &&
    endTextLength + units[units.length - 1 - endCount].text.length <= sharedEnd
  ) {
    endTextLength += units[units.length - 1 - endCount].text.length;
    endCount += 1;
  }

  const rawOf = (/** @type {HtmlTextUnit[]} */ list) =>
    list.map((unit) => unit.raw).join("");
  return {
    startRaw: rawOf(units.slice(0, startCount)),
    endRaw: rawOf(units.slice(units.length - endCount)),
    startTextLength,
    endTextLength,
  };
}
