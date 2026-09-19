import assert from "node:assert/strict";
import { test } from "node:test";
import {
  annotateHtml,
  describeHtml,
  injectIntoHead,
  rewriteSlot,
} from "../../src/source/html-document.js";
import { decodeHtmlText, rewriteHtmlText } from "../../src/source/html-text.js";

const PAGE = `<!doctype html>
<html>
  <head>
    <title>Title stays</title>
    <style>p { color: red; }</style>
  </head>
  <body>
    <h1 class="hero">Tom &amp; Jerry&rsquo;s   show</h1>
    <p>
      Hello <b>bold</b>, welcome
      to the&nbsp;site.<br>Second line
    </p>
    <script>document.title = "x < y";</script>
  </body>
</html>
`;

/**
 * @param {string} source
 * @param {string} text
 */
function slotShowing(source, text) {
  for (const element of describeHtml(source).elements) {
    const slot = element.slots.find((candidate) => candidate.text === text);
    if (slot) {
      return slot;
    }
  }
  throw new Error(`no slot shows ${JSON.stringify(text)}`);
}

test("criterion: an edit changes only the edited characters of the file", () => {
  const slot = slotShowing(PAGE, "Tom & Jerry’s   show");
  const result = rewriteSlot(PAGE, slot, "Tom & Jerry’s   circus");
  assert.equal(
    result,
    PAGE.replace("Jerry&rsquo;s   show", "Jerry&rsquo;s   circus"),
  );
});

test("criterion: untouched entities and line breaks keep their original spelling", () => {
  const raw = "\r\n  Fish &amp; chips &mdash; &pound;5\r\n";
  const shown = decodeHtmlText(raw);
  assert.equal(shown, "\n  Fish & chips — £5\n");
  assert.equal(
    rewriteHtmlText(raw, "\n  Fish & chips — £6\n"),
    "\r\n  Fish &amp; chips &mdash; &pound;6\r\n",
  );
});

test("criterion: typed markup characters are written as text, never as markup", () => {
  const slot = slotShowing(PAGE, "bold");
  const result = rewriteSlot(PAGE, slot, 'a <script>alert("x")</script> & b');
  assert.ok(
    result.includes('<b>a &lt;script&gt;alert("x")&lt;/script&gt; &amp; b</b>'),
  );
  assert.equal(
    slotShowing(result, 'a <script>alert("x")</script> & b').text.length,
    33,
  );
});

test("criterion: text beside an inline element is edited without touching the element", () => {
  const shown = ", welcome\n      to the\u00a0site.\u2028Second line\n    ";
  const result = rewriteSlot(
    PAGE,
    slotShowing(PAGE, shown),
    shown.replace("the", "our"),
  );
  assert.equal(result, PAGE.replace("to the&nbsp;site", "to our&nbsp;site"));
});

test("criterion: a line break is written as a br tag, and an existing one can be removed", () => {
  const source = "<h1>Fresh bread<br />every day</h1>";
  const slot = slotShowing(source, "Fresh bread\u2028every day");
  assert.equal(
    rewriteSlot(source, slot, "Fresh\u2028bread\u2028every day"),
    "<h1>Fresh<br>bread<br />every day</h1>",
  );
  assert.equal(
    rewriteSlot(source, slot, "Fresh bread every day"),
    "<h1>Fresh bread every day</h1>",
  );
});

test("criterion: a br that carries attributes is left alone as an element", () => {
  const source = '<p>One<br class="wide">Two</p>';
  assert.deepEqual(
    describeHtml(source).elements[0].slots.map((slot) => slot.text),
    ["One", "Two"],
  );
});

test("criterion: a paragraph break splits a paragraph, keeping its attributes except the id", () => {
  const source = `<main>\n    <p id="intro" class="lead">First thought. Second thought.</p>\n</main>`;
  const paragraph = describeHtml(source).elements.find((element) =>
    element.slots.some((slot) => slot.text.startsWith("First")),
  );
  assert.ok(paragraph);
  assert.equal(
    rewriteSlot(
      source,
      paragraph.slots[0],
      "First thought.\u2029Second thought.",
      paragraph.paragraphBreak,
    ),
    `<main>\n    <p id="intro" class="lead">First thought.</p>\n    <p class="lead">Second thought.</p>\n</main>`,
  );
});

test("criterion: a paragraph break in an element that cannot be split becomes two line breaks", () => {
  const source = "<h2>One Two</h2>";
  const heading = describeHtml(source).elements[0];
  assert.equal(heading.paragraphBreak, undefined);
  assert.equal(
    rewriteSlot(
      source,
      heading.slots[0],
      "One\u2029Two",
      heading.paragraphBreak,
    ),
    "<h2>One<br><br>Two</h2>",
  );
});

test("criterion: an empty slot can receive text", () => {
  const source = "<p><b>Bold</b></p>";
  const paragraph = describeHtml(source).elements[0];
  assert.deepEqual(
    paragraph.slots.map((slot) => slot.text),
    ["", ""],
  );
  assert.equal(
    rewriteSlot(source, paragraph.slots[1], " and more"),
    "<p><b>Bold</b> and more</p>",
  );
});

