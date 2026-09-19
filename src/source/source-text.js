/**
 * Finding on-screen text inside source code, and writing replacement text in
 * the spelling the surrounding code needs.
 *
 * The same sentence is spelled differently depending on where it lives:
 * `Don't` on screen can be `Don\'t` in a JavaScript string or `Don&apos;t` in
 * markup. The search accepts every common spelling; the replacement uses the
 * one spelling that is correct for the place the text was found.
 */

import { LINE_BREAK } from "./breaks.js";

const SOURCE_WHITESPACE = /[ \t\r\n\f]+/;

/** @type {Record<string, string[]>} */
const ALTERNATIVE_SPELLINGS = {
  "'": ["'", "\\'", "&apos;", "&#39;", "&#x27;"],
  '"': ['"', '\\"', "&quot;", "&#34;"],
  "&": ["&amp;", "&"],
  "<": ["&lt;", "<"],
  ">": ["&gt;", ">"],
  "{": ["{", "&#123;"],
  "}": ["}", "&#125;"],
  "`": ["`", "\\`"],
  $: ["$", "\\$"],
  "\\": ["\\\\"],
  "\u00a0": ["\u00a0", "&nbsp;", "&#160;", "\\u00a0"],
  [LINE_BREAK]: ["\\n", "<br>", "<br/>", "<br />"],
  "‘": ["‘", "&lsquo;", "&#8216;", "\\u2018"],
  "’": ["’", "&rsquo;", "&#8217;", "\\u2019"],
  "“": ["“", "&ldquo;", "&#8220;", "\\u201c"],
  "”": ["”", "&rdquo;", "&#8221;", "\\u201d"],
  "–": ["–", "&ndash;", "&#8211;", "\\u2013"],
  "—": ["—", "&mdash;", "&#8212;", "\\u2014"],
  "…": ["…", "&hellip;", "&#8230;", "\\u2026"],
  "©": ["©", "&copy;", "&#169;", "\\u00a9"],
};

const QUOTES = new Set(['"', "'", "`"]);

const EXTENSIONS_WITH_JAVASCRIPT_STRINGS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".mdx",
  ".vue",
  ".svelte",
  ".astro",
]);

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);

const PROSE_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

const HTML_EXTENSIONS = new Set([".html", ".htm"]);

