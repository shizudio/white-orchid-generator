/* ─────────────────────────────────────────────────────────────────────────
   TEMPLATE THREE — "Caption Band"  (id: `caption_band`)

   The client's reference, baked as pure data: a full-bleed photograph across
   the top of the frame, an ivory caption band across the bottom carrying TWO
   lines — a quiet sans line above a BOLD SERIF CAPS line — with the brand
   petal ghosted into the band, and the lockup TOP-RIGHT, ON THE PHOTO.

   §6.2 HARD RULE — everything below is a constraint: a number, an enum, a
   presence flag or an asset id. Not one function, conditional or computed
   value, and lib/templates/template-contract.mjs rejects the template outright
   if one ever appears.

   ── THE RATIFIED DECISIONS THIS FILE IMPLEMENTS (client, 2026-08-20) ────────

   1. THE PILL IS THE DOMINANT LINE, ABOVE THE HEADING. That inverts Classic's
      hierarchy on purpose: `heading` is the KICKER ("Term 3 places open"),
      `pill` is the PUNCHLINE ("NOW ENROLLING" — §6.1's own example for this
      slot). It is authored register data, not a rule: the pill's box is
      1.906x its floor line, so short copy paints large and dramatic (§7),
      while the kicker's box is the ordinary one-line-at-the-floor box and can
      never outgrow it.

      AND THE FIELD LABELS SAY SO. Classic's "The line that carries the post"
      would be a lie on this template — here the heading does NOT carry the
      post. `slotLabels` below renames both fields in the client's own plain
      register so the panel matches the picture. See the note there.

   2. THE PHOTO IS REQUIRED. A caption band with nothing above it is a colour
      swatch with words on it, not this design. `required: true` in every
      dimension; until she picks one the render core paints the honest
      placeholder and export is BLOCKED. Nothing is ever substituted (law 3).

   3. LANDSCAPE IS PHOTO-LEFT / TEXT-RIGHT. The client's reason, recorded
      because it is the constraint: photographs are mostly shot for vertical
      formats and a 16:9 letterbox crop destroys them. The left column is
      0.42 x 1.0 — 672 x 900, a 0.747:1 frame the vertical photo survives —
      and the RIGHT COLUMN IS THAT DIMENSION'S BAND. It is not a fifth idea;
      it is the same band stood on its end.

   4. THE MOTIF IS FIXED. "fixed for now" — the template names ONE real brand
      asset (`petal-brand`, the true brand petal, derived verbatim from the
      orchid mark) and the user app offers NO picker. It is DATA: an asset id,
      a box per dimension, an opacity per dimension. The render core paints it
      in the pair's own ink, under the words, before anything is measured.

   5. THE PHOTO IS CROPPABLE. A full-bleed photograph makes framing a real
      decision, so `adjustable: true` — the same pan/zoom machinery Petal
      Window uses, and the same line: what moves is WHICH PART OF HER PICTURE
      SHOWS, never the geometry.

   ── WHY THE BAND NEEDS NO SCRIM UNDER THE TYPE ──────────────────────────────
   THE BAND IS SAFE BY CONSTRUCTION. It is not a device painted over the
   photograph — it is the pre-verified colour field, showing where the photo
   box stops. So both text boxes sit on flat, bake-time-verified colour and
   there is nothing for a legibility scrim to do. None is declared, and the
   backdrop check still MEASURES the band on every render (the motif sits under
   the words, so "flat" is a claim that has to be checked, not assumed) —
   see scripts/tools/verify-template-three.mjs.

   The photo's scrim is therefore a TINT, exactly as it is on Petal Window: a
   wash of the pair's own field colour so the photograph belongs to the field
   instead of being pasted onto it. It is NOT load-bearing for the type. It IS
   partly load-bearing for the MARK, which is the one piece of ink on the
   photograph — see the note above `scrim` for the sweep that set the number.

   BOX HEIGHTS ARE NOT DECORATIVE (§7.1). Floors come from the MIN_FONT_PX
   basis (lib/render-core/floor.mjs) on the canvas's shorter side:
     portrait / story / square (short side 1080): heading 73.44 · pill 73.44
     landscape                (short side  900):  heading 61.20 · pill 61.20
   The kicker's box is `1 x floorPx x lineRatio x 1.02` — the house convention.
   The pill's box is deliberately 1.906x that line; the note on `pill` below
   says exactly what that buys and what it costs.
   ───────────────────────────────────────────────────────────────────────── */

