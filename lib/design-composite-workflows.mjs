import { applyDesignCommand, CONTENT_FIELDS, DESIGN_COMMAND_TYPES, migrateDesignDocument } from "./design-document.mjs";
import { isMediaHostShape } from "./design-layer-contract.mjs";
import { PATCH_OPTIONS } from "./design-patch.js";
import { DESIGN_WORKFLOW_EFFECT_TYPES as EFFECT } from "./design-workflow-effects.mjs";

const logoIds = new Set(PATCH_OPTIONS.logoId);
const logoPositions = new Set(PATCH_OPTIONS.logoPosition);
const logoSizes = new Set(PATCH_OPTIONS.logoSize);

const group = (changedFields, commands, effects = []) => ({ changedFields, commands, effects });
const clamp01 = value => Math.max(0, Math.min(1, value));

export const shouldCommitPatchHistory = ({ amendUndo = false, appliedFields = [] } = {}) =>
  !amendUndo && Array.isArray(appliedFields) && appliedFields.length > 0;

/** Stamp reducer-confirmed copy authorship without creating another applied field. */
export function planCopyAuthorshipWorkflow({fields,author}={}) {
  const copyFields=Array.isArray(fields)?fields.filter(field=>typeof field==="string"&&field):[];
  if(!copyFields.length||!(author==="owner"||author==="ai"))return[];
  return [group([], [{type:DESIGN_COMMAND_TYPES.CONTENT_STAMP_AUTHORSHIP,fields:copyFields,author}])];
}

/** Synchronize explicit owner contrast pins before applying the visible patch. */
export function planPalettePinWorkflow({patch}={}) {
  if(!patch||typeof patch!=="object")return[];
  const pinPatch={};
  if(Object.prototype.hasOwnProperty.call(patch,"backdropMode"))pinPatch.backdropMode=patch.backdropMode!=="auto";
  if(Object.prototype.hasOwnProperty.call(patch,"textColorId"))pinPatch.textColorId=patch.textColorId!=="auto";
  if(!Object.keys(pinPatch).length)return[];
  return [group(["palettePins"],[{type:DESIGN_COMMAND_TYPES.PALETTE_SYNC_PINS,patch:pinPatch}])];
}

/** Replace a complete shape collection at migration/import boundaries. */
export function planShapeCollectionWorkflow({ patch }) {
  if (!Array.isArray(patch?.replaceShapeCollection)) return [];
  return [group(["replaceShapeCollection"], [{
    type:DESIGN_COMMAND_TYPES.SHAPES_REPLACE,
    shapes:patch.replaceShapeCollection,
  }], [{ type:EFFECT.CLEAR_SHAPE_SELECTION }])];
}

/** Reset all owner-authored overrides for one non-master format atomically. */
export function planFormatResetWorkflow({ patch, masterDimensionId, hasOverride = false }) {
  const dimensionId = patch?.resetFormatToMaster;
  if (typeof dimensionId !== "string" || !dimensionId || dimensionId === masterDimensionId || !hasOverride) return [];
  return [group(["resetFormatToMaster"], [{
    type:DESIGN_COMMAND_TYPES.FORMAT_RESET_TO_MASTER,
    dimensionId,
  }], [{ type:EFFECT.SET_OVERLAY_DIRTY }])];
}

/**
 * Compile logo patch fields into atomic command groups. The planner owns the
 * master/per-format/system pin policy; the caller only executes commands and
 * the explicitly declared inspector effect.
 */
