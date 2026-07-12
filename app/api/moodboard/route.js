import { getAdminClient } from '@/lib/supabase';
import { classifyMoodboardImage } from '@/lib/moodboard-genes';

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
// Distinct from a missing TABLE/env: an un-migrated DB has the brand_moodboard
// table but not the P1 `genes` column. A SELECT of the missing column surfaces as
// Postgres 42703 (undefined_column); a missing column in an INSERT/UPDATE payload
// surfaces as PostgREST PGRST204 ("Could not find the 'genes' column of
// 'brand_moodboard' in the schema cache") — verified against the live un-migrated
// DB 2026-07-12, where 42703-only matching made POST mis-degrade to
// {configured:false} via isMissingConfig's /schema cache/ pattern instead of
// retrying. Match BOTH, and always check isMissingColumn before isMissingConfig.
// We retry the query WITHOUT genes so uploads + listing keep working before the
// owner re-runs lib/schema.sql (graceful-degradation contract; docs §8 degraded path).
function isMissingColumn(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42703' || err?.code === 'PGRST204'
    || /column .* does not exist/i.test(msg)
    || /could not find the '.+' column/i.test(msg);
}

// GET /api/moodboard → { configured, items:[{ id, image, note, ts }] }
export async function GET() {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  try {
    // Prefer selecting the P1 `genes` column; fall back to the legacy select on an
    // un-migrated DB so the folder still opens before schema.sql is re-run.
    let { data, error } = await supabase
      .from('brand_moodboard')
      .select('id, image, note, ts, genes, created_at')
      .eq('brand_id', BRAND_ID)
      .order('ts', { ascending: false })
      .limit(LIST_CAP);
    if (error && isMissingColumn(error)) {
      ({ data, error } = await supabase
        .from('brand_moodboard')
        .select('id, image, note, ts, created_at')
        .eq('brand_id', BRAND_ID)
        .order('ts', { ascending: false })
        .limit(LIST_CAP));
    }
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

  // (P1 §2) One cheap vision call classifies the inspiration into the gene
  // vocabulary. GRACEFUL: classifyMoodboardImage never throws and returns null on
  // any problem (no key, bad image, off-vocab answer) — a failed classification
  // stores genes:null and NEVER blocks the upload; the nightly backfill retries it.
  const genes = await classifyMoodboardImage(image);
  const row = { id, brand_id: BRAND_ID, image, note, ts, genes };

  try {
    let { data, error } = await supabase
      .from('brand_moodboard')
      .upsert(row)
      .select('id, image, note, ts, genes')
      .single();
    // Un-migrated DB (no genes column): re-upsert without it so the upload still
    // lands. The item is stored gene-less and the backfill classifies it later.
    if (error && isMissingColumn(error)) {
      const { genes: _drop, ...legacy } = row;
      ({ data, error } = await supabase
        .from('brand_moodboard')
        .upsert(legacy)
        .select('id, image, note, ts')
        .single());
    }
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
