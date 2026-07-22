import test from "node:test";
import assert from "node:assert/strict";
import { createEditorialObstacleSolver } from "../../lib/editorial-obstacle-solver.mjs";

const BASE = {
  width: 1000,
  height: 1000,
  safe: { t: 0.08, b: 0.08, l: 0.08, r: 0.08 },
};

test("photo-band collisions move text wholly outside the protected seam", () => {
  const solver = createEditorialObstacleSolver({
    ...BASE,
    photoObstacle: { x: 80, y: 400, w: 840, h: 300 },
  });
  const result = solver.constrainToPhoto({ x: 120, y: 360, w: 700, h: 180 });
  assert.ok(result.y + result.h <= 360, "text clears the inflated seam and policy gap");
  assert.equal(solver.photoIsBand, true);
});

test("a box already clear of a photo seam remains byte-for-byte unchanged", () => {
  const solver = createEditorialObstacleSolver({
    ...BASE,
    photoObstacle: { x: 80, y: 500, w: 840, h: 300 },
  });
  const box = { x: 100, y: 100, w: 700, h: 200 };
  assert.equal(solver.constrainToPhoto(box), box);
});

test("side-photo collisions preserve the nearer readable field", () => {
  const solver = createEditorialObstacleSolver({
    ...BASE,
    photoObstacle: { x: 600, y: 100, w: 300, h: 800 },
  });
  const result = solver.constrainToPhoto({ x: 100, y: 200, w: 600, h: 200 });
  assert.equal(result.x, 100);
  assert.ok(result.x + result.w < 580, "text is clipped to the clear side plus policy gap");
});

test("a composable decoration centres text only when both stay inside safe bounds", () => {
  const solver = createEditorialObstacleSolver({
    ...BASE,
    decorationObstacles: [{
      canCompose: true,
      box: { x: 250, y: 250, w: 500, h: 500 },
    }],
  });
  const result = solver.resolveDecorations({ x: 300, y: 300, w: 200, h: 100 });
  assert.deepEqual(result, {
    x: 400,
    y: 450,
    w: 200,
    h: 100,
    composedOnShape: true,
  });
});

test("a non-composable decoration yields without moving text outside safe bounds", () => {
  const solver = createEditorialObstacleSolver({
    ...BASE,
    decorationObstacles: [{
      canCompose: false,
      box: { x: 350, y: 350, w: 300, h: 300 },
    }],
  });
  const result = solver.resolveDecorations({ x: 250, y: 300, w: 500, h: 300 });
  assert.ok(result.y >= 80);
  assert.ok(result.y + result.h <= 920);
  assert.equal(result.composedOnShape, undefined);
});