export function planLogoPatchWorkflow({
  patch,
  current,
  rendered,
  dimensionId,
  masterDimensionId,
  systemFreeVariables = false,
  uiSource = false,
}) {
  if (!patch || typeof patch !== "object") return [];
  const groups = [];

  if (logoIds.has(patch.logoId) && patch.logoId !== current.assetId) {
    groups.push(group(["logoId"], [
      { type:DESIGN_COMMAND_TYPES.LOGO_SET, field:"assetId", value:patch.logoId },
      ...(!systemFreeVariables
        ? [{ type:DESIGN_COMMAND_TYPES.LOGO_SET, field:"variantPinned", value:true }]
        : []),
    ], [{ type:EFFECT.SELECT_LOGO_TAB, value:patch.logoId.startsWith("s") ? "secondary" : "primary" }]));
  }

  const positionChanged = logoPositions.has(patch.logoPosition) && (
    patch.logoPosition !== current.position ||
    patch.logoPosition !== rendered.position ||
    !rendered.drawn
  );
  const sizeChanged = logoSizes.has(patch.logoSize) && patch.logoSize !== current.sizeId;
  if (positionChanged || sizeChanged) {
    const nextPosition = positionChanged ? patch.logoPosition : current.position;
    const nextSizeId = sizeChanged ? patch.logoSize : current.sizeId;
    const changedFields = [
      ...(positionChanged ? ["logoPosition"] : []),
      ...(sizeChanged ? ["logoSize"] : []),
    ];
    const placementPatch = { position:nextPosition, sizeId:nextSizeId };
    const commands = [];

    if (systemFreeVariables) {
      commands.push({ type:DESIGN_COMMAND_TYPES.LOGO_MERGE_MASTER_PLACEMENT, patch:placementPatch });
    } else if (dimensionId === masterDimensionId) {
      commands.push(
        { type:DESIGN_COMMAND_TYPES.LOGO_SET, field:"placementPinned", value:true },
        { type:DESIGN_COMMAND_TYPES.LOGO_MERGE_MASTER_PLACEMENT, patch:placementPatch },
      );
    } else {
      if (uiSource) {
        commands.push({ type:DESIGN_COMMAND_TYPES.LOGO_MERGE_MASTER_PLACEMENT, patch:placementPatch });
      } else {
        commands.push({ type:DESIGN_COMMAND_TYPES.LOGO_SET, field:"placementPinned", value:true });
      }
      commands.push({
        type:DESIGN_COMMAND_TYPES.LOGO_MERGE_FORMAT_PLACEMENT,
        dimensionId,
        patch:placementPatch,
      });
    }
    groups.push(group(changedFields, commands));
  }

  if (Object.prototype.hasOwnProperty.call(patch, "logoFree")) {
    const candidate = patch.logoFree;
    const valid = candidate === null || (
      candidate && typeof candidate === "object" &&
      Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
    );
    if (valid) {
      const free = candidate === null ? null : { x:clamp01(candidate.x), y:clamp01(candidate.y) };
      const commands = [{ type:DESIGN_COMMAND_TYPES.LOGO_SET, field:"placementPinned", value:true }];
      if (dimensionId === masterDimensionId) {
        commands.push({ type:DESIGN_COMMAND_TYPES.LOGO_MERGE_MASTER_PLACEMENT, patch:{ free } });
      } else {
        commands.push({
          type:DESIGN_COMMAND_TYPES.LOGO_MERGE_FORMAT_PLACEMENT,
          dimensionId,
          base:{ position:current.position, sizeId:current.sizeId },
          patch:free ? { free } : {},
          removeFree:!free,
        });
      }
      groups.push(group(["logoFree"], commands));
    }
  }

  if (typeof patch.hideLogo === "boolean" && patch.hideLogo !== current.hidden) {
    groups.push(group(["hideLogo"], [
      { type:DESIGN_COMMAND_TYPES.LOGO_SET, field:"hidden", value:patch.hideLogo },
      ...(patch.hideLogo === false
        ? [{ type:DESIGN_COMMAND_TYPES.LOGO_SET, field:"placementPinned", value:true }]
        : []),
    ]));
  }

  return groups;
}

/**
 * Build deterministic shape replacement/addition command groups. When remove
 * and add arrive together, the add is based on the already-cleared collection
 * rather than the stale pre-removal array.
 */
