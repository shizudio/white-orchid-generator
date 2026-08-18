import test from "node:test";
import assert from "node:assert/strict";
import { briefSeed, seededRotationPick } from "../../lib/landing-archetype-rotation.mjs";

/* ── SEEDED LANDING ROTATION (task #71) ───────────────────────────────────────
   Client ruling 2026-08-18: "it is always the same composition that is generated
   (image on the right), can u randomize base on the template we have?" — the
   initial archetype for a fresh brief is a deterministic seeded rotation over
   the suited pool. These tests pin the pick function's contract:
   same seed → same pick; distinct briefs spread; caps respected; the previous
   pick never repeats; unsuitable ids can never appear (pool-closed). */

// The real photo-led intent pool for text_post (route.js PHOTO_LED_BY_INTENT),
// duplicated here as a FIXTURE (the route module is not importable — it pulls
// server-only deps); the pool contents are an input, not this module's fact.
const PHOTO_POOL = [
  "editorial_split", "floated_card", "shape_cutout", "message_pill",
  "portrait_credential", "documentary", "full_bleed_duotone",
];

test("determinism — same brief + same ring state → the same pick, every time", () => {
  const args = { pool: PHOTO_POOL, seedText: "open house on friday", recentPicks: ["documentary"] };
  const first = seededRotationPick(args);
  for (let i = 0; i < 5; i++) assert.equal(seededRotationPick(args), first);
  assert.ok(PHOTO_POOL.includes(first));
});

test("briefSeed — deterministic, non-negative, text-sensitive", () => {
  assert.equal(briefSeed("hello"), briefSeed("hello"));
  assert.ok(briefSeed("hello") >= 0);
  assert.notEqual(briefSeed("hello"), briefSeed("hello!"));
  assert.equal(briefSeed(""), 0);
  assert.equal(briefSeed(null), 0);
});

test("distinct briefs spread over the pool — ≥3 archetypes across 6 briefs", () => {
  const briefs = [
    "a post about our open house next week",
    "welcome our new teacher Ms Tan",
    "sports day photos from friday",
    "we are hiring an assistant educator",
    "term 3 enrolment now open",
    "a quiet moment in the garden classroom",
  ];
  const ring = [];
  const picks = [];
  for (const b of briefs) {
    const id = seededRotationPick({ pool: PHOTO_POOL, seedText: b, recentPicks: ring });
    picks.push(id);
    ring.push(id);
    if (ring.length > 12) ring.shift();
  }
  assert.ok(new Set(picks).size >= 3, `expected ≥3 distinct archetypes, got ${JSON.stringify(picks)}`);
  // Consecutive generations visibly differ.
  for (let i = 1; i < picks.length; i++) assert.notEqual(picks[i], picks[i - 1]);
});

test("pool-closed — only suitable ids can ever be picked (never a text-only tile)", () => {
  for (let i = 0; i < 40; i++) {
    const id = seededRotationPick({ pool: PHOTO_POOL, seedText: `brief ${i}`, recentPicks: [] });
    assert.ok(PHOTO_POOL.includes(id));
  }
});

test("frequency caps respected — a capExceeded id is skipped while alternatives exist", () => {
  for (let i = 0; i < 20; i++) {
    const id = seededRotationPick({
      pool: PHOTO_POOL,
      seedText: `brief number ${i}`,
      recentPicks: ["floated_card"],
      capExceeded: x => x === "editorial_split",
    });
    assert.notEqual(id, "editorial_split");
    assert.notEqual(id, "floated_card"); // last pick never repeats either
  }
});

test("never the previous pick — an identical brief re-submitted still rotates", () => {
  const ring = [];
  let previous = null;
  for (let i = 0; i < 6; i++) {
    const id = seededRotationPick({ pool: PHOTO_POOL, seedText: "same brief every time", recentPicks: ring });
    assert.notEqual(id, previous);
    previous = id;
    ring.push(id);
  }
});

test("caps saturated — falls back to the least-recently-used non-repeat, deterministically", () => {
  const ring = ["documentary", "editorial_split", "editorial_split", "floated_card"];
  const id = seededRotationPick({
    pool: ["editorial_split", "floated_card", "documentary"],
    seedText: "anything",
    recentPicks: ring,
    capExceeded: () => true, // every candidate busts its cap
  });
  // floated_card is the last pick (excluded); documentary (1 use) beats
  // editorial_split (2 uses).
  assert.equal(id, "documentary");
});

test("degenerate inputs — empty pool → null; single-id pool → that id; junk-safe", () => {
  assert.equal(seededRotationPick({ pool: [], seedText: "x" }), null);
  assert.equal(seededRotationPick({}), null);
  assert.equal(seededRotationPick({ pool: ["only_one"], seedText: "x", recentPicks: ["only_one"] }), "only_one");
  const id = seededRotationPick({ pool: PHOTO_POOL, seedText: "x", recentPicks: null, capExceeded: () => { throw new Error("boom"); } });
  assert.ok(PHOTO_POOL.includes(id)); // a throwing predicate is treated as cap-clear
});
