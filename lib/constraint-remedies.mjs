export const CONSTRAINT_REMEDY_COMMAND_VERSION = 1;
export const CONSTRAINT_REMEDY_COMMAND_TYPE = "finding/apply-remedy";

const finiteRect = rect => !!rect && [rect.x,rect.y,rect.w,rect.h].every(Number.isFinite);
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const zoneRole = zoneId => String(zoneId||"").split(":")[1]||null;

// (Item 1 — remedy routing by role) The audit's content zones are only hero / support /
// microLabel. Hero owns the shared textLayout anchor; every other text role is placed by
// its OWN per-role offset (Generator.jsx roleOff(role) → updateRoleOffset). The "microLabel"
// zone IS the eyebrow element — its render/offset key is "eyebrow" (Generator.jsx line ~5085
// maps microLabel→eyeDrawnBox), so a remedy for a microLabel finding must target "eyebrow".
const OFFSET_ROLE_BY_ZONE = { support:"support", microLabel:"eyebrow" };

function moveRectClear(source, obstacle, gap = 0.03, allowContained = false) {
  if (!finiteRect(source)||!finiteRect(obstacle)) return null;
  const min=0.04,max=0.96;
  const candidates=[
    {x:obstacle.x-source.w-gap,y:source.y},
    {x:obstacle.x+obstacle.w+gap,y:source.y},
    {x:source.x,y:obstacle.y-source.h-gap},
    {x:source.x,y:obstacle.y+obstacle.h+gap},
    ...(allowContained&&source.w+gap*2<=obstacle.w&&source.h+gap*2<=obstacle.h?[{
      x:clamp(source.x,obstacle.x+gap,obstacle.x+obstacle.w-source.w-gap),
      y:clamp(source.y,obstacle.y+gap,obstacle.y+obstacle.h-source.h-gap),
    }]:[]),
  ].filter(point=>point.x>=min&&point.y>=min&&point.x+source.w<=max&&point.y+source.h<=max);
  if(!candidates.length)return null;
  candidates.sort((a,b)=>Math.hypot(a.x-source.x,a.y-source.y)-Math.hypot(b.x-source.x,b.y-source.y));
  return candidates[0];
}

function logoAnchorAwayFrom(obstacle) {
  if(!finiteRect(obstacle))return "bottom-right";
  const cx=obstacle.x+obstacle.w/2,cy=obstacle.y+obstacle.h/2;
  return `${cy<0.5?"bottom":"top"}-${cx<0.5?"right":"left"}`;
}

function cropPatchAwayFrom(source, subject, media) {
  const transform=media?.transform,window=media?.window;
  if(!finiteRect(source)||!finiteRect(subject)||!transform||!finiteRect(window))return null;
  const point=moveRectClear(subject,source,0.035,false);
  if(!point)return null;
  const dx=point.x-subject.x,dy=point.y-subject.y;
  return {
    cx:clamp((transform.cx??0.5)+dx/Math.max(window.w,0.01),0,1),
    cy:clamp((transform.cy??0.5)+dy/Math.max(window.h,0.01),0,1),
  };
}

function command(violation, remedyId, label, patch, target, options = {}) {
  if(!violation?.ruleId||!patch)return null;
  return Object.freeze({
    version:CONSTRAINT_REMEDY_COMMAND_VERSION,
    type:CONSTRAINT_REMEDY_COMMAND_TYPE,
    ruleId:violation.ruleId,
    violationId:violation.id||null,
    remedyId,
    label,
    target:Object.freeze({...target}),
    evidence:Object.freeze({
      relationId:violation.relationId||null,
      zoneIds:Object.freeze([...(violation.zoneIds||[])]),
      geometry:violation.geometry||null,
    }),
    patch:Object.freeze({...patch}),
    requiresApproval:options.requiresApproval!==false,
    autoApplicable:options.autoApplicable===true,
  });
}

