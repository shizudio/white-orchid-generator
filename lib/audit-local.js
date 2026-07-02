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

// Build the contrast fix. If a scrim/band is already forced and it STILL fails,
// there's no purely-mechanical tweak left (the copy/photo would need changing —
// out of scope), so return null and let the message advise. Otherwise propose
// the strongest guaranteed-legible backdrop for this format: a full gradient
// scrim (spec §5 mode "gradient"), which the engine renders in the scrim variant
// that agrees with the resolved text colour.
function contrastFix(signal) {
  const mode = signal.backdropMode || "auto";
  if (mode === "gradient" || mode === "band") return null; // already forced; nothing mechanical left
  return { backdropMode: "gradient" };
}

export function runLocalAudit(signal) {
  const findings = [];
  if (!signal || typeof signal !== "object") return findings;

  // (1) Effective text contrast in the resolved text zone (spec §2/§3).
  // Only meaningful when text sits on a photo/video — flat brand backgrounds are
  // legible by construction. Uses the WORST (min) sampled contrast.
  if (signal.hasMedia && signal.hasText && signal.zoneContrast && typeof signal.zoneContrast.min === "number") {
    const c = signal.zoneContrast.min;
    if (c < CONTRAST_FAIL) {
      findings.push({
        id: "contrast-fail",
        layer: "local",
        category: "contrast",
        severity: "fail",
        message: `Your text is hard to read against the photo (contrast ${c.toFixed(1)}:1, below the 3:1 minimum). Add a backdrop behind the text.`,
        fix: contrastFix(signal),
      });
    } else if (c < CONTRAST_WARN) {
      findings.push({
        id: "contrast-warn",
        layer: "local",
        category: "contrast",
        severity: "warn",
        message: `Text contrast is a little low (${c.toFixed(1)}:1, below the 4.5:1 comfort target). A stronger backdrop would make it easier to read.`,
        fix: contrastFix(signal),
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

  return findings;
}

// Compact one-line summaries of local findings — passed to the vision route so
// the model does NOT repeat what the rules engine already caught.
export function summarizeLocalFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.map(f => `[${f.severity}] ${f.category}: ${f.message}`);
}
