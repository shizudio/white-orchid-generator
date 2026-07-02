import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Module-load throws here take down `next build` on any environment missing the
// vars (Vercel Preview builds "collect page data" for API routes, importing this
// file). Both clients are therefore lazy + null-safe: callers get `null` /
// a thrown Error they already handle with 503 fallbacks, and the build survives.

let browserClient = null;
export function getSupabase() {
  if (!url || !anon) return null;
  if (!browserClient) browserClient = createClient(url, anon);
  return browserClient;
}

// Back-compat for existing `import { supabase }` call sites: a lazy proxy so the
// client is only constructed (and env only required) on first property access.
export const supabase = new Proxy({}, {
  get(_t, prop) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY missing).');
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

// Server-only admin client (service role — never expose to browser)
export function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
