import test from "node:test";
import assert from "node:assert/strict";
import {
  HIERARCHY_RULE_ID,
  TEXT_CLASS_RANK,
  classRank,
  hierarchyHolds,
  hierarchyInversions,
  visualWeight,
} from "../../lib/text-hierarchy.mjs";
import { designRuleById } from "../../lib/design-layer-contract.mjs";
import { runLocalAudit, computeReadyVerdict } from "../../lib/audit-local.js";

const hero = (px, extra = {}) => ({ id: "text:hero", class: "heading", px, weight: 400, ...extra });
const support = (px, extra = {}) => ({ id: "text:support", class: "subheading", px, weight: 400, ...extra });
const body = (px, extra = {}) => ({ id: "element:el_body_0", class: "body", px, weight: 400, ...extra });

test("the class ranking is the declared hierarchy order (heading leads)", () => {
  assert.equal(classRank("heading"), 1);
  assert.ok(classRank("heading") < classRank("subheading"));
  assert.ok(classRank("subheading") < classRank("body"));
  assert.ok(classRank("body") < classRank("caption"));
  // cta chrome sits OUTSIDE the reading ranking — a pill is not a voice.
  assert.equal(classRank("cta"), null);
  assert.equal(Object.keys(TEXT_CLASS_RANK).length, 4);
});

test("a correctly ranked design holds the law (born-clean: no advisory)", () => {
  assert.ok(hierarchyHolds([hero(54), support(38), body(30)]));
  assert.deepEqual(hierarchyInversions([hero(54), support(38), body(30)]), []);
});

test("a body pinned LARGER than the heading is an inversion", () => {
  const inversions = hierarchyInversions([hero(34), support(30), body(60, { pinned: true })]);
  assert.ok(inversions.length >= 1);
  // The heading IS out-shouted…
  assert.ok(inversions.some(i => i.higher.class === "heading" && i.lower.class === "body"));
  // …and the WORST-ratio pair leads, so the advisory names the most visible violation.
  const worst = inversions[0];
  assert.equal(worst.lower.class, "body");
  assert.equal(worst.lower.pinned, true);
  assert.ok(worst.ratio >= Math.max(...inversions.map(i => i.ratio)));
});

test("a hair's difference is not an inversion (2% tie band)", () => {
  assert.ok(hierarchyHolds([hero(40), support(40.4)]));
  assert.equal(hierarchyInversions([hero(40), support(41.5)]).length, 1);
});

test("five body lines are ONE pair — the loudest of them against the heading", () => {
  const entries = [hero(60), body(70, { id: "element:a" }), body(20, { id: "element:b" }), body(20, { id: "element:c" })];
  const inversions = hierarchyInversions(entries);
  assert.equal(inversions.length, 1);
  assert.equal(inversions[0].lower.id, "element:a");
});

test("a subheading pinned UNDER a body is caught even when another subheading is loud", () => {
  // The law is "every heading out-ranks every body": the QUIETEST higher-ranked text is
  // what a lower-ranked one has to beat. A loud legacy support line must not mask a
  // subheading element the owner pinned smaller than a body element.
  const entries = [
    hero(125),
    support(82, { id: "text:support" }),
    support(30, { id: "element:el_subheading_2", pinned: true }),
    body(41, { id: "element:el_body_3", pinned: true }),
  ];
  const inversions = hierarchyInversions(entries);
  assert.equal(inversions.length, 1);
  assert.equal(inversions[0].higher.id, "element:el_subheading_2");
  assert.equal(inversions[0].lower.id, "element:el_body_3");
});

test("weight breaks a size tie but can never outvote a real size gap", () => {
  assert.ok(visualWeight({ px: 40, weight: 700 }) > visualWeight({ px: 40, weight: 400 }));
  assert.ok(visualWeight({ px: 54, weight: 400 }) > visualWeight({ px: 40, weight: 900 }));
});

test("fewer than two voices can never invert anything; junk never throws", () => {
  assert.deepEqual(hierarchyInversions([hero(54)]), []);
  assert.deepEqual(hierarchyInversions([]), []);
  assert.deepEqual(hierarchyInversions(null), []);
  assert.deepEqual(hierarchyInversions([null, { class: "nope", px: 99 }, hero(20)]), []);
});

test("the hierarchy rule is registered in the contract (checker A/C join key)", () => {
  const rule = designRuleById(HIERARCHY_RULE_ID);
  assert.ok(rule, "typography.hierarchy-inverted is not registered");
  assert.equal(rule.severity, "advisory");
  assert.ok(rule.remedies.length >= 1);
});

test("the audit raises ONE advisory naming the inversion, with a resolving ruleId", () => {
  const findings = runLocalAudit({
    dimensionId: "ig_portrait",
    textHierarchy: [hero(34), support(30), body(60, { pinned: true })],
  });
  const raised = findings.filter(f => f.ruleId === HIERARCHY_RULE_ID);
  assert.equal(raised.length, 1, "expected exactly one hierarchy advisory (one voice)");
  assert.equal(raised[0].severity, "info");
  assert.match(raised[0].message, /body text/);
  assert.match(raised[0].message, /subheading/);
  assert.equal(raised[0].hierarchy.lower.class, "body");
  assert.equal(raised[0].hierarchy.higher.class, "subheading");   // the worst-ratio pair
  assert.equal(raised[0].policy.severity, "advisory");
  assert.deepEqual(raised[0].policy.remedies, [...designRuleById(HIERARCHY_RULE_ID).remedies]);
});

test("a correctly ranked render raises NO hierarchy finding (born-clean)", () => {
  const findings = runLocalAudit({ dimensionId: "ig_portrait", textHierarchy: [hero(54), support(38), body(30)] });
  assert.equal(findings.filter(f => f.ruleId === HIERARCHY_RULE_ID).length, 0);
  // …and a signal that carries no hierarchy truth at all is silent too.
  assert.equal(runLocalAudit({ dimensionId: "ig_portrait" }).filter(f => f.ruleId === HIERARCHY_RULE_ID).length, 0);
});

test("the advisory reaches the READINESS ledger without blocking publish (one voice)", () => {
  const verdict = computeReadyVerdict({
    dimensionId: "ig_portrait",
    textHierarchy: [hero(34), support(30), body(60, { pinned: true })],
  }, "ig_portrait");
  const row = verdict.issues.find(i => i.ruleId === HIERARCHY_RULE_ID);
  assert.ok(row, "the hierarchy advisory never reached the ledger");
  assert.equal(row.severity, "info");
  assert.equal(verdict.ready, true, "an advisory must never block publish");
  assert.equal(verdict.policyState.blockers.length, 0);
});

test("a ranked design keeps the ledger empty (born-clean through the readiness path)", () => {
  const verdict = computeReadyVerdict({ dimensionId: "ig_portrait", textHierarchy: [hero(54), support(38), body(30)] }, "ig_portrait");
  assert.equal(verdict.issues.filter(i => i.ruleId === HIERARCHY_RULE_ID).length, 0);
  assert.equal(verdict.ready, true);
});
