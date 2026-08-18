import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { splitParagraphs } from "../../lib/body-paragraphs.mjs";

/* ── HARD LINE BREAKS IN AUTHORED COPY (client ruling 2026-08-18) ──────────────
   "when user is entering text, and press 'enter' goes to the next line."

   The renderer's shared word-wrap (Generator.textLines) previously split on
   /\s+/ across the whole string, collapsing every newline into a space, so an
   author could not control where a headline turned. It now splits on newlines
   FIRST and measured-word-wraps each segment.

   textLines lives inside components/Generator.jsx (a client component that
   imports canvas/React and cannot be imported by the Node test runner), so the
   guard is a TEXT parse of the source — the same fail-closed technique as
   workspace-prop-parity and hairline-retirement. The wrap ALGORITHM itself is
   re-implemented here against a stub measurer to pin the intended behaviour. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATOR = path.join(HERE, "..", "..", "components", "Generator.jsx");
const src = readFileSync(GENERATOR, "utf8");

test("textLines splits on newlines before word-wrapping (no whole-string /\\s+/ split)", () => {
  const fn = src.match(/function textLines\([^)]*\)\{[\s\S]*?\n\}/)?.[0]
    || src.match(/function textLines\([\s\S]{0,900}?\n(?=\/\/|function )/)?.[0];
  assert.ok(fn, "could not locate textLines in Generator.jsx");
  assert.ok(/split\(\/\\r\?\\n\/\)/.test(fn),
    "textLines must split the text on newlines first (hard breaks)");
  assert.ok(!/String\(text\|\|""\)\.trim\(\)\.split\(\/\\s\+\/\)/.test(fn),
    'textLines must NOT collapse newlines via a whole-string /\\s+/ split — that was the bug');
});

test("the hero/headline fields are multiline so a break can be typed at all", () => {
  const panel = readFileSync(
    path.join(HERE, "..", "..", "components", "ContentFieldsPanel.jsx"), "utf8");
  // Every headline field feeding the hero role must open multiline; a single-line
  // <input> cannot hold a newline no matter what the renderer supports.
  // Match to the options object's closing `})` — the placeholder text itself can
  // contain parentheses ("Overlay text (e.g. NOW OPEN)"), so a [^)] scan truncates.
  const heroHeadlines = panel.match(/input\("headline"[\s\S]*?\}\)/g) || [];
  assert.ok(heroHeadlines.length >= 4, `expected the headline fields, found ${heroHeadlines.length}`);
  for (const call of heroHeadlines) {
    assert.ok(/multiline:\s*true/.test(call),
      `a headline field is still single-line, so Enter cannot be typed: ${call}`);
  }
});

// The wrap contract, pinned against a stub measurer (1 unit per character).
function wrap(text, maxW) {
  const measure = s => s.length;
  const lines = [];
  for (const segment of String(text || "").split(/\r?\n/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = "";
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (line && measure(testLine) > maxW) { lines.push(line); line = word; }
      else line = testLine;
    }
    if (line) lines.push(line);
  }
  return lines;
}

test("an explicit break turns the line exactly where the author pressed Enter", () => {
  assert.deepEqual(wrap("Open House\n18 July", 100), ["Open House", "18 July"]);
});

test("width wrapping still applies WITHIN each authored segment", () => {
  assert.deepEqual(wrap("aaa bbb ccc\nddd", 7), ["aaa bbb", "ccc", "ddd"]);
});

test("a double-Enter collapses to one break (an empty painted line spends budget for nothing)", () => {
  assert.deepEqual(wrap("one\n\n\ntwo", 100), ["one", "two"]);
});

test("text with no newline behaves exactly as before (pure width wrap)", () => {
  assert.deepEqual(wrap("aaa bbb ccc", 7), ["aaa bbb", "ccc"]);
});

test("carriage-return newlines (Windows paste) are honoured too", () => {
  assert.deepEqual(wrap("one\r\ntwo", 100), ["one", "two"]);
});

test("body paragraphs consume their own newlines upstream, so wrap never double-handles them", () => {
  // splitParagraphs is what the body painter calls BEFORE handing each paragraph
  // to the wrap function — each piece must therefore arrive break-free.
  const paras = splitParagraphs("first para\nsecond para");
  assert.deepEqual(paras, ["first para", "second para"]);
  for (const p of paras) assert.ok(!/[\r\n]/.test(p));
});
