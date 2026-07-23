/**
 * The type scale — the ONE source of truth for S/M/L (and legacy xs/xl) size steps.
 *
 * Why this exists (client complaint, recurring): "the font sizes (s,m,l) is still not
 * making differences." Root causes were three, all traced in docs/type-scale.md:
 *   1. the step multipliers were too small (legacy S was 0.85 → only 15% under M, below
 *      the perceptibility threshold; the element table was scattered in the solver);
 *   2. the multipliers were format-blind, so a step that read on a tall portrait was
 *      swallowed on a wide banner (whose canvas scale S=min(w,h)/1080 already shrinks
 *      everything) and vice-versa;
 *   3. the numbers lived as loose constants in two files (Generator FONT_SIZE_STEPS and
 *      element-placement-solver ELEMENT_SIZE_STEPS), impossible to reason about together.
 *
 * The contract encoded here:
 *   - M (and legacy m) is EXACTLY 1.0 in every family. A design at the default step is
 *     pixel-identical to before this module existed — that is what keeps the born-clean
 *     / arch-stress / render-fingerprint fixtures (all authored at defaults) invariant.
 *   - Adjacent S/M/L steps differ by >=18% at the target size, so a step is perceptible
 *     BEFORE any capacity clamp. (Legacy xs/xl extensions relax to >=15%.)
 *   - Absolute spread differs by FORMAT FAMILY: tall formats (portrait/story) have the
 *     vertical room to spread widest; wide feed formats (twitter/facebook/banner) keep a
 *     higher S floor so a shrunk step never drops below thumb-legibility in-feed.
 *
 * This module is pure data + arithmetic. It never measures a canvas. Capacity clamping
 * (auto-fit / fitText) still happens downstream in the painter; resolveEffectiveStep()
 * lets a caller report that clamp HONESTLY (no silent no-op — operating-manual M2)
 * instead of painting M while the pill still says L.
 */

// (mirrored surface) The six ratified formats map to three families. Additions here must
// mirror DIMENSIONS in components/Generator.jsx — a new format with no family entry falls
// back to 'square' (a safe middle spread) rather than throwing.
export const FORMAT_FAMILY_BY_DIMENSION = Object.freeze({
  ig_portrait: "tall",
  story: "tall",
  ig_square: "square",
  twitter: "wide",
  facebook: "wide",
  banner: "wide",
});

export const FORMAT_FAMILIES = Object.freeze(["tall", "square", "wide"]);

export function formatFamilyOf(dimensionId) {
  return FORMAT_FAMILY_BY_DIMENSION[String(dimensionId || "")] || "square";
}

// The scale table. `legacy` carries the five-step ladder the editor role pills expose
// (xs/s/m/l/xl); `element` carries the three-step S/M/L the added-element pills expose.
// s/m/l and S/M/L share the same anchor per family so a heading role and a heading
// element step by the same visible amount. m and M are pinned at 1.0 (fixture invariance).
export const TYPE_SCALE = Object.freeze({
  tall: Object.freeze({
    legacy: Object.freeze({ xs: 0.64, s: 0.78, m: 1.0, l: 1.36, xl: 1.64 }),
    element: Object.freeze({ S: 0.78, M: 1.0, L: 1.36 }),
  }),
  square: Object.freeze({
    legacy: Object.freeze({ xs: 0.66, s: 0.8, m: 1.0, l: 1.33, xl: 1.56 }),
    element: Object.freeze({ S: 0.8, M: 1.0, L: 1.33 }),
  }),
  // wide L is deliberately the STRONGEST relative top step: live measurement showed the
  // contrast-escalation ladder lifts M on small wide formats (banner body over a photo),
  // compressing M→L — a high L keeps the top step perceptible there. S stays highest
  // (least shrink) for in-feed thumb-legibility.
  wide: Object.freeze({
    legacy: Object.freeze({ xs: 0.7, s: 0.82, m: 1.0, l: 1.3, xl: 1.5 }),
    element: Object.freeze({ S: 0.82, M: 1.0, L: 1.3 }),
  }),
});

