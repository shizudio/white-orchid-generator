// Shape-layer paint & obstacle policy — the 2026-07-27 client ruling, executable.
//
// Ruling (verbatim): "once i add more than 1 shape, text cannot be shown, make sure
// text and logo are the top layers."
//
// Two consequences, both owned here so the editorial and legacy painters cannot
// drift apart:
//
// 1. PAINT ORDER (DLC §8, decoration band 35 < content 40 < marks 50): every added
//    (non-frame) shape layer paints in the `added-shapes` phase — BEFORE content and
//    brand marks — whatever its render mode (fill/outline/line-art) or asset
//    category. The old top-of-everything pass is retired; text and the logo are the
//    top layers by construction.
//
// 2. OBSTACLE CLASS (DLC §7): a flat added-shape silhouette is a SURFACE text sits
//    on (content × structural shape / decoration resolves — the contrast ladder
//    picks a legible ink over the shape's own colour; §15 measures contrast on the
//    final surface beneath the role). It is never a placement wall: hard blockers
//    remain other text, the logo/legal marks, protected subjects and platform
//    zones. System MOTIF decor keeps its compose-or-avoid contract (it is
//    archetype-authored and solved at generation time), and small accessories
//    occupy nothing.
//
// Pure: no Canvas, no React, no brand literals.

export const SHAPE_PAINT_SEQUENCE = Object.freeze([
  "background",
  "media",
  "structural-frames",   // media-hosting frame + structural silhouettes (layout-owned)
  "added-shapes",        // ← every added non-frame shape layer, all render modes
  "content",             // text roles + added text elements
  "brand-marks",         // logo / legal marks — always above added shapes
]);

/**
 * Classify one placed shape layer for painting and placement.
 *
 * @param {object} layer          placed shape layer ({ mode, motif, ... })
 * @param {string} assetCategory  the source asset's category ("overlays" |
 *                                "accessories" | uploads/custom)
 * @returns {{ phase:string, obstacle:"decor"|"surface"|"none", bandExclude:boolean }}
 *   phase       — which SHAPE_PAINT_SEQUENCE phase paints it
 *   obstacle    — "decor" (compose-or-avoid, system motif), "surface" (soft — the
 *                 ladder resolves ink over it), "none" (occupies nothing)
 *   bandExclude — whether its painted box joins the §6a shape–band exclusion set
 *                 (a contrast band may never slice a silhouette it paints above)
 */
export function classifyShapeLayerPaint(layer, assetCategory) {
  const mode = (layer && layer.mode) || "frame";
  if (mode === "frame") {
    // Structural frame layers (media host / colour silhouettes) belong to the
    // frame-job pass; the unified frame painter owns their obstacle handling.
    return { phase: "structural-frames", obstacle: "none", bandExclude: true };
  }
  if (layer && layer.motif) {
    // System motif decor — archetype-authored, compose-or-avoid (study-2 mood-8).
    return { phase: "added-shapes", obstacle: "decor", bandExclude: true };
  }
  if (assetCategory === "accessories") {
    // Small semantic accents (arrows, sparks): painted under content, but they
    // occupy nothing and must not flip the §6a no-band rung canvas-wide.
    return { phase: "added-shapes", obstacle: "none", bandExclude: false };
  }
  // Added flat shape (built-in brand shape or upload), any paint mode: a SURFACE.
  return { phase: "added-shapes", obstacle: "surface", bandExclude: true };
}
