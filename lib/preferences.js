import { getAdminClient } from '@/lib/supabase';
import { MB_GENE_KEYS } from '@/lib/moodboard-genes';

// ── LIKE PREFERENCES — server-side aggregate (ratified items 11 + 12) ─────────
// Hearts store design GENES in ai_feedback_events.verdict (lib/sessions logLike:
// { kind:'like'|'unlike', genes:{ archetypeId, archVariant, bgColor,
//   photoTreatment, heroRegister, postType, dimensionId, sceneCategory }, … }).
// This module reduces them into per-gene like COUNTS (latest like/unlike per
// session wins) plus ≤5 plain-language HOUSE-STYLE EXEMPLARS for the assistant
// system prompt. Cached in-module ~1h; every failure degrades to the empty
// aggregate (the studio behaves exactly as before anyone liked anything).
//
// TWO TASTE SIGNALS (Feed folders — ratified): the studio now captures the
// owner's taste from BOTH folders in the Posts gallery:
//   • Favourites = liked sessions → the like/unlike events read below (kind:'like').
//   • Moodboard  = EXTERNAL inspiration images the owner uploaded → logged to the
//     SAME ai_feedback_events store as kind:'moodboard' (see lib/moodboard.js),
//     verdict:{ kind:'moodboard', note, itemId }. Those rows carry no design genes
//     (they're reference imagery, not studio designs), so computeAggregate() below
//     ignores them today — the aggregate is likes-only, unchanged.
// MOODBOARD READ (Moodboard → Templates P1 — docs/moodboard-templates-spec.md §1/§3,
// 2026-07-12): the aspirational signal is NOW read. computeAggregate() folds the
// GENES classified onto each brand_moodboard row (lib/moodboard-genes.js) into the
// SAME counts object at MOODBOARD_WEIGHT (0.5) — hearts stay at 1.0 and their
// structure is unchanged; the moodboard contributes fractionally. photoTreatment
// merges into the shared photoTreatment bucket the hearts feed; the composition
// devices / palette classes / registers / density land in their own buckets that
// the pattern ledger + proposal engine read. The PRIMARY consumption of these
// genes is pattern-mining into template proposals (lib/proposal-engine.js), not
// per-generation nudging — this aggregate is the shared count substrate for both.

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const CACHE_TTL_MS = 60 * 60 * 1000;      // ~1h — the learning signal moves slowly
const FAIL_TTL_MS = 5 * 60 * 1000;        // retry sooner after a failure
const SCAN_LIMIT = 1000;                  // newest capture rows to scan
const MOODBOARD_WEIGHT = 0.5;             // aspirational signal strength (spec §1 knob)
const MOODBOARD_SCAN_LIMIT = 200;         // newest classified moodboard rows to fold in

const GENE_KEYS = ['archetypeId', 'archVariant', 'bgColor', 'photoTreatment', 'heroRegister', 'postType', 'dimensionId', 'sceneCategory'];

const EMPTY = Object.freeze({
  configured: false,
  likedCount: 0,
  moodboardCount: 0,
  counts: Object.freeze({}),
  exemplars: Object.freeze([]),
});

let cache = { at: 0, ttl: 0, value: null };

export function emptyPreferences() { return EMPTY; }

// counts shape: { archetypeId: {id:n}, archVariant: {'arch#idx':n}, bgColor: {...}, … }
async function computeAggregate() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('ai_feedback_events')
    .select('session_id, verdict, created_at')
    .eq('brand_id', BRAND_ID)
    .order('created_at', { ascending: false })
    .limit(SCAN_LIMIT);
  if (error) throw error;

  // Latest like/unlike per session wins (rows arrive newest-first).
  const latestBySession = new Map();
  for (const row of data || []) {
    const v = row?.verdict;
    if (!v || (v.kind !== 'like' && v.kind !== 'unlike')) continue;
    const sid = v.sessionId || row.session_id || `row_${latestBySession.size}`;
    if (!latestBySession.has(sid)) latestBySession.set(sid, v);
  }

  const counts = {};
  for (const k of GENE_KEYS) counts[k] = {};
  // Moodboard gene keys share the same counts object (photoTreatment is in both
  // lists → one shared bucket); init the moodboard-only buckets too.
  for (const k of MB_GENE_KEYS) if (!counts[k]) counts[k] = {};
  let likedCount = 0;
  for (const v of latestBySession.values()) {
    if (v.kind !== 'like') continue;
    const g = v.genes && typeof v.genes === 'object' ? v.genes : {};
    likedCount++;
    for (const k of GENE_KEYS) {
      let val = g[k];
      if (val == null || val === '') continue;
      if (k === 'archVariant') val = `${g.archetypeId ?? 'none'}#${val}`;
      const key = String(val);
      counts[k][key] = (counts[k][key] || 0) + 1;
    }
  }

  // ── Moodboard fold (spec §3) — aspirational genes at 0.5, same counts object ──
  // Graceful + idempotent: a missing table/column/env leaves the aggregate exactly
  // likes-only (as before this pass shipped). Never throws out of here.
  const moodboardCount = await foldMoodboardGenes(supabase, counts);

  return { configured: true, likedCount, moodboardCount, counts, exemplars: buildExemplars(counts, likedCount) };
}

