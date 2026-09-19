/**
 * How a line break and a paragraph break travel inside a piece of text.
 *
 * Text on a page has no character for "line break here": the page uses a
 * `br` element, and source code uses `\n`, `<br>` or `<br />`. Unicode has
 * characters that mean exactly this and appear in no ordinary copy, so an
 * edit carries them, and each writer turns them into its own spelling.
 */

/** Stands for a line break inside a piece of text. */
export const LINE_BREAK = " ";

/** Stands for the end of one paragraph and the start of the next. */
export const PARAGRAPH_BREAK = " ";

/**
 * Says whether a piece of text holds a line or paragraph break.
 * @param {string} text
 * @returns {boolean}
 */
export function hasBreak(text) {
  return text.includes(LINE_BREAK) || text.includes(PARAGRAPH_BREAK);
}
