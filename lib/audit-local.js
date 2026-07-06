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
  // Meaningful when text sits on a photo/video, AND (Commit 3 manual-harmonize)
  // on a FLAT solid zone — a manual text-colour pick can put ivory ink on an
  // ivory field, which "legible by construction" no longer covers. The flat
  // classification is glyph-safe: a legible ink on a solid field produces high
  // cell variance (glyph edges) so `flat` stays false and the check is skipped;
  // only a genuinely invisible ink reads flat at ~1:1. We judge on the MEAN cell
  // contrast (the background
  // the glyphs actually sit on) and use the WORST (min) cell only to ESCALATE:
  // a single busy edge cell shouldn't override an otherwise clearly-legible zone
  // (e.g. a solid band with one anti-aliased boundary cell), but a genuinely dark
  // patch under a word (min far below the mean) still warrants attention. This
  // avoids false fails on a well-scrimmed high-variance photo while still catching
  // real dark-text-on-dark-photo cases (where BOTH mean and min are low).
  const zoneApplies = signal.hasMedia || !!(signal.zoneContrast && signal.zoneContrast.flat);
  if (zoneApplies && signal.hasText && signal.zoneContrast && typeof signal.zoneContrast.mean === "number") {
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

  // (4) Explicit logo overlapping the text (fail — a real collision; Commit 3
  //     manual-harmonize escalated this from warn so the silent pass repairs it).
  //     Fix: nudge the logo to a corner clear of the text. We suggest the corner
  //     opposite the text's usual lower-third home; the engine's own guard then
  //     honours the explicit position verbatim (Task 1), so a concrete pick helps.
  if (signal.logo && signal.logo.explicit && signal.logo.overlapsText) {
    findings.push({
      id: "logo-overlap-text",
      layer: "local",
      category: "overlap",
      severity: "fail",
      message: `The logo is sitting on top of your text. Moving it to a clear corner keeps both readable.`,
      fix: { logoPosition: "top-right" },
    });
  }

  // (5) Logo inside the focal band — over the subject/face (spec §4). fail —
  //     (Crops addendum) a lockup over the subject's face is a real collision the
  //     silent harmonizer must repair (the client's banner lockup landed on a face).
  if (signal.logo && signal.logo.inFocalBand) {
    findings.push({
      id: "logo-focal-band",
      layer: "local",
      category: "overlap",
      severity: "fail",
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

  // (6b) ── ONE-ITALIC-PHRASE RULE (WP-U #7) ─────────────────────────────────
  // The brand signature is EXACTLY ONE *italic* phrase across all text roles.
  // More than one dilutes the tell. Auto-fix: keep the FIRST phrase (document
  // order headline → subtext → attribution → dateText), set the rest roman —
  // a plain copy patch applyDesignPatch already knows how to apply.
  if (signal.copy && typeof signal.copy === "object") {
    const fields = ["headline", "subtext", "attribution", "dateText"];
    const ITAL = /\*[^*]+\*/g;
    let total = 0;
    for (const f of fields) total += (String(signal.copy[f] || "").match(ITAL) || []).length;
    if (total > 1) {
      const fix = {};
      let kept = false;
      for (const f of fields) {
        const v = String(signal.copy[f] || "");
        if (!ITAL.test(v)) { ITAL.lastIndex = 0; continue; }
        ITAL.lastIndex = 0;
        let nv;
        if (!kept) {
          // keep only the first phrase even within this same field
          let first = true;
          nv = v.replace(/\*([^*]+)\*/g, (m, inner) => { if (first) { first = false; return m; } return inner; });
          kept = true;
        } else {
          nv = v.replace(/\*([^*]+)\*/g, "$1");
        }
        if (nv !== v) fix[f] = nv;
      }
      // severity "fail" so the SILENT HARMONIZER auto-applies the fix (it only
      // applies fail-level fixes); the repair converges in one pass (1 phrase left
      // → the finding no longer fires), so the loop guard is never tripped.
      findings.push({
        id: "italic-phrase-count",
        layer: "local",
        category: "composition",
        severity: "fail",
        message: `There are ${total} italic phrases on this design — the brand signature is exactly one. Keeping the first and setting the rest roman.`,
        fix: Object.keys(fix).length ? fix : null,
      });
    }
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

  // (a) Hero:support ratio below the archetype's OWN target (feed-grammar §7: the
  //     poster-scale 8–10× heroes were retired for feed tiles — statement/schedule/
  //     brand cards read CALM at ~3×, cta/label at ~4×). So the floor is DERIVED from
  //     the archetype's target (d.supportFloor = its heroToSupport), not a blanket 6×:
  //     a statement tile calmly at 3× must NOT be flagged for "not dominating enough".
  //     Legibility-floor exception: a multi-word (sentence-style) hero legitimately
  //     runs smaller, so relax the check for heroes of >6 words (§3 ceiling / §2.7).
  if (typeof d.heroSupportRatio === "number" && d.heroSupportRatio > 0) {
    const target = typeof d.supportFloor === "number" ? d.supportFloor : 8;
    // Floor is the archetype's own target with a comfortable 25% tolerance — never
    // above 6× (poster archetypes keep the old expectation) and never demanding more
    // than the archetype actually wants (CALM tiles target 3–4×). This retires the
    // stale blanket-6× warns on the §7 calm-statement archetypes.
    const floor = Math.min(6, target * 0.75);
    const multiWordHero = (d.heroWords || 0) > 6; // legibility-floor exception
    if (!multiWordHero && d.heroSupportRatio < floor) {
      findings.push({
        id: "archetype-hero-ratio",
        layer: "local",
        category: "composition",
        severity: d.heroSupportRatio < floor * 0.75 ? "warn" : "info",
        message: `The headline isn't dominating enough for this layout — it's about ${d.heroSupportRatio.toFixed(1)}× the caption, but this archetype reads best around ${target}×. Shortening the headline, or making the caption smaller, restores the hierarchy.`,
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

/* ═════════════════════════════════════════════════════════════════════════════
   WP-Y5 — "READY TO POST" CHECKLIST (per-format GO/FIX gate)

   Turns the advisory findings above into a per-format PUBLISH verdict: "Ready" or
   a short list of concrete, one-tap-fixable issues. This is the trust layer that
   lets a non-designer post WITHOUT a human reviewer.

   Pure + deterministic: consumes the same render snapshot (auditRef.current)
   plus a compact `ready` sub-object the renderer captures for EVERY format during
   the off-screen sweep (canvas dims, fitted font px, normalized text/logo boxes,
   safe margins, caption length). No engine maths reimplemented.

   The four checks that decide "can I post this":
     1. Contrast/legibility AT THUMBNAIL SCALE — text must pass contrast AND stay
        legible when the post is shrunk to a feed thumbnail (small text on a busy
        photo is the classic failure). Reuses the render's measured zone contrast
        plus a thumbnail-size floor on the fitted px.
     2. Safe area per platform — no text/logo inside a platform's UI-occluded
        zones (IG Story top/bottom action bars, feed crop). Reuses the captured
        normalized boxes vs a per-platform safe rect.
     3. Copy limits / overflow — nothing clipped/dropped, no mid-word truncation,
        caption within sane platform length.
     4. Nothing off-canvas / crop — reuses the render's own margin-crop + overlap
        assertions.

   Verdict shape:
     { dimensionId, label, ready:boolean, issues:[{ id, category, message, fix,
       severity }] }
   Each issue's `fix` is a partial design patch (same shape as the findings above)
   applied through the ONE patch pipeline (applyDesignPatch) — undoable. A null fix
   means "surface it, the user must edit copy/photo" (kept rare + specific).
   ═════════════════════════════════════════════════════════════════════════════ */

// Per-platform UI-occlusion zones as fractions of the canvas. A text/logo box
// intruding into one of these is hidden by the platform's own chrome once posted.
// Values are conservative estimates from each platform's action UI (spec §1.0):
//   - IG Story/Reel (1080×1920): top ~250px (profile/close) + bottom ~250px
//     (caption/reply/like rail) ≈ 0.13 each; sides light.
//   - IG feed portrait (4:5) is shown un-cropped in-feed; square/portrait have no
//     hard UI occlusion beyond the standard safe margin, so only Story gates hard.
// Formats absent here fall back to their render safe margins (no extra UI gate).
export const PLATFORM_SAFE = {
  story: { top: 0.13, bottom: 0.13, left: 0.04, right: 0.04, label: "Story / Reel" },
};

// Minimum ON-SCREEN font size (CSS px) for a design to stay legible once shrunk to
// a feed THUMBNAIL. Instagram's feed grid renders a post at roughly a third of the
// device width — a caption fitted at, say, 26px in a 1080px canvas becomes ~26·(390/3)
// /1080 ≈ 3px on the grid: unreadable. We model the worst realistic thumbnail: a
// ~130px-wide grid cell (3-up on a ~390px phone). A glyph must be ≥ this many device
// px at that scale to be readable in-feed.
export const THUMB_MIN_PX = 6.5;         // device px at feed-thumbnail scale
export const THUMB_CELL_W = 130;         // px width of one 3-up IG grid cell

// Platform caption/headline copy ceilings (chars) — beyond these the copy reads as a
// wall of text on a feed tile (not a hard platform limit but a legibility one). The
// hard IG caption cap (2 200) lives on the caption writer; here we guard the ON-CANVAS
// support/caption line, which must stay short to render at a readable size.
export const COPY_MAX = { support: 240, headline: 90 };

// Legibility of a fitted glyph once the post is a feed thumbnail. `px` is the fitted
// size in CANVAS pixels; `canvasW` the canvas width. Returns the effective device px
// at THUMB_CELL_W. Null-safe.
export function thumbnailPx(px, canvasW) {
  if (!px || !canvasW) return null;
  return px * (THUMB_CELL_W / canvasW);
}

// One format's publish verdict. `signal` is a render snapshot (auditRef.current for
// that dimension). Reuses computeLocalAudit for the shared contrast/overlap/safe-zone
// findings, then layers the thumbnail-scale + platform-safe-area + copy-limit gates.
export function computeReadyVerdict(signal, dimensionId) {
  const dimId = dimensionId || (signal && signal.dimensionId) || "ig_square";
  const issues = [];
  const push = (i) => { if (i && !issues.some(x => x.id === i.id)) issues.push(i); };

  if (!signal || typeof signal !== "object") {
    return { dimensionId: dimId, ready: true, issues: [] };
  }

  // (A) Fold in the advisory findings that are genuine PUBLISH blockers. Only
  // fail-severity findings gate readiness; warns/infos are polish, not blockers,
  // and would erode trust in the "Ready" verdict by crying wolf. The finding
  // already carries a concrete fix + user-facing message.
  const BLOCKER_IDS = new Set([
    "contrast-fail", "logo-overlap-text", "logo-focal-band",
    "safe-zone-violation", "archetype-margin-crop", "archetype-box-overlap",
  ]);
  let findings = [];
  try { findings = runLocalAudit(signal) || []; } catch { findings = []; }
  // The advisory contrast-fail can fire on a FLAT SOLID brand field off a single
  // low-min (anti-aliased edge) cell even when the MEAN — the background the glyphs
  // actually sit on — clears the readable floor comfortably. Surfacing that as a
  // publish BLOCKER would cry wolf (message reads "5.8:1, below the 3:1 minimum").
  // For the READY gate we only block on a flat-solid contrast fail when the MEAN is
  // genuinely below the fail floor. Photo/busy zones (non-flat) still block on the
  // finding as-is (a real dark-patch-under-text case).
  const zc = signal.zoneContrast;
  const flatSolidLegible = !!(zc && zc.flat && typeof zc.mean === "number" && zc.mean >= CONTRAST_FAIL);
  for (const f of findings) {
    if (f.severity === "fail" && BLOCKER_IDS.has(f.id)) {
      if (f.id === "contrast-fail" && flatSolidLegible) continue; // legible solid field
      push({ id: f.id, category: f.category, message: f.message, fix: f.fix || null, severity: "fail" });
    }
  }

  const R = signal.ready || null;

  // (B) THUMBNAIL-SCALE LEGIBILITY. The render already flags a role pinned at its
  // full-res floor (type-size-floor). Here we add the stricter FEED-THUMBNAIL test:
  // even a role above its full-res floor can vanish once the post is a grid cell.
  // We test the SMALLEST fitted text role (the caption is usually it).
  if (R && R.fontPx && R.canvasW && signal.hasText) {
    let worst = null; // { role, px, thumb }
    const ROLE_LABEL = { headline: "headline", subtext: "caption", date: "date" };
    for (const role of ["headline", "subtext", "date"]) {
      const px = R.fontPx[role];
      if (!px) continue;
      const t = thumbnailPx(px, R.canvasW);
      if (t != null && (!worst || t < worst.thumb)) worst = { role, px, thumb: t };
    }
    if (worst && worst.thumb < THUMB_MIN_PX) {
      // Fix ladder: the copy is fitted as small as it is because it is LONG (the
      // renderer shrank it to fit its box). We can't rewrite copy from a patch, but a
      // bigger min-size floor + shorter copy is the real fix, so this is advice-with-
      // teeth. The one mechanical nudge available: if the caption sits on a photo
      // without a band, a band lets it render on a calmer backing (marginally larger),
      // so we offer the band when applicable; otherwise null (copy must shorten).
      const onPhoto = !!signal.hasMedia && !(signal.zoneContrast && signal.zoneContrast.flat);
      const canBand = onPhoto && (signal.backdropMode || "auto") !== "band";
      push({
        id: "thumb-legibility",
        category: "type-size",
        message: `The ${ROLE_LABEL[worst.role] || worst.role} is too small to read at feed-thumbnail size — it shrinks to about ${worst.thumb.toFixed(1)}px in the grid. Shortening the copy lets it render larger.`,
        fix: canBand ? { backdropMode: "band" } : null,
        severity: "fail",
      });
    }
  }

  // (C) PLATFORM SAFE-AREA. A text/logo box inside a platform UI zone is occluded
  // once posted. Only formats with a declared UI zone gate here (Story today). The
  // captured boxes are normalized (0..1); we compare against the UI rect. The fix
  // nudges the element back inside via a textLayout / logoPosition patch when we
  // can pin a clear spot; text uses a safe y, the logo a clear corner.
  const zone = PLATFORM_SAFE[dimId];
  if (zone && R) {
    const inTop = (b) => b && b.y < zone.top;
    const inBottom = (b) => b && (b.y + b.h) > (1 - zone.bottom);
    const boxes = Array.isArray(R.textBoxes) ? R.textBoxes : [];
    const textHit = boxes.find(b => inTop(b) || inBottom(b));
    if (textHit) {
      // Nudge the whole text block to a vertically safe band (centre third). This is
      // a per-format override so it only touches Story; applied via textLayout.y.
      const safeY = Math.max(zone.top + 0.02, Math.min(1 - zone.bottom - textHit.h - 0.02, 0.34));
      push({
        id: "safe-area-text",
        category: "safe-zone",
        message: `Your text sits in the ${zone.label} action zone — Instagram's own buttons will cover it. Moving it into the clear middle keeps it visible.`,
        fix: { dimensionId: dimId, textLayout: { y: safeY } },
        severity: "fail",
      });
    }
    const logo = R.logoBox;
    if (logo && (inTop(logo) || inBottom(logo))) {
      // Story has UI bands at BOTH top and bottom, so a top/bottom corner is never
      // safe — the only vertically-clear band is the middle. Pin the lockup mid-left
      // (a corner spot that clears both action zones). logoPosition is a per-format
      // pin (the pipeline writes logoByDim off the master dim).
      push({
        id: "safe-area-logo",
        category: "safe-zone",
        message: `The logo is inside the ${zone.label} action zone and will be hidden by Instagram's controls. Moving it clear of the top and bottom bars keeps it on screen.`,
        fix: { dimensionId: dimId, logoPosition: "mid-left" },
        severity: "fail",
      });
    }
  }

  // (D) COPY OVERFLOW / TRUNCATION. Dropped copy (§6) or a caption longer than the
  // platform tile can carry means the design either clipped content or will render
  // it too small. Dropped copy is a hard publish issue (the post is missing text the
  // user wrote). Over-length caption is advice (shorten). Mid-word truncation is
  // covered by the render's own drop logic (WP-T) — a dropped role never cuts a word.
  if (Array.isArray(signal.dropped) && signal.dropped.length) {
    push({
      id: "copy-dropped",
      category: "degradation",
      message: `Some of your copy didn't fit this format and was left off: ${signal.dropped.join(", ")}. Shorten it, or switch to a taller format, to keep everything.`,
      fix: null,
      severity: "fail",
    });
  }
  if (R && signal.copy) {
    const cap = String(signal.copy.subtext || "");
    if (cap.length > COPY_MAX.support) {
      push({
        id: "copy-caption-long",
        category: "copy-limit",
        message: `The caption on the design is long for a feed tile (${cap.length} characters) — it renders small and dense. Trimming it to a line or two reads far better in-feed.`,
        fix: null,
        severity: "fail",
      });
    }
  }

  return {
    dimensionId: dimId,
    label: (zone && zone.label) || dimId,
    ready: issues.length === 0,
    issues,
  };
}

// Roll up per-format verdicts from the format sweep. `perFormat` is
// [{ dimensionId, signal }] (each signal = auditRef.current for that format).
// Returns { ready:boolean, formats:[verdict], needCount:number }.
export function computeReadyChecklist(perFormat) {
  const formats = (Array.isArray(perFormat) ? perFormat : []).map(
    ({ dimensionId, signal }) => computeReadyVerdict(signal, dimensionId)
  );
  const needCount = formats.filter(f => !f.ready).length;
  return { ready: needCount === 0, formats, needCount };
}

/* ═════════════════════════════════════════════════════════════════════════════
   ACKS — "Keep it this way" as first-class state (advisor dots package)

   An acknowledgement records that the user looked at one readiness issue on one
   format and deliberately chose to keep it. It is keyed by
     (dimensionId · issue id/category · a geometry FINGERPRINT of the affected box)
   so a content-only edit elsewhere never resurrects it, but MATERIALLY moving or
   resizing the affected element (>~2.5% of canvas) — or the issue's category
   changing — invalidates the fingerprint and the issue may surface once more.

   Acks live IN the session state (currentTemplateState → session.state.acks) so
   they persist + cloud-sync with the post. Everything here is pure + null-safe.
   ═════════════════════════════════════════════════════════════════════════════ */

// How much an affected element's box may drift before an ack is considered stale.
// Boxes are normalized (0..1) canvas units; ~2.5% is "meaningfully moved/resized".
export const ACK_FINGERPRINT_TOLERANCE = 0.025;

// Quantize a normalized coordinate to the tolerance grid so small, sub-threshold
// nudges keep the SAME fingerprint (an ack survives content-only edits + tiny
// reflow jitter) while a real move/resize lands in a different bucket.
function quantize(v) {
  if (typeof v !== "number" || !isFinite(v)) return 0;
  return Math.round(v / ACK_FINGERPRINT_TOLERANCE);
}

// Geometry fingerprint of a normalized box {x,y,w,h}. Null box → "nogeo" (issues
// without precise geometry, e.g. copy-length, still ack cleanly and only
// re-surface if their category changes). The fingerprint is a short stable string.
export function ackFingerprint(box) {
  if (!box || typeof box !== "object") return "nogeo";
  const { x, y, w, h } = box;
  if ([x, y, w, h].every(v => v == null)) return "nogeo";
  return `${quantize(x)}.${quantize(y)}.${quantize(w)}.${quantize(h)}`;
}

// The stable key for an ack. Category is folded in so "the same element now has a
// DIFFERENT category of problem" re-surfaces (fingerprint alone wouldn't catch a
// category flip on an unmoved box).
export function ackKey(dimensionId, issue, box) {
  const id = (issue && (issue.id || issue.category)) || "issue";
  const cat = (issue && issue.category) || "";
  return `${dimensionId || "?"}|${id}|${cat}|${ackFingerprint(box)}`;
}

// Is this issue (on this format, with this current affected box) acknowledged?
// `acks` is the map { [ackKey]: { ...meta } } stored on the session.
export function isAcked(acks, dimensionId, issue, box) {
  if (!acks || typeof acks !== "object") return false;
  return !!acks[ackKey(dimensionId, issue, box)];
}

// Partition a format's issues into { open, acked } given the current per-issue
// affected boxes. `boxOf(issue) → normalized box | null` supplies live geometry so
// a moved element re-surfaces its (now differently-fingerprinted) issue.
export function partitionIssues(issues, acks, dimensionId, boxOf) {
  const open = [], acked = [];
  for (const iss of (Array.isArray(issues) ? issues : [])) {
    const box = typeof boxOf === "function" ? boxOf(iss) : null;
    (isAcked(acks, dimensionId, iss, box) ? acked : open).push({ ...iss, _ackBox: box || null });
  }
  return { open, acked };
}

/* ═════════════════════════════════════════════════════════════════════════════
   ONE ADVICE LEDGER — merge the AI auditor into the same store as the local
   checker (docs/advice-ledger-spec.md). Every advisory source emits findings into
   ONE per-format issue list that drives the SAME dots + Export checklist + acks.
   These helpers are pure + null-safe; Generator owns the ledger STATE (auditFindings)
   and the geometry (anchor boxes), and calls these to normalize / merge / reconcile.

   Canonical finding shape (spec rule 1):
     { id, key, category, anchor:{ element, dimensionId, fingerprint }, message,
       fix (proposedFix, patch|null), sources:[...], severity, layer, _audit? }
   ═════════════════════════════════════════════════════════════════════════════ */

// Map an AI-audit category (hierarchy|brand|composition|polish) to a LEDGER category
// so an audit finding dedups + acks against a local finding of the same concern. The
// local checker's categories are contrast|type-size|safe-zone|overlap|degradation|
// composition|copy-limit; the audit's subjective ones mostly land under "composition"
// (the deterministic checker has no composition vocabulary), but a brand/colour call
// aligns to "contrast" (both concern text-on-background legibility/colour) so a double
// flag merges. Kept conservative: only fold where the concern genuinely overlaps.
export function auditCategoryToLedger(auditCategory) {
  switch (auditCategory) {
    case "brand": return "brand";           // its own lane (colour/tone) — merges audit↔audit
    case "hierarchy": return "hierarchy";   // size dominance — no deterministic twin today
    case "polish": return "polish";
    case "composition": return "composition"; // shares the local composition lane
    default: return auditCategory || "composition";
  }
}

// The dedup ANCHOR key for a finding: (category + element + dimension). Two findings
// with the same anchor+category are "the same issue" (spec rule 2) regardless of
// messenger. `element` is a coarse role token (hero|support|logo|photo|canvas|text)
// so the AI's "the headline competes…" and the local "headline pinned…" collapse.
export function ledgerAnchorKey(category, anchor) {
  const el = (anchor && anchor.element) || "canvas";
  const dim = (anchor && anchor.dimensionId) || "?";
  return `${category || "?"}|${el}|${dim}`;
}

// Normalize a raw AI-audit finding (from /api/design-audit) into the canonical ledger
// shape for one format. `roleForElement` maps the model's optional element hint to a
// coarse anchor token; `fingerprint` is captured NOW from that element's live box so
// staleness (rule 4) + ack geometry (rule 3) work. `designFP` stamps the design state
// the audit saw so a later material edit can drop it as stale.
export function normalizeAuditFinding(raw, { dimensionId, element, fingerprint, designFP, index } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const category = auditCategoryToLedger(raw.category);
  const el = element || "canvas";
  const anchor = { element: el, dimensionId: dimensionId || "?", fingerprint: fingerprint || "nogeo" };
  const anchorKey = ledgerAnchorKey(category, anchor);
  return {
    // A stable id so the SAME re-flagged issue keeps its identity across audits
    // (dedup + ack). id folds category+element+dim; a numeric suffix guards the rare
    // case of two audit findings sharing an anchor within one run.
    id: `ai-${anchorKey}${index != null ? `#${index}` : ""}`,
    key: anchorKey,
    category,
    auditCategory: raw.category || null,   // keep the model's own label for provenance copy
    anchor,
    message: typeof raw.message === "string" ? raw.message : "",
    fix: raw.fix || null,
    sources: ["ai-audit"],
    severity: ["fail", "warn", "info"].includes(raw.severity) ? raw.severity : "info",
    layer: "ai-audit",
    _audit: true,
    designFP: designFP || null,
  };
}

// (rule 4) Reconcile audit findings against the CURRENT design fingerprint: any audit
// finding whose captured designFP differs from the live one was made about a design
// that no longer exists → drop it as stale (it returns only if the next manual audit
// reconfirms). Pure: returns the surviving subset.
export function reconcileAuditFindings(auditFindings, currentDesignFP) {
  if (!Array.isArray(auditFindings)) return [];
  if (!currentDesignFP) return auditFindings.slice();
  return auditFindings.filter(f => !f || !f.designFP || f.designFP === currentDesignFP);
}

// (rules 1 + 2) Merge the ledger's audit findings into a per-format readiness check so
// the SAME dots + checklist render both sources as one voice. For each format we append
// its audit findings to issues[], deduping on (category + anchor) against the local
// issues already there: a match MERGES (sources union, keep the richer/longer message,
// keep a concrete fix over a null one) into the existing row — never a second dot.
// Returns a NEW check object (does not mutate the input).
export function mergeAuditIntoChecklist(check, auditFindings) {
  const formats = (check && Array.isArray(check.formats)) ? check.formats : [];
  const byDim = new Map();
  for (const f of (Array.isArray(auditFindings) ? auditFindings : [])) {
    if (!f || !f.anchor) continue;
    const dim = f.anchor.dimensionId || "?";
    if (!byDim.has(dim)) byDim.set(dim, []);
    byDim.get(dim).push(f);
  }
  const mergedFormats = formats.map(fmt => {
    const audits = byDim.get(fmt.dimensionId) || [];
    if (!audits.length) return fmt;
    const issues = Array.isArray(fmt.issues) ? fmt.issues.slice() : [];
    // Index existing issues by their local anchor key so a matching audit finding folds
    // in. Local issues carry no explicit anchor object; derive one from (category +
    // the element the issue concerns). We use the same coarse element token the audit
    // uses via localIssueElement so audit↔local anchors line up.
    const keyOf = (iss) => iss._anchorKey || ledgerAnchorKey(iss.category, { element: localIssueElement(iss), dimensionId: fmt.dimensionId });
    const indexByKey = new Map();
    issues.forEach((iss, i) => indexByKey.set(keyOf(iss), i));
    for (const a of audits) {
      const hitIdx = indexByKey.get(a.key);
      if (hitIdx != null) {
        const cur = issues[hitIdx];
        const sources = Array.from(new Set([...(cur.sources || ["local"]), ...(a.sources || ["ai-audit"])]));
        const message = (a.message && a.message.length > (cur.message || "").length) ? a.message : (cur.message || a.message);
        const fix = cur.fix || a.fix || null; // prefer an existing concrete local fix
        const severity = sevRank(a.severity) > sevRank(cur.severity) ? a.severity : cur.severity;
        issues[hitIdx] = { ...cur, sources, message, fix, severity, merged: true };
      } else {
        // A genuinely NEW observation → its own ledger row/dot. Tag its anchor key so a
        // later re-merge or ack partition can find it.
        issues.push({ ...a, _anchorKey: a.key });
        indexByKey.set(a.key, issues.length - 1);
      }
    }
    return { ...fmt, issues, ready: issues.length === 0 };
  });
  const needCount = mergedFormats.filter(f => !f.ready).length;
  return { ...(check || {}), formats: mergedFormats, needCount, ready: needCount === 0 };
}

function sevRank(s) { return s === "fail" ? 3 : s === "warn" ? 2 : s === "info" ? 1 : 0; }

// Coarse anchor element token for a LOCAL readiness issue so it dedups against an
// audit finding on the same element. Logo/overlap issues → "logo"; everything else
// (contrast/type-size/safe-zone/copy/composition) concerns the text block → "text".
export function localIssueElement(issue) {
  if (!issue) return "canvas";
  const id = issue.id || "";
  if (id.includes("logo") || issue.category === "overlap") return "logo";
  if (issue.category === "degradation" || issue.category === "copy-limit") return "text";
  return "text";
}