export function planShapePatchWorkflow({
  patch,
  currentShapes,
  resolvedAsset = null,
  suggestedTransform = null,
  uid = null,
  uiSource = false,
}) {
  if (!patch || typeof patch !== "object") return [];
  const groups = [];
  let workingShapes = Array.isArray(currentShapes) ? currentShapes : [];
  let removedAll = false;

  if (patch.removeOverlays === true) {
    groups.push(group(["removeOverlays"], [
      { type:DESIGN_COMMAND_TYPES.SHAPES_REPLACE, shapes:[] },
    ], [{ type:EFFECT.CLEAR_SHAPE_SELECTION }]));
    workingShapes = [];
    removedAll = true;
  }

  if (resolvedAsset && suggestedTransform && uid) {
    const mode = PATCH_OPTIONS.overlayMode.includes(patch.addOverlay?.mode)
      ? patch.addOverlay.mode
      : "overlay";
    const sameCount = uiSource
      ? workingShapes.filter(shape => shape.assetId === resolvedAsset.id).length
      : 0;
    const transform = { ...suggestedTransform };
    if (sameCount > 0) {
      transform.x = Math.min(0.9, (transform.x ?? 0.5) + 0.06 * sameCount);
      transform.y = Math.min(0.9, (transform.y ?? 0.5) + 0.06 * sameCount);
    }
    const commands = [];
    if (!uiSource && !removedAll) {
      workingShapes = workingShapes.filter(shape => shape.assetId !== resolvedAsset.id);
      commands.push({ type:DESIGN_COMMAND_TYPES.SHAPES_REPLACE, shapes:workingShapes });
    }
    commands.push({
      type:DESIGN_COMMAND_TYPES.SHAPE_ADD,
      shape:{ uid, assetId:resolvedAsset.id, mode, master:transform, byDim:{} },
    });
    groups.push(group(["addOverlay"], commands, uiSource ? [
      { type:EFFECT.SELECT_SHAPE, uid },
    ] : []));
  }

  return groups;
}

/** Keep decoded browser objects outside serialisable document commands. */
export function planMediaSourceWorkflow({ patch }) {
  if (!patch || typeof patch !== "object") return [];
  if (patch.removeImage === true) {
    return [group(["removeImage"], [
      { type:DESIGN_COMMAND_TYPES.MEDIA_SET_SOURCE, source:null },
    ], [
      { type:EFFECT.REMOVE_VIDEO },
      { type:EFFECT.CLEAR_DECODED_IMAGE },
    ])];
  }
  if (typeof patch.imageSrc === "string" && patch.imageSrc) {
    return [group(["imageSrc"], [
      { type:DESIGN_COMMAND_TYPES.MEDIA_SET_SOURCE, source:patch.imageSrc },
      { type:DESIGN_COMMAND_TYPES.MEDIA_SET, field:"kind", value:"image" },
    ], [
      { type:EFFECT.REMOVE_VIDEO },
      { type:EFFECT.DECODE_IMAGE, source:patch.imageSrc },
    ])];
  }
  return [];
}

/**
 * Materialize a layout archetype into the canonical design document.
 *
 * This planner deliberately owns the reset boundary. A new archetype replaces
 * system-authored layout state (palette defaults, responsive offsets, crop
 * pins, motifs and furniture overrides) while retaining explicit user shape
 * decisions. In particular, a user-touched layout frame is a pin: it survives
 * and suppresses the incoming archetype frame so two media hosts cannot
 * compete.
 */
