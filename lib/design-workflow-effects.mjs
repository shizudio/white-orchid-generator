/**
 * Non-document work performed after a canonical design command group.
 *
 * Effects are deliberately separate from DesignDocument commands: they may
 * update editor selection, browser-only decoded media, or transient view state,
 * but they must never become a second route for mutating document truth.
 */
export const DESIGN_WORKFLOW_EFFECT_TYPES = Object.freeze({
  SELECT_LOGO_TAB:"select-logo-tab",
  SELECT_DIMENSION:"select-dimension",
  SELECT_EXPORT_FORMAT:"select-export-format",
  CLEAR_SHAPE_SELECTION:"clear-shape-selection",
  CLEAR_SHAPE_SELECTION_IF:"clear-shape-selection-if",
  CLEAR_PHOTO_SELECTION:"clear-photo-selection",
  CLEAR_EDITOR_SELECTION:"clear-editor-selection",
  SET_ACKNOWLEDGEMENTS:"set-acknowledgements",
  SET_OVERLAY_CLEAN:"set-overlay-clean",
  SET_OVERLAY_DIRTY:"set-overlay-dirty",
  SELECT_SHAPE:"select-shape",
  REMOVE_VIDEO:"remove-video",
  CLEAR_DECODED_IMAGE:"clear-decoded-image",
  DECODE_IMAGE:"decode-image",
});

const types = new Set(Object.values(DESIGN_WORKFLOW_EFFECT_TYPES));
const noPayloadTypes = new Set([
  DESIGN_WORKFLOW_EFFECT_TYPES.CLEAR_SHAPE_SELECTION,
  DESIGN_WORKFLOW_EFFECT_TYPES.CLEAR_PHOTO_SELECTION,
  DESIGN_WORKFLOW_EFFECT_TYPES.CLEAR_EDITOR_SELECTION,
  DESIGN_WORKFLOW_EFFECT_TYPES.SET_OVERLAY_CLEAN,
  DESIGN_WORKFLOW_EFFECT_TYPES.SET_OVERLAY_DIRTY,
  DESIGN_WORKFLOW_EFFECT_TYPES.REMOVE_VIDEO,
  DESIGN_WORKFLOW_EFFECT_TYPES.CLEAR_DECODED_IMAGE,
]);
const nonEmptyString = value => typeof value === "string" && value.length > 0;

/** Return a stable reason string for invalid effects, or null when valid. */
export function getDesignWorkflowEffectError(effect) {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) return "effect must be an object";
  if (!types.has(effect.type)) return `unknown effect type: ${String(effect.type)}`;
  if (noPayloadTypes.has(effect.type)) return null;

  switch (effect.type) {
    case DESIGN_WORKFLOW_EFFECT_TYPES.SELECT_LOGO_TAB:
      return effect.value === "primary" || effect.value === "secondary"
        ? null
        : "logo tab must be primary or secondary";
    case DESIGN_WORKFLOW_EFFECT_TYPES.SELECT_DIMENSION:
    case DESIGN_WORKFLOW_EFFECT_TYPES.SELECT_EXPORT_FORMAT:
      return nonEmptyString(effect.value) ? null : "effect value must be a non-empty string";
    case DESIGN_WORKFLOW_EFFECT_TYPES.CLEAR_SHAPE_SELECTION_IF:
    case DESIGN_WORKFLOW_EFFECT_TYPES.SELECT_SHAPE:
      return nonEmptyString(effect.uid) ? null : "shape uid must be a non-empty string";
    case DESIGN_WORKFLOW_EFFECT_TYPES.DECODE_IMAGE:
      return nonEmptyString(effect.source) ? null : "image source must be a non-empty string";
    case DESIGN_WORKFLOW_EFFECT_TYPES.SET_ACKNOWLEDGEMENTS:
      return effect.value && typeof effect.value === "object" && !Array.isArray(effect.value)
        ? null
        : "acknowledgements must be an object";
    default:
      return "effect schema is not implemented";
  }
}

export const isDesignWorkflowEffect = effect => getDesignWorkflowEffectError(effect) === null;
