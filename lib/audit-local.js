/* ─────────────────────────────────────────────────────────────────────────
   LOCAL DETERMINISTIC DESIGN AUDIT (Commit 1)

   Pure function: given the engine's own audit signal snapshot (auditRef.current,
   populated inside Generator.renderScene during a live render) plus a compact
   design-state view, produce a findings[] list. This is FREE and INSTANT — it
   reimplements NONE of the engine's maths; it reads the deterministic decisions
   the render pass already made (resolved zone contrast, per-role floor pins,
   §6 drops, logo overlap / focal-band, safe-zone override violations).

   Every finding is ADVISORY. Fixes are design patches (the same nullable shape
   as PATCH_JSON_SCHEMA) so the editor's single validated applyDesignPatch() can
   apply them; a null fix means "surface the issue, no automatic tweak".

   Finding shape:
     { id, layer:"local", category, severity, message, fix }
   category  : "contrast" | "type-size" | "safe-zone" | "overlap" | "degradation"
   severity  : "fail" | "warn" | "info"
   message   : plain-English, user-facing
   fix       : a partial design patch (only the fields to change) or null
   ───────────────────────────────────────────────────────────────────────── */

// WCAG floors used for classification (spec §2/§3). We classify the effective
// contrast in the resolved text zone; large display type still targets the
// stricter 4.5:1 warn floor because photographic backgrounds are non-uniform.
export const CONTRAST_FAIL = 3.0;   // below this = fail (illegible)
export const CONTRAST_WARN = 4.5;   // below this = warn (AA normal-text floor)

// Build the contrast fix. The gradient band treatment was removed 2026-07-02, so
// the Auto ladder's mechanical rungs are: colour-flip → placement → SOLID band.
// Colour-flip/placement run deterministically inside the renderer's Auto mode; the
// only escalation the audit can hand the harmonizer is forcing the solid band —
// EXCEPT when the text sits on a FLAT SOLID brand region (e.g. an AI design whose
// text landed on the celadon bg in the tall Story format: ivory-on-celadon ≈1.7:1).
// A band on a solid bg is aesthetically wrong and the renderer's frame-bg guard
// even refuses to draw one there — the correct repair is a TEXT-COLOUR FLIP to the
// higher-contrast brand pole vs the sampled zone. AI patches set textColorId
// explicitly, so the colour-flip in resolveZoneTc is bypassed; this fix (applied by
// the silent harmonizer) is what actually closes the loop for those designs.
//   - flat solid zone → flip textColorId to the higher-contrast pole (jet/burnham on
//     light zones, whiteSmoke on dark zones — all valid TEXT_COLOR_OPTIONS ids).
//   - photo / busy zone, not yet on a band → propose backdropMode "band"
//     (0.92 opacity, uniform coverage — the strongest, spec §5).
//   - already on a band (or nothing left) and STILL failing → no mechanical tweak
//     (the copy or photo would need changing — out of scope); return null.
function contrastFix(signal, severity) {
  const zc = signal.zoneContrast;
  // Flat solid region → colour-flip, not a band.
  if (zc && zc.flat && typeof zc.zoneMeanL === "number") {
    const flipped = flatSolidTextColor(zc.zoneMeanL);
    // Only propose the flip if it's actually a change vs the current explicit colour.
    if (flipped && flipped !== signal.textColorId) return { textColorId: flipped };
    return null; // already on the best pole and still failing → nothing mechanical left
  }
  const mode = signal.backdropMode || "auto";
  if (mode === "band") return null; // strongest treatment already on
  return { backdropMode: "band" };
}

// Highest-contrast brand text-colour id for a FLAT solid zone of mean luminance
// `zoneMeanL` (0..1). Rather than a naive light/dark threshold (which mis-classifies
// mid-tone brand solids like celadon ≈0.5, where ivory reads only ~1.7:1 but jet
// reads ~7:1), pick the brand text pole with the MAXIMUM WCAG contrast against the
// zone. Poles are the three neutral text tokens in TEXT_COLOR_OPTIONS (ivory reads
// as the light pole; jet/burnham as the dark poles — jet wins raw contrast, burnham
// is the softer on-brand dark for near-white zones). All ids are valid patch values.
export function flatSolidTextColor(zoneMeanL) {
  // sRGB relative luminance of the brand poles (kept in sync with B in Generator).
  const L = { jet: 0.0219, burnham: 0.0699, whiteSmoke: 0.8412 };
  const cr = (a, b) => { const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };
  return ["whiteSmoke", "burnham", "jet"]
    .map(id => ({ id, c: cr(zoneMeanL, L[id]) }))
    .sort((a, b) => b.c - a.c)[0].id;
}