export function planArchetypeMaterializationWorkflow({
  archetypeId,
  variant = 0,
  materialized = null,
  currentShapes = [],
  typeLayoutDefault = {},
}) {
  if (archetypeId === null || archetypeId === "none") {
    return [group(["archetypeId"], [
      { type:DESIGN_COMMAND_TYPES.COMPOSITION_SET, field:"archetypeId", value:null },
      { type:DESIGN_COMMAND_TYPES.COMPOSITION_SET, field:"archetypeVariant", value:0 },
    ])];
  }
  if (!materialized || typeof materialized !== "object" || !materialized.postType) return [];

  const retainedShapes = (Array.isArray(currentShapes) ? currentShapes : []).filter(shape => {
    if (shape?.motif) return false;
    if (shape?.origin === "layout") return shape.userTouched === true;
    return true;
  });
  const hasPinnedLayoutFrame = retainedShapes.some(shape =>
    shape?.origin === "layout" && (shape.mode || "frame") === "frame"
  );
  const nextShapes = [
    ...retainedShapes,
    ...(materialized.layoutShapeLayer && !hasPinnedLayoutFrame ? [materialized.layoutShapeLayer] : []),
    ...(Array.isArray(materialized.motifLayers) ? materialized.motifLayers : []),
  ];
  const commands = [
    { type:DESIGN_COMMAND_TYPES.COMPOSITION_SET, field:"archetypeId", value:archetypeId },
    { type:DESIGN_COMMAND_TYPES.COMPOSITION_SET, field:"archetypeVariant", value:Number.isInteger(variant) ? variant : 0 },
    ...(materialized.bg ? [{ type:DESIGN_COMMAND_TYPES.PALETTE_SET, field:"background", value:materialized.bg }] : []),
    { type:DESIGN_COMMAND_TYPES.PALETTE_SET, field:"field", value:null },
    { type:DESIGN_COMMAND_TYPES.PALETTE_SET, field:"text", value:"auto" },
    { type:DESIGN_COMMAND_TYPES.PALETTE_SET, field:"backdrop", value:"auto" },
    { type:DESIGN_COMMAND_TYPES.LOGO_SET, field:"variantPinned", value:false },
    { type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET, field:"heroRegister", value:materialized.register || "" },
    { type:DESIGN_COMMAND_TYPES.CONTENT_SET, field:"microLabel", value:materialized.microLabel ?? null },
    { type:DESIGN_COMMAND_TYPES.CONTENT_SET, field:"pillText", value:null },
    { type:DESIGN_COMMAND_TYPES.MEDIA_SET, field:"treatment", value:materialized.photoTreatment || "none" },
    { type:DESIGN_COMMAND_TYPES.MEDIA_SET, field:"frame", value:materialized.photoFrame || { type:"none" } },
    {
      type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_MERGE_MASTER_LAYOUT,
      postType:materialized.postType,
      base:typeLayoutDefault,
      patch:materialized.layout || {},
    },
    { type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET, field:"formatLayouts", value:{} },
    { type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET, field:"roleOffsetsByFormat", value:{} },
    { type:DESIGN_COMMAND_TYPES.MEDIA_SET, field:"formatPins", value:{} },
    { type:DESIGN_COMMAND_TYPES.MEDIA_SET, field:"formatTransforms", value:{} },
    { type:DESIGN_COMMAND_TYPES.PALETTE_SET_PINS, pins:{} },
    { type:DESIGN_COMMAND_TYPES.SHAPES_REPLACE, shapes:nextShapes },
    { type:DESIGN_COMMAND_TYPES.FURNITURE_SET, overrides:{} },
  ];

  return [group(["archetypeId"], commands, [{ type:EFFECT.CLEAR_SHAPE_SELECTION }])];
}

/** Restore canonical editor state in one document replacement plus declared UI effects. */
export function planSnapshotRestoreWorkflow({ snapshot }) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const document = migrateDesignDocument(snapshot.designDocument || snapshot);
  const logoTab = snapshot.markTab || ((document.logo.assetId || "p3-ivory").startsWith("s")
    ? "secondary"
    : "primary");
  const effects = [
    ...(typeof snapshot.dimensionId === "string"
      ? [{ type:EFFECT.SELECT_DIMENSION, value:snapshot.dimensionId }]
      : []),
    { type:EFFECT.CLEAR_SHAPE_SELECTION },
    { type:EFFECT.SELECT_LOGO_TAB, value:logoTab },
    ...(document.media.source
      ? [{ type:EFFECT.DECODE_IMAGE, source:document.media.source }]
      : [{ type:EFFECT.CLEAR_DECODED_IMAGE }]),
    { type:EFFECT.CLEAR_PHOTO_SELECTION },
  ];
  return [group(["document"], [
    { type:DESIGN_COMMAND_TYPES.DOCUMENT_REPLACE, document },
  ], effects)];
}

