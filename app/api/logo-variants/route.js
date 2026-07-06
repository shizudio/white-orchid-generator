import { getAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

// ── DB-BACKED LOGO VARIANTS (multi-tenancy P1 item c) ───────────────────────
// lib/schema.sql `logo_variants` already existed (seeded with the White
// Orchid's 14 rows in this pass). This route reads it and reshapes rows into
// the exact LOGO_VARIANTS shape components/Generator.jsx expects:
//   { id, label, group, color, shape, wide, src }
// Degradation contract (same as /api/brand-assets): any env/table/row problem
// returns { configured:false } — never a 500 — so the editor simply keeps its
// hardcoded DEFAULT_LOGO_VARIANTS fallback (lib/brand-defaults.js), which is
// byte-identical to what these rows were seeded from.
const BRAND_ID = '00000000-0000-0000-0000-000000000001';

function unconfigured(extra = {}) {
  return Response.json({ configured: false, variants: [], ...extra });
}

// storage_path may be a route-relative public asset path (today: /assets/...)
// or a Supabase Storage object path — only the latter needs a public URL
// resolved; a leading "/" is already a servable URL as-is.
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
      .from('logo_variants')
      .select('slug, label, group_name, color_tone, shape, wide, storage_path, sort_order')
      .eq('brand_id', BRAND_ID)
      .order('sort_order', { ascending: true });
    if (error || !Array.isArray(data) || !data.length) return unconfigured();
    const variants = data
      .map(row => {
        const src = resolveSrc(supabase, row.storage_path);
        if (!row.slug || !src) return null;
        return {
          id: row.slug,
          label: row.label,
          group: row.group_name,
          color: row.color_tone,
          shape: row.shape || 'square',
          wide: !!row.wide,
          src,
        };
      })
      .filter(Boolean);
    if (!variants.length) return unconfigured();
    return Response.json({ configured: true, variants });
  } catch {
    return unconfigured();
  }
}
