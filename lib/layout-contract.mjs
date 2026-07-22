import { migrateDesignDocument } from "./design-document.mjs";
import { explicitMediaHostShapeId } from "./design-layer-contract.mjs";

export const LAYOUT_CONTRACT_VERSION = 1;

export const LAYOUT_ZONE_KINDS = Object.freeze({
  CONTENT: "content",
  MEDIA: "media",
  MARK: "mark",
  STRUCTURAL: "structural",
  DECORATION: "decoration",
  PROTECTED: "protected",
});

export const LAYOUT_GEOMETRY_TYPES = Object.freeze({
  RECT: "rect",
  SHAPE_REF: "shape-ref",
  ANCHOR: "anchor",
  UNCONSTRAINED: "unconstrained",
});

export const LAYOUT_RELATION_TYPES = Object.freeze({
  CONTAINS: "contains",
  AVOIDS: "avoids",
  FOLLOWS: "follows",
  CLEARS: "clears",
  DOES_NOT_STRADDLE: "does-not-straddle",
});

export const LAYOUT_MEDIA_MODELS = Object.freeze({
  NONE: "none",
  UNCONSTRAINED: "unconstrained",
  RECTANGULAR: "rectangular",
  CARD: "card",
  SHAPE_FRAME: "shape-frame",
});

const ZONE_KIND_SET = new Set(Object.values(LAYOUT_ZONE_KINDS));
const GEOMETRY_TYPE_SET = new Set(Object.values(LAYOUT_GEOMETRY_TYPES));
const RELATION_TYPE_SET = new Set(Object.values(LAYOUT_RELATION_TYPES));
const MEDIA_MODEL_SET = new Set(Object.values(LAYOUT_MEDIA_MODELS));
const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const finite = value => Number.isFinite(value);
const stableFraction = value => Math.round(value * 1e6) / 1e6;

function normalizeRect(value) {
  if (!isObject(value) || ![value.x,value.y,value.w,value.h].every(finite)) return null;
  return { x:stableFraction(value.x), y:stableFraction(value.y), w:stableFraction(value.w), h:stableFraction(value.h) };
}

function normalizeGeometry(value = {}) {
  const type = GEOMETRY_TYPE_SET.has(value.type) ? value.type : LAYOUT_GEOMETRY_TYPES.UNCONSTRAINED;
  if (type === LAYOUT_GEOMETRY_TYPES.RECT) {
    const rect = normalizeRect(value.rect || value);
    return rect ? { type, rect } : { type:LAYOUT_GEOMETRY_TYPES.UNCONSTRAINED };
  }
  if (type === LAYOUT_GEOMETRY_TYPES.SHAPE_REF && typeof value.shapeId === "string" && value.shapeId) {
    return { type, shapeId:value.shapeId, transform:isObject(value.transform)?clone(value.transform):null };
  }
  if (type === LAYOUT_GEOMETRY_TYPES.ANCHOR && typeof value.anchor === "string" && value.anchor) {
    return { type, anchor:value.anchor };
  }
  return { type:LAYOUT_GEOMETRY_TYPES.UNCONSTRAINED };
}

export function normalizeLayoutZone(zone = {}, index = 0) {
  const kind = ZONE_KIND_SET.has(zone.kind) ? zone.kind : LAYOUT_ZONE_KINDS.PROTECTED;
  return Object.freeze({
    id:String(zone.id || `${kind}:${index}`),
    kind,
    geometry:Object.freeze(normalizeGeometry(zone.geometry)),
    roles:Object.freeze(Array.isArray(zone.roles) ? zone.roles.filter(role=>typeof role === "string") : []),
    required:!!zone.required,
    surface:typeof zone.surface === "string" ? zone.surface : null,
    owner:typeof zone.owner === "string" ? zone.owner : "layout",
  });
}

export function normalizeLayoutRelation(relation = {}, index = 0) {
  const type = RELATION_TYPE_SET.has(relation.type) ? relation.type : LAYOUT_RELATION_TYPES.AVOIDS;
  return Object.freeze({
    id:String(relation.id || `relation:${index}`),
    type,
    from:String(relation.from || ""),
    to:String(relation.to || ""),
    minGap:finite(relation.minGap) ? Math.max(0, relation.minGap) : 0,
    priority:finite(relation.priority) ? relation.priority : 0,
  });
}

