import { getAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Moodboard — EXTERNAL inspiration images the owner uploads (reference imagery,
// NOT designs the studio made). Same graceful-degradation contract as
// /api/sessions + /api/brand-assets: any env/table problem returns
// { configured:false } (never a 500) so the client falls back to localStorage.

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const IMAGE_MAX = 500 * 1024;   // small JPEG thumbnail dataURL cap
const NOTE_MAX = 280;
const LIST_CAP = 80;

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;
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
  return Response.json({ configured: false, items: [], ...extra });
}
function isMissingConfig(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || /not set|not configured|does not exist|schema cache/i.test(msg);
}

// GET /api/moodboard → { configured, items:[{ id, image, note, ts }] }
export async function GET() {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  try {
    const { data, error } = await supabase
      .from('brand_moodboard')
      .select('id, image, note, ts, created_at')
      .eq('brand_id', BRAND_ID)
      .order('ts', { ascending: false })
      .limit(LIST_CAP);
    if (error) { if (isMissingConfig(error)) return unconfigured(); return Response.json({ error: error.message }, { status: 500 }); }
    return Response.json({ configured: true, items: data || [] });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// POST /api/moodboard — add one inspiration item.
// Body: { id?, image (data:image/…;base64,… ≤500KB), note?, ts? }.
export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'Too many uploads — please wait a moment.' }, { status: 429 });
  }
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const image = String(body?.image || '');
  if (!/^data:image\//.test(image)) {
    return Response.json({ error: 'image must be an image data URL.' }, { status: 400 });
  }
  if (image.length > IMAGE_MAX) {
    return Response.json({ error: 'Inspiration image too large.', tooLarge: true }, { status: 413 });
  }

  const id = typeof body?.id === 'string' && body.id ? body.id.slice(0, 80) : ('mb_' + Date.now().toString(36));
  const note = typeof body?.note === 'string' ? body.note.slice(0, NOTE_MAX) : '';
  const ts = Number.isFinite(body?.ts) ? body.ts : Date.now();
  const row = { id, brand_id: BRAND_ID, image, note, ts };

  try {
    const { data, error } = await supabase
      .from('brand_moodboard')
      .upsert(row)
      .select('id, image, note, ts')
      .single();
    if (error) { if (isMissingConfig(error)) return unconfigured(); return Response.json({ error: error.message }, { status: 500 }); }
    return Response.json({ configured: true, item: data }, { status: 201 });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// DELETE /api/moodboard?id=… — remove one inspiration item (scoped to the brand).
export async function DELETE(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
  try {
    const { data, error } = await supabase
      .from('brand_moodboard')
      .delete()
      .eq('id', id.slice(0, 80))
      .eq('brand_id', BRAND_ID)
      .select('id');
    if (error) { if (isMissingConfig(error)) return unconfigured(); return Response.json({ error: error.message }, { status: 500 }); }
    return Response.json({ configured: true, deleted: Array.isArray(data) && data.length > 0 });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
