import test from "node:test";
import assert from "node:assert/strict";
import { resolveScenePointerTarget, pointerClearsSelection } from "../../lib/editor-input-controller.mjs";

const bounds = (x, y, w, h) => ({ x, y, w, h });
const scene = [
  { id:"shape:petal", type:"shape", bounds:bounds(0,0,100,100), z:1, interactive:true },
  { id:"text:hero", type:"text", role:"hero", bounds:bounds(10,10,70,40), z:2, interactive:true },
  { id:"furniture:date", type:"furniture", role:"date", bounds:bounds(15,15,8,8), z:3, interactive:true },
  { id:"logo:primary", type:"logo", bounds:bounds(70,70,20,20), z:4, interactive:true },
];

test("semantic target order keeps copy reachable over transparent shapes", () => {
  assert.deepEqual(resolveScenePointerTarget(scene, 20, 20)?.role, "furn_date");
  assert.equal(resolveScenePointerTarget(scene, 40, 40)?.role, "hero");
});

test("an already-selected shape keeps direct manipulation priority", () => {
  const hit = resolveScenePointerTarget(scene, 20, 20, { selectedShapeId:"shape:petal" });
  assert.equal(hit?.kind, "shape");
  assert.equal(hit?.selected, true);
});

test("logo and shape identities pass through unchanged", () => {
  assert.equal(resolveScenePointerTarget(scene, 80, 80)?.element.id, "logo:primary");
  assert.equal(resolveScenePointerTarget(scene, 5, 5)?.element.id, "shape:petal");
});

// editorial_split-style scene: text/shape on the left, the painted photo on the
// right. The bare photo must be selectable (invariant 9), but any element painted
// above it keeps hit-order priority.
const photoScene = [
  { id:"photo:primary", type:"photo", bounds:bounds(500,0,500,1000), z:10, interactive:true },
  { id:"text:hero", type:"text", role:"hero", bounds:bounds(40,40,300,120), z:40, interactive:true },
  { id:"shape:leaf", type:"shape", bounds:bounds(560,60,120,120), z:20, interactive:true },
];

test("a bare photo point resolves to the photo element", () => {
  const hit = resolveScenePointerTarget(photoScene, 900, 60);
  assert.equal(hit?.kind, "photo");
  assert.equal(hit?.element.id, "photo:primary");
});

test("elements painted above the photo keep hit-order priority", () => {
  // A shape overlapping the photo wins over the photo underneath it.
  assert.equal(resolveScenePointerTarget(photoScene, 600, 100)?.kind, "shape");
  // Copy on the non-photo side is unaffected.
  assert.equal(resolveScenePointerTarget(photoScene, 120, 80)?.role, "hero");
});

test("a click outside the painted photo falls through to background", () => {
  // Left column, below the hero copy — no element there.
  assert.equal(resolveScenePointerTarget(photoScene, 120, 400), null);
});

// The document click-outside-to-deselect contract. Since the refactor unified
// inspector-open state into editorSelection, a pointerdown inside the inspector
// panel (a flex sibling of the canvas shell) must NEVER clear the selection —
// otherwise the panel closes the instant a user touches any control inside it.
test("pointerdown inside the canvas shell never deselects", () => {
  assert.equal(pointerClearsSelection({ withinCanvasShell: true, withinInspector: false }), false);
});

test("pointerdown inside the inspector panel never deselects (panel-close regression guard)", () => {
  // Outside the shell but inside the inspector subtree — the exact click that
  // used to unmount the panel mid-edit.
  assert.equal(pointerClearsSelection({ withinCanvasShell: false, withinInspector: true }), false);
});

test("pointerdown on empty chrome / the canvas backdrop deselects", () => {
  assert.equal(pointerClearsSelection({ withinCanvasShell: false, withinInspector: false }), true);
});
