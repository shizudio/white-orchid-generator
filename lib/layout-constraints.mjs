import { designRuleById, RULE_SEVERITIES } from "./design-layer-contract.mjs";
import { LAYOUT_RELATION_TYPES, LAYOUT_ZONE_KINDS, validateLayoutCapability } from "./layout-contract.mjs";

export const CONSTRAINT_RESULT_VERSION = 1;

const rectOf = (zone, overrides) => overrides?.[zone.id] || zone.geometry?.rect || null;
const intersects = (a,b,gap=0) => a.x < b.x+b.w+gap && a.x+a.w+gap > b.x && a.y < b.y+b.h+gap && a.y+a.h+gap > b.y;
const contains = (outer,inner,gap=0) => inner.x >= outer.x+gap && inner.y >= outer.y+gap && inner.x+inner.w <= outer.x+outer.w-gap && inner.y+inner.h <= outer.y+outer.h-gap;
const finite = value => Number.isFinite(value);

function normalizedRect(bounds, width, height) {
  if (!bounds || !finite(width) || width <= 0 || !finite(height) || height <= 0) return null;
  if (![bounds.x,bounds.y,bounds.w,bounds.h].every(finite)) return null;
  return Object.freeze({
    x:bounds.x/width,
    y:bounds.y/height,
    w:Math.max(0,bounds.w/width),
    h:Math.max(0,bounds.h/height),
  });
}

const roleBoundsForZone = (zoneId, roleBounds, textBounds) => {
  const role=zoneId.split(":")[1];
  if (role === "hero") return roleBounds.hero || roleBounds.headline || textBounds || null;
  if (role === "support") return roleBounds.support || roleBounds.subtext || null;
  if (role === "microLabel") return roleBounds.microLabel || roleBounds.eyebrow || null;
  return roleBounds[role] || null;
};

/**
 * Adapts actual canvas measurements to the layout contract's normalized zone IDs.
 * Renderers report pixels; the constraint engine only understands 0..1 geometry.
 */
export function createMeasuredZoneRects(capability, {
  width,
  height,
  textBounds = null,
  roleBounds = {},
  logoBox = null,
  photoBox = null,
  subjectBox = null,
  shapes = [],
} = {}) {
  const shapeMap=new Map((Array.isArray(shapes)?shapes:[]).map(shape=>[shape?.id,shape?.bounds]));
  const zoneRects={};
  for (const zone of capability?.zones || []) {
    let bounds=null;
    if (zone.kind === LAYOUT_ZONE_KINDS.CONTENT) bounds=roleBoundsForZone(zone.id,roleBounds||{},textBounds);
    else if (zone.kind === LAYOUT_ZONE_KINDS.MARK) bounds=logoBox;
    else if (zone.kind === LAYOUT_ZONE_KINDS.MEDIA) bounds=photoBox;
    else if (zone.kind === LAYOUT_ZONE_KINDS.STRUCTURAL) bounds=shapeMap.get(zone.geometry?.shapeId);
    else if (zone.kind === LAYOUT_ZONE_KINDS.DECORATION) bounds=shapeMap.get(zone.geometry?.shapeId);
    else if (zone.kind === LAYOUT_ZONE_KINDS.PROTECTED && zone.surface === "media") bounds=subjectBox;
    const rect=normalizedRect(bounds,width,height);
    if (rect) zoneRects[zone.id]=rect;
  }
  return Object.freeze(zoneRects);
}

function ruleIdForRelation(relation, from, to) {
  const kinds = new Set([from.kind,to.kind]);
  if (kinds.has(LAYOUT_ZONE_KINDS.DECORATION)) return "decoration.yields-to-meaning";
  if (relation.type === LAYOUT_RELATION_TYPES.DOES_NOT_STRADDLE) return "structural.no-seam-straddle";
  const protectedZone=from.kind===LAYOUT_ZONE_KINDS.PROTECTED?from:(to.kind===LAYOUT_ZONE_KINDS.PROTECTED?to:null);
  if (protectedZone?.surface === "media") {
    return kinds.has(LAYOUT_ZONE_KINDS.MARK) ? "logo.no-subject-overlap" : "media.protected-subject";
  }
  if (protectedZone) return "format.platform-occlusion";
  if (kinds.has(LAYOUT_ZONE_KINDS.MARK) && kinds.has(LAYOUT_ZONE_KINDS.CONTENT)) return "logo.no-text-overlap";
  if (relation.type === LAYOUT_RELATION_TYPES.CONTAINS && kinds.has(LAYOUT_ZONE_KINDS.MEDIA)) return "media.crop-coverage";
  if (relation.type === LAYOUT_RELATION_TYPES.FOLLOWS && from.kind === LAYOUT_ZONE_KINDS.CONTENT && to.kind === LAYOUT_ZONE_KINDS.CONTENT) return "typography.minimum-role-gap";
  if (kinds.has(LAYOUT_ZONE_KINDS.STRUCTURAL)) return "structural.no-seam-straddle";
  return "layout.no-element-overlap";
}

