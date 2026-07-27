// ── DESIGN POLISH — the one-tap "make it better" pass (docs/design-polish-spec.md) ──
// Pure planning + honesty contracts for the Polish pass. The React stage machine
// (hooks/useDesignPolish.js) owns timing and applies patches through THE one patch
// pipeline (Generator.applyDesignPatch); everything decidable without the DOM lives
// here so the spec's verification bar (stage ordering, pin-change disclosure,
// one-undo transaction, placebo guard, degraded no-key path) is unit-testable.
//
// Subordinate to the DLC (AI proposes → schema/policy validate → typed commands →
// render → verify → narrate) and the advice-ledger law, with the RATIFIED carve-out:
// a Polish tap IS the invitation, so pinned choices MAY be adjusted — but every pin
// change is NAMED in the one summary, and one undo restores everything.

import { hierarchyInversions } from "./text-hierarchy.mjs";
import { isMediaHostShape } from "./design-layer-contract.mjs";
import {
  stripCopyFromPatch,
  coerceFixToCategory,
  diffPatchAgainstState,
  FONT_STEP_ORDER,
  PATCH_KEY_LABELS,
} from "./design-patch.js";

/* ── Stage ordering (spec §"What the pass does", in order) ─────────────────── */
export const POLISH_STAGES = Object.freeze([
  "repair",        // 1 · deterministic repair at full strength (harmonizer + contrast ladder)
  "declutter",     // 2 · decoration budget/collision cleanup, lowest visual value first
  "recompose",     // 3 · composition re-solve honoring the hierarchy law
  "art-direction", // 4 · ONE paid design-audit call; validated enum fixes APPLIED
  "verify",        // 5 · render truth + readiness recompute + the one honest summary
]);

// De-clutter drains one budget target per sweep (the evaluator names ONE lowest-value
// removal per rule), so the stage may repeat on fresh findings — bounded, never a loop.
export const DECLUTTER_MAX_ROUNDS = 3;

/** The single stage-transition rule — the ordering law, testable in isolation. */
export function nextPolishStage(current, { moreDeclutter = false, round = 0 } = {}) {
  switch (current) {
    case "repair": return "declutter";
    case "declutter":
      return moreDeclutter && round + 1 < DECLUTTER_MAX_ROUNDS ? "declutter" : "recompose";
    case "recompose": return "art-direction";
    case "art-direction": return "verify";
    default: return null; // verify (or an unknown state) ends the run
  }
}

/* ── Run state: ONE undo transaction + an evidence-backed report ───────────── */
export function createPolishRun({ freshDesign = false } = {}) {
  return {
    stage: POLISH_STAGES[0],
    declutterRound: 0,
    // ONE-UNDO LAW: the FIRST patch that really lands commits the single history
    // snapshot; every later stage folds in with { amendUndo:true } — exactly the
    // harmonizer's "one user-visible action = one undo" contract.
    committed: false,
    freshDesign,
    report: {
      repairFields: [],     // reducer-confirmed patch fields from stage 1
      removals: [],         // [{ uid, assetId, reason, pinned }] — each named in the summary
      recompositions: [],   // [{ kind, ... }] hierarchy re-solve moves that landed
      aiFixes: [],          // [{ category, message, fields }] applied audit fixes
      pinChanges: [],       // [{ stage, property, to }] — EVERY pin the pass adjusted
      changedPaths: [],     // union of reducer-confirmed changed paths (render truth)
      aiPass: null,         // null=ran | "unconfigured" | "error" | "no-preview"
    },
  };
}

/** Options for the next applyDesignPatch call — the one-undo transaction rule. */
export function polishApplyOptions(run) {
  return run.committed
    ? { amendUndo: true, preserveSelection: true }
    : { preserveSelection: true };
}

/**
 * Record one apply result against the run. `applied` is applyDesignPatch's return:
 * an array of reducer-confirmed field names carrying a `.changedPaths` property.
 * Returns true when the patch really changed something (the honesty gate — report
 * entries may only be added when this returns true).
 */
export function recordPolishApply(run, applied) {
  const fields = Array.isArray(applied) ? applied.filter(f => typeof f === "string") : [];
  const paths = Array.isArray(applied && applied.changedPaths) ? applied.changedPaths : [];
  // History commits only on confirmed FIELDS (resolveDesignPatchCompletion.commitHistory),
  // so `committed` keys off the same signal — never off planner intent.
  if (fields.length) run.committed = true;
  run.report.changedPaths.push(...paths);
  return fields.length > 0 || paths.length > 0;
}

/* ── Stage 1 · deterministic repair at full strength ───────────────────────── */

