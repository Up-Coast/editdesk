import assert from "node:assert/strict";
import { chmod, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  createEditService,
  parseEditRequest,
} from "../../src/source/edit-service.js";
import { describeHtml } from "../../src/source/html-document.js";
import { createProject } from "./temporary-project.js";

const PAGE = `<!doctype html><html><head></head><body><h1>Welcome</h1><p id="made"></p><script src="app.js"></script></body></html>`;

/**
 * Returns the number the served page gives the element showing this text.
 * @param {string} source
 * @param {string} text
 */
function numberOf(source, text) {
  const found = describeHtml(source).elements.find((element) =>
    element.slots.some((slot) => slot.text === text),
  );
  assert.ok(found, `no element shows ${text}`);
  return found.id;
}

/**
 * @param {Record<string, string>} files
 */
async function setUp(files) {
  const project = await createProject(files);
  const service = createEditService({
    root: project.root,
    resolvePageFile: async (page) => (page === "/" ? "index.html" : null),
  });
  return { project, service };
}

/**
 * @param {Partial<import("../../src/source/edit-service.js").EditRequest>} fields
 * @returns {import("../../src/source/edit-service.js").EditRequest}
 */
function edit(fields) {
  return {
    page: "/",
    element: null,
    slot: 0,
    oldText: "",
    newText: "",
    location: null,
    mappedOnly: false,
    ...fields,
  };
}

test("criterion: a numbered element of an HTML page is saved to that page's file", async (t) => {
  const { project, service } = await setUp({
    "index.html": PAGE,
    "other.html": PAGE,
  });
  t.after(project.remove);
  const outcome = await service.applyEdit(
    edit({
      element: numberOf(PAGE, "Welcome"),
      oldText: "Welcome",
      newText: "Hello",
    }),
  );
  assert.equal(outcome.outcome, "saved");
  assert.equal(
    await project.read("index.html"),
    PAGE.replace("Welcome", "Hello"),
  );
  assert.equal(await project.read("other.html"), PAGE);
});

test("criterion: when the page no longer matches the file, the numbered element is not trusted", async (t) => {
  const { project, service } = await setUp({ "index.html": PAGE });
  t.after(project.remove);
  const outcome = await service.applyEdit(
    edit({
      element: numberOf(PAGE, "Welcome"),
      oldText: "Stale text",
      newText: "Hello",
    }),
  );
  assert.deepEqual(outcome, { outcome: "not-found" });
  assert.equal(await project.read("index.html"), PAGE);
});

test("criterion: text found in exactly one place in the source is saved there", async (t) => {
  const { project, service } = await setUp({
    "index.html": PAGE,
    "app.js": `made.textContent = "Baked today";\n`,
  });
  t.after(project.remove);
  const outcome = await service.applyEdit(
    edit({
      element: numberOf(PAGE, "Welcome") + 1,
      oldText: "Baked today",
      newText: "Baked at dawn",
    }),
  );
  assert.deepEqual(outcome, {
    outcome: "saved",
    file: "app.js",
    line: 1,
    location: { file: "app.js", start: 20 },
  });
  assert.equal(
    await project.read("app.js"),
    `made.textContent = "Baked at dawn";\n`,
  );
});

