import test from "node:test";
import assert from "node:assert/strict";
import { computeReadyVerdict, runLocalAudit, THUMB_MIN_PX } from "../../lib/audit-local.js";

// A caption fit-shrunk to 40px in a 1080px canvas projects to 40·130/1080 ≈ 4.8px in
// the 3-up IG feed grid — below the THUMB_MIN_PX (6.5) legibility floor.
const readyFor = (canvasW, subtextPx = 40) => ({
  canvasW,
  fontPx: { headline: 220, subtext: subtextPx, date: 0 },
  textBoxes: [], logoBox: null, pinned: [],
});

const signalFor = (dimensionId, canvasW, { floored = true } = {}) => ({
  dimensionId,
  hasText: true,
  hasMedia: false,
  // Flat, legible solid field so the contrast blocker never fires and we isolate the
  // thumbnail-legibility gate.
  zoneContrast: { flat: true, mean: 8 },
  flooredRoles: floored ? [{ label: "Body text" }] : [],
  ready: readyFor(canvasW),
  copy: {},
});

test("thumb-legibility fires on the IG feed grid when a floored caption projects below the floor", () => {
  const { issues } = computeReadyVerdict(signalFor("ig_square", 1080), "ig_square");
  const hit = issues.find(i => i.id === "thumb-legibility");
  assert.ok(hit, "expected a thumb-legibility finding on ig_square");
  assert.equal(hit.field, "subtext", "the finding names the fit-shrunk copy field for a one-tap shorten action");
  assert.equal(hit.fix, null, "no incoherent band fix on a size finding");
  assert.ok(4.8 < THUMB_MIN_PX);
});

test("thumb-legibility does NOT false-positive on wide platform formats (twitter/facebook/banner)", () => {
  for (const [dim, w] of [["twitter", 1600], ["facebook", 1200], ["banner", 1500]]) {
    const { issues } = computeReadyVerdict(signalFor(dim, w), dim);
    assert.ok(!issues.some(i => i.id === "thumb-legibility"),
      `${dim}: a wide format is never shown as a 3-up square thumbnail — must not fire`);
  }
});

test("thumb-legibility verifies the remedy: it does not fire when the role is not fit-shrunk", () => {
  // Same tiny projected size, but the caption is NOT floored — shortening wouldn't
  // grow it, so claiming "shortening lets it render larger" would be dishonest.
  const { issues } = computeReadyVerdict(signalFor("ig_square", 1080, { floored: false }), "ig_square");
  assert.ok(!issues.some(i => i.id === "thumb-legibility"));
});

test("type-size-floor carries the fit-shrunk field so its action can shorten the copy", () => {
  const findings = runLocalAudit({
    dimensionId: "ig_square", hasText: true,
    zoneContrast: { flat: true, mean: 8 },
    flooredRoles: [{ label: "Body text" }],
    ready: { textBoxes: [], logoBox: null, pinned: [] },
    copy: {},
  });
  const floor = findings.find(f => f.id === "type-size-floor");
  assert.ok(floor, "expected a type-size-floor finding");
  assert.equal(floor.field, "subtext");
});

// ── (2026-07-15) copy-stump: the stored-stump advisor surface ────────────────
const stumpSignal = (copy, copyAuthors) => ({
  dimensionId: "ig_square", hasText: true,
  zoneContrast: { flat: true, mean: 8 },
  flooredRoles: [],
  ready: { textBoxes: [], logoBox: null, pinned: [] },
  copy, copyAuthors,
});

test("copy-stump fires on a stored AI-authored dangling fragment and carries the standard action hint", () => {
  const { issues } = computeReadyVerdict(stumpSignal({ subtext: "On the of" }, { subtext: "ai" }), "ig_square");
  const hit = issues.find(f => f.id === "copy-stump");
  assert.ok(hit, "expected a copy-stump finding");
  assert.equal(hit.field, "subtext");
  assert.equal(hit.dropped[0].field, "subtext", "the dropped hint drives the Tighten/Edit/Leave-off action row");
  assert.ok(hit.message.includes("On the of"), "names the actual words (law 2)");
});

test("copy-stump never fires on owner copy, clean endings, or content-word endings", () => {
  for (const [copy, authors] of [
    [{ subtext: "On the of" }, { subtext: "owner" }],          // owner-typed (law 5)
    [{ subtext: "On the of" }, {}],                             // no authorship record
    [{ subtext: "Welcome back to school." }, { subtext: "ai" }],// clean ending
    [{ subtext: "A bright new term" }, { subtext: "ai" }],      // content-word ending
  ]) {
    const { issues } = computeReadyVerdict(stumpSignal(copy, authors), "ig_square");
    assert.ok(!issues.some(f => f.id === "copy-stump"), JSON.stringify(copy));
  }
});