import { DEFAULT_PALETTE } from '../brand-defaults.js';
import { assertValidTemplate } from './template-contract.mjs';

/* ── MEASURED BUDGETS ────────────────────────────────────────────────────────
   GENERATED — do not hand-edit. Regenerate with:
     node scripts/tools/measure-template-budgets.mjs --template caption_band

   Measured IN THE CANVAS RENDER CORE at the legibility floor (§11), in headless
   Chromium with the real brand webfonts loaded. `min` is the §7.1
   cross-dimension minimum — the budget the input actually enforces.
   ────────────────────────────────────────────────────────────────────────── */
// <<<BUDGETS_BEGIN>>>
export const MEASURED_BUDGETS = {
  "heading": {
    "portrait": 24,
    "story": 24,
    "square": 24,
    "landscape": 23,
    "min": 23
  },
  "pill": {
    "portrait": 16,
    "story": 16,
    "square": 16,
    "landscape": 16,
    "min": 16
  }
};
// <<<BUDGETS_END>>>

const P = DEFAULT_PALETTE;

/* ── THE NUMBERS, DERIVED ONCE AT AUTHORING TIME AND RECORDED AS LITERALS ────
   KICKER BOX — 1 line at the floor, x lineRatio 1.28, x 1.02 slack:
     1080-short-side dims  73.44 x 1.28 x 1.02 =  95.88px
       → /1350 .07102   /1920 .04994   /1080 .08878
     landscape             61.20 x 1.28 x 1.02 =  79.90px  → /900 .08878
   PILL BOX — 1.9063 x the floor line, so short copy paints large (§7):
     1080-short-side dims  73.44 x 1.9063 = 140.00px
       → /1350 .10370   /1920 .07292   /1080 .12963
     landscape             61.20 x 1.9063 = 116.67px  → /900 .12963
   MOTIF — the brand petal at its own ratio (5758:5729 = 1.00506:1):
     portrait/story/square 301.5 x 300px      landscape 261.3 x 260px          */

