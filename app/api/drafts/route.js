import { getAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const STATE_MAX_BYTES = 300 * 1024;

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60; // draft autosave is debounced ≥3s client-side; generous
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
  return Response.json({ draft: null, configured: false, ...extra });
}
function isMissingConfig(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || /not set|not configured|does not exist|schema cache/i.test(msg);
}

export async function GET(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  const id = new URL(request.url).searchParams.get('id') || 'current';
  try {
    const { data, error } = await supabase
      .from('design_drafts')
      .select('id, state, updated_at, device_label')
      .eq('id', id)
      .eq('brand_id', BRAND_ID)
      .maybeSingle();
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ draft: data || null, configured: true });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'Autosaving too fast — please wait a moment.' }, { status: 429 });
  }
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const id = typeof body?.id === 'string' && body.id ? body.id : 'current';
  if (body?.state == null || typeof body.state !== 'object') {
    return Response.json({ error: 'state (object) is required' }, { status: 400 });
  }
  const stateBytes = Buffer.byteLength(JSON.stringify(body.state), 'utf8');
  if (stateBytes > STATE_MAX_BYTES) {
    return Response.json({ error: 'Draft too large to sync.', tooLarge: true }, { status: 413 });
  }

  const row = {
    id,
    brand_id: BRAND_ID,
    state: body.state,
    device_label: typeof body?.device_label === 'string' ? body.device_label.slice(0, 60) : null,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('design_drafts')
      .upsert(row)
      .select('id, state, updated_at, device_label')
      .single();
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ draft: data, configured: true }, { status: 201 });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
