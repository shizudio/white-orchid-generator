import { getAdminClient } from '@/lib/supabase';

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
