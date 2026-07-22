import test from "node:test";
import assert from "node:assert/strict";
import { drawableDimensions, fittedFrameBounds, photoGeometry } from "../../lib/canvas-render-adapters.js";
import { photoWindow } from "../../lib/photo-cover.mjs";

test("canvas media adapter handles image and video intrinsic dimensions", () => {
  assert.deepEqual(drawableDimensions({ width: 1200, height: 800 }), { iw: 1200, ih: 800 });
  assert.deepEqual(
    drawableDimensions({ width: 1, height: 1, videoWidth: 1920, videoHeight: 1080 }),
    { iw: 1920, ih: 1080 },
  );
  assert.deepEqual(drawableDimensions(null), { iw: 0, ih: 0 });
});

test("canvas photo geometry delegates to the shared cover policy", () => {
  const transform = { zoom: 1.2, cx: 0.42, cy: 0.55, rotation: 8 };
  assert.deepEqual(
    photoGeometry({ width: 1600, height: 900 }, 600, 800, transform),
    photoWindow(1600, 900, 600, 800, transform),
  );
});

test("frame bounds match the painter's safe clamp and intrinsic aspect fit", () => {
  const bounds=fittedFrameBounds({ x:0.52, y:0.08, w:0.42, h:0.84 }, 1200, 628, { t:0.05, b:0.05, l:0.04, r:0.04 }, 1);
  assert.deepEqual({x:bounds.x,w:bounds.w,h:bounds.h},{x:624,w:504,h:504});
  assert.ok(Math.abs(bounds.y-62)<1e-9);
});
