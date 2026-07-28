import {
  DESIGN_LAYER_CONTRACT_VERSION,
  SHAPE_RENDER_MODES,
  SHAPE_ROLES,
  isMediaHostShape,
  normalizeShapeLayerContract,
  resolveMediaHostShapeId,
} from "./design-layer-contract.mjs";
import {
  canTransitionClass,
  classExclusiveReason,
  isElementClass,
  isElementFlow,
  isElementRegister,
  isElementSizeStep,
  normalizeTextElement,
  normalizeTextElements,
  projectTextElements,
  resolveTextElements,
  LEGACY_ROLE_NULLABLE,
  LEGACY_ROLE_ORDER,
} from "./text-elements.mjs";
import { slotFillTargetForClass } from "./text-slot-fill.mjs";
import { sanctionedRegistersForClass } from "./typography-config.mjs";
import { normalizeGlobalSizeStep } from "./type-scale.mjs";

export const DESIGN_DOCUMENT_SCHEMA_VERSION = 1;

export const DESIGN_COMMAND_TYPES = Object.freeze({
  DOCUMENT_REPLACE: "document/replace",
  CONTENT_SET: "content/set",
  CONTENT_SET_AUTHORSHIP: "content/set-authorship",
  CONTENT_STAMP_AUTHORSHIP: "content/stamp-authorship",
  CONTENT_ADD_ELEMENT: "content/add-element",
  CONTENT_REMOVE_ELEMENT: "content/remove-element",
  CONTENT_SET_ELEMENT_TEXT: "content/set-element-text",
  CONTENT_SET_ELEMENT_CLASS: "content/set-element-class",
  CONTENT_SET_ELEMENT_PRIORITY: "content/set-element-priority",
  CONTENT_SET_ELEMENT_SIZE: "content/set-element-size",
  CONTENT_PIN_ELEMENT_SIZE: "content/pin-element-size",
  CONTENT_SET_ELEMENT_REGISTER: "content/set-element-register",
  CONTENT_SET_ELEMENT_FLOW: "content/set-element-flow",
  PALETTE_SET: "palette/set",
  PALETTE_SYNC_PINS: "palette/sync-pins",
  PALETTE_SET_PINS: "palette/set-pins",
  COMPOSITION_SET: "composition/set",
  TYPOGRAPHY_SET: "typography/set",
  TYPOGRAPHY_SET_GLOBAL_SIZE_STEP: "typography/set-global-size-step",
  TYPOGRAPHY_SET_FONT_SIZE_PIN: "typography/set-font-size-pin",
  TYPOGRAPHY_MERGE_FONT_SIZES: "typography/merge-font-sizes",
  TYPOGRAPHY_MERGE_MASTER_LAYOUT: "typography/merge-master-layout",
  TYPOGRAPHY_SET_FORMAT_LAYOUT: "typography/set-format-layout",
  TYPOGRAPHY_RESET_LAYOUT: "typography/reset-layout",
  TYPOGRAPHY_SET_ROLE_OFFSET: "typography/set-role-offset",
  TYPOGRAPHY_RESET_FORMAT: "typography/reset-format",
  MEDIA_SET: "media/set",
  MEDIA_SET_SOURCE: "media/set-source",
  MEDIA_MERGE_MASTER_TRANSFORM: "media/merge-master-transform",
  MEDIA_MERGE_FORMAT_TRANSFORM: "media/merge-format-transform",
  MEDIA_PIN_FORMAT: "media/pin-format",
  MEDIA_RESET_TRANSFORMS: "media/reset-transforms",
  MEDIA_RESET_FORMAT: "media/reset-format",
  LOGO_SET: "logo/set",
  LOGO_MERGE_MASTER_PLACEMENT: "logo/merge-master-placement",
  LOGO_MERGE_FORMAT_PLACEMENT: "logo/merge-format-placement",
  LOGO_RESET_FORMAT: "logo/reset-format",
  SHAPE_ADD: "shape/add",
  SHAPES_REPLACE: "shapes/replace",
  SHAPE_UPDATE: "shape/update",
  SHAPE_SET_MEDIA_HOST: "shape/set-media-host",
  SHAPE_UPDATE_TRANSFORM: "shape/update-transform",
  SHAPE_RESET_FORMAT: "shape/reset-format",
  SHAPE_REMOVE: "shape/remove",
  FURNITURE_SET: "furniture/set",
  FURNITURE_UPDATE: "furniture/update",
  FORMAT_SET_OVERRIDE: "format/set-override",
  FORMAT_RESET_TO_MASTER: "format/reset-to-master",
  ACKNOWLEDGEMENT_SET: "acknowledgement/set",
});

const DESIGN_COMMAND_TYPE_SET = new Set(Object.values(DESIGN_COMMAND_TYPES));

/**
 * Runtime boundary for commands arriving from UI, AI, restore, or tests.
 * Payload validation remains family-specific inside applyDesignCommand as each
 * vertical slice becomes executable.
 */
export function isDesignCommand(command) {
  return isObject(command) && DESIGN_COMMAND_TYPE_SET.has(command.type);
}

export const CONTENT_FIELDS = Object.freeze([
  "headline",
  "subtext",
  "attribution",
  "dateText",
  "microLabel",
  "pillText",
]);

export const PALETTE_FIELDS = Object.freeze([
  "background",
  "field",
  "text",
  "backdrop",
  "backgroundOpacity",
]);

const CONTENT_FIELD_SET = new Set(CONTENT_FIELDS);
const PALETTE_FIELD_SET = new Set(PALETTE_FIELDS);
const COMPOSITION_FIELD_SET = new Set(["postType", "archetypeId", "archetypeVariant", "mediaHostShapeId"]);
const TYPOGRAPHY_FIELD_SET = new Set([
  "heroRegister",
  "fontSizes",
  "masterLayouts",
  "formatLayouts",
  "roleOffsetsByFormat",
]);

/** True when a format contains an owner-authored override worth resetting. */
export function hasUserFormatOverride(document, dimensionId, masterDimensionId) {
  if (!document || !dimensionId || dimensionId === masterDimensionId) return false;
  const typography = document.typography || {};
  const media = document.media || {};
  const logo = document.logo || {};
  if (Object.keys(typography.formatLayouts?.[dimensionId] || {}).length) return true;
  if (Object.keys(typography.roleOffsetsByFormat?.[dimensionId] || {}).length) return true;
  if (media.formatTransforms?.[dimensionId] || media.formatPins?.[dimensionId]) return true;
  if (logo.formatPlacements?.[dimensionId]) return true;
  return (document.shapes || []).some(shape => shape?.byDim?.[dimensionId]
    && (shape.origin !== "layout" || shape.touchedByDim?.[dimensionId]));
}
const MEDIA_OBJECT_FIELDS = new Set(["frame", "masterTransform", "formatTransforms", "formatPins"]);
const MEDIA_FIELD_SET = new Set(["kind", "treatment", ...MEDIA_OBJECT_FIELDS]);
const LOGO_FIELD_SET = new Set(["assetId", "variantPinned", "hidden", "placementPinned", "masterPlacement", "formatPlacements"]);
const DEFAULT_MEDIA_TRANSFORM = Object.freeze({ zoom:1, cx:0.5, cy:0.5, rotation:0 });

