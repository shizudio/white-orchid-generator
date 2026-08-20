/* ─────────────────────────────────────────────────────────────────────────
   THE MOTIF FOR A TEMPLATE — the id → real asset resolver.

   §9 "Motif — slot, not layer": the TEMPLATE declares where the motif sits, at
   what size, in which treatment; she only chooses WHICH motif from the brand
   set, or none. Template three ("Caption Band") takes that one step further on
   an explicit client ruling — the motif there is FIXED, "fixed for now" — so
   the template names ONE brand asset and there is no picker at all.

   That is why this file exists and why it is so small. It does exactly what
   lib/templates/mask-assets.mjs does for window silhouettes, for the same
   reason (law 3, only real assets): an id resolves to a file BY CONVENTION, an
   id that is not a plain slug resolves to NOTHING, and the render core refuses
   to paint rather than inventing a mark. Nothing here is behaviour a template
   declares — the template's field is a string.

   ── WHY IT IS NOT mask-assets.mjs WEARING A SECOND HAT ──────────────────────
   A mask is used for its ALPHA to CUT a photograph; a motif is used for its
   alpha to STAMP a watermark in the template's ink. They happen to share a
   directory today, and merging them on that coincidence would mean every petal
   added to template two's window picker silently became a candidate watermark,
   and vice versa. Two vocabularies, two resolvers, one convention.

   ── SCOPE ──────────────────────────────────────────────────────────────────
   Like mask-assets.mjs, this module deliberately reads NO shared overlay
   catalog. A motif id here cannot reach the admin app's Shapes rail, the
   overlay picker, or the AI's placeable-shape vocabulary. Reading a file the
   overlay catalog also happens to point at is fine (`petal-brand` is one);
   WRITING into that catalog is not, and from here it is not possible.

   ── ADDING ONE (the whole procedure) ────────────────────────────────────────
     1. drop the SVG at  public/assets/shapes/<id>.svg
     2. name "<id>" in the template's `motif` set and `slots.motif.asset`
   The label is title-cased from the id unless MOTIF_LABELS names it, and
   scripts/tests/template-three.test.mjs proves the file exists.
   ───────────────────────────────────────────────────────────────────────── */

/* The one place a motif asset path is formed. A directory and an extension —
   nothing per-motif, so a new id needs no entry anywhere in this file. */
const MOTIF_DIR = '/assets/shapes';
const MOTIF_EXT = '.svg';

/* Presentation only. An id with no entry gets a title-cased label, so adding a
   motif STILL does not require touching this file. */
export const MOTIF_LABELS = Object.freeze({
  'petal-brand': 'Brand petal',
});

/** An id must be a plain slug — it becomes a path, so nothing may traverse. */
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

function titleCase(id) {
  return String(id).split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

/**
 * One motif by id, or null when the id is not a usable slug.
 * The FILE's existence is proven by test (law 3) and, at runtime, by the image
 * failing to load — which the composer reports and the render core refuses on.
 */
export function motifAssetById(id) {
  const clean = String(id || '');
  if (!SAFE_ID.test(clean)) return null;
  return {
    id: clean,
    label: MOTIF_LABELS[clean] || titleCase(clean),
    src: `${MOTIF_DIR}/${clean}${MOTIF_EXT}`,
  };
}

/**
 * The motif a template paints, or null when it declares none.
 *
 * There is NO `variantId` argument, and that absence is the client ruling:
 * the motif is the template's, not hers ("fixed for now"). When a picker is
 * ruled in, it arrives here as a second argument in the shape
 * `resolveMaskAsset` already uses — not as a new concept.
 */
export function templateMotifAsset(template) {
  const slot = template?.slots?.motif;
  if (!slot?.present) return null;
  return motifAssetById(slot.asset);
}

/**
 * The motifs a template sanctions, in the template's declared order.
 * Ids that are not usable slugs are dropped (law 3) rather than turned into a
 * 404. With the motif fixed this is a one-element list; it is the shape the
 * surface will read from on the day a picker is ruled in.
 */
export function templateMotifs(template) {
  const ids = Array.isArray(template?.motif) ? template.motif : [];
  return ids.map(motifAssetById).filter(Boolean);
}