test("criterion: deleting all the text of a slot leaves the tags in place", () => {
  const source = "<p>Hello <b>bold</b> tail</p>";
  const slot = slotShowing(source, "bold");
  assert.equal(rewriteSlot(source, slot, ""), "<p>Hello <b></b> tail</p>");
});

test("criterion: script, style, title and svg text is never offered for editing", () => {
  const texts = describeHtml(
    PAGE + "<svg><text>Chart label</text></svg>",
  ).elements.flatMap((element) => element.slots.map((slot) => slot.text));
  for (const forbidden of [
    "Title stays",
    "color: red",
    "x < y",
    "Chart label",
  ]) {
    assert.ok(
      !texts.some((text) => text.includes(forbidden)),
      `${forbidden} must not be editable`,
    );
  }
});

test("criterion: text the parser relocates is locked rather than guessed at", () => {
  const source = "<table>stray<tr><td>Cell</td></tr></table>";
  const texts = describeHtml(source).elements.flatMap((element) =>
    element.slots.map((slot) => slot.text),
  );
  assert.ok(texts.includes("Cell"));
  assert.ok(!texts.includes("stray"));
});

test("criterion: paragraphs without closing tags are still editable", () => {
  const source = "<ul><li>One<li>Two</ul>";
  const slot = slotShowing(source, "One");
  assert.equal(rewriteSlot(source, slot, "First"), "<ul><li>First<li>Two</ul>");
});

test("criterion: the served copy differs from the source only by numbering and the head snippet", () => {
  const served = annotateHtml(PAGE, "<!--editor-->");
  const restored = served
    .replace("<!--editor-->", "")
    .replaceAll(/ data-editdesk-el="\d+"/g, "");
  assert.equal(restored, PAGE);
  assert.match(served, /<h1 data-editdesk-el="\d+" class="hero">/);
  assert.ok(served.includes("<head><!--editor-->"));
});

test("criterion: element numbers do not change when only text changes", () => {
  const before = describeHtml(PAGE);
  const after = describeHtml(
    rewriteSlot(PAGE, slotShowing(PAGE, "bold"), "much bolder text"),
  );
  assert.equal(after.elements.length, before.elements.length);
  assert.deepEqual(
    after.elements.map((element) => element.slots.length),
    before.elements.map((element) => element.slots.length),
  );
});

test("criterion: the editor snippet never lands before the doctype", () => {
  assert.equal(
    injectIntoHead("<!doctype html><p>Hi</p>", "<!--e-->"),
    "<!doctype html><!--e--><p>Hi</p>",
  );
  assert.equal(
    injectIntoHead('<html lang="en"><body>Hi</body></html>', "<!--e-->"),
    '<html lang="en"><!--e--><body>Hi</body></html>',
  );
});

test("criterion: emoji and other wide characters survive an edit beside them", () => {
  const raw = "Launch 🚀 today";
  assert.equal(
    rewriteHtmlText(raw, "Launch 🚀 tomorrow"),
    "Launch 🚀 tomorrow",
  );
  assert.equal(rewriteHtmlText(raw, "Launch 🎉 today"), "Launch 🎉 today");
});

test("criterion: an ampersand that was left bare never joins typed text to form an entity", () => {
  assert.equal(decodeHtmlText(rewriteHtmlText("A & B", "A &lt B")), "A &lt B");
  assert.equal(decodeHtmlText(rewriteHtmlText("& copy;", "&copy;")), "&copy;");
});

test("criterion: a file that starts with a byte-order mark is mapped and served correctly", () => {
  const source =
    "\uFEFF<!doctype html><html><head></head><body><h1>Hi</h1></body></html>";
  const served = annotateHtml(source, "<!--e-->");
  assert.ok(
    served.startsWith("\uFEFF<!doctype html>") &&
      served.includes("<head><!--e-->"),
  );
  assert.equal(
    rewriteSlot(source, slotShowing(source, "Hi"), "Hello"),
    source.replace("Hi", "Hello"),
  );
  assert.ok(
    injectIntoHead("\uFEFF<!doctype html><p>x</p>", "<!--e-->").startsWith(
      "\uFEFF<!doctype html><!--e-->",
    ),
  );
});

test("criterion: splitting a paragraph removes only its real id attribute", () => {
  for (const [startTag, copied] of [
    [`<p title="the id = 5" class="x">`, `<p title="the id = 5" class="x">`],
    [`<p data-x="a id=b" id="one" class="c">`, `<p data-x="a id=b" class="c">`],
    [`<p ID=top data-id="keep">`, `<p data-id="keep">`],
  ]) {
    const source = `${startTag}Hello world</p>`;
    const paragraph = describeHtml(source).elements[0];
    assert.equal(
      rewriteSlot(
        source,
        paragraph.slots[0],
        "Hello\u2029world",
        paragraph.paragraphBreak,
      ),
      `${startTag}Hello</p>\n${copied}world</p>`,
    );
  }
});
