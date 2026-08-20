/* ─────────────────────────────────────────────────────────────────────────
   LOGO VARIANTS FOR A TEMPLATE — the id → real asset resolver.

   (client ruling 2026-08-18 — LOGO SWAP) A template declares
   `allowedLogoAssets`: a small sanctioned subset of the BRAND's own logo
   variant ids. This file turns those ids into real, on-disk assets by reading
   the brand catalog (lib/brand-defaults.js DEFAULT_LOGO_VARIANTS) — law 3,
   only real assets: an id that names nothing is DROPPED, never substituted and
   never faked into a placeholder mark.

   It lives under lib/templates/ on purpose. The user app may only consume the
   template contract (§3), so the composer asks the contract layer "which marks
   may I offer for this template" rather than reaching into brand internals.

   Nothing here is behaviour a template declares — the template's field is an
   array of strings. This is the app-side reader of that table.
   ───────────────────────────────────────────────────────────────────────── */

import { DEFAULT_LOGO_VARIANTS, DEFAULT_PALETTE } from '../brand-defaults.js';

const BY_ID = new Map(DEFAULT_LOGO_VARIANTS.map((v) => [v.id, v]));

/* The mark's OWN ink, for the backdrop check. Not a guess and not a new brand
   fact: the shipped assets paint their dominant field in exactly these two
   palette values — `fill:#254e48` (burnham) in every `color:"green"` variant and
   `fill:#f5f6e7` (whiteSmoke) in every `color:"ivory"` one. Read straight off
   lib/brand-defaults.js so it stays law 7 clean. */
const INK_BY_COLOUR = { green: DEFAULT_PALETTE.burnham, ivory: DEFAULT_PALETTE.whiteSmoke };

/** The hex a variant's mark actually paints in, or null for an unknown tone. */
export function logoInkFor(colour) {
  return INK_BY_COLOUR[String(colour || '')] || null;
}

/** One brand logo variant by id, or null when the brand has no such asset. */
export function logoVariantById(id) {
  const v = BY_ID.get(String(id || ''));
  return v ? { id: v.id, label: v.label, colour: v.color, shape: v.shape, src: v.src } : null;
}

/**
 * The variants a template sanctions, in the template's declared order.
 * Unknown ids are dropped (law 3) rather than rendered as a missing image.
 */
export function templateLogoVariants(template) {
  const ids = Array.isArray(template?.allowedLogoAssets) ? template.allowedLogoAssets : [];
  return ids.map(logoVariantById).filter(Boolean).map((v) => ({ ...v, ink: logoInkFor(v.colour) }));
}

/**
 * The asset the render should draw.
 *
 * DEFAULT STAYS WHAT THE COLOUR CLASS IMPLIES — with no explicit choice this
 * returns the template's `logoAssets[klass]`, exactly as before the swap
 * existed. An explicit choice is HONOURED AS MADE, including when it is a poor
 * fit for the field: the backdrop check refuses the export and says which
 * dimension is wrong (§7.2 idiom). Nothing is silently substituted (M3).
 *
 * @param {object} template
 * @param {'light'|'dark'} colourClass  the selected pair's class
 * @param {string|null} variantId       her explicit pick, or null for the default
 */
export function resolveLogoAsset(template, colourClass, variantId) {
  if (variantId) {
    const allowed = Array.isArray(template?.allowedLogoAssets) ? template.allowedLogoAssets : [];
    if (allowed.includes(variantId)) {
      const v = logoVariantById(variantId);
      if (v) return { src: v.src, variantId: v.id, label: v.label, colour: v.colour, ink: logoInkFor(v.colour), explicit: true };
    }
  }
  const src = template?.logoAssets?.[colourClass] || null;
  if (!src) return null;
  // Report the catalog id of the default when the brand has one for this file,
  // so the picker can show the default as selected without hardcoding an id.
  const match = DEFAULT_LOGO_VARIANTS.find((v) => v.src === src) || null;
  return {
    src,
    variantId: match?.id || null,
    label: match?.label || null,
    colour: match?.color || null,
    ink: logoInkFor(match?.color),
    explicit: false,
  };
}
