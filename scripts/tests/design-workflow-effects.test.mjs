import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIGN_WORKFLOW_EFFECT_TYPES as EFFECT,
  getDesignWorkflowEffectError,
  isDesignWorkflowEffect,
} from "../../lib/design-workflow-effects.mjs";

test("every declared workflow effect type has an executable schema", () => {
  const examples = {
    [EFFECT.SELECT_LOGO_TAB]:{type:EFFECT.SELECT_LOGO_TAB,value:"primary"},
    [EFFECT.SELECT_DIMENSION]:{type:EFFECT.SELECT_DIMENSION,value:"ig_portrait"},
    [EFFECT.SELECT_EXPORT_FORMAT]:{type:EFFECT.SELECT_EXPORT_FORMAT,value:"png"},
    [EFFECT.CLEAR_SHAPE_SELECTION]:{type:EFFECT.CLEAR_SHAPE_SELECTION},
    [EFFECT.CLEAR_SHAPE_SELECTION_IF]:{type:EFFECT.CLEAR_SHAPE_SELECTION_IF,uid:"shape-a"},
    [EFFECT.CLEAR_PHOTO_SELECTION]:{type:EFFECT.CLEAR_PHOTO_SELECTION},
    [EFFECT.CLEAR_EDITOR_SELECTION]:{type:EFFECT.CLEAR_EDITOR_SELECTION},
    [EFFECT.SET_ACKNOWLEDGEMENTS]:{type:EFFECT.SET_ACKNOWLEDGEMENTS,value:{}},
    [EFFECT.SET_OVERLAY_CLEAN]:{type:EFFECT.SET_OVERLAY_CLEAN},
    [EFFECT.SET_OVERLAY_DIRTY]:{type:EFFECT.SET_OVERLAY_DIRTY},
    [EFFECT.SELECT_SHAPE]:{type:EFFECT.SELECT_SHAPE,uid:"shape-a"},
    [EFFECT.REMOVE_VIDEO]:{type:EFFECT.REMOVE_VIDEO},
    [EFFECT.CLEAR_DECODED_IMAGE]:{type:EFFECT.CLEAR_DECODED_IMAGE},
    [EFFECT.DECODE_IMAGE]:{type:EFFECT.DECODE_IMAGE,source:"data:image/png;base64,example"},
  };

  assert.deepEqual(Object.keys(examples).sort(),Object.values(EFFECT).sort());
  for (const effect of Object.values(examples)) assert.equal(isDesignWorkflowEffect(effect),true);
});

test("effect schemas reject invalid payloads deterministically", () => {
  assert.equal(getDesignWorkflowEffectError(null),"effect must be an object");
  assert.equal(getDesignWorkflowEffectError({type:EFFECT.SELECT_LOGO_TAB,value:"overlays"}),"logo tab must be primary or secondary");
  assert.equal(getDesignWorkflowEffectError({type:EFFECT.DECODE_IMAGE,source:""}),"image source must be a non-empty string");
  assert.equal(getDesignWorkflowEffectError({type:EFFECT.SET_ACKNOWLEDGEMENTS,value:[]}),"acknowledgements must be an object");
});
