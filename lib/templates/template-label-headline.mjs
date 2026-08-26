/* ─────────────────────────────────────────────────────────────────────────
   TEMPLATE ONE — "Classic"  (id: `label_headline`)

   NAME vs ID (client ruling 2026-08-18: "label + headline template: change it
   'Classic'"). The DISPLAY NAME is now "Classic". The `id` stays
   `label_headline` and always will: saved posts record the template they were
   made with, and renaming the id would orphan every one of them. The id is
   storage, the name is language — they are allowed to disagree, and here they
   deliberately do. scripts/tests/template-one.test.mjs pins both.

   The client's own published design, baked as pure data (§12: build ONE
   template, in all four dimensions, end to end). Its geometry descends from the
   `label_headline` archetype in components/Generator.jsx — ivory field, tracked
   caps eyebrow, serif statement, one sans support line, orchid mark
   bottom-right — but every runtime freedom that archetype still carried
   (solver, per-format derive, capacity clamps, variants chosen by rotation) is
   RESOLVED HERE, at authoring time.

   §6.2 HARD RULE — everything below is a constraint: a number, an enum, or a
   presence flag. There is not one function, conditional or computed value in
   this file, and lib/templates/template-contract.mjs rejects the template
   outright if one ever appears.

   BOX HEIGHTS ARE NOT DECORATIVE (§7.1). Each text box height is
   `maxLines × floorPx × lineRatio` plus 2% slack, expressed as a fraction of
   that dimension's height, so every box is exactly "sized for its declared
   maxLines at the floor size". Floors come from the MIN_FONT_PX basis
   (lib/render-core/floor.mjs) evaluated on the canvas's shorter side:
     portrait / story / square (short side 1080): heading 73.44 · body 66.96 · eyebrow 43.20
     landscape                (short side  900): heading 61.20 · body 55.80 · eyebrow 36.00

   WHY THE DIMENSIONS DIVERGE FROM THE MASTER FRACTIONS:
     · story (1080×1920) is 42% taller than portrait at the same width, so the
       master fractions leave a vast dead middle. Authored: the whole block drops
       into the optically centred band BETWEEN the two Story action zones (top
       ~0.14, bottom ~0.20), and every box fraction shrinks because the same
       absolute floor is a smaller share of a 1920px canvas.
     · landscape (1600×900) is 78% wider than tall. The master's 0.34-deep hero
       box would swallow a third of the canvas for one line, so the heading drops
       to TWO lines and the text column narrows to 0.66/0.60 of the width,
       leaving the right third as the quiet field the mark sits in.
     · portrait and square stay closest to the authored master.

   The `perDim` overrides in the archetype catalog are the prior art for what
   this adjustment looks like; here it is the whole mechanism, with nothing
   derived at runtime.
   ───────────────────────────────────────────────────────────────────────── */

import { DEFAULT_PALETTE } from '../brand-defaults.js';
import { assertValidTemplate } from './template-contract.mjs';

/* ── MEASURED BUDGETS ────────────────────────────────────────────────────────
   GENERATED — do not hand-edit. Regenerate with:
     node scripts/tools/measure-template-budgets.mjs

   Every number is measured IN THE CANVAS RENDER CORE at the legibility floor
   (§11: "Budgets must be measured in the canvas render core, never read off
   Figma"), in headless Chromium with the real brand webfonts loaded. `min` is
   the §7.1 cross-dimension minimum — the budget the input actually enforces —
   and the per-dimension row is kept alongside it so the TIGHTEST dimension is
   visible at a glance rather than buried in a build log.
   ────────────────────────────────────────────────────────────────────────── */
// <<<BUDGETS_BEGIN>>>
export const MEASURED_BUDGETS = {
  "eyebrow": {
    "portrait": 24,
    "story": 24,
    "square": 24,
    "landscape": 30,
    "min": 24
  },
  "heading": {
    "portrait": 48,
    "story": 48,
    "square": 48,
    "landscape": 56,
    "min": 48
  },
  "body": {
    "portrait": 36,
    "story": 36,
    "square": 36,
    "landscape": 56,
    "min": 36
  }
};
// <<<BUDGETS_END>>>

