// Layout-switch verification (task #59 — "solver-verified candidate only, never
// offered blind"): the pure qualification predicate, the roomier gains, the
// candidate walk, and the honest no-candidate contract. The impure render half
// (hooks/useLayoutSwitchVerification.js) injects `evaluate`; here it is stubbed
// with summaries, which is exactly the module's contract boundary.
import test from "node:test";
import assert from "node:assert/strict";
import {
  LAYOUT_VARIETY_RINGS,
  layoutVarietyRing,
  rotationOrderAfter,
  qualifyLayoutCandidate,
  layoutSwitchGains,
  pickVerifiedLayoutCandidate,
  roomierNeedsFromFindings,
  roomierGainMatchesNeeds,
  NO_LAYOUT_SWITCH_REPLY,
} from "../../lib/layout-switch-verification.mjs";
import { detectLayoutVariety } from "../../lib/assistant-intents.js";

const summary = (over = {}) => ({
  archetypeId: "editorial_split",
  renderHash: "aaaa:96x96",
  heroPainted: true,
  logoPainted: true,
  fontPx: { headline: 80, subtext: 30, date: 22 },
  droppedFields: [],
  blockers: 0,
  placedUids: [],
  unplacedUids: [],
  whitespaceTarget: 0.5,
  ...over,
});
const current = (over = {}) => summary({ archetypeId: "documentary", heroExpected: true, ...over });

// ── rings + rotation order ───────────────────────────────────────────────────
test("variety rings: both suited rings exist, ≥5 stops, no duplicates, disjoint current", () => {
  for (const ring of [LAYOUT_VARIETY_RINGS.photo, LAYOUT_VARIETY_RINGS.text]) {
    assert.ok(ring.length >= 5);
    assert.equal(new Set(ring).size, ring.length);
  }
  assert.deepEqual(layoutVarietyRing(true), [...LAYOUT_VARIETY_RINGS.photo]);
  assert.deepEqual(layoutVarietyRing(false), [...LAYOUT_VARIETY_RINGS.text]);
});

test("rotationOrderAfter: starts after current, wraps, excludes current; unknown id starts at head", () => {
  const ring = ["a", "b", "c", "d"];
  assert.deepEqual(rotationOrderAfter(ring, "b"), ["c", "d", "a"]);
  assert.deepEqual(rotationOrderAfter(ring, "d"), ["a", "b", "c"]);
  assert.deepEqual(rotationOrderAfter(ring, "zz"), ["a", "b", "c", "d"]);
  assert.deepEqual(rotationOrderAfter(ring, null), ["a", "b", "c", "d"]);
  assert.deepEqual(rotationOrderAfter([], "a"), []);
});

// ── the qualification predicate ──────────────────────────────────────────────
test("qualify: a differing, content-complete candidate passes", () => {
  const q = qualifyLayoutCandidate(current(), summary({ renderHash: "bbbb:96x96" }));
  assert.deepEqual(q, { ok: true, reasons: [] });
});

test("qualify: the same archetype or an identical render is refused (M2 — the no-op switch)", () => {
  assert.equal(qualifyLayoutCandidate(current(), summary({ archetypeId: "documentary", renderHash: "bbbb" })).ok, false);
  const q = qualifyLayoutCandidate(current({ renderHash: "same" }), summary({ renderHash: "same" }));
  assert.equal(q.ok, false);
  assert.ok(q.reasons.includes("identical-render"));
  // Unknown hashes don't fail the differs test (archetype identity + the
  // distinctness guard carry it) — e.g. a legacy current design.
  assert.equal(qualifyLayoutCandidate(current({ renderHash: null, archetypeId: null }), summary({ renderHash: "x" })).ok, true);
});

test("qualify: the required heading must paint (law #57)", () => {
  const q = qualifyLayoutCandidate(current(), summary({ heroPainted: false, renderHash: "b" }));
  assert.equal(q.ok, false);
  assert.ok(q.reasons.includes("heading-lost"));
  // A design with no heading copy doesn't demand one.
  assert.equal(qualifyLayoutCandidate(current({ heroExpected: false }), summary({ heroPainted: false, renderHash: "b" })).ok, true);
});

test("qualify: currently-painted content may not go dead — dropped fields, lost elements, new blockers", () => {
  const drops = qualifyLayoutCandidate(current(), summary({ droppedFields: ["subtext"], renderHash: "b" }));
  assert.equal(drops.ok, false);
  assert.ok(drops.reasons.some(r => r.startsWith("drops-content")));
  // A field ALREADY dropped today is not a regression.
  assert.equal(qualifyLayoutCandidate(current({ droppedFields: ["subtext"] }), summary({ droppedFields: ["subtext"], renderHash: "b" })).ok, true);
  const lost = qualifyLayoutCandidate(current({ placedUids: ["el_1"] }), summary({ unplacedUids: ["el_1"], renderHash: "b" }));
  assert.equal(lost.ok, false);
  assert.ok(lost.reasons.some(r => r.startsWith("element-lost")));
  const blockers = qualifyLayoutCandidate(current({ blockers: 0 }), summary({ blockers: 1, renderHash: "b" }));
  assert.equal(blockers.ok, false);
  assert.ok(blockers.reasons.includes("adds-blockers"));
  // Equal-or-fewer blockers pass (an already-imperfect design may still switch).
  assert.equal(qualifyLayoutCandidate(current({ blockers: 2 }), summary({ blockers: 1, renderHash: "b" })).ok, true);
});