export function createLayoutCapability(source = {}) {
  const zones = (Array.isArray(source.zones) ? source.zones : []).map(normalizeLayoutZone);
  const relations = (Array.isArray(source.relations) ? source.relations : []).map(normalizeLayoutRelation);
  const mediaModel = MEDIA_MODEL_SET.has(source.mediaModel) ? source.mediaModel : LAYOUT_MEDIA_MODELS.NONE;
  return Object.freeze({
    version:LAYOUT_CONTRACT_VERSION,
    layoutId:source.layoutId ?? null,
    dimensionId:String(source.dimensionId || ""),
    mediaModel,
    mediaHostShapeId:source.mediaHostShapeId ?? null,
    requiredStructuralRoles:Object.freeze(Array.isArray(source.requiredStructuralRoles)?[...source.requiredStructuralRoles]:[]),
    zones:Object.freeze(zones),
    relations:Object.freeze(relations),
    capacity:Object.freeze(isObject(source.capacity)?clone(source.capacity):{}),
  });
}

const CONTENT_ROLE_FIELDS = Object.freeze({
  microLabel:"microLabel",
  hero:"headline",
  support:"subtext",
});

/** Derives renderer intent from canonical state; it never creates a writable copy. */
export function deriveLayoutCapability(document, dimensionId, context = {}) {
  const doc = migrateDesignDocument(document);
  const postType = doc.composition.postType;
  const layout = doc.typography.formatLayouts?.[dimensionId]?.[postType]
    || doc.typography.masterLayouts?.[postType]
    || {};
  const roles = isObject(layout.roles) ? layout.roles : {};
  const zones = [];
  const relations = [];
  const contentZoneIds = [];

  for (const role of ["microLabel","hero","support"]) {
    const rect = normalizeRect(roles[role]);
    const field = CONTENT_ROLE_FIELDS[role];
    const hasContent = !!String(doc.content[field]||"").trim();
    if (!rect && !hasContent) continue;
    const id = `content:${role}`;
    contentZoneIds.push(id);
    zones.push({
      id,
      kind:LAYOUT_ZONE_KINDS.CONTENT,
      geometry:rect
        ? {type:LAYOUT_GEOMETRY_TYPES.RECT,rect}
        : {type:LAYOUT_GEOMETRY_TYPES.UNCONSTRAINED},
      roles:[role],
      required:hasContent,
      surface:"layout",
    });
  }
  for (let index=1; index<contentZoneIds.length; index++) {
    relations.push({ id:`reading-order:${index}`, type:LAYOUT_RELATION_TYPES.FOLLOWS, from:contentZoneIds[index], to:contentZoneIds[index-1], priority:80 });
  }

  const hostId = explicitMediaHostShapeId(doc.shapes, doc.composition.mediaHostShapeId);
  const structuralZoneIds=[];
  const decorationZoneIds=[];
  let mediaModel = doc.media.source ? LAYOUT_MEDIA_MODELS.UNCONSTRAINED : LAYOUT_MEDIA_MODELS.NONE;
  if (hostId) {
    const shape = doc.shapes.find(item=>item.uid === hostId);
    const transform = shape?.byDim?.[dimensionId] || shape?.master || null;
    mediaModel = LAYOUT_MEDIA_MODELS.SHAPE_FRAME;
    zones.push({ id:"media:primary", kind:LAYOUT_ZONE_KINDS.MEDIA, geometry:{type:LAYOUT_GEOMETRY_TYPES.SHAPE_REF,shapeId:hostId,transform}, roles:["primary-media"], required:!!doc.media.source, surface:"media" });
    zones.push({ id:`structural:${hostId}`, kind:LAYOUT_ZONE_KINDS.STRUCTURAL, geometry:{type:LAYOUT_GEOMETRY_TYPES.SHAPE_REF,shapeId:hostId,transform}, roles:[shape?.role||"image-frame"], required:true, surface:"structural" });
    structuralZoneIds.push(`structural:${hostId}`);
    relations.push({ id:"media-contained-by-host", type:LAYOUT_RELATION_TYPES.CONTAINS, from:`structural:${hostId}`, to:"media:primary", priority:100 });
  } else if (doc.media.frame?.type === "card" && normalizeRect(doc.media.frame.box)) {
    mediaModel = LAYOUT_MEDIA_MODELS.CARD;
    zones.push({ id:"media:primary", kind:LAYOUT_ZONE_KINDS.MEDIA, geometry:{type:LAYOUT_GEOMETRY_TYPES.RECT,rect:doc.media.frame.box}, roles:["primary-media"], required:!!doc.media.source, surface:"media" });
  } else if (doc.media.frame?.box && normalizeRect(doc.media.frame.box)) {
    mediaModel = LAYOUT_MEDIA_MODELS.RECTANGULAR;
    zones.push({ id:"media:primary", kind:LAYOUT_ZONE_KINDS.MEDIA, geometry:{type:LAYOUT_GEOMETRY_TYPES.RECT,rect:doc.media.frame.box}, roles:["primary-media"], required:!!doc.media.source, surface:"media" });
  } else if (doc.media.source) {
    zones.push({ id:"media:primary", kind:LAYOUT_ZONE_KINDS.MEDIA, geometry:{type:LAYOUT_GEOMETRY_TYPES.UNCONSTRAINED}, roles:["primary-media"], required:true, surface:"media" });
  }

  for (const shape of doc.shapes) {
    if (!shape.structural) {
      const id=`decoration:${shape.uid}`;
      const transform=shape.byDim?.[dimensionId]||shape.master||null;
      decorationZoneIds.push(id);
      zones.push({id,kind:LAYOUT_ZONE_KINDS.DECORATION,geometry:{type:LAYOUT_GEOMETRY_TYPES.SHAPE_REF,shapeId:shape.uid,transform},roles:[shape.role],required:false,surface:"decoration",owner:shape.owner});
      continue;
    }
    if (shape.uid===hostId) continue;
    const id=`structural:${shape.uid}`;
    const transform=shape.byDim?.[dimensionId]||shape.master||null;
    structuralZoneIds.push(id);
    zones.push({ id,kind:LAYOUT_ZONE_KINDS.STRUCTURAL,geometry:{type:LAYOUT_GEOMETRY_TYPES.SHAPE_REF,shapeId:shape.uid,transform},roles:[shape.role],required:shape.owner==="layout",surface:"structural" });
  }

  if (!doc.logo.hidden && doc.logo.assetId) {
    const placement = doc.logo.formatPlacements?.[dimensionId] || doc.logo.masterPlacement || {};
    zones.push({ id:"mark:primary", kind:LAYOUT_ZONE_KINDS.MARK, geometry:{type:LAYOUT_GEOMETRY_TYPES.ANCHOR,anchor:placement.position||"bottom-right"}, roles:["primary-mark"], required:true, surface:"layout" });
    for (const id of contentZoneIds) relations.push({ id:`mark-clears:${id}`, type:LAYOUT_RELATION_TYPES.CLEARS, from:"mark:primary", to:id, minGap:0.02, priority:100 });
  }

  const markZoneIds=zones.some(zone=>zone.id==="mark:primary")?["mark:primary"]:[];
  // A shape-framed image shares its boundary with the structural host below;
  // one seam relation is enough to represent that rule.
  if(zones.some(zone=>zone.id==="media:primary")&&mediaModel!==LAYOUT_MEDIA_MODELS.SHAPE_FRAME){
    for(const sourceId of [...contentZoneIds,...markZoneIds]){
      relations.push({id:`${sourceId}-does-not-straddle-media:primary`,type:LAYOUT_RELATION_TYPES.DOES_NOT_STRADDLE,from:sourceId,to:"media:primary",priority:90});
    }
  }
  for (const structuralId of structuralZoneIds) {
    for (const sourceId of [...contentZoneIds,...markZoneIds]) {
      relations.push({ id:`${sourceId}-does-not-straddle-${structuralId}`,type:LAYOUT_RELATION_TYPES.DOES_NOT_STRADDLE,from:sourceId,to:structuralId,priority:90 });
    }
  }

  const subjectZoneIds=[];
  if (doc.media.source) {
    const subjectId="protected:media-subject";
    subjectZoneIds.push(subjectId);
    zones.push({ id:subjectId,kind:LAYOUT_ZONE_KINDS.PROTECTED,geometry:{type:LAYOUT_GEOMETRY_TYPES.UNCONSTRAINED},roles:["protected-subject"],required:false,surface:"media",owner:"media" });
    for (const sourceId of [...contentZoneIds,...markZoneIds]) {
      relations.push({ id:`${sourceId}-avoids-${subjectId}`,type:LAYOUT_RELATION_TYPES.AVOIDS,from:sourceId,to:subjectId,priority:100 });
    }
  }

  for(const decorationId of decorationZoneIds){
    for(const targetId of [...contentZoneIds,...markZoneIds,...subjectZoneIds]){
      relations.push({id:`${decorationId}-avoids-${targetId}`,type:LAYOUT_RELATION_TYPES.AVOIDS,from:decorationId,to:targetId,priority:70});
    }
  }

  const platformSafe = context.platformSafeByDimension?.[dimensionId] || context.platformSafe || null;
  const protectedZoneIds = [];
  if (isObject(platformSafe)) {
    const protectedRects = [
      ["top", platformSafe.top ? {x:0,y:0,w:1,h:platformSafe.top} : null],
      ["bottom", platformSafe.bottom ? {x:0,y:1-platformSafe.bottom,w:1,h:platformSafe.bottom} : null],
      ["left", platformSafe.left ? {x:0,y:0,w:platformSafe.left,h:1} : null],
      ["right", platformSafe.right ? {x:1-platformSafe.right,y:0,w:platformSafe.right,h:1} : null],
    ];
    for (const [edge,rect] of protectedRects) {
      if (!rect) continue;
      const id=`protected:platform-${edge}`;
      protectedZoneIds.push(id);
      zones.push({ id, kind:LAYOUT_ZONE_KINDS.PROTECTED, geometry:{type:LAYOUT_GEOMETRY_TYPES.RECT,rect}, roles:["platform-ui"], required:true, surface:"platform", owner:"format" });
    }
  }
  for (const protectedId of protectedZoneIds) {
    for (const sourceId of [...contentZoneIds,...markZoneIds]) {
      relations.push({ id:`${sourceId}-avoids-${protectedId}`, type:LAYOUT_RELATION_TYPES.AVOIDS, from:sourceId, to:protectedId, priority:100 });
    }
  }

  return createLayoutCapability({
    layoutId:doc.composition.archetypeId,
    dimensionId,
    mediaModel,
    mediaHostShapeId:hostId,
    requiredStructuralRoles:hostId?["image-frame"]:[],
    zones,
    relations,
    capacity:{ contentRoles:contentZoneIds.length },
  });
}

export function validateLayoutCapability(capability) {
  const errors = [];
  if (!capability || capability.version !== LAYOUT_CONTRACT_VERSION) return {valid:false,errors:["invalid layout capability version"]};
  if (!capability.dimensionId) errors.push("dimensionId is required");
  const zoneIds = new Set();
  for (const zone of capability.zones || []) {
    if (zoneIds.has(zone.id)) errors.push(`duplicate zone id: ${zone.id}`);
    zoneIds.add(zone.id);
    const rect = zone.geometry?.rect;
    if (rect && (rect.w <= 0 || rect.h <= 0 || rect.x < 0 || rect.y < 0 || rect.x+rect.w > 1 || rect.y+rect.h > 1)) errors.push(`zone outside normalized bounds: ${zone.id}`);
  }
  for (const relation of capability.relations || []) {
    if (!zoneIds.has(relation.from) || !zoneIds.has(relation.to)) errors.push(`relation references missing zone: ${relation.id}`);
  }
  if (capability.mediaHostShapeId && capability.mediaModel !== LAYOUT_MEDIA_MODELS.SHAPE_FRAME) errors.push("media host requires shape-frame media model");
  return { valid:errors.length===0, errors };
}
