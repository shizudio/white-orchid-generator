import { getAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

// ── DB-BACKED BUILT-IN OVERLAYS (multi-tenancy P1 item d) ───────────────────
// lib/schema.sql `brand_overlays` holds the built-in petal/shape + accessory
// set (seeded with the White Orchid's 10 rows in this pass). This route reads
// it and reshapes rows into the exact DEFAULT_OVERLAYS shape
// components/Generator.jsx expects:
//   { id, name, src, kind, ratio, category, builtin:true }
// ratio is rebuilt from the integer num/den pair so the client float matches
// DEFAULT_OVERLAY_ASSETS byte-for-byte (e.g. 169/207).
//
// Degradation contract (same as /api/logo-variants + /api/brand-assets): any
// env/table/row problem returns { configured:false } — never a 500 — so the
// editor keeps its hardcoded DEFAULT_OVERLAYS fallback (lib/brand-defaults.js),
// which is byte-identical to what these rows were seeded from. This is DISTINCT
// from /api/brand-assets (OFFICIAL owner-uploaded decorations) which layer on top.
const BRAND_ID = '00000000-0000-0000-0000-000000000001';

function unconfigured(extra = {}) {
  return Response.json({ configured: false, overlays: [], hidden: [], ...extra });
}

// (Shapes delete, client ruling 2026-08-18) Built-in brand shapes are HIDDEN
// from the picker rather than destroyed — the asset row and the client
// fallback survive so placed instances on existing designs keep rendering.
// The workspace-wide hidden list is a small JSON object in the existing
// public brand-asset bucket (no schema DDL): logos/brand-assets/hidden-overlays.json.
const HIDDEN_BUCKET = 'logos';
const HIDDEN_PATH = 'brand-assets/hidden-overlays.json';

async function readHiddenList(supabase) {
  try {
    const { data, error } = await supabase.storage.from(HIDDEN_BUCKET).download(HIDDEN_PATH);
    if (error || !data) return [];
    const parsed = JSON.parse(await data.text());
    return Array.isArray(parsed?.hidden)
      ? parsed.hidden.filter(id => typeof id === 'string').slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

// storage_path may be a route-relative public asset path (today: /assets/...)
// or a Supabase Storage object path — only the latter needs a public URL.
function resolveSrc(supabase, storagePath) {
  if (!storagePath) return null;
  if (storagePath.startsWith('/') || /^https?:\/\//i.test(storagePath)) return storagePath;
  try {
    const { data } = supabase.storage.from('logos').getPublicUrl(storagePath);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

export async function GET() {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  try {
    const { data, error } = await supabase
      .from('brand_overlays')
      .select('slug, name, storage_path, kind, category, ratio_num, ratio_den, sort_order')
      .eq('brand_id', BRAND_ID)
      .order('sort_order', { ascending: true });
    if (error || !Array.isArray(data) || !data.length) return unconfigured();
    const overlays = data
      .map(row => {
        const src = resolveSrc(supabase, row.storage_path);
        if (!row.slug || !src) return null;
        const den = Number(row.ratio_den) || 1;
        const ratio = (Number(row.ratio_num) || 1) / den;
        return {
          id: row.slug,
          name: row.name || 'Shape',
          src,
          kind: row.kind || 'center',
          ratio,
          category: row.category || 'overlays',
          builtin: true,
        };
      })
      .filter(Boolean);
    if (!overlays.length) return unconfigured();
    const hidden = await readHiddenList(supabase);
    return Response.json({ configured: true, overlays, hidden });
  } catch {
    return unconfigured();
  }
}

// POST /api/overlay-assets — persist the workspace-wide hidden-shape list.
// Body: { hiddenIds: string[] }. Same degradation contract: any env/bucket
// problem returns { configured:false } (never a 500) and the client keeps its
// localStorage mirror, honestly noting the cloud miss.
export async function POST(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const hiddenIds = Array.isArray(body?.hiddenIds)
    ? body.hiddenIds.filter(id => typeof id === 'string' && id.length <= 120).slice(0, 100)
    : null;
  if (!hiddenIds) {
    return Response.json({ error: 'hiddenIds must be an array of asset ids.' }, { status: 400 });
  }
  try {
    const payload = Buffer.from(JSON.stringify({ hidden: hiddenIds }), 'utf8');
    const { error } = await supabase.storage
      .from(HIDDEN_BUCKET)
      .upload(HIDDEN_PATH, payload, { contentType: 'application/json', upsert: true });
    if (error) return unconfigured();
    return Response.json({ configured: true, hidden: hiddenIds });
  } catch {
    return unconfigured();
  }
}
