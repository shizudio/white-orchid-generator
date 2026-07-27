import { designRuleById, designRuleIdForFinding } from "./design-layer-contract.mjs";
import { createConstraintRemedyCommands } from "./constraint-remedies.mjs";
import { createReadinessPolicyState } from "./readiness-policy.mjs";

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

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
};
const shortHash = value => {
  const text=JSON.stringify(stableValue(value));let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(36);
};

function localFindingGeometry(finding, signal) {
  const element=localIssueElement(finding);
  if(element==="logo")return signal?.ready?.logoBox||signal?.logo?.box||null;
  if(finding?.element&&Array.isArray(signal?.ready?.pinned)){
    const pinned=signal.ready.pinned.find(item=>item.role===finding.element);
    if(pinned)return {x:pinned.x,y:pinned.y,w:pinned.w,h:pinned.h};
  }
  return signal?.ready?.textBoxes?.[0]||null;
}

export function normalizeFinding(raw, { signal, dimensionId, elementId, geometry, source } = {}) {
  if(!raw||typeof raw!=="object")return null;
  const format=dimensionId||raw.format||raw.dimensionId||signal?.dimensionId||raw.anchor?.dimensionId||"?";
  const element=elementId||raw.elementId||raw.anchor?.element||localIssueElement(raw);
  const box=geometry||raw.geometry||localFindingGeometry(raw,signal);
  const geoFingerprint=raw.geometryFingerprint||ackFingerprint(box);
  const propertyFingerprint=raw.propertyFingerprint||shortHash({
    category:raw.category,fix:raw.proposedFix||raw.fix||null,
    textColorId:signal?.textColorId,backdropMode:signal?.backdropMode,
    copy:raw.category==="degradation"||raw.category==="copy-limit"?signal?.copy:null,
  });
  const fingerprint=`${geoFingerprint}:${propertyFingerprint}`;
  const category=raw.category||"composition";
  const key=`${category}|${element||"canvas"}|${format}|${fingerprint}`;
  const proposedFix=raw.proposedFix!==undefined?raw.proposedFix:(raw.fix||null);
  const sources=Array.from(new Set(raw.sources||[source||raw.layer||"local"]));
  const ruleId=designRuleIdForFinding(raw);
  const contractRule=designRuleById(ruleId);
  return {
    ...raw,id:raw.id||key,key,category,
    severity:["fail","warn","info"].includes(raw.severity)?raw.severity:"info",
    format,dimensionId:format,elementId:element||"canvas",geometry:box,
    anchor:{element:element||"canvas",dimensionId:format,fingerprint},
    fingerprint,geometryFingerprint:geoFingerprint,propertyFingerprint,message:String(raw.message||""),
    proposedFix,fix:proposedFix,sources,ruleId,
    policy:contractRule?{
      severity:contractRule.severity,
      enforcement:contractRule.enforcement,
      remedies:[...contractRule.remedies],
      source:contractRule.source,
    }:null,
    actions:Array.isArray(raw.actions)?raw.actions:(proposedFix?[{id:"apply-fix",kind:"patch",patch:proposedFix}]:[]),
  };
}

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

