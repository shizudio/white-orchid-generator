export const COPY_AUTHOR_FIELDS = Object.freeze([
  "headline",
  "subtext",
  "attribution",
  "dateText",
  "microLabel",
  "pillText",
]);

const trailingFunctionWord = /\b(?:and|or|but|nor|yet|so|for|of|to|in|on|at|by|as|with|from|into|the|a|an|our|your|their|its|his|her|is|are|was|were|be|been)\s*$/i;
const cleanEnding = /[.!?…]["')\]]?$/;

/**
 * A deterministic word-boundary trim must not turn complete authored copy into
 * an unreadable fragment. In that case the renderer receives the authored copy
 * and may either fit it whole or offer an explicit tightening remedy.
 */
export function shouldRetainAuthoredCopy(authored, fitted) {
  if (typeof authored !== "string" || typeof fitted !== "string" || fitted === authored) return false;
  if (cleanEnding.test(fitted)) return false;
  const words = fitted.split(/\s+/).filter(Boolean).length;
  return words < 4 || fitted.length < 16 || trailingFunctionWord.test(fitted);
}

/** Normalize an incoming patch before any command or workflow planning occurs. */
export function prepareDesignPatch(patch, {
  uiSource = false,
  currentArchetypeId = null,
  currentDimensionId = "ig_portrait",
  currentPostType = "photo_logo",
  copyAuthors = {},
  archetypeIds = [],
  dimensionIds = [],
  postTypes = [],
  getCopyBudgets,
  fitCopy,
} = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  const normalized = patch.backdropMode === "gradient"
    ? { ...patch, backdropMode:"auto" }
    : { ...patch };
  if (uiSource || typeof getCopyBudgets !== "function" || typeof fitCopy !== "function") return normalized;

  const targetArchetypeId = archetypeIds.includes(normalized.archetypeId)
    ? normalized.archetypeId
    : currentArchetypeId;
  const targetDimensionId = dimensionIds.includes(normalized.dimensionId)
    ? normalized.dimensionId
    : currentDimensionId;
  const targetPostType = postTypes.includes(normalized.postType)
    ? normalized.postType
    : currentPostType;
  const budgets = getCopyBudgets(targetArchetypeId,targetDimensionId,targetPostType) || {};

  for (const field of COPY_AUTHOR_FIELDS) {
    if (typeof normalized[field] !== "string" || copyAuthors?.[field] === "owner" || !Number.isFinite(budgets[field])) continue;
    const authored = normalized[field];
    const fitted = fitCopy(authored,budgets[field]);
    normalized[field] = shouldRetainAuthoredCopy(authored,fitted) ? authored : fitted;
  }
  return normalized;
}

/** Continuous geometry patches must never trigger the discrete canvas settle. */
export function isContinuousDesignPatch(patch) {
  if (!patch || typeof patch !== "object") return false;
  return ["textLayout","photoTransform","roleOffset","logoFree"].some(key => key in patch);
}

/** Classify an owner patch for the post-edit harmonizer's restraint policy. */
export function designPatchInteractionTags(patch) {
  if (!patch || typeof patch !== "object") return [];
  const tags = new Set();
  if (patch.logoId || patch.logoPosition || patch.logoSize || "logoFree" in patch || "hideLogo" in patch) tags.add("logo");
  if (patch.bgColor || patch.textColorId || patch.backdropMode || typeof patch.bgAlpha === "number") tags.add("colour");
  if (patch.textLayout || patch.resetTextLayout || patch.roleOffset || patch.fontSizes ||
      typeof patch.headline === "string" || typeof patch.subtext === "string" ||
      typeof patch.attribution === "string" || typeof patch.dateText === "string" ||
      typeof patch.microLabel === "string" || typeof patch.pillText === "string") tags.add("text");
  if (patch.overlayUpdate || patch.resetOverlay || patch.addOverlay || patch.removeOverlay ||
      patch.removeOverlays || patch.replaceShapeCollection || patch.mediaHostShapeId ||
      patch.furnitureUpdate) tags.add("overlay");
  if (patch.photoTransform || patch.imageSrc || patch.removeImage || patch.mediaKind ||
      patch.photoTreatment || patch.photoFrameType) tags.add("photo");
  if (patch.resetFormatToMaster) ["text","logo","photo","overlay"].forEach(tag=>tags.add(tag));
  return [...tags];
}

/** Resolve all post-execution policy from the actual reducer-confirmed fields. */
export function resolveDesignPatchCompletion({patch,appliedFields,options={}}={}) {
  const fields=Array.isArray(appliedFields)?appliedFields:[];
  const amendUndo=options.amendUndo===true;
  const copyFields=fields.filter(field=>COPY_AUTHOR_FIELDS.includes(field));
  return {
    clearPhotoSelection:options.uiSource!==true&&options.preserveSelection!==true,
    harmonizer:options.harmonize===true&&!amendUndo?{
      armed:true,
      rounds:0,
      applied:[],
      avoidLogoGeo:patch?.logoPosition!=null||patch?.logoSize!=null,
    }:null,
    authorship:copyFields.length?{
      fields:copyFields,
      author:options.uiSource===true?"owner":"ai",
    }:null,
    commitHistory:!amendUndo&&fields.length>0,
  };
}