export const TEMPLATE_CAPTION_BAND = assertValidTemplate({
  id: 'caption_band',
  name: 'Caption Band',
  version: 1,

  // §8 / §6.3 rule 3 — the gallery card's client-facing "why choose this one",
  // and it STATES the slots so she chooses knowing. It says the photo is
  // required, because it is, and it says which of the two lines is the big one,
  // because that is the whole point of this template.
  purpose: 'A required photograph with a short announcement on a colour band beneath it, for when you have one thing to say.',

  // §5 — all four, each AUTHORED. Landscape stands the band on its end rather
  // than letterboxing the photograph.
  dimensions: {
    portrait: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 },
    square: { w: 1080, h: 1080 },
    landscape: { w: 1600, h: 900 },
  },

  /* THE MARK SITS ON THE PHOTO (client reference: top-right). Both TOP corners
     are sanctioned, and the pair is a real choice rather than one live chip and
     one dead one (M4): in the three tall frames both corners are on the
     photograph, and in landscape top-right lands on the flat right-hand field
     while top-left stays on the picture.

     THE BOTTOM CORNERS ARE NOT OFFERED, and that is geometry, not taste: the
     bottom of every frame is the caption band, and a mark inside the band would
     sit in the same field as the type it is competing with.

     WHY THIS SURVIVES AN UNKNOWN PHOTOGRAPH is not asserted here — it is
     measured, over the brand's whole live library, by
     scripts/tools/scan-mark-on-photo.mjs. See the note above `scrim`. */
  allowedLogoPositions: ['top-right', 'top-left'],

  // The same sanctioned subset the other two templates draw from — the mark
  // sits at 0.08–0.12 of the width here too, so only the compact lockups stay
  // legible. The set intentionally contains marks that are WRONG for some
  // fields (an ivory mark on the ivory band's own field). That is not silently
  // substituted: the backdrop check refuses the export and says so (§7.2).
  allowedLogoAssets: ['s1-green', 's1-ivory', 'p3-green', 'p3-ivory', 'p-circle'],

  /* §6.2 — PRE-VERIFIED pairs, contrast measured at bake time by the validator.
     IVORY FIRST: it is the client's own reference band.

     Three, not four. Blush is excluded rather than shipped: on this template
     the band is the ONLY place the type lives, and the mark's field on three of
     the four dimensions is a photograph under this pair's own wash — the fewer
     near-identical pale fields in the set, the more each chip means. Sage and
     ivory are already the two pale fields the brand uses; a third is a picker
     with nothing to say (M4). Reported as a choice, not a silent omission. */
  colourPairs: [
    { id: 'ivory', label: 'Ivory', bg: P.whiteSmoke, ink: P.burnham, contrast: 8.5, klass: 'light' },
    { id: 'sage', label: 'Sage', bg: P.sage, ink: P.burnham, contrast: 5.86, klass: 'light' },
    { id: 'forest', label: 'Forest', bg: P.burnham, ink: P.whiteSmoke, contrast: 8.5, klass: 'dark' },
  ],

  /* ── THE MOTIF, AND WHY IT IS A ONE-ELEMENT SET (client ruling 2026-08-20) ──
     "fixed for now."

     §9 gives the slot as "pick one from the brand set, or none". The client
     ruled the pick away for this template: the petal in the band is part of the
     drawing, not a decision. So the sanctioned set is exactly one id, the slot
     names that id, and the user app renders NO motif picker — there is no
     section for one in `panelSections`, and `assertValidTemplate` refuses a
     second id precisely so it cannot quietly become a choice she never sees.

     `petal-brand` IS THE TRUE BRAND PETAL — derived verbatim from the ratified
     orchid mark (see the provenance note in petal-brand.svg and its row in
     DEFAULT_OVERLAY_ASSETS). Law 3: it is a real file, proven by
     scripts/tests/template-three.test.mjs.

     IT IS THE SHAPE TEMPLATE TWO'S PICKER DELIBERATELY DOES NOT OFFER, and
     that is not a contradiction — it is the same fact read for a different job.
     Template two curated it out because its COLUMN NOTCH near the tip reads as
     a bite taken out of a PHOTOGRAPH. Here nothing is cut: the petal is stamped
     into flat field at a tenth of the ink, where that notch is the brand's own
     silhouette and is what makes it recognisably the orchid rather than a
     generic leaf. Two templates, two jobs, one honest asset. */
  // Client ruling 2026-08-18: "band should not have the petal motif". The band
  // carries the words and nothing else. Declared 'none', not merely absent, so
  // the contract records the decision rather than leaving a hole.
  motif: 'none',

  /* ── THE PANEL, IN THIS TEMPLATE'S ORDER ─────────────────────────────────
     Behind the words, then the words, then the mark — the same spine Classic
     and Petal Window both follow, expressed in this template's own sections.

     `background` is the merged section: the colour-pair picker AND the photo,
     one heading, in that order. It is Classic's grouping and it is right here
     for Classic's reason — the pair and the photograph are both "what sits
     behind the words". On this template that is unusually literal: the pair IS
     the band the type sits on, and the photo is the field above it. They are
     two halves of one background and belong under one label.

     NOT A SECTION: the motif. It is fixed (see `motif` above), so there is no
     control for it, so there is nothing for the panel to order. The contract
     checks that in both directions — a need with no section is unreachable, a
     section with no need is a control for nothing. */
  panelSections: ['background', 'words', 'mark', 'markPosition'],

  /* ── FIELD COPY — THE LABELS MUST NOT LIE ABOUT THE HIERARCHY ────────────
     (ratified 2026-08-20) The pill is visually DOMINANT over the heading on
     this template. The surface's default labels were written for Classic,
     where the heading is the whole post — "The line that carries the post" —
     and reusing them here would tell her the opposite of what the picture
     shows. She would write her headline into the small line and her afterthought
     into the big one, and nothing in the app would ever correct her (M4: a
     control that says something the render does not back).

     So both are renamed, in the client's plain register, and each says WHERE it
     lands rather than what it is called in the contract:
       · heading → "The quiet line above"  — it is a kicker, and the hint gives
         the client's own example so the register is unmistakable.
       · pill    → "The big words"         — and the hint says outright that it
         is the biggest type on the design and that it is set in capitals, which
         is the one thing she cannot see until she has typed it.
     Classic and Petal Window keep their own labels; the three are independent,
     which is exactly what lets this land without touching the other two. */
  slotLabels: {
    heading: { label: 'The quiet line above', hint: 'The small detail, in sentence case — like "Term 3 places open".' },
    pill: { label: 'The big words', hint: 'Two or three words. They are set in capitals and they are the biggest type on the design.' },
  },

  // Which slots paint, bottom of the stack first. Table data, not an algorithm.
  paintOrder: ['heading', 'pill'],

  /* The typographic register each slot paints in. `face` names a BRAND FONT
     ROLE (lib/brand-defaults.js), never a family literal — law 7.

     THE KICKER is the brand's body sans at its LIGHT weight (300 — a real cut,
     FiraSans-Light.ttf), sentence case, generously leaded. Quiet by
     construction, not by being small.

     THE PILL is the brand serif, uppercased and lightly tracked. And here is
     the honest part, reported rather than papered over (M4): THE BRAND SERIF
     SHIPS ONE WEIGHT. Romie is Regular + Italic and nothing else, so "bold" in
     the client's brief cannot be delivered by a bold cut — measured in the
     render core, Romie caps are byte-for-byte the same width at 400, 500, 600
     and 700, because Chromium finds no heavier face and synthesises nothing.
     The weight declared below is therefore the same 500 the other two templates
     declare for the title role, and the pill's DOMINANCE is delivered by the
     three things that do work: SCALE (its box is 1.906x the kicker's line),
     CAPITALS (cap height against the sans's x-height), and the serif's own
     colour on the page. If the brand later ships a Romie Bold, this is the one
     number that has to change. */
  registers: {
    heading: { face: 'body', weight: 300, caps: false, lineRatio: 1.28, align: 'left' },
    pill: { face: 'title', weight: 500, caps: true, tracking: 0.02, lineRatio: 1.02, align: 'left' },
  },

  slots: {
    // ── TEXT ────────────────────────────────────────────────────────────────
    /* THE KICKER. One line, in every dimension, and that is a design decision
       with a budget consequence: a second line would double the budget but also
       double the band, and the band is what the photograph pays for. Optional —
       the big words can stand alone. */
    heading: {
      present: true,
      charBudget: MEASURED_BUDGETS.heading.min,
      measured: MEASURED_BUDGETS.heading,
      dimensions: {
        portrait:  { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.heading.portrait,  box: { x: 0.06, y: 0.7615, w: 0.88, h: 0.07102 } },
        story:     { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.heading.story,     box: { x: 0.06, y: 0.7092, w: 0.88, h: 0.04994 } },
        square:    { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.heading.square,    box: { x: 0.06, y: 0.7207, w: 0.88, h: 0.08878 } },
        landscape: { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.heading.landscape, box: { x: 0.46, y: 0.3830, w: 0.48, h: 0.08878 } },
      },
    },

    /* ── THE PILL — THE BIGGEST TYPE ON THE DESIGN ────────────────────────────
       maxLines 1 everywhere. Two lines was authored and thrown away, and the
       reason is worth keeping: with a fixed box and top-anchored painting, a
       two-line box holding one line leaves a whole dead line under the words
       (112px on portrait), and the band's bottom margin visibly changes with
       what she typed. One line, wider, is the same design at every length.

       THE BOX IS 1.906x THE FLOOR LINE, AND THAT IS THE WHOLE MECHANISM. §7:
       "short copy renders large and dramatic, longer copy renders smaller, down
       to a floor." The kicker's box is the ordinary one-line-at-the-floor box,
       so it paints at ~74px whatever she writes. The pill's box lets autofit go
       up to ~137px, so "OPEN DAY" fills the band and "NOW ENROLLING" lands at
       ~110px — and at the full budget it settles at ~82px, which is STILL
       larger than the kicker. The hierarchy therefore holds at EVERY length she
       can type, which is what makes it authored data rather than a hope.

       WHAT IT COSTS, SAID PLAINLY (M4 — no comfortable silence): the band's
       optical bottom margin is not constant. A short label paints tall and sits
       close to the band's floor; a long one paints small and leaves up to ~55px
       more air beneath it on portrait. That is autofit doing exactly what §7
       asks of it, and the alternative — a box that resizes to the copy — is the
       solver coming back as data (§6.2). */
    pill: {
      present: true,
      charBudget: MEASURED_BUDGETS.pill.min,
      measured: MEASURED_BUDGETS.pill,
      dimensions: {
        portrait:  { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.pill.portrait,  box: { x: 0.06, y: 0.8444, w: 0.88, h: 0.10370 } },
        story:     { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.pill.story,     box: { x: 0.06, y: 0.7674, w: 0.88, h: 0.07292 } },
        square:    { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.pill.square,    box: { x: 0.06, y: 0.8243, w: 0.88, h: 0.12963 } },
        landscape: { present: true, required: false, maxLines: 1, charBudget: MEASURED_BUDGETS.pill.landscape, box: { x: 0.46, y: 0.4873, w: 0.48, h: 0.12963 } },
      },
    },

    // §6.3 — DEACTIVATING NEVER DELETES. This template shows two lines and a
    // picture; declaring the rest absent is honest, and swapping here from a
    // template that shows them KEEPS her words hidden rather than dropping them.
    eyebrow: { present: false },
    body: { present: false },
    attribution: { present: false },

    // ── NON-TEXT ────────────────────────────────────────────────────────────
    /* ── THE PHOTOGRAPH ──────────────────────────────────────────────────────
       Full-bleed across the top in the three tall frames, and the LEFT COLUMN
       in landscape. REQUIRED in every dimension (decision 2).

       WHY THESE FOUR HEIGHTS. Each is the largest photo that still leaves the
       band its two lines plus honest margins, and the crop each one implies is
       stated rather than left to be discovered:
         portrait  0.720 → 1080 x  972 (1.111:1) — the band gets 378px
         story     0.680 → 1080 x 1306 (0.827:1) — the band's block ends at
                   0.840, so the bottom 0.16 stays flat field, clear of the
                   Story action zone rather than fighting it
         square    0.680 → 1080 x  734 (1.471:1) — the widest crop of the four,
                   and the honest cost of a square frame with a caption band in
                   it: a portrait photograph loses its top and bottom here
         landscape 0.420 x 1.0 → 672 x 900 (0.747:1) — a TALL crop, which is
                   the entire point of decision 3

       THE TINT, and it is a tint. Nothing has to be READ against these pixels
       except the mark, so no opacity here is load-bearing for the copy. What it
       does is real and visible: a wash of the pair's own field colour so the
       photograph belongs to the band instead of being pasted above it.        */
    photo: {
      present: true,

      /* SHE MAY FRAME THE PICTURE (ratified 2026-08-20). A full-bleed
         photograph makes framing a real decision — which part of a vertical
         photo survives a 1.471:1 square crop is hers, not the crop's. Same
         machinery as Petal Window, same line: the BOX never moves and none of
         the geometry above changes; the transform is expressed in units of the
         slack the zoom creates, so empty field can never enter the frame. */
      adjustable: true,

      /* ── THE SCRIM — A TINT, AND THAT IS NOW A MEASURED CLAIM ────────────
         0.12 of the pair's own field colour, the same number Petal Window
         uses and for the same reason: nothing has to be READ against these
         pixels. The two text boxes live in the band, and the mark — the only
         ink that lands on the photograph — sits on its own declared plate (see
         `logo.plate` below). So this opacity carries no legibility load at all;
         what it does is make the photograph belong to the field instead of
         being pasted above it, and it leaves 88% of the picture.

         THAT IT COULD NOT CARRY THE MARK IS MEASURED, NOT ASSUMED.
         scripts/tools/scan-mark-on-photo.mjs sweeps all 131 library photos x
         every pair x every dimension x both sanctioned inks x both corners up
         an opacity ladder. Bare (a=0.00) the mark fails its 3.0 floor on 305 of
         524 photo/dimension combinations at top-right and 439 at top-left, and
         the worst case is a dead 1.00 — a mid-green photograph behind a
         mid-green lockup. The lowest wash that clears the WHOLE library is 0.66
         for ivory, 0.74 for sage and 0.64 for forest, and no sanctioned mark
         variant escapes it: the two inks the five variants paint in fail at
         305/524 and 283/524 respectively, so "restrict the marks to the ones
         that survive" is refuted by the same table — neither survives. A
         0.64-0.74 wash for the sake of one corner would take two thirds of the
         photograph on a template whose whole proposition is the photograph.
         The plate takes a 197 x 175px corner instead. */
      scrim: {
        ivory: { colour: P.whiteSmoke, opacity: 0.12 },
        sage: { colour: P.sage, opacity: 0.12 },
        forest: { colour: P.burnham, opacity: 0.12 },
      },

      dimensions: {
        portrait:  { present: true, required: true, fit: 'cover', box: { x: 0, y: 0, w: 1.00, h: 0.72 } },
        story:     { present: true, required: true, fit: 'cover', box: { x: 0, y: 0, w: 1.00, h: 0.68 } },
        square:    { present: true, required: true, fit: 'cover', box: { x: 0, y: 0, w: 1.00, h: 0.68 } },
        landscape: { present: true, required: true, fit: 'cover', box: { x: 0, y: 0, w: 0.42, h: 1.00 } },
      },
    },

    /* ── THE MOTIF — THE PETAL GHOSTED INTO THE BAND ─────────────────────────
       FIXED (decision 4): the asset is the template's, not hers. Everything
       below is table data — an id, a box, a number — and the render core paints
       it in the pair's own ink, contained at the asset's true proportions so
       the brand silhouette is never stretched.

       WHERE IT SITS: right-hand end of the band, centred on the two-line text
       block, overlapping the tail of both lines. That overlap is the design —
       "ghosted INTO the band", not parked beside it — and it is why the
       backdrop check still measures a band that is otherwise flat field.

       THE OPACITIES ARE PER DIMENSION because the same petal at the same alpha
       does not read the same in a 378px portrait band and a 768px-wide
       landscape column. They land at 0.10 for the three tall frames and 0.09
       for landscape, where the petal is a larger share of a smaller field.
       Measured consequence, in the worst case (the sage pair, whose flat field
       is the tightest of the three at 5.86:1): the ghost costs the band about
       0.7 of a contrast ratio, leaving the type well clear of the 4.5 floor —
       verified on every render by scripts/tools/verify-template-three.mjs
       rather than argued for here. */
    motif: {
      present: false,
      dimensions: {
        portrait:  { present: false },
        story:     { present: false },
        square:    { present: false },
        landscape: { present: false },
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

    /* The lockup. `box` records where the mark actually lands at the DEFAULT
       position (top-right) so the geometry is inspectable; the render core
       places it from widthFrac + pad + the chosen position. 0.12 of the width
       on the tall frames and 0.08 on landscape — the same sizes Classic uses,
       and deliberately not larger: a bigger mark samples a bigger patch of an
       unknown photograph, and a bigger patch is a busier one. */
    logo: {
      present: true,

      /* ── THE PLATE — WHAT LETS THE MARK STAY ON THE PICTURE ───────────────
         A fixed panel behind the mark, in the pair's own field colour, painted
         on EVERY render. It is what turns "the mark is on an unknown
         photograph" back into "the mark is on pre-verified field": the backdrop
         check still samples the real pixels under the lockup, and what it finds
         there is this plate, so the verdict returns the pair's own flat-field
         ratio (8.5 / 5.86 / 8.5) instead of a number the photograph decides.

         IT IS NOT AN AUTO-BACKING (law 3). The backings law 3 retired
         (b30fc8e) were runtime REMEDIES: a checker measured, found a problem,
         and fabricated a fix that varied with the content. This is painted
         identically on every render — same place, same opacity, in the three
         dimensions where the mark is on the photograph AND in landscape where
         it already sits on flat field and the plate is invisible against it.
         Nothing here reads a measurement. It is a drawn element, exactly as the
         photo scrim under it is.

         THE NUMBERS. `pad` 0.26 of the mark's own width and `radius` 0.5 make
         it a stadium about a third wider than the lockup — big enough to read
         as a deliberate chip, small enough that it is a corner of the picture
         rather than a band across it (197 x 175px on portrait, 1.4% of the
         canvas).

         AND IT IS OPAQUE. A translucent plate was authored first, at 0.80 /
         0.86 / 0.82 — comfortably above the sweep's measured minimum for the
         same box (0.66 / 0.74 / 0.64), so it cleared the floor everywhere. It
         was thrown away for a reason worth keeping: at 0.80 the mark's measured
         ratio still MOVED with the photograph, 6.57 to 8.00 across the crop
         range alone. Nothing failed, but the mark's legibility was still a
         function of her picture, so every claim about it had to be a claim
         about the whole library rather than a fact about the design. Opaque,
         the plate IS the pre-verified field: the measured ratio comes back as
         the pair's own flat-field number (8.5 / 5.86 / 8.5), identical on every
         photograph, at every crop, in every dimension. The verification gates
         that equality rather than a tolerance, which is the difference between
         proving something and observing it.

         THE COST, STATED (M4): there is now a small pale shape in the top
         corner of every design made with this template. It is the price of the
         client's own composition — the mark, on the picture, on any photograph
         staff pick. The three alternatives and what each costs are in the
         report that came with this template; every one of them is a data
         change from here, not a rebuild. */
      plate: {
        pad: 0.26,
        radius: 0.5,
        fill: {
          ivory: { colour: P.whiteSmoke, opacity: 1 },
          sage: { colour: P.sage, opacity: 1 },
          forest: { colour: P.burnham, opacity: 1 },
        },
      },

      /* `pad` is 0.07 rather than the 0.05 the other two templates use, and
         that is the plate's doing: the plate grows OUTWARD from the mark, so
         the mark has to stand far enough off the edge for its own plate to fit
         inside the frame with air to spare (42px on portrait, 79px on
         landscape). A 0.05 inset would have put the plate 15px from the top
         edge, which reads as a mistake rather than a margin. */
      dimensions: {
        portrait:  { present: true, required: false, box: { x: 0.81, y: 0.056, w: 0.12, h: 0.080 }, widthFrac: 0.12, pad: 0.07 },
        story:     { present: true, required: false, box: { x: 0.81, y: 0.039, w: 0.12, h: 0.056 }, widthFrac: 0.12, pad: 0.07 },
        square:    { present: true, required: false, box: { x: 0.81, y: 0.070, w: 0.12, h: 0.100 }, widthFrac: 0.12, pad: 0.07 },
        landscape: { present: true, required: false, box: { x: 0.85, y: 0.124, w: 0.08, h: 0.119 }, widthFrac: 0.08, pad: 0.07 },
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

export default TEMPLATE_CAPTION_BAND;