// (item 2 · re-solve around pins) The FREE-VARIABLE fallback fix for a contrast fail
// when the primary fix (a backdrop band) would REVERT a user pin (backdropMode:"none").
// The free variable the pin leaves open is the text INK: flip it to the higher-contrast
// brand pole against the zone the glyphs sit on (same maths as flatSolidTextColor, valid
// for photo zones too via zoneMeanL). Returns a {textColorId} patch, or null if the ink
// is already on the best pole (then the pin genuinely can't be solved → keep it + dot).
export function contrastFlipFix(signal) {
  const zc = signal && signal.zoneContrast;
  if (!zc || typeof zc.zoneMeanL !== "number") return null;
  const flipped = flatSolidTextColor(zc.zoneMeanL);
  if (flipped && flipped !== signal.textColorId) return { textColorId: flipped };
  return null;
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

function constraintViolations(signal, ruleId) {
  const rows=signal?.constraintResult?.violations;
  if (!Array.isArray(rows)) return [];
  return rows.filter(row=>!ruleId || row?.ruleId===ruleId);
}

const constraintTouches = (violation, prefix) =>
  Array.isArray(violation?.zoneIds) && violation.zoneIds.some(id=>String(id).startsWith(prefix));

function measuredConstraintState(signal, ruleId, zonePrefix) {
  const result=signal?.constraintResult;
  const violations=constraintViolations(signal,ruleId).filter(row=>constraintTouches(row,zonePrefix));
  const relationPrefix=zonePrefix;
  const evaluated=Array.isArray(result?.evaluatedRelationIds)
    && result.evaluatedRelationIds.some(id=>String(id).startsWith(relationPrefix));
  return { available:!!result, evaluated, violations };
}

export function runLocalAudit(signal) {
  const findings = [];
  if (!signal || typeof signal !== "object") return findings;
  const mediaLogoViolations=Array.isArray(signal.mediaLogoResult?.violations)
    ? signal.mediaLogoResult.violations : [];
  const surfaceViolations=Array.isArray(signal.surfaceResult?.violations)
    ? signal.surfaceResult.violations : [];
  const decorationViolations=Array.isArray(signal.decorationResult?.violations)
    ? signal.decorationResult.violations : [];

  for(const violation of decorationViolations){
    const target=violation.target||null;
    const base={
      layer:"local",category:"composition",element:violation.element||"canvas",
      severity:violation.severity,ruleId:violation.ruleId,target,
      fix:violation.suggestedPatch||null,
    };
    if(violation.ruleId==="decoration.approved-asset")findings.push({
      ...base,id:`decoration-unapproved-asset:${target?.uid||violation.evidence.assetId||"unknown"}`,
      message:"This decoration is not in the approved brand library. Replace it with an approved asset or remove it before exporting.",
    });
    else if(violation.ruleId==="decoration.density-budget")findings.push({
      ...base,id:"decoration-density-budget",
      message:`There are ${violation.evidence.count} decorations in this format. Reducing toward ${violation.evidence.maximum} will keep the composition focused.`,
    });
    else if(violation.ruleId==="decoration.occupied-area-budget")findings.push({
      ...base,id:"decoration-area-budget",
      message:`Decoration occupies about ${Math.round(violation.evidence.estimatedPaintFraction*100)}% of the canvas. Resize or remove an accent so the message remains dominant.`,
    });
    else if(violation.ruleId==="decoration.accent-color-budget")findings.push({
      ...base,id:"decoration-color-budget",
      message:`Decoration uses ${violation.evidence.colors.length} accent colors. Bring it back to ${violation.evidence.maximum} or fewer for a cleaner brand expression.`,
    });
  }

  const overwrittenPin=surfaceViolations.find(item=>item.ruleId==="pin.no-silent-overwrite");
  if(overwrittenPin){
    findings.push({
      id:"surface-pinned-color-overridden",
      layer:"local",
      category:"contrast",
      element:"content",
      severity:"fail",
      ruleId:"pin.no-silent-overwrite",
      message:"The preview did not preserve your selected text color. Re-select the color or reset it to Auto before exporting.",
      fix:null,
    });
  }

  const duplicateSurface=surfaceViolations.find(item=>item.ruleId==="surface.single-legibility-treatment");
  if(duplicateSurface){
    findings.push({
      id:"surface-double-treatment",
      layer:"local",
      category:"contrast",
      element:"content",
      severity:"fail",
      ruleId:"surface.single-legibility-treatment",
      message:"More than one local text treatment was applied. Choose one clear treatment or switch layouts.",
      fix:null,
    });
  }

  const blockedBand=surfaceViolations.find(item=>item.ruleId==="surface.shape-band-exclusion");
  if(blockedBand){
    findings.push({
      id:"surface-band-shape-conflict",
      layer:"local",
      category:"contrast",
      element:"content",
      severity:"fail",
      ruleId:"surface.shape-band-exclusion",
      message:"The requested text band would cut across a layout shape. Use Auto so the editor can choose a compatible text treatment, or move the text.",
      fix:blockedBand.suggestedPatch||{backdropMode:"auto"},
    });
  }

  const cropCoverage=mediaLogoViolations.find(item=>item.ruleId==="media.crop-coverage");
  if(cropCoverage){
    findings.push({
      id:"media-crop-coverage",
      layer:"local",
      category:"composition",
      element:"photo",
      severity:"fail",
      ruleId:"media.crop-coverage",
      message:"The photo no longer covers its frame completely. Restore the cover crop so no background shows through.",
      fix:cropCoverage.suggestedPatch||null,
    });
  }

  const logoClearSpace=mediaLogoViolations.find(item=>item.ruleId==="logo.intrinsic-clear-space");
  if(logoClearSpace){
    findings.push({
      id:"logo-clear-space",
      layer:"local",
      category:"logo",
      element:"logo",
      severity:"fail",
      ruleId:"logo.intrinsic-clear-space",
      message:"The logo is too close to the canvas edge. Return it to its safe position or move it inward.",
      fix:null,
      logoClearSpace:true,
    });
  }

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
    // (born-clean 2026-07-06) The low-MIN escalation formerly fired even when the
    // MEAN cleared the comfort target comfortably (e.g. mean 6:1 with a single
    // glyph-edge cell reading ~1:1) — producing a "6.0:1, below the 3:1 minimum"
    // contrast-fail on a plainly legible photo design (a born-clean violation, and
    // a self-contradictory message). A genuinely dark patch under a word depresses
    // the MEAN too, so gate the min-escalation on the mean already being in the warn
    // band: one low cell under an otherwise-strong mean is a sampling artifact (the
    // same reasoning the WARN path below already applies to min).
    const fail = mean < CONTRAST_FAIL || (mean < CONTRAST_WARN && min < 2.0 && min < mean * 0.5);
    // Warn on a low MEAN only. A single dark boundary cell (low min) under an
    // otherwise strong mean is a sampling artifact at the scrim/band edge, not a
    // legibility problem — the glyphs sit on the good background — so we do NOT
    // warn on min alone once the mean comfortably clears the AA floor.
    const warn = !fail && mean < CONTRAST_WARN;
    const shown = mean; // the mean is the background the glyphs actually sit on
    // A flat solid brand region reads differently to a photo — the copy (message)
    // and the fix (colour-flip, not a backdrop) both adapt.
    const onSolid = !!(signal.zoneContrast.flat);
    // A min-driven escalation (mean clears the 3:1 floor, but a patch under part of the
    // text is much darker) must NOT claim the whole zone is "below the 3:1 minimum" —
    // that reads as self-contradictory ("4.3:1, below the 3:1 minimum"). Word it as a
    // localized dark-patch problem instead, quoting the WORST cell contrast.
    const patchDriven = mean >= CONTRAST_FAIL;
    if (fail) {
      findings.push({
        id: "contrast-fail",
        layer: "local",
        category: "contrast",
        severity: "fail",
        message: patchDriven
          ? (onSolid
              ? `Part of your text sits on a low-contrast patch (${min.toFixed(1)}:1). A higher-contrast text colour keeps every word readable.`
              : `Part of your text sits on a bright/dark patch of the photo (${min.toFixed(1)}:1) and is hard to read there. A backdrop behind the text keeps every word legible.`)
          : (onSolid
              ? `Your text colour is hard to read on this background (contrast ${mean.toFixed(1)}:1, below the 3:1 minimum). A higher-contrast text colour fixes it.`
              : `Your text is hard to read against the photo (contrast ${mean.toFixed(1)}:1, below the 3:1 minimum). Add a backdrop behind the text.`),
        fix: contrastFix(signal, "fail"),
        // (item 2) The FREE-VARIABLE alternative fix: an ink flip that leaves a pinned
        // backdropMode untouched. The harmonizer uses this when the primary fix would
        // overturn a user pin (else null → keep the pin + raise the dot).
        flipFix: contrastFlipFix(signal),
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
  // This claim is self-verifying: a role IS in flooredRoles precisely because the
  // renderer fit-shrank it to its floor, so shortening its copy genuinely lets it
  // render larger. Carry the fit-shrunk role's copy `field` so the finding's action
  // offers a real one-tap "Shorten it for me" (not just Edit/Keep).
  const typographyResult=signal.contentTypographyResult;
  const ROLE_LABEL={hero:"Headline",support:"Body text",date:"Date",microLabel:"Label",attribution:"Attribution"};
  const minimumViolations=Array.isArray(typographyResult?.violations)
    ? typographyResult.violations.filter(item=>item.ruleId==="typography.minimum-readable-size") : [];
  const contractFloorRoles=Array.isArray(typographyResult?.atFloorRoles)?typographyResult.atFloorRoles:[];
  const floorLabels=typographyResult
    ? Array.from(new Set([...minimumViolations.map(item=>ROLE_LABEL[item.role]||item.role),...contractFloorRoles.map(role=>ROLE_LABEL[role]||role)]))
    : (Array.isArray(signal.flooredRoles)?signal.flooredRoles.map(item=>item.label):[]);
  if (floorLabels.length) {
    const names = floorLabels.join(", ");
    const FIELD_OF_FLOOR = { Headline: "headline", "Body text": "subtext", Date: "dateText" };
    const field = floorLabels.map(label=>FIELD_OF_FLOOR[label]).find(Boolean) || null;
    findings.push({
      id: "type-size-floor",
      layer: "local",
      category: "type-size",
      severity: minimumViolations.length?"fail":"warn",
      ruleId:"typography.minimum-readable-size",
      field,
      message: minimumViolations.length
        ? `${names} is below the minimum readable size for this format — use a roomier layout or shorten the copy.`
        : `${names} is at the minimum readable size for this format — shortening the copy would let it render larger.`,
      fix: null, // the schema can't rewrite copy; advisory only
    });
  }

  const gapViolations=Array.isArray(typographyResult?.violations)
    ? typographyResult.violations.filter(item=>item.ruleId==="typography.minimum-role-gap") : [];
  if(gapViolations.length){
    findings.push({
      id:"typography-role-gap",
      layer:"local",
      category:"composition",
      severity:"warn",
      ruleId:"typography.minimum-role-gap",
      message:"The text roles are too tightly spaced for the editorial type system. Restore the role spacing or choose a roomier layout.",
      fix:null,
    });
  }

  // (3) §6 content drops active (info — mirrors dropInfoRef). Name the ACTUAL words
  // (findings actions-model law), never the internal role label.
  const contentLosses=Array.isArray(typographyResult?.violations)
    ? typographyResult.violations.filter(item=>item.ruleId==="content.required-never-dropped"||item.ruleId==="content.optional-loss-visible") : [];
  if ((Array.isArray(signal.dropped) && signal.dropped.length)||contentLosses.length) {
    const dc = resolveDroppedContent(signal);
    const requiredLoss=contentLosses.some(item=>item.ruleId==="content.required-never-dropped");
    findings.push({
      id: "degradation-drops",
      layer: "local",
      category: "degradation",
      severity: requiredLoss?"fail":"info",
      ruleId:requiredLoss?"content.required-never-dropped":"content.optional-loss-visible",
      lossClass: true,
      dropped: dc,
      message: dc.length
        ? `To fit this format, some copy was left off: "${clipCopy(dc.map(d => d.text).join(" · "), 80)}".`
        : `To fit this format, some copy was trimmed.`,
      fix: null,
    });
  }

  // (3b) (Client ruling 2026-07-26 — "text should always be visible, especially the
  // heading") REQUIRED COPY PAINTED PAST CAPACITY. The hero is never dropped: when the
  // ladder bottoms out it paints at the readable floor anyway and we say so HERE, honestly,
  // instead of blanking the canvas and offering a layout switch as the only way to see the
  // words. Same action row as the drop finding (shorten / roomier layout / edit myself) —
  // the layout switch is now a REMEDY, never the price of visibility. Warn, not fail: the
  // copy is on canvas, so this never blocks export on its own.
  const overCapacityLosses=Array.isArray(typographyResult?.violations)
    ? typographyResult.violations.filter(item=>item.ruleId==="content.required-over-capacity") : [];
  if (overCapacityLosses.length) {
    const names=Array.from(new Set(overCapacityLosses.map(item=>ROLE_LABEL[item.role]||item.role)));
    findings.push({
      id: "copy-over-capacity",
      layer: "local",
      category: "degradation",
      severity: "warn",
      ruleId: "content.required-over-capacity",
      field: overCapacityLosses.some(item=>item.role==="hero") ? "headline" : null,
      message: `${names.join(", ")} is longer than this layout comfortably holds — it is still fully shown, at the smallest readable size. Shortening it, or a roomier layout, would give it room to breathe.`,
      fix: null,
    });
  }

  // (4) Explicit logo overlapping the text (fail — a real collision; Commit 3
  //     manual-harmonize escalated this from warn so the silent pass repairs it).
  //     Fix: nudge the logo to a corner clear of the text. We suggest the corner
  //     opposite the text's usual lower-third home; the engine's own guard then
  //     honours the explicit position verbatim (Task 1), so a concrete pick helps.
  const logoClearance=measuredConstraintState(signal,"logo.no-text-overlap","mark:");
  if (signal.logo && signal.logo.explicit && (signal.logo.overlapsText || logoClearance.violations.length)) {
    findings.push({
      id: "logo-overlap-text",
      layer: "local",
      category: "overlap",
      severity: "fail",
      message: `The logo is too close to or overlapping your text. Moving it to a clear corner keeps both readable.`,
      fix: { logoPosition: "top-right" },
    });
  }

  // (5) Logo inside the focal band — over the subject/face (spec §4). fail —
  //     (Crops addendum) a lockup over the subject's face is a real collision the
  //     silent harmonizer must repair (the client's banner lockup landed on a face).
  const logoSubject=measuredConstraintState(signal,"logo.no-subject-overlap","mark:");
  if (signal.logo && (signal.logo.inFocalBand || logoSubject.violations.length)) {
    const remedyCommands=logoSubject.violations.length
      ? createConstraintRemedyCommands(logoSubject.violations[0],{dimensionId:signal.dimensionId,media:signal.constraintContext?.media})
      : [];
    findings.push({
      id: "logo-focal-band",
      layer: "local",
      category: "overlap",
      severity: "fail",
      message: `The logo is covering the main subject of the photo. A top or bottom corner keeps the subject clear.`,
      fix: { logoPosition: signal.logo.suggestPosition || "top-left" },
      remedyCommands,
    });
  }

  const subjectContent=constraintViolations(signal,"media.protected-subject").filter(row=>constraintTouches(row,"content:"));
  if(subjectContent.length){
    const violation=subjectContent[0];
    const zoneId=(violation.zoneIds||[]).find(id=>String(id).startsWith("content:"));
    const role=String(zoneId||"").split(":")[1]||"hero";
    const remedyCommands=createConstraintRemedyCommands(violation,{dimensionId:signal.dimensionId,media:signal.constraintContext?.media,pinnedRoles:(signal.ready?.pinned||[]).map(p=>p.role)});
    findings.push({
      id:"media-subject-overlap",layer:"local",category:"overlap",severity:"fail",
      element:role==="hero"?"headline":role==="support"?"caption":role,
      ruleId:"media.protected-subject",
      message:`Your text is covering the main subject of the photo. Move the text into the available negative space or adjust the crop.`,
      remedyCommands,
      fix:null,
    });
  }

  const structuralStraddles=constraintViolations(signal,"structural.no-seam-straddle").filter(row=>constraintTouches(row,"content:"));
  if(structuralStraddles.length){
    const violation=structuralStraddles[0];
    const zoneId=(violation.zoneIds||[]).find(id=>String(id).startsWith("content:"));
    const role=String(zoneId||"").split(":")[1]||"hero";
    const remedyCommands=createConstraintRemedyCommands(violation,{dimensionId:signal.dimensionId,pinnedRoles:(signal.ready?.pinned||[]).map(p=>p.role)});
    findings.push({
      id:"structural-seam-straddle",layer:"local",category:"overlap",severity:"fail",
      element:role==="hero"?"headline":role==="support"?"caption":role,
      ruleId:"structural.no-seam-straddle",
      message:`Your text crosses a layout surface boundary, so part of it may become difficult to read. Keep the text on one surface.`,
      remedyCommands,
      fix:null,
    });
  }

  const decorationConflicts=constraintViolations(signal,"decoration.yields-to-meaning");
  const seenDecorations=new Set();
  for(const violation of decorationConflicts){
    const decorationId=(violation.zoneIds||[]).find(id=>String(id).startsWith("decoration:"));
    const uid=String(decorationId||"").slice("decoration:".length);
    if(!uid||seenDecorations.has(uid))continue;
    seenDecorations.add(uid);
    const targetId=(violation.zoneIds||[]).find(id=>id!==decorationId)||"";
    const targetLabel=String(targetId).startsWith("mark:")?"logo":String(targetId).startsWith("protected:media-subject")?"main photo subject":"text";
    const remedyCommands=createConstraintRemedyCommands(violation,{dimensionId:signal.dimensionId});
    findings.push({
      id:`decoration-overlap:${uid}`,layer:"local",category:"overlap",severity:"fail",
      elementId:`shape:${uid}`,geometry:violation.geometry?.from||null,
      ruleId:"decoration.yields-to-meaning",
      message:`A decoration is covering the ${targetLabel}. Move or remove it so the important content stays clear.`,
      remedyCommands,fix:null,
    });
  }

  // (Refinement 2) Logo dragged FREELY into a platform action band (the strip where the
  // platform's own on-screen controls sit). We never block or move it — the user placed it
  // there deliberately — but we surface a gentle advisor reminder that the mark may be
  // hidden by the platform UI. Fixable in one tap (snap back to the nearest safe corner),
  // or the user can keep it. Only fires for a free pin (named anchors land clear).
  if (signal.logo && signal.logo.inActionBand) {
    findings.push({
      id: "logo-action-band",
      layer: "local",
      category: "safe-zone",
      severity: "fail",
      message: `The logo is in the area the platform covers with its own buttons and may be hidden. Dragging it toward the middle keeps it visible.`,
      fix: { logoPosition: "top-right" },
    });
  }

  // (6) Text dragged outside the platform safe zone (spec §1.0). fail, no fix —
  //     layout is spec-driven, so this only fires on a user override; the cleanest
  //     recovery is for the user to move it back, which the message advises.
  const measuredPlatformText=measuredConstraintState(signal,"format.platform-occlusion","content:");
  if (signal.safeZoneViolation && !measuredPlatformText.evaluated) {
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

  // (Text Elements slice 4 — spec §4) The CROWDING ADVISORY: one advisory finding when
  // the placed dynamic elements exceed the layout's density budget, carrying the three
  // ranked executable remedies. Plus one complete-or-absent finding per element the
  // solver could not seat in this format (closing slice 2b's deferred ledger item).
  // Both read the render's own contentElements ledger — no placement maths reimplemented —
  // and fire ONLY on genuine over-budget / unplaced states (born-clean holds otherwise).
  runCrowdingAdvisory(signal, findings);
  runUnplacedElementFindings(signal, findings);

  // (P1 slice 3 — owner rails) A PINNED (user-dragged) date/eyebrow/badge whose placement
  // violates a hard restraint gets the honest fix:null dot — never an auto-move (M3).
  // One builder shared with computeReadyVerdict (one voice, law 1); gated on the render's
  // ready.pinned signal, so autonomous generations (no drags → pinned empty) never raise
  // it (law 4, born-clean).
  {
    const pp = pinnedPlacementFinding(signal, signal.dimensionId);
    if (pp) findings.push(pp);
  }

  // (Item 1 — pinned logo legibility) A logo the USER pinned (a placement or a Logo-panel
  // variant pick) is drawn verbatim (law 5 / M3: never auto-swap a pinned choice). When
  // even so it can't clear the contrast floor against what it sits on — the green "Primary 3
  // Flat" mark on the burnham field, or a pinned mark on a busy photo — surface a LIVE
  // advisor dot on the logo so the human decides (re-pick a readable variant, move it, or
  // recolour the field). Gated on `pinned`: an AUTO logo is the system's own free variable
  // (it already swaps to the best official variant) and stays off the live ledger, so fresh
  // generations keep zero dots (law 4, born-clean). The readiness gate keeps its own,
  // ungated logo-legibility check (computeReadyVerdict) for the publish verdict.
  if (signal.logo && signal.logo.illegible && signal.logo.pinned) {
    findings.push({
      id: "logo-legibility",
      layer: "local",
      category: "logo",
      element: "logo",
      severity: "fail",
      message: `The logo you chose is hard to see here — its colour is close to what sits behind it. Pick a higher-contrast logo, move it, or change the colour behind it.`,
      fix: null,
      logoMoveTo: signal.logo.suggestPosition || null,
    });
  }

  return findings.map(finding=>normalizeFinding(finding,{signal,source:"local"})).filter(Boolean);
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
    // (born-clean 2026-07-06) When the caption was RAISED to its legibility floor, the
    // achieved ratio is forced below target BY THE SYSTEM's own readability decision —
    // the archetype wanted a smaller caption than is legible. Scolding that would place
    // an advisor dot on a fresh, correctly-composed design (the born-clean violation the
    // resident tester caught on every real editorial generation). The floored caption is
    // already surfaced by the type-size-floor finding; the ratio note here is both
    // redundant and unactionable (the user can't shrink the caption below the floor), so
    // suppress it. A user who later GROWS the caption above its floor lifts bodyAtFloor
    // and the ratio check re-engages, catching genuine user-caused drift.
    const bodyFloored = !!d.bodyAtFloor;
    if (!multiWordHero && !bodyFloored && d.heroSupportRatio < floor) {
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

  // (g) CANVAS-CROP ASSERTION. `outOfMargin` is supplied only when painted bounds
  //     cross the physical canvas. Editorial insets and platform UI zones are separate
  //     concepts and must not be described as cropping.
  if (d.outOfMargin) {
    findings.push({
      id: "archetype-margin-crop",
      layer: "local",
      category: "safe-zone",
      severity: "fail",
      message: `Some text is crossing the canvas edge and may be cropped when exported. Reset its placement or shorten the copy.`,
      fix: null,
    });
  }
}

// (Text Elements slice 4 — spec §4) The per-layout DENSITY BUDGET: how many dynamic
// text elements a layout seats before it reads crowded. Derived from the layout's OWN
// whitespace target (existing archetype-drift machinery) — an airier layout (higher
// target) tolerates fewer added elements before its breathing room is spent; a full-
// bleed layout (target ~0) tolerates the most. Pure + monotonic (budget math, unit-tested).
export function dynamicElementBudget(whitespaceTarget) {
  const t = typeof whitespaceTarget === "number" ? Math.max(0, Math.min(1, whitespaceTarget)) : 0.4;
  return Math.max(1, Math.round((1 - t) * 6));   // target 0 → 6, 0.5 → 3, 0.62 → 2
}

const ELEMENT_CLASS_LABEL = { heading: "heading", subheading: "subheading", body: "text", caption: "caption", cta: "button" };

// (spec §4) The three RANKED, executable remedies for an over-budget layout, in the
// ratified order: (a) AI simplify/merge the lowest-priority adjacent elements, (b) drop
// the single lowest-priority element (named explicitly), (c) switch to a roomier layout
// — offered ONLY when the render verified a candidate (never blind). Pure: `placed` is
// the placed dynamic-element list (each {uid,class,priority,text}); `canRoomier` the
// render's solver-verified flag. Returns { lowest, simplifyUids, remedies }.
export function crowdingRemedies(placed, canRoomier) {
  const ranked = [...(placed || [])].sort((a, b) => (a.priority || 0) - (b.priority || 0)); // lowest priority first
  const lowest = ranked[0] || null;
  // "Simplify for me" merges the two lowest-priority (adjacent in the drop order) elements.
  const simplifyUids = ranked.slice(0, 2).map(e => e.uid).filter(Boolean);
  const lowestLabel = lowest ? (ELEMENT_CLASS_LABEL[lowest.class] || "element") : "element";
  const remedies = [
    { id: "simplify-copy", label: "Simplify for me", kind: "ai-simplify", uids: simplifyUids },
    { id: "remove-optional-element", label: `Remove the ${lowestLabel}`, kind: "remove-element", uid: lowest ? lowest.uid : null },
  ];
  if (canRoomier) remedies.push({ id: "switch-layout", label: "Try a roomier layout", kind: "switch-layout" });
  return { lowest, lowestLabel, simplifyUids, remedies };
}

// (spec §4) Raise the ONE crowding advisory (one voice) when the placed dynamic elements
// exceed the layout's density budget. Advisory severity — never a hard cap; the remedies
// are the executable path (law 2, no dead label). Gated on the render's contentElements
// ledger, so a fresh generation (no added elements) never fires it (law 4, born-clean).
function runCrowdingAdvisory(signal, findings) {
  const elements = Array.isArray(signal && signal.contentElements) ? signal.contentElements : [];
  const placed = elements.filter(e => e && e.placed !== false);
  if (placed.length < 2) return;   // fewer than two added elements can never over-crowd
  const target = signal.archetypeDrift ? signal.archetypeDrift.whitespaceTarget : null;
  const budget = dynamicElementBudget(target);
  if (placed.length <= budget) return;   // within budget → no advisory (born-clean)
  const canRoomier = !!(signal.roomierLayout);
  const { lowestLabel, remedies } = crowdingRemedies(placed, canRoomier);
  const tail = canRoomier
    ? `I can simplify it for you, drop the ${lowestLabel}, or try a roomier layout.`
    : `I can simplify it for you, or drop the ${lowestLabel}.`;
  findings.push({
    id: "crowding-advisory",
    layer: "local",
    category: "composition",
    severity: "info",
    ruleId: "layout.whitespace-budget",
    message: `This layout is getting crowded — ${placed.length} added text elements where about ${budget} keeps it breathing. ${tail}`,
    fix: null,
    crowding: { placed: placed.length, budget, remedies },
  });
}

// (spec §3/§4; closes slice 2b's deferred ledger item) One complete-or-absent finding
// per element the solver could not seat in THIS format. The element is NOT lost — it is
// kept in storage and named here with the shorten / remove / roomier-layout remedies.
// Reads the same render ledger (unplaced entries), so element-free / all-placed docs
// raise nothing (born-clean).
function runUnplacedElementFindings(signal, findings) {
  const elements = Array.isArray(signal && signal.contentElements) ? signal.contentElements : [];
  for (const el of elements) {
    if (!el || el.placed !== false || !el.uid) continue;
    const label = ELEMENT_CLASS_LABEL[el.class] || "text element";
    findings.push({
      id: `element-unplaced:${el.uid}`,
      layer: "local",
      category: "degradation",
      severity: "info",
      ruleId: "content.complete-or-absent",
      elementId: `element:${el.uid}`,
      message: `Your ${label} "${clipCopy(el.text || "", 40)}" didn't fit this format, so it's kept in storage and not shown here. Shorten it, remove it, or try a roomier layout.`,
      fix: null,
      unplacedElement: { uid: el.uid, class: el.class || null, reason: el.reason || "no-clean-candidate" },
    });
  }
}

// Compact one-line summaries of local findings — passed to the vision route so
// the model does NOT repeat what the rules engine already caught.
export function summarizeLocalFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.map(f => `[${f.severity}] ${f.category}: ${f.message}`);
}

/* ── DROPPED-CONTENT RESOLUTION (findings actions-model law) ──────────────────
   §6 drops record INTERNAL role LABELS ("Details", "Caption", "Subtext", …). A
   finding must never leak an internal field name at the user — it must name the
   ACTUAL words that were left off. Resolve each dropped label → its copy field →
   the real text, per the legacy postType conventions (which field each label draws
   from). Returns [{ role, field, label, text }] for labels that resolve to real copy;
   labels with no resolvable text (rare) are dropped from the list. */
// Which copy FIELD each dropped role label reads from, per postType. Mirrors the
// legacy painters in renderScene (photo_logo/texture_text caption = subtext; event
// details = subtext; text_post subtext = attribution; eyebrow = microLabel).
export function droppedLabelField(label, postType) {
  const L = String(label || "").toLowerCase();
  if (L === "headline") return { role: "headline", field: "headline" };
  if (L === "caption") return { role: "support", field: "subtext" };
  if (L === "details") return { role: postType === "event" ? "support" : "support", field: "subtext" };
  if (L === "subtext") return { role: "support", field: postType === "text_post" ? "attribution" : "subtext" };
  if (L === "eyebrow") return { role: "eyebrow", field: "microLabel" };
  return null;
}

export function resolveDroppedContent(signal) {
  const out = [];
  if (!signal || !Array.isArray(signal.dropped)) return out;
  const copy = signal.copy || {};
  const seen = new Set();
  for (const label of signal.dropped) {
    const map = droppedLabelField(label, signal.postType);
    if (!map) continue;
    const text = String(copy[map.field] || "").trim();
    if (!text || seen.has(map.field)) continue;
    seen.add(map.field);
    out.push({ role: map.role, field: map.field, label, text });
  }
  return out;
}

// Truncate real user copy for a message (never mid-... just ~len chars + ellipsis).
export function clipCopy(text, len = 60) {
  const s = String(text || "").trim();
  return s.length > len ? s.slice(0, len - 1).trimEnd() + "…" : s;
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

// (P1 slice 3 — owner rails) THE PINNED-PLACEMENT FINDING — one builder, one voice
// (law 1): runLocalAudit (the advisory ledger) and computeReadyVerdict (the per-format
// publish verdict that drives the advisor dots) both raise EXACTLY this finding, deduped
// by id. It fires only for a PINNED (user-dragged) date/eyebrow/badge whose placement
// violates a hard restraint the render measured: the platform safe-area zone (Story's
// action bands) or a collision with another drawn element. The renderer partitions
// pinned boxes OUT of ready.textBoxes, so the safe-area-text auto-fix (a textLayout.y
// nudge) can never touch a pin (M3) — this honest fix:null dot is the ONLY surface, and
// its remedies (put it back / move it yourself / keep it) live in Generator's
// findingActions (law 2: never a dead label). ready.pinned is empty on any autonomous
// generation, so fresh designs keep zero dots (law 4, born-clean).
const PINNED_ROLE_LABEL = { date: "date", eyebrow: "eyebrow label", pill: "badge" };
function pinnedPlacementFinding(signal, dimensionId) {
  const R = signal && signal.ready;
  const pinned = R && Array.isArray(R.pinned) ? R.pinned : [];
  if (!pinned.length) return null;
  const dimId = dimensionId || (signal && signal.dimensionId) || "ig_square";
  const zone = PLATFORM_SAFE[dimId];
  const offenders = [];
  for (const p of pinned) {
    if (!p || typeof p.y !== "number") continue;
    const inZone = !!(zone && (p.y < zone.top || (p.y + (p.h || 0)) > (1 - zone.bottom)));
    if (inZone || p.collides) offenders.push({ role: p.role, inZone, collides: !!p.collides });
  }
  if (!offenders.length) return null;
  const names = offenders.map(o => PINNED_ROLE_LABEL[o.role] || o.role);
  const nameStr = names.length === 1 ? `The ${names[0]} you placed` : `The ${names.join(' and the ')} you placed`;
  const anyZone = offenders.some(o => o.inZone);
  const anyCollide = offenders.some(o => o.collides);
  const why = anyZone
    ? `sits in Instagram's ${zone.label} action zone — the platform's own buttons will cover it${anyCollide ? ', and it overlaps another element on the design' : ''}`
    : `overlaps another element on the design`;
  return {
    id: 'pinned-placement',
    layer: 'local',
    category: 'safe-zone',
    element: offenders[0].role,           // anchors the dot to the actual drawn element
    pinnedRoles: offenders.map(o => o.role),
    severity: 'fail',
    message: `${nameStr} ${why}. Your placement stays exactly where you put it — move it, or put it back where the layout had it.`,
    fix: null,                            // NEVER auto-moved — a pin is the owner's word (law 5)
  };
}

// One format's publish verdict. `signal` is a render snapshot (auditRef.current for
// that dimension). Reuses computeLocalAudit for the shared contrast/overlap/safe-zone
// findings, then layers the thumbnail-scale + platform-safe-area + copy-limit gates.
export function computeReadyVerdict(signal, dimensionId) {
  const dimId = dimensionId || (signal && signal.dimensionId) || "ig_square";
  const issues = [];
  const push = (i) => { if (i && !issues.some(x => x.id === i.id)) issues.push(i); };

  if (!signal || typeof signal !== "object") {
    return { dimensionId: dimId, ready: true, issues: [], policyState:createReadinessPolicyState([]) };
  }

  // (A) Fold in the advisory findings that are genuine PUBLISH blockers. Only
  // fail-severity findings gate readiness; warns/infos are polish, not blockers,
  // and would erode trust in the "Ready" verdict by crying wolf. The finding
  // already carries a concrete fix + user-facing message.
  const BLOCKER_IDS = new Set([
    "contrast-fail", "logo-overlap-text", "logo-focal-band",
    "safe-zone-violation", "archetype-margin-crop", "archetype-box-overlap",
    "media-subject-overlap", "structural-seam-straddle", "media-crop-coverage",
    "logo-clear-space", "surface-double-treatment", "surface-band-shape-conflict",
    "surface-pinned-color-overridden",
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
    if (f.severity === "fail" && (BLOCKER_IDS.has(f.id)||f.ruleId==="decoration.yields-to-meaning"||f.ruleId==="decoration.approved-asset")) {
      if (f.id === "contrast-fail" && flatSolidLegible) continue; // legible solid field
      push({ ...f,severity:"fail" });
    }
  }

  const R = signal.ready || null;

  // (B) THUMBNAIL-SCALE LEGIBILITY. The 3-up IG feed grid renders a post at ~a third
  // of the phone width, so on-canvas text can vanish once shrunk to a grid cell.
  // TWO premises gate this finding so it fires ONLY where the text is genuinely small
  // RELATIVE to what the layout could give it (not merely because a format is wide):
  //   1. FEED-GRID ONLY. The 3-up-thumbnail model is real only for the IG feed grid
  //      (ig_square / ig_portrait). Story is shown full-screen (its own safe-area gate
  //      handles it), and the wide platform formats (twitter / facebook / banner) are
  //      shown at NATIVE size on their own surfaces — never as a square 3-up cell — so
  //      their large canvasW made EVERY role project below the floor here, firing on
  //      plainly legible designs (the client's "weird comment" on a fine wide caption).
  //   2. VERIFY THE REMEDY. We only surface "shortening the copy lets it render larger"
  //      when the role is actually FIT-SHRUNK — the renderer pinned it to its readable
  //      floor because the copy is long (signal.flooredRoles). A role small for any
  //      other reason wouldn't grow if shortened, so claiming it would be a promise the
  //      render can't back (honesty law). Unfloored roles are skipped.
  const FEED_GRID = dimId === "ig_square" || dimId === "ig_portrait";
  if (FEED_GRID && R && R.fontPx && R.canvasW && signal.hasText) {
    const flooredLabels = new Set(
      (Array.isArray(signal.flooredRoles) ? signal.flooredRoles : []).map(r => r && r.label)
    );
    const FLOOR_LABEL = { headline: "Headline", subtext: "Body text", date: "Date" };
    const FIELD_OF = { headline: "headline", subtext: "subtext", date: "dateText" };
    let worst = null; // { role, px, thumb }
    const ROLE_LABEL = { headline: "headline", subtext: "caption", date: "date" };
    for (const role of ["headline", "subtext", "date"]) {
      const px = R.fontPx[role];
      if (!px) continue;
      if (!flooredLabels.has(FLOOR_LABEL[role])) continue; // (premise 2) no headroom → shortening wouldn't help
      const t = thumbnailPx(px, R.canvasW);
      if (t != null && (!worst || t < worst.thumb)) worst = { role, px, thumb: t };
    }
    if (worst && worst.thumb < THUMB_MIN_PX) {
      // One-tap remedy (advice-ledger §2 / §6): the honest, verified fix for "too small
      // because the copy is long" is to SHORTEN that copy — carried as `field` so the
      // finding's action offers "Shorten it for me" (an ai-fix that genuinely reduces
      // the copy so the fitter renders it larger). The old backdropMode:"band" fix was
      // incoherent for a SIZE finding — a band never makes text larger.
      push({
        id: "thumb-legibility",
        category: "type-size",
        element: worst.role === "subtext" ? "caption" : worst.role,
        field: FIELD_OF[worst.role],
        message: `The ${ROLE_LABEL[worst.role] || worst.role} is too small to read at feed-thumbnail size — it shrinks to about ${worst.thumb.toFixed(1)}px in the grid. Shortening the copy lets it render larger.`,
        fix: null,
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
    const textConstraint=measuredConstraintState(signal,"format.platform-occlusion","content:");
    const measuredTextHit=textConstraint.violations[0]?.geometry?.from||null;
    const legacyTextHit=boxes.find(b => inTop(b) || inBottom(b));
    const textHit=textConstraint.evaluated ? measuredTextHit : legacyTextHit;
    if (textHit) {
      // Nudge the whole text block to a vertically safe band (centre third). This is
      // a per-format override so it only touches Story; applied via textLayout.y.
      const protectedIds=textConstraint.violations.flatMap(row=>row.zoneIds||[]).filter(id=>String(id).startsWith("protected:platform-"));
      const hitsTop=protectedIds.some(id=>String(id).endsWith("top"));
      const hitsBottom=protectedIds.some(id=>String(id).endsWith("bottom"));
      const hitsLeft=protectedIds.some(id=>String(id).endsWith("left"));
      const hitsRight=protectedIds.some(id=>String(id).endsWith("right"));
      const textLayout={};
      if (!textConstraint.evaluated || hitsTop || hitsBottom) {
        textLayout.y=Math.max(zone.top+0.02,Math.min(1-zone.bottom-textHit.h-0.02,0.34));
      }
      if (hitsLeft || hitsRight) {
        textLayout.x=Math.max(zone.left+0.02,Math.min(1-zone.right-textHit.w-0.02,textHit.x));
      }
      push({
        id: "safe-area-text",
        category: "safe-zone",
        message: `Your text sits in the ${zone.label} action zone — Instagram's own buttons will cover it. Moving it into the clear middle keeps it visible.`,
        fix: { dimensionId: dimId, textLayout },
        severity: "fail",
      });
    }
    const logoConstraint=measuredConstraintState(signal,"format.platform-occlusion","mark:");
    const measuredLogoHit=logoConstraint.violations[0]?.geometry?.from||null;
    const logo=logoConstraint.evaluated ? measuredLogoHit : (R.logoBox && (inTop(R.logoBox)||inBottom(R.logoBox)) ? R.logoBox : null);
    if (logo) {
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

  // (C3 · P1 slice 3 — owner rails) A PINNED (user-dragged) date/eyebrow/badge violating
  // a hard restraint (platform action zone, collision with a drawn element). Honest
  // fix:null — the dot names the element and what it violates; nothing auto-moves (M3).
  // Pinned boxes are excluded from R.textBoxes upstream, so (C)'s safe-area-text nudge
  // never fires for them — no double report, one voice. `dimensionId` rides the finding
  // so findingActions can target the right format's roleOffset when unpinning.
  {
    const pp = pinnedPlacementFinding(signal, dimId);
    if (pp) push({ ...pp, dimensionId: dimId });
  }

  // (C2) LOGO LEGIBILITY ON PHOTO (brand ruling 2026-07-06). The renderer already
  // chose the best-contrast OFFICIAL variant; if even that can't clear the worst-case
  // bar on this photo spot, it rendered the mark verbatim (NO fabricated backing) and
  // flagged it. Surface a finding → advisor dot on the logo. fix:null so nothing
  // auto-applies (the harmonizer never sees readiness issues anyway); the "Move to a
  // clearer spot" remedy is offered as a user action (findingActions), never auto-run.
  if (signal.logo && signal.logo.illegible) {
    push({
      id: "logo-legibility",
      category: "logo",
      element: "logo",
      message: `The logo is hard to see against this part of the photo.`,
      fix: null,
      severity: "fail",
      // A clearer legal 9-grid spot the render scored (or null if none is meaningfully
      // better) — drives the "Move to a clearer spot" action (never auto-applied).
      logoMoveTo: signal.logo.suggestPosition || null,
    });
  }

  // (D) COPY OVERFLOW / TRUNCATION. Dropped copy (§6) or a caption longer than the
  // platform tile can carry means the design either clipped content or will render
  // it too small. Dropped copy is a hard publish issue (the post is missing text the
  // user wrote). Over-length caption is advice (shorten). Mid-word truncation is
  // covered by the render's own drop logic (WP-T) — a dropped role never cuts a word.
  if (Array.isArray(signal.dropped) && signal.dropped.length) {
    // (findings actions-model law) Name the ACTUAL dropped words, never the internal
    // role label. Every remedy the message implies is offered as an action button
    // (built in Generator.findingActions): shorten-for-me (ai-fix), switch-to-{fmt}
    // (deterministic — filled by computeReadyChecklist), edit-myself (deep-link), and
    // "leave it off" (the ack, honest loss-class wording).
    const droppedContent = resolveDroppedContent(signal);
    const worded = droppedContent.length
      ? `Some of your copy didn't fit and was left off: "${clipCopy(droppedContent.map(d => d.text).join(" · "), 80)}"`
      : `Some of your copy didn't fit this format and was left off.`;
    push({
      id: "copy-dropped",
      category: "degradation",
      lossClass: true,                    // ack wording becomes "Leave it off" (a loss, not a style choice)
      dropped: droppedContent,            // [{role, field, text}] — drives the actions
      message: worded,
      fix: null,
      severity: "fail",
    });
  }
  // (2026-07-15 stored-stump cleanup) AI-authored copy that ends on a dangling
  // function word ("…a week of creativity and") and was TOO THIN for the load-time
  // repair adapter (lib/design-persistence.mjs) still paints as a fragment. Surface
  // it as a standard copy finding — same action row as copy-dropped (Tighten it for
  // me / Edit it myself / Leave it off) — never silently delete stored content.
  // Gated to authorship === "ai" (law 5: owner copy is theirs) and the SAME stump
  // class the apply-time guard blocks, so fresh generations never carry it
  // (born-clean holds: the server/client copy-fit guards prevent new stumps).
  if (signal.copy && signal.copyAuthors) {
    const DANGLES = /\b(?:and|or|but|nor|yet|so|for|of|to|in|on|at|by|as|with|from|into|the|a|an|our|your|their|its|his|her|is|are|was|were|be|been)\s*$/i;
    const CLEAN = /[.!?…]["')\]]?$/;
    const STUMP_ROLE = { headline: "hero", subtext: "support", attribution: "support", dateText: "date" };
    for (const f of ["headline", "subtext", "attribution", "dateText"]) {
      const t = String(signal.copy[f] || "").trim();
      if (!t || signal.copyAuthors[f] !== "ai" || CLEAN.test(t) || !DANGLES.test(t)) continue;
      push({
        id: "copy-stump",
        category: "copy-limit",
        field: f,
        dropped: [{ role: STUMP_ROLE[f], field: f, text: t }],   // drives the standard copy action row
        message: `This line ends mid-thought: "${clipCopy(t, 80)}" — it reads as an unfinished fragment.`,
        fix: null,
        severity: "fail",
      });
    }
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

  const canonicalIssues=issues.map(issue=>normalizeFinding(issue,{signal,dimensionId:dimId,source:"local"})).filter(Boolean);
  const policyState=createReadinessPolicyState(canonicalIssues);
  return {
    dimensionId: dimId,
    label: (zone && zone.label) || dimId,
    ready: policyState.canPublish,
    issues:canonicalIssues,
    policyState,
  };
}

// Human labels + copy-capacity rank of each format (how much stacked copy it can carry
// before §6 drops kick in — taller/larger fit more). Used to NAME the smallest format
// where the full copy fits for the copy-dropped "Switch to …" action.
export const FORMAT_LABEL = { ig_square: "Square", ig_portrait: "Portrait", story: "Story", twitter: "Twitter", facebook: "Facebook", banner: "Banner" };
export const FORMAT_COPY_CAPACITY = { banner: 0, twitter: 1, facebook: 2, ig_square: 3, ig_portrait: 4, story: 5 };

// Roll up per-format verdicts from the format sweep. `perFormat` is
// [{ dimensionId, signal }] (each signal = auditRef.current for that format).
// Returns { ready:boolean, formats:[verdict], needCount:number }.
export function computeReadyChecklist(perFormat) {
  const formats = (Array.isArray(perFormat) ? perFormat : []).map(
    ({ dimensionId, signal }) => computeReadyVerdict(signal, dimensionId)
  );
  // (findings actions-model law) Fill each copy-dropped finding's "Switch to {format}"
  // target: a format that CARRIES the full copy — i.e. reports no §6 drop of its own.
  // Layout capacity is not a simple "taller = more" (photo_logo's small side-by-side
  // formats fit MORE caption than the tall stacked ones), so we trust the render's own
  // per-format drop signal as ground truth: any format with no copy-dropped shows the
  // words. Among carriers we prefer the one CLOSEST in copy-capacity to the current
  // format (the gentlest switch). If none carries it, no switch button is offered.
  const dropsCopy = (f) => (f.issues || []).some(i => i.id === "copy-dropped");
  for (const f of formats) {
    for (const iss of (f.issues || [])) {
      if (iss.id !== "copy-dropped") continue;
      const curCap = FORMAT_COPY_CAPACITY[f.dimensionId] ?? 0;
      const carriers = formats
        .filter(g => g.dimensionId !== f.dimensionId && !dropsCopy(g))
        .map(g => g.dimensionId)
        .sort((a, b) => Math.abs((FORMAT_COPY_CAPACITY[a] ?? 0) - curCap) - Math.abs((FORMAT_COPY_CAPACITY[b] ?? 0) - curCap));
      iss.switchTo = carriers[0] || null;
      iss.switchToLabel = iss.switchTo ? (FORMAT_LABEL[iss.switchTo] || iss.switchTo) : null;
      // (copy-fit ruling 2) Format is a PRECONDITION chosen by distribution channel,
      // never a remedy the studio negotiates: the switch target is surfaced ONLY here,
      // as Export-checklist STATUS wording — there is no "switch to {format}" action
      // button anywhere. Name where the full copy fits so the owner can pick the right
      // format for the channel up front.
      if (iss.switchToLabel && !iss._fitStatusWorded) {
        iss.message = `${iss.message} (The full copy fits in ${iss.switchToLabel}.)`;
        iss._fitStatusWorded = true;
      }
    }
  }
  const needCount = formats.filter(f => !f.ready).length;
  return {
    ready:needCount===0,
    formats,
    needCount,
    policyState:createReadinessPolicyState(formats.flatMap(format=>format.issues||[])),
  };
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
  const fingerprint=issue?.fingerprint||`${ackFingerprint(box)}:${issue?.propertyFingerprint||"legacy"}`;
  return `${dimensionId || "?"}|${id}|${cat}|${fingerprint}`;
}

// Is this issue (on this format, with this current affected box) acknowledged?
// `acks` is the map { [ackKey]: { ...meta } } stored on the session.
export function isAcked(acks, dimensionId, issue, box) {
  if (!acks || typeof acks !== "object") return false;
  if(acks[ackKey(dimensionId,issue,box)])return true;
  const id=(issue&&(issue.id||issue.category))||"issue",cat=issue?.category||"";
  return !!acks[`${dimensionId||"?"}|${id}|${cat}|${ackFingerprint(box)}`];
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

// The cross-SOURCE dedup key: (element + dimension) only. The local checker and the AI
// auditor speak different category vocabularies (contrast/safe-zone vs brand/polish),
// so a same-concern double-flag on ONE element would keep different category tokens and
// escape a category-keyed dedup. Anchoring the merge on the element (with the canvas
// bucket excluded — a whole-composition note is never "the same" as an element issue)
// collapses "text is hard to read" (local contrast) + "the caption fights the photo"
// (AI polish) into one dot/row. Returns null for an unanchorable (canvas) finding so
// those never merge into an element row.
export function ledgerElementKey(anchor) {
  const el = (anchor && anchor.element) || "canvas";
  if (el === "canvas") return null;
  const dim = (anchor && anchor.dimensionId) || "?";
  return `${el}|${dim}`;
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
  return normalizeFinding({
    // A stable id so the SAME re-flagged issue keeps its identity across audits
    // (dedup + ack). id folds category+element+dim; a numeric suffix guards the rare
    // case of two audit findings sharing an anchor within one run.
    id: `ai-${anchorKey}${index != null ? `#${index}` : ""}`,
    key: anchorKey,
    category,
    auditCategory: raw.category || null,   // keep the model's own label for provenance copy
    anchor,
    message: typeof raw.message === "string" ? raw.message : "",
    proposedFix: raw.fix || null,
    sources: ["ai-audit"],
    severity: ["fail", "warn", "info"].includes(raw.severity) ? raw.severity : "info",
    layer: "ai-audit",
    _audit: true,
    designFP: designFP || null,
    geometryFingerprint:fingerprint||undefined,
  },{dimensionId,elementId:el,source:"ai-audit"});
}

export function findingDedupKey(finding) {
  if(!finding)return null;
  const anchor=finding.anchor||{};
  const element=finding.elementId||anchor.element||"canvas";
  const dimension=finding.format||finding.dimensionId||anchor.dimensionId||"?";
  const fingerprint=finding.geometryFingerprint||ackFingerprint(finding.geometry);
  return `${finding.category||"?"}|${element}|${dimension}|${fingerprint}`;
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

export function extractAuditFindings(check) {
  const out=[];
  for(const format of check?.formats||[])for(const issue of format.issues||[]){
    if(issue?._audit)out.push(issue);
    if(Array.isArray(issue?._auditContributions))out.push(...issue._auditContributions);
  }
  return out;
}

export function withoutAuditFindings(check) {
  if(!check||!Array.isArray(check.formats))return check;
  const formats=check.formats.map(format=>{
    const issues=(format.issues||[]).filter(issue=>!issue?._audit).map(issue=>{
      const { _auditContributions,merged,...rest }=issue;
      return {...rest,sources:(rest.sources||["local"]).filter(source=>source!=="ai-audit")};
    });
    const policyState=createReadinessPolicyState(issues);
    return {...format,issues,ready:policyState.canPublish,policyState};
  });
  const needCount=formats.filter(format=>!format.ready).length;
  return {...check,formats,needCount,ready:needCount===0,policyState:createReadinessPolicyState(formats.flatMap(format=>format.issues||[]))};
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
    // Index existing issues by ELEMENT+dim so a matching audit finding folds into the
    // same element's row regardless of category vocabulary (spec rule 2 — dedup by the
    // decision/anchor, not the messenger). Local issues carry no explicit anchor; derive
    // the element via localIssueElement so audit↔local anchors line up. Canvas-anchored
    // findings (no element) never dedup — they stack as their own corner rows.
    const indexByEl = new Map();
    issues.forEach((iss, i) => { const k = findingDedupKey(normalizeFinding(iss,{dimensionId:fmt.dimensionId,source:"local"})); if (k) indexByEl.set(k, i); });
    for (const a of audits) {
      const elKey = findingDedupKey(a);
      const hitIdx = elKey != null ? indexByEl.get(elKey) : null;
      if (hitIdx != null) {
        const cur = issues[hitIdx];
        const sources = Array.from(new Set([...(cur.sources || ["local"]), ...(a.sources || ["ai-audit"])]));
        // Keep the richer (longer) message; keep an existing concrete local fix over the
        // audit's (the deterministic fix is trusted); escalate to the higher severity.
        const message = (a.message && a.message.length > (cur.message || "").length) ? a.message : (cur.message || a.message);
        const fix = cur.fix || a.fix || null;
        const severity = sevRank(a.severity) > sevRank(cur.severity) ? a.severity : cur.severity;
        issues[hitIdx] = { ...cur, sources, message, fix, severity, merged: true,_auditContributions:[...(cur._auditContributions||[]),a] };
      } else {
        // A genuinely NEW observation → its own ledger row/dot. Tag its element key so a
        // later re-merge folds a second finding on the same element into it.
        issues.push({ ...a, _elKey: elKey });
        if (elKey != null) indexByEl.set(elKey, issues.length - 1);
      }
    }
    const policyState=createReadinessPolicyState(issues);
    return { ...fmt, issues, ready:policyState.canPublish, policyState };
  });
  const needCount = mergedFormats.filter(f => !f.ready).length;
  return { ...(check || {}), formats: mergedFormats, needCount, ready: needCount === 0,policyState:createReadinessPolicyState(mergedFormats.flatMap(format=>format.issues||[])) };
}

function sevRank(s) { return s === "fail" ? 3 : s === "warn" ? 2 : s === "info" ? 1 : 0; }

// Coarse anchor element token for a LOCAL readiness issue so it dedups against an
// audit finding on the same element. Logo/overlap issues → "logo"; everything else
// (contrast/type-size/safe-zone/copy/composition) concerns the text block → "text".
export function localIssueElement(issue) {
  if (!issue) return "canvas";
  const id = issue.id || "";
  if (id.includes("logo") || issue.category === "overlap" || issue.category === "logo") return "logo";
  if (issue.category === "degradation" || issue.category === "copy-limit") return "text";
  return "text";
}