export function runLocalAudit(signal) {
  const findings = [];
  if (!signal || typeof signal !== "object") return findings;

  // (1) Effective text contrast in the resolved text zone (spec §2/§3).
  // Only meaningful when text sits on a photo/video — flat brand backgrounds are
  // legible by construction. We judge on the MEAN cell contrast (the background
  // the glyphs actually sit on) and use the WORST (min) cell only to ESCALATE:
  // a single busy edge cell shouldn't override an otherwise clearly-legible zone
  // (e.g. a solid band with one anti-aliased boundary cell), but a genuinely dark
  // patch under a word (min far below the mean) still warrants attention. This
  // avoids false fails on a well-scrimmed high-variance photo while still catching
  // real dark-text-on-dark-photo cases (where BOTH mean and min are low).
  if (signal.hasMedia && signal.hasText && signal.zoneContrast && typeof signal.zoneContrast.mean === "number") {
    const mean = signal.zoneContrast.mean;
    const min = typeof signal.zoneContrast.min === "number" ? signal.zoneContrast.min : mean;
    // Fail: the dominant background clashes, or a real patch is badly below both
    // the fail floor AND the mean (not just an anti-aliased edge sliver).
    const fail = mean < CONTRAST_FAIL || (min < 2.0 && min < mean * 0.5);
    // Warn on a low MEAN only. A single dark boundary cell (low min) under an
    // otherwise strong mean is a sampling artifact at the scrim/band edge, not a
    // legibility problem — the glyphs sit on the good background — so we do NOT
    // warn on min alone once the mean comfortably clears the AA floor.
    const warn = !fail && mean < CONTRAST_WARN;
    const shown = mean; // the mean is the background the glyphs actually sit on
    // A flat solid brand region reads differently to a photo — the copy (message)
    // and the fix (colour-flip, not a backdrop) both adapt.
    const onSolid = !!(signal.zoneContrast.flat);
    if (fail) {
      findings.push({
        id: "contrast-fail",
        layer: "local",
        category: "contrast",
        severity: "fail",
        message: onSolid
          ? `Your text colour is hard to read on this background (contrast ${mean.toFixed(1)}:1, below the 3:1 minimum). A higher-contrast text colour fixes it.`
          : `Your text is hard to read against the photo (contrast ${mean.toFixed(1)}:1, below the 3:1 minimum). Add a backdrop behind the text.`,
        fix: contrastFix(signal, "fail"),
      });
    } else if (warn) {
      findings.push({
        id: "contrast-warn",
        layer: "local",
        category: "contrast",
        severity: "warn",
        message: onSolid
          ? `Text contrast is a little low (${shown.toFixed(1)}:1, below the 4.5:1 comfort target). A higher-contrast text colour would read more clearly.`
          : `Text contrast is a little low (${shown.toFixed(1)}:1, below the 4.5:1 comfort target). A stronger backdrop would make it easier to read.`,
        fix: contrastFix(signal, "warn"),
      });
    }
  }

  // (2) Any text pinned at its minimum readable font size (spec §1 / §6 step 1).
  if (Array.isArray(signal.flooredRoles) && signal.flooredRoles.length) {
    const names = signal.flooredRoles.map(r => r.label).join(", ");
    findings.push({
      id: "type-size-floor",
      layer: "local",
      category: "type-size",
      severity: "warn",
      message: `${names} is at the minimum readable size for this format — shortening the copy would let it render larger.`,
      fix: null, // the schema can't rewrite copy; advisory only
    });
  }

  // (3) §6 content drops active (info — mirrors dropInfoRef).
  if (Array.isArray(signal.dropped) && signal.dropped.length) {
    findings.push({
      id: "degradation-drops",
      layer: "local",
      category: "degradation",
      severity: "info",
      message: `To fit this format, some copy was trimmed: ${signal.dropped.join(", ")}. Shorten it, or switch to a taller format, to keep everything.`,
      fix: null,
    });
  }

  // (4) Explicit logo overlapping the text (warn — mirrors logoOverlapRef).
  //     Fix: nudge the logo to a corner clear of the text. We suggest the corner
  //     opposite the text's usual lower-third home; the engine's own guard then
  //     honours the explicit position verbatim (Task 1), so a concrete pick helps.
  if (signal.logo && signal.logo.explicit && signal.logo.overlapsText) {
    findings.push({
      id: "logo-overlap-text",
      layer: "local",
      category: "overlap",
      severity: "warn",
      message: `The logo is sitting on top of your text. Moving it to a clear corner keeps both readable.`,
      fix: { logoPosition: "top-right" },
    });
  }

  // (5) Logo inside the focal band — over the subject/face (spec §4). warn.
  if (signal.logo && signal.logo.inFocalBand) {
    findings.push({
      id: "logo-focal-band",
      layer: "local",
      category: "overlap",
      severity: "warn",
      message: `The logo is covering the main subject of the photo. A top or bottom corner keeps the subject clear.`,
      fix: { logoPosition: "top-left" },
    });
  }

  // (6) Text dragged outside the platform safe zone (spec §1.0). fail, no fix —
  //     layout is spec-driven, so this only fires on a user override; the cleanest
  //     recovery is for the user to move it back, which the message advises.
  if (signal.safeZoneViolation) {
    findings.push({
      id: "safe-zone-violation",
      layer: "local",
      category: "safe-zone",
      severity: "fail",
      message: `Your text is outside the safe area for this format and may be cropped or hidden by the platform's on-screen controls. Drag it back inside the frame.`,
      fix: null,
    });
  }

  // (7) ── ARCHETYPE-DRIFT CHECKS (Commit 3) ──────────────────────────────────
  // When an editorial archetype is active, advise (advice-first) when the design
  // has drifted from that archetype's documented spec targets (visual-language-
  // spec §2/§3). These read the render's OWN measured values (signal.archetypeDrift)
  // — no layout maths reimplemented. Composition drift is advice-only (the patch
  // schema has no whitespace/centroid vocabulary); the one mechanical repair is
  // removing a stacked warmth device, and re-seeding the archetype (snap-back).
  runArchetypeDrift(signal, findings);

  return findings;
}