const SAFE_IN_ANY_CONTEXT = /^[\p{L}\p{N} .,!?;:()\-–—’…%/@#+*=]*$/u;

const SAFE_IN_YAML = /^[\p{L}\p{N} .,!?()\u2013\u2014\u2019\u2026]*$/u;

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

/**
 * How the text around a match is written.
 * - `string`: the whole of a quoted JavaScript or JSON string; `quote` is its delimiter.
 * - `attribute`: the whole of a quoted attribute value; `quote` is its delimiter.
 * - `markup`: the whole text between two tags; `expressions` is true when the
 *   file is not plain HTML, so braces and backticks could be read as code.
 * - `prose`: words in a Markdown or plain-text file.
 * - `partial`: part of something larger, or quoted in a language Editdesk does
 *   not encode for; needs a person to confirm. `yaml` narrows what may be written.
 * @typedef {{ kind: "string", quote: string } | { kind: "attribute", quote: string } | { kind: "markup", expressions: boolean } | { kind: "prose" } | { kind: "partial", yaml: boolean }} SourceContext
 */

/**
 * One place in a source file where the searched text was found.
 * @typedef {{ start: number, end: number, context: SourceContext }} SourceMatch
 */

/**
 * Splits text into words the way source code wraps it.
 * @param {string} text On-screen text.
 * @returns {string[]} Its words; empty for blank text.
 */
export function splitWords(text) {
  return text.split(SOURCE_WHITESPACE).filter((word) => word !== "");
}

/**
 * Builds the pattern that finds on-screen text in source code, whatever the
 * line wrapping and whichever spelling special characters were given.
 * @param {string} text On-screen text; must contain at least one word.
 * @returns {RegExp} A global pattern.
 */
export function buildSearchPattern(text) {
  const words = splitWords(text).map((word) =>
    [...word].map(spellingsPattern).join(""),
  );
  return new RegExp(words.join("[ \\t\\r\\n\\f]+"), "gu");
}

/**
 * Finds every place the text appears in one source file.
 * @param {string} source The file's contents.
 * @param {string} extension The file's extension, with its dot, lower case.
 * @param {string} text On-screen text; must contain at least one word.
 * @returns {SourceMatch[]} Matches, in file order, excluding ones inside a longer word.
 */
export function findInSource(source, extension, text) {
  /** @type {SourceMatch[]} */
  const matches = [];
  for (const found of source.matchAll(buildSearchPattern(text))) {
    const start = found.index;
    const end = start + found[0].length;
    const context = classifyContext(source, extension, start, end);
    if (context.kind === "partial" && touchesWord(source, start, end)) {
      continue;
    }
    matches.push({ start, end, context });
  }
  return matches;
}

/**
 * Says why replacement text cannot be written into a context, if it cannot.
 * @param {SourceContext} context Where the text will be written.
 * @param {string} newText The replacement on-screen text.
 * @param {boolean} keepsLineBreaks True when the page shows the line breaks of the text in this element.
 * @returns {"unsafe-characters" | "line-break-not-shown" | null} Null when the text can be written.
 */
export function whyNotWritable(context, newText, keepsLineBreaks) {
  if (context.kind === "partial") {
    const safe = context.yaml ? SAFE_IN_YAML : SAFE_IN_ANY_CONTEXT;
    return safe.test(newText) ? null : "unsafe-characters";
  }
  const isWrittenAsNewline =
    context.kind === "string" || context.kind === "attribute";
  return isWrittenAsNewline && newText.includes(LINE_BREAK) && !keepsLineBreaks
    ? "line-break-not-shown"
    : null;
}

/**
 * Rewrites one match so it shows the new text, keeping the original spelling
 * and line wrapping of every word the edit did not change.
 * @param {string} source The file's contents.
 * @param {SourceMatch} match A match from {@link findInSource} on this source.
 * @param {string} oldText The on-screen text that was searched for.
 * @param {string} newText The on-screen text to show instead.
 * @returns {string} The file's new contents.
 */
export function rewriteMatch(source, match, oldText, newText) {
  const rawPieces = source
    .slice(match.start, match.end)
    .split(/([ \t\r\n\f]+)/);
  const oldWords = splitWords(oldText);
  const newWords = splitWords(newText);

  let sharedStart = 0;
  while (
    sharedStart < Math.min(oldWords.length, newWords.length) &&
    oldWords[sharedStart] === newWords[sharedStart]
  ) {
    sharedStart += 1;
  }
  let sharedEnd = 0;
  while (
    sharedEnd < Math.min(oldWords.length, newWords.length) - sharedStart &&
    oldWords[oldWords.length - 1 - sharedEnd] ===
      newWords[newWords.length - 1 - sharedEnd]
  ) {
    sharedEnd += 1;
  }

  const keptStart = rawPieces.slice(0, Math.max(0, sharedStart * 2 - 1));
  const keptEnd =
    sharedEnd === 0
      ? []
      : rawPieces.slice(rawPieces.length - (sharedEnd * 2 - 1));
  const middle = newWords
    .slice(sharedStart, newWords.length - sharedEnd)
    .map((word) => encodeForContext(word, match.context));

  const separatorBefore = rawPieces[sharedStart * 2 - 1] ?? " ";
  const separatorAfter = rawPieces[rawPieces.length - sharedEnd * 2] ?? " ";
  const parts = [keptStart.join("")];
  if (middle.length > 0) {
    parts.push(keptStart.length > 0 ? separatorBefore : "", middle.join(" "));
  }
  if (keptEnd.length > 0) {
    const needsSeparator = keptStart.length > 0 || middle.length > 0;
    parts.push(needsSeparator ? separatorAfter : "", keptEnd.join(""));
  }
  return (
    source.slice(0, match.start) + parts.join("") + source.slice(match.end)
  );
}

/**
 * Encodes on-screen text for the place it will be written.
 * @param {string} text On-screen text.
 * @param {SourceContext} context Where it will be written.
 * @returns {string} Source text.
 */
export function encodeForContext(text, context) {
  if (context.kind === "string") {
    const escaped = text
      .replaceAll("\\", "\\\\")
      .replaceAll(context.quote, `\\${context.quote}`)
      .replaceAll("\n", "\\n")
      .replaceAll(LINE_BREAK, "\\n");
    return context.quote === "`" ? escaped.replaceAll("${", "\\${") : escaped;
  }
  if (context.kind === "attribute") {
    return encodeMarkup(text, true)
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;")
      .replaceAll(LINE_BREAK, "&#10;");
  }
  if (context.kind === "markup") {
    return encodeMarkup(text, context.expressions).replaceAll(
      LINE_BREAK,
      context.expressions ? "<br />" : "<br>",
    );
  }
  if (context.kind === "prose") {
    return text.replaceAll("<", "&lt;").replaceAll(LINE_BREAK, "<br>");
  }
  return text;
}

/**
 * @param {string} text
 * @param {boolean} expressions Also encode what a script or template engine would read as code.
 */
function encodeMarkup(text, expressions) {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\u00a0", "&nbsp;");
  return expressions
    ? escaped
        .replaceAll("{", "&#123;")
        .replaceAll("}", "&#125;")
        .replaceAll("`", "&#96;")
        .replaceAll("\\", "&#92;")
    : escaped;
}

/**
 * @param {string} character
 */
function spellingsPattern(character) {
  const spellings = ALTERNATIVE_SPELLINGS[character];
  if (!spellings) {
    return escapeForPattern(character);
  }
  return `(?:${spellings.map(escapeForPattern).join("|")})`;
}

/**
 * @param {string} literal
 */
function escapeForPattern(literal) {
  return literal.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} source
 * @param {string} extension
 * @param {number} start
 * @param {number} end
 * @returns {SourceContext}
 */
function classifyContext(source, extension, start, end) {
  if (PROSE_EXTENSIONS.has(extension)) {
    return touchesWord(source, start, end)
      ? { kind: "partial", yaml: false }
      : { kind: "prose" };
  }
  const quote = source[start - 1];
  const isWholeQuoted =
    QUOTES.has(quote) && source[end] === quote && opensQuote(source, start - 1);
  if (isWholeQuoted && EXTENSIONS_WITH_JAVASCRIPT_STRINGS.has(extension)) {
    return source[start - 2] === "="
      ? { kind: "attribute", quote }
      : { kind: "string", quote };
  }
  const previous = source.slice(0, start).trimEnd().at(-1);
  const next = source.slice(end).trimStart()[0];
  if (previous === ">" && next === "<") {
    return { kind: "markup", expressions: !HTML_EXTENSIONS.has(extension) };
  }
  return { kind: "partial", yaml: YAML_EXTENSIONS.has(extension) };
}

/**
 * Says whether the quote at an offset opens a string: an odd number of that
 * quote, unescaped, stands on its line up to and including it.
 * @param {string} source
 * @param {number} quoteOffset
 */
function opensQuote(source, quoteOffset) {
  const quote = source[quoteOffset];
  const lineStart = source.lastIndexOf("\n", quoteOffset) + 1;
  let count = 0;
  for (let offset = lineStart; offset <= quoteOffset; offset += 1) {
    if (source[offset] === quote && source[offset - 1] !== "\\") {
      count += 1;
    }
  }
  return count % 2 === 1;
}

/**
 * @param {string} source
 * @param {number} start
 * @param {number} end
 */
function touchesWord(source, start, end) {
  const before = source[start - 1] ?? "";
  const after = source[end] ?? "";
  return (
    (WORD_CHARACTER.test(before) && WORD_CHARACTER.test(source[start])) ||
    (WORD_CHARACTER.test(after) && WORD_CHARACTER.test(source[end - 1]))
  );
}