export function normalizeShapeInstances(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((shape, index) => normalizeShapeLayerContract({
    ...clone(shape),
    uid:String(shape.uid || shape.id || `shape:${shape.assetId || "unknown"}:${index}`),
  }));
}
const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const text = (value, fallback = "") => typeof value === "string" ? value : fallback;
const nullableText = (value, fallback = null) => value === null || typeof value === "string" ? value : fallback;
const object = value => isObject(value) ? clone(value) : {};
const opacity = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
const sameValue = (left, right) => {
  if (Object.is(left,right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value,index)=>sameValue(value,right[index]));
  }
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) return false;
    const leftKeys=Object.keys(left).sort();
    const rightKeys=Object.keys(right).sort();
    return leftKeys.length===rightKeys.length
      && leftKeys.every((key,index)=>key===rightKeys[index]&&sameValue(left[key],right[key]));
  }
  return false;
};

export function createDesignDocumentV1(source = {}) {
  const canonical = source.schemaVersion === DESIGN_DOCUMENT_SCHEMA_VERSION && isObject(source.content);
  const contentSource = canonical ? source.content : source;
  const paletteSource = canonical && isObject(source.palette) ? source.palette : source;
  const compositionSource = canonical && isObject(source.composition) ? source.composition : source;
  const typographySource = isObject(source.typography) ? source.typography : source;
  const mediaSource = isObject(source.media) ? source.media : source;
  const logoSource = isObject(source.logo) ? source.logo : source;
  const shapes = normalizeShapeInstances(source.shapes ?? source.overlayLayers);
  const requestedMediaHost = compositionSource.mediaHostShapeId ?? source.mediaHostShapeId ?? null;
  const authorship = object(contentSource.authorship ?? source.copyAuthors);

  return {
    schemaVersion: DESIGN_DOCUMENT_SCHEMA_VERSION,
    layerContractVersion: DESIGN_LAYER_CONTRACT_VERSION,
    content: {
      headline: text(contentSource.headline),
      subtext: text(contentSource.subtext),
      attribution: text(contentSource.attribution),
      dateText: text(contentSource.dateText),
      microLabel: nullableText(contentSource.microLabel),
      pillText: nullableText(contentSource.pillText),
      authorship,
      // (text-elements-spec §1) Dynamic, brand-governed content roles. Additive:
      // canonical docs preserve their stored collection; legacy docs derive it from
      // the fixed roles above. The renderer does not read this in Slice 1 (migration
      // invisible — guard battery D fingerprint stays 144/144).
      elements: resolveTextElements(contentSource, authorship),
    },
    composition: {
      postType: text(compositionSource.postType, "photo_logo"),
      archetypeId: compositionSource.archetypeId ?? null,
      archetypeVariant: Number.isInteger(compositionSource.archetypeVariant)
        ? compositionSource.archetypeVariant
        : Number.isInteger(source.archVariant) ? source.archVariant : 0,
      mediaHostShapeId: resolveMediaHostShapeId(shapes, requestedMediaHost),
    },
    palette: {
      background: text(paletteSource.background ?? source.bgColor, "burnham"),
      field: paletteSource.field ?? source.fieldColorOverride ?? null,
      text: text(paletteSource.text ?? source.textColorId, "auto"),
      backdrop: (paletteSource.backdrop ?? source.backdropMode) === "gradient"
        ? "auto"
        : text(paletteSource.backdrop ?? source.backdropMode, "auto"),
      backgroundOpacity: opacity(paletteSource.backgroundOpacity ?? source.bgAlpha),
      pins: object(paletteSource.pins ?? source.pinnedProps),
    },
    typography: {
      heroRegister: text(typographySource.heroRegister),
      // (Global hierarchical size — client ruling 2026-07-23) One document-level S/M/L
      // that scales ALL text hierarchically; "M" is the pixel-invariant default. Per-role
      // / per-element pins in fontSizes / element.master.sizeStep override it (law 5).
      globalSizeStep: normalizeGlobalSizeStep(typographySource.globalSizeStep),
      // (Global hierarchical size) Which legacy roles the user PINNED — a pinned role
      // ignores globalSizeStep (law 5). Default {} → every role follows the global step
      // composed on its generated base. Element pins live on element.pins.sizeStep.
      fontSizePins: object(typographySource.fontSizePins),
      fontSizes: object(typographySource.fontSizes),
      masterLayouts: object(typographySource.masterLayouts ?? source.typeLayouts),
      formatLayouts: object(typographySource.formatLayouts ?? source.typeLayoutsByDim),
      roleOffsetsByFormat: object(typographySource.roleOffsetsByFormat ?? source.roleOffsetsByDim),
    },
    media: {
      source: typeof (mediaSource.source ?? source.imageSrc ?? source.image) === "string"
        ? (mediaSource.source ?? source.imageSrc ?? source.image)
        : null,
      kind: text(mediaSource.kind ?? source.mediaKind, "image"),
      treatment: text(mediaSource.treatment ?? source.photoTreatment, "none"),
      frame: isObject(mediaSource.frame ?? source.photoFrame) ? object(mediaSource.frame ?? source.photoFrame) : { type:"none" },
      masterTransform: isObject(mediaSource.masterTransform ?? source.imgT)
        ? { ...DEFAULT_MEDIA_TRANSFORM, ...object(mediaSource.masterTransform ?? source.imgT) }
        : { ...DEFAULT_MEDIA_TRANSFORM },
      formatTransforms: object(mediaSource.formatTransforms ?? source.imgTByDim),
      formatPins: object(mediaSource.formatPins ?? source.photoTouchedByDim),
    },
    logo: {
      assetId: text(logoSource.assetId ?? source.selectedLogoId, "p3-ivory"),
      variantPinned: !!(logoSource.variantPinned ?? source.logoVariantTouched),
      hidden: !!(logoSource.hidden ?? source.logoHidden),
      placementPinned: !!(logoSource.placementPinned ?? source.userLogoTouched),
      masterPlacement: {
        position:text(logoSource.masterPlacement?.position ?? source.logoPosition, "bottom-center"),
        sizeId:text(logoSource.masterPlacement?.sizeId ?? source.logoSize, "m"),
        free:isObject(logoSource.masterPlacement?.free ?? source.logoFreePos) ? object(logoSource.masterPlacement?.free ?? source.logoFreePos) : null,
      },
      formatPlacements:object(logoSource.formatPlacements ?? source.logoByDim),
    },
    shapes,
    furniture: isObject(source.furniture) ? object(source.furniture) : { overrides:object(source.furnitureOverrides) },
    pins: object(source.pins),
    acknowledgements: Array.isArray(source.acknowledgements) ? clone(source.acknowledgements) : [],
  };
}

