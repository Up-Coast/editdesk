/**
 * Finding on-screen text inside source code, and writing replacement text in
 * the spelling the surrounding code needs.
 *
 * The same sentence is spelled differently depending on where it lives:
 * `Don't` on screen can be `Don\'t` in a JavaScript string or `Don&apos;t` in
 * markup. The search accepts every common spelling; the replacement uses the
 * one spelling that is correct for the place the text was found.
 */

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

const MARKUP_WITH_EXPRESSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mdx",
  ".vue",
  ".svelte",
  ".astro",
]);

const PROSE_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

const HTML_EXTENSIONS = new Set([".html", ".htm"]);

const SAFE_IN_ANY_CONTEXT = /^[\p{L}\p{N} .,!?;:()\-–—’…%/@#+*=]*$/u;

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

/**
 * How the text around a match is written.
 * - `string`: the whole of a quoted string; `quote` is its delimiter.
 * - `markup`: the whole text between two tags.
 * - `prose`: words in a Markdown or plain-text file.
 * - `partial`: part of something larger; needs a person to confirm.
 * @typedef {{ kind: "string", quote: string } | { kind: "markup", expressions: boolean } | { kind: "prose" } | { kind: "partial" }} SourceContext
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
 * Says whether replacement text can be written into a context safely.
 * @param {SourceContext} context Where the text will be written.
 * @param {string} newText The replacement on-screen text.
 * @returns {boolean} False when the characters cannot be written there with certainty.
 */
export function canWrite(context, newText) {
  return context.kind === "partial" ? SAFE_IN_ANY_CONTEXT.test(newText) : true;
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
      .replaceAll("\n", "\\n");
    return context.quote === "`" ? escaped.replaceAll("${", "\\${") : escaped;
  }
  if (context.kind === "markup") {
    const escaped = text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\u00a0", "&nbsp;");
    return context.expressions
      ? escaped.replaceAll("{", "&#123;").replaceAll("}", "&#125;")
      : escaped;
  }
  return text;
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
  return literal.replaceAll(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
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
      ? { kind: "partial" }
      : { kind: "prose" };
  }
  const before = source[start - 1];
  if (
    QUOTES.has(before) &&
    source[end] === before &&
    !HTML_EXTENSIONS.has(extension)
  ) {
    return { kind: "string", quote: before };
  }
  const previous = source.slice(0, start).trimEnd().at(-1);
  const next = source.slice(end).trimStart()[0];
  if (previous === ">" && next === "<") {
    return {
      kind: "markup",
      expressions: MARKUP_WITH_EXPRESSIONS.has(extension),
    };
  }
  return { kind: "partial" };
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
