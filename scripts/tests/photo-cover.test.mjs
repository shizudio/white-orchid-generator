import test from "node:test";
import assert from "node:assert/strict";
import { photoWindow, coversFrameBox, coverClampT } from "../../lib/photo-cover.mjs";

// The frame-photo cover invariant (§2.9.2, client ruling 2026-07-15): a frame shape
// must be fully covered by its photo — no backing exposed inside the silhouette.
// coverClampT is the pure root fix applied at paint time; these tests pin it.

// A spread of window↔image aspect combinations that exercise both leading axes.
const BOXES = [
  { w: 480, h: 360 }, // landscape window
  { w: 360, h: 480 }, // portrait window
  { w: 400, h: 400 }, // square window
  { w: 1200, h: 300 }, // banner-ish window
];
const IMAGES = [
  { iw: 1600, ih: 1200 }, // landscape 4:3
  { iw: 1200, ih: 1600 }, // portrait 3:4
  { iw: 1000, ih: 1000 }, // square
  { iw: 2000, ih: 600 }, // wide pano
];

test("photoWindow matches the canvas photoGeom cover behaviour (zoom>=1 covers)", () => {
  // A centered cover-fit photo covers the window on both axes.
  const g = photoWindow(1600, 1200, 480, 360, { zoom: 1, cx: 0.5, cy: 0.5, rotation: 0 });
  assert.ok(g.left <= 0.5 && g.right >= 480 - 0.5 && g.top <= 0.5 && g.bot >= 360 - 0.5);
  assert.equal(coversFrameBox(1600, 1200, 480, 360, { zoom: 1, cx: 0.5, cy: 0.5, rotation: 0 }), true);
});

test("REGRESSION: a sub-cover zoom exposes backing inside the frame (the reported bug)", () => {
  // The zoom control floors at 0.1 — well below cover(1.0). At zoom<1 the photo
  // shrinks below the window and leaves a sliver of exposed backing. This is the
  // exact symptom the client screenshotted (white/field sliver at the shape edge).
  assert.equal(coversFrameBox(1200, 1600, 480, 360, { zoom: 0.9, cx: 0.5, cy: 0.5, rotation: 0 }), false);
  assert.equal(coversFrameBox(1200, 1600, 480, 360, { zoom: 0.5, cx: 0.5, cy: 0.5, rotation: 0 }), false);
  // A rotated pan also escapes the rotation-0-only clamp.
  assert.equal(coversFrameBox(1200, 1600, 480, 360, { zoom: 1, cx: 0.05, cy: 0.5, rotation: 12 }), false);
});

test("coverClampT ALWAYS yields a covering transform, across aspects/zoom/pan/rotation", () => {
  const zooms = [0.1, 0.5, 0.9, 1, 1.4, 3];
  const pans = [0.5, 0, 1, 0.05, 0.95, -0.3, 1.3];
  const rots = [0, 7, 15, -20, 45, 90];
  for (const { w, h } of BOXES) {
    for (const { iw, ih } of IMAGES) {
      for (const zoom of zooms) {
        for (const cx of pans) {
          for (const cy of pans) {
            for (const rotation of rots) {
              const clamped = coverClampT(iw, ih, w, h, { zoom, cx, cy, rotation });
              assert.equal(
                coversFrameBox(iw, ih, w, h, clamped),
                true,
                `uncovered after clamp: img ${iw}x${ih} win ${w}x${h} z${zoom} cx${cx} cy${cy} r${rotation} -> ${JSON.stringify(clamped)}`,
              );
            }
          }
        }
      }
    }
  }
});

test("coverClampT never lowers zoom below cover, and floors sub-cover zoom to exactly cover", () => {
  // zoom already at/above cover is preserved.
  assert.equal(coverClampT(1600, 1200, 480, 360, { zoom: 2, cx: 0.5, cy: 0.5, rotation: 0 }).zoom, 2);
  // sub-cover zoom floors to 1 (== cover) for an unrotated window.
  assert.equal(coverClampT(1600, 1200, 480, 360, { zoom: 0.3, cx: 0.5, cy: 0.5, rotation: 0 }).zoom, 1);
});

test("coverClampT is a fixed point on already-covering transforms (no drift)", () => {
  // A centered cover transform is left effectively unchanged (idempotent cover).
  const t = { zoom: 1.25, cx: 0.5, cy: 0.5, rotation: 0 };
  const a = coverClampT(1000, 1000, 400, 400, t);
  const b = coverClampT(1000, 1000, 400, 400, a);
  assert.equal(a.zoom, b.zoom);
  assert.ok(Math.abs(a.cx - b.cx) < 1e-9 && Math.abs(a.cy - b.cy) < 1e-9);
  assert.equal(coversFrameBox(1000, 1000, 400, 400, a), true);
});
