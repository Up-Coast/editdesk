import { expect, test } from "@playwright/test";
import { editAtEnd } from "./caret.js";
import { startFixtureSite } from "./site.js";

/** @type {Awaited<ReturnType<typeof startFixtureSite>>} */
let site;

test.beforeEach(async ({ page }) => {
  site = await startFixtureSite();
  await page.goto(site.url);
  await expect(page.locator("editdesk-toolbar")).toBeAttached();
});

test.afterEach(async () => {
  await site.stop();
});

/**
 * @param {import("@playwright/test").Page} page
 */
function status(page) {
  return page.locator("editdesk-toolbar").getByRole("status");
}

test("criterion: text is edited in place, in the page's own typography", async ({
  page,
}) => {
  const headline = page.locator("#headline");
  const before = await headline.evaluate((element) => {
    const style = getComputedStyle(element);
    return [
      style.fontFamily,
      style.fontSize,
      style.textTransform,
      style.letterSpacing,
    ];
  });
  await headline.click();
  await expect(headline).toHaveAttribute("contenteditable", "plaintext-only");
  const during = await headline.evaluate((element) => {
    const style = getComputedStyle(element);
    return [
      style.fontFamily,
      style.fontSize,
      style.textTransform,
      style.letterSpacing,
    ];
  });
  expect(during).toEqual(before);
});

test("criterion: Enter saves the edit to the file and changes nothing else in it", async ({
  page,
}) => {
  await editAtEnd(page.locator("#headline"));
  await page.keyboard.type(" & <fast>");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(/Saved to index\.html:\d+/);
  const expected = (await site.original("index.html")).replace(
    "baked every morning",
    "baked every morning &amp; &lt;fast&gt;",
  );
  expect(await site.read("index.html")).toBe(expected);
  await expect(page.locator("#headline")).not.toHaveAttribute(
    "contenteditable",
  );
});

test("criterion: Esc puts the text back and writes nothing", async ({
  page,
}) => {
  await page.locator("#headline").click();
  await page.keyboard.type("Oops ");
  await page.keyboard.press("Escape");
  await expect(page.locator("#headline")).toHaveText(
    "Fresh bread, baked every morning",
  );
  expect(await site.read("index.html")).toBe(await site.original("index.html"));
});

test("criterion: clicking formatted text edits the whole paragraph and keeps the formatting", async ({
  page,
}) => {
  await editAtEnd(page.locator("#intro strong"));
  await expect(page.locator("#intro")).toHaveAttribute(
    "contenteditable",
    "plaintext-only",
  );
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(/Saved/);
  expect(await site.read("index.html")).toBe(
    (await site.original("index.html")).replace(
      "<strong>by hand</strong>",
      "<strong>by hand!</strong>",
    ),
  );
});

test("criterion: a selection that spans formatting cannot delete the formatting", async ({
  page,
}) => {
  await page.locator("#intro").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(page.locator("#intro strong")).toHaveText("by hand");
  await expect(
    page.locator("editdesk-toolbar").getByRole("alertdialog"),
  ).toContainText("remove formatting");
  await page.keyboard.press("Escape");
  expect(await site.read("index.html")).toBe(await site.original("index.html"));
});

test("criterion: deleting every character of a bold keeps the bold element in the file", async ({
  page,
}) => {
  await page.locator("#intro strong").click();
  await page.locator("#intro strong").evaluate((element) => {
    getSelection()?.selectAllChildren(element);
  });
  await page.keyboard.press("Backspace");
  await page.keyboard.type("with care");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(/Saved/);
  expect(await site.read("index.html")).toContain("<strong>with care</strong>");
});

test("criterion: in Edit mode links do not navigate and buttons do not fire", async ({
  page,
}) => {
  await page.getByRole("link", { name: "About" }).click();
  await page.locator("#order").click();
  await expect(page).toHaveURL(site.url + "/");
  await expect(page).toHaveTitle("Harbour Bakery");
  await expect(page.locator("#order")).toHaveAttribute(
    "contenteditable",
    "plaintext-only",
  );
});

