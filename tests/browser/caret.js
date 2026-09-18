/**
 * Starts editing an element with the caret after the last character of its
 * own text.
 * @param {import("@playwright/test").Locator} locator
 */
export async function editAtEnd(locator) {
  await locator.click();
  await locator.evaluate((element) => {
    const lastText = [...element.childNodes].findLast(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    getSelection()?.collapse(
      lastText ?? element,
      lastText?.nodeValue?.length ?? 0,
    );
  });
}
