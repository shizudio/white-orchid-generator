import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIGN_LAYER_CONTRACT_VERSION,
  DESIGN_RULES,
  LAYER_OWNERS,
  RULE_SEVERITIES,
  SHAPE_RENDER_MODES,
  SHAPE_LAYER_GROUPS,
  SHAPE_ROLES,
  Z_BANDS,
  designRuleById,
  designRuleIdForFinding,
  explicitMediaHostShapeId,
  isMediaHostShape,
  legacyShapeModeToRenderMode,
  normalizeShapeLayerContract,
  resolveMediaHostShapeId,
  shapeLayerGroup,
  shapeRoleLabel,
} from "../../lib/design-layer-contract.mjs";
import {
  applyDesignCommand,
  createDesignDocumentV1,
  DESIGN_COMMAND_TYPES,
  validateDesignDocument,
} from "../../lib/design-document.mjs";

test("the executable contract has unique stable rule ids and actionable blockers", () => {
  assert.equal(DESIGN_LAYER_CONTRACT_VERSION, 1);
  assert.equal(new Set(DESIGN_RULES.map(rule => rule.id)).size, DESIGN_RULES.length);
  for (const rule of DESIGN_RULES) {
    assert.equal(designRuleById(rule.id), rule);
    if (rule.severity === RULE_SEVERITIES.BLOCKING) {
      assert.ok(rule.remedies.length > 0, `${rule.id} needs an executable remedy`);
    }
  }
  assert.equal(designRuleById("missing.rule"), null);
  assert.equal(designRuleIdForFinding({id:"logo-overlap-text"}), "logo.no-text-overlap");
  assert.equal(designRuleIdForFinding({id:"future-safe-area-rule"}), "format.platform-occlusion");
});

test("legacy rendering modes gain semantic roles without breaking renderer aliases", () => {
  const frame = normalizeShapeLayerContract({ mode:"frame", origin:"layout" });
  assert.equal(frame.renderMode, SHAPE_RENDER_MODES.FRAME);
  assert.equal(frame.mode, "frame");
  assert.equal(frame.role, SHAPE_ROLES.IMAGE_FRAME);
  assert.equal(frame.owner, LAYER_OWNERS.LAYOUT);
  assert.equal(frame.structural, true);
  assert.equal(frame.zBand, Z_BANDS.STRUCTURAL_MEDIA);

  const fill = normalizeShapeLayerContract({ mode:"overlay" });
  assert.equal(fill.renderMode, SHAPE_RENDER_MODES.FILL);
  assert.equal(fill.mode, "overlay");
  assert.equal(fill.role, SHAPE_ROLES.DECORATIVE_OVERLAY);
  assert.equal(fill.structural, false);
  assert.equal(fill.zBand, Z_BANDS.DECORATION);

  assert.equal(legacyShapeModeToRenderMode("lineart"), SHAPE_RENDER_MODES.LINE_ART);
  assert.equal(shapeLayerGroup(frame), SHAPE_LAYER_GROUPS.STRUCTURE);
  assert.equal(shapeLayerGroup(fill), SHAPE_LAYER_GROUPS.DECORATION);
  assert.equal(shapeRoleLabel(frame), "Image frame");
});

test("explicit structural roles are independent from rendering mode", () => {
  const panel = normalizeShapeLayerContract({
    mode:"overlay",
    role:SHAPE_ROLES.CONTENT_PANEL,
    owner:LAYER_OWNERS.LAYOUT,
  });
  assert.equal(panel.renderMode, SHAPE_RENDER_MODES.FILL);
  assert.equal(panel.role, SHAPE_ROLES.CONTENT_PANEL);
  assert.equal(panel.structural, true);
  assert.equal(panel.zBand, Z_BANDS.STRUCTURAL_UNDERLAY);
  assert.equal(isMediaHostShape(panel), false);
});

test("media host is explicit and legacy fallback preserves newest-frame output", () => {
  const shapes = [
    normalizeShapeLayerContract({ uid:"frame-a", mode:"frame" }),
    normalizeShapeLayerContract({ uid:"decor", mode:"outline" }),
    normalizeShapeLayerContract({ uid:"frame-b", mode:"frame" }),
  ];
  assert.equal(resolveMediaHostShapeId(shapes), "frame-b");
  assert.equal(resolveMediaHostShapeId(shapes, "frame-a"), "frame-a");
  assert.equal(resolveMediaHostShapeId(shapes, "missing"), "frame-b");
  assert.equal(explicitMediaHostShapeId(shapes, "frame-a"), "frame-a");
  assert.equal(explicitMediaHostShapeId([...shapes].reverse(), "frame-a"), "frame-a");
  assert.equal(explicitMediaHostShapeId(shapes, "missing"), null);
  assert.equal(explicitMediaHostShapeId(shapes), null);
});

test("DesignDocumentV1 normalizes shape contracts and seeds an explicit media host", () => {
  const document = createDesignDocumentV1({
    overlayLayers:[
      { uid:"frame-a", assetId:"petal", mode:"frame", origin:"layout" },
      { uid:"decor", assetId:"spark", mode:"overlay" },
    ],
  });
  assert.equal(document.layerContractVersion, DESIGN_LAYER_CONTRACT_VERSION);
  assert.equal(document.shapes[0].role, SHAPE_ROLES.IMAGE_FRAME);
  assert.equal(document.shapes[1].role, SHAPE_ROLES.DECORATIVE_OVERLAY);
  assert.equal(document.composition.mediaHostShapeId, "frame-a");
  assert.equal(validateDesignDocument(document).valid, true);
});

test("shape commands maintain the media-host relationship atomically", () => {
  const start = createDesignDocumentV1({
    overlayLayers:[{ uid:"frame-a", assetId:"petal", mode:"frame" }],
  });
  const added = applyDesignCommand(start, {
    type:DESIGN_COMMAND_TYPES.SHAPE_ADD,
    shape:{ uid:"frame-b", assetId:"oval", mode:"frame" },
  });
  assert.equal(added.document.composition.mediaHostShapeId, "frame-b");
  assert.deepEqual(added.changedPaths, ["shapes.frame-b", "composition.mediaHostShapeId"]);

  const removed = applyDesignCommand(added.document, {
    type:DESIGN_COMMAND_TYPES.SHAPE_REMOVE,
    uid:"frame-b",
  });
  assert.equal(removed.document.composition.mediaHostShapeId, "frame-a");

  const decorated = applyDesignCommand(removed.document, {
    type:DESIGN_COMMAND_TYPES.SHAPE_UPDATE,
    uid:"frame-a",
    patch:{ mode:"outline" },
  });
  assert.equal(decorated.document.composition.mediaHostShapeId, null);
  const restored = applyDesignCommand(decorated.document, {
    type:DESIGN_COMMAND_TYPES.SHAPE_SET_MEDIA_HOST,
    uid:"frame-a",
  });
  assert.equal(restored.document.shapes[0].role, SHAPE_ROLES.IMAGE_FRAME);
  assert.equal(restored.document.shapes[0].mode, "frame");
  assert.equal(restored.document.composition.mediaHostShapeId, "frame-a");
  assert.deepEqual(restored.changedPaths, ["shapes.frame-a", "composition.mediaHostShapeId"]);

  const rejected = applyDesignCommand(removed.document, {
    type:DESIGN_COMMAND_TYPES.COMPOSITION_SET,
    field:"mediaHostShapeId",
    value:"missing",
  });
  assert.deepEqual(rejected.document, removed.document);
  assert.deepEqual(rejected.changedPaths, []);
});