test("criterion: in Browse mode the page works normally, and the mode survives navigation", async ({
  page,
}) => {
  const toolbar = page.locator("editdesk-toolbar");
  await toolbar.getByRole("button", { name: "Browse" }).click();
  await page.locator("#order").click();
  await expect(page).toHaveTitle("clicked");
  await page.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(site.url + "/about/");
  await expect(
    page.locator("editdesk-toolbar").getByRole("button", { name: "Browse" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("criterion: text written by a script is saved to the script that holds it", async ({
  page,
}) => {
  await editAtEnd(page.locator("#generated"));
  await page.keyboard.type(" today");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(/Saved to app\.js:1/);
  expect(await site.read("app.js")).toContain(
    'const opening = "Open from seven until the bread runs out today";',
  );
  expect(await site.read("index.html")).toBe(await site.original("index.html"));
});

test("criterion: Undo and Redo rewrite the file and the page", async ({
  page,
}) => {
  const toolbar = page.locator("editdesk-toolbar");
  await editAtEnd(page.locator("#headline"));
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(/Saved/);

  await toolbar.getByRole("button", { name: "Undo" }).click();
  await expect(status(page)).toHaveText("Undone");
  await expect(page.locator("#headline")).toHaveText(
    "Fresh bread, baked every morning",
  );
  expect(await site.read("index.html")).toBe(await site.original("index.html"));

  await toolbar.getByRole("button", { name: "Redo" }).click();
  await expect(status(page)).toHaveText("Redone");
  await expect(page.locator("#headline")).toHaveText(
    "Fresh bread, baked every morning!",
  );
  expect(await site.read("index.html")).toContain("baked every morning!</h1>");
});

test("criterion: clicking away saves the edit", async ({ page }) => {
  await editAtEnd(page.locator("#headline"));
  await page.keyboard.type("?");
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await expect(status(page)).toHaveText(/Saved/);
  expect(await site.read("index.html")).toContain("baked every morning?</h1>");
});

test("criterion: pasted rich text arrives as plain text", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() =>
    navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob(["<b>Rich</b> <i>paste</i>"], {
          type: "text/html",
        }),
        "text/plain": new Blob(["Rich paste"], { type: "text/plain" }),
      }),
    ]),
  );
  await page.locator("#headline").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(/Saved/);
  expect(await site.read("index.html")).toContain(
    '<h1 id="headline">Rich paste</h1>',
  );
});

test("criterion: a space can be typed into a button's label", async ({
  page,
}) => {
  await editAtEnd(page.locator("#order"));
  await page.keyboard.type(" right now");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(/Saved/);
  expect(await site.read("index.html")).toContain(
    ">Order for pickup right now</button>",
  );
});

test("criterion: unclosed list items are editable", async ({ page }) => {
  await page.getByText("Sourdough").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Focaccia");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(/Saved/);
  const saved = await site.read("index.html");
  expect(saved).toContain("<li>Focaccia");
  expect(saved).toContain("<li>Rye &amp; caraway");
});

test("criterion: text typed at the end of a link stays inside the link", async ({
  page,
}) => {
  await editAtEnd(page.locator("#intro a"));
  await page.keyboard.type(" in every loaf");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(/Saved/);
  expect(await site.read("index.html")).toBe(
    (await site.original("index.html")).replace(
      ">shows</a>",
      ">shows in every loaf</a>",
    ),
  );
});

test("criterion: clicking other text saves the current edit and starts editing the new text", async ({
  page,
}) => {
  await editAtEnd(page.locator("#headline"));
  await page.keyboard.type("!");
  await page.locator("#intro").click({ position: { x: 10, y: 10 } });
  await expect(page.locator("#intro")).toHaveAttribute(
    "contenteditable",
    "plaintext-only",
  );
  await expect(page.locator("#headline")).not.toHaveAttribute(
    "contenteditable",
  );
  await expect(status(page)).toHaveText(/Saved/);
  await page.keyboard.type("Hi. ");
  await page.keyboard.press("Enter");
  await expect(page.locator("#intro")).toContainText("Hi. ");
  await expect.poll(() => site.read("index.html")).toContain("Hi. ");
  expect(await site.read("index.html")).toContain("baked every morning!</h1>");
});

test("criterion: double-clicking a word selects it for replacement, in one gesture", async ({
  page,
}) => {
  await page.locator("#about-link").dblclick();
  await page.keyboard.type("Story");
  await page.locator("#headline").click();
  await expect(page.locator("#headline")).toHaveAttribute(
    "contenteditable",
    "plaintext-only",
  );
  await expect(status(page)).toHaveText(/Saved/);
  expect(await site.read("index.html")).toBe(
    (await site.original("index.html")).replace(">About</a>", ">Story</a>"),
  );
});
