import { useEffect } from "react";
import { logFeedback as logFeedbackClient, newTurnId } from "@/lib/sessions";

const MAX_SILENT_ROUNDS = 2;

function collectFixFindings(auditAllFormats, runLocalAudit, findingAckPinned) {
  const collected = [];
  for (const perFormat of auditAllFormats()) {
    for (const finding of perFormat.findings) collected.push(finding);
  }
  for (const finding of runLocalAudit()) collected.push(finding);
  const seen = new Set();
  return collected.filter(finding => {
    if (!(finding.severity === "fail" && finding.fix && typeof finding.fix === "object")) return false;
    if (findingAckPinned(finding)) return false;
    const key = `${finding.id}:${JSON.stringify(finding.fix)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withoutConflictingTextColour(finding, conflict) {
  if (!conflict || !finding.fix.textColorId) return finding.fix;
  return Object.fromEntries(Object.entries(finding.fix).filter(([key]) => key !== "textColorId"));
}

function respectPinnedProperties(finding, fix, pins) {
  if (!Object.keys(pins).length) return { fix, reverted: [], alternative: null };
  const reverted = Object.keys(fix).filter(key => pins[key]);
  if (!reverted.length) return { fix, reverted, alternative: null };
  const alternative = fix.backdropMode && pins.backdropMode && finding.flipFix && !pins.textColorId
    ? finding.flipFix
    : null;
  return {
    fix: alternative || Object.fromEntries(Object.entries(fix).filter(([key]) => !pins[key])),
    reverted,
    alternative,
  };
}

/** Owns bounded, silent repair following an AI-applied design patch. */
export function useSilentPatchHarmonization({
  harmonizeRef,
  fontsLoaded,
  auditAllFormats,
  runLocalAudit,
  findingAckPinned,
  userLogoTouched,
  pinnedPropertiesRef,
  applyDesignPatch,
}) {
  useEffect(() => {
    const harmonization = harmonizeRef.current;
    if (!harmonization.armed || !fontsLoaded) return;
    if (harmonization.rounds >= MAX_SILENT_ROUNDS) {
      harmonizeRef.current.armed = false;
      return;
    }

    const failures = collectFixFindings(auditAllFormats, runLocalAudit, findingAckPinned);
    if (!failures.length) {
      harmonizeRef.current.armed = false;
      return;
    }
    const textColourVotes = new Set(failures.map(finding => finding.fix.textColorId).filter(Boolean));
    const colourConflict = textColourVotes.size > 1;
    const patch = {};
    let novel = false;
    for (const finding of failures) {
      let fix = withoutConflictingTextColour(finding, colourConflict);
      if (harmonization.avoidLogoGeo || userLogoTouched) {
        fix = Object.fromEntries(Object.entries(fix).filter(([key]) =>
          key !== "logoPosition" && key !== "logoSize"));
      }
      fix = respectPinnedProperties(finding, fix, pinnedPropertiesRef.current || {}).fix;
      if (!Object.keys(fix).length) continue;
      const key = `${finding.id}:${JSON.stringify(fix)}`;
      if (harmonization.applied.includes(key)) continue;
      harmonization.applied.push(key);
      Object.assign(patch, fix);
      novel = true;
    }
    if (!novel || !Object.keys(patch).length) {
      harmonizeRef.current.armed = false;
      return;
    }
    harmonizeRef.current.rounds += 1;
    applyDesignPatch(patch, { amendUndo: true });
  }, [
    applyDesignPatch,
    auditAllFormats,
    findingAckPinned,
    fontsLoaded,
    harmonizeRef,
    pinnedPropertiesRef,
    runLocalAudit,
    userLogoTouched,
  ]);
}

/** Owns one debounced repair pass following a user-authored edit burst. */
export function useManualEditHarmonization({
  manualTick,
  manualHarmonizationRef,
  harmonizeRef,
  auditAllFormats,
  runLocalAudit,
  findingAckPinned,
  userLogoTouched,
  pinnedPropertiesRef,
  applyDesignPatch,
  sessionId,
  dimensionId,
}) {
  useEffect(() => {
    if (!manualTick) return;
    const manual = manualHarmonizationRef.current;
    if (!manual.pending) return;
    manual.pending = false;
    const touched = manual.touched || new Set();
    const snapshot = manual.snap;
    manual.snap = null;
    if (!snapshot) return;

    const failures = collectFixFindings(auditAllFormats, runLocalAudit, findingAckPinned);
    if (!failures.length) return;
    const textColourVotes = new Set(failures.map(finding => finding.fix.textColorId).filter(Boolean));
    const colourConflict = textColourVotes.size > 1;
    const avoidLogoGeometry = touched.has("logo") || userLogoTouched;
    const pins = pinnedPropertiesRef.current || {};
    const patch = {};
    const pinResolutions = [];

    for (const finding of failures) {
      let fix = withoutConflictingTextColour(finding, colourConflict);
      if (avoidLogoGeometry) {
        fix = Object.fromEntries(Object.entries(fix).filter(([key]) =>
          key !== "logoPosition" && key !== "logoSize"));
      }
      const resolution = respectPinnedProperties(finding, fix, pins);
      fix = resolution.fix;
      if (resolution.reverted.length) {
        pinResolutions.push({
          issue: finding.id,
          pinnedProperty: resolution.reverted.join(","),
          resolvedVia: resolution.alternative
            ? `textColorId=${resolution.alternative.textColorId}`
            : "kept-pin+dot",
        });
      }
      if (Object.keys(fix).length) Object.assign(patch, fix);
    }

    for (const resolution of pinResolutions) {
      try {
        logFeedbackClient({
          turn_id: newTurnId(),
          session_id: sessionId || null,
          kind: "pin_resolve",
          pin_resolve: {
            issue: resolution.issue,
            pinnedProp: resolution.pinnedProperty,
            resolvedVia: resolution.resolvedVia,
            format: dimensionId,
          },
        });
      } catch {}
    }
    if (!Object.keys(patch).length) return;
    harmonizeRef.current = {
      armed: true,
      rounds: 1,
      applied: failures.map(finding => `${finding.id}:${JSON.stringify(finding.fix)}`),
      avoidLogoGeo: avoidLogoGeometry,
    };
    applyDesignPatch(patch, { amendUndo: true });
  }, [
    applyDesignPatch,
    auditAllFormats,
    dimensionId,
    findingAckPinned,
    harmonizeRef,
    manualHarmonizationRef,
    manualTick,
    pinnedPropertiesRef,
    runLocalAudit,
    sessionId,
    userLogoTouched,
  ]);
}