// Minimum perceptible delta between adjacent S/M/L steps (the test's ratchet). xs/xl
// extensions are allowed to relax to LADDER_MIN_DELTA.
export const STEP_MIN_DELTA = 0.18;
export const LADDER_MIN_DELTA = 0.15;

const clampFamily = family => (TYPE_SCALE[family] ? family : "square");

/** Legacy role multiplier for a step id (xs|s|m|l|xl) in a format family. Unknown → m. */
export function legacyStepMult(step, family = "square") {
  const table = TYPE_SCALE[clampFamily(family)].legacy;
  const key = table[step] != null ? step : "m";
  return table[key];
}

/** Added-element multiplier for a step id (S|M|L) in a format family. Unknown → M. */
export function elementStepMult(step, family = "square") {
  const table = TYPE_SCALE[clampFamily(family)].element;
  const key = table[step] != null ? step : "M";
  return table[key];
}

/** basePx scaled by the S/M/L step for this family (the element painter's entry point). */
export function elementStepPx(basePx, step, family = "square") {
  return basePx * elementStepMult(step, family);
}

const ELEMENT_STEP_ORDER = Object.freeze(["S", "M", "L"]);

/**
 * Resolve the EFFECTIVE step once capacity is known, so the UI can be honest when
 * auto-fit has to shrink a pinned step to make the copy fit (operating-manual M2/M4):
 * the pill reflects the step that actually paints, and `capped` says the requested step
 * did not survive here.
 *
 *   basePx      the class/role base at M for this format (pre-step)
 *   step        the user's requested step (S|M|L)
 *   family      format family
 *   capacityPx  the largest size the copy can take in its box (from the painter's fit
 *               measurement). Omit/null → uncapped (requested step survives).
 *   floorPx     the role's readable floor (optional); a step never resolves below it.
 *
 * Returns { requestedStep, requestedPx, effectiveStep, effectivePx, capped, atFloor }.
 * effectiveStep is the coarsest S/M/L label whose target px is <= what actually paints,
 * so a capped L on a full banner reports as "M" (or "S"), never silently as the pinned L.
 */
export function resolveEffectiveStep({ basePx, step, family = "square", capacityPx = null, floorPx = 0 } = {}) {
  const fam = clampFamily(family);
  const requestedStep = ELEMENT_STEP_ORDER.includes(step) ? step : "M";
  const requestedPx = basePx * elementStepMult(requestedStep, fam);
  const floor = Number.isFinite(floorPx) ? floorPx : 0;
  const hasCap = Number.isFinite(capacityPx);
  // What actually paints: requested target, clamped down by capacity, up by floor.
  let effectivePx = requestedPx;
  if (hasCap) effectivePx = Math.min(effectivePx, capacityPx);
  const atFloor = effectivePx <= floor + 0.5;
  effectivePx = Math.max(effectivePx, floor);
  // Coarsest step whose target is still <= the painted px (a tie stays at the request).
  let effectiveStep = requestedStep;
  for (const candidate of ELEMENT_STEP_ORDER) {
    const candidatePx = basePx * elementStepMult(candidate, fam);
    if (candidatePx <= effectivePx + 0.5) effectiveStep = candidate;
  }
  // Never report a step ABOVE the request (capacity only shrinks; floor can't invent L).
  if (ELEMENT_STEP_ORDER.indexOf(effectiveStep) > ELEMENT_STEP_ORDER.indexOf(requestedStep)) {
    effectiveStep = requestedStep;
  }
  return Object.freeze({
    requestedStep,
    requestedPx,
    effectiveStep,
    effectivePx,
    capped: effectiveStep !== requestedStep,
    atFloor,
  });
}

/** Pill label that never lies: "L" when it paints as asked, "L (fits as M here)" when capped. */
export function describeEffectiveStep(resolved) {
  if (!resolved || !resolved.capped) return resolved ? resolved.requestedStep : "M";
  return `${resolved.requestedStep} (fits as ${resolved.effectiveStep} here)`;
}