// Read the classified brand_moodboard rows and add each gene value into `counts`
// at MOODBOARD_WEIGHT. Returns the number of classified rows folded (0 when the
// column/table is absent). Mutates `counts` in place; degrades to a no-op.
async function foldMoodboardGenes(supabase, counts) {
  let rows;
  try {
    const { data, error } = await supabase
      .from('brand_moodboard')
      .select('genes')
      .eq('brand_id', BRAND_ID)
      .not('genes', 'is', null)
      .order('ts', { ascending: false })
      .limit(MOODBOARD_SCAN_LIMIT);
    if (error) return 0;             // un-migrated (no genes column) / table absent
    rows = data || [];
  } catch { return 0; }
  let folded = 0;
  for (const row of rows) {
    const g = row?.genes && typeof row.genes === 'object' ? row.genes : null;
    if (!g) continue;
    folded++;
    for (const k of MB_GENE_KEYS) {
      const val = g[k];
      if (val == null || val === '') continue;
      const key = String(val);
      counts[k][key] = (counts[k][key] || 0) + MOODBOARD_WEIGHT;
    }
  }
  return folded;
}

// ── Plain-language exemplars (item 12) — ≤5 descriptors, most-loved first ────
const ARCH_PHRASES = {
  serif_word: 'an oversized serif statement on a calm solid field',
  editorial_split: 'the editorial split — a photo beside a solid text block',
  big_number: 'a big date or number as the hero',
  full_bleed_duotone: 'a full-bleed photo under the deep-green duotone',
  floated_card: 'a small photo card floated on a solid field',
  quote_margin: 'a quote set with generous margin',
  manifesto: 'a short text-only manifesto page',
  documentary: 'one clean candid photo, minimal overlay',
  label_headline: 'a small caps eyebrow above a serif headline',
  portrait_credential: 'a portrait beside a name and credential',
  motif_field: 'a pastel field warmed by a few flat motifs',
  petal_window: 'a photo revealed through the orchid petal window',
  shape_cutout: 'a colour-block canvas with the photo in an organic shape cutout',
  message_pill: 'the message on a rounded pill card over the photo',
  brand_card: 'the brand lockup card',
  stat_tile: 'a giant serif stat on a celadon field',
  cta_card: 'the enrolment CTA card with the tangerine pill',
  closing_card: 'the centred closing card',
  schedule_tile: 'a daily schedule of serif times and light activities',
};
const BG_PHRASES = {
  burnham: 'deep forest-green fields', whiteSmoke: 'warm ivory fields',
  wisteria: 'soft wisteria fields', celadon: 'celadon fields', jet: 'near-black fields',
  butter: 'butter-yellow fields', dustyPink: 'dusty-pink fields', sky: 'pale sky fields',
  sage: 'sage fields', terracotta: 'terracotta fields', lilac: 'lilac fields',
};
const TREATMENT_PHRASES = {
  warmGrade: 'warm, near-raw photo grading', duotone: 'the deep-green duotone photo wash',
  duotoneLift: 'the duotone-with-ivory-glow photo look', filmGrain: 'near-full-colour candids',
  duotoneStrong: 'the heavy green photo wash', cleanGrain: 'clean, faintly grainy photos',
  none: 'untreated photos',
};
const SCENE_PHRASES = {
  people: 'photos of children absorbed in what they do',
  'still-life': 'quiet still-life photography',
  scene: 'calm scene photography',
};

function top(countMap, n = 1) {
  return Object.entries(countMap || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function buildExemplars(counts, likedCount) {
  if (!likedCount) return [];
  const out = [];
  for (const [id, n] of top(counts.archetypeId, 2)) {
    if (ARCH_PHRASES[id]) out.push(`${ARCH_PHRASES[id]} (liked ${n}×)`);
  }
  const [bg] = top(counts.bgColor, 1);
  if (bg && BG_PHRASES[bg[0]]) out.push(BG_PHRASES[bg[0]]);
  const [tr] = top(counts.photoTreatment, 1);
  if (tr && TREATMENT_PHRASES[tr[0]]) out.push(TREATMENT_PHRASES[tr[0]]);
  const [sc] = top(counts.sceneCategory, 1);
  if (sc && SCENE_PHRASES[sc[0]]) out.push(SCENE_PHRASES[sc[0]]);
  return out.slice(0, 5);
}

// Public read — cached ~1h; NEVER throws (graceful degrade to the empty
// aggregate so the rotation/prompt behave exactly as before likes existed).
export async function getLikePreferences() {
  const now = Date.now();
  if (cache.value && now - cache.at < cache.ttl) return cache.value;
  try {
    const value = await computeAggregate();
    cache = { at: now, ttl: CACHE_TTL_MS, value };
    return value;
  } catch {
    cache = { at: now, ttl: FAIL_TTL_MS, value: EMPTY };
    return EMPTY;
  }
}

// Like-count helpers for the rotation ring (item 11).
export function likeCountFor(prefs, geneKey, value) {
  return (prefs?.counts?.[geneKey]?.[String(value)]) || 0;
}

// Weighted sample over `ids` by (1 + likeCount), with a DIVERSITY FLOOR: no
// single id may take more than `maxShare` (default 40%) of the probability
// mass. Feed-grammar rhythm stays supreme — callers filter `ids` by caps and
// rhythm BEFORE sampling. Returns null on an empty pool.
export function weightedPick(ids, prefs, geneKey = 'archetypeId', { maxShare = 0.4, rand = Math.random } = {}) {
  const pool = (ids || []).filter(Boolean);
  if (!pool.length) return null;
  if (pool.length === 1) return pool[0];
  let weights = pool.map(id => 1 + likeCountFor(prefs, geneKey, id));
  // Clamp any weight above maxShare of the total (two passes settle the mass
  // for the practical case of one runaway favourite).
  for (let pass = 0; pass < 2; pass++) {
    const total = weights.reduce((a, b) => a + b, 0);
    weights = weights.map(w => Math.min(w, maxShare * total));
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
