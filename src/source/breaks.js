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
 * Returns the breaks of a piece of text, in order, without the words. Two
 * texts with the same breaks have the same structure.
 * @param {string} text
 * @returns {string}
 */
export function breaksIn(text) {
  return [...text]
    .filter(
      (character) => character === LINE_BREAK || character === PARAGRAPH_BREAK,
    )
    .join("");
}
