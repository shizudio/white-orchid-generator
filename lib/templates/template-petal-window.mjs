/* ─────────────────────────────────────────────────────────────────────────
   TEMPLATE TWO — "Petal Window"

   The client's reference, baked as pure data: a photograph revealed through the
   BRAND PETAL on a pale sage field, the lockup bottom-left, no words needed.

   Its DNA is the `petal_window` archetype in components/Generator.jsx (§2.12 of
   visual-language-spec) — brand-petal mask, logo bottom-left, thirds anchoring,
   serif register — but this is its own BAKED thing, not that archetype with the
   solver switched off. Every runtime freedom the archetype still carries
   (per-format derive, variant rotation, capacity clamps, drag) is RESOLVED HERE.

   §6.2 HARD RULE — everything below is a constraint: a number, an enum, a
   presence flag or an asset id. Not one function, conditional or computed value,
   and lib/templates/template-contract.mjs rejects the template outright if one
   ever appears.

   ── THE THREE RATIFIED DECISIONS THIS FILE IMPLEMENTS ───────────────────────

   1. THE PHOTO IS REQUIRED. Unlike template one, where a photo is optional and
      its absence is the original clean tile, "a petal window with no photo is
      not a design". `required: true` in every dimension. What she sees until she
      picks one is the window itself, ghosted, saying CHOOSE A PHOTO — painted by
      the render core off this flag — and export is BLOCKED for every dimension
      until a real photo is chosen. Nothing is ever substituted for it (law 3).

   2. TEXT NEVER SITS OVER THE PHOTO. The heading is optional, and the way to
      keep that promise without a conditional is GEOMETRY: the petal is authored
      slightly smaller than the client's near-full-bleed reference, and the space
      that buys is a quiet FIELD BAND the heading lives in.
        · empty heading → petal plus air, which is very close to the reference
        · filled heading → words in the band, on flat pre-verified field colour
      The petal DOES NOT MOVE OR SHRINK when a heading appears. Reflowing it
      would be the solver returning as data (§6.2); one fixed layout that works
      both ways is the whole point.

   3. LANDSCAPE IS PETAL-LEFT / FIELD-RIGHT, at the petal's TRUE PROPORTIONS.
      The client's reason, recorded because it is the constraint: photographs
      shot for vertical formats are destroyed by a wide letterbox crop. A left
      column preserves the frame the photo was taken in; the right field is that
      dimension's text band. Every dimension's petal box is at the asset's own
      ratio (57.58 : 57.29 ≈ 1.005), so the silhouette is never stretched.

   ── THE MASK, AND WHO CHOOSES IT ────────────────────────────────────────────
   `allowedMaskShapes` is the list of window silhouettes SHE can switch between
   (client ruling 2026-08-18); `slots.photo.mask` is the one the template opens
   on. Both are ASSET IDS, never geometry: nothing here can drift from the file
   on disk, and an id that names nothing is dropped at the surface and REFUSED
   by the render core (law 3) rather than quietly painting a rectangular photo
   under this template's name. See the list below for what each shape is, what
   is wrong with it, and how to add another.

   TEMPLATE-SCOPED (client ruling, same day): these shapes are template two's
   alone. lib/templates/mask-assets.mjs resolves them without reading the shared
   overlay catalog, so adding one here cannot put it in the admin app's Shapes
   rail, the overlay picker, or the AI's placeable-shape vocabulary.

   BOX HEIGHTS ARE NOT DECORATIVE (§7.1). The heading box height is
   `maxLines × floorPx × lineRatio` plus 2% slack, as a fraction of that
   dimension's height. Floors come from the MIN_FONT_PX basis
   (lib/render-core/floor.mjs) on the canvas's shorter side:
     portrait / story / square (short side 1080): heading 73.44
     landscape                (short side  900): heading 61.20
   ───────────────────────────────────────────────────────────────────────── */

import { DEFAULT_PALETTE } from '../brand-defaults.js';
import { assertValidTemplate } from './template-contract.mjs';

