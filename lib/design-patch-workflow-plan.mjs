import {
  planFormatResetWorkflow,
  planFurniturePatchWorkflow,
  planLogoPatchWorkflow,
  planMediaSourceWorkflow,
  planPhotoTransformWorkflow,
  planShapeCollectionWorkflow,
  planShapeMutationWorkflow,
  planShapePatchWorkflow,
  planTypographyPlacementWorkflow,
} from "./design-composite-workflows.mjs";

/** Resolve non-command editor transitions that bracket the composite plan. */
export function resolveDesignPatchTransitions({
  patch,
  currentArchetypeId = null,
  currentArchetypeVariant = 0,
  currentDimensionId,
  currentPostType,
  currentAttribution = "",
  currentSubtext = "",
  archetypeIds = [],
  dimensionIds = [],
  postTypes = [],
} = {}) {
  if (!patch || typeof patch !== "object") return {archetype:null,dimensionId:null};
  let archetype = null;
  if (patch.archetypeId === "none" && (currentArchetypeId !== null || currentArchetypeVariant !== 0)) {
    archetype={id:"none",context:null};
  } else if (archetypeIds.includes(patch.archetypeId) && (
    patch.archetypeId !== currentArchetypeId ||
    (Number.isInteger(patch.archVariant) && patch.archVariant !== currentArchetypeVariant)
  )) {
    archetype={
      id:patch.archetypeId,
      context:{
        postType:postTypes.includes(patch.postType)?patch.postType:currentPostType,
        attribution:typeof patch.attribution==="string"?patch.attribution:currentAttribution,
        subtext:typeof patch.subtext==="string"?patch.subtext:currentSubtext,
        variant:Number.isInteger(patch.archVariant)?patch.archVariant:0,
      },
    };
  }
  const dimensionId = dimensionIds.includes(patch.dimensionId) && patch.dimensionId !== currentDimensionId
    ? patch.dimensionId
    : null;
  return {archetype,dimensionId};
}

/**
 * Plan every composite portion of one prepared patch in canonical execution
 * order. Direct scalar commands and archetype materialization run on either side
 * of this plan; no document mutation occurs here.
 */
export function planDesignPatchCompositeWorkflows({
  patch,
  logo,
  renderedLogo,
  dimensionId,
  masterDimensionId,
  systemFreeVariables = false,
  uiSource = false,
  currentShapes = [],
  mediaHostShapeId = null,
  overlayAssets = [],
  allowedOverlayAssetIds = [],
  canvasWidth,
  canvasHeight,
  suggestShapePlacement,
  createShapeUid,
  deriveShapeTransform,
  postType,
  resolvedTextLayout,
  defaultTextLayout,
  roleOffsetsByFormat = {},
  hasFormatOverride = false,
  renderedPhotoTransform,
  masterPhotoTransform,
  photoWindowKind = null,
  validColorIds = [],
  archetypeMaterialized = false,
} = {}) {
  if (!patch || typeof patch !== "object") return [];
  // (Task #69 photo-load fix) When THIS SAME patch performed an archetype
  // materialization, the materialization already owns the shape reset boundary
  // (§7c: added shapes clear, the incoming layout's structural frame lands).
  // A model-authored removeOverlays riding the same patch is planned from the
  // STALE pre-materialization shape list and would SHAPES_REPLACE([]) — wiping
  // the fresh layout's media-host frame so the landing photo has nowhere to
  // paint (the photo-less floated_card bug). Suppress it; standalone
  // removeOverlays patches keep today's behavior.
  if (archetypeMaterialized && patch.removeOverlays === true) {
    patch = { ...patch, removeOverlays: false };
  }
  const groups = [];
  const append = planned => { if (Array.isArray(planned) && planned.length) groups.push(...planned); };

  append(planLogoPatchWorkflow({
    patch,
    current:logo,
    rendered:renderedLogo,
    dimensionId,
    masterDimensionId,
    systemFreeVariables,
    uiSource,
  }));
  append(planShapeCollectionWorkflow({patch}));

  const requestedAssetId = patch.addOverlay?.assetId;
  const assets = Array.isArray(overlayAssets) ? overlayAssets : [];
  const assetAllowed = typeof requestedAssetId === "string" && (
    allowedOverlayAssetIds.includes(requestedAssetId) || assets.some(asset=>asset.id===requestedAssetId)
  );
  const resolvedAsset = assetAllowed ? assets.find(asset=>asset.id===requestedAssetId) || null : null;
  const shapeBase = Array.isArray(patch.replaceShapeCollection) ? patch.replaceShapeCollection : currentShapes;
  append(planShapePatchWorkflow({
    patch,
    currentShapes:shapeBase,
    resolvedAsset,
    suggestedTransform:resolvedAsset && typeof suggestShapePlacement === "function"
      ? suggestShapePlacement(resolvedAsset.kind,resolvedAsset.ratio,canvasWidth,canvasHeight)
      : null,
    uid:resolvedAsset && typeof createShapeUid === "function" ? createShapeUid() : null,
    uiSource,
  }));
  append(planTypographyPlacementWorkflow({
    patch,
    dimensionId,
    masterDimensionId,
    postType,
    resolvedLayout:resolvedTextLayout,
    defaultLayout:defaultTextLayout,
    roleOffsetsByFormat,
  }));
  append(planFormatResetWorkflow({patch,masterDimensionId,hasOverride:hasFormatOverride}));
  append(planPhotoTransformWorkflow({
    patch:patch.photoTransform,
    dimensionId,
    masterDimensionId,
    renderedTransform:renderedPhotoTransform,
    masterTransform:masterPhotoTransform,
    windowKind:photoWindowKind,
  }));

  const shapeUpdateTarget = currentShapes.find(shape=>shape.uid===patch.overlayUpdate?.uid);
  const shapeUpdateAsset = shapeUpdateTarget
    ? assets.find(asset=>asset.id===shapeUpdateTarget.assetId)
    : null;
  const transformBase = shapeUpdateTarget
    ? (shapeUpdateTarget.byDim?.[dimensionId] || (typeof deriveShapeTransform === "function"
      ? deriveShapeTransform(shapeUpdateTarget.master,shapeUpdateAsset?.kind||"center",shapeUpdateAsset?.ratio||1,canvasWidth,canvasHeight)
      : shapeUpdateTarget.master || {}))
    : {};
  append(planShapeMutationWorkflow({
    patch,
    currentShapes,
    currentMediaHostShapeId:mediaHostShapeId,
    dimensionId,
    masterDimensionId,
    transformBase,
  }));
  append(planMediaSourceWorkflow({patch}));
  append(planFurniturePatchWorkflow({patch,validColorIds}));
  return groups;
}