test("criterion: text found in several places is offered as a choice and nothing is written", async (t) => {
  const files = {
    "src/strings/admin.ts": `export const admin = { title: "Dashboard" };\n`,
    "src/strings/portal.ts": `export const portal = {\n  title: "Dashboard",\n};\n`,
  };
  const { project, service } = await setUp(files);
  t.after(project.remove);
  const outcome = await service.applyEdit(
    edit({ oldText: "Dashboard", newText: "Home" }),
  );
  assert.equal(outcome.outcome, "choose");
  assert.ok(outcome.outcome === "choose");
  assert.equal(outcome.reason, "several");
  assert.deepEqual(
    outcome.candidates.map(({ file, line }) => [file, line]),
    [
      ["src/strings/admin.ts", 1],
      ["src/strings/portal.ts", 2],
    ],
  );
  assert.equal(
    await project.read("src/strings/admin.ts"),
    files["src/strings/admin.ts"],
  );

  const picked = outcome.candidates[1];
  const saved = await service.applyEdit(
    edit({
      oldText: "Dashboard",
      newText: "Home",
      location: { file: picked.file, start: picked.start },
    }),
  );
  assert.equal(saved.outcome, "saved");
  assert.equal(
    await project.read("src/strings/admin.ts"),
    files["src/strings/admin.ts"],
  );
  assert.equal(
    await project.read("src/strings/portal.ts"),
    `export const portal = {\n  title: "Home",\n};\n`,
  );
});

test("criterion: text that is only part of a larger string is confirmed before it is written", async (t) => {
  const { project, service } = await setUp({
    "app.js": `const greeting = "Hello there, " + name;\n`,
  });
  t.after(project.remove);
  const outcome = await service.applyEdit(
    edit({ oldText: "Hello there", newText: "Hi" }),
  );
  assert.ok(outcome.outcome === "choose");
  assert.equal(outcome.reason, "confirm");

  const unsafe = await service.applyEdit(
    edit({
      oldText: "Hello there",
      newText: 'Say "hi"',
      location: { file: "app.js", start: outcome.candidates[0].start },
    }),
  );
  assert.deepEqual(unsafe, { outcome: "refused", reason: "unsafe-characters" });
  assert.equal(
    await project.read("app.js"),
    `const greeting = "Hello there, " + name;\n`,
  );
});

test("criterion: text that is nowhere in the source is reported, not guessed at", async (t) => {
  const { project, service } = await setUp({
    "app.js": `const a = "Something else";\n`,
  });
  t.after(project.remove);
  assert.deepEqual(
    await service.applyEdit(
      edit({ oldText: "From the database", newText: "x" }),
    ),
    { outcome: "not-found" },
  );
});

test("criterion: dependencies, build output and hidden folders are never searched or written", async (t) => {
  const files = {
    "node_modules/lib/index.js": `export const label = "Buy now";\n`,
    "dist/app.js": `const label = "Buy now";\n`,
    ".next/cache.js": `const label = "Buy now";\n`,
    ".env": `LABEL="Buy now"\n`,
  };
  const { project, service } = await setUp(files);
  t.after(project.remove);
  assert.deepEqual(
    await service.applyEdit(edit({ oldText: "Buy now", newText: "Buy" })),
    {
      outcome: "not-found",
    },
  );
  for (const [file, contents] of Object.entries(files)) {
    assert.equal(await project.read(file), contents);
  }
});

test("criterion: a picked place outside the project's source files is refused", async (t) => {
  const { project, service } = await setUp({ "app.js": `const a = "Text";\n` });
  t.after(project.remove);
  for (const file of [
    "../outside.js",
    "/etc/hosts",
    ".env",
    "node_modules/x.js",
  ]) {
    assert.deepEqual(
      await service.applyEdit(
        edit({ oldText: "Text", newText: "New", location: { file, start: 0 } }),
      ),
      { outcome: "refused", reason: "changed-on-disk" },
    );
  }
});

test("criterion: two edits sent at once to the same file are both kept", async (t) => {
  const source = `<!doctype html><html><head></head><body><h1>One</h1><h2>Two</h2></body></html>`;
  const { project, service } = await setUp({ "index.html": source });
  t.after(project.remove);
  await Promise.all([
    service.applyEdit(
      edit({
        element: numberOf(source, "One"),
        oldText: "One",
        newText: "First heading",
      }),
    ),
    service.applyEdit(
      edit({
        element: numberOf(source, "Two"),
        oldText: "Two",
        newText: "Second heading",
      }),
    ),
  ]);
  assert.equal(
    await project.read("index.html"),
    source.replace("One", "First heading").replace("Two", "Second heading"),
  );
});

