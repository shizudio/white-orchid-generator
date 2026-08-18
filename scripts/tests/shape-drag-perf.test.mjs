import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isContinuousDesignPatch } from "../../lib/design-patch-preparation.mjs";

/* ── SHAPE / MOTIF DRAG COST (client report 2026-08-18) ────────────────────────
   "for the shapes, there a lot of latency when moving around the 'motif 1'"

   drawLineArtLayer read back and looped over the WHOLE canvas on every repaint
   (1080×1350 ≈ 1.46M px), so a drag paid that on every pointermove and a small
   motif cost the same as a full-bleed one. Uploaded assets classify as LINEWORK
   (lib/overlay-shapes.mjs) and route to this painter — hence the client's
   uploaded motif was slow while built-in petals (outline painter) were not.

   The readback is now confined to the shape's own padded bounding box. This is
   PROVABLY output-identical: outside that box the offscreen is transparent, so
   the loop's `a < 10` branch was writing alpha 0 over alpha 0. Verified live as
   bit-identical (0 mismatched bytes) across 5 placements incl. rotation, edge
   clipping and near-full-bleed scale.

   The painter lives in components/Generator.jsx (a client component the Node
   runner cannot import), so its guard is a TEXT parse — the same fail-closed
   technique as workspace-prop-parity and hairline-retirement. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(HERE, "..", "..", "components", "Generator.jsx"), "utf8");

test("the line-art readback is confined to the shape's bounding box", () => {
  assert.ok(/function lineArtReadbackBox\(/.test(src),
    "expected the bounding-box helper the painter reads back through");
  const painter = src.match(/function drawLineArtLayer\([\s\S]*?\n\}/)?.[0];
  assert.ok(painter, "could not locate drawLineArtLayer");
  assert.ok(!/getImageData\(0, 0, w, h\)/.test(painter),
    "the painter must not read back the entire canvas any more — that was the bug");
  assert.ok(/getImageData\(box\.x, box\.y, box\.w, box\.h\)/.test(painter),
    "the readback must cover only the shape's box");
  assert.ok(/putImageData\(imgData, box\.x, box\.y\)/.test(painter),
    "the recoloured pixels must be written back at the box's origin, not 0,0");
});

test("the box accounts for rotation and is padded, so no edge paints un-recoloured", () => {
  const box = src.match(/function lineArtReadbackBox\([\s\S]*?\n\}/)?.[0];
  assert.ok(box, "could not locate lineArtReadbackBox");
  // A rotated rect's AABB needs both cos and sin terms on each half-extent.
  assert.ok(/Math\.cos\(theta\)/.test(box) && /Math\.sin\(theta\)/.test(box),
    "the box must expand for rotation");
  assert.ok(/\+ 2;/.test(box), "the box must carry a small pad for anti-aliased edges");
  // And it must stay inside the canvas so getImageData never throws on bounds.
  assert.ok(/Math\.max\(0,/.test(box) && /Math\.min\(w,/.test(box) && /Math\.min\(h,/.test(box),
    "the box must be clamped to the canvas");
});

test("a fully off-canvas shape short-circuits instead of reading a zero-size box", () => {
  const painter = src.match(/function drawLineArtLayer\([\s\S]*?\n\}/)?.[0];
  assert.ok(/if \(!box\.w \|\| !box\.h\) return;/.test(painter),
    "a zero-area box must return early — getImageData(…,0,0) throws");
});

test("a tainted-canvas readback still degrades gracefully, never throws", () => {
  const painter = src.match(/function drawLineArtLayer\([\s\S]*?\n\}/)?.[0];
  assert.ok(/catch\(_\) \{/.test(painter),
    "the readback must keep its cross-origin fallback");
});

test("the shape drag branch has the same 5px dead-zone as text and logo", () => {
  const gestures = readFileSync(
    path.join(HERE, "..", "..", "hooks", "useCanvasGestures.js"), "utf8");
  const overlayMove = gestures.match(/if \(drag\.mode === "overlay"\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(overlayMove, "could not locate the overlay pointermove branch");
  assert.ok(/drag\.downX/.test(overlayMove) && /<= 5\) return/.test(overlayMove),
    "the overlay drag must ignore sub-5px jitter so a plain tap does not repaint");
  // Both overlay dragRef seeds must carry the down point the dead-zone reads.
  const seeds = gestures.match(/mode: "overlay"[\s\S]{0,400}?\n\s*\};/g) || [];
  assert.equal(seeds.length, 2, `expected both overlay drag seeds, found ${seeds.length}`);
  for (const seed of seeds) {
    assert.ok(/downX: event\.clientX/.test(seed),
      `an overlay drag seed is missing downX, so its dead-zone can never engage`);
  }
});

test("overlayUpdate counts as a continuous patch (no discrete settle per nudge/slider tick)", () => {
  assert.equal(isContinuousDesignPatch({ overlayUpdate: { uid: "u1", transform: {} } }), true);
  // The pre-existing continuous kinds must keep their classification.
  for (const key of ["textLayout", "photoTransform", "roleOffset", "logoFree"]) {
    assert.equal(isContinuousDesignPatch({ [key]: {} }), true, `${key} regressed`);
  }
  // A discrete patch must still settle.
  assert.equal(isContinuousDesignPatch({ bgColor: "sage" }), false);
  assert.equal(isContinuousDesignPatch(null), false);
});