const P = DEFAULT_PALETTE;

// Box heights, derived once at authoring time from the floor basis and rounded
// UP — recorded as literals so the file stays a table (§6.2).
//   heading 3 lines @73.44px ×1.02 ×1.02 = 229.2px → /1350 .170  /1080 .213
//   heading 3 lines @73.44px on story                       → /1920 .120
//   heading 2 lines @61.20px ×1.02 ×1.02 = 127.3px → / 900 .142
//   body    2 lines @66.96px ×1.32 ×1.02 = 180.3px → /1350 .134  /1920 .094  /1080 .167
//   body    2 lines @55.80px ×1.32 ×1.02 = 150.3px → / 900 .167
//   eyebrow 1 line  @43.20px ×1.25          =  54.0px → /1350 .040  /1920 .028  /1080 .050
//   eyebrow 1 line  @36.00px ×1.25          =  45.0px → / 900 .050

export const TEMPLATE_LABEL_HEADLINE = assertValidTemplate({
  id: 'label_headline',
  // DISPLAY ONLY (client ruling 2026-08-18). The id above is the stored key and
  // does not move with it — see the header note.
  name: 'Classic',
  version: 1,

  // §8 — the gallery card's client-facing "why choose this one", and §6.3 rule 3:
  // the purpose text STATES the slots so she chooses knowing.
  // (client AMENDMENT 2026-08-18) The photo slot is OPTIONAL — no photo is the
  // original clean tile, byte for byte. The purpose text says so rather than
  // claiming "text only", which stopped being true.
  purpose: 'A quiet tile of words on a colour field, with an optional photo behind them, for when the words are the point.',

  galleryPreview: {
    src: '/assets/post-template-samples/classic-portrait.png',
    alt: 'Blush Classic post featuring children playing on a rope course.',
  },

  // §5 — all four, each AUTHORED below. Banner is retired.
  dimensions: {
    portrait: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 },
    square: { w: 1080, h: 1080 },
    landscape: { w: 1600, h: 900 },
  },

  allowedLogoPositions: ['bottom-right', 'bottom-left', 'bottom-center'],

  // (client ruling 2026-08-18 — LOGO SWAP) The sanctioned subset of the brand's
  // REAL logo variants this template will draw. Ids are the brand catalog's own
  // (DEFAULT_LOGO_VARIANTS in lib/brand-defaults.js); nothing here invents a
  // mark (law 3), and every file is proven to exist by template-one.test.mjs.
  // Deliberately small: this tile carries the mark at 0.08–0.12 of the width, so
  // only the compact square/stacked/circle lockups stay legible at that size.
  // NOTE the set intentionally contains marks that are WRONG for some fields
  // (an ivory mark on the ivory pair). That is not silently substituted — the
  // backdrop check refuses the export and says so (§7.2 idiom).
  allowedLogoAssets: ['s1-green', 's1-ivory', 'p3-green', 'p3-ivory', 'p-circle'],

  // §6.2 — 2–3+ PRE-VERIFIED pairs. `contrast` is the WCAG ratio measured at
  // bake time by the validator; a stale number fails the load.
  colourPairs: [
    { id: 'ivory', label: 'Ivory', bg: P.whiteSmoke, ink: P.burnham, contrast: 8.5, klass: 'light' },
    { id: 'sage', label: 'Sage', bg: P.sage, ink: P.burnham, contrast: 5.86, klass: 'light' },
    { id: 'blush', label: 'Blush', bg: P.dustyPink, ink: P.burnham, contrast: 6.02, klass: 'light' },
    { id: 'forest', label: 'Forest', bg: P.burnham, ink: P.whiteSmoke, contrast: 8.5, klass: 'dark' },
  ],

  motif: 'none',

  /* ── THE PANEL, IN THIS TEMPLATE'S ORDER (client ruling 2026-08-18) ───────
     "replace the edit 'colour' for 'Background', and combine photo selection
      as part of the edit section."

     `background` is the merged section: the colour-pair picker AND the photo
     control, one heading, in that order. The client's grouping logic is that
     colour and photo are both "what sits behind the words" — on this template
     the photo is a full-bleed field under the type, so it belongs with the
     field colour and nowhere else.

     BACKGROUND FIRST (client ruling, same day): "for classic - i want
     background and photo to go before the text edit boxes." So both templates
     now open on what sits BEHIND the words — Classic on the colour field and
     its optional photo, Petal Window on the window and its required photo —
     then the words, then the mark. That consistency is a fact about the two
     declarations, not a rule in the panel: the panel renders whatever array it
     is handed, in order, and knows nothing about which template it is drawing.
     A third template is free to declare a different order tomorrow. */
  panelSections: ['background', 'words', 'mark', 'markPosition'],

  // Which slots paint, bottom of the stack first. Table data, not an algorithm.
  paintOrder: ['eyebrow', 'heading', 'body'],

  // The typographic register each slot paints in — the archetype's
  // heroRegister:"serif", caps:false, and the tracked-caps eyebrow, frozen.
  // `face` names a BRAND FONT ROLE (lib/brand-defaults.js), never a family
  // literal — law 7, zero brand facts in code.
  registers: {
    eyebrow: { face: 'subtitle', weight: 400, caps: true, tracking: 0.08, lineRatio: 1.25, align: 'left' },
    heading: { face: 'title', weight: 500, caps: false, lineRatio: 1.02, align: 'left' },
    body: { face: 'body', weight: 400, caps: false, lineRatio: 1.32, align: 'left' },
  },

  slots: {
    // ── TEXT ────────────────────────────────────────────────────────────────
    eyebrow: {
      present: true,
      charBudget: MEASURED_BUDGETS.eyebrow.min,
      measured: MEASURED_BUDGETS.eyebrow,
      dimensions: {
        portrait:  { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.eyebrow.portrait,  box: { x: 0.08, y: 0.170, w: 0.84, h: 0.040 } },
        story:     { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.eyebrow.story,     box: { x: 0.08, y: 0.300, w: 0.84, h: 0.028 } },
        square:    { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.eyebrow.square,    box: { x: 0.08, y: 0.160, w: 0.84, h: 0.050 } },
        landscape: { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.eyebrow.landscape, box: { x: 0.07, y: 0.220, w: 0.60, h: 0.050 } },
      },
    },
    heading: {
      present: true,
      charBudget: MEASURED_BUDGETS.heading.min,
      measured: MEASURED_BUDGETS.heading,
      dimensions: {
        portrait:  { present: true, required: true, maxLines: 3, charBudget: MEASURED_BUDGETS.heading.portrait,  box: { x: 0.08, y: 0.245, w: 0.84, h: 0.170 } },
        story:     { present: true, required: true, maxLines: 3, charBudget: MEASURED_BUDGETS.heading.story,     box: { x: 0.08, y: 0.350, w: 0.84, h: 0.120 } },
        square:    { present: true, required: true, maxLines: 3, charBudget: MEASURED_BUDGETS.heading.square,    box: { x: 0.08, y: 0.245, w: 0.84, h: 0.213 } },
        landscape: { present: true, required: true, maxLines: 2, charBudget: MEASURED_BUDGETS.heading.landscape, box: { x: 0.07, y: 0.305, w: 0.66, h: 0.142 } },
      },
    },
    body: {
      present: true,
      charBudget: MEASURED_BUDGETS.body.min,
      measured: MEASURED_BUDGETS.body,
      dimensions: {
        portrait:  { present: true, required: false, maxLines: 2, charBudget: MEASURED_BUDGETS.body.portrait,  box: { x: 0.08, y: 0.490, w: 0.80, h: 0.134 } },
        story:     { present: true, required: false, maxLines: 2, charBudget: MEASURED_BUDGETS.body.story,     box: { x: 0.08, y: 0.520, w: 0.80, h: 0.094 } },
        square:    { present: true, required: false, maxLines: 2, charBudget: MEASURED_BUDGETS.body.square,    box: { x: 0.08, y: 0.530, w: 0.80, h: 0.167 } },
        landscape: { present: true, required: false, maxLines: 2, charBudget: MEASURED_BUDGETS.body.landscape, box: { x: 0.07, y: 0.515, w: 0.60, h: 0.167 } },
      },
    },

    // §6.3 — DEACTIVATING NEVER DELETES. This template is text-only; declaring
    // these absent is honest, and a swap away from a template that shows them
    // KEEPS her words hidden rather than dropping them.
    pill: { present: false },
    attribution: { present: false },

    // ── NON-TEXT ────────────────────────────────────────────────────────────
    // (client AMENDMENT 2026-08-18) THE PHOTO SLOT. `required:false` in every
    // dimension: absent photo === today's clean tile, byte-identical, because
    // the render core paints nothing at all when there is no photo value.
    //
    // The TREATMENT is data (§6.2): a full-bleed box, `cover` fit, and ONE fixed
    // scrim PER COLOUR PAIR. There is no ladder and no adaptive opacity — each
    // number is declared, and whether the result is readable is MEASURED off the
    // painted canvas afterwards (lib/render-core/backdrop-contrast.mjs).
    //
    // ── WHY PER PAIR (client ruling 2026-08-18) ──────────────────────────────
    // The scrim used to be keyed by colour CLASS. ivory, sage and blush are all
    // class `light`, so all three painted the SAME ivory wash over a full-bleed
    // photo — and since the photo covers the field completely, the three tiles
    // came out BYTE-IDENTICAL. Two of the four pairs did nothing once a photo
    // was chosen, which is exactly the client's report that "only forest and
    // ivory are options." Keyed by pair id, each pair washes the photo in its
    // OWN field colour and stays itself.
    //
    // ── WHERE THESE FOUR NUMBERS COME FROM ───────────────────────────────────
    // Two different kinds of number, and the difference matters.
    //
    // (1) THE FLOOR — MEASURED, not taste. scripts/tools/scan-library-backdrop.mjs
    //     sweeps the brand's whole live library — 131 photos × all four
    //     dimensions × all three text boxes × all three allowed mark positions ×
    //     every pair — up an opacity ladder, and reports the LOWEST rung at which
    //     EVERY photo clears the text floor (4.5) and the mark floor (3.0), with
    //     a >= 0.25 ratio margin (larger than the measurement's own ~0.12 error
    //     bar). Below that rung the design is unsafe. That is all it says.
    //
    // (2) WHAT IS SHIPPED — a DESIGN choice sitting above that floor. The client
    //     looked at the ivory pair at its measured minimum and said it still read
    //     too thin (ruling 2026-08-18: "can u increase the opacity of the ivory
    //     overlay with picture"). So ivory ships materially heavier. The two
    //     numbers are kept side by side rather than collapsed, because only one
    //     of them is a measurement.
    //
    //   pair    colour    MEASURED min   SHIPPED   worst text @ shipped   photo left
    //   ivory   #F5F6E7      0.75          0.82           6.35*             18%
    //   sage    #C3D2BC      0.90          0.90           4.84              10%
    //   blush   #E7C9CC      0.88          0.88           4.77              12%
    //   forest  #254E48      0.79          0.79           4.77              21%
    //   *typical library photo; the whole library clears by a wide margin at 0.82.
    //
    //   sage/blush/forest ship AT their measured minimum on purpose: they are
    //   already washed far heavier than ivory was, and pushing them further buys
    //   nothing the eye notices while costing the photograph outright.
    //
    // ── WHAT THE OPACITY COSTS, SAID PLAINLY (M4 — no comfortable silence) ───
    // A scrim at opacity a leaves the photo contributing (1 - a) of every pixel.
    // At 0.82 (ivory) just under a fifth of the photograph survives: it still
    // reads as a photograph, clearly softened — the type is unmistakably crisp
    // against it. Past roughly 0.86 the ivory tile stops reading as a photograph
    // and starts reading as a tinted plate with a suggestion of an image in it.
    // At 0.88 and 0.90 (blush, sage) only 12% and 10% survive, and that line has
    // already been crossed: those are textures inside a colour field, closer to
    // the plain sage/blush tile than to the picture she chose.
    //
    // That is not a tuning failure, it is arithmetic about the pair itself:
    // sage/burnham measures 5.86 and blush/burnham 6.02 on a FLAT field, against
    // 8.5 for both ivory and forest. A pair that starts with a third less
    // headroom has almost none left once a photo adds variance underneath, so it
    // has to be washed nearly solid to hold 4.5. Sage and blush are honestly
    // usable with a photo now — they were not before — but they are usable as
    // TINTED FIELDS, not as windows. Reported to the client rather than papered
    // over; changing it needs a designer decision about the ink, not a bigger
    // number here.
    //
    // ── AND THE PRICE OF (2), STATED (M4) ────────────────────────────────────
    // At 0.82, NO image whatsoever can make the ivory pair's TEXT fail: not a
    // library photo, not a flat black card, not a hard black/white bar field.
    // The runtime text check on this pair is therefore unreachable — it has
    // become a bake-time proof rather than a guard. The refusal machinery is not
    // decorative (a mark the field cannot carry, and an unreadable/tainted
    // canvas, both still refuse and are gated in
    // scripts/tools/verify-template-one.mjs) but the client should know that the
    // heavier ivory wash is what bought that.
    photo: {
      present: true,
      /* NOT adjustable (client ruling 2026-08-18 — the crop is Petal Window's
         alone). Here the photo is a full-bleed texture under a 0.79–0.90 scrim
         with the type sitting on it; there is no framing decision to make, and
         a pan/zoom control would be a knob with nothing to say (M4). Declared
         explicitly rather than left to a default, so the difference between the
         two templates is a stated fact and not an omission. */
      adjustable: false,
      scrim: {
        ivory: { colour: P.whiteSmoke, opacity: 0.82 },
        sage: { colour: P.sage, opacity: 0.90 },
        blush: { colour: P.dustyPink, opacity: 0.88 },
        forest: { colour: P.burnham, opacity: 0.79 },
      },
      dimensions: {
        portrait:  { present: true, required: false, fit: 'cover', box: { x: 0, y: 0, w: 1, h: 1 } },
        story:     { present: true, required: false, fit: 'cover', box: { x: 0, y: 0, w: 1, h: 1 } },
        square:    { present: true, required: false, fit: 'cover', box: { x: 0, y: 0, w: 1, h: 1 } },
        landscape: { present: true, required: false, fit: 'cover', box: { x: 0, y: 0, w: 1, h: 1 } },
      },
    },
    motif: { present: false },
    colourPair: {
      present: true,
      dimensions: {
        portrait:  { present: true, required: true, box: { x: 0, y: 0, w: 1, h: 1 } },
        story:     { present: true, required: true, box: { x: 0, y: 0, w: 1, h: 1 } },
        square:    { present: true, required: true, box: { x: 0, y: 0, w: 1, h: 1 } },
        landscape: { present: true, required: true, box: { x: 0, y: 0, w: 1, h: 1 } },
      },
    },
    logo: {
      present: true,
      // The archetype's logoUse:"mark", sizeId:"s" (0.12 of width), LOGO_PAD 0.05.
      dimensions: {
        portrait:  { present: true, required: false, box: { x: 0.83, y: 0.90, w: 0.12, h: 0.08 }, widthFrac: 0.12, pad: 0.05 },
        story:     { present: true, required: false, box: { x: 0.83, y: 0.92, w: 0.12, h: 0.06 }, widthFrac: 0.12, pad: 0.05 },
        square:    { present: true, required: false, box: { x: 0.83, y: 0.87, w: 0.12, h: 0.10 }, widthFrac: 0.12, pad: 0.05 },
        landscape: { present: true, required: false, box: { x: 0.88, y: 0.78, w: 0.08, h: 0.14 }, widthFrac: 0.08, pad: 0.05 },
      },
    },
  },

  // The brand mark this template draws, per colour class. Assets only — law 3
  // (only real assets); both files exist in public/assets/logos/secondary/.
  logoAssets: {
    light: '/assets/logos/secondary/secondary-1-green.svg',
    dark: '/assets/logos/secondary/secondary-1-ivory.svg',
  },
});

export default TEMPLATE_LABEL_HEADLINE;
