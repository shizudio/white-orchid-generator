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

export async function GET() {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  try {
    const { data, error } = await supabase
      .from('design_templates')
      .select('id, name, thumb, state, created_at, updated_at')
      .eq('brand_id', BRAND_ID)
      .eq('deleted', false)
      .order('updated_at', { ascending: false })
      .limit(LIST_CAP);
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
