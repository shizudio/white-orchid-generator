import test from "node:test";
import assert from "node:assert/strict";
import {
  fitEditorialHeadline,
  reserveHeadlineSupportSpace,
  resolveEditorialRoleRhythm,
} from "../../lib/editorial-typography-solver.mjs";

function fixtures() {
  const context = {
    font: "",
    measureText(value) {
      const size = Number.parseFloat(this.font) || 10;
      return { width: String(value).length * size * 0.5 };
    },
  };
  const parseWords = (text) => String(text).split(/\s+/).map((word) => ({
    text: word,
    italic: false,
    space: true,
  }));
  const wrapLines = (ctx, words, register, size, maxWidth) => {
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
    context,
    parseWords,
    wrapLines,
    measureLines: wrapLines,
    minimumFloor: (role, height, target) => Math.min(target, height * 0.06),
    stripMarkers: (text) => String(text).replaceAll("*", ""),
    fontFor: (register, size) => `${size}px test`,
  };
}

test("headline fitting stays inside its measured box", () => {
  const result = fitEditorialHeadline({
    ...fixtures(),
    text: "A thoughtful education for every child",
    register: "sans",
    caps: false,
    box: { x: 0, y: 0, w: 420, h: 180 },
    canvasHeight: 1000,
    scale: 1,
    capFraction: 0.12,
  });
  assert.ok(result.usedHeight <= 180);
  assert.ok(result.size >= 14);
  assert.equal(result.lineHeight, result.size * 1.05);
});

test("width-fill intent enlarges short display copy without escaping the box", () => {
  const base = {
    ...fixtures(),
    text: "Open day",
    register: "serif",
    caps: false,
    box: { x: 0, y: 0, w: 700, h: 300 },
    canvasHeight: 1000,
    scale: 1,
    capFraction: 0.05,
  };
  const normal = fitEditorialHeadline(base);
  const filled = fitEditorialHeadline({ ...base, widthTarget: 0.9 });
  assert.ok(filled.size > normal.size);
  assert.ok(filled.usedHeight <= base.box.h);
});

test("complete-or-absent fitting reports when copy must cross the readable floor", () => {
  const result = fitEditorialHeadline({
    ...fixtures(),
    text: "SUPERCALIFRAGILISTICEXPIALIDOCIOUS",
    register: "sans",
    caps: true,
    box: { x: 0, y: 0, w: 120, h: 80 },
    canvasHeight: 1000,
    scale: 1,
    capFraction: 0.1,
  });
  assert.equal(result.hitFloor, true);
  assert.ok(result.size < result.minimumSize);
});

test("role rhythm keeps support below the measured headline with a premium gap", () => {
  const result = resolveEditorialRoleRhythm({
    height: 1000,
    safe: { t: 0.08, b: 0.08, l: 0.08, r: 0.08 },
    scale: 1,
    heroBox: { x: 100, y: 200, w: 700, h: 220 },
    supportBox: { x: 100, y: 300, w: 700, h: 160 },
    labelBox: null,
    heroSize: 100,
    heroLineHeight: 105,
    heroUsedHeight: 210,
    heroToSupport: 8,
    supportSizeMultiplier: 1,
    minimumFloor: (role, height, target) => Math.min(target, 60),
    bodyFloor: () => 48,
  });
  assert.equal(result.supportBox.y, 446.75);
  assert.ok(result.supportBox.y > 410);
});

test("an eyebrow with no safe room above the headline yields instead of overlapping", () => {
  const result = resolveEditorialRoleRhythm({
    height: 1000,
    safe: { t: 0.08, b: 0.08, l: 0.08, r: 0.08 },
    scale: 1,
    heroBox: { x: 100, y: 90, w: 700, h: 250 },
    supportBox: null,
    labelBox: { x: 100, y: 100, w: 300, h: 30 },
    heroSize: 100,
    heroLineHeight: 105,
    heroUsedHeight: 210,
    heroToSupport: 8,
    supportSizeMultiplier: 1,
    minimumFloor: () => 24,
    bodyFloor: () => 48,
  });
  assert.equal(result.labelBox, null);
});

test("headline fitting reserves a readable support line above a photo band", () => {
  const result = reserveHeadlineSupportSpace({
    height: 1000,
    safe: { t: 0.08, b: 0.08, l: 0.08, r: 0.08 },
    headlineBox: { x: 100, y: 100, w: 700, h: 500 },
    supportBox: { x: 100, y: 500, w: 700, h: 120 },
    supportText: "A readable supporting line",
    minimumSupportHeight: 80,
    photoObstacle: { x: 80, y: 500, w: 840, h: 300 },
    obstacleSolver: { photoIsBand: true, gapPx: 20 },
  });
  assert.deepEqual(result, { x: 100, y: 100, w: 700, h: 250 });
});

test("headline reservation is a no-op when no support is authored", () => {
  const headlineBox = { x: 100, y: 100, w: 700, h: 500 };
  assert.equal(reserveHeadlineSupportSpace({
    height: 1000,
    safe: { t: 0.08, b: 0.08, l: 0.08, r: 0.08 },
    headlineBox,
    supportBox: { x: 100, y: 500, w: 700, h: 120 },
    supportText: "",
    minimumSupportHeight: 80,
  }), headlineBox);
});