/**
 * Collect the fail-severity, fix-bearing findings across EVERY format plus the live
 * audit — the same set the silent harmonizer repairs, deduped, acked ones excluded.
 * (Acknowledged findings are settled decisions — Polish never re-litigates them.)
 */
export function collectRepairFindings(perFormat, localFindings, isAcknowledged) {
  const all = [];
  for (const fmt of Array.isArray(perFormat) ? perFormat : []) {
    for (const finding of fmt?.findings || []) all.push(finding);
  }
  for (const finding of Array.isArray(localFindings) ? localFindings : []) all.push(finding);
  const seen = new Set();
  return all.filter(finding => {
    if (!finding || finding.severity !== "fail") return false;
    if (!finding.fix || typeof finding.fix !== "object") return false;
    if (typeof isAcknowledged === "function" && isAcknowledged(finding)) return false;
    const key = `${finding.id}:${JSON.stringify(finding.fix)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Merge the repair fixes into ONE patch. FULL STRENGTH: unlike the silent harmonizer,
 * pinned properties are NOT stripped — the Polish tap is consent (ratified carve-out) —
 * but every pinned property the patch touches is returned as a disclosure the summary
 * MUST name. Conflicting text-colour votes cancel (the harmonizer's same tie rule).
 * Shape removals are stage 2's job and are excluded here.
 */
export function planRepairStage(failures, { pinnedProperties = {}, userLogoTouched = false } = {}) {
  const votes = new Set((failures || []).map(f => f.fix && f.fix.textColorId).filter(Boolean));
  const colourConflict = votes.size > 1;
  const patch = {};
  const pinChanges = [];
  for (const finding of failures || []) {
    const fix = { ...finding.fix };
    delete fix.removeOverlay;   // de-clutter owns removals (stage 2, named per shape)
    delete fix.removeOverlays;
    if (colourConflict && fix.textColorId) delete fix.textColorId;
    if (!Object.keys(fix).length) continue;
    for (const key of Object.keys(fix)) {
      const pinnedByProperty = !!pinnedProperties[key];
      const pinnedLogoGeometry = userLogoTouched && (key === "logoPosition" || key === "logoSize");
      if ((pinnedByProperty || pinnedLogoGeometry) && !pinChanges.some(p => p.property === key)) {
        pinChanges.push({ stage: "repair", property: key, issue: finding.id, to: fix[key] });
      }
    }
    Object.assign(patch, fix);
  }
  return { patch: Object.keys(patch).length ? patch : null, pinChanges };
}

/* ── Stage 2 · de-clutter (decoration budgets + collisions) ────────────────── */

const BUDGET_REASONS = {
  "decoration.density-budget": "over-density",
  "decoration.occupied-area-budget": "over-area",
  "decoration.approved-asset": "unapproved",
};

/**
 * Plan the decor removals for one sweep. Sources (all EXISTING machinery):
 *   · `decoration.yields-to-meaning` findings — decor colliding with content/marks/
 *     subject (negative visual value — removed first, pinned ones disclosed);
 *   · budget findings whose evaluator-picked fix is `{ removeOverlay: uid }` — the
 *     evaluator already targets the LOWEST-value unpinned instance.
 * NEVER removes the media host (spec hard rule) or any structural/layout-owned shape —
 * guarded here even though decoration findings should never name one.
 */
export function planDeclutterStage(findings, { mediaHostShapeId = null, shapes = [] } = {}) {
  const byUid = new Map((shapes || []).filter(s => s && s.uid).map(s => [s.uid, s]));
  const removable = (uid) => {
    if (!uid || uid === mediaHostShapeId) return false;
    const shape = byUid.get(uid);
    if (!shape) return true; // stale finding → the removeOverlay patch no-ops safely
    if (isMediaHostShape(shape)) return false;
    if (shape.structural === true || shape.origin === "layout" || shape.owner === "layout") return false;
    return true;
  };
  const removals = [];
  const push = (uid, reason, pinned) => {
    if (!removable(uid) || removals.some(r => r.uid === uid)) return;
    removals.push({ uid, reason, pinned: !!pinned, assetId: byUid.get(uid)?.assetId || null });
  };
  // Collisions first: decor covering meaning has the lowest (negative) visual value.
  for (const finding of Array.isArray(findings) ? findings : []) {
    if (finding?.ruleId !== "decoration.yields-to-meaning") continue;
    const elementId = String(finding.elementId || finding.element || "");
    const uid = elementId.startsWith("shape:") ? elementId.slice("shape:".length) : null;
    const shape = uid ? byUid.get(uid) : null;
    push(uid, "collision", shape ? (shape.owner === "user" || shape.userTouched === true) : false);
  }
  for (const finding of Array.isArray(findings) ? findings : []) {
    const uid = finding?.fix?.removeOverlay;
    if (typeof uid === "string" && uid) {
      push(uid, BUDGET_REASONS[finding.ruleId] || "over-budget", false);
    }
  }
  // Warmth-stack (anti-pattern #20): the archetype's own device PLUS added decor
  // reads busy — the finding's own fix is "clear the extra overlays". Polish drains
  // it as TARGETED removals (never the blanket removeOverlays) so every removal is
  // named and the media-host/structural guard above still applies.
  if ((Array.isArray(findings) ? findings : []).some(f => f?.fix?.removeOverlays === true)) {
    for (const shape of shapes || []) {
      if (!shape || !shape.uid) continue;
      push(shape.uid, "warmth-stack", shape.owner === "user" || shape.userTouched === true);
    }
  }
  return { removals, patches: removals.map(r => ({ removeOverlay: r.uid })) };
}

/* ── Stage 3 · composition re-solve honoring the hierarchy law ─────────────── */

// hierarchy render-truth ids → the legacy fontSizes role the patch grammar controls.
const LEGACY_HIERARCHY_FONT_ROLE = { "text:hero": "heading", "text:support": "content" };
const ELEMENT_STEPS = ["S", "M", "L"];

const legacyStep = (cur, delta) => {
  const at = FONT_STEP_ORDER.indexOf(cur);
  const base = at < 0 ? FONT_STEP_ORDER.indexOf("m") : at;
  return FONT_STEP_ORDER[Math.max(0, Math.min(FONT_STEP_ORDER.length - 1, base + delta))];
};

/**
 * Re-solve the type hierarchy (DLC §12 law, lib/text-hierarchy.mjs) from render
 * truth. Every patch already re-runs the layout solver for system-owned placement;
 * this stage resolves what the solver may not touch on its own — size PINS that
 * invert the reading order. Under the Polish carve-out an inverting pin may be
 * adjusted, quieting the lower voice one sanctioned step (or raising the hero when
 * the lower voice is already at its floor) — each pin change disclosed.
 */
export function planRecomposeStage(entries, { fontSizes = {}, elementSteps = {} } = {}) {
  const inversions = hierarchyInversions(entries);
  if (!inversions.length) return { patch: null, pinChanges: [], recompositions: [] };
  const patch = {};
  const pinChanges = [];
  const recompositions = [];
  for (const inversion of inversions.slice(0, 2)) {
    const lower = inversion.lower;
    const lowerId = String(lower.id || "");
    if (lowerId.startsWith("element:")) {
      const uid = lowerId.slice("element:".length);
      const cur = ELEMENT_STEPS.includes(elementSteps[uid]) ? elementSteps[uid] : "M";
      const next = ELEMENT_STEPS[Math.max(0, ELEMENT_STEPS.indexOf(cur) - 1)];
      if (next !== cur) {
        patch.editElements = [...(patch.editElements || []), { uid, sizeStep: next }];
        recompositions.push({ kind: "element-step", uid, from: cur, to: next, lowerClass: lower.class, higherClass: inversion.higher.class });
        if (lower.pinned) pinChanges.push({ stage: "recompose", property: `element:${uid}:size`, to: next });
        continue;
      }
    }
    const role = LEGACY_HIERARCHY_FONT_ROLE[lowerId];
    if (role) {
      const cur = fontSizes[role] || "m";
      const next = legacyStep(cur, -1);
      if (next !== cur) {
        patch.fontSizes = { ...(patch.fontSizes || {}), [role]: next };
        recompositions.push({ kind: "font-step", role, from: cur, to: next, lowerClass: lower.class, higherClass: inversion.higher.class });
        if (lower.pinned) pinChanges.push({ stage: "recompose", property: `fontSizes.${role}`, to: next });
        continue;
      }
    }
    // The lower voice is already at its floor → raise the hero instead (heading leads).
    if (inversion.higher && inversion.higher.id === "text:hero") {
      const cur = fontSizes.heading || "m";
      const next = legacyStep(cur, +1);
      if (next !== cur && !(patch.fontSizes && patch.fontSizes.heading)) {
        patch.fontSizes = { ...(patch.fontSizes || {}), heading: next };
        recompositions.push({ kind: "font-step", role: "heading", from: cur, to: next, raised: true, lowerClass: lower.class, higherClass: inversion.higher.class });
        if (inversion.higher.pinned) pinChanges.push({ stage: "recompose", property: "fontSizes.heading", to: next });
      }
    }
  }
  return { patch: Object.keys(patch).length ? patch : null, pinChanges, recompositions };
}

/* ── Stage 4 · validate the AI art-direction fixes (schema/policy gate) ────── */

/**
 * The carve-out gate: an audit finding's fix is APPLIED only when it passes the same
 * schema/policy validation every patch faces — copy fields stripped (the audit may
 * never rewrite copy), the category→field coherence map re-enforced client-side
 * (defence in depth over the route's own coercion), and no-op echoes of the current
 * state dropped (never a placebo change). Returns the applicable fixes, best first.
 */
export function validateAuditFixes(findings, designState = {}) {
  const fixes = [];
  for (const finding of Array.isArray(findings) ? findings : []) {
    if (!finding || !finding.fix || typeof finding.fix !== "object") continue;
    const noCopy = stripCopyFromPatch(finding.fix);
    const coerced = coerceFixToCategory(finding.category, noCopy, designState);
    if (!coerced) continue;
    const diff = diffPatchAgainstState(coerced, designState);
    if (!Object.keys(diff).length) continue;
    fixes.push({
      category: finding.category || "polish",
      message: String(finding.message || ""),
      patch: diff,
    });
  }
  return fixes;
}

/* ── Stage 5 · the ONE honest summary (every claim changedPaths-backed) ────── */

export const POLISH_CLEAN_REPLY = "This already reads clean — nothing I'd change.";

const SHAPE_LABELS = {
  "petal-brand": "brand petal shape",
  "shape-1": "organic shape",
  "shape-2": "organic shape",
  "shape-3": "organic shape",
  "acc-arrow": "arrow accent",
  "acc-curve": "curve accent",
  "acc-spark": "spark accent",
  "acc-plus": "plus accent",
  "acc-ring": "ring accent",
  "acc-wave": "wave accent",
};
const shapeLabel = (assetId) => SHAPE_LABELS[assetId] || "decorative shape";

const REMOVAL_REASONS = {
  collision: "was covering your content",
  "over-density": "crowded the composition",
  "over-area": "took up too much of the canvas",
  unapproved: "isn't in the approved brand library",
  "over-budget": "exceeded the decoration budget",
  "warmth-stack": "doubled up the decorative treatment",
};

const fieldLabels = (fields) => {
  const labels = [];
  for (const field of fields || []) {
    const label = PATCH_KEY_LABELS[field] || field;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
};

/**
 * Build the single summary reply from the run's evidence-backed report. Placebo
 * guard: when nothing really changed (no confirmed changed paths), the reply is the
 * honest "already clean" line — NEVER a manufactured change. Every listed claim maps
 * to reducer-confirmed fields/paths the hook recorded; every adjusted pin is named;
 * a skipped AI pass carries its honest note (spec money rule).
 */
export function buildPolishSummary(report) {
  const { repairFields, removals, recompositions, aiFixes, pinChanges, changedPaths, aiPass } = report;
  const skippedNote =
    aiPass === "unconfigured" ? "The AI art-direction pass isn't set up, so this was the deterministic pass only."
    : aiPass === "error" ? "The AI art-direction pass couldn't run just now, so this was the deterministic pass only."
    : aiPass === "no-preview" ? "The AI art-direction pass was skipped (no preview could be captured), so this was the deterministic pass only."
    : null;
  const changed = (changedPaths || []).length > 0;
  if (!changed) return skippedNote ? `${POLISH_CLEAN_REPLY} ${skippedNote}` : POLISH_CLEAN_REPLY;

  const lines = ["Polished your design:"];
  if (repairFields.length) {
    lines.push(`• tightened readability and accessibility — adjusted ${fieldLabels(repairFields).join(", ")}.`);
  }
  for (const removal of removals) {
    lines.push(`• removed the ${shapeLabel(removal.assetId)} that ${REMOVAL_REASONS[removal.reason] || REMOVAL_REASONS["over-budget"]}${removal.pinned ? " (one you'd placed — Undo brings it back)" : ""}.`);
  }
  if (recompositions.length) {
    const worst = recompositions[0];
    lines.push(`• rebalanced the text hierarchy so the ${worst.higherClass || "heading"} reads first.`);
  }
  for (const fix of aiFixes) {
    lines.push(`• art direction: ${fix.message || "refined the finish"}${fix.fields && fix.fields.length ? ` (${fieldLabels(fix.fields).join(", ")})` : ""}.`);
  }
  const namedPins = pinChanges.filter(p => p && p.property);
  if (namedPins.length) {
    lines.push(`• adjusted ${namedPins.length === 1 ? "a choice you'd pinned" : `${namedPins.length} choices you'd pinned`} (${namedPins.map(p => p.property).join(", ")}) — the polish needed ${namedPins.length === 1 ? "it" : "them"}.`);
  }
  if (skippedNote) lines.push(skippedNote);
  lines.push("One tap of Undo restores everything.");
  return lines.join("\n");
}
