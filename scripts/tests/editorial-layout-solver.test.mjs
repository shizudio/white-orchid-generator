import test from "node:test";
import assert from "node:assert/strict";
import { solveEditorialLayout } from "../../lib/editorial-layout-solver.mjs";

function measurementAdapter() {
  const wrapLines = (context, words, register, size, maxWidth) => {
    const widths = [];
    let current = 0;
    for (const word of words) {
      const width = word.text.length * size * 0.5;
      if (current && current + size * 0.3 + width > maxWidth) {
        widths.push(current);
        current = width;
      } else {
        current += (current ? size * 0.3 : 0) + width;
      }
    }
    if (current || !widths.length) widths.push(current);
    return { widths, lineCount: widths.length };
  };
  return {
    minimumFloor: (role, height, target) => Math.min(target, role === "headline" ? 60 : 48),
    bodyFloor: () => 48,
    stripMarkers: (text) => String(text).replaceAll("*", ""),
    parseWords: (text) => String(text).split(/\s+/).map((word) => ({ text: word, italic: false, space: true })),
    fontFor: (register, size) => `${size}px test`,
    measureLines: wrapLines,
    wrapLines,
  };
}

test("the composed solver returns paint-ready roles without crossing photo seams", () => {
  const context = {
    font: "",
    measureText(value) {
      const size = Number.parseFloat(this.font) || 10;
      return { width: String(value).length * size * 0.5 };
    },
  };
  const result = solveEditorialLayout(context, {
    w: 1000,
    h: 1000,
    S: 1,
    sm: { t: 0.08, b: 0.08, l: 0.08, r: 0.08 },
    register: "sans",
    caps: false,
    heroText: "Learning begins with curiosity",
    supportText: "A thoughtful supporting line",
    heroCapFrac: 0.12,
    heroToSupport: 8,
    heroBox: { x: 100, y: 100, w: 700, h: 320 },
    supBox: { x: 100, y: 300, w: 700, h: 160 },
    labelBox: { x: 100, y: 90, w: 300, h: 30 },
    photoRegion: { x: 80, y: 650, w: 840, h: 270 },
  }, measurementAdapter());

  assert.ok(result.heroBox.y + result.heroBox.h < 630);
  assert.ok(result.supBox.y + result.supBox.h <= 630);
  assert.ok(result.heroPx >= 14);
  assert.equal(typeof result.bodyAtFloor, "boolean");
});

test("solver results are detached from authored input boxes", () => {
  const context = { font: "", measureText: () => ({ width: 20 }) };
  const heroBox = { x: 100, y: 100, w: 700, h: 200 };
  const result = solveEditorialLayout(context, {
    w: 1000,
    h: 1000,
    S: 1,
    sm: { t: 0.08, b: 0.08, l: 0.08, r: 0.08 },
    register: "serif",
    caps: false,
    heroText: "Open house",
    supportText: "",
    heroBox,
  }, measurementAdapter());
  assert.notEqual(result.heroBox, heroBox);
  assert.deepEqual(heroBox, { x: 100, y: 100, w: 700, h: 200 });
});

