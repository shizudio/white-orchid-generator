import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPORT_FORMATS,
  normalizeExportFormat,
  buildExportRow,
  legacyExportRow,
  isMissingColumn,
  presentExportRow,
  groupExportsByDay,
  exportRecordFields,
} from "../../lib/export-history.mjs";

/* ── Export history (client ruling 2026-07-29: records store the REAL exported
   PNG; "for history, i should be easily going back to the session"). The same
   helpers serve /api/exports (both DB vintages) and the client payload builder
   in useExportOrchestration. */

test("format vocabulary is png|jpeg, with jpg aliased", () => {
  assert.deepEqual(EXPORT_FORMATS, ["png", "jpeg"]);
  assert.equal(normalizeExportFormat("png"), "png");
  assert.equal(normalizeExportFormat("jpeg"), "jpeg");
  assert.equal(normalizeExportFormat("JPG"), "jpeg");
  assert.equal(normalizeExportFormat("webp"), null);
  assert.equal(normalizeExportFormat(null), null);
});

test("buildExportRow produces the new-shape row", () => {
  const row = buildExportRow({
    sessionId: "s_1", dimensionId: "ig_square", format: "png",
    headline: "Open house", storagePath: "exports/1.png",
  });
  assert.deepEqual(row, {
    session_id: "s_1",
    dimension_id: "ig_square",
    format: "png",
    storage_path: "exports/1.png",
    headline: "Open house",
    metadata: {},
  });
});

test("buildExportRow defaults: no session → null, bad format → png, headline capped", () => {
  const row = buildExportRow({ format: "gif", headline: "x".repeat(300), storagePath: "p" });
  assert.equal(row.session_id, null);
  assert.equal(row.dimension_id, null);
  assert.equal(row.format, "png");
  assert.equal(row.headline.length, 200);
});

/* ── The un-migrated-DB fallback packing ──────────────────────────────────── */

test("legacyExportRow packs the real fields into metadata and satisfies old NOT NULLs", () => {
  const row = buildExportRow({
    sessionId: "s_1", dimensionId: "story", format: "jpeg",
    headline: "H", storagePath: "exports/2.jpg", metadata: { size: 10 },
  });
  const legacy = legacyExportRow(row);
  // No new-shape columns in the legacy insert payload (they don't exist yet).
  assert.ok(!("session_id" in legacy));
  assert.ok(!("dimension_id" in legacy));
  assert.ok(!("format" in legacy));
  // Old scaffold NOT NULL columns get honest fillers.
  assert.equal(legacy.post_type, "export");
  assert.equal(legacy.channel, "story");
  // The REAL fields ride metadata, marked for the migration's backfill UPDATE.
  assert.equal(legacy.metadata.session_id, "s_1");
  assert.equal(legacy.metadata.dimension_id, "story");
  assert.equal(legacy.metadata.format, "jpeg");
  assert.equal(legacy.metadata.pre_migration, true);
  assert.equal(legacy.metadata.size, 10);
  assert.equal(legacy.storage_path, "exports/2.jpg");
  assert.equal(legacy.headline, "H");
});

test("legacyExportRow with no dimension still satisfies channel NOT NULL", () => {
  const legacy = legacyExportRow(buildExportRow({ storagePath: "p", format: "png" }));
  assert.equal(legacy.channel, "unknown");
});

test("isMissingColumn matches the un-migrated signatures, not config problems", () => {
  assert.ok(isMissingColumn({ code: "42703" }));
  assert.ok(isMissingColumn({ code: "PGRST204" }));
  assert.ok(isMissingColumn({ message: "column exports.session_id does not exist" }));
  assert.ok(isMissingColumn({ message: "Could not find the 'session_id' column of 'exports' in the schema cache" }));
  // A missing TABLE (42P01) is a config problem, not a missing column — it must
  // fall through to the {configured:false} path, never the legacy-retry path.
  assert.ok(!isMissingColumn({ code: "42P01", message: 'relation "exports" does not exist' }));
  assert.ok(!isMissingColumn(null));
});

/* ── Presentation: both vintages come out identical ────────────────────────── */

test("presentExportRow passes a migrated (new-shape) row through", () => {
  const row = {
    id: "e1", created_at: "2026-07-29T10:00:00Z", session_id: "s_1",
    dimension_id: "ig_square", format: "png", storage_path: "exports/1.png",
    headline: "H", metadata: { size: 5 },
  };
  const out = presentExportRow(row);
  assert.equal(out.session_id, "s_1");
  assert.equal(out.dimension_id, "ig_square");
  assert.equal(out.format, "png");
});

test("presentExportRow reads a pre-migration row's real fields out of metadata", () => {
  const stored = {
    id: "e2", created_at: "2026-07-29T10:00:00Z", storage_path: "exports/2.jpg",
    headline: "H", post_type: "export", channel: "story",
    metadata: { session_id: "s_9", dimension_id: "story", format: "jpeg", pre_migration: true },
  };
  const out = presentExportRow(stored);
  assert.equal(out.session_id, "s_9");
  assert.equal(out.dimension_id, "story");
  assert.equal(out.format, "jpeg");
  assert.equal(out.storage_path, "exports/2.jpg");
  // The client shape carries none of the old scaffold columns' semantics.
  assert.ok(!("post_type" in out));
  assert.ok(!("channel" in out));
});

test("presentExportRow round-trips the legacy packing exactly (fallback ⇄ presentation)", () => {
  const original = buildExportRow({
    sessionId: "s_rt", dimensionId: "banner", format: "jpeg",
    headline: "Round trip", storagePath: "exports/rt.jpg",
  });
  const asStored = { id: "x", created_at: "2026-07-29T00:00:00Z", ...legacyExportRow(original) };
  const out = presentExportRow(asStored);
  assert.equal(out.session_id, original.session_id);
  assert.equal(out.dimension_id, original.dimension_id);
  assert.equal(out.format, original.format);
  assert.equal(out.headline, original.headline);
});

/* ── Day grouping (Exports tab: newest first, grouped by day) ──────────────── */

test("groupExportsByDay sorts newest-first and buckets by calendar day", () => {
  const now = new Date("2026-07-29T15:00:00").getTime();
  const rows = [
    { id: "a", created_at: "2026-07-28T09:00:00" },
    { id: "b", created_at: "2026-07-29T12:00:00" },
    { id: "c", created_at: "2026-07-29T08:00:00" },
    { id: "d", created_at: "2026-07-10T08:00:00" },
  ];
  const groups = groupExportsByDay(rows, { now });
  assert.deepEqual(groups.map(g => g.label), ["Today", "Yesterday", "10 Jul 2026"]);
  assert.deepEqual(groups[0].items.map(i => i.id), ["b", "c"]);
  assert.deepEqual(groups[1].items.map(i => i.id), ["a"]);
});

test("groupExportsByDay tolerates junk input", () => {
  assert.deepEqual(groupExportsByDay(null), []);
  assert.deepEqual(groupExportsByDay([]), []);
});

/* ── The client POST payload builder (useExportOrchestration) ──────────────── */

test("exportRecordFields builds the exact multipart field set /api/exports reads", () => {
  assert.deepEqual(
    exportRecordFields({ sessionId: "s_1", dimensionId: "ig_square", format: "jpeg", headline: "H" }),
    { session_id: "s_1", dimension_id: "ig_square", format: "jpeg", headline: "H" },
  );
  // Empty-safe: a pre-session export still records (empty strings, not "null").
  assert.deepEqual(
    exportRecordFields({}),
    { session_id: "", dimension_id: "", format: "png", headline: "" },
  );
});
