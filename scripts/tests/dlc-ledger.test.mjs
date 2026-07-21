/**
 * CONTRACT GUARD BATTERY — Checker C: ledger invariants (DLC-2 stamping).
 *
 * DLC-2 stamps every canonically-normalized finding with a contract ruleId plus
 * policy severity/enforcement/remedy metadata. This guards the "one voice"
 * ledger contract (law 1 / advice-ledger-spec): the fields the ledger UI reads
 * stay stable, blocking findings always carry remedies, and severity/enforcement
 * metadata stays consistent with the registry. It also freezes the current
 * DLC-2 COVERAGE BOUNDARY so a new finding class cannot silently ship without a
 * ruleId. See docs/design-layer-contract.md §23.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { runLocalAudit, normalizeFinding } from "../../lib/audit-local.js";
import { designRuleById } from "../../lib/design-layer-contract.mjs";

// A representative signal that fires the contract-mapped finding classes: photo
// contrast, floored type, dropped content, logo collisions, safe-zone, italic
// register, pinned illegible logo. Deliberately carries NO archetypeDrift, so the
// findings here are exactly the classes DLC-2 has mapped.
const mappedSignal = () => ({
  dimensionId: "story",
  hasMedia: true, hasText: true,
  zoneContrast: { mean: 2.1, min: 1.6, flat: false },
  flooredRoles: [{ label: "Headline" }],
  dropped: [{ role: "subtext" }],
  copy: { headline: "*One* thing", subtext: "*Two* and *three*", attribution: "", dateText: "" },
  logo: { explicit: true, overlapsText: true, inFocalBand: true, inActionBand: true, illegible: true, pinned: true },
  safeZoneViolation: true,
});

// runLocalAudit's ONLY findings without a contract ruleId today are the archetype
// drift ADVISORIES (runArchetypeDrift) — art-direction guidance, not cross-layer
// rules. This allowlist is the DLC-2 coverage boundary: when DLC-2 maps them, this
// set shrinks DELIBERATELY. A NEW unmapped finding class must fail the guard.
const KNOWN_UNMAPPED_ADVISORY_IDS = new Set([
  "archetype-hero-ratio",
  "archetype-center-hero",
  "archetype-warmth-stack",
  "archetype-pastel-clash",
  "archetype-whitespace",
]);

// The fields the ledger UI + harmonizer consume — the "one voice" surface. Snapshot
// so a rename/drop is caught (these are read by the advice ledger and readiness).
const REQUIRED_CONSUMER_FIELDS = [
  "id", "key", "category", "severity", "message",
  "format", "dimensionId", "elementId", "anchor",
  "fingerprint", "geometryFingerprint", "propertyFingerprint",
  "proposedFix", "fix", "sources", "ruleId", "policy", "actions",
];

test("ledger: every mapped finding carries a ruleId that resolves in the registry", () => {
  const findings = runLocalAudit(mappedSignal());
  assert.ok(findings.length >= 6, `expected several findings, got ${findings.length}`);
  for (const f of findings) {
    assert.ok(f.ruleId, `finding ${f.id} has no ruleId`);
    assert.ok(designRuleById(f.ruleId), `finding ${f.id} ruleId does not resolve: ${f.ruleId}`);
    assert.ok(f.policy, `finding ${f.id} carries no policy metadata`);
  }
});

test("ledger: policy severity/enforcement/remedies stay consistent with the registry", () => {
  const findings = runLocalAudit(mappedSignal());
  for (const f of findings) {
    const rule = designRuleById(f.ruleId);
    assert.equal(f.policy.severity, rule.severity, `${f.id}: policy.severity != registry`);
    assert.equal(f.policy.enforcement, rule.enforcement, `${f.id}: policy.enforcement != registry`);
    assert.deepEqual(f.policy.remedies, [...rule.remedies], `${f.id}: policy.remedies != registry`);
    assert.equal(f.policy.source, rule.source, `${f.id}: policy.source != registry`);
  }
});

test("ledger: no blocking-classified finding lacks remedies metadata", () => {
  const findings = runLocalAudit(mappedSignal());
  const blockers = findings.filter(f => f.policy && f.policy.severity === "blocking");
  assert.ok(blockers.length >= 1, "expected at least one blocking finding in the sample");
  for (const f of blockers) {
    assert.ok(Array.isArray(f.policy.remedies) && f.policy.remedies.length >= 1,
      `blocking finding ${f.id} has no remedies`);
  }
});

test("ledger: normalizeFinding output shape is unchanged for consumers (one voice)", () => {
  const findings = runLocalAudit(mappedSignal());
  for (const f of findings) {
    for (const field of REQUIRED_CONSUMER_FIELDS) {
      assert.ok(field in f, `finding ${f.id} missing consumer field: ${field}`);
    }
    // anchor is the ledger's dedup/render key — assert its stable inner shape.
    assert.ok(f.anchor && typeof f.anchor === "object");
    for (const k of ["element", "dimensionId", "fingerprint"]) {
      assert.ok(k in f.anchor, `finding ${f.id} anchor missing: ${k}`);
    }
    // actions is always an array (empty when there is no one-tap fix).
    assert.ok(Array.isArray(f.actions));
  }
  // A finding with an explicit contract ruleId flows straight through normalizeFinding.
  const direct = normalizeFinding(
    { id: "contrast-fail", category: "contrast", severity: "fail", message: "x", ruleId: "typography.surface-contrast" },
    { source: "local" },
  );
  assert.equal(direct.ruleId, "typography.surface-contrast");
  assert.equal(direct.policy.severity, "blocking");
});

test("ledger: DLC-2 coverage boundary — only known advisories may lack a ruleId", () => {
  // Sweep both the mapped signal and an archetype-drift-only signal. Every finding
  // must EITHER resolve to a contract rule OR be a known, allowlisted advisory. A
  // brand-new finding class shipping without a ruleId trips this guard.
  const driftSignal = {
    dimensionId: "ig_square", archetypeId: "manifesto",
    archetypeDrift: { heroSupportRatio: 0.1, heroFloor: 3, centroidY: 0.92, warmthStack: 2, pastelClash: true, whitespace: 0.04 },
  };
  const all = [...runLocalAudit(mappedSignal()), ...runLocalAudit(driftSignal)];
  for (const f of all) {
    const resolved = !!(f.ruleId && designRuleById(f.ruleId));
    assert.ok(resolved || KNOWN_UNMAPPED_ADVISORY_IDS.has(f.id),
      `finding ${f.id} neither resolves to a rule nor is a known advisory — DLC-2 coverage drifted`);
    // A finding without a ruleId must also carry no policy (no half-stamped state).
    if (!resolved) assert.equal(f.policy, null, `unmapped finding ${f.id} has stray policy metadata`);
  }
});
