import { getAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

// The capture layer (self-improvement-loop §1). One row per chat turn — user
// message, patch, before/after diff, the renderTruth honesty verdict, and the
// implicit verdict enriched from the user's next action. Writes are FIRE-AND-
// FORGET from the client and must never block or slow the UX, so:
//   - POST is generous + fast; any env/table problem degrades to { configured:false }.
//   - Enrichment of an existing turn (undo → rejection, etc.) is a PATCH-style
//     upsert keyed by turn_id: the client re-POSTs the same turn_id with a fuller
//     verdict; latest write wins.
// GET is the learning-pass pull surface — gated behind a dev key so nothing is
// exposed publicly. Returns recent events (optionally scoped to a session).

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const MSG_MAX = 4000;

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 200; // capture is chatty (turn + enrichment); very generous
const requestLog = new Map();
function isRateLimited(request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > MAX_REQUESTS;
}

function unconfigured(extra = {}) {
  return Response.json({ configured: false, events: [], ...extra });
}
function isMissingConfig(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || /not set|not configured|does not exist|schema cache/i.test(msg);
}

function clip(v, n = MSG_MAX) { return typeof v === 'string' ? v.slice(0, n) : null; }
function obj(v) { return v && typeof v === 'object' ? v : null; }

export async function POST(request) {
  if (isRateLimited(request)) {
    // A dropped capture event is invisible to the user — degrade quietly.
    return Response.json({ configured: true, dropped: true }, { status: 202 });
  }
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const turnId = clip(body?.turn_id, 120);
  const row = {
    brand_id: BRAND_ID,
    session_id: clip(body?.session_id, 120),
    turn_id: turnId,
    user_message: clip(body?.user_message),
    patch: obj(body?.patch),
    change_keys: Array.isArray(body?.change_keys) ? body.change_keys : null,
    state_diff: obj(body?.state_diff),
    verdict: obj(body?.verdict),
    reply: clip(body?.reply),
  };

  try {
    // Enrichment path: a follow-up POST with the same turn_id updates that row
    // (undo → rejection, re-ask → failure, export → success). Otherwise insert.
    if (turnId) {
      const found = await supabase
        .from('ai_feedback_events')
        .select('id')
        .eq('brand_id', BRAND_ID)
        .eq('turn_id', turnId)
        .maybeSingle();
      if (found.error && isMissingConfig(found.error)) return unconfigured();
      const existing = found.data;
      if (existing?.id) {
        // Merge only the fields present in this enrichment call (don't clobber the
        // original patch/diff with nulls).
        const patch = {};
        for (const [k, v] of Object.entries(row)) if (v != null) patch[k] = v;
        const { error } = await supabase.from('ai_feedback_events').update(patch).eq('id', existing.id);
        if (error) { if (isMissingConfig(error)) return unconfigured(); return Response.json({ error: error.message }, { status: 500 }); }
        return Response.json({ configured: true, enriched: true });
      }
    }
    const { error } = await supabase.from('ai_feedback_events').insert(row);
    if (error) { if (isMissingConfig(error)) return unconfigured(); return Response.json({ error: error.message }, { status: 500 }); }
    return Response.json({ configured: true, logged: true }, { status: 201 });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// GET — learning-pass pull. Dev-gated: requires ?key=<FEEDBACK_DEV_KEY> (env).
// Without the env var set, GET is disabled (403) so it can never leak in prod.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const devKey = process.env.FEEDBACK_DEV_KEY;
  if (!devKey || params.get('key') !== devKey) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  const sessionId = params.get('session_id');
  const limit = Math.min(500, Math.max(1, parseInt(params.get('limit') || '200', 10) || 200));
  try {
    let q = supabase
      .from('ai_feedback_events')
      .select('*')
      .eq('brand_id', BRAND_ID)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (sessionId) q = q.eq('session_id', sessionId);
    const { data, error } = await q;
    if (error) { if (isMissingConfig(error)) return unconfigured(); return Response.json({ error: error.message }, { status: 500 }); }
    return Response.json({ configured: true, events: data || [] });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
