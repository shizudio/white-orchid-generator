/* ─────────────────────────────────────────────────────────────────────────
   TEMPLATE ONE — "Label + Headline"

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
  name: 'Label + Headline',
  version: 1,

  // §8 — the gallery card's client-facing "why choose this one", and §6.3 rule 3:
  // the purpose text STATES the slots so she chooses knowing.
  purpose: 'A quiet statement tile: a small tracked label, one serif sentence that carries the whole post, and a short line underneath. Text only — no photo. Best when the words are the point.',

  // §5 — all four, each AUTHORED below. Banner is retired.
  dimensions: {
    portrait: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 },
    square: { w: 1080, h: 1080 },
    landscape: { w: 1600, h: 900 },
  },

  allowedLogoPositions: ['bottom-right', 'bottom-left', 'bottom-center'],

  // §6.2 — 2–3+ PRE-VERIFIED pairs. `contrast` is the WCAG ratio measured at
  // bake time by the validator; a stale number fails the load.
  colourPairs: [
    { id: 'ivory', label: 'Ivory', bg: P.whiteSmoke, ink: P.burnham, contrast: 8.5, klass: 'light' },
    { id: 'sage', label: 'Sage', bg: P.sage, ink: P.burnham, contrast: 5.86, klass: 'light' },
    { id: 'blush', label: 'Blush', bg: P.dustyPink, ink: P.burnham, contrast: 6.02, klass: 'light' },
    { id: 'forest', label: 'Forest', bg: P.burnham, ink: P.whiteSmoke, contrast: 8.5, klass: 'dark' },
  ],

  motif: 'none',

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
    photo: { present: false },
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