/** Converts a measured violation into explicit, user-approvable editor commands. */
export function createConstraintRemedyCommands(violation, { dimensionId, media, pinnedRoles } = {}) {
  const zones=violation?.zoneIds||[];
  const sourceId=zones[0]||"";
  const source=violation?.geometry?.from;
  const obstacle=violation?.geometry?.to;
  const target={dimensionId:dimensionId||null,zoneId:sourceId,role:sourceId.startsWith("content:")?zoneRole(sourceId):null};
  const commands=[];

  if(sourceId.startsWith("mark:") && ["logo.no-text-overlap","logo.no-subject-overlap","format.platform-occlusion"].includes(violation.ruleId)) {
    commands.push(command(violation,"move-logo","Move logo clear",{
      ...(dimensionId?{dimensionId}:{}),logoPosition:logoAnchorAwayFrom(obstacle),
    },target));
    if(violation.ruleId==="logo.no-subject-overlap"){
      const photoTransform=cropPatchAwayFrom(source,obstacle,media);
      if(photoTransform)commands.push(command(violation,"adjust-crop","Reframe photo instead",{
        ...(dimensionId?{dimensionId}:{}),photoTransform,
      },{...target,zoneId:"media:primary"}));
    }
  }

  if(sourceId.startsWith("content:") && ["media.protected-subject","structural.no-seam-straddle","format.platform-occlusion"].includes(violation.ruleId)) {
    const point=moveRectClear(source,obstacle,0.03,violation.ruleId==="structural.no-seam-straddle");
    if(point){
      const zoneName=zoneRole(sourceId);
      if(zoneName==="hero"){
        // Hero is placed by the shared textLayout anchor — move it directly.
        commands.push(command(violation,"move-element","Move text clear",{
          ...(dimensionId?{dimensionId}:{}),textLayout:{x:clamp(point.x,0.04,0.92),y:clamp(point.y,0.04,0.92)},
        },target));
      } else {
        // Route by role: a non-hero role ignores the hero anchor, so emit its own roleOffset.
        // ADDITIVE delta (clear-point minus the role's CURRENT drawn box, geometry.from) — the
        // straddle was created by an owner drag, so from already carries that offset; the
        // composite sums the delta onto the stored offset so the FLAGGED element lands clear
        // (a bare SET would discard the drag and land short). Preserves any frozen pin.
        const offsetRole=OFFSET_ROLE_BY_ZONE[zoneName]||zoneName;
        const pinned=Array.isArray(pinnedRoles)&&pinnedRoles.includes(offsetRole);
        commands.push(command(violation,"move-element",
          pinned?"Move it anyway (replaces your placement)":"Move text clear",{
            ...(dimensionId?{dimensionId}:{}),
            roleOffset:{role:offsetRole,dx:point.x-source.x,dy:point.y-source.y,add:true},
          },{...target,role:offsetRole}));
      }
    }
    if(violation.ruleId==="media.protected-subject"){
      const photoTransform=cropPatchAwayFrom(source,obstacle,media);
      if(photoTransform)commands.push(command(violation,"adjust-crop","Reframe photo instead",{
        ...(dimensionId?{dimensionId}:{}),photoTransform,
      },{...target,zoneId:"media:primary"}));
    }
  }

  if(sourceId.startsWith("decoration:") && violation.ruleId==="decoration.yields-to-meaning"){
    const uid=sourceId.slice("decoration:".length);
    const point=moveRectClear(source,obstacle,0.025,false);
    const decorationTarget={...target,uid};
    if(point)commands.push(command(violation,"move-decoration","Move decoration clear",{
      ...(dimensionId?{dimensionId}:{}),
      overlayUpdate:{uid,transform:{x:point.x+source.w/2,y:point.y+source.h/2}},
    },decorationTarget));
    commands.push(command(violation,"remove-decoration","Remove decoration",{
      removeOverlay:uid,
    },decorationTarget));
  }

  return Object.freeze(commands.filter(Boolean));
}

export function isConstraintRemedyCommand(value) {
  return !!value
    && value.version===CONSTRAINT_REMEDY_COMMAND_VERSION
    && value.type===CONSTRAINT_REMEDY_COMMAND_TYPE
    && typeof value.ruleId==="string"
    && typeof value.remedyId==="string"
    && value.patch && typeof value.patch==="object";
}