// ── gains (the roomier evidence) ─────────────────────────────────────────────
test("gains: places elements, restores fields, grows roles, budget growth", () => {
  const g = layoutSwitchGains(
    current({ unplacedUids: ["e1"], droppedFields: ["dateText"], fontPx: { headline: 40, subtext: 20, date: 18 }, whitespaceTarget: 0.62 }),
    summary({ placedUids: ["e1"], droppedFields: [], fontPx: { headline: 60, subtext: 20, date: 18 }, whitespaceTarget: 0.1 }),
  );
  assert.deepEqual(g.placesElements, ["e1"]);
  assert.deepEqual(g.restoresFields, ["dateText"]);
  assert.deepEqual(g.growsRoles, ["hero"]);
  assert.equal(g.budgetGrows, true);   // target 0.62 → budget 2; target 0.1 → budget 5
  assert.equal(g.any, true);
  const none = layoutSwitchGains(current(), summary({ renderHash: "b" }));
  assert.equal(none.any, false);
});

// ── the candidate walk ───────────────────────────────────────────────────────
test("pick: preferred seeds first, then ring rotation; first QUALIFYING candidate wins", () => {
  const evals = {
    editorial_split: summary({ archetypeId: "editorial_split", heroPainted: false, renderHash: "b" }), // preferred but disqualified
    shape_cutout: summary({ archetypeId: "shape_cutout", renderHash: "c" }),
  };
  const order = [];
  const picked = pickVerifiedLayoutCandidate({
    current: current(),
    ring: ["documentary", "editorial_split", "shape_cutout"],
    preferred: ["editorial_split"],
    evaluate: id => { order.push(id); return evals[id] || null; },
  });
  assert.equal(picked.archetypeId, "shape_cutout");
  assert.deepEqual(order, ["editorial_split", "shape_cutout"]);   // current never evaluated
});

test("pick: none qualifies → null (the honest no-candidate verdict), and an evaluate throw fails closed", () => {
  const picked = pickVerifiedLayoutCandidate({
    current: current(),
    ring: ["documentary", "editorial_split"],
    evaluate: () => { throw new Error("render exploded"); },
  });
  assert.equal(picked, null);
  assert.equal(pickVerifiedLayoutCandidate({ current: current(), ring: ["documentary"], evaluate: () => null }), null);
});

test("pick: the require clause narrows to need-matching gains (the roomier contract)", () => {
  const picked = pickVerifiedLayoutCandidate({
    current: current({ unplacedUids: ["e1"] }),
    ring: ["documentary", "editorial_split", "shape_cutout"],
    evaluate: id => id === "shape_cutout"
      ? summary({ archetypeId: id, renderHash: "c", placedUids: ["e1"] })
      : summary({ archetypeId: id, renderHash: "b" }),
    require: (candidate, gains) => gains.placesElements.length > 0,
  });
  assert.equal(picked.archetypeId, "shape_cutout");
  assert.deepEqual(picked.gains.placesElements, ["e1"]);
});

// ── roomier needs from the live findings (born-clean gate) ───────────────────
test("roomier needs: only roomier-class findings trigger the deferred pass", () => {
  assert.equal(roomierNeedsFromFindings([]), null);
  assert.equal(roomierNeedsFromFindings([{ id: "contrast-fail" }]), null);
  const needs = roomierNeedsFromFindings([
    { id: "crowding-advisory" },
    { id: "element-unplaced:e1", unplacedElement: { uid: "e1" } },
    { id: "copy-over-capacity", field: "headline" },
    { id: "type-size-floor", field: "headline" },
  ]);
  assert.equal(needs.crowding, true);
  assert.deepEqual(needs.unplacedUids, ["e1"]);
  assert.deepEqual(needs.overCapacityRoles, ["hero"]);
  assert.equal(needs.atFloor, true);
});

test("roomier gains must answer the need — a size gain doesn't excuse crowding and vice versa", () => {
  const crowdingNeed = { crowding: true, unplacedUids: [], overCapacityRoles: [], atFloor: false };
  assert.equal(roomierGainMatchesNeeds({ budgetGrows: true, placesElements: [], growsRoles: [], restoresFields: [] }, crowdingNeed), true);
  assert.equal(roomierGainMatchesNeeds({ budgetGrows: false, placesElements: [], growsRoles: ["hero"], restoresFields: [] }, crowdingNeed), false);
  const sizeNeed = { crowding: false, unplacedUids: [], overCapacityRoles: ["hero"], atFloor: false };
  assert.equal(roomierGainMatchesNeeds({ budgetGrows: false, placesElements: [], growsRoles: ["hero"], restoresFields: [] }, sizeNeed), true);
  assert.equal(roomierGainMatchesNeeds({ budgetGrows: true, placesElements: [], growsRoles: [], restoresFields: [] }, sizeNeed), false);
});

// ── surface contracts ────────────────────────────────────────────────────────
test("the honest no-candidate reply exists, offers no switch, and names the way forward", () => {
  assert.ok(NO_LAYOUT_SWITCH_REPLY.length > 40);
  assert.match(NO_LAYOUT_SWITCH_REPLY, /kept this one/i);
  assert.match(NO_LAYOUT_SWITCH_REPLY, /trimming|removing/i);
  assert.doesNotMatch(NO_LAYOUT_SWITCH_REPLY, /\bswitched\b/i);   // never claims a switch
});

test("detectLayoutVariety: the chip message and typed variants fire; unrelated asks don't", () => {
  assert.equal(detectLayoutVariety("Try another layout for this design — keep my words."), true);
  assert.equal(detectLayoutVariety("show me a different look"), true);
  assert.equal(detectLayoutVariety("give me a fresh composition"), true);
  assert.equal(detectLayoutVariety("make the headline bigger"), false);
  assert.equal(detectLayoutVariety(""), false);
});
