/**
 * CONTRACT GUARD BATTERY — Checker A: registry self-consistency.
 *
 * Guards lib/design-layer-contract.mjs against internal drift: rule IDs, enum
 * membership, blocker remedies, the Z-band ladder (doc §8), legacy alias
 * round-trips (§3.2), and role/mode validity. These are pure structural
 * invariants — if any fails, the contract itself is inconsistent before a single
 * pixel is rendered. See docs/design-layer-contract.md §23.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIGN_RULES,
  DESIGN_LAYER_TYPES,
  RULE_SEVERITIES,
  RULE_ENFORCEMENTS,
  SHAPE_ROLES,
  SHAPE_RENDER_MODES,
  Z_BANDS,
  designRuleById,
  designRuleIdForFinding,
  isShapeRole,
  isStructuralShapeRole,
  isMediaHostShape,
  legacyShapeModeToRenderMode,
  renderModeToLegacyShapeMode,
  normalizeShapeLayerContract,
} from "../../lib/design-layer-contract.mjs";

const LAYER_TYPE_SET = new Set(Object.values(DESIGN_LAYER_TYPES));
const SEVERITY_SET = new Set(Object.values(RULE_SEVERITIES));
const ENFORCEMENT_SET = new Set(Object.values(RULE_ENFORCEMENTS));
const RENDER_MODE_SET = new Set(Object.values(SHAPE_RENDER_MODES));
const SOURCE_SET = new Set(["system", "platform", "brand-profile"]);
// A stable rule ID is a lowercase, dotted, hyphen-safe path with ≥2 segments
// (family.name). This is the join key shared with preflight, findings, approvals
// and analytics — its shape must never drift.
const RULE_ID_FORMAT = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;

test("registry: rule IDs are unique, stable-format, and self-resolving", () => {
  const ids = DESIGN_RULES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate rule id");
  for (const r of DESIGN_RULES) {
    assert.match(r.id, RULE_ID_FORMAT, `rule id not stable-format: ${r.id}`);
    assert.equal(designRuleById(r.id), r, `designRuleById round-trip failed: ${r.id}`);
    assert.ok(Object.isFrozen(r), `rule not frozen: ${r.id}`);
    assert.ok(Object.isFrozen(r.remedies), `remedies not frozen: ${r.id}`);
  }
});

test("registry: every rule's severity/enforcement/source/layers come from the frozen enums", () => {
  for (const r of DESIGN_RULES) {
    assert.ok(SEVERITY_SET.has(r.severity), `${r.id}: bad severity ${r.severity}`);
    assert.ok(ENFORCEMENT_SET.has(r.enforcement), `${r.id}: bad enforcement ${r.enforcement}`);
    assert.ok(SOURCE_SET.has(r.source), `${r.id}: bad source ${r.source}`);
    assert.ok(typeof r.kind === "string" && r.kind.length > 0, `${r.id}: empty kind`);
    assert.ok(Array.isArray(r.layers) && r.layers.length > 0, `${r.id}: no layers`);
    for (const layer of r.layers) {
      assert.ok(LAYER_TYPE_SET.has(layer), `${r.id}: layer not a DESIGN_LAYER_TYPE: ${layer}`);
    }
  }
});

test("registry: every blocking rule declares at least one executable remedy", () => {
  for (const r of DESIGN_RULES) {
    if (r.severity === RULE_SEVERITIES.BLOCKING) {
      assert.ok(r.remedies.length >= 1, `blocking rule ${r.id} has no remedy`);
    }
  }
});

test("registry: Z_BANDS is strictly increasing and complete against doc §8", () => {
  // Doc §8 bands: 0 background · 10 media · 20 structural media · 30 structural
  // underlay · 40 content/typography · 50 brand/legal · 60 structural overlay ·
  // 70 decoration · 80 editor chrome.
  const EXPECTED = [0, 10, 20, 30, 40, 50, 60, 70, 80];
  const values = Object.values(Z_BANDS);
  const sorted = [...values].sort((a, b) => a - b);
  assert.deepEqual(sorted, EXPECTED, "Z_BANDS values do not match doc §8 ladder");
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i] > sorted[i - 1], "Z_BANDS not strictly increasing");
  }
  assert.ok(Object.isFrozen(Z_BANDS));
});

test("registry: legacy shape-mode aliases round-trip exactly (overlay↔fill, lineart↔line-art)", () => {
  // Legacy wire values map onto canonical render modes.
  assert.equal(legacyShapeModeToRenderMode("overlay"), SHAPE_RENDER_MODES.FILL);
  assert.equal(legacyShapeModeToRenderMode("lineart"), SHAPE_RENDER_MODES.LINE_ART);
  // Canonical values are accepted too.
  assert.equal(legacyShapeModeToRenderMode("fill"), SHAPE_RENDER_MODES.FILL);
  assert.equal(legacyShapeModeToRenderMode("line-art"), SHAPE_RENDER_MODES.LINE_ART);
  assert.equal(legacyShapeModeToRenderMode("outline"), SHAPE_RENDER_MODES.OUTLINE);
  assert.equal(legacyShapeModeToRenderMode("frame"), SHAPE_RENDER_MODES.FRAME);
  // Reverse produces the legacy wire value the renderer still reads.
  assert.equal(renderModeToLegacyShapeMode(SHAPE_RENDER_MODES.FILL), "overlay");
  assert.equal(renderModeToLegacyShapeMode(SHAPE_RENDER_MODES.LINE_ART), "lineart");
  assert.equal(renderModeToLegacyShapeMode(SHAPE_RENDER_MODES.OUTLINE), "outline");
  assert.equal(renderModeToLegacyShapeMode(SHAPE_RENDER_MODES.FRAME), "frame");
  // Full canonical round-trip identity for every render mode.
  for (const mode of RENDER_MODE_SET) {
    assert.equal(legacyShapeModeToRenderMode(renderModeToLegacyShapeMode(mode)), mode,
      `render mode did not survive legacy round-trip: ${mode}`);
  }
});

test("registry: unknown values fail loudly rather than silently coercing to a valid one", () => {
  // Lookups return null/false for unknowns — the caller is forced to handle the
  // miss, never handed a plausible-looking default.
  assert.equal(designRuleById("does.not.exist"), null);
  assert.equal(designRuleIdForFinding({ id: "totally-unknown-xyz" }), null);
  assert.equal(isShapeRole("bogus-role"), false);
  assert.equal(isStructuralShapeRole("bogus-role"), false);
  // The explicit-renderMode acceptance path is strict: a bogus renderMode is NOT
  // passed through — normalization re-derives from the legacy mode, so the output
  // renderMode is always a real member of the enum.
  const bogus = normalizeShapeLayerContract({ renderMode: "nonsense", mode: "overlay" });
  assert.equal(bogus.renderMode, SHAPE_RENDER_MODES.FILL);
  assert.ok(RENDER_MODE_SET.has(bogus.renderMode));
  // Documented, intentional legacy default (NOT a coercion bug): an absent/unknown
  // *legacy mode* means "paint as a frame" — the pre-DLC renderer behavior. Frozen
  // here so the default is changed deliberately, never by accident.
  assert.equal(legacyShapeModeToRenderMode(undefined), SHAPE_RENDER_MODES.FRAME);
  assert.equal(legacyShapeModeToRenderMode("who-knows"), SHAPE_RENDER_MODES.FRAME);
});

test("registry: structural roles reject nonsensical render modes (§3.2 media-host validity)", () => {
  // The only valid media host is an image frame/mask painted in frame mode.
  assert.equal(isMediaHostShape({ uid: "a", role: SHAPE_ROLES.IMAGE_FRAME, mode: "frame" }), true);
  assert.equal(isMediaHostShape({ uid: "b", role: SHAPE_ROLES.IMAGE_MASK, mode: "frame" }), true);
  // image-frame declared but painted in a non-frame mode is a nonsensical combo:
  // it is rejected as a host (never silently paints media through an outline/fill).
  assert.equal(isMediaHostShape({ uid: "c", role: SHAPE_ROLES.IMAGE_FRAME, mode: "outline" }), false);
  assert.equal(isMediaHostShape({ uid: "d", role: SHAPE_ROLES.IMAGE_FRAME, mode: "overlay" }), false);
  // A structural non-media role never hosts media, even in frame mode.
  assert.equal(isMediaHostShape({ uid: "e", role: SHAPE_ROLES.CONTENT_PANEL, mode: "frame" }), false);
  assert.equal(isMediaHostShape({ uid: "f", role: SHAPE_ROLES.STRUCTURAL_OVERLAY, mode: "frame" }), false);
  // Explicit role transition: a frame-mode shape declared content-panel keeps its
  // declared role (explicit role wins over frame inference) and stays structural.
  const panel = normalizeShapeLayerContract({ role: SHAPE_ROLES.CONTENT_PANEL, mode: "frame" });
  assert.equal(panel.role, SHAPE_ROLES.CONTENT_PANEL);
  assert.equal(panel.structural, true);
  assert.equal(isMediaHostShape(panel), false);
});