/** Pin and reframe media as one undoable document workflow. */
export function planPhotoTransformWorkflow({
  patch,
  dimensionId,
  masterDimensionId,
  renderedTransform,
  masterTransform,
  windowKind = null,
}) {
  if (!patch || typeof patch !== "object" || !dimensionId || !masterDimensionId) return [];
  const transform = {};
  for (const field of ["zoom", "cx", "cy", "rotation"]) {
    if (Number.isFinite(patch[field])) transform[field] = patch[field];
  }
  if (!Object.keys(transform).length) return [];
  if ((windowKind === "mask" || windowKind === "card") && Number.isFinite(transform.zoom)) {
    transform.zoom = Math.max(1, transform.zoom);
  }
  const seedSource = renderedTransform && typeof renderedTransform === "object"
    ? renderedTransform
    : masterTransform;
  const seed = {
    zoom:Number.isFinite(seedSource?.zoom) ? seedSource.zoom : 1,
    cx:Number.isFinite(seedSource?.cx) ? seedSource.cx : 0.5,
    cy:Number.isFinite(seedSource?.cy) ? seedSource.cy : 0.5,
    rotation:Number.isFinite(seedSource?.rotation) ? seedSource.rotation : 0,
  };
  const commands = [{
    type:DESIGN_COMMAND_TYPES.MEDIA_PIN_FORMAT,
    dimensionId,
    masterDimensionId,
    seed,
  }];
  if (dimensionId === masterDimensionId) {
    commands.push({ type:DESIGN_COMMAND_TYPES.MEDIA_MERGE_MASTER_TRANSFORM, patch:transform });
  } else {
    commands.push({
      type:DESIGN_COMMAND_TYPES.MEDIA_MERGE_FORMAT_TRANSFORM,
      dimensionId,
      base:masterTransform || {},
      patch:transform,
    });
  }
  return [group(["photoTransform"], commands)];
}

/**
 * Merge the current design's OWNER-authored content into a template document.
 *
 * A template swap replaces the SYSTEM's free variables (layout geometry, archetype,
 * palette proposals, typography) but must PRESERVE the user's own work (DLC §3.4/§10,
 * pins law 5): owner-authored copy, owner-added text elements, and explicit pins
 * survive; AI/template-authored copy is a free variable the template may replace.
 * Content that no longer fits the new layout is handled downstream by the standard
 * complete-or-absent + readiness flow — this merge never deletes it silently.
 */
export function mergeOwnerAuthoredContent({ template, current } = {}) {
  const base = migrateDesignDocument(template);
  if (!current || typeof current !== "object") return base;
  const cur = migrateDesignDocument(current);
  const curAuthorship = cur.content.authorship || {};

  const content = { ...base.content };
  const authorship = { ...(base.content.authorship || {}) };
  // Owner-typed copy survives; template copy fills every field the owner never touched.
  for (const field of CONTENT_FIELDS) {
    if (curAuthorship[field] === "owner") {
      content[field] = cur.content[field];
      authorship[field] = "owner";
    }
  }
  content.authorship = authorship;
  // Owner-added text elements survive; template elements fill only unused uids.
  const curElements = Array.isArray(cur.content.elements) ? cur.content.elements : [];
  const tplElements = Array.isArray(base.content.elements) ? base.content.elements : [];
  const curUids = new Set(curElements.map(element => element.uid));
  content.elements = [...curElements, ...tplElements.filter(element => !curUids.has(element.uid))];

  // Explicit owner pins survive the swap (law 5, re-solve-around-pins): a pinned
  // contrast field keeps the owner's value while the template supplies the rest.
  const palette = { ...base.palette };
  const curPins = cur.palette.pins && typeof cur.palette.pins === "object" ? cur.palette.pins : {};
  palette.pins = { ...(base.palette.pins || {}), ...curPins };
  if (curPins.textColorId) palette.text = cur.palette.text;
  if (curPins.backdropMode) palette.backdrop = cur.palette.backdrop;

  // An owner logo choice is a pin too — variant and placement survive when pinned.
  const logo = { ...base.logo };
  if (cur.logo.variantPinned) {
    logo.variantPinned = true;
    logo.assetId = cur.logo.assetId;
  }
  if (cur.logo.placementPinned) {
    logo.placementPinned = true;
    logo.hidden = cur.logo.hidden;
    logo.masterPlacement = cur.logo.masterPlacement;
    logo.formatPlacements = cur.logo.formatPlacements;
  }

  return { ...base, content, palette, logo };
}

