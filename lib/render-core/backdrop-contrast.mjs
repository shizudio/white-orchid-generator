/* ─────────────────────────────────────────────────────────────────────────
   THE BACKDROP CHECK — a DELIBERATE, CLIENT-RATIFIED AMENDMENT to §10.

   §10A retired "runtime contrast guards (colour pairs are pre-verified)". That
   reasoning is exact and still holds: a template's colour pairs are verified at
   BAKE time, so nothing needs re-checking at runtime. It stops holding the
   moment the field is not the pair's flat colour — a photo the user picked
   cannot be pre-verified at authoring time, because at authoring time it does
   not exist.

   So the amendment is scoped to exactly that gap and no further:
     · it runs ONLY when a photo is actually painted (no photo → not called,
       and the flat-pair render is byte-identical to before)
     · it MEASURES, it does not negotiate: fixed scrim in, real ratio out
     · there is NO adaptive ladder, no auto-fix, no advisor dot, no ledger
     · failing is a REFUSAL (export blocked for that dimension), not advice

   IT WRITES NO COLOUR MATH. Every number comes from the helpers the admin app
   has always used (lib/surface-contrast-policy.mjs): rgbLuminance for pixels,
   hexLuminance for the ink, summarizeLuminanceSamples for the region, and
   evaluateInkLegibility for the verdict.
   ───────────────────────────────────────────────────────────────────────── */

import {
  rgbLuminance,
  hexLuminance,
  summarizeLuminanceSamples,
  evaluateInkLegibility,
} from '../surface-contrast-policy.mjs';
import { MIN_PAIR_CONTRAST } from '../templates/template-contract.mjs';

// The text floor is the SAME number the pre-verified pairs must clear — one
// bar for "is this readable", whether the field is a flat colour or a photo.
export const TEXT_MIN_CONTRAST = MIN_PAIR_CONTRAST;
// A brand mark is a graphical object, not body copy: WCAG 1.4.11 non-text
// contrast. Named, not buried, so the difference is arguable rather than secret.
export const MARK_MIN_CONTRAST = 3;

// At most this many samples per axis inside a box. Deterministic: the step is
// derived from the box size, so the same box always samples the same pixels.
const SAMPLE_GRID = 24;

/**
 * The luminance of the ACTUALLY PAINTED pixels under a box.
 * Call it after the backdrop is painted and BEFORE the ink goes on top —
 * otherwise you measure the text against itself.
 *
 * @returns {{mean,variance,low,high,count}|null} null when the region is empty
 *   or the canvas cannot be read (a cross-origin photo taints it — see
 *   `unreadable` in checkInkOnBackdrop, which refuses rather than passing).
 */
export function sampleBackdropLuminance(ctx, box, canvasWidth, canvasHeight) {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(Math.ceil(box.w), canvasWidth - x);
  const h = Math.min(Math.ceil(box.h), canvasHeight - y);
  if (!(w > 0 && h > 0)) return null;
  let data;
  try {
    data = ctx.getImageData(x, y, w, h).data;
  } catch {
    return null; // tainted canvas — reported honestly by the caller
  }
  const stepX = Math.max(1, Math.floor(w / SAMPLE_GRID));
  const stepY = Math.max(1, Math.floor(h / SAMPLE_GRID));
  const samples = [];
  for (let py = 0; py < h; py += stepY) {
    for (let px = 0; px < w; px += stepX) {
      const i = (py * w + px) * 4;
      if (data[i + 3] < 16) continue;
      samples.push(rgbLuminance(data[i], data[i + 1], data[i + 2]));
    }
  }
  return summarizeLuminanceSamples(samples);
}

/**
 * Is `inkHex` readable against what is really painted under `box`?
 *
 * @returns {{ok, ratio, meanRatio, worstRatio, busy, minimum, unreadable}}
 *   `unreadable:true` means the pixels could not be read at all. That is NOT a
 *   pass — an unverifiable photo is refused exactly like a failing one, because
 *   the alternative is claiming a check that did not happen (M4).
 */
export function checkInkOnBackdrop(ctx, box, inkHex, canvasWidth, canvasHeight, minimumContrast = TEXT_MIN_CONTRAST) {
  const surface = sampleBackdropLuminance(ctx, box, canvasWidth, canvasHeight);
  if (!surface) {
    return { ok: false, ratio: null, meanRatio: null, worstRatio: null, busy: false, minimum: minimumContrast, unreadable: true };
  }
  const verdict = evaluateInkLegibility(surface, hexLuminance(inkHex), { minimumContrast });
  const r2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
  return {
    ok: verdict.ok,
    ratio: r2(verdict.contrast),
    meanRatio: r2(verdict.meanContrast),
    worstRatio: r2(verdict.worstContrast),
    busy: verdict.busy,
    minimum: minimumContrast,
    unreadable: false,
  };
}
