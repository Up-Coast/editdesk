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

test("criterion: hyphens, slashes and every other punctuation mark in the text can be searched for", () => {
  const source = `const a = "A well-known thing: 50/50 [ok] {x} ^$ a|b + c*?";`;
  assert.equal(
    edit(
      source,
      ".js",
      "A well-known thing: 50/50 [ok] {x} ^$ a|b + c*?",
      "A well-known thing",
    ),
    `const a = "A well-known thing";`,
  );
});

test("criterion: an attribute value takes entities, never backslash escapes", () => {
  assert.equal(
    edit(
      `<Button label="Save now" />`,
      ".tsx",
      "Save now",
      `Save "now" & {go}`,
    ),
    `<Button label="Save &quot;now&quot; &amp; &#123;go&#125;" />`,
  );
  assert.equal(
    edit(`<Card title='Save now' />`, ".vue", "Save now", `Don't`),
    `<Card title='Don&apos;t' />`,
  );
});

test("criterion: quoted text outside JavaScript and JSON is not assumed to use JavaScript escapes", () => {
  for (const [source, extension] of [
    [`title: 'Hello there'`, ".yml"],
    [`$title = 'Hello there';`, ".php"],
    [`{% set title = 'Hello there' %}`, ".njk"],
  ]) {
    const [match] = findInSource(source, extension, "Hello there");
    assert.equal(match.context.kind, "partial", extension);
    assert.equal(canWrite(match.context, "Don't go"), false, extension);
  }
});

test("criterion: characters that mean something in YAML cannot be written into a YAML file", () => {
  const [match] = findInSource(`title: Hello world`, ".yaml", "Hello world");
  assert.equal(canWrite(match.context, "Hello #1: x"), false);
  assert.equal(canWrite(match.context, "Hello, world!"), true);
});

test("criterion: code that merely sits between two strings is not treated as a string", () => {
  const [match] = findInSource(`const list = ['alpha', 'beta'];`, ".js", ",");
  assert.equal(match.context.kind, "partial");
});

test("criterion: text typed into markup inside a script or template cannot become code", () => {
  assert.equal(
    edit(
      "const t = `<p>Hello</p>`;",
      ".js",
      "Hello",
      "Hi ` + process.exit() + ` ${x} \\",
    ),
    "const t = `<p>Hi &#96; + process.exit() + &#96; $&#123;x&#125; &#92;</p>`;",
  );
  assert.equal(
    edit(`<p>Hello</p>`, ".njk", "Hello", "{{ secret }} {% raw %}"),
    `<p>&#123;&#123; secret &#125;&#125; &#123;% raw %&#125;</p>`,
  );
  assert.equal(
    edit("Some words here.\n", ".md", "words", "<script>alert(1)</script>"),
    "Some &lt;script>alert(1)&lt;/script> here.\n",
  );
});
