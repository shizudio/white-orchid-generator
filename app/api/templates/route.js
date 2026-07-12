import { getAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const NAME_MAX = 80;
const STATE_MAX_BYTES = 300 * 1024; // ~300KB cap on serialized state
const LIST_CAP = 50;

// Rate limit — same in-memory pattern as design-audit/assistant routes.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40; // writes are cheap; generous but bounded
const requestLog = new Map();
function isRateLimited(request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > MAX_REQUESTS;
}

// Any environment/table problem degrades to the SAME graceful shape the client
// treats as "not configured" — never a 500. A missing design_templates table
// (user hasn't run the SQL yet) surfaces here as a Postgres error we swallow.
function unconfigured(extra = {}) {
  return Response.json({ templates: [], configured: false, ...extra });
}
function isMissingConfig(err) {
  // getAdminClient throws when env is absent; Postgres 42P01 = undefined_table.
  const msg = String(err?.message || err || '');
  return (
    err?.code === '42P01' ||
    /not set|not configured|does not exist|schema cache/i.test(msg)
  );
}
// Distinct from a missing TABLE/env: an un-migrated DB has design_templates but not
// the P2 `status`/`rationale`/`source_moodboard_ids` columns. A SELECT of a missing
// column surfaces as Postgres 42703 (undefined_column); a missing column in an
// UPDATE/INSERT payload surfaces as PostgREST PGRST204 ("Could not find the 'status'
// column of 'design_templates' in the schema cache") — verified against the live
// un-migrated DB 2026-07-12; 42703-only matching let PGRST204 fall through to
// isMissingConfig's /schema cache/ pattern and mis-degrade PATCH to
// {configured:false}. Match BOTH, and always check isMissingColumn first. We then
// fall back to the legacy status-less query so the gallery keeps working before the
// owner re-runs lib/schema.sql (graceful-degradation contract; docs §8 degraded path).
function isMissingColumn(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42703' || err?.code === 'PGRST204'
    || /column .* does not exist/i.test(msg)
    || /could not find the '.+' column/i.test(msg);
}

// GET /api/templates            → the working gallery (status:'official'/null;
//                                  proposed + declined are NEVER shown — spec §4).
// GET /api/templates?status=proposed → the pending proposal(s) for the review pop-up
//                                  (P3), each carrying rationale + source_moodboard_ids.
export async function GET(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  const wantStatus = new URL(request.url).searchParams.get('status');

  try {
    // Prefer the status-aware select (P2 columns). Fall back to the legacy select on
    // an un-migrated DB so the gallery still lists working templates.
    let q = supabase
      .from('design_templates')
      .select('id, name, thumb, state, created_at, updated_at, status, rationale, source_moodboard_ids')
      .eq('brand_id', BRAND_ID)
      .eq('deleted', false)
      .order('updated_at', { ascending: false })
      .limit(LIST_CAP);
    q = wantStatus
      ? q.eq('status', wantStatus)                       // explicit filter (e.g. 'proposed')
      : q.not('status', 'in', '("proposed","declined")'); // gallery: hide proposals + declines
    let { data, error } = await q;

    if (error && isMissingColumn(error)) {
      // No status column yet: a proposal can't exist, so ?status=proposed is empty;
      // the gallery is every non-deleted row (exactly today's behaviour).
      if (wantStatus && wantStatus !== 'official') return Response.json({ templates: [], configured: true });
      ({ data, error } = await supabase
        .from('design_templates')
        .select('id, name, thumb, state, created_at, updated_at')
        .eq('brand_id', BRAND_ID)
        .eq('deleted', false)
        .order('updated_at', { ascending: false })
        .limit(LIST_CAP));
    }
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ templates: data || [], configured: true });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'Saving too fast — please wait a moment.' }, { status: 429 });
  }
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return Response.json({ error: 'name is required' }, { status: 400 });
  if (name.length > NAME_MAX) return Response.json({ error: `name must be ≤ ${NAME_MAX} chars` }, { status: 400 });
  if (body?.state == null || typeof body.state !== 'object') {
    return Response.json({ error: 'state (object) is required' }, { status: 400 });
  }

  const stateBytes = Buffer.byteLength(JSON.stringify(body.state), 'utf8');
  if (stateBytes > STATE_MAX_BYTES) {
    return Response.json({ error: 'Template too large to sync (keep photos smaller or this device only).', tooLarge: true }, { status: 413 });
  }

  const row = {
    name,
    thumb: typeof body?.thumb === 'string' ? body.thumb : null,
    state: body.state,
    brand_id: BRAND_ID,
    deleted: false,
    updated_at: new Date().toISOString(),
  };
  if (body?.id && /^[0-9a-f-]{36}$/i.test(body.id)) row.id = body.id; // upsert existing cloud row

  try {
    const { data, error } = await supabase
      .from('design_templates')
      .upsert(row)
      .select('id, name, thumb, state, created_at, updated_at')
      .single();
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ template: data, configured: true }, { status: 201 });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// PATCH /api/templates — the human gate (spec §5) + rename (spec §6).
// Body: { id, action?: 'accept' | 'decline', name? }
//   accept  → status 'proposed' → 'official' (joins the Templates gallery)
//   decline → status 'proposed' → 'declined' (kept as evidence — the pattern
//             ledger learns the decline; never hard-deleted here)
//   name    → rename (any non-deleted template; may ride along with accept so
//             an accepted proposal gets a real name in the same gesture)
// Transitions are guarded server-side: accept/decline only ever move a row that
// is CURRENTLY 'proposed' — a template can never be re-proposed or silently
// re-statused by a stale client (nothing self-applies; the human gate is the
// only path from 'proposed'). On an un-migrated DB (no status column, 42703)
// proposals cannot exist, so accept/decline answer { ok:false, unmigrated:true }
// — HTTP 200, never a 500 (graceful-degradation contract) — while rename still
// works via the status-less update.
export async function PATCH(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'Too many changes — please wait a moment.' }, { status: 429 });
  }
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'id (uuid) is required' }, { status: 400 });

  const action = body?.action == null ? null : String(body.action);
  if (action !== null && action !== 'accept' && action !== 'decline') {
    return Response.json({ error: "action must be 'accept' or 'decline'" }, { status: 400 });
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : null;
  if (name !== null && (!name || name.length > NAME_MAX)) {
    return Response.json({ error: `name must be 1–${NAME_MAX} chars` }, { status: 400 });
  }
  if (!action && name === null) return Response.json({ error: 'nothing to change' }, { status: 400 });

  const patch = { updated_at: new Date().toISOString() };
  if (action) patch.status = action === 'accept' ? 'official' : 'declined';
  if (name !== null) patch.name = name;

  try {
    let q = supabase
      .from('design_templates')
      .update(patch)
      .eq('id', id)
      .eq('brand_id', BRAND_ID)
      .eq('deleted', false);
    // The gate transition is only valid FROM 'proposed' (see contract above).
    if (action) q = q.eq('status', 'proposed');
    let { data, error } = await q.select('id, name, status, updated_at');

    if (error && isMissingColumn(error)) {
      // Un-migrated DB: no status column → no proposal can exist to gate.
      if (action) return Response.json({ ok: false, configured: true, unmigrated: true });
      ({ data, error } = await supabase
        .from('design_templates')
        .update({ name, updated_at: patch.updated_at })
        .eq('id', id)
        .eq('brand_id', BRAND_ID)
        .eq('deleted', false)
        .select('id, name, updated_at'));
    }
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!Array.isArray(data) || data.length === 0) {
      // No matching row: unknown id, deleted, or (for accept/decline) not
      // currently 'proposed' — e.g. already gated from another tab.
      return Response.json({ ok: false, configured: true, notFound: true }, { status: 404 });
    }
    return Response.json({ ok: true, configured: true, template: data[0] });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  try {
    const { error } = await supabase
      .from('design_templates')
      .update({ deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true, configured: true });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
