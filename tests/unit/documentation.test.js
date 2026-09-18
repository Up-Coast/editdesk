import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { strings } from "../../src/client/strings.js";
import { messages } from "../../src/messages.js";

/**
 * @param {string} page A path relative to the repository root.
 */
function readPage(page) {
  return readFile(new URL(`../../${page}`, import.meta.url), "utf8");
}

test("criterion: every message that says an edit was not saved has a troubleshooting section", async () => {
  const troubleshooting = await readPage("docs/troubleshooting.md");
  const problems = Object.entries(strings).filter(([name]) =>
    name.startsWith("problem"),
  );
  assert.ok(problems.length >= 6);
  for (const [name, sentence] of problems) {
    const opening = String(sentence).split(/[,.]/)[0];
    assert.ok(
      troubleshooting.includes(`## "${opening}`),
      `docs/troubleshooting.md has no section for ${name}: "${opening}"`,
    );
  }
});

test("criterion: every command-line option in the help is in the command reference", async () => {
  const reference = await readPage("docs/reference.md");
  const options = messages.usage.match(/--[a-z-]+/g) ?? [];
  assert.ok(options.length >= 5);
  for (const option of new Set(options)) {
    assert.ok(
      reference.includes(`\`${option}`),
      `docs/reference.md does not list ${option}`,
    );
  }
});

test("criterion: the documented Node.js version is the one the package requires", async () => {
  const required = JSON.parse(
    await readPage("package.json"),
  ).engines.node.replace(">=", "");
  const [major, minor] = required.split(".");
  for (const page of ["README.md", "docs/index.md", "CONTRIBUTING.md"]) {
    assert.ok(
      (await readPage(page)).includes(`${major}.${minor} or newer`),
      `${page} does not state Node.js ${major}.${minor}`,
    );
  }
});
