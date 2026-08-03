// ── EXPORT HISTORY (client ruling 2026-07-29) ────────────────────────────────
// "for history, i should be easily going back to the session" + ratified:
// export records store the REAL exported PNG. The exports table's new shape is
// { id, created_at, session_id, dimension_id, format, storage_path, headline,
//   metadata } (lib/schema.sql; migrated by lib/migrations/2026-07-29-…​.sql).
//
// Pre-migration the live table still has the obsolete scaffold columns
// (post_type/channel NOT NULL, logo_*). The helpers here pack/unpack a row for
// BOTH vintages so a failed history write never breaks a download and the UI
// only ever sees the new shape.

export const EXPORT_FORMATS = ['png', 'jpeg'];

export function normalizeExportFormat(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'jpg') return 'jpeg';
  return EXPORT_FORMATS.includes(v) ? v : null;
}

// The new-shape insert row.
export function buildExportRow({ sessionId, dimensionId, format, headline, storagePath, metadata = {} }) {
  return {
    session_id: sessionId || null,
    dimension_id: dimensionId || null,
    format: normalizeExportFormat(format) || 'png',
    storage_path: storagePath,
    headline: headline ? String(headline).slice(0, 200) : null,
    metadata,
  };
}

// Pre-migration packing: the old table has post_type + channel NOT NULL (no
// CHECK), so we satisfy them with honest fillers ('export' / the dimension id)
// and carry the REAL new-shape fields inside metadata jsonb, where
// presentExportRow reads them back. pre_migration:true marks the vintage so the
// migration's backfill UPDATE can promote these into the real columns.
export function legacyExportRow(row) {
  const { session_id, dimension_id, format, storage_path, headline, metadata } = row;
  return {
    storage_path,
    headline,
    post_type: 'export',
    channel: dimension_id || 'unknown',
    metadata: {
      ...(metadata || {}),
      session_id: session_id || null,
      dimension_id: dimension_id || null,
      format: format || 'png',
      pre_migration: true,
    },
  };
}

// Missing-column signature of an un-migrated DB (42703 = Postgres
// undefined_column on SELECT; PGRST204 = PostgREST "could not find the column"
// on an INSERT payload) — same detection the sessions route uses.
export function isMissingColumn(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42703' || err?.code === 'PGRST204'
    || /column .* does not exist|could not find the '.+' column/i.test(msg);
}

// Present either vintage of row as the new shape. Pre-migration rows carry the
// real fields in metadata (legacyExportRow above); migrated rows carry them in
// columns. The client never needs to know which it got.
export function presentExportRow(row) {
  if (!row || typeof row !== 'object') return row;
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    created_at: row.created_at,
    session_id: row.session_id ?? meta.session_id ?? null,
    dimension_id: row.dimension_id ?? meta.dimension_id ?? null,
    format: normalizeExportFormat(row.format ?? meta.format) || 'png',
    storage_path: row.storage_path,
    headline: row.headline ?? null,
    metadata: meta,
  };
}

// ── UI grouping: newest first, grouped by day ───────────────────────────────
export function groupExportsByDay(rows, { now = Date.now() } = {}) {
  const sorted = [...(Array.isArray(rows) ? rows : [])]
    .sort((a, b) => (Date.parse(b?.created_at) || 0) - (Date.parse(a?.created_at) || 0));
  const dayKey = ts => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(now - 24 * 3600 * 1000);
  const groups = [];
  for (const row of sorted) {
    const ts = Date.parse(row?.created_at) || 0;
    const key = dayKey(ts);
    let group = groups[groups.length - 1];
    if (!group || group.day !== key) {
      const label = key === todayKey ? 'Today'
        : key === yesterdayKey ? 'Yesterday'
        : new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      group = { day: key, label, items: [] };
      groups.push(group);
    }
    group.items.push(row);
  }
  return groups;
}

// ── Client-side record payload builder (useExportOrchestration) ─────────────
// The multipart fields POSTed alongside the rendered blob. Pure so the payload
// contract is unit-testable without a browser FormData.
export function exportRecordFields({ sessionId, dimensionId, format, headline }) {
  return {
    session_id: sessionId || '',
    dimension_id: dimensionId || '',
    format: normalizeExportFormat(format) || 'png',
    headline: headline || '',
  };
}
