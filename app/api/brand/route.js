import { getAdminClient } from '@/lib/supabase';
import { requireAdminKey } from '@/lib/admin-auth';

export const runtime = 'nodejs';

const BRAND_ID = '00000000-0000-0000-0000-000000000001';

// Graceful-degradation contract (operating-manual.md §4): any env/table/row
// problem degrades to { configured:false } (HTTP 200) — NEVER a 500. GET reads
// the public brand palette (BrandProvider guards on Array.isArray(colors), so a
// {configured:false} answer leaves the White Orchid CSS/canvas defaults in
// place). This route was a known violator (500 on missing Supabase env); this is
// its Phase-0 fix.
function unconfigured(extra = {}) {
  return Response.json({ configured: false, ...extra });
}
function isMissingConfig(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || /not set|not configured|does not exist|schema cache/i.test(msg);
}

export async function GET() {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  try {
    const { data, error } = await supabase
      .from('brand_kit')
      .select('*')
      .eq('id', BRAND_ID)
      .single();
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json(data);
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function PATCH(request) {
  // Open write to the LIVE brand kit — admin-key gated (Phase-0 hardening). GET
  // stays public (the product reads the palette everywhere); only the WRITE is
  // gated. The admin UI (app/admin/brand) sends x-wo-admin-key from localStorage.
  const denied = requireAdminKey(request);
  if (denied) return denied;

  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const { data, error } = await supabase
      .from('brand_kit')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', BRAND_ID)
      .select()
      .single();
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json(data);
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