/* ── MEASURED BUDGETS ────────────────────────────────────────────────────────
   GENERATED — do not hand-edit. Regenerate with:
     node scripts/tools/measure-template-budgets.mjs --template petal_window

   Measured IN THE CANVAS RENDER CORE at the legibility floor (§11), in headless
   Chromium with the real brand webfonts loaded. `min` is the §7.1
   cross-dimension minimum — the budget the input actually enforces.
   ────────────────────────────────────────────────────────────────────────── */
// <<<BUDGETS_BEGIN>>>
export const MEASURED_BUDGETS = {
  "heading": {
    "portrait": 35,
    "story": 35,
    "square": 34,
    "landscape": 34,
    "min": 34
  }
};
// <<<BUDGETS_END>>>

const P = DEFAULT_PALETTE;

/* PETAL BOXES — every one at the asset's own ratio (w = h × 1.005063), so the
   silhouette is never stretched:
     portrait  864.0 × 859.7 px   story  864.0 × 859.8 px
     square    624.2 × 621.0 px   landscape 560.8 × 558.0 px
   HEADING BAND — 2 lines at the floor, ×1.02 line ratio, ×1.02 slack:
     1080-short-side dims  2 × 73.44 × 1.02 × 1.02 = 152.8px
       → /1350 .113   /1920 .0796   /1080 .1415
     landscape             2 × 61.20 × 1.02 × 1.02 = 127.3px  → /900 .1415  */