export function migrateDesignDocument(source) {
  if (!isObject(source)) return createDesignDocumentV1();
  if (source.schemaVersion == null || source.schemaVersion === 1) return createDesignDocumentV1(source);
  throw new Error(`Unsupported design document schema version: ${source.schemaVersion}`);
}

export function validateDesignDocument(document) {
  const errors = [];
  if (!isObject(document)) return { valid:false, errors:["document must be an object"] };
  if (document.schemaVersion !== DESIGN_DOCUMENT_SCHEMA_VERSION) errors.push("schemaVersion must be 1");
  if (document.layerContractVersion !== DESIGN_LAYER_CONTRACT_VERSION) errors.push(`layerContractVersion must be ${DESIGN_LAYER_CONTRACT_VERSION}`);
  if (!isObject(document.content)) errors.push("content must be an object");
  if (!isObject(document.palette)) errors.push("palette must be an object");
  if (!isObject(document.composition)) errors.push("composition must be an object");
  if (!isObject(document.typography)) errors.push("typography must be an object");
  else if (document.typography.globalSizeStep !== undefined
    && !["S", "M", "L"].includes(document.typography.globalSizeStep)) {
    errors.push(`typography.globalSizeStep must be S, M or L: ${document.typography.globalSizeStep}`);
  }
  if (!isObject(document.media)) errors.push("media must be an object");
  if (!isObject(document.logo)) errors.push("logo must be an object");
  if (document.composition?.mediaHostShapeId != null) {
    const host = document.shapes?.find(shape => shape.uid === document.composition.mediaHostShapeId);
    if (!host || !isMediaHostShape(host)) errors.push("composition.mediaHostShapeId must reference an image-frame shape");
  }
  for (const field of CONTENT_FIELDS) {
    const value = document.content?.[field];
    if (field === "microLabel" || field === "pillText") {
      if (value !== null && typeof value !== "string") errors.push(`content.${field} must be a string or null`);
    } else if (typeof value !== "string") errors.push(`content.${field} must be a string`);
  }
  if (!Number.isFinite(document.palette?.backgroundOpacity) || document.palette.backgroundOpacity < 0 || document.palette.backgroundOpacity > 1) {
    errors.push("palette.backgroundOpacity must be between 0 and 1");
  }
  if (document.content?.elements !== undefined) {
    if (!Array.isArray(document.content.elements)) {
      errors.push("content.elements must be an array");
    } else {
      const seen = new Set();
      for (const element of document.content.elements) {
        if (!isObject(element)) { errors.push("content.elements entries must be objects"); continue; }
        if (!isElementClass(element.class)) errors.push(`content.elements class must be one of the five sanctioned classes: ${element.class}`);
        if (element.register != null && !isElementRegister(element.register)) errors.push(`content.elements register must be null or a sanctioned register: ${element.register}`);
        if (typeof element.uid !== "string" || !element.uid) errors.push("content.elements entries must carry a string uid");
        else if (seen.has(element.uid)) errors.push(`content.elements uid must be unique: ${element.uid}`);
        else seen.add(element.uid);
      }
    }
  }
  return { valid:errors.length === 0, errors };
}

// (Phase B) The content-field paths whose write re-projects the element collection.
const LEGACY_ROLE_FIELD_PATHS = new Set(LEGACY_ROLE_ORDER.map(field => `content.${field}`));
// The legacy content FIELD a uid identifies, when that uid is a migrated role element.
// `sourceRole` IS the field name (lib/text-elements.mjs LEGACY_ROLE_ORDER).
function legacyRoleFieldOf(document, uid) {
  const element = document.content.elements.find(item => item.uid === uid);
  const role = element && element.sourceRole;
  return role && LEGACY_ROLE_ORDER.includes(role) ? role : null;
}

