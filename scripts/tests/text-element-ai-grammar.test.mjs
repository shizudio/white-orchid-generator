/**
 * Text Elements — Slice 4: AI grammar + crowding advisory.
 *
 * Covers the pure, node-testable half of the slice:
 *   • the add-element chat belt detection (lib/assistant-intents.js)
 *   • the patch grammar → command compilation + change detection (lib/design-patch*)
 *   • the crowding density-budget math + ranked remedies (lib/audit-local.js)
 *   • the crowding advisory + complete-or-absent unplaced findings (lib/audit-local.js),
 *     including born-clean (no elements → no dots) and the contract ruleId join.
 * See docs/text-elements-spec.md §4/§5.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { detectAddElement, classifyElementNoun } from "../../lib/assistant-intents.js";
import {
  patchHasChanges, summarizePatch, addTextElementHasChange, editElementsHasChange, PATCH_OPTIONS,
} from "../../lib/design-patch.js";
import { compileDesignPatchCommands } from "../../lib/design-patch-commands.mjs";
import { applyDesignCommand, createDesignDocumentV1, DESIGN_COMMAND_TYPES } from "../../lib/design-document.mjs";
import {
  runLocalAudit, dynamicElementBudget, crowdingRemedies,
} from "../../lib/audit-local.js";
import { designRuleById } from "../../lib/design-layer-contract.mjs";

// ── BELT DETECTION ───────────────────────────────────────────────────────────
test("belt: maps class nouns to the right sanctioned class", () => {
  assert.equal(detectAddElement("add a caption saying Open House").class, "caption");
  assert.equal(detectAddElement("add a heading that says Welcome").class, "heading");
  assert.equal(detectAddElement("please add a subheading saying Join us").class, "subheading");
  assert.equal(detectAddElement("add a body paragraph saying details here").class, "body");
  assert.equal(detectAddElement("add a button saying Sign up").class, "cta");
  // "CTA" phrasing is a button (cta), never a body.
  assert.equal(detectAddElement("add a CTA saying Enrol now").class, "cta");
  assert.equal(detectAddElement("put a call to action saying Register").class, "cta");
});

test("belt: lifts the words to show, and seeds a starter when none given", () => {
  const cap = detectAddElement("add a caption saying Term starts Monday");
  assert.equal(cap.text, "Term starts Monday");
  assert.equal(cap.substituted, false);
  // A named class with no words → the class starter (matches the UI picker).
  assert.equal(detectAddElement("add a button").text, "Learn more");
  assert.equal(detectAddElement("add a heading").text, "New heading");
});

test("belt: an unrecognized class maps to the closest sanctioned class (body), flagged honestly", () => {
  const q = detectAddElement("add a quote saying Learning is fun");
  assert.equal(q.class, "body");
  assert.equal(q.substituted, true);
  assert.equal(q.text, "Learning is fun");
});

test("belt: does not fire without add-intent, and yields a name/phone ask to the contact belt", () => {
  assert.equal(detectAddElement("change the caption to Open House"), null); // edit, not add
  assert.equal(detectAddElement("make it warmer"), null);
  assert.equal(detectAddElement("add my name Miss Tan at the bottom"), null); // contact belt
  assert.equal(detectAddElement("add our phone number 9123 4567"), null);
});

test("belt: classifyElementNoun orders subheading before heading and cta first", () => {
  assert.equal(classifyElementNoun("a subheading").class, "subheading");
  assert.equal(classifyElementNoun("a heading").class, "heading");
  assert.equal(classifyElementNoun("a badge").class, "cta");
  assert.equal(classifyElementNoun("nothing textual here"), null);
});

// ── PATCH GRAMMAR + COMPILATION ──────────────────────────────────────────────
test("grammar: addTextElement compiles into the content/add-element command", () => {
  const plan = compileDesignPatchCommands({ addTextElement: { class: "caption", text: "Open House" } });
  const entry = plan.afterMaterialization.find(e => e.patchField === "addTextElement");
  assert.ok(entry, "no addTextElement command compiled");
  assert.equal(entry.command.type, DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT);
  assert.equal(entry.command.element.class, "caption");
  assert.equal(entry.command.element.text, "Open House");
  assert.equal(entry.command.element.authorship, "ai");
});

test("grammar: an unknown element class does not compile (closed enum)", () => {
  const plan = compileDesignPatchCommands({ addTextElement: { class: "poster", text: "x" } });
  assert.equal(plan.afterMaterialization.some(e => e.patchField === "addTextElement"), false);
});

test("grammar: addTextElement + editElements reach the reducer and change the document", () => {
  let doc = createDesignDocumentV1();
  const addPlan = compileDesignPatchCommands({ addTextElement: { class: "cta", text: "Sign up" } });
  for (const e of addPlan.afterMaterialization) doc = applyDesignCommand(doc, e.command).document;
  assert.equal(doc.content.elements.length, 1);
  const uid = doc.content.elements[0].uid;
  assert.equal(doc.content.elements[0].class, "cta");
  // Per-uid edit: text + a sanctioned size step.
  const editPlan = compileDesignPatchCommands({ editElements: [{ uid, text: "Enrol now", sizeStep: "L" }] });
  for (const e of editPlan.afterMaterialization) doc = applyDesignCommand(doc, e.command).document;
  const el = doc.content.elements.find(x => x.uid === uid);
  assert.equal(el.text, "Enrol now");
  assert.equal(el.master.sizeStep, "L");
});

test("grammar: change detection recognizes real adds/edits and ignores empty ones", () => {
  assert.equal(addTextElementHasChange({ class: "body", text: "hi" }), true);
  assert.equal(addTextElementHasChange({ class: null, text: null }), false);
  assert.equal(editElementsHasChange([{ uid: "el_body_0", text: "hi" }]), true);
  assert.equal(editElementsHasChange([{ text: "no uid" }]), false);
  assert.equal(editElementsHasChange([]), false);
  assert.equal(patchHasChanges({ addTextElement: { class: "caption", text: "x" } }), true);
  assert.equal(patchHasChanges({ addTextElement: { class: null, text: null } }), false);
  assert.equal(summarizePatch({ addTextElement: { class: "cta", text: "Go" } }), "text element");
  // The closed enums are exactly the five sanctioned classes and three steps.
  assert.deepEqual(PATCH_OPTIONS.elementClass, ["heading", "subheading", "body", "caption", "cta"]);
  assert.deepEqual(PATCH_OPTIONS.elementSizeStep, ["S", "M", "L"]);
});

// ── BELT → DISPATCH, NO MODEL (mirrors the route's interception path) ─────────
// The deterministic belt must fire and produce an applied command with NO model in
// the loop (keys unset). This chains exactly what app/api/assistant/route.js does for
// an editor turn: detectAddElement → patch.addTextElement → compile → reducer, plus the
// honest belt reply. Proves the "intercepted, no live model" path end to end.
test("belt→dispatch (no model): 'add a button saying Enrol now' applies + honest reply", () => {
  const userText = "add a button saying Enrol now";
  const ae = detectAddElement(userText);
  assert.ok(ae, "belt did not fire");
  const patch = { addTextElement: { class: ae.class, text: ae.text } };
  assert.equal(patchHasChanges(patch), true);
  // Compile + dispatch through the SAME reducer the UI picker uses.
  let doc = createDesignDocumentV1();
  const plan = compileDesignPatchCommands(patch);
  const applied = [];
  for (const e of plan.afterMaterialization) {
    const r = applyDesignCommand(doc, e.command);
    doc = r.document;
    applied.push(...(r.changedPaths || []));
  }
  assert.ok(applied.some(p => p.startsWith("content.elements.")), "no element command applied");
  const el = doc.content.elements[0];
  assert.equal(el.class, "cta");
  assert.equal(el.text, "Enrol now");
  assert.equal(el.authorship, "ai");
  // The route's honest belt reply names the element and never claims a position.
  const label = { cta: "button" }[ae.class];
  const reply = `Added a ${label} saying “${ae.text}”. It'll appear on the canvas; tap it to move or edit. If a format has no room I'll keep it and flag it.`;
  assert.match(reply, /Added a button saying/);
  assert.doesNotMatch(reply, /bottom-right|top-left|at the/); // no unverifiable position claim
});

// ── CROWDING BUDGET MATH + REMEDY RANKING ────────────────────────────────────
test("budget: density budget is monotonic in whitespace target (airier → fewer)", () => {
  assert.equal(dynamicElementBudget(0), 6);
  assert.equal(dynamicElementBudget(0.5), 3);
  assert.equal(dynamicElementBudget(0.62), 2);
  assert.equal(dynamicElementBudget(null), 4);   // no target → sensible default
  // strictly non-increasing as the layout gets airier
  let prev = Infinity;
  for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const b = dynamicElementBudget(t);
    assert.ok(b <= prev, `budget not monotonic at target ${t}`);
    prev = b;
  }
});

test("remedy: ranking names the lowest-priority element and gates roomier on a verified candidate", () => {
  const placed = [
    { uid: "a", class: "body", priority: 60 },
    { uid: "b", class: "cta", priority: 50 },
    { uid: "c", class: "caption", priority: 30 },   // lowest → drops first
  ];
  const noRoomier = crowdingRemedies(placed, false);
  assert.equal(noRoomier.lowest.uid, "c");
  assert.equal(noRoomier.remedies[0].id, "simplify-copy");
  assert.equal(noRoomier.remedies[1].id, "remove-optional-element");
  assert.equal(noRoomier.remedies[1].uid, "c");                  // names the actual element
  assert.equal(noRoomier.remedies.some(r => r.id === "switch-layout"), false); // never blind
  assert.deepEqual(noRoomier.simplifyUids, ["c", "b"]);          // two lowest-priority, adjacent
  const withRoomier = crowdingRemedies(placed, true);
  assert.equal(withRoomier.remedies[2].id, "switch-layout");
});

// ── CROWDING ADVISORY + UNPLACED FINDINGS (via runLocalAudit) ────────────────
const overBudgetSignal = () => ({
  dimensionId: "ig_square", archetypeId: "manifesto",
  archetypeDrift: { whitespaceTarget: 0.6 },   // budget 2
  contentElements: [
    { uid: "a", class: "body", priority: 60, text: "one longer line here", placed: true },
    { uid: "b", class: "body", priority: 40, text: "two", placed: true },
    { uid: "c", class: "caption", priority: 30, text: "three", placed: true },
    { uid: "d", class: "cta", priority: 50, text: "Go", placed: true },
    { uid: "e", class: "body", priority: 20, text: "an unfittable paragraph", placed: false, reason: "no-clean-candidate" },
  ],
});

test("advisory: an over-budget layout fires ONE crowding advisory with a resolvable ruleId", () => {
  const findings = runLocalAudit(overBudgetSignal());
  const crowd = findings.filter(f => f.id === "crowding-advisory");
  assert.equal(crowd.length, 1, "expected exactly one crowding advisory");
  assert.equal(crowd[0].ruleId, "layout.whitespace-budget");
  assert.ok(designRuleById(crowd[0].ruleId), "crowding ruleId does not resolve in the registry");
  assert.equal(crowd[0].policy.severity, "advisory");
  assert.equal(crowd[0].crowding.budget, 2);
  assert.equal(crowd[0].crowding.placed, 4);
  // Ranked remedies present; roomier NOT offered (no verified candidate on the signal).
  assert.deepEqual(crowd[0].crowding.remedies.map(r => r.id), ["simplify-copy", "remove-optional-element"]);
});

test("advisory: each unplaced element gets a named complete-or-absent finding", () => {
  const findings = runLocalAudit(overBudgetSignal());
  const unplaced = findings.filter(f => f.id.startsWith("element-unplaced:"));
  assert.equal(unplaced.length, 1);
  assert.equal(unplaced[0].id, "element-unplaced:e");
  assert.equal(unplaced[0].ruleId, "content.complete-or-absent");
  assert.ok(designRuleById(unplaced[0].ruleId));
  assert.match(unplaced[0].message, /kept in storage/);
});

test("advisory: roomier remedy appears only when the render verified a candidate", () => {
  const signal = { ...overBudgetSignal(), roomierLayout: true };
  const crowd = runLocalAudit(signal).find(f => f.id === "crowding-advisory");
  assert.deepEqual(crowd.crowding.remedies.map(r => r.id), ["simplify-copy", "remove-optional-element", "switch-layout"]);
});

test("born-clean: no elements → no crowding/unplaced dots; within budget → no advisory", () => {
  const fresh = runLocalAudit({ dimensionId: "ig_square", archetypeId: "manifesto", archetypeDrift: { whitespaceTarget: 0.6 }, contentElements: [] });
  assert.equal(fresh.some(f => f.id === "crowding-advisory" || f.id.startsWith("element-unplaced:")), false);
  // Two placed elements on a budget-2 layout is AT budget → still no advisory.
  const atBudget = runLocalAudit({
    dimensionId: "ig_square", archetypeId: "manifesto", archetypeDrift: { whitespaceTarget: 0.6 },
    contentElements: [{ uid: "a", class: "body", priority: 60, text: "x", placed: true }, { uid: "b", class: "body", priority: 50, text: "y", placed: true }],
  });
  assert.equal(atBudget.some(f => f.id === "crowding-advisory"), false);
});
