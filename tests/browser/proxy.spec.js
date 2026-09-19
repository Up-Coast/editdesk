import { expect, test } from "@playwright/test";
import { editAtEnd } from "./caret.js";
import { once } from "node:events";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { startServer } from "../../src/server/server.js";

const STRINGS = `export const site = {
  headline: "Coaching that doesn't waste your time",
  nav: { home: "Dashboard" },
  card: { title: "Dashboard" },
  lede: "Learn to lead. Build with care.",
};
`;

/**
 * Starts a stand-in for a framework's development server: it renders a page
 * from a strings file, the way a real app keeps its copy out of its markup.
 * @param {boolean} canSave Whether Editdesk is given the project folder.
 */
async function startApp(canSave) {
  const folder = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "editdesk-app-")),
  );
  const stringsFile = path.join(folder, "strings.ts");
  await writeFile(stringsFile, STRINGS);
  const app = http.createServer(async (request, response) => {
    const source = await readFile(stringsFile, "utf8");
    const value = (/** @type {string} */ key) =>
      JSON.parse(
        source.match(new RegExp(`${key}: ("(?:[^"\\\\]|\\\\.)*")`))?.[1] ??
          '""',
      );
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    const url = new URL(request.url ?? "/", "http://app");
    response.end(`<!doctype html><html><head><title>App</title>
      <style>.keeps-lines { white-space: pre-line; }</style></head><body>
      <nav><a id="nav" href="/">${value("home")}</a></nav>
      <h1 id="headline">${value("headline")}</h1>
      <p id="lede" class="${url.searchParams.has("lines") ? "keeps-lines" : ""}">${value("lede")}</p>
      <p id="user">Signed in as ${"Abbey"}</p>
    </body></html>`);
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const { port } = /** @type {import("node:net").AddressInfo} */ (
    app.address()
  );
  const editdesk = await startServer({
    upstream: new URL(`http://127.0.0.1:${port}`),
    root: canSave ? folder : null,
    port: 0,
  });
  return {
    url: editdesk.url,
    readStrings: () => readFile(stringsFile, "utf8"),
    async stop() {
      await editdesk.close();
      app.closeAllConnections();
      app.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
}

test("criterion: copy rendered by an app is saved to the strings file it came from", async ({
  page,
}) => {
  const app = await startApp(true);
  await page.goto(app.url);
  await editAtEnd(page.locator("#headline"));
  await page.keyboard.type(' or "money"');
  await page.keyboard.press("Enter");
  await expect(page.locator("editdesk-toolbar").getByRole("status")).toHaveText(
    "Saved to strings.ts:2",
  );
  expect(await app.readStrings()).toBe(
    STRINGS.replace("your time", 'your time or \\"money\\"'),
  );
  await page.reload();
  await expect(page.locator("#headline")).toHaveText(
    'Coaching that doesn\'t waste your time or "money"',
  );
  await app.stop();
});

test("criterion: when the text is in several places the person chooses, and cancel puts the page back", async ({
  page,
}) => {
  const app = await startApp(true);
  await page.goto(app.url);
  const panel = page.locator("editdesk-toolbar").getByRole("alertdialog");

  await editAtEnd(page.locator("#nav"));
  await page.keyboard.type(" home");
  await page.keyboard.press("Enter");
  await expect(panel).toContainText("more than one place");
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#nav")).toHaveText("Dashboard");
  expect(await app.readStrings()).toBe(STRINGS);

  await editAtEnd(page.locator("#nav"));
  await page.keyboard.type(" home");
  await page.keyboard.press("Enter");
  await panel.getByRole("button", { name: /strings\.ts:3/ }).click();
  await expect(page.locator("editdesk-toolbar").getByRole("status")).toHaveText(
    "Saved to strings.ts:3",
  );
  expect(await app.readStrings()).toBe(
    STRINGS.replace('home: "Dashboard"', 'home: "Dashboard home"'),
  );
  await app.stop();
});

test("criterion: text the source does not contain is put back with an explanation", async ({
  page,
}) => {
  const app = await startApp(true);
  await page.goto(app.url);
  await editAtEnd(page.locator("#user"));
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await expect(
    page.locator("editdesk-toolbar").getByRole("alertdialog"),
  ).toContainText("not written anywhere in your source files");
  await expect(page.locator("#user")).toHaveText("Signed in as Abbey");
  expect(await app.readStrings()).toBe(STRINGS);
  await app.stop();
});

test("criterion: on a site with nowhere to save, edits are collected into a change list", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const app = await startApp(false);
  await page.goto(app.url);
  const toolbar = page.locator("editdesk-toolbar");

  await editAtEnd(page.locator("#headline"));
  await page.keyboard.type(", ever");
  await page.keyboard.press("Enter");
  await editAtEnd(page.locator("#headline"));
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await expect(toolbar.getByRole("status")).toHaveText(
    "Added to the change list",
  );

  await toolbar.getByRole("button", { name: "Copy changes (1)" }).click();
  await expect(toolbar.getByRole("status")).toHaveText("Change list copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Page: /\n\n- Coaching that doesn't waste your time\n+ Coaching that doesn't waste your time, ever!",
  );
  expect(await app.readStrings()).toBe(STRINGS);
  await app.stop();
});

test("criterion: a question left unanswered puts its text back when another edit starts", async ({
  page,
}) => {
  const app = await startApp(true);
  await page.goto(app.url);
  await editAtEnd(page.locator("#nav"));
  await page.keyboard.type(" home");
  await page.keyboard.press("Enter");
  await expect(
    page.locator("editdesk-toolbar").getByRole("alertdialog"),
  ).toContainText("more than one place");
  await page.locator("#headline").click();
  await expect(page.locator("#nav")).toHaveText("Dashboard");
  await expect(
    page.locator("editdesk-toolbar").getByRole("alertdialog"),
  ).toBeHidden();
  expect(await app.readStrings()).toBe(STRINGS);
  await app.stop();
});

test("criterion: a line break in an app's string is refused when the page would not show it", async ({
  page,
}) => {
  const app = await startApp(true);
  await page.goto(app.url);
  await page.locator("#lede").click();
  await page.locator("#lede").evaluate((element) => {
    getSelection()?.collapse(
      /** @type {Text} */ (element.firstChild),
      "Learn to lead.".length,
    );
  });
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Enter");
  await expect(
    page.locator("editdesk-toolbar").getByRole("alertdialog"),
  ).toContainText("does not show line breaks");
  await expect(page.locator("#lede br")).toHaveCount(0);
  expect(await app.readStrings()).toBe(STRINGS);
  await app.stop();
});

test("criterion: where the page shows line breaks, one is saved into the string and the page reloads to match", async ({
  page,
}) => {
  const app = await startApp(true);
  await page.goto(`${app.url}/?lines`);
  await page.locator("#lede").click();
  await page.locator("#lede").evaluate((element) => {
    getSelection()?.collapse(
      /** @type {Text} */ (element.firstChild),
      "Learn to lead.".length,
    );
  });
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Enter");
  await expect(page.locator("editdesk-toolbar").getByRole("status")).toHaveText(
    /Saved to strings\.ts/,
  );
  expect(await app.readStrings()).toBe(
    STRINGS.replace("Learn to lead. Build", "Learn to lead.\\nBuild"),
  );
  await expect(page.locator("#lede")).toHaveText(
    /Learn to lead\.\s+Build with care\./,
  );

  await editAtEnd(page.locator("#lede"));
  await page.keyboard.type(" Always.");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => app.readStrings())
    .toContain('"Learn to lead.\\nBuild with care. Always."');
  await app.stop();
});
