/* ─────────────────────────────────────────────────────────────────────────
   THE LEGIBILITY FLOOR — docs/template-system-spec.md §7.3.

   "The floor is the legibility floor. Reuse the existing per-format MIN_FONT_PX
    basis (derived from thumbnail legibility; banner-class ≈24px body / ≈34px
    headline). DO NOT INVENT A NEW NUMBER."

   These formulas are the SAME basis as components/Generator.jsx's MIN_FONT_PX
   map — not a re-derivation. scripts/tests/template-floor-parity.test.mjs parses
   the Generator source and fails closed if the two ever drift, so "reuse" is
   machine-checked rather than asserted in a comment.

   Slot → floor register (the render core's only mapping decision):
     heading     → headline   (the display hero)
     body        → body       (the reading support line)
     eyebrow     → dateLabel  (the small tracked all-caps token)
     pill        → headline   (see the note below — the pill is a DISPLAY line)
     attribution → body
   ───────────────────────────────────────────────────────────────────────── */

// Verbatim from components/Generator.jsx (MIN_FONT_PX). Do not retune here.
export const MIN_FONT_PX = Object.freeze({
  headline:  (h) => Math.max(0.068 * h, 38 * (h / 1080)),
  date:      (h) => Math.max(0.100 * h, 60 * (h / 1080)),
  intro:     (h) => Math.max(0.062 * h, 34 * (h / 1080)),
  body:      (h) => Math.max(0.062 * h, 32 * (h / 1080)),
  dateLabel: (h) => Math.max(0.040 * h, 22 * (h / 1080)),
});

/* ── WHY `pill` IS ON THE HEADLINE FLOOR (template three, 2026-08-20) ────────
   It used to be `dateLabel`, on the reading that a "pill" is a micro-label like
   the eyebrow. Template three ("Caption Band") is the first template that
   actually DECLARES a pill, and there the pill is the client's dominant line —
   §6.1's own example for the slot, "NOW ENROLLING", set in bold serif caps
   ABOVE the heading in the visual hierarchy.

   The floor is not a size control (autofit owns size — §7); it is what the
   BUDGET is measured at. On the dateLabel floor (0.040 of the short side) the
   pill's measured budget came out at ~28 characters, and at 28 characters the
   pill paints SMALLER than the heading — the authored hierarchy inverts the
   moment she uses her whole budget. On the headline floor (0.068) the budget is
   ~17 and the pill stays the largest type on the design at EVERY length she can
   type. The floor is therefore what makes the ratified hierarchy true by
   construction rather than true for short copy only.

   REPORTED AS A CONTRACT GAP, not patched around: this map is GLOBAL, so a
   future template that wants a pill as a genuine micro-label has no way to say
   so — §7.3 gives the floor register per SLOT, never per template. No template
   needs that today (this is the only pill in the registry, asserted in
   scripts/tests/template-three.test.mjs) and docs/template-system-spec.md is
   law and is not edited here; the gap is raised for ruling.

   Nothing else moves: no other template declares a `pill`, so every existing
   render is byte-identical and every existing budget is unchanged.          */
export const SLOT_FLOOR_REGISTER = Object.freeze({
  heading: 'headline',
  body: 'body',
  eyebrow: 'dateLabel',
  pill: 'headline',
  attribution: 'body',
});

/* ── THE ONE INTERPRETATION DECISION (reported as a §12 contract gap) ────────
   In the admin renderer MIN_FONT_PX is NEVER applied raw. It is always routed
   through `minFloor(role, h, ceil, legacyMin)`, which CLAMPS it to `ceil` — the
   natural size the copy takes on that format — precisely so a tall canvas does
   not inherit an absurd minimum. Its sibling term, `38 * (h/1080)`, is the
   renderer's own `38 * S` where `S = min(w,h)/1080`.

   The template system has no `ceil` to clamp against: §7 inverts the
   relationship — the box is SIZED FROM the floor, so the floor cannot in turn be
   sized from the box. Applying MIN_FONT_PX to canvas HEIGHT unclamped makes a
   9:16 story demand a 131px minimum headline, which measured out at a 9-character
   eyebrow budget and a 36-character heading budget — a template nobody can write
   a post in.

   Resolution, and it invents no number: the SAME formula, the SAME constants,
   the SAME role table, evaluated on the canvas's SHORTER SIDE — which is exactly
   the basis the renderer's own `S` scale uses, and which reproduces the stated
   design targets on every wide format (landscape 1600×900 → headline 61px, body
   56px; the manual's banner-class ≈34/≈24 targets scale from the same line).
   It also does most of the §7.1 equalisation work for free: portrait, story and
   square share a floor, so their budgets land within a few characters instead of
   a factor of two.

   FLAGGED FOR RULING: §7.3 says "reuse the existing per-format MIN_FONT_PX
   basis ... do not invent a new number", and this reuses the basis but changes
   the argument. If the orchestrator rules that the argument must stay `h`, the
   template is still buildable — its budgets simply drop to 9/36/24 characters.  */

/**
 * The floor size in canvas px for a text slot.
 * @param {string} slotName
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 */
export function floorPxFor(slotName, canvasWidth, canvasHeight) {
  const register = SLOT_FLOOR_REGISTER[slotName];
  if (!register) return null;
  return MIN_FONT_PX[register](Math.min(canvasWidth, canvasHeight));
}
