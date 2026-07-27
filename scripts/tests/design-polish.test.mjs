import test from "node:test";
import assert from "node:assert/strict";
import {
  POLISH_STAGES,
  DECLUTTER_MAX_ROUNDS,
  POLISH_CLEAN_REPLY,
  nextPolishStage,
  createPolishRun,
  polishApplyOptions,
  recordPolishApply,
  collectRepairFindings,
  planRepairStage,
  planDeclutterStage,
  planRecomposeStage,
  validateAuditFixes,
  buildPolishSummary,
} from "../../lib/design-polish.mjs";
import { detectPolishRequest } from "../../lib/assistant-intents.js";

/* ── The spec's verification bar (docs/design-polish-spec.md §Verification):
   stage ordering · pin-change disclosure · one-undo transaction · placebo guard
   (no-op honesty) · degraded no-key path. Plus the stage-2 hard rules (never the
   media host, removals named) and the stage-4 schema/policy gate. ────────────── */

// A minimal applyDesignPatch-shaped return: field array carrying .changedPaths.
function appliedResult(fields, paths) {
  const out = [...fields];
  out.changedPaths = paths;
  return out;
}

/* ── 1 · STAGE ORDERING ──────────────────────────────────────────────────────── */

test("the five stages run in the ratified order", () => {
  assert.deepEqual(POLISH_STAGES, ["repair", "declutter", "recompose", "art-direction", "verify"]);
});

test("nextPolishStage walks repair → declutter → recompose → art-direction → verify → end", () => {
  assert.equal(nextPolishStage("repair"), "declutter");
  assert.equal(nextPolishStage("declutter", { moreDeclutter: false, round: 0 }), "recompose");
  assert.equal(nextPolishStage("recompose"), "art-direction");
  assert.equal(nextPolishStage("art-direction"), "verify");
  assert.equal(nextPolishStage("verify"), null, "verify ends the run");
});

test("declutter repeats on fresh findings but is bounded — never an infinite loop", () => {
  assert.equal(nextPolishStage("declutter", { moreDeclutter: true, round: 0 }), "declutter");
  assert.equal(
    nextPolishStage("declutter", { moreDeclutter: true, round: DECLUTTER_MAX_ROUNDS - 1 }),
    "recompose",
    "the final permitted round advances even with work left (bounded pass; findings stay visible in readiness)",
  );
});

test("a run is born at the first stage", () => {
  assert.equal(createPolishRun().stage, POLISH_STAGES[0]);
});

/* ── 2 · ONE-UNDO TRANSACTION ───────────────────────────────────────────────── */

test("the FIRST landed patch commits the single history snapshot; every later apply amends it", () => {
  const run = createPolishRun();
  assert.equal(polishApplyOptions(run).amendUndo, undefined,
    "the first apply must NOT amend — it creates the one snapshot");
  const landed = recordPolishApply(run, appliedResult(["textColorId"], ["typography.inkColor"]));
  assert.equal(landed, true);
  assert.equal(run.committed, true);
  assert.equal(polishApplyOptions(run).amendUndo, true,
    "every subsequent stage folds into the SAME undo entry — one Polish = one undo");
});

test("a no-op apply does not open the transaction — the next real change still owns the one snapshot", () => {
  const run = createPolishRun();
  const landed = recordPolishApply(run, appliedResult([], []));
  assert.equal(landed, false);
  assert.equal(run.committed, false, "an echoed no-op must not mark history as committed");
  assert.equal(polishApplyOptions(run).amendUndo, undefined,
    "after a no-op, the next patch must still push the (single) fresh snapshot");
});

test("changed paths accumulate as render-truth evidence for the summary", () => {
  const run = createPolishRun();
  recordPolishApply(run, appliedResult(["backdropMode"], ["surface.backdrop"]));
  recordPolishApply(run, appliedResult(["removeOverlay"], ["shapes.ol_1"]));
  assert.deepEqual(run.report.changedPaths, ["surface.backdrop", "shapes.ol_1"]);
});

