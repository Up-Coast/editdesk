/**
 * Retakes the screenshots used in the documentation, from the real editor
 * running on the fixture site. Run with: node scripts/docs-screenshots.js
 */

import { chromium } from "@playwright/test";
import { mkdtemp, cp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../src/server/server.js";

const IMAGES = fileURLToPath(new URL("../docs/images/", import.meta.url));
const FIXTURE_SITE = fileURLToPath(
  new URL("../tests/fixtures/site", import.meta.url),
);

const folder = await realpath(
  await mkdtemp(path.join(os.tmpdir(), "editdesk-docs-")),
);
await cp(FIXTURE_SITE, folder, { recursive: true });
await writeFile(
  path.join(folder, "strings.js"),
  'export const hours = {\n  banner: "Open daily",\n  footer: "Open daily",\n};\n',
);
const server = await startServer({ upstream: null, root: folder, port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 900, height: 620 },
  deviceScaleFactor: 2,
});

await page.goto(server.url);
await page.locator("#headline").click();
await page.keyboard.press("ControlOrMeta+ArrowDown");
await page.keyboard.type(", and at noon");
await page.screenshot({ path: path.join(IMAGES, "editing.png") });

await page.keyboard.press("Enter");
await page.locator("editdesk-toolbar").getByText("Saved to").waitFor();
await page.screenshot({ path: path.join(IMAGES, "saved.png") });

await page.evaluate(() => {
  const generated = document.getElementById("generated");
  if (generated) {
    generated.textContent = "Open daily";
  }
});
await page.locator("#generated").click();
await page.keyboard.press("ControlOrMeta+ArrowDown");
await page.keyboard.type(" from seven");
await page.keyboard.press("Enter");
await page.locator("editdesk-toolbar").getByRole("alertdialog").waitFor();
await page.screenshot({ path: path.join(IMAGES, "choose.png") });

await browser.close();
await server.close();
await rm(folder, { recursive: true, force: true });
