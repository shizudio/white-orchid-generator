import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_SOURCE_TYPES,
  normalizeSourceType,
  legacySourceType,
  isCheckViolation,
  presentImageRow,
  groupImagesBySession,
} from "../../lib/media-taxonomy.mjs";

/* ── The generated|uploaded taxonomy (client ruling 2026-07-29) ─────────────
   Every boundary maps legacy values instead of rejecting them, so a stale
   client or an un-migrated DB degrades instead of 400ing/500ing. */

test("canonical vocabulary is exactly generated|uploaded", () => {
  assert.deepEqual(CANONICAL_SOURCE_TYPES, ["generated", "uploaded"]);
});

test("normalizeSourceType accepts the new values verbatim", () => {
  assert.equal(normalizeSourceType("generated"), "generated");
  assert.equal(normalizeSourceType("uploaded"), "uploaded");
});

test("normalizeSourceType maps the legacy vocabulary (stale-client degradation)", () => {
  assert.equal(normalizeSourceType("midjourney_render"), "generated");
  assert.equal(normalizeSourceType("real_photo"), "uploaded");
});

test("normalizeSourceType rejects unknown values with null (caller 400s)", () => {
  assert.equal(normalizeSourceType("dalle"), null);
  assert.equal(normalizeSourceType(""), null);
  assert.equal(normalizeSourceType(null), null);
  assert.equal(normalizeSourceType(undefined), null);
});

test("legacySourceType is the exact inverse used by the un-migrated-DB write fallback", () => {
  assert.equal(legacySourceType("generated"), "midjourney_render");
  assert.equal(legacySourceType("uploaded"), "real_photo");
  assert.equal(legacySourceType("nope"), null);
  // Round-trip: canonical → legacy → canonical is the identity.
  for (const value of CANONICAL_SOURCE_TYPES) {
    assert.equal(normalizeSourceType(legacySourceType(value)), value);
  }
});

test("isCheckViolation recognises the old CHECK constraint rejecting the new vocabulary", () => {
  assert.ok(isCheckViolation({ code: "23514", message: "violates check constraint" }));
  assert.ok(isCheckViolation({ message: 'new row violates check constraint "images_source_type_check"' }));
  assert.ok(!isCheckViolation({ code: "42703", message: "column does not exist" }));
  assert.ok(!isCheckViolation(null));
});

test("presentImageRow maps legacy stored values so GET only ever speaks the new vocabulary", () => {
  assert.equal(presentImageRow({ source_type: "midjourney_render" }).source_type, "generated");
  assert.equal(presentImageRow({ source_type: "real_photo" }).source_type, "uploaded");
  // Already-canonical rows pass through untouched (same object — no churn).
  const row = { source_type: "generated", consent_status: "na" };
  assert.equal(presentImageRow(row), row);
  // Consent stays orthogonal — never rewritten by the mapping.
  const mapped = presentImageRow({ source_type: "real_photo", consent_status: "pending" });
  assert.equal(mapped.consent_status, "pending");
  // Defensive: junk in, junk out (never throws).
  assert.equal(presentImageRow(null), null);
});

/* ── Activity grouping ("the system can auto group them base on the activity") */

const img = (id, sessionId, createdAt) => ({ id, session_id: sessionId, created_at: createdAt });

test("groupImagesBySession groups by session, newest activity first", () => {
  const groups = groupImagesBySession([
    img("a", "s_old", "2026-07-01T10:00:00Z"),
    img("b", "s_new", "2026-07-20T10:00:00Z"),
    img("c", "s_old", "2026-07-02T10:00:00Z"),
  ], {
    s_old: { title: "Open house" },
    s_new: { title: "Bake sale" },
  });
  assert.deepEqual(groups.map(g => g.sessionId), ["s_new", "s_old"]);
  assert.deepEqual(groups.map(g => g.title), ["Bake sale", "Open house"]);
  assert.deepEqual(groups[1].items.map(i => i.id), ["a", "c"]);
});

test("null session_id rows land in ONE honest 'Earlier / unlinked' group, last", () => {
  const groups = groupImagesBySession([
    img("a", null, "2026-07-25T10:00:00Z"),
    img("b", "s1", "2026-07-01T10:00:00Z"),
    img("c", undefined, "2026-07-26T10:00:00Z"),
  ], { s1: { title: "Post" } });
  assert.equal(groups.length, 2);
  const last = groups[groups.length - 1];
  assert.equal(last.sessionId, null);
  assert.equal(last.title, "Earlier / unlinked");
  assert.deepEqual(last.items.map(i => i.id), ["a", "c"]);
  // Honesty: even though the unlinked rows are NEWER, they never fake a
  // session group — they stay in the unlinked bucket at the end.
  assert.equal(groups[0].sessionId, "s1");
});

test("a session id with no matching session record still groups, with a fallback title", () => {
  const groups = groupImagesBySession([img("a", "s_gone", "2026-07-01T10:00:00Z")], {});
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sessionId, "s_gone");
  assert.equal(groups[0].knownSession, false);
  assert.equal(groups[0].title, "Untitled post");
});

test("groupImagesBySession never throws on junk input", () => {
  assert.deepEqual(groupImagesBySession(null), []);
  assert.deepEqual(groupImagesBySession(undefined, undefined), []);
  assert.equal(groupImagesBySession([{}]).length, 1); // one unlinked group
});