test("criterion: a malformed edit request is rejected", () => {
  const valid = edit({ oldText: "a", newText: "b" });
  assert.deepEqual(parseEditRequest(valid), valid);
  for (const broken of [
    null,
    "text",
    { ...valid, oldText: 5 },
    { ...valid, slot: -1 },
    { ...valid, slot: 1.5 },
    { ...valid, element: "1" },
    { ...valid, location: { file: 3, start: 0 } },
    { ...valid, newText: "x".repeat(100_001) },
  ]) {
    assert.equal(parseEditRequest(broken), null);
  }
});

test("criterion: a file is never seen empty or half written while it is saved, and keeps its permissions", async (t) => {
  const source = `<!doctype html><html><head></head><body><h1>Count 0</h1></body></html>`;
  const { project, service } = await setUp({ "index.html": source });
  t.after(project.remove);
  await chmod(path.join(project.root, "index.html"), 0o640);

  let saving = true;
  const observed = (async () => {
    const seen = new Set();
    while (saving) {
      seen.add((await project.read("index.html")).length > 0);
    }
    return seen;
  })();
  for (let count = 0; count < 40; count += 1) {
    await service.applyEdit(
      edit({
        element: numberOf(source, "Count 0"),
        oldText: `Count ${count}`,
        newText: `Count ${count + 1}`,
      }),
    );
  }
  saving = false;
  assert.deepEqual([...(await observed)], [true]);
  assert.equal(
    await project.read("index.html"),
    source.replace("Count 0", "Count 40"),
  );
  assert.equal(
    (await stat(path.join(project.root, "index.html"))).mode & 0o777,
    0o640,
  );
  assert.deepEqual(await readdir(project.root), ["index.html"]);
});

test("criterion: when choosing, the app's source is listed before its tests and documents", async (t) => {
  const { project, service } = await setUp({
    "docs/mockup.html": `<p>Find your way</p>`,
    "src/strings/home.ts": `export const home = { button: "Find your way" };\n`,
    "src/home.test.tsx": `expect(button).toHaveText("Find your way");\n`,
    "tests/home.spec.ts": `const label = "Find your way";\n`,
  });
  t.after(project.remove);
  const outcome = await service.applyEdit(
    edit({ oldText: "Find your way", newText: "Start" }),
  );
  assert.ok(outcome.outcome === "choose");
  assert.deepEqual(
    outcome.candidates.map((candidate) => candidate.file),
    [
      "src/strings/home.ts",
      "docs/mockup.html",
      "src/home.test.tsx",
      "tests/home.spec.ts",
    ],
  );
});

test("criterion: replaying an edit of a page's own file never falls through to other files", async (t) => {
  const { project, service } = await setUp({
    "index.html": PAGE,
    "other.js": `export const t = "Welcome back";\n`,
  });
  t.after(project.remove);
  const undo = edit({
    element: numberOf(PAGE, "Welcome"),
    oldText: "Welcome back",
    newText: "Welcome",
    mappedOnly: true,
  });
  assert.deepEqual(await service.applyEdit(undo), {
    outcome: "refused",
    reason: "changed-on-disk",
  });
  assert.equal(
    await project.read("other.js"),
    `export const t = "Welcome back";\n`,
  );
});

test("criterion: a source file that cannot be read is skipped, not fatal", async (t) => {
  const { project, service } = await setUp({
    "locked.js": `const a = "Find me";\n`,
    "open.js": `const b = "Find me";\n`,
  });
  t.after(async () => {
    await chmod(path.join(project.root, "locked.js"), 0o644);
    await project.remove();
  });
  await chmod(path.join(project.root, "locked.js"), 0o000);
  const outcome = await service.applyEdit(
    edit({ oldText: "Find me", newText: "Found" }),
  );
  assert.equal(outcome.outcome, "saved");
  assert.equal(await project.read("open.js"), `const b = "Found";\n`);
});