/* ── 3 · PIN-CHANGE DISCLOSURE (the ratified carve-out) ─────────────────────── */

test("planRepairStage applies a fix over a pinned property AND discloses the pin change", () => {
  const failures = [{
    id: "text-contrast", severity: "fail", message: "Low contrast",
    fix: { textColorId: "whiteSmoke", backdropMode: "band" },
  }];
  const plan = planRepairStage(failures, { pinnedProperties: { textColorId: true } });
  assert.equal(plan.patch.textColorId, "whiteSmoke",
    "full strength: the tap is consent — the pinned ink is adjusted, not skipped");
  assert.equal(plan.pinChanges.length, 1);
  assert.equal(plan.pinChanges[0].property, "textColorId");
});

test("a user-touched logo counts as a pin for logo geometry fixes", () => {
  const failures = [{ id: "logo-action-band", severity: "fail", fix: { logoPosition: "top-right" } }];
  const plan = planRepairStage(failures, { pinnedProperties: {}, userLogoTouched: true });
  assert.equal(plan.patch.logoPosition, "top-right");
  assert.deepEqual(plan.pinChanges.map(p => p.property), ["logoPosition"]);
});

test("untouched pins stay untouched — no disclosure is invented for unpinned fixes", () => {
  const failures = [{ id: "text-contrast", severity: "fail", fix: { textColorId: "burnham" } }];
  const plan = planRepairStage(failures, { pinnedProperties: {} });
  assert.deepEqual(plan.pinChanges, []);
});

test("the summary NAMES every adjusted pin", () => {
  const run = createPolishRun();
  run.report.changedPaths.push("typography.inkColor");
  run.report.repairFields.push("textColorId");
  run.report.pinChanges.push({ stage: "repair", property: "textColorId", to: "whiteSmoke" });
  const summary = buildPolishSummary(run.report);
  assert.match(summary, /pinned/i, "an adjusted pin must be named in the one summary");
  assert.match(summary, /textColorId/, "…by property, so the claim is checkable");
});

test("planRecomposeStage discloses a pinned size it re-solves", () => {
  // A pinned body element painting louder than the heading — the inversion the
  // hierarchy law forbids; polish may quiet it one sanctioned step, disclosed.
  const entries = [
    { id: "text:hero", class: "heading", px: 40, weight: 400, pinned: false },
    { id: "element:el1", class: "body", px: 80, weight: 400, pinned: true },
  ];
  const plan = planRecomposeStage(entries, { fontSizes: { heading: "m" }, elementSteps: { el1: "L" } });
  assert.ok(plan.patch, "an inversion must produce a re-solve patch");
  assert.deepEqual(plan.patch.editElements, [{ uid: "el1", sizeStep: "M" }]);
  assert.equal(plan.pinChanges.length, 1, "the pinned size the pass adjusted is disclosed");
});

test("planRecomposeStage is a no-op when the hierarchy already holds", () => {
  const entries = [
    { id: "text:hero", class: "heading", px: 80, weight: 400, pinned: false },
    { id: "text:support", class: "subheading", px: 30, weight: 400, pinned: false },
  ];
  const plan = planRecomposeStage(entries, { fontSizes: {} });
  assert.equal(plan.patch, null);
  assert.deepEqual(plan.pinChanges, []);
});

/* ── STAGE 1 collection rules ───────────────────────────────────────────────── */

test("collectRepairFindings keeps only fail-severity fix-bearing findings, deduped, acks excluded", () => {
  const perFormat = [
    { dimensionId: "ig_square", findings: [
      { id: "a", severity: "fail", fix: { textColorId: "jet" } },
      { id: "a", severity: "fail", fix: { textColorId: "jet" } }, // duplicate across formats
      { id: "b", severity: "warn", fix: { bgColor: "sage" } },    // not fail
      { id: "c", severity: "fail", fix: null },                    // no fix
      { id: "acked", severity: "fail", fix: { backdropMode: "band" } },
    ] },
  ];
  const local = [{ id: "d", severity: "fail", fix: { logoId: "p1-ivory" } }];
  const out = collectRepairFindings(perFormat, local, f => f.id === "acked");
  assert.deepEqual(out.map(f => f.id), ["a", "d"]);
});