/**
 * Resolve a saved template to one canonical replacement document. Legacy
 * templates that predate materialized role geometry are upgraded through the
 * same archetype workflow as new layouts, so shape ownership and reset rules
 * cannot drift between entry points. When a currentDocument is supplied the
 * owner's copy, added elements, and pins are merged onto the template so a swap
 * adapts to the work in progress instead of discarding it.
 */
export function planTemplateApplicationWorkflow({
  document,
  currentDocument = null,
  metadata = {},
  acknowledgements = [],
  archetypeId = null,
  variant = 0,
  materialized = null,
  alreadyMaterialized = false,
  typeLayoutDefault = {},
}) {
  if (!document || typeof document !== "object") return [];
  let resolvedDocument = migrateDesignDocument(document);
  if (archetypeId && materialized && !alreadyMaterialized) {
    const archetypeGroups = planArchetypeMaterializationWorkflow({
      archetypeId,
      variant,
      materialized,
      currentShapes:resolvedDocument.shapes,
      typeLayoutDefault,
    });
    for (const workflowGroup of archetypeGroups) {
      for (const command of workflowGroup.commands) {
        resolvedDocument = applyDesignCommand(resolvedDocument, command).document;
      }
    }
  }
  // Owner content survives the swap; run the merge AFTER materialization so it wins
  // over the archetype's palette/pin reset (a materialized layout clears pins first).
  if (currentDocument) {
    resolvedDocument = mergeOwnerAuthoredContent({ template:resolvedDocument, current:currentDocument });
  }
  const logoTab = (resolvedDocument.logo.assetId || "p3-ivory").startsWith("s")
    ? "secondary"
    : "primary";
  return [group(["document"], [{
    type:DESIGN_COMMAND_TYPES.DOCUMENT_REPLACE,
    document:resolvedDocument,
  }], [
    { type:EFFECT.SELECT_DIMENSION, value:metadata.dimensionId || "ig_portrait" },
    { type:EFFECT.SELECT_EXPORT_FORMAT, value:metadata.exportFormat || "png" },
    { type:EFFECT.CLEAR_EDITOR_SELECTION },
    { type:EFFECT.REMOVE_VIDEO },
    ...(resolvedDocument.media.source
      ? [{ type:EFFECT.DECODE_IMAGE, source:resolvedDocument.media.source }]
      : [{ type:EFFECT.CLEAR_DECODED_IMAGE }]),
    { type:EFFECT.SELECT_LOGO_TAB, value:logoTab },
    { type:EFFECT.SET_ACKNOWLEDGEMENTS, value:acknowledgements && typeof acknowledgements === "object" && !Array.isArray(acknowledgements) ? acknowledgements : {} },
    { type:EFFECT.SET_OVERLAY_CLEAN },
  ])];
}

const layoutShapePinCommands = ({ shape, dimensionId, masterDimensionId }) => {
  if (!shape || shape.origin !== "layout") return [];
  const patch = {};
  if (!shape.userTouched) patch.userTouched = true;
  if (dimensionId && dimensionId !== masterDimensionId && !shape.touchedByDim?.[dimensionId]) {
    patch.touchedByDim = { ...(shape.touchedByDim || {}), [dimensionId]:true };
  }
  return Object.keys(patch).length
    ? [{ type:DESIGN_COMMAND_TYPES.SHAPE_UPDATE, uid:shape.uid, patch }]
    : [];
};

