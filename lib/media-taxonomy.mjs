// ── MEDIA TAXONOMY (client ruling 2026-07-29) ────────────────────────────────
// "the midjourney tag is outdated, its either generated or uploaded".
// The canonical source_type vocabulary is now activity-based:
//   generated — the studio's AI photo pipeline produced it (applyGeneratedImage)
//   uploaded  — a person brought it in (generator loadFile, the /upload page)
// consent_status is UNTOUCHED — it stays an orthogonal dimension (a real photo
// of identifiable people needs consent whether it arrived by upload or not).
//
// Legacy values ('midjourney_render' | 'real_photo') keep flowing from two
// directions during the migration window: stale clients POSTing the old tags,
// and a NOT-YET-MIGRATED database returning old rows (the owner applies
// lib/migrations/2026-07-29-media-organization.sql by hand). Every boundary
// therefore maps instead of rejecting: the UI only ever sees generated|uploaded.

export const CANONICAL_SOURCE_TYPES = ['generated', 'uploaded'];

// Legacy → canonical. midjourney_render rows were AI renders → 'generated';
// real_photo rows were person-supplied photos → 'uploaded' (ratified mapping,
// mirrored 1:1 by the UPDATE statements in the migration file).
export const LEGACY_TO_CANONICAL = {
  midjourney_render: 'generated',
  real_photo: 'uploaded',
};

// Canonical → legacy, for the un-migrated-DB write fallback: when the live CHECK
// constraint still rejects the new vocabulary (23514), the API re-writes the row
// with the legacy equivalent so an upload NEVER breaks mid-migration.
export const CANONICAL_TO_LEGACY = {
  generated: 'midjourney_render',
  uploaded: 'real_photo',
};

// Any accepted input → canonical value, or null when the value is unknown
// (the route 400s on null — unknown tags are a caller bug, not a legacy client).
export function normalizeSourceType(value) {
  const v = String(value || '').trim();
  if (CANONICAL_SOURCE_TYPES.includes(v)) return v;
  return LEGACY_TO_CANONICAL[v] || null;
}

// Canonical → the legacy value the pre-migration CHECK constraint accepts.
export function legacySourceType(canonical) {
  return CANONICAL_TO_LEGACY[canonical] || null;
}

// Postgres check_violation — the signature of writing the new vocabulary into a
// DB whose old images_source_type_check constraint has not been migrated yet.
export function isCheckViolation(err) {
  return err?.code === '23514' || /check constraint/i.test(String(err?.message || ''));
}

// Present a DB row to the client: whatever vintage the stored value is, the
// response speaks the new vocabulary (GET legacy→new mapping, ratified).
export function presentImageRow(row) {
  if (!row || typeof row !== 'object') return row;
  const canonical = normalizeSourceType(row.source_type);
  return canonical && canonical !== row.source_type
    ? { ...row, source_type: canonical }
    : row;
}

// ── ACTIVITY GROUPING (client ruling: "the system can auto group them base on
// the activity") ─────────────────────────────────────────────────────────────
// Groups images by the session they were created in (images.session_id — added
// by the same migration). Rows with no lineage (every pre-migration row) land
// in one honest "Earlier / unlinked" group — we never fake groups for them.
// `sessionsById` maps session id → { title, updated_at } from /api/sessions.
export function groupImagesBySession(images, sessionsById = {}) {
  const bySession = new Map();
  const unlinked = [];
  for (const img of Array.isArray(images) ? images : []) {
    const sid = img?.session_id || null;
    if (!sid) { unlinked.push(img); continue; }
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid).push(img);
  }
  const groups = [...bySession.entries()].map(([sid, items]) => {
    const session = sessionsById[sid] || null;
    // Newest activity first inside a group and between groups.
    const newest = items.reduce((t, i) => Math.max(t, Date.parse(i?.created_at) || 0), 0);
    return {
      sessionId: sid,
      title: session?.title || 'Untitled post',
      knownSession: !!session,
      newestAt: newest,
      items,
    };
  }).sort((a, b) => b.newestAt - a.newestAt);
  if (unlinked.length) {
    groups.push({
      sessionId: null,
      title: 'Earlier / unlinked',
      knownSession: false,
      newestAt: unlinked.reduce((t, i) => Math.max(t, Date.parse(i?.created_at) || 0), 0),
      items: unlinked,
    });
  }
  return groups;
}