test("conflicting text-colour votes cancel (the harmonizer's tie rule), and shape removals stay out of stage 1", () => {
  const failures = [
    { id: "a", severity: "fail", fix: { textColorId: "jet", backdropMode: "band" } },
    { id: "b", severity: "fail", fix: { textColorId: "whiteSmoke" } },
    { id: "c", severity: "fail", fix: { removeOverlay: "ol_1" } },
  ];
  const plan = planRepairStage(failures, {});
  assert.equal(plan.patch.textColorId, undefined, "two inks voted — neither wins silently");
  assert.equal(plan.patch.backdropMode, "band");
  assert.equal(plan.patch.removeOverlay, undefined, "removals belong to de-clutter, named per shape");
});

/* ── STAGE 2 · DE-CLUTTER hard rules ────────────────────────────────────────── */

const SHAPES = [
  { uid: "host1", assetId: "shape-1", role: "image-frame", structural: true, mediaHost: true },
  { uid: "dec1", assetId: "acc-spark", role: "decorative-overlay", owner: "user", userTouched: true },
  { uid: "dec2", assetId: "shape-2", role: "decorative-overlay", owner: "system" },
  { uid: "lay1", assetId: "shape-3", origin: "layout", owner: "layout" },
];

test("planDeclutterStage NEVER removes the media host or a layout-owned shape", () => {
  const findings = [
    { ruleId: "decoration.yields-to-meaning", elementId: "shape:host1" },
    { ruleId: "decoration.yields-to-meaning", elementId: "shape:lay1" },
    { ruleId: "decoration.density-budget", fix: { removeOverlay: "host1" } },
  ];
  const plan = planDeclutterStage(findings, { mediaHostShapeId: "host1", shapes: SHAPES });
  assert.deepEqual(plan.removals, [], "the media host and structural/layout shapes are untouchable");
});

test("collisions are removed first (lowest visual value), budget targets after; each removal is named", () => {
  const findings = [
    { ruleId: "decoration.occupied-area-budget", fix: { removeOverlay: "dec2" } },
    { ruleId: "decoration.yields-to-meaning", elementId: "shape:dec1" },
  ];
  const plan = planDeclutterStage(findings, { mediaHostShapeId: "host1", shapes: SHAPES });
  assert.deepEqual(plan.removals.map(r => r.uid), ["dec1", "dec2"],
    "decor covering meaning goes before over-budget decor");
  assert.equal(plan.removals[0].pinned, true, "a user-placed colliding shape is removed but flagged for disclosure");
  assert.deepEqual(plan.patches, [{ removeOverlay: "dec1" }, { removeOverlay: "dec2" }],
    "each removal is its own targeted removeOverlay patch — never a blanket removeOverlays");
});

test("a warmth-stack fix (removeOverlays:true) drains as TARGETED removals — guard intact, each named", () => {
  const findings = [{ id: "archetype-warmth-stack", severity: "warn", fix: { removeOverlays: true } }];
  const plan = planDeclutterStage(findings, { mediaHostShapeId: "host1", shapes: SHAPES });
  assert.deepEqual(plan.removals.map(r => r.uid).sort(), ["dec1", "dec2"],
    "only the ADDED decor goes — never the media host or the layout's own shape");
  assert.ok(plan.removals.every(r => r.reason === "warmth-stack"));
  assert.equal(plan.removals.find(r => r.uid === "dec1").pinned, true,
    "the user-placed shape is removed under the carve-out but flagged for disclosure");
});

test("duplicate findings for one shape collapse to one removal", () => {
  const findings = [
    { ruleId: "decoration.yields-to-meaning", elementId: "shape:dec2" },
    { ruleId: "decoration.density-budget", fix: { removeOverlay: "dec2" } },
  ];
  const plan = planDeclutterStage(findings, { shapes: SHAPES });
  assert.equal(plan.removals.length, 1);
});

