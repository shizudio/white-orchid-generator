// Landing archetype seeded rotation — task #71 (client ruling 2026-08-18:
// "it is always the same composition that is generated (image on the right),
// can u randomize base on the template we have?").
//
// THE VERIFIED SAMENESS MECHANISM (app/api/assistant/route.js, landing finalize):
// the initial pick for a fresh brief was "first cap-clear preference" —
// pickPhotoLedArchetype walked PHOTO_LED_BY_INTENT[intent] IN ORDER and returned
// the first id whose frequency cap wasn't busted. The cap window has an n>=4
// floor (early requests never trip it) and the in-memory ring resets per
// serverless instance/deploy when the durable brand_rotation row is absent, so
// the FIRST entry of the intent list — editorial_split for the two most common
// intents (event, text_post) — won almost every time. The model's own pick is
// steered the same way by the landing prompt ("dated event → editorial_split",
// "hiring → editorial_split"), and the anti-repeat belt only fired on an exact
// consecutive repeat, ping-ponging between the list's first two entries.
// Compounding it: three of the photo-led archetypes (editorial_split,
// portrait_credential, floated_card) all place the photo right-of-centre, so
// even the occasional alternation still read "image on the right".
//
// THE FIX (determinism law — no Math.random anywhere in the pick):
// a SEEDED ROTATION over the suited pool. Seed = the house copy-hash idiom
// (Generator.jsx logoSeed, ((h<<5)-h+c)|0 over the brief text) OFFSET by the
// persisted rotation ring's length (the palette-rotation ring precedent —
// RECENT_PICKS is hydrated from / saved to the durable `brand_rotation` row).
// The walk starts at (hash+offset) % pool.length and advances until it finds an
// id that (a) is not the previous pick and (b) clears its frequency cap — so
// consecutive generations visibly differ, different briefs spread across the
// pool, and the spec's caps stay supreme. When every entry is capped it falls
// back to the least-recently-used pool id (deterministic, mirrors the old LRU
// fallback). Pure — no DOM, no brand facts, no state; the route injects the
// pool, the ring snapshot and its exceedsCap predicate.

/** The house copy-hash ((h<<5)-h+char)|0 — same idiom as Generator's logoSeed. */
export function briefSeed(text) {
  const s = String(text || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Deterministic seeded rotation pick over `pool` (an ordered list of archetype
 * ids already filtered to the plan's suitability: intent pool for photo-led
 * plans, suited text tiles for text-only plans).
 *   seedText     the user's brief (hashed with briefSeed)
 *   recentPicks  the durable rotation ring snapshot (most recent last)
 *   capExceeded  (id) => bool — the route's frequency/dark-share cap predicate
 * Returns an id, or null for an empty pool. Never repeats the ring's last pick
 * when the pool offers any alternative; never uses Math.random.
 */
export function seededRotationPick({ pool, seedText, recentPicks = [], capExceeded = null } = {}) {
  const list = Array.isArray(pool) ? pool.filter(id => typeof id === "string" && id) : [];
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const ring = Array.isArray(recentPicks) ? recentPicks : [];
  const lastPick = ring.length ? ring[ring.length - 1] : null;
  const busted = typeof capExceeded === "function" ? (id => { try { return !!capExceeded(id); } catch { return false; } }) : (() => false);
  const start = (briefSeed(seedText) + ring.length) % list.length;
  // Pass 1: not the last pick AND cap-clear.
  for (let i = 0; i < list.length; i++) {
    const id = list[(start + i) % list.length];
    if (id !== lastPick && !busted(id)) return id;
  }
  // Pass 2 (caps saturated): least-recently-used pool id that isn't the last
  // pick — deterministic tie-break by pool order (variety before repetition).
  const countOf = id => ring.reduce((n, x) => n + (x === id ? 1 : 0), 0);
  let best = null;
  for (const id of list) {
    if (id === lastPick) continue;
    if (!best || countOf(id) < countOf(best)) best = id;
  }
  return best || list[(start) % list.length];
}