export const TEMPLATE_PETAL_WINDOW = assertValidTemplate({
  id: 'petal_window',
  name: 'Petal Window',
  version: 1,

  // §8 / §6.3 rule 3 — the gallery card's client-facing "why choose this one",
  // and it STATES the slots so she chooses knowing. It says the photo is
  // required, because it is.
  purpose: 'A photograph seen through the brand petal on a quiet colour field, with the mark bottom-left. A photo is required — the petal is the picture. A short heading is optional and sits in the calm band beside or below the petal, never over the picture. Best when the photo is the post.',

  // §5 — all four, each AUTHORED. Landscape is petal-left / field-right so a
  // portrait photograph is not destroyed by a 16:9 crop.
  dimensions: {
    portrait: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 },
    square: { w: 1080, h: 1080 },
    landscape: { w: 1600, h: 900 },
  },

  // The reference puts the lockup bottom-left; bottom-right is the only other
  // corner that is clear of the petal and the band in ALL FOUR dimensions, so
  // the picker offers a real choice of two rather than one dead chip (M4).
  allowedLogoPositions: ['bottom-left', 'bottom-right'],

  // The same sanctioned subset template one draws from — the mark sits at
  // 0.08–0.12 of the width here too, so only the compact lockups stay legible.
  allowedLogoAssets: ['s1-green', 's1-ivory', 'p3-green', 'p3-ivory', 'p-circle'],

  /* ── THE WINDOW SHAPES SHE CAN CHOOSE ────────────────────────────────────
     (client ruling 2026-08-18) "i have a few petal shapes, can u make them as
     selections? this one has a cut off at the tip so its not really the best."
     …then, the same day: "remove the last petal option which has the crop."

     Declared exactly like `allowedLogoAssets`: a list of ids, resolved to real
     files by lib/templates/mask-assets.mjs. TEMPLATE-SCOPED by construction —
     that resolver reads no shared overlay catalog, so nothing added here can
     reach the admin app's Shapes rail or the AI's placeable-shape vocabulary
     (client ruling, same day).

     ADDING ONE IS TWO STEPS AND NO CODE:
       1. drop the SVG at public/assets/shapes/<id>.svg
       2. add '<id>' to the array below
     The label is title-cased from the id unless MASK_SHAPE_LABELS names it.

     WHAT EACH SHAPE IS, assessed AS A PHOTO WINDOW and measured in
     generated/template-two/shape-audit/ (notchRows = scan rows the outline
     breaks into two runs — the machine-readable form of "it has a bite in it"):
       · shape-1   0 notch rows. One unbroken outline, soft asymmetric egg —
                   the closest in feel to the client's reference. THE DEFAULT.
       · shape-3   0 notch rows. Clean, and the most upright of the three.
       · shape-2   0 notch rows. Clean, but wider than tall, so in this
                   template's square-ish window it is contained rather than
                   filling and reads a little smaller. Offered, not defaulted.

     ── WHAT WAS REMOVED, AND WHY IT IS NOT A RETIREMENT ─────────────────────
     `petal-brand` IS NOT OFFERED. It is the true brand petal, derived verbatim
     from the orchid mark — and it carries the mark's small COLUMN NOTCH near
     the tip, where the petal met the centre column of the logo. Honest geometry
     in a logo; in a photo window it reads as a bite taken out of the picture.
     Measured: 73 notch rows against 0 for every other candidate. That is the
     "cut off at the tip" the client named, and the client then ruled it out of
     the picker entirely.

     THIS IS CURATION, NOT ASSET RETIREMENT. petal-brand.svg stays on disk, its
     row stays in DEFAULT_OVERLAY_ASSETS, PETAL_WINDOW_MASK_ASSET still points
     at it, and the admin app's `petal_window` archetype and every design that
     already uses it are untouched. All that changed is which windows STAFF may
     pick in this template. (Asserted in scripts/tests/template-two.test.mjs, so
     a future edit cannot turn the curation into a retirement by accident.)

     (shape-1/2/3 ship at fill-opacity 0.4 on disk. That is handled in the
      render core, which saturates a mask's alpha before cutting with it — the
      same technique the admin painter uses — so it changes nothing here.) */
  allowedMaskShapes: ['shape-1', 'shape-3', 'shape-2'],

  /* §6.2 — PRE-VERIFIED pairs, contrast measured at bake time by the validator.
     Sage first: it is the client's own reference field.

     WHY TERRACOTTA IS NOT HERE, although the petal_window archetype sanctions it
     as a die-cut field: terracotta #D08C6E measures 2.51:1 against ivory ink and
     3.39:1 against burnham. This template has a REAL heading slot, so its field
     has to clear the 4.5 text floor, and terracotta cannot on either ink. It is
     excluded rather than shipped with a heading nobody can read — reported to
     the client as a finding, not quietly dropped. */
  colourPairs: [
    { id: 'sage', label: 'Sage', bg: P.sage, ink: P.burnham, contrast: 5.86, klass: 'light' },
    { id: 'ivory', label: 'Ivory', bg: P.whiteSmoke, ink: P.burnham, contrast: 8.5, klass: 'light' },
    { id: 'forest', label: 'Forest', bg: P.burnham, ink: P.whiteSmoke, contrast: 8.5, klass: 'dark' },
  ],

  motif: 'none',

  paintOrder: ['heading'],

  // The archetype's heroRegister:"serif", caps:false — frozen. `face` names a
  // BRAND FONT ROLE, never a family literal (law 7).
  registers: {
    heading: { face: 'title', weight: 500, caps: false, lineRatio: 1.02, align: 'left' },
  },

  slots: {
    // ── TEXT ────────────────────────────────────────────────────────────────
    // OPTIONAL, and the band exists whether or not she uses it. `required:false`
    // is what makes "petal plus air" a first-class result rather than an
    // unfinished one.
    heading: {
      present: true,
      charBudget: MEASURED_BUDGETS.heading.min,
      measured: MEASURED_BUDGETS.heading,
      dimensions: {
        portrait:  { present: true, required: false, maxLines: 2, charBudget: MEASURED_BUDGETS.heading.portrait,  box: { x: 0.08, y: 0.725, w: 0.84, h: 0.1130 } },
        story:     { present: true, required: false, maxLines: 2, charBudget: MEASURED_BUDGETS.heading.story,     box: { x: 0.08, y: 0.685, w: 0.84, h: 0.0796 } },
        square:    { present: true, required: false, maxLines: 2, charBudget: MEASURED_BUDGETS.heading.square,    box: { x: 0.09, y: 0.660, w: 0.82, h: 0.1415 } },
        // The right field IS the landscape band — vertically centred on the
        // petal column so the two read as one composition.
        landscape: { present: true, required: false, maxLines: 2, charBudget: MEASURED_BUDGETS.heading.landscape, box: { x: 0.48, y: 0.340, w: 0.46, h: 0.1415 } },
      },
    },

    // §6.3 — DEACTIVATING NEVER DELETES. This template shows one heading and a
    // picture; declaring the rest absent is honest, and swapping here from a
    // template that shows them KEEPS her words hidden rather than dropping them.
    eyebrow: { present: false },
    body: { present: false },
    pill: { present: false },
    attribution: { present: false },
    motif: { present: false },

    // ── THE PETAL WINDOW ────────────────────────────────────────────────────
    photo: {
      present: true,
      // The DEFAULT window — the shape this template opens on and was
      // authored around. Must be one of `allowedMaskShapes`; the validator
      // refuses a default she could not get back to.
      mask: 'shape-1',

      /* THE TINT — and it is a tint, not a legibility scrim.
         The contract requires a present photo slot to declare a scrim per pair,
         because on template one the type sits ON the photograph. Here it never
         does: the heading lives in the field band and the mark in the field
         corner, by fixed geometry, so NOTHING has to be read against these
         pixels and no opacity is load-bearing for legibility. What the number
         does do is real and visible — a light wash of the pair's own field
         colour through the window, so the photograph belongs to the field
         instead of being pasted onto it (the archetype's `warmGrade`
         photoTreatment, resolved at authoring time). 0.12 is a design decision,
         stated as one; it is not a measured legibility floor and is not
         pretended to be.

         CONTRACT GAP, REPORTED NOT PATCHED: §6.2/§10's photo surface assumes a
         scrim is always a legibility device, so `assertValidTemplate` forbids
         opacity 0 — "a scrim the core always paints cannot be a no-op". A
         window template with no ink over its photo has no honest way to say
         "none needed". docs/template-system-spec.md is law and is not edited
         here; the gap is raised for ruling. */
      scrim: {
        sage: { colour: P.sage, opacity: 0.12 },
        ivory: { colour: P.whiteSmoke, opacity: 0.12 },
        forest: { colour: P.burnham, opacity: 0.12 },
      },

      // REQUIRED in every dimension — decision 1 above.
      dimensions: {
        portrait:  { present: true, required: true, fit: 'cover', box: { x: 0.100, y: 0.055, w: 0.800, h: 0.6368 } },
        story:     { present: true, required: true, fit: 'cover', box: { x: 0.100, y: 0.200, w: 0.800, h: 0.4478 } },
        square:    { present: true, required: true, fit: 'cover', box: { x: 0.211, y: 0.045, w: 0.578, h: 0.5750 } },
        landscape: { present: true, required: true, fit: 'cover', box: { x: 0.060, y: 0.100, w: 0.3505, h: 0.6200 } },
      },
    },

    colourPair: {
      present: true,
      dimensions: {
        portrait:  { present: true, required: true, box: { x: 0, y: 0, w: 1, h: 1 } },
        story:     { present: true, required: true, box: { x: 0, y: 0, w: 1, h: 1 } },
        square:    { present: true, required: true, box: { x: 0, y: 0, w: 1, h: 1 } },
        landscape: { present: true, required: true, box: { x: 0, y: 0, w: 1, h: 1 } },
      },
    },

    // The lockup. `box` records where the mark actually lands at the DEFAULT
    // position (bottom-left) so the geometry is inspectable; the render core
    // places it from widthFrac + pad + the chosen position.
    logo: {
      present: true,
      dimensions: {
        portrait:  { present: true, required: false, box: { x: 0.05, y: 0.880, w: 0.12, h: 0.080 }, widthFrac: 0.12, pad: 0.05 },
        story:     { present: true, required: false, box: { x: 0.05, y: 0.915, w: 0.12, h: 0.056 }, widthFrac: 0.12, pad: 0.05 },
        square:    { present: true, required: false, box: { x: 0.05, y: 0.858, w: 0.11, h: 0.092 }, widthFrac: 0.11, pad: 0.05 },
        landscape: { present: true, required: false, box: { x: 0.05, y: 0.792, w: 0.08, h: 0.119 }, widthFrac: 0.08, pad: 0.05 },
      },
    },
  },

  // The brand mark this template draws by default, per colour class. Assets
  // only — law 3; both files exist in public/assets/logos/secondary/.
  logoAssets: {
    light: '/assets/logos/secondary/secondary-1-green.svg',
    dark: '/assets/logos/secondary/secondary-1-ivory.svg',
  },
});

export default TEMPLATE_PETAL_WINDOW;