// Advice severity by default ("info" = the panel's gentle "Heads-up"). Only truly
// egregious drift escalates to "warn". No drift check ever hard-fails — an archetype
// is a STARTING POINT the user then edits, so drift is guidance, not an error.
function runArchetypeDrift(signal, findings) {
  const d = signal && signal.archetypeDrift;
  const archetypeId = signal && signal.archetypeId;
  if (!d || !archetypeId) return;

  // (a) Hero:support ratio below the archetype floor (spec §3: 8–10×, floor 6×).
  //     Legibility-floor exception: a multi-word (sentence-style) hero legitimately
  //     runs smaller, so relax the check for heroes of >6 words (spec §3 ceiling /
  //     §2.7 carousel relax). Advice; escalate to warn only when badly below 6×.
  if (typeof d.heroSupportRatio === "number" && d.heroSupportRatio > 0) {
    const floor = 6;
    const target = typeof d.supportFloor === "number" ? d.supportFloor : 8;
    const multiWordHero = (d.heroWords || 0) > 6; // legibility-floor exception
    if (!multiWordHero && d.heroSupportRatio < floor) {
      findings.push({
        id: "archetype-hero-ratio",
        layer: "local",
        category: "composition",
        severity: d.heroSupportRatio < floor * 0.75 ? "warn" : "info",
        message: `The headline isn't dominating enough for this layout — it's about ${d.heroSupportRatio.toFixed(1)}× the caption, but this archetype reads best around ${target}× (at least 6×). Shortening the headline, or making the caption smaller, restores the hierarchy.`,
        fix: null,
      });
    }
  }

  // (b) Hero centroid inside the center-exclusion zone when the archetype forbids it
  //     (spec §3 thirds anchor: exclude 0.40–0.60 both axes). Advice only.
  if (d.centerExclude && d.heroCentroid) {
    const { x, y } = d.heroCentroid;
    if (x > 0.40 && x < 0.60 && y > 0.40 && y < 0.60) {
      findings.push({
        id: "archetype-center-hero",
        layer: "local",
        category: "composition",
        severity: "info",
        message: `The headline is sitting in the dead centre — this archetype anchors off-centre (top-left or on a thirds line) for a more editorial feel. Re-applying the archetype from the Archetypes panel resets it.`,
        fix: null, // composition — snap-back is a re-apply, not a patch field (advice)
      });
    }
  }

  // (c) More than one warmth device stacked (spec §0 / anti-pattern #20): the
  //     archetype's own device (card / motifs / petal) PLUS a user-added frame or
  //     overlay reads "busy / craft-fair". Mechanical fix: clear the extra overlays.
  if (typeof d.warmthDevices === "number" && d.warmthDevices > 1) {
    findings.push({
      id: "archetype-warmth-stack",
      layer: "local",
      category: "composition",
      severity: "warn",
      message: `There's more than one decorative treatment on this post (${d.warmthDevices} warmth devices). The brand keeps it premium with just one — removing the extra frame/overlay lets the main treatment breathe.`,
      fix: { removeOverlays: true },
    });
  }

  // (d) Two adjacent saturated pastels clash (spec §3 / anti-pattern #13). Advice.
  if (d.pastelClash) {
    findings.push({
      id: "archetype-pastel-clash",
      layer: "local",
      category: "composition",
      severity: "info",
      message: `Two saturated pastels are sitting side by side — the brand pairs one pastel with ivory or ink, not two together. Re-applying the archetype from the Archetypes panel restores a single accent.`,
      fix: null, // composition — advice; the re-apply lives in the Archetypes panel
    });
  }

  // (e) Whitespace grossly below the archetype target (>15pt shortfall, spec §2/§3).
  //     Photo-bleed archetypes are exempt (they fill the frame by design). Advice.
  if (!d.fullBleed && typeof d.whitespaceFrac === "number" && typeof d.whitespaceTarget === "number") {
    const shortfall = d.whitespaceTarget - d.whitespaceFrac;
    if (shortfall > 0.15) {
      findings.push({
        id: "archetype-whitespace",
        layer: "local",
        category: "composition",
        severity: "info",
        message: `This layout is more crowded than the archetype intends (about ${Math.round(d.whitespaceFrac * 100)}% open space vs a ~${Math.round(d.whitespaceTarget * 100)}% target). Trimming copy or shrinking an element gives it the editorial breathing room.`,
        fix: null,
      });
    }
  }

  // (f) COLLISION ASSERTION (Commit 3 reflow engine). The single render path's reflow
  //     pass de-collides every role/photo box; a non-zero count here means two elements
  //     still overlap after reflow — surfaced as a warn so a regression is caught. The
  //     render already did its best; the actionable repair is shortening the copy (so
  //     the hero/support fit their boxes without spilling into each other).
  if (typeof d.boxOverlaps === "number" && d.boxOverlaps > 0) {
    findings.push({
      id: "archetype-box-overlap",
      layer: "local",
      category: "overlap",
      severity: "warn",
      message: `Two elements are overlapping on this layout. Shortening the headline or caption lets each fit its own space cleanly.`,
      fix: null,
    });
  }

  // (g) MARGIN-CROP ASSERTION (Commit 3). A drawn text box crossing the format safe
  //     margins would clip at the canvas edge. The reflow pass keeps boxes inside the
  //     margins, so this only fires on a genuine overflow — a fail (spec §1.0 safe zone).
  if (d.outOfMargin) {
    findings.push({
      id: "archetype-margin-crop",
      layer: "local",
      category: "safe-zone",
      severity: "fail",
      message: `Some text is reaching outside the safe area for this format and may be cropped. Shorten the copy or switch to a taller format.`,
      fix: null,
    });
  }
}

// Compact one-line summaries of local findings — passed to the vision route so
// the model does NOT repeat what the rules engine already caught.
export function summarizeLocalFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.map(f => `[${f.severity}] ${f.category}: ${f.message}`);
}
