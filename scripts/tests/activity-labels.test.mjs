import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeActivityLabel,
  labelsAlike,
  groupImagesByActivity,
  imageActivityLabel,
  NOT_CATEGORIZED_KEY,
  NOT_CATEGORIZED_LABEL,
} from "../../lib/activity-labels.mjs";

/* ── Normalizer (client ruling 2026-08-03: generic canonicalization only —
   zero-brand-facts law: no domain vocabulary anywhere in the logic) ───────── */

test("normalizeActivityLabel lowercases, trims, and collapses whitespace", () => {
  assert.equal(normalizeActivityLabel("  Outdoor   Play  "), "outdoor play");
});

test("normalizeActivityLabel strips punctuation and quotes the model may emit", () => {
  assert.equal(normalizeActivityLabel('"painting together."'), "painting together");
  assert.equal(normalizeActivityLabel("reading, together!"), "reading together");
});

test("normalizeActivityLabel drops a leading article and caps at 3 words", () => {
  assert.equal(normalizeActivityLabel("a nature walk"), "nature walk");
  assert.equal(normalizeActivityLabel("the children are painting a mural outside"), "children are painting");
});

test("normalizeActivityLabel returns '' for junk (callers treat as unlabeled)", () => {
  assert.equal(normalizeActivityLabel(null), "");
  assert.equal(normalizeActivityLabel(undefined), "");
  assert.equal(normalizeActivityLabel("   "), "");
  assert.equal(normalizeActivityLabel("?!."), "");
});

/* ── Near-duplicate merging (pure token-overlap string logic, no AI) ──────── */

test("labels sharing the activity gerund merge (kids painting ~ children painting)", () => {
  assert.ok(labelsAlike("kids painting", "children painting"));
});

test("subset labels merge (painting ⊂ children painting; plural-insensitive)", () => {
  assert.ok(labelsAlike("painting", "children painting"));
  assert.ok(labelsAlike("kid painting", "kids painting")); // singular-ish stem
});

test("same subject + different activity does NOT merge", () => {
  assert.ok(!labelsAlike("children painting", "children reading"));
  assert.ok(!labelsAlike("outdoor play", "outdoor lunch"));
});

test("labelsAlike never throws on junk", () => {
  assert.ok(!labelsAlike("", "painting"));
  assert.ok(!labelsAlike("", ""));
});

/* ── Grouping: content-driven "By activity" view ──────────────────────────── */

const img = (id, label, createdAt, extra = {}) => ({
  id,
  created_at: createdAt,
  metadata: label ? { activity: { label, ...extra } } : {},
});

test("groups by detected activity: merged labels form ONE group, majority label wins", () => {
  const groups = groupImagesByActivity([
    img("a", "children painting", "2026-08-01T10:00:00Z"),
    img("b", "kids painting", "2026-08-02T10:00:00Z"),
    img("c", "children painting", "2026-08-03T10:00:00Z"),
    img("d", "reading together", "2026-07-01T10:00:00Z"),
  ]);
  assert.equal(groups.length, 2);
  // Biggest group first; its display label is the most-populated member label.
  assert.equal(groups[0].label, "children painting");
  assert.deepEqual(groups[0].items.map(i => i.id), ["c", "b", "a"]); // newest first
  assert.equal(groups[1].label, "reading together");
});

test("unlabeled rows land in ONE honest 'Not categorized yet' group, last", () => {
  const groups = groupImagesByActivity([
    img("a", null, "2026-08-02T10:00:00Z"),
    img("b", "water play", "2026-07-01T10:00:00Z"),
    img("c", null, "2026-08-03T10:00:00Z"),
  ]);
  const last = groups[groups.length - 1];
  assert.equal(last.key, NOT_CATEGORIZED_KEY);
  assert.equal(last.label, NOT_CATEGORIZED_LABEL);
  assert.equal(last.categorized, false);
  assert.deepEqual(last.items.map(i => i.id), ["c", "a"]); // newest first
  // Even though unlabeled rows are NEWER, they never displace real groups.
  assert.equal(groups[0].label, "water play");
});

test("groups sort biggest first, ties broken by newest", () => {
  const groups = groupImagesByActivity([
    img("a", "gardening", "2026-08-01T10:00:00Z"),
    img("b", "gardening", "2026-08-01T11:00:00Z"),
    img("c", "cooking", "2026-08-03T10:00:00Z"),
    img("d", "singing", "2026-07-01T10:00:00Z"),
  ]);
  assert.deepEqual(groups.map(g => g.label), ["gardening", "cooking", "singing"]);
});

test("owner-authored labels group exactly like model labels (same view, one voice)", () => {
  const groups = groupImagesByActivity([
    img("a", "sand play", "2026-08-01T10:00:00Z", { authorship: "owner" }),
    img("b", "sand play", "2026-08-02T10:00:00Z", { model: "gpt-4o-mini" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
});

test("labels are re-normalized at read time (stored junk can't fork groups)", () => {
  const groups = groupImagesByActivity([
    img("a", "Water Play", "2026-08-01T10:00:00Z"),
    img("b", "water play", "2026-08-02T10:00:00Z"),
  ]);
  assert.equal(groups.length, 1);
});

test("imageActivityLabel reads the stored label, '' when absent", () => {
  assert.equal(imageActivityLabel(img("a", "Water Play", "")), "water play");
  assert.equal(imageActivityLabel(img("a", null, "")), "");
  assert.equal(imageActivityLabel(null), "");
});

test("groupImagesByActivity never throws on junk input", () => {
  assert.deepEqual(groupImagesByActivity(null), []);
  assert.deepEqual(groupImagesByActivity(undefined), []);
  const groups = groupImagesByActivity([{}]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, NOT_CATEGORIZED_KEY);
});