function relationMessage(relation, from, to) {
  if (relation.type === LAYOUT_RELATION_TYPES.CONTAINS) return `${to.id} must stay inside ${from.id}.`;
  if (relation.type === LAYOUT_RELATION_TYPES.FOLLOWS) return `${from.id} must follow ${to.id} in the layout reading order.`;
  if (relation.type === LAYOUT_RELATION_TYPES.CLEARS) return `${from.id} needs clear space from ${to.id}.`;
  if (relation.type === LAYOUT_RELATION_TYPES.DOES_NOT_STRADDLE) return `${from.id} must stay on one side of ${to.id}'s surface boundary.`;
  return `${from.id} must avoid ${to.id}.`;
}

function violates(relation, from, to, fromRect, toRect) {
  if (relation.type === LAYOUT_RELATION_TYPES.CONTAINS) {
    if (from.geometry?.type === "shape-ref" && to.geometry?.type === "shape-ref" && from.geometry.shapeId === to.geometry.shapeId) return false;
    return !contains(fromRect,toRect,relation.minGap);
  }
  if (relation.type === LAYOUT_RELATION_TYPES.DOES_NOT_STRADDLE) {
    return intersects(fromRect,toRect) && !contains(toRect,fromRect);
  }
  if (relation.type === LAYOUT_RELATION_TYPES.FOLLOWS) return fromRect.y < toRect.y+toRect.h+relation.minGap;
  return intersects(fromRect,toRect,relation.minGap);
}

export function evaluateLayoutConstraints(capability, { zoneRects = {}, relationTests = {}, source = "preflight" } = {}) {
  const validation = validateLayoutCapability(capability);
  if (!validation.valid) return Object.freeze({
    version:CONSTRAINT_RESULT_VERSION,
    dimensionId:capability?.dimensionId||null,
    status:"invalid",
    violations:Object.freeze([]),
    evaluatedRelationIds:Object.freeze([]),
    deferredRelationIds:Object.freeze([]),
    errors:Object.freeze([...validation.errors]),
  });
  const zones = new Map(capability.zones.map(zone=>[zone.id,zone]));
  const violations=[];
  const evaluated=[];
  const deferred=[];
  for (const relation of capability.relations) {
    const from=zones.get(relation.from),to=zones.get(relation.to);
    const fromRect=rectOf(from,zoneRects),toRect=rectOf(to,zoneRects);
    const sameShapeContainment=relation.type===LAYOUT_RELATION_TYPES.CONTAINS
      && from.geometry?.type==="shape-ref" && to.geometry?.type==="shape-ref"
      && from.geometry.shapeId===to.geometry.shapeId;
    if (sameShapeContainment) { evaluated.push(relation.id); continue; }
    if (!fromRect||!toRect) { deferred.push(relation.id); continue; }
    evaluated.push(relation.id);
    const measuredTest=typeof relationTests?.[relation.id]==="boolean"?relationTests[relation.id]:null;
    if (!(measuredTest===null?violates(relation,from,to,fromRect,toRect):measuredTest)) continue;
    const ruleId=ruleIdForRelation(relation,from,to);
    const rule=designRuleById(ruleId);
    violations.push(Object.freeze({
      id:`constraint:${relation.id}`,
      ruleId,
      relationId:relation.id,
      zoneIds:Object.freeze([from.id,to.id]),
      severity:rule?.severity||RULE_SEVERITIES.BLOCKING,
      enforcement:rule?.enforcement||"prevent-or-repair",
      remedies:Object.freeze(rule?[...rule.remedies]:[]),
      message:relationMessage(relation,from,to),
      geometry:Object.freeze({from:fromRect,to:toRect}),
      source,
    }));
  }
  const blocking=violations.some(item=>item.severity===RULE_SEVERITIES.BLOCKING);
  return Object.freeze({
    version:CONSTRAINT_RESULT_VERSION,
    dimensionId:capability.dimensionId,
    status:blocking?"blocked":violations.length?"warning":"clear",
    violations:Object.freeze(violations),
    evaluatedRelationIds:Object.freeze(evaluated),
    deferredRelationIds:Object.freeze(deferred),
    errors:Object.freeze([]),
  });
}
