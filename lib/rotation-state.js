import { getAdminClient } from '@/lib/supabase';

// ── DURABLE LANDING-ROTATION STATE (G1) ──────────────────────────────────────
// The landing frequency-cap + anti-repeat ring (RECENT_PICKS / RECENT_VKINDS /
// LAST_BG in app/api/assistant/route.js) is correctly GLOBAL PER BRAND — it
// protects ONE Instagram feed's rhythm (petal ≤1-in-8, dark share 25–30%, no two
// adjacent solids sharing a field). But held only in module-level memory it RESETS
// on every deploy and DIVERGES across serverless instances (docs/asset-pipeline.md
// Part V). This module persists it in Supabase (one row `brand_rotation`, keyed by
// brand_id) so it survives deploys and is shared across instances.
//
// GRACEFUL-DEGRADATION CONTRACT (lib-contract / operating-manual §4): every call is
// null-safe and NEVER throws. loadRotation returns the caller's current in-memory
// values on ANY failure (env/table/row absent, malformed JSON, timeout) — the
// module-level ring stays the authoritative cache + fallback, so the landing flow
// works identically with Supabase absent. saveRotation is fire-and-forget: it kicks
// off the upsert and swallows every error; the in-memory ring already reflects the
// state, so a failed write costs only durability, never correctness for the turn.
//
// CONCURRENCY: last-write-wins. Two instances finalizing a landing at the same
// instant may lose one instance's pick from the shared row; it self-corrects within
// one RECENT_MAX window (the next load on each instance re-reads the durable row).
// This is acceptable — the ring is a soft rhythm guard, not a ledger.

export const BRAND_ID = '00000000-0000-0000-0000-000000000001';
export const RECENT_MAX = 12; // mirrors RECENT_MAX in app/api/assistant/route.js

// Hard budget for the hydration read: the landing turn must never wait on the
// cloud beyond this. On timeout we fall back to the in-memory ring (no latency
// cliff — the query keeps running but its result is ignored).
const LOAD_TIMEOUT_MS = 150;

function normalize(state = {}) {
  return {
    recentPicks: Array.isArray(state.recentPicks) ? state.recentPicks.slice(-RECENT_MAX) : [],
    recentVKinds: Array.isArray(state.recentVKinds) ? state.recentVKinds.slice(-RECENT_MAX) : [],
    lastBg: typeof state.lastBg === 'string' ? state.lastBg : null,
  };
}

// loadRotation(supabase, brandId, fallback) → { recentPicks, recentVKinds, lastBg }
// A single read of the brand's rotation row. `fallback` is the caller's current
// in-memory ring, returned UNCHANGED on any failure. When a valid cloud row exists
// and carries at least as much history as memory (a just-deployed instance has an
// empty/short ring, so the durable row is authoritative), the cloud snapshot is
// adopted; otherwise memory wins. Never throws.
export async function loadRotation(supabase, brandId = BRAND_ID, fallback = {}) {
  const current = normalize(fallback);
  try {
    if (!supabase) return current;
    const query = supabase
      .from('brand_rotation')
      .select('state')
      .eq('brand_id', brandId)
      .maybeSingle();
    // Time-box the read so a slow/hung Supabase can't stall the landing turn.
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), LOAD_TIMEOUT_MS));
    const res = await Promise.race([query, timeout]);
    if (!res || res.__timeout) return current;
    const { data, error } = res;
    if (error || !data || !data.state || typeof data.state !== 'object') return current;
    const cloud = normalize(data.state);
    // Adopt the durable row when it holds at least as much history as this
    // instance (covers the reset-on-deploy case: empty memory ← full cloud row).
    if (cloud.recentPicks.length >= current.recentPicks.length) return cloud;
    return current;
  } catch {
    return current; // any unexpected error → keep the in-memory ring
  }
}

// saveRotation(supabase, brandId, state) — fire-and-forget upsert of the ring,
// capped at RECENT_MAX. Never awaited on the hot path beyond kickoff, never throws.
// Idempotent: running it twice with the same `state` writes the identical row.
export function saveRotation(supabase, brandId = BRAND_ID, state = {}) {
  try {
    if (!supabase) return;
    const row = {
      brand_id: brandId,
      updated_at: new Date().toISOString(),
      state: normalize(state),
    };
    // Kick off the write and detach: swallow both fulfilment and rejection so a
    // table/env problem (or a transient network error) never surfaces or throws.
    Promise.resolve(supabase.from('brand_rotation').upsert(row, { onConflict: 'brand_id' }))
      .then(() => {}, () => {});
  } catch {
    /* never throws on the hot path — durability is best-effort */
  }
}

// Convenience for callers that don't already hold an admin client. Returns null
// (never throws) when Supabase env is absent, so the caller degrades to memory.
export function rotationClient() {
  try {
    return getAdminClient();
  } catch {
    return null;
  }
}
