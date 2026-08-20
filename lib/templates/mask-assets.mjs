/* ─────────────────────────────────────────────────────────────────────────
   THE PHOTO-WINDOW SILHOUETTES FOR A TEMPLATE — the id → real asset resolver.

   (client ruling 2026-08-18 — TEMPLATE TWO, "Petal Window", amended the same
   day) A template's photo slot may be revealed through a brand silhouette, and
   WHICH silhouette is HERS to choose: the template declares `allowedMaskShapes`,
   exactly as it declares `allowedLogoAssets`, and the composer offers them.

   ── SCOPE, AND WHY THIS FILE IMPORTS NOTHING FROM THE OVERLAY CATALOG ────────
   Client ruling, same day: **the petal mask options are TEMPLATE-TWO ONLY.**
   They must not become part of the general brand shape set — not the admin
   app's Shapes rail, not the overlay picker, not the AI's placeable-shape
   vocabulary.

   That is a STRUCTURAL guarantee here, not a promise. This module deliberately
   does NOT read `DEFAULT_OVERLAY_ASSETS`. If it did, adding a petal for template
   two would mean adding a row to the catalog the admin rail enumerates, and the
   new shape would appear in the editor the moment it appeared in the template —
   exactly the leak the ruling forbids. Instead an id resolves to a file BY
   CONVENTION, so a template-two addition touches the template and the filesystem
   and nothing else. Reading a file that the overlay catalog also happens to
   point at is fine (petal-brand is one); WRITING into that catalog is not, and
   from here it is not possible.

   ── ADDING A PETAL (the whole procedure) ────────────────────────────────────
     1. drop the SVG at  public/assets/shapes/<id>.svg
     2. add "<id>" to `allowedMaskShapes` in lib/templates/template-petal-window.mjs
   That is the entire change: one file, one line, no code. The id IS the
   filename stem, the label is title-cased from the id unless MASK_SHAPE_LABELS
   gives it a nicer one, and scripts/tests/template-two.test.mjs proves the file
   exists (law 3 — only real assets; an id that names nothing is DROPPED at the
   surface and REFUSED by the render core, never faked into a path that 404s).

   ── WHAT MAKES A GOOD WINDOW SILHOUETTE ─────────────────────────────────────
   A mask is used for its ALPHA, so:
     · it must be one closed filled shape, not linework (a line drawing cuts the
       photo into strokes, which is not a window)
     · a notch, bite or hole in the outline reads as damage in a photo window,
       even when it is honest geometry elsewhere
     · partial fill-opacity is fine on disk — the core saturates a mask's alpha
       before using it — but a raster with soft alpha will give a soft edge
   ───────────────────────────────────────────────────────────────────────── */

/* The one place a mask asset path is formed. A directory and an extension —
   nothing per-shape, so a new id needs no entry anywhere in this file. */
const MASK_SHAPE_DIR = '/assets/shapes';
const MASK_SHAPE_EXT = '.svg';

/* Presentation only. An id with no entry gets a title-cased label, so adding a
   shape STILL does not require touching this file. */
export const MASK_SHAPE_LABELS = Object.freeze({
  'petal-brand': 'Brand petal',
  'shape-1': 'Petal 1',
  'shape-2': 'Petal 2',
  'shape-3': 'Petal 3',
});

/** An id must be a plain slug — it becomes a path, so nothing may traverse. */
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

function titleCase(id) {
  return String(id).split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

/**
 * One window silhouette by id, or null when the id is not a usable slug.
 * The FILE's existence is proven by test (law 3) and, at runtime, by the image
 * failing to load — which the composer reports and the render core refuses on.
 */
export function maskAssetById(id) {
  const clean = String(id || '');
  if (!SAFE_ID.test(clean)) return null;
  return {
    id: clean,
    label: MASK_SHAPE_LABELS[clean] || titleCase(clean),
    src: `${MASK_SHAPE_DIR}/${clean}${MASK_SHAPE_EXT}`,
  };
}

/**
 * The silhouettes a template sanctions, in the template's declared order.
 * Unknown-shaped ids are dropped (law 3) rather than turned into a 404.
 */
export function templateMaskShapes(template) {
  const ids = Array.isArray(template?.allowedMaskShapes) ? template.allowedMaskShapes : [];
  return ids.map(maskAssetById).filter(Boolean);
}

/**
 * The silhouette a render should cut with.
 *
 * DEFAULT STAYS THE TEMPLATE'S OWN `slots.photo.mask` — the shape the template
 * was authored around. An explicit choice out of `allowedMaskShapes` is
 * honoured as made; an id that is NOT sanctioned is ignored rather than
 * silently drawn (§3: the user app may only offer what the template allows).
 *
 * @param {object} template
 * @param {string|null} shapeId  her explicit pick, or null for the default
 */
export function resolveMaskAsset(template, shapeId = null) {
  const declared = template?.slots?.photo?.mask;
  if (!declared) return null;
  const allowed = Array.isArray(template?.allowedMaskShapes) ? template.allowedMaskShapes : [declared];
  if (shapeId && allowed.includes(shapeId)) {
    const picked = maskAssetById(shapeId);
    if (picked) return { ...picked, explicit: true };
  }
  const fallback = maskAssetById(declared);
  return fallback ? { ...fallback, explicit: false } : null;
}

/** The template's default silhouette — what it was authored around. */
export function templateMaskAsset(template) {
  return resolveMaskAsset(template, null);
}