/** Update, promote, or remove one shape while preserving generated-shape pins. */
export function planShapeMutationWorkflow({
  patch,
  currentShapes = [],
  currentMediaHostShapeId = null,
  dimensionId,
  masterDimensionId,
  transformBase = {},
}) {
  if (!patch || typeof patch !== "object") return [];
  const groups = [];
  const shapes = Array.isArray(currentShapes) ? currentShapes : [];
  const reset = patch.resetOverlay;
  if (reset && typeof reset === "object" && typeof reset.uid === "string") {
    const shape = shapes.find(item => item.uid === reset.uid);
    if (shape) {
      if (dimensionId === masterDimensionId && reset.masterTransform && typeof reset.masterTransform === "object") {
        groups.push(group(["resetOverlay"], [{
          type:DESIGN_COMMAND_TYPES.SHAPE_UPDATE,
          uid:shape.uid,
          patch:{ master:reset.masterTransform },
        }], [{ type:EFFECT.SET_OVERLAY_DIRTY }]));
      } else if (dimensionId !== masterDimensionId && shape.byDim?.[dimensionId]) {
        const byDim = { ...(shape.byDim || {}) };
        const touchedByDim = { ...(shape.touchedByDim || {}) };
        delete byDim[dimensionId];
        delete touchedByDim[dimensionId];
        groups.push(group(["resetOverlay"], [{
          type:DESIGN_COMMAND_TYPES.SHAPE_UPDATE,
          uid:shape.uid,
          patch:{ byDim, touchedByDim },
        }], [{ type:EFFECT.SET_OVERLAY_DIRTY }]));
      }
    }
  }
  const update = patch.overlayUpdate;
  if (!reset && update && typeof update === "object" && typeof update.uid === "string") {
    const shape = shapes.find(item => item.uid === update.uid);
    if (shape) {
      const commands = layoutShapePinCommands({ shape, dimensionId, masterDimensionId });
      if (update.transform && typeof update.transform === "object") {
        commands.push({
          type:DESIGN_COMMAND_TYPES.SHAPE_UPDATE_TRANSFORM,
          uid:shape.uid,
          dimensionId,
          isMaster:dimensionId === masterDimensionId,
          base:transformBase,
          patch:update.transform,
        });
      }
      if (PATCH_OPTIONS.overlayMode.includes(update.mode)) {
        commands.push({
          type:DESIGN_COMMAND_TYPES.SHAPE_UPDATE,
          uid:shape.uid,
          patch:{
            mode:update.mode,
            ...(update.mode === "outline" ? {
              outlineColor:shape.outlineColor || "tangerine",
              outlineWidth:shape.outlineWidth ?? 0.08,
            } : {}),
            ...(update.mode === "lineart" ? {
              lineArtColor:shape.lineArtColor || shape.outlineColor || "burnham",
              lineArtThreshold:shape.lineArtThreshold ?? 0.72,
            } : {}),
          },
        });
      }
      if (update.style && typeof update.style === "object") {
        commands.push({ type:DESIGN_COMMAND_TYPES.SHAPE_UPDATE, uid:shape.uid, patch:update.style });
      }
      if (commands.length) {
        groups.push(group(["overlayUpdate"], commands, [{ type:EFFECT.SET_OVERLAY_DIRTY }]));
      }
    }
  }

  if (typeof patch.mediaHostShapeId === "string" && patch.mediaHostShapeId) {
    const shape = shapes.find(item => item.uid === patch.mediaHostShapeId);
    const unchanged = shape && currentMediaHostShapeId === shape.uid && isMediaHostShape(shape);
    if (shape && !unchanged) {
      groups.push(group(["mediaHostShapeId"], [
        ...layoutShapePinCommands({ shape, dimensionId:null, masterDimensionId }),
        { type:DESIGN_COMMAND_TYPES.SHAPE_SET_MEDIA_HOST, uid:shape.uid },
      ], [{ type:EFFECT.SET_OVERLAY_DIRTY }]));
    }
  }

  if (typeof patch.removeOverlay === "string" && patch.removeOverlay) {
    const shape = shapes.find(item => item.uid === patch.removeOverlay);
    if (shape) {
      groups.push(group(["removeOverlay"], [
        { type:DESIGN_COMMAND_TYPES.SHAPE_REMOVE, uid:shape.uid },
      ], [
        { type:EFFECT.CLEAR_SHAPE_SELECTION_IF, uid:shape.uid },
        { type:EFFECT.SET_OVERLAY_DIRTY },
      ]));
    }
  }
  return groups;
}