export function applyDesignCommand(document, command) {
  const current = migrateDesignDocument(document);
  let next = current;
  const changedPaths = [];

  if (command?.type === DESIGN_COMMAND_TYPES.DOCUMENT_REPLACE) {
    next = migrateDesignDocument(command.document);
    return { document:next, changedPaths:["document"] };
  }

  if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_SET && CONTENT_FIELD_SET.has(command.field)) {
    const nullable = command.field === "microLabel" || command.field === "pillText";
    if ((nullable && command.value === null) || typeof command.value === "string") {
      if (current.content[command.field] !== command.value) {
        next = { ...current, content:{ ...current.content, [command.field]:command.value } };
        changedPaths.push(`content.${command.field}`);
      }
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_SET_AUTHORSHIP && isObject(command.authorship)) {
    const authorship = object(command.authorship);
    if (JSON.stringify(authorship) !== JSON.stringify(current.content.authorship)) {
      next = { ...current, content:{ ...current.content, authorship } };
      changedPaths.push("content.authorship");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.COMPOSITION_SET && COMPOSITION_FIELD_SET.has(command.field)) {
    const value = command.field === "archetypeVariant"
      ? (Number.isInteger(command.value) ? command.value : 0)
      : command.field === "archetypeId" || command.field === "mediaHostShapeId"
        ? (command.value ?? null)
        : text(command.value, "photo_logo");
    if (command.field === "mediaHostShapeId" && value !== null && !current.shapes.some(shape => shape.uid === value && isMediaHostShape(shape))) {
      return { document:current, changedPaths:[] };
    }
    if (current.composition[command.field] !== value) {
      next = { ...current, composition:{ ...current.composition, [command.field]:value } };
      changedPaths.push(`composition.${command.field}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_STAMP_AUTHORSHIP && Array.isArray(command.fields)) {
    const authorship = { ...current.content.authorship };
    for (const field of command.fields) {
      if (!CONTENT_FIELD_SET.has(field)) continue;
      if (command.author === "owner") authorship[field] = "owner";
      else if (command.author === "ai" && authorship[field] !== "owner") authorship[field] = "ai";
    }
    if (JSON.stringify(authorship) !== JSON.stringify(current.content.authorship)) {
      next = { ...current, content:{ ...current.content, authorship } };
      changedPaths.push("content.authorship");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT && isObject(command.element)) {
    /* (TEXT UNIFICATION Phase B — SLOT FILL, docs/text-unification-spec.md §Phase B,
       client ruling 3 "heading-element-fills-the-title-slot") An add whose class matches
       an EMPTY DECLARED slot does not birth a second, parallel text — it BECOMES that
       slot's role. The add compiles into a write of the role's content field, which is
       the whole merge: the role's storage IS the element's storage, so there is exactly
       one thing to paint (the archetype slot), one thing to persist, and one undo step.
       The projection at the foot of this reducer republishes the collection, so the
       caller still gets an element identity back (`content.elements.legacy:<field>`).
       An add carrying an explicit uid is a replay/restore and is never reinterpreted. */
    /* (Amendment 2026-07-27 ruling 2 — CLASS-EXCLUSIVE ADDS) One of each class,
       maximum. "In use" counts filled legacy-role projections AND added elements —
       content.elements IS that one merged truth. The bound lives HERE, in the one
       reducer both the UI picker and the AI's addTextElement compile into, so the
       two entry points can never drift. A refusal is never a silent no-op (M2): the
       result carries the ratified tap-reason (`refusal`) for the caller to surface —
       the picker's inert note, the chat's honest reply. An add carrying an explicit
       uid is a replay/restore of stored work and is exempt (grandfathered documents
       with duplicate classes must keep round-tripping losslessly). */
    if (!command.element.uid && isElementClass(command.element.class)
        && current.content.elements.some(element => element.class === command.element.class)) {
      return { document:current, changedPaths:[], refusal:{
        command:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
        class:command.element.class,
        reason:classExclusiveReason(command.element.class),
      } };
    }
    const fillText = typeof command.element.text === "string" ? command.element.text : "";
    const fill = (!command.element.uid && isElementClass(command.element.class) && fillText.trim())
      ? slotFillTargetForClass(current, command.element.class) : null;
    const used = new Set(current.content.elements.map(element => element.uid));
    if (fill) {
      next = { ...current, content:{ ...current.content, [fill.field]:fillText } };
      changedPaths.push(`content.${fill.field}`, `content.elements.legacy:${fill.field}`);
    } else {
    const hadUid = typeof command.element.uid === "string" && command.element.uid;
    let element = normalizeTextElement(command.element, current.content.elements.length);
    if (element) {
      if (!hadUid) {
        let n = current.content.elements.length;
        while (used.has(`el_${element.class}_${n}`)) n++;
        element = { ...element, uid:`el_${element.class}_${n}` };
      }
      if (!used.has(element.uid)) {
        const elements = [...current.content.elements, element];
        next = { ...current, content:{ ...current.content, elements } };
        changedPaths.push(`content.elements.${element.uid}`);
      }
    }
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_REMOVE_ELEMENT && command.uid) {
    // (Phase B — ONE IDENTITY) Removing a MIGRATED role's element clears the role's
    // field; the projection then retires the element. Same action, same undo, whether
    // the text was born as a role or as an element.
    const migrated = legacyRoleFieldOf(current, command.uid);
    if (migrated) {
      const blank = LEGACY_ROLE_NULLABLE.includes(migrated) ? null : "";
      if (current.content[migrated] !== blank) {
        next = { ...current, content:{ ...current.content, [migrated]:blank } };
        changedPaths.push(`content.${migrated}`);
      }
    } else {
      const elements = current.content.elements.filter(element => element.uid !== command.uid);
      if (elements.length !== current.content.elements.length) {
        next = { ...current, content:{ ...current.content, elements } };
        changedPaths.push(`content.elements.${command.uid}`);
      }
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_TEXT && command.uid && typeof command.value === "string") {
    // (Phase B — ONE IDENTITY) Editing a MIGRATED role's element writes the ROLE's
    // field. There is no second copy to drift out of sync.
    const migrated = legacyRoleFieldOf(current, command.uid);
    const target = current.content.elements.find(element => element.uid === command.uid);
    if (migrated) {
      if (current.content[migrated] !== command.value) {
        next = { ...current, content:{ ...current.content, [migrated]:command.value } };
        changedPaths.push(`content.${migrated}`);
      }
    } else if (target && target.text !== command.value) {
      const elements = current.content.elements.map(element =>
        element.uid === command.uid ? { ...element, text:command.value } : element);
      next = { ...current, content:{ ...current.content, elements } };
      changedPaths.push(`content.elements.${command.uid}.text`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_CLASS && command.uid && isElementClass(command.value)) {
    const target = current.content.elements.find(element => element.uid === command.uid);
    // Allowed transitions only (spec §1): sanctioned class, and never a no-op self-set.
    if (target && canTransitionClass(target.class, command.value)) {
      // (Font Ruling B) A pinned register that is no longer sanctioned for the NEW class is
      // dropped to null (class default) — never carry an orphaned pin across a class change.
      const keepRegister = target.register && sanctionedRegistersForClass(undefined, command.value).includes(target.register)
        ? target.register : null;
      const elements = current.content.elements.map(element =>
        element.uid === command.uid ? { ...element, class:command.value, register:keepRegister } : element);
      next = { ...current, content:{ ...current.content, elements } };
      changedPaths.push(`content.elements.${command.uid}.class`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_PRIORITY && command.uid && Number.isFinite(command.value)) {
    const target = current.content.elements.find(element => element.uid === command.uid);
    if (target && target.priority !== command.value) {
      const elements = current.content.elements.map(element =>
        element.uid === command.uid ? { ...element, priority:command.value } : element);
      next = { ...current, content:{ ...current.content, elements } };
      changedPaths.push(`content.elements.${command.uid}.priority`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_SIZE && command.uid && isElementSizeStep(command.value)) {
    // (spec §2) S/M/L is the only size freedom — a sanctioned step on the element's
    // master placement (master→byDim inheritance; the renderer reads master.sizeStep,
    // pins overriding). Setting the same step is a no-op (no dead undo entry / M2).
    const target = current.content.elements.find(element => element.uid === command.uid);
    if (target && (target.master?.sizeStep || "M") !== command.value) {
      const elements = current.content.elements.map(element =>
        element.uid === command.uid ? { ...element, master:{ ...element.master, sizeStep:command.value } } : element);
      next = { ...current, content:{ ...current.content, elements } };
      changedPaths.push(`content.elements.${command.uid}.master.sizeStep`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_PIN_ELEMENT_SIZE && command.uid
             && (command.value === null || isElementSizeStep(command.value))) {
    // (Global hierarchical size) PIN or clear an element's S/M/L. A pinned step lives on
    // element.pins.sizeStep and OVERRIDES the global step (law 5); `null` clears the pin so
    // the element rejoins the global step (its master.sizeStep base follows it). The
    // generated base stays on master.sizeStep untouched. Same-value = no-op (M2).
    const target = current.content.elements.find(element => element.uid === command.uid);
    if (target) {
      const currentPin = (target.pins && target.pins.sizeStep) ?? null;
      const nextPin = command.value;
      if (currentPin !== nextPin) {
        const elements = current.content.elements.map(element => {
          if (element.uid !== command.uid) return element;
          const pins = { ...(element.pins || {}) };
          if (nextPin === null) delete pins.sizeStep; else pins.sizeStep = nextPin;
          return { ...element, pins };
        });
        next = { ...current, content:{ ...current.content, elements } };
        changedPaths.push(`content.elements.${command.uid}.pins.sizeStep`);
      }
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_REGISTER && command.uid
             && (command.value === null || isElementRegister(command.value))) {
    // (Font Ruling B) Pin/clear an element's register. `null` clears the pin (class default);
    // a register STRING must be sanctioned for the element's class — an unsanctioned register
    // is a NO-OP REFUSAL (never a silent wrong pin, never a throw). Validated against the
    // default config's per-class allowlist (the document is brand-agnostic; a brand's own
    // allowlist can only be a superset of what the render side knows). Same-value = no-op (M2).
    const target = current.content.elements.find(element => element.uid === command.uid);
    if (target) {
      const nextRegister = command.value === null ? null
        : (sanctionedRegistersForClass(undefined, target.class).includes(command.value) ? command.value : undefined);
      if (nextRegister !== undefined && (target.register ?? null) !== nextRegister) {
        const elements = current.content.elements.map(element =>
          element.uid === command.uid ? { ...element, register:nextRegister } : element);
        next = { ...current, content:{ ...current.content, elements } };
        changedPaths.push(`content.elements.${command.uid}.register`);
      }
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_FLOW && command.uid
             && (command.value === null || isElementFlow(command.value))) {
    // (Amendment 2026-07-27 ruling 3 — BODY SECTIONS INTERNALLY) Set/clear the element's
    // paragraph-flow choice: "stacked" (vertical) or "columns" (side by side) within the
    // ONE element. Rides the standard property infra — master.flow, or byDim[dim].flow
    // when the command names a format — so it survives re-solves and round-trips like
    // sizeStep. `null` clears back to the default (stacked). Works identically on a
    // migrated body (`legacy:subtext`) and an added one: the projection preserves
    // master/byDim from the stored entry (one identity). Same value = no-op (M2).
    const target = current.content.elements.find(element => element.uid === command.uid);
    if (target) {
      const dimensionId = typeof command.dimensionId === "string" && command.dimensionId ? command.dimensionId : null;
      const currentFlow = dimensionId
        ? ((target.byDim?.[dimensionId]?.flow) ?? null)
        : ((target.master?.flow) ?? null);
      if (currentFlow !== command.value) {
        const elements = current.content.elements.map(element => {
          if (element.uid !== command.uid) return element;
          if (dimensionId) {
            const dim = { ...(element.byDim?.[dimensionId] || {}) };
            if (command.value === null) delete dim.flow; else dim.flow = command.value;
            return { ...element, byDim:{ ...(element.byDim || {}), [dimensionId]:dim } };
          }
          const master = { ...(element.master || {}) };
          if (command.value === null) delete master.flow; else master.flow = command.value;
          return { ...element, master };
        });
        next = { ...current, content:{ ...current.content, elements } };
        changedPaths.push(dimensionId
          ? `content.elements.${command.uid}.byDim.${dimensionId}.flow`
          : `content.elements.${command.uid}.master.flow`);
      }
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.PALETTE_SET && PALETTE_FIELD_SET.has(command.field)) {
    const value = command.field === "backgroundOpacity" ? opacity(command.value) : command.value;
    const valid = command.field === "field" ? value === null || typeof value === "string" :
      command.field === "backgroundOpacity" ? Number.isFinite(command.value) : typeof value === "string";
    if (valid && current.palette[command.field] !== value) {
      next = { ...current, palette:{ ...current.palette, [command.field]:value } };
      changedPaths.push(`palette.${command.field}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.PALETTE_SYNC_PINS && isObject(command.patch)) {
    const pins = { ...current.palette.pins };
    for (const [field, value] of Object.entries(command.patch)) {
      if (value) pins[field] = true;
      else delete pins[field];
    }
    if (JSON.stringify(pins) !== JSON.stringify(current.palette.pins)) {
      next = { ...current, palette:{ ...current.palette, pins } };
      changedPaths.push("palette.pins");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.PALETTE_SET_PINS && isObject(command.pins)) {
    const pins = object(command.pins);
    if (JSON.stringify(pins) !== JSON.stringify(current.palette.pins)) {
      next = { ...current, palette:{ ...current.palette, pins } };
      changedPaths.push("palette.pins");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET && TYPOGRAPHY_FIELD_SET.has(command.field)) {
    const value = command.field === "heroRegister" ? text(command.value) : object(command.value);
    if (JSON.stringify(value) !== JSON.stringify(current.typography[command.field])) {
      next = { ...current, typography:{ ...current.typography, [command.field]:value } };
      changedPaths.push(`typography.${command.field}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_GLOBAL_SIZE_STEP) {
    // (Global hierarchical size) Set the one document-level S/M/L. Unknown values
    // normalise to "M" (never throws); same value is a no-op (no dead undo entry / M2).
    const value = normalizeGlobalSizeStep(command.value);
    if (current.typography.globalSizeStep !== value) {
      next = { ...current, typography:{ ...current.typography, globalSizeStep:value } };
      changedPaths.push("typography.globalSizeStep");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_FONT_SIZE_PIN && typeof command.role === "string" && command.role) {
    // (Global hierarchical size) Pin/unpin a legacy role's size. `pinned` true records the
    // role in fontSizePins (it then ignores the global step); false clears it (rejoins the
    // global step). Same state = no-op (M2). The role's step itself rides in fontSizes.
    const pins = { ...current.typography.fontSizePins };
    if (command.pinned) pins[command.role] = true; else delete pins[command.role];
    if (JSON.stringify(pins) !== JSON.stringify(current.typography.fontSizePins)) {
      next = { ...current, typography:{ ...current.typography, fontSizePins:pins } };
      changedPaths.push("typography.fontSizePins");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.TYPOGRAPHY_MERGE_FONT_SIZES && isObject(command.patch)) {
    const fontSizes = { ...current.typography.fontSizes, ...object(command.patch) };
    if (JSON.stringify(fontSizes) !== JSON.stringify(current.typography.fontSizes)) {
      next = { ...current, typography:{ ...current.typography, fontSizes } };
      changedPaths.push("typography.fontSizes");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.TYPOGRAPHY_MERGE_MASTER_LAYOUT && command.postType && isObject(command.patch)) {
    const currentLayout = current.typography.masterLayouts[command.postType] || object(command.base);
    const layout = { ...currentLayout, ...object(command.patch) };
    if (!sameValue(layout,current.typography.masterLayouts[command.postType])) {
      const masterLayouts = { ...current.typography.masterLayouts, [command.postType]:layout };
      next = { ...current, typography:{ ...current.typography, masterLayouts } };
      changedPaths.push(`typography.masterLayouts.${command.postType}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_FORMAT_LAYOUT && command.dimensionId && command.postType && (isObject(command.layout) || isObject(command.patch))) {
    const existingLayout = current.typography.formatLayouts[command.dimensionId]?.[command.postType] || object(command.base);
    const layout = isObject(command.patch)
      ? { ...existingLayout, ...object(command.patch) }
      : object(command.layout);
    if (!sameValue(layout,current.typography.formatLayouts[command.dimensionId]?.[command.postType])) {
      const formatLayouts = {
        ...current.typography.formatLayouts,
        [command.dimensionId]:{
          ...(current.typography.formatLayouts[command.dimensionId] || {}),
          [command.postType]:layout,
        },
      };
      next = { ...current, typography:{ ...current.typography, formatLayouts } };
      changedPaths.push(`typography.formatLayouts.${command.dimensionId}.${command.postType}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.TYPOGRAPHY_RESET_LAYOUT && command.postType) {
    if (command.dimensionId && command.dimensionId !== command.masterDimensionId) {
      if (!current.typography.formatLayouts[command.dimensionId]?.[command.postType]) return { document:current, changedPaths:[] };
      const dimensionLayouts = { ...(current.typography.formatLayouts[command.dimensionId] || {}) };
      delete dimensionLayouts[command.postType];
      const formatLayouts = { ...current.typography.formatLayouts, [command.dimensionId]:dimensionLayouts };
      next = { ...current, typography:{ ...current.typography, formatLayouts } };
      changedPaths.push(`typography.formatLayouts.${command.dimensionId}.${command.postType}`);
    } else if (isObject(command.defaultLayout)) {
      const defaultLayout=object(command.defaultLayout);
      if (!sameValue(defaultLayout,current.typography.masterLayouts[command.postType])) {
        const masterLayouts = { ...current.typography.masterLayouts, [command.postType]:defaultLayout };
        next = { ...current, typography:{ ...current.typography, masterLayouts } };
        changedPaths.push(`typography.masterLayouts.${command.postType}`);
      }
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_ROLE_OFFSET && command.dimensionId && command.postType && command.role) {
    const format = current.typography.roleOffsetsByFormat[command.dimensionId] || {};
    const post = format[command.postType] || {};
    const roleOffsetsByFormat = { ...current.typography.roleOffsetsByFormat };
    if (command.dx === null) {
      if (!(command.role in post)) return { document:current, changedPaths:[] };
      const nextPost = { ...post };
      delete nextPost[command.role];
      roleOffsetsByFormat[command.dimensionId] = { ...format, [command.postType]:nextPost };
    } else {
      const existing = post[command.role] || {};
      const offset = { dx:+(command.dx || 0), dy:+(command.dy || 0) };
      const bx = Number.isFinite(command.bx) ? +command.bx : Number.isFinite(existing.bx) ? existing.bx : undefined;
      const by = Number.isFinite(command.by) ? +command.by : Number.isFinite(existing.by) ? existing.by : undefined;
      if (bx !== undefined && by !== undefined) { offset.bx = bx; offset.by = by; }
      roleOffsetsByFormat[command.dimensionId] = {
        ...format,
        [command.postType]:{ ...post, [command.role]:offset },
      };
    }
    if (!sameValue(roleOffsetsByFormat,current.typography.roleOffsetsByFormat)) {
      next = { ...current, typography:{ ...current.typography, roleOffsetsByFormat } };
      changedPaths.push(`typography.roleOffsetsByFormat.${command.dimensionId}.${command.postType}.${command.role}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.TYPOGRAPHY_RESET_FORMAT && command.dimensionId) {
    const formatLayouts = { ...current.typography.formatLayouts };
    const roleOffsetsByFormat = { ...current.typography.roleOffsetsByFormat };
    delete formatLayouts[command.dimensionId];
    delete roleOffsetsByFormat[command.dimensionId];
    next = { ...current, typography:{ ...current.typography, formatLayouts, roleOffsetsByFormat } };
    changedPaths.push(`typography.format:${command.dimensionId}`);
  } else if (command?.type === DESIGN_COMMAND_TYPES.MEDIA_SET && MEDIA_FIELD_SET.has(command.field)) {
    const value = MEDIA_OBJECT_FIELDS.has(command.field) ? object(command.value) : text(command.value);
    if (JSON.stringify(value) !== JSON.stringify(current.media[command.field])) {
      next = { ...current, media:{ ...current.media, [command.field]:value } };
      changedPaths.push(`media.${command.field}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.MEDIA_SET_SOURCE) {
    const source = typeof command.source === "string" && command.source ? command.source : null;
    const reset = command.resetTransforms !== false;
    const media = { ...current.media,
      source,
      ...(reset ? {
        masterTransform:{ ...DEFAULT_MEDIA_TRANSFORM },
        formatTransforms:{},
        formatPins:{},
      } : {}),
    };
    if (!sameValue(media,current.media)) {
      next = { ...current, media };
      if (source !== current.media.source) changedPaths.push("media.source");
      if (reset && (!sameValue(current.media.masterTransform,DEFAULT_MEDIA_TRANSFORM)
        || Object.keys(current.media.formatTransforms).length || Object.keys(current.media.formatPins).length)) changedPaths.push("media.transforms");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.MEDIA_MERGE_MASTER_TRANSFORM && isObject(command.patch)) {
    const masterTransform = { ...current.media.masterTransform, ...object(command.patch) };
    if (!sameValue(masterTransform,current.media.masterTransform)) {
      next = { ...current, media:{ ...current.media, masterTransform } };
      changedPaths.push("media.masterTransform");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.MEDIA_MERGE_FORMAT_TRANSFORM && command.dimensionId && isObject(command.patch)) {
    const base = current.media.formatTransforms[command.dimensionId] || object(command.base);
    const formatTransforms = {
      ...current.media.formatTransforms,
      [command.dimensionId]:{ ...base, ...object(command.patch) },
    };
    if (!sameValue(formatTransforms,current.media.formatTransforms)) {
      next = { ...current, media:{ ...current.media, formatTransforms } };
      changedPaths.push(`media.formatTransforms.${command.dimensionId}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.MEDIA_PIN_FORMAT && command.dimensionId) {
    if (current.media.formatPins[command.dimensionId]) return { document:current, changedPaths:[] };
    const formatPins = { ...current.media.formatPins, [command.dimensionId]:true };
    const seed = isObject(command.seed) ? object(command.seed) : null;
    const isMaster = command.dimensionId === command.masterDimensionId;
    const masterTransform = isMaster && seed
      ? { ...current.media.masterTransform, ...seed }
      : current.media.masterTransform;
    const formatTransforms = !isMaster && seed && !current.media.formatTransforms[command.dimensionId]
      ? { ...current.media.formatTransforms, [command.dimensionId]:{ ...DEFAULT_MEDIA_TRANSFORM, ...seed } }
      : current.media.formatTransforms;
    next = { ...current, media:{ ...current.media, formatPins, masterTransform, formatTransforms } };
    changedPaths.push(`media.formatPins.${command.dimensionId}`);
  } else if (command?.type === DESIGN_COMMAND_TYPES.MEDIA_RESET_TRANSFORMS) {
    next = { ...current, media:{
      ...current.media,
      masterTransform:{ ...DEFAULT_MEDIA_TRANSFORM },
      formatTransforms:{},
      formatPins:{},
    } };
    changedPaths.push("media.transforms");
  } else if (command?.type === DESIGN_COMMAND_TYPES.MEDIA_RESET_FORMAT && command.dimensionId) {
    const formatTransforms = { ...current.media.formatTransforms };
    const formatPins = { ...current.media.formatPins };
    delete formatTransforms[command.dimensionId];
    delete formatPins[command.dimensionId];
    next = { ...current, media:{ ...current.media, formatTransforms, formatPins } };
    changedPaths.push(`media.format:${command.dimensionId}`);
  } else if (command?.type === DESIGN_COMMAND_TYPES.LOGO_SET && LOGO_FIELD_SET.has(command.field)) {
    const value = ["variantPinned", "hidden", "placementPinned"].includes(command.field)
      ? !!command.value
      : ["masterPlacement", "formatPlacements"].includes(command.field) ? object(command.value) : text(command.value);
    if (JSON.stringify(value) !== JSON.stringify(current.logo[command.field])) {
      next = { ...current, logo:{ ...current.logo, [command.field]:value } };
      changedPaths.push(`logo.${command.field}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.LOGO_MERGE_FORMAT_PLACEMENT && command.dimensionId && isObject(command.patch)) {
    const base = current.logo.formatPlacements[command.dimensionId] || object(command.base);
    const placement = { ...base, ...object(command.patch) };
    if (command.removeFree) delete placement.free;
    if (!sameValue(placement,current.logo.formatPlacements[command.dimensionId])) {
      const formatPlacements = { ...current.logo.formatPlacements, [command.dimensionId]:placement };
      next = { ...current, logo:{ ...current.logo, formatPlacements } };
      changedPaths.push(`logo.formatPlacements.${command.dimensionId}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.LOGO_MERGE_MASTER_PLACEMENT && isObject(command.patch)) {
    const masterPlacement = { ...current.logo.masterPlacement, ...object(command.patch) };
    if (!sameValue(masterPlacement,current.logo.masterPlacement)) {
      next = { ...current, logo:{ ...current.logo, masterPlacement } };
      changedPaths.push("logo.masterPlacement");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.LOGO_RESET_FORMAT && command.dimensionId) {
    const formatPlacements = { ...current.logo.formatPlacements };
    delete formatPlacements[command.dimensionId];
    next = { ...current, logo:{ ...current.logo, formatPlacements } };
    changedPaths.push(`logo.formatPlacements.${command.dimensionId}`);
  } else if (command?.type === DESIGN_COMMAND_TYPES.SHAPE_ADD && isObject(command.shape)) {
    const [shape] = normalizeShapeInstances([command.shape]);
    if (shape && !current.shapes.some(item => item.uid === shape.uid)) {
      const shapes = [...current.shapes, shape];
      const mediaHostShapeId = isMediaHostShape(shape)
        ? shape.uid
        : resolveMediaHostShapeId(shapes, current.composition.mediaHostShapeId);
      next = { ...current, shapes, composition:{ ...current.composition, mediaHostShapeId } };
      changedPaths.push(`shapes.${shape.uid}`);
      if (mediaHostShapeId !== current.composition.mediaHostShapeId) changedPaths.push("composition.mediaHostShapeId");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.SHAPES_REPLACE && Array.isArray(command.shapes)) {
    const shapes = normalizeShapeInstances(command.shapes);
    const mediaHostShapeId = resolveMediaHostShapeId(shapes, current.composition.mediaHostShapeId);
    if (!sameValue(shapes,current.shapes) || mediaHostShapeId !== current.composition.mediaHostShapeId) {
      next = { ...current, shapes, composition:{ ...current.composition, mediaHostShapeId } };
      if (!sameValue(shapes,current.shapes)) changedPaths.push("shapes");
      if (mediaHostShapeId !== current.composition.mediaHostShapeId) changedPaths.push("composition.mediaHostShapeId");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.SHAPE_UPDATE && command.uid && isObject(command.patch)) {
    const previous = current.shapes.find(shape => shape.uid === command.uid);
    const patch = object(command.patch);
    const shapes = normalizeShapeInstances(current.shapes.map(shape => {
      if (shape.uid !== command.uid) return shape;
      const candidate = { ...shape, ...patch, uid:shape.uid };
      // The deployed inspector still writes legacy `mode`. Until it migrates to the
      // semantic shape commands, a mode edit must refresh the additive renderMode
      // rather than letting the old normalized value win.
      if ("mode" in patch && !("renderMode" in patch)) delete candidate.renderMode;
      return candidate;
    }));
    const updated = shapes.find(shape => shape.uid === command.uid);
    if (updated && !sameValue(updated,previous)) {
      const becameMediaHost = updated && isMediaHostShape(updated) && !isMediaHostShape(previous);
      const mediaHostShapeId = resolveMediaHostShapeId(shapes, becameMediaHost ? command.uid : current.composition.mediaHostShapeId);
      next = { ...current, shapes, composition:{ ...current.composition, mediaHostShapeId } };
      changedPaths.push(`shapes.${command.uid}`);
      if (mediaHostShapeId !== current.composition.mediaHostShapeId) changedPaths.push("composition.mediaHostShapeId");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.SHAPE_SET_MEDIA_HOST && command.uid) {
    const target = current.shapes.find(shape => shape.uid === command.uid);
    if (target) {
      const shapes = normalizeShapeInstances(current.shapes.map(shape => {
        if (shape.uid !== command.uid) return shape;
        const candidate = {
          ...shape,
          role:SHAPE_ROLES.IMAGE_FRAME,
          mode:SHAPE_RENDER_MODES.FRAME,
        };
        delete candidate.renderMode;
        return candidate;
      }));
      const updated = shapes.find(shape => shape.uid === command.uid);
      if (updated && isMediaHostShape(updated)) {
        const shapeChanged = JSON.stringify(updated) !== JSON.stringify(target);
        const hostChanged = current.composition.mediaHostShapeId !== command.uid;
        if (shapeChanged || hostChanged) {
          next = { ...current, shapes, composition:{ ...current.composition, mediaHostShapeId:command.uid } };
          if (shapeChanged) changedPaths.push(`shapes.${command.uid}`);
          if (hostChanged) changedPaths.push("composition.mediaHostShapeId");
        }
      }
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.SHAPE_REMOVE && command.uid) {
    const shapes = current.shapes.filter(shape => shape.uid !== command.uid);
    if (shapes.length !== current.shapes.length) {
      const mediaHostShapeId = resolveMediaHostShapeId(shapes, current.composition.mediaHostShapeId);
      next = { ...current, shapes, composition:{ ...current.composition, mediaHostShapeId } };
      changedPaths.push(`shapes.${command.uid}`);
      if (mediaHostShapeId !== current.composition.mediaHostShapeId) changedPaths.push("composition.mediaHostShapeId");
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.SHAPE_UPDATE_TRANSFORM && command.uid && isObject(command.patch)) {
    const shapes = current.shapes.map(shape => {
      if (shape.uid !== command.uid) return shape;
      if (command.isMaster) return { ...shape, master:{ ...(shape.master || {}), ...object(command.patch) } };
      const base = shape.byDim?.[command.dimensionId] || object(command.base);
      return { ...shape, byDim:{ ...(shape.byDim || {}), [command.dimensionId]:{ ...base, ...object(command.patch) } } };
    });
    if (!sameValue(shapes,current.shapes)) {
      next = { ...current, shapes };
      changedPaths.push(`shapes.${command.uid}.transform`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.SHAPE_RESET_FORMAT && command.dimensionId) {
    const shapes = current.shapes.map(shape => {
      if (!shape.byDim?.[command.dimensionId]) return shape;
      const byDim = { ...shape.byDim }; delete byDim[command.dimensionId];
      return { ...shape, byDim };
    });
    next = { ...current, shapes };
    changedPaths.push(`shapes.format:${command.dimensionId}`);
  } else if (command?.type === DESIGN_COMMAND_TYPES.FURNITURE_SET && isObject(command.overrides)) {
    next = { ...current, furniture:{ ...current.furniture, overrides:object(command.overrides) } };
    changedPaths.push("furniture.overrides");
  } else if (command?.type === DESIGN_COMMAND_TYPES.FURNITURE_UPDATE && command.key && isObject(command.patch)) {
    const existing = current.furniture.overrides?.[command.key] || {};
    const item = { ...existing };
    for (const [key, value] of Object.entries(command.patch)) {
      if (value === undefined || value === null || value === "") delete item[key];
      else item[key] = value;
    }
    if (!sameValue(item,current.furniture.overrides?.[command.key] || {})) {
      const overrides = { ...(current.furniture.overrides || {}), [command.key]:item };
      next = { ...current, furniture:{ ...current.furniture, overrides } };
      changedPaths.push(`furniture.overrides.${command.key}`);
    }
  } else if (command?.type === DESIGN_COMMAND_TYPES.FORMAT_RESET_TO_MASTER && command.dimensionId) {
    const hasStoredFormatState = !!(
      current.typography.formatLayouts[command.dimensionId]
      || current.typography.roleOffsetsByFormat[command.dimensionId]
      || current.media.formatTransforms[command.dimensionId]
      || current.media.formatPins[command.dimensionId]
      || current.logo.formatPlacements[command.dimensionId]
      || current.shapes.some(shape => shape.byDim?.[command.dimensionId] || shape.touchedByDim?.[command.dimensionId])
    );
    if (!hasStoredFormatState) return { document:current, changedPaths:[] };
    const formatLayouts={...current.typography.formatLayouts}; delete formatLayouts[command.dimensionId];
    const roleOffsetsByFormat={...current.typography.roleOffsetsByFormat}; delete roleOffsetsByFormat[command.dimensionId];
    const mediaTransforms={...current.media.formatTransforms}; delete mediaTransforms[command.dimensionId];
    const mediaPins={...current.media.formatPins}; delete mediaPins[command.dimensionId];
    const logoPlacements={...current.logo.formatPlacements}; delete logoPlacements[command.dimensionId];
    const shapes=current.shapes.map(shape=>{
      if(!shape.byDim?.[command.dimensionId]&&!shape.touchedByDim?.[command.dimensionId])return shape;
      const byDim={...shape.byDim};delete byDim[command.dimensionId];
      const touchedByDim={...shape.touchedByDim};delete touchedByDim[command.dimensionId];
      return{...shape,byDim,touchedByDim};
    });
    next={...current,
      typography:{...current.typography,formatLayouts,roleOffsetsByFormat},
      media:{...current.media,formatTransforms:mediaTransforms,formatPins:mediaPins},
      logo:{...current.logo,formatPlacements:logoPlacements},shapes};
    changedPaths.push(`format.${command.dimensionId}`);
  }

  /* (TEXT UNIFICATION Phase B — FULL MERGE) The legacy-role elements are a LIVE
     PROJECTION of the fixed content fields (lib/text-elements.mjs projectTextElements).
     Any command that wrote one of those fields re-projects the collection HERE, inside
     the same command, so the role and its element move as one thing: one undo step, one
     persisted truth, no drift. Genuinely added elements are untouched, and a document
     whose fixed fields did not change is byte-identical (sameValue short-circuit). */
  if (next !== current && changedPaths.some(path => LEGACY_ROLE_FIELD_PATHS.has(path))) {
    const elements = projectTextElements(next.content, next.content.authorship);
    if (!sameValue(elements, next.content.elements)) {
      next = { ...next, content:{ ...next.content, elements } };
    }
  }

  return { document:next, changedPaths };
}

export function designDocumentReducer(document, command) {
  return applyDesignCommand(document, command).document;
}

// Transitional persistence adapter. The nested document is canonical; flat keys
// remain temporarily so older deployed clients can still open newly saved work.
export function designDocumentToLegacyFields(document) {
  const doc = migrateDesignDocument(document);
  // During the compatibility window the potentially large source is written once
  // as imageSrc. Omitting it from nested media avoids doubling data URLs while the
  // V1 migrator still reconstructs media.source from that flat field.
  const persistedMedia = clone(doc.media);
  delete persistedMedia.source;
  return {
    schemaVersion: doc.schemaVersion,
    layerContractVersion: doc.layerContractVersion,
    content: clone(doc.content),
    palette: clone(doc.palette),
    composition: clone(doc.composition),
    typography: clone(doc.typography),
    media: persistedMedia,
    logo: clone(doc.logo),
    headline: doc.content.headline,
    subtext: doc.content.subtext,
    attribution: doc.content.attribution,
    dateText: doc.content.dateText,
    microLabel: doc.content.microLabel,
    pillText: doc.content.pillText,
    copyAuthors: clone(doc.content.authorship),
    bgColor: doc.palette.background,
    fieldColorOverride: doc.palette.field,
    bgAlpha: doc.palette.backgroundOpacity,
    textColorId: doc.palette.text,
    backdropMode: doc.palette.backdrop,
    pinnedProps: clone(doc.palette.pins),
    postType: doc.composition.postType,
    archetypeId: doc.composition.archetypeId,
    archVariant: doc.composition.archetypeVariant,
    heroRegister: doc.typography.heroRegister,
    globalSizeStep: doc.typography.globalSizeStep,
    fontSizePins: clone(doc.typography.fontSizePins),
    fontSizes: clone(doc.typography.fontSizes),
    typeLayouts: clone(doc.typography.masterLayouts),
    typeLayoutsByDim: clone(doc.typography.formatLayouts),
    roleOffsetsByDim: clone(doc.typography.roleOffsetsByFormat),
    imageSrc: doc.media.source,
    mediaKind: doc.media.kind,
    photoTreatment: doc.media.treatment,
    photoFrame: clone(doc.media.frame),
    imgT: clone(doc.media.masterTransform),
    imgTByDim: clone(doc.media.formatTransforms),
    photoTouchedByDim: clone(doc.media.formatPins),
    selectedLogoId: doc.logo.assetId,
    logoVariantTouched: doc.logo.variantPinned,
    logoHidden: doc.logo.hidden,
    userLogoTouched: doc.logo.placementPinned,
    logoPosition: doc.logo.masterPlacement.position,
    logoSize: doc.logo.masterPlacement.sizeId,
    logoFreePos: clone(doc.logo.masterPlacement.free),
    logoByDim: clone(doc.logo.formatPlacements),
    overlayLayers: clone(doc.shapes),
    furnitureOverrides: clone(doc.furniture.overrides || {}),
  };
}