/* ── STAGE 4 · the schema/policy gate on AI fixes ───────────────────────────── */

test("validateAuditFixes applies the carve-out ONLY through the validation gate", () => {
  const state = { bgColor: "whiteSmoke", textColorId: "burnham", fontSizes: { heading: "m" } };
  const findings = [
    // legit brand fix that changes something → kept
    { category: "brand", message: "The field fights the logo.", fix: { bgColor: "sage" } },
    // echo of the current state → dropped (never a placebo change)
    { category: "brand", message: "Echo.", fix: { bgColor: "whiteSmoke" } },
    // copy rewrite smuggled in → stripped; nothing left → dropped
    { category: "brand", message: "Copy grab.", fix: { headline: "New words" } },
    // a field outside the category's coherence map → coerced away → dropped
    { category: "polish", message: "Off-map.", fix: { bgColor: "jet" } },
    // composition is advice-only by policy → dropped
    { category: "composition", message: "Advice.", fix: { bgColor: "jet" } },
  ];
  const fixes = validateAuditFixes(findings, state);
  assert.equal(fixes.length, 1);
  assert.deepEqual(fixes[0].patch, { bgColor: "sage" });
});

/* ── 4 · PLACEBO GUARD + 5 · DEGRADED NO-KEY PATH ───────────────────────────── */

test("nothing changed → the honest 'already clean' reply, never a manufactured change", () => {
  const run = createPolishRun();
  assert.equal(buildPolishSummary(run.report), POLISH_CLEAN_REPLY);
});

test("degraded no-key path: stages 1-3 stand and the reply carries the honest skipped-AI note", () => {
  const run = createPolishRun();
  run.report.aiPass = "unconfigured";
  // no changes at all → clean line + note
  const clean = buildPolishSummary(run.report);
  assert.ok(clean.startsWith(POLISH_CLEAN_REPLY));
  assert.match(clean, /isn't set up/, "the skipped paid pass is named honestly");
  // deterministic changes landed → they are listed AND the note rides along
  run.report.changedPaths.push("surface.backdrop");
  run.report.repairFields.push("backdropMode");
  const summary = buildPolishSummary(run.report);
  assert.match(summary, /text backdrop/, "claims name the reducer-confirmed fields");
  assert.match(summary, /isn't set up/, "the degraded pass never pretends the AI ran");
  assert.match(summary, /Undo restores everything/, "the one-undo promise is stated");
});

test("the summary names each removal", () => {
  const run = createPolishRun();
  run.report.changedPaths.push("shapes.dec1", "shapes.dec2");
  run.report.removals.push(
    { uid: "dec1", assetId: "acc-spark", reason: "collision", pinned: false },
    { uid: "dec2", assetId: "shape-2", reason: "over-area", pinned: false },
  );
  const summary = buildPolishSummary(run.report);
  assert.match(summary, /spark accent/, "removal #1 named");
  assert.match(summary, /organic shape/, "removal #2 named");
});

/* ── THE CHAT BELT (deterministic phrase routing) ───────────────────────────── */

test("detectPolishRequest matches the ratified whole-design phrases", () => {
  for (const ask of [
    "polish",
    "Polish my design please",
    "clean this up",
    "can you clean it up",
    "tidy it up",
    "make it better",
    "make my design better",
    "i dont know how to improve my design",
    "declutter",
  ]) {
    assert.equal(detectPolishRequest(ask), true, `should match: ${ask}`);
  }
});

test("detectPolishRequest stays out of targeted edits and unrelated asks", () => {
  for (const ask of [
    "make the title better",
    "polish the logo a bit",
    "clean up the caption",
    "improve the photo",
    "make it warmer",
    "change the colour to mauve",
    "the headline should say Open House",
    "",
  ]) {
    assert.equal(detectPolishRequest(ask), false, `should NOT match: ${ask}`);
  }
});