/** Compile one furniture edit without exposing palette or clamp policy to the UI. */
export function planFurniturePatchWorkflow({ patch, validColorIds = [] }) {
  const update = patch?.furnitureUpdate;
  if (!update || typeof update !== "object" || typeof update.key !== "string" || !update.key) return [];
  const validColors = new Set(validColorIds);
  const itemPatch = {
    ...(typeof update.hidden === "boolean" ? { hidden:update.hidden ? true : null } : {}),
    ...(update.color === "" ? { color:null } : typeof update.color === "string" && validColors.has(update.color) ? { color:update.color } : {}),
    ...(Number.isFinite(update.widthScale) ? { widthScale:Math.max(0.25, Math.min(3, update.widthScale)) } : {}),
  };
  if (!Object.keys(itemPatch).length) return [];
  return [group(["furnitureUpdate"], [{
    type:DESIGN_COMMAND_TYPES.FURNITURE_UPDATE,
    key:update.key,
    patch:itemPatch,
  }])];
}

/** Compile hero-box and individual-role placement into responsive type commands. */
export function planTypographyPlacementWorkflow({
  patch,
  dimensionId,
  masterDimensionId,
  postType,
  resolvedLayout = {},
  defaultLayout = {},
  roleOffsetsByFormat = {},
}) {
  if (!patch || typeof patch !== "object" || !dimensionId || !postType) return [];
  const groups = [];
  if (patch.resetTextLayout === true) {
    groups.push(group(["resetTextLayout"], [{
      type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_RESET_LAYOUT,
      dimensionId,
      masterDimensionId,
      postType,
      defaultLayout,
    }]));
  }
  if (patch.resetTextLayout !== true && patch.textLayout && typeof patch.textLayout === "object") {
    const layoutPatch = {};
    for (const field of ["x", "y", "width", "lineHeight", "scale"]) {
      if (Number.isFinite(patch.textLayout[field])) layoutPatch[field] = patch.textLayout[field];
    }
    if (["left", "center", "right"].includes(patch.textLayout.align)) {
      layoutPatch.align = patch.textLayout.align;
    }
    if (Object.keys(layoutPatch).length) {
      const command = dimensionId === masterDimensionId
        ? {
          type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_MERGE_MASTER_LAYOUT,
          postType,
          base:defaultLayout,
          patch:layoutPatch,
        }
        : {
          type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_FORMAT_LAYOUT,
          dimensionId,
          postType,
          base:resolvedLayout,
          patch:layoutPatch,
        };
      groups.push(group(["textLayout"], [command]));
    }
  }

  const roleOffset = patch.roleOffset;
  if (roleOffset && typeof roleOffset === "object" && typeof roleOffset.role === "string" && roleOffset.role) {
    const existing = roleOffsetsByFormat?.[dimensionId]?.[postType]?.[roleOffset.role];
    if (roleOffset.clear === true) {
      if (existing) {
        groups.push(group(["roleOffset"], [{
          type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_ROLE_OFFSET,
          dimensionId,
          postType,
          role:roleOffset.role,
          dx:null,
        }]));
      }
    } else if (Number.isFinite(roleOffset.dx) && Number.isFinite(roleOffset.dy)) {
      // (Item 1 — additive remedy delta) A `move clear` remedy emits {add:true} with a delta
      // measured against the role's CURRENT drawn box. Sum it onto the stored offset (which the
      // drawn box already reflects) so the flagged element lands exactly at the clear point, and
      // keep the role's existing frozen pin (bx/by) intact. A plain drag emits no `add` and SETS.
      const additive = roleOffset.add === true && existing;
      groups.push(group(["roleOffset"], [{
        type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_ROLE_OFFSET,
        dimensionId,
        postType,
        role:roleOffset.role,
        dx:additive ? (existing.dx||0)+roleOffset.dx : roleOffset.dx,
        dy:additive ? (existing.dy||0)+roleOffset.dy : roleOffset.dy,
        bx:additive ? existing.bx : roleOffset.bx,
        by:additive ? existing.by : roleOffset.by,
      }]));
    }
  }
  return groups;
}
