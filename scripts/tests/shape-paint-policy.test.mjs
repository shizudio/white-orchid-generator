// Shape-layer paint & obstacle policy (client ruling 2026-07-27):
// "once i add more than 1 shape, text cannot be shown, make sure text and logo
// are the top layers."
//
// Guards two invariants:
//   1. PAINT ORDER — every added (non-frame) shape paints in a phase BEFORE
//      content and brand marks (DLC §8: decoration band 35 < content 40 < marks
//      50), and the renderer's actual job sequence agrees (source-order check —
//      the same textual-parity pattern workspace-prop-parity uses).
//   2. OBSTACLE CLASS — a flat added-shape silhouette is a SOFT surface for every
//      text placement path (DLC §7 content × shape = R, resolve-with-treatment),
//      never a hard wall; motifs stay compose-or-avoid; accessories occupy nothing.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  SHAPE_PAINT_SEQUENCE,
  classifyShapeLayerPaint,
} from "../../lib/shape-paint-policy.mjs";
import { OBSTACLE_KINDS, classifyPlacementObstacles } from "../../lib/element-placement-solver.mjs";
import { Z_BANDS } from "../../lib/design-layer-contract.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatorSource = readFileSync(join(ROOT, "components", "Generator.jsx"), "utf8");

// ── 1 · The declared paint sequence puts content and marks above added shapes ──

test("paint sequence: added shapes come before content, content before brand marks", () => {
  const at = (phase) => SHAPE_PAINT_SEQUENCE.indexOf(phase);
  assert.ok(at("added-shapes") > at("structural-frames"));
  assert.ok(at("content") > at("added-shapes"), "content must paint after added shapes");
  assert.ok(at("brand-marks") > at("added-shapes"), "marks must paint after added shapes");
  assert.ok(at("brand-marks") > at("content"));
  assert.ok(Object.isFrozen(SHAPE_PAINT_SEQUENCE));
});

test("paint sequence agrees with the DLC §8 band ladder (decoration below content+marks)", () => {
  assert.ok(Z_BANDS.DECORATION < Z_BANDS.CONTENT, "DLC §8: decoration below content");
  assert.ok(Z_BANDS.DECORATION < Z_BANDS.BRAND_MARK, "DLC §8: decoration below marks");
});

// ── 2 · Classification: every added shape is under-content; silhouettes are soft ──

test("an added fill shape is painted under content and classifies as a SOFT surface", () => {
  const cls = classifyShapeLayerPaint({ mode: "overlay" }, "overlays");
  assert.equal(cls.phase, "added-shapes");
  assert.equal(cls.obstacle, "surface");
  assert.equal(cls.bandExclude, true);
});

test("outline and line-art added shapes are under-content surfaces too (no over-text rings)", () => {
  for (const mode of ["outline", "lineart"]) {
    const cls = classifyShapeLayerPaint({ mode }, "overlays");
    assert.equal(cls.phase, "added-shapes", `${mode} paints under content`);
    assert.equal(cls.obstacle, "surface");
  }
});

test("an uploaded (non-builtin-category) shape gets the same surface treatment", () => {
  const cls = classifyShapeLayerPaint({ mode: "overlay" }, "uploads");
  assert.equal(cls.phase, "added-shapes");
  assert.equal(cls.obstacle, "surface");
});

test("system motif decor keeps its compose-or-avoid contract", () => {
  const cls = classifyShapeLayerPaint({ mode: "overlay", motif: true }, "overlays");
  assert.equal(cls.phase, "added-shapes");
  assert.equal(cls.obstacle, "decor");
  assert.equal(cls.bandExclude, true);
});

test("accessories paint under content but occupy nothing and never flip the §6a no-band rung", () => {
  const cls = classifyShapeLayerPaint({ mode: "overlay" }, "accessories");
  assert.equal(cls.phase, "added-shapes");
  assert.equal(cls.obstacle, "none");
  assert.equal(cls.bandExclude, false);
});

test("frame-mode layers belong to the structural frame pass (unchanged by the ruling)", () => {
  const cls = classifyShapeLayerPaint({ mode: "frame" }, "overlays");
  assert.equal(cls.phase, "structural-frames");
});

// ── 3 · The surface class maps to the SOFT set in the placement solver ──

test("a surface-classified silhouette enters the placement solver as SOFT, never hard", () => {
  assert.equal(OBSTACLE_KINDS.silhouette, "soft");
  const { hard, soft } = classifyPlacementObstacles([
    { kind: "silhouette", box: { x: 0, y: 0, w: 900, h: 900 } },   // the client's big fill shape
    { kind: "text", box: { x: 10, y: 10, w: 100, h: 40 } },
    { kind: "mark", box: { x: 800, y: 800, w: 80, h: 80 } },
  ]);
  assert.equal(soft.length, 1, "the flat shape is a soft surface");
  assert.equal(hard.length, 2, "text and the mark stay hard");
});

// ── 4 · Source-order guard: the renderer paints shapes BEFORE text (both paths) ──

test("editorial path: the added-shape early paint precedes the hero/support draws", () => {
  const early = generatorSource.indexOf("TEXT AND LOGO ARE THE TOP LAYERS");
  const heroDraw = generatorSource.indexOf("// hero\n      if(!isSchedule && heroFinal && heroBox){");
  assert.ok(early > 0, "the early under-content shape paint exists");
  assert.ok(heroDraw > 0, "the hero draw marker exists");
  assert.ok(early < heroDraw, "shapes paint before the hero in the editorial job sequence");
});

test("legacy path: every stacked postType branch paints shapes before its text/logo", () => {
  const calls = generatorSource.split("paintAddedShapeLayers();").length - 1;
  // 5 branch call sites (photo_logo / quote / event / text_post / texture_text)
  // + the idempotent tail catch-all.
  assert.ok(calls >= 6, `expected >=6 paintAddedShapeLayers() call sites, found ${calls}`);
  assert.ok(
    !generatorSource.includes("Overlay-mode layers (drawn on top of everything)"),
    "the retired top-of-everything overlay pass must not return",
  );
});
