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
export function compileDesignPatchCommands(patch, opts = {}) {
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

  // (Text Elements slice 4 — spec §5) ADD a brand-governed text element. Compiles to
  // the SAME content/add-element command the UI's "+ Add text" picker dispatches, so
  // the AI grammar and the inspector share one apply path. Gated on a sanctioned class
  // (the reducer normalizes/assigns the uid and the solver places it). Lands AFTER
  // materialization so an archetype switch in the same turn seeds first.
  const add = patch.addTextElement;
  if (add && typeof add === "object" && !Array.isArray(add) && optionSets.elementClass.has(add.class)) {
    afterMaterialization.push(commandEntry("addTextElement", {
      type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
      element:{ class:add.class, text:typeof add.text === "string" ? add.text : "", authorship:"ai" },
    }));
    compiledFields.add("addTextElement");
  }

  // (Text Elements slice 4 — spec §1) Per-uid edits to EXISTING added elements. Each
  // entry compiles into content/set-element-{text,class,size}; the reducer enforces
  // sanctioned class transitions and no-op guards. Order is text → class → size so a
  // combined edit lands deterministically.
  if (Array.isArray(patch.editElements) && patch.editElements.length) {
    for (const entry of patch.editElements) {
      if (!entry || typeof entry !== "object" || typeof entry.uid !== "string" || !entry.uid) continue;
      if (typeof entry.text === "string") {
        afterMaterialization.push(commandEntry("editElements", {
          type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_TEXT, uid:entry.uid, value:entry.text,
        }));
      }
      if (optionSets.elementClass.has(entry.class)) {
        afterMaterialization.push(commandEntry("editElements", {
          type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_CLASS, uid:entry.uid, value:entry.class,
        }));
      }
      if (optionSets.elementSizeStep.has(entry.sizeStep)) {
        afterMaterialization.push(commandEntry("editElements", {
          type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_SIZE, uid:entry.uid, value:entry.sizeStep,
        }));
      }
      // (Font Ruling B) register pin. The reducer refuses a register unsanctioned for the
      // element's class (no-op), so an off-class pick lands nothing rather than a wrong voice.
      if (optionSets.register.has(entry.register)) {
        afterMaterialization.push(commandEntry("editElements", {
          type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_REGISTER, uid:entry.uid, value:entry.register,
        }));
      }
    }
    if (afterMaterialization.some(e => e.patchField === "editElements")) compiledFields.add("editElements");
  }

  if (optionSets.bgColor.has(patch.bgColor)) {
    afterMaterialization.push(commandEntry("bgColor", {
      type:DESIGN_COMMAND_TYPES.PALETTE_SET,
      field:"background",
      value:patch.bgColor,
    }));
    // On a MATERIALIZED design the visible solid is the palette-variant field (or its
    // override) — background alone is shadowed there, so a colour ask that reaches us
    // as plain bgColor (the model's schema has no fieldColor; only the route's colour
    // belt sets it, and its vocabulary can't cover every colour word) would claim a
    // change the render never shows. The caller flags that state and the write lands
    // on the field too — skipped when the patch carries its own fieldColor (the belt
    // already decided) and never during a genuine layout switch (the caller keeps the
    // flag false there so the incoming archetype's authored variant palette wins).
    if (opts.fieldFollowsBackground && !("fieldColor" in patch)) {
      afterMaterialization.push(commandEntry("bgColor", {
        type:DESIGN_COMMAND_TYPES.PALETTE_SET,
        field:"field",
        value:patch.bgColor,
      }));
    }
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
  // (Task #69 photo-load fix) During a GENUINE layout switch the incoming
  // archetype's materialization authors the media styling (treatment + frame) —
  // a floated_card seeds frame {type:"card"}, full_bleed_duotone its duotone
  // treatment. The landing/editor model often echoes schema-default media style
  // (photoFrameType "none") alongside archetypeId; compiled afterMaterialization
  // it would strip the fresh archetype's card window so the chosen photo renders
  // invisibly (the photo-less landing floated_card bug). The caller flags the
  // switch; without a switch these stay explicit overrides that win (a direct
  // "remove the frame" / "warmer photo" tweak on an existing design).
  if (!opts.archetypeOwnsMediaStyle && optionSets.photoTreatment.has(patch.photoTreatment)) {
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
  if (!opts.archetypeOwnsMediaStyle && optionSets.photoFrameType.has(patch.photoFrameType)) {
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
