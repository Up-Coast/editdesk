import assert from "node:assert/strict";
import { test } from "node:test";
import { readInvocation, UsageError } from "../../src/cli/arguments.js";
import { createProject } from "./temporary-project.js";

test("criterion: a file target serves its folder and opens that page", async (t) => {
  const project = await createProject({
    "site/pages/about us.html": "<p>Hi</p>",
  });
  t.after(project.remove);
  const invocation = await readInvocation(
    ["site/pages/about us.html"],
    project.root,
  );
  assert.equal(invocation.root, `${project.root}/site/pages`);
  assert.equal(invocation.startPath, "/about%20us.html");
  assert.equal(invocation.upstream, null);
});

test("criterion: --root widens what can be edited while the page still opens", async (t) => {
  const project = await createProject({ "site/pages/about.html": "<p>Hi</p>" });
  t.after(project.remove);
  const invocation = await readInvocation(
    ["site/pages/about.html", "--root", "site"],
    project.root,
  );
  assert.equal(invocation.root, `${project.root}/site`);
  assert.equal(invocation.startPath, "/pages/about.html");
});

test("criterion: no target means the current folder", async (t) => {
  const project = await createProject({ "index.html": "<p>Hi</p>" });
  t.after(project.remove);
  const invocation = await readInvocation([], project.root);
  assert.equal(invocation.root, project.root);
  assert.equal(invocation.startPath, "/");
});

test("criterion: a local URL saves to the current folder; a live URL saves nowhere", async (t) => {
  const project = await createProject({ "package.json": "{}" });
  t.after(project.remove);
  const local = await readInvocation(
    ["http://localhost:3000/pricing?plan=a"],
    project.root,
  );
  assert.equal(local.upstream?.href, "http://localhost:3000/");
  assert.equal(local.startPath, "/pricing?plan=a");
  assert.equal(local.root, project.root);

  const live = await readInvocation(
    ["https://example.com/about"],
    project.root,
  );
  assert.equal(live.upstream?.href, "https://example.com/");
  assert.equal(live.root, null);
});

test("criterion: mistakes on the command line are explained", async (t) => {
  const project = await createProject({
    "notes.txt": "x",
    "index.html": "<p>Hi</p>",
  });
  t.after(project.remove);
  const cases = [
    [["missing.html"], /Nothing found at missing\.html/],
    [["notes.txt"], /notes\.txt is not an HTML file/],
    [["--port", "99999"], /Not a valid port: 99999/],
    [["--wat"], /Unknown option: --wat/],
    [["a.html", "b.html"], /Give one target/],
    [["index.html", "--root", "nowhere"], /--root must be a folder/],
  ];
  for (const [argv, expected] of cases) {
    await assert.rejects(
      readInvocation(/** @type {string[]} */ (argv), project.root),
      (error) =>
        error instanceof UsageError &&
        /** @type {RegExp} */ (expected).test(error.message),
      String(argv),
    );
  }
});

test("criterion: a file outside --root is refused", async (t) => {
  const project = await createProject({
    "a/index.html": "<p>Hi</p>",
    "b/keep.txt": "",
  });
  t.after(project.remove);
  await assert.rejects(
    readInvocation(["a/index.html", "--root", "b"], project.root),
    /is not inside --root/,
  );
});
