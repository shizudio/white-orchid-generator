import { DESIGN_COMMAND_TYPES } from "./design-document.mjs";
import { PATCH_OPTIONS } from "./design-patch.js";

const CONTENT_FIELDS = Object.freeze([
  "headline",
  "subtext",
  "attribution",
  "dateText",
  "microLabel",
  "pillText",
]);

const optionSets = Object.freeze(Object.fromEntries(
  Object.entries(PATCH_OPTIONS).map(([key, values]) => [key, new Set(values)]),
));

const commandEntry = (patchField, command) => ({ patchField, command });

/**
 * Compile the flat assistant patch vocabulary into canonical DesignDocument
 * commands. Commands are split around archetype materialisation because a
 * post type helps choose/materialise the layout, while explicit visual and
 * copy overrides must win after that layout has seeded its defaults.
 *
 * Fields absent from these lists are deliberately composite compatibility
 * operations. Their behavior (asset lookup, pin semantics, geometry, or side
 * effects) cannot be represented by one lossless document command yet.
 */
export function compileDesignPatchCommands(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { beforeMaterialization:[], afterMaterialization:[], compatibilityFields:[] };
  }

  const beforeMaterialization = [];
  const afterMaterialization = [];
  const compiledFields = new Set();

  if (optionSets.postType.has(patch.postType)) {
    beforeMaterialization.push(commandEntry("postType", {
      type:DESIGN_COMMAND_TYPES.COMPOSITION_SET,
      field:"postType",
      value:patch.postType,
    }));
    compiledFields.add("postType");
  }

  for (const field of CONTENT_FIELDS) {
    if (typeof patch[field] !== "string") continue;
    afterMaterialization.push(commandEntry(field, {
      type:DESIGN_COMMAND_TYPES.CONTENT_SET,
      field,
      value:patch[field],
    }));
    compiledFields.add(field);
  }

  if (optionSets.bgColor.has(patch.bgColor)) {
    afterMaterialization.push(commandEntry("bgColor", {
      type:DESIGN_COMMAND_TYPES.PALETTE_SET,
      field:"background",
      value:patch.bgColor,
    }));
    compiledFields.add("bgColor");
  }
  if (optionSets.textColorId.has(patch.textColorId)) {
    afterMaterialization.push(commandEntry("textColorId", {
      type:DESIGN_COMMAND_TYPES.PALETTE_SET,
      field:"text",
      value:patch.textColorId,
    }));
    compiledFields.add("textColorId");
  }
  const backdropMode = patch.backdropMode === "gradient" ? "auto" : patch.backdropMode;
  if (optionSets.backdropMode.has(backdropMode)) {
    afterMaterialization.push(commandEntry("backdropMode", {
      type:DESIGN_COMMAND_TYPES.PALETTE_SET,
      field:"backdrop",
      value:backdropMode,
    }));
    compiledFields.add("backdropMode");
  }
  if (Number.isFinite(patch.bgAlpha)) {
    afterMaterialization.push(commandEntry("bgAlpha", {
      type:DESIGN_COMMAND_TYPES.PALETTE_SET,
      field:"backgroundOpacity",
      value:Math.max(0, Math.min(1, patch.bgAlpha)),
    }));
    compiledFields.add("bgAlpha");
  }
  if (patch.fieldColor === null || patch.fieldColor === "" || optionSets.bgColor.has(patch.fieldColor)) {
    afterMaterialization.push(commandEntry("fieldColor", {
      type:DESIGN_COMMAND_TYPES.PALETTE_SET,
      field:"field",
      value:patch.fieldColor === "" ? null : patch.fieldColor,
    }));
    compiledFields.add("fieldColor");
  }
  if (optionSets.photoTreatment.has(patch.photoTreatment)) {
    afterMaterialization.push(commandEntry("photoTreatment", {
      type:DESIGN_COMMAND_TYPES.MEDIA_SET,
      field:"treatment",
      value:patch.photoTreatment,
    }));
    compiledFields.add("photoTreatment");
  }
  if (["image","video"].includes(patch.mediaKind)) {
    afterMaterialization.push(commandEntry("mediaKind", {
      type:DESIGN_COMMAND_TYPES.MEDIA_SET,
      field:"kind",
      value:patch.mediaKind,
    }));
    compiledFields.add("mediaKind");
  }
  if (optionSets.photoFrameType.has(patch.photoFrameType)) {
    const frame = patch.photoFrameType === "card"
      ? { type:"card", box:{ x:0.54, y:0.32, w:0.38, h:0.42, align:"left" }, radiusFrac:0.06, rotationDeg:0 }
      : { type:"none" };
    afterMaterialization.push(commandEntry("photoFrameType", {
      type:DESIGN_COMMAND_TYPES.MEDIA_SET,
      field:"frame",
      value:frame,
    }));
    compiledFields.add("photoFrameType");
  }

  if (patch.fontSizes && typeof patch.fontSizes === "object" && !Array.isArray(patch.fontSizes)) {
    const fontSizes = {};
    for (const role of PATCH_OPTIONS.fontRole) {
      if (optionSets.fontStep.has(patch.fontSizes[role])) fontSizes[role] = patch.fontSizes[role];
    }
    if (Object.keys(fontSizes).length) {
      afterMaterialization.push(commandEntry("fontSizes", {
        type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_MERGE_FONT_SIZES,
        patch:fontSizes,
      }));
      compiledFields.add("fontSizes");
    }
  }

  return {
    beforeMaterialization,
    afterMaterialization,
    compatibilityFields:Object.keys(patch).filter(field => patch[field] != null && !compiledFields.has(field)),
  };
}
