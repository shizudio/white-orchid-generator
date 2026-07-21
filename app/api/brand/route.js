import { getAdminClient } from '@/lib/supabase';
import { requireAdminKey } from '@/lib/admin-auth';

const BRAND_ID = '00000000-0000-0000-0000-000000000001';

export async function GET() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('brand_kit')
    .select('*')
    .eq('id', BRAND_ID)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PATCH(request) {
  // Open write to the LIVE brand kit — admin-key gated (Phase-0 hardening). GET
  // stays public (the product reads the palette everywhere); only the WRITE is
  // gated. The admin UI (app/admin/brand) sends x-wo-admin-key from localStorage.
  const denied = requireAdminKey(request);
  if (denied) return denied;
  const supabase = getAdminClient();
  const body = await request.json();
  const { data, error } = await supabase
    .from('brand_kit')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', BRAND_ID)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
