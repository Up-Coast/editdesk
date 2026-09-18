import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canWrite,
  findInSource,
  rewriteMatch,
} from "../../src/source/source-text.js";

/**
 * @param {string} source
 * @param {string} extension
 * @param {string} oldText
 * @param {string} newText
 */
function edit(source, extension, oldText, newText) {
  const matches = findInSource(source, extension, oldText);
  assert.equal(matches.length, 1, "expected exactly one match");
  return rewriteMatch(source, matches[0], oldText, newText);
}

test("criterion: a whole string in a strings file is rewritten in place", () => {
  const source = `export const nav = {\n  title: "Admin",\n  people: "People",\n};\n`;
  assert.equal(
    edit(source, ".ts", "People", "Members"),
    source.replace('"People"', '"Members"'),
  );
});

test("criterion: typed quotes are escaped for the string's own delimiter", () => {
  assert.equal(
    edit(`const a = 'Save';`, ".js", "Save", `Don't "save"`),
    `const a = 'Don\\'t "save"';`,
  );
  assert.equal(
    edit(`const a = "Save";`, ".js", "Save", `Don't "save"`),
    `const a = "Don't \\"save\\"";`,
  );
  assert.equal(
    edit("const a = `Save`;", ".js", "Save", "Costs ${5} `now`"),
    "const a = `Costs \\${5} \\`now\\``;",
  );
});

test("criterion: escaped text in the source is found from its on-screen form", () => {
  const source = `const a = 'Don\\'t stop';\nconst b = <p>Fish &amp; chips</p>;`;
  assert.equal(
    edit(source, ".jsx", "Don't stop", "Don't go"),
    source.replace("stop", "go"),
  );
  assert.equal(
    edit(source, ".jsx", "Fish & chips", "Fish & peas"),
    source.replace("chips", "peas"),
  );
});

test("criterion: wrapped JSX text keeps its line breaks outside the edited words", () => {
  const source = `<p>\n  Welcome to the\n  best site on\n  the web\n</p>`;
  assert.equal(
    edit(
      source,
      ".tsx",
      "Welcome to the best site on the web",
      "Welcome to the finest site on the web",
    ),
    `<p>\n  Welcome to the\n  finest site on\n  the web\n</p>`,
  );
});

test("criterion: words can be added at the end, at the start, or removed", () => {
  assert.equal(edit(`t("Save")`, ".js", "Save", "Save now"), `t("Save now")`);
  assert.equal(
    edit(`t("Save")`, ".js", "Save", "Please Save"),
    `t("Please Save")`,
  );
  assert.equal(
    edit(`t("Save it now")`, ".js", "Save it now", "Save now"),
    `t("Save now")`,
  );
});

test("criterion: braces and angle brackets typed into JSX text cannot become code", () => {
  assert.equal(
    edit(`<h1>Title</h1>`, ".tsx", "Title", "{danger} <b>"),
    `<h1>&#123;danger&#125; &lt;b&gt;</h1>`,
  );
  assert.equal(
    edit(`<h1>Title</h1>`, ".html", "Title", "{fine} <b>"),
    `<h1>{fine} &lt;b&gt;</h1>`,
  );
});

test("criterion: text inside an identifier or longer word is never matched", () => {
  const source = `function AdminLayout() { return administer(); }`;
  assert.deepEqual(findInSource(source, ".ts", "Admin"), []);
});

test("criterion: text that is only part of a larger string needs confirmation and plain characters", () => {
  const [match] = findInSource(
    `const a = "Hello world, " + name;`,
    ".js",
    "Hello world",
  );
  assert.equal(match.context.kind, "partial");
  assert.equal(canWrite(match.context, "Hello there"), true);
  assert.equal(canWrite(match.context, 'Hello "there"'), false);
  assert.equal(canWrite(match.context, "Hello \\ there"), false);
});

test("criterion: an attribute value in an HTML file is not treated as a string to rewrite silently", () => {
  const [match] = findInSource(`<img alt="Logo">`, ".html", "Logo");
  assert.equal(match.context.kind, "partial");
});

test("criterion: Markdown prose is edited as plain words", () => {
  assert.equal(
    edit("# Title\n\nDon't *ever* stop.\n", ".md", "Don't", "Do not"),
    "# Title\n\nDo not *ever* stop.\n",
  );
});

test("criterion: user text is matched literally, never as a pattern", () => {
  const source = `const a = "Price (USD) $5.00 [net]?";`;
  assert.equal(
    edit(source, ".js", "Price (USD) $5.00 [net]?", "Price (CAD) $7.00 [net]?"),
    `const a = "Price (CAD) $7.00 [net]?";`,
  );
  assert.deepEqual(findInSource(`const a = "Price";`, ".js", "P.ice"), []);
});
