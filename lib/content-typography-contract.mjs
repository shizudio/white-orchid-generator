import { migrateDesignDocument } from "./design-document.mjs";

export const CONTENT_TYPOGRAPHY_CONTRACT_VERSION = 1;

export const CONTENT_ROLE_ORDER = Object.freeze([
  "microLabel",
  "hero",
  "date",
  "support",
  "attribution",
]);

const ROLE_DEFINITIONS = Object.freeze({
  microLabel:{field:"microLabel",renderRole:"eyebrow",metric:"dateLabel",minimumHeight:0.040,minimumGapAfter:0.018,required:false},
  hero:{field:"headline",renderRole:"hero",metric:"headline",minimumHeight:0.068,minimumGapAfter:0.028,required:true},
  date:{field:"dateText",renderRole:"date",metric:"date",minimumHeight:0.100,minimumGapAfter:0.024,required:false},
  support:{field:"subtext",renderRole:"support",metric:"subtext",minimumHeight:0.062,minimumGapAfter:0.018,required:false},
  attribution:{field:"attribution",renderRole:"support",metric:"subtext",minimumHeight:0.040,minimumGapAfter:0,required:false},
});

const finite=value=>Number.isFinite(value);
const normalizedBox=(box,width,height)=>{
  if(!box||![box.x,box.y,box.w,box.h,width,height].every(finite)||width<=0||height<=0)return null;
  return {x:box.x/width,y:box.y/height,w:box.w/width,h:box.h/height};
};

/** Semantic content requirements and typographic floors, independent of a painter. */
export function deriveContentTypographyCapability(document,dimensionId){
  const doc=migrateDesignDocument(document);
  const roles=CONTENT_ROLE_ORDER.map(id=>{
    const definition=ROLE_DEFINITIONS[id];
    const value=String(doc.content[definition.field]||"").trim();
    return Object.freeze({id,...definition,present:!!value,required:!!value&&definition.required});
  });
  return Object.freeze({
    version:CONTENT_TYPOGRAPHY_CONTRACT_VERSION,
    dimensionId:String(dimensionId||""),
    roles:Object.freeze(roles),
  });
}

/** Converts renderer evidence into stable contract violations and evidence. */
export function evaluateContentTypographyContract(capability,{width,height,roleBounds={},textMetrics={},droppedRoles=[]}={}){
  if(!capability||capability.version!==CONTENT_TYPOGRAPHY_CONTRACT_VERSION)throw new TypeError("invalid content typography capability");
  const dropped=new Set((droppedRoles||[]).map(String));
  const violations=[];
  const atFloorRoles=[];
  const measured={};
  for(const role of capability.roles){
    if(!role.present)continue;
    const box=normalizedBox(roleBounds[role.renderRole],width,height);
    const fontPx=finite(textMetrics[role.metric])?textMetrics[role.metric]:null;
    const fontHeight=fontPx!=null&&height>0?fontPx/height:null;
    measured[role.id]={box,fontPx,fontHeight};
    if(dropped.has(role.id)||!box){
      violations.push({
        ruleId:role.required?"content.required-never-dropped":"content.optional-loss-visible",
        role:role.id,
        severity:role.required?"fail":"warn",
        evidence:{present:true,painted:false},
      });
      continue;
    }
    if(fontHeight!=null){
      if(fontHeight+0.001<role.minimumHeight){
        violations.push({ruleId:"typography.minimum-readable-size",role:role.id,severity:"fail",evidence:{fontHeight,minimumHeight:role.minimumHeight}});
      }else if(fontHeight<=role.minimumHeight+0.002){
        atFloorRoles.push(role.id);
      }
    }
  }
  const seenRenderRoles=new Set();
  const painted=capability.roles.filter(role=>{
    if(!role.present||!measured[role.id]?.box||seenRenderRoles.has(role.renderRole))return false;
    seenRenderRoles.add(role.renderRole);
    return true;
  });
  for(let index=1;index<painted.length;index++){
    const previous=painted[index-1],current=painted[index];
    const before=measured[previous.id].box,after=measured[current.id].box;
    const gap=after.y-(before.y+before.h);
    const minimumGap=previous.minimumGapAfter;
    if(gap+0.002<minimumGap){
      violations.push({ruleId:"typography.minimum-role-gap",roles:[previous.id,current.id],severity:"warn",evidence:{gap,minimumGap}});
    }
  }
  return Object.freeze({
    version:CONTENT_TYPOGRAPHY_CONTRACT_VERSION,
    dimensionId:capability.dimensionId,
    violations:Object.freeze(violations),
    atFloorRoles:Object.freeze(atFloorRoles),
    measured:Object.freeze(measured),
  });
}
