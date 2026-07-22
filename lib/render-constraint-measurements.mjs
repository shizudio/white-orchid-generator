import { photoWindow } from "./photo-cover.mjs";

export function projectFocalSubjectBox({sourceWidth,sourceHeight,photoBox,focal,radiusFraction=0.22}={}){
  if(!sourceWidth||!sourceHeight||!photoBox||!focal)return null;
  const rect={x:photoBox.x||0,y:photoBox.y||0,w:photoBox.w||0,h:photoBox.h||0};
  if(rect.w<=0||rect.h<=0)return null;
  const geometry=photoWindow(sourceWidth,sourceHeight,rect.w,rect.h,photoBox.eff||null);
  if(!geometry)return null;
  const dx=((focal.fx??0.5)-0.5)*geometry.dw,dy=((focal.fy??0.42)-0.5)*geometry.dh;
  const angle=(geometry.rot||0)*Math.PI/180;
  const cx=rect.x+geometry.cx+dx*Math.cos(angle)-dy*Math.sin(angle);
  const cy=rect.y+geometry.cy+dx*Math.sin(angle)+dy*Math.cos(angle);
  const radius=radiusFraction*Math.min(rect.w,rect.h);
  const x0=Math.max(rect.x,cx-radius),y0=Math.max(rect.y,cy-radius);
  const x1=Math.min(rect.x+rect.w,cx+radius),y1=Math.min(rect.y+rect.h,cy+radius);
  return x1-x0>1&&y1-y0>1?{x:x0,y:y0,w:x1-x0,h:y1-y0}:null;
}

export function buildPaintAwareRelationTests({layout,zoneRects,shapes,width,height,imageForShape,paintIntersects,paintStraddles}={}){
  const tests={};
  if(!layout||!width||!height)return tests;
  for(const relation of layout.relations||[]){
    if(relation.from.startsWith("decoration:")&&typeof paintIntersects==="function"){
      const uid=relation.from.slice("decoration:".length);
      const shape=(shapes||[]).find(item=>item.id===uid);
      const image=typeof imageForShape==="function"?imageForShape(uid):null;
      const targetNorm=zoneRects?.[relation.to]||layout.zones.find(zone=>zone.id===relation.to)?.geometry?.rect;
      const target=targetNorm?{x:targetNorm.x*width,y:targetNorm.y*height,w:targetNorm.w*width,h:targetNorm.h*height}:null;
      if(shape&&target)tests[relation.id]=!!paintIntersects(image,shape,target);
      continue;
    }
    if(relation.type==="does-not-straddle"&&relation.to.startsWith("structural:")&&typeof paintStraddles==="function"){
      const uid=relation.to.slice("structural:".length);
      const shape=(shapes||[]).find(item=>item.id===uid);
      const image=typeof imageForShape==="function"?imageForShape(uid):null;
      const targetNorm=zoneRects?.[relation.from]||layout.zones.find(zone=>zone.id===relation.from)?.geometry?.rect;
      const target=targetNorm?{x:targetNorm.x*width,y:targetNorm.y*height,w:targetNorm.w*width,h:targetNorm.h*height}:null;
      const measured=shape&&target?paintStraddles(image,shape,target):null;
      if(typeof measured==="boolean")tests[relation.id]=measured;
    }
  }
  return tests;
}

export const buildDecorationRelationTests = buildPaintAwareRelationTests;

export function summarizeConstraintEvidence(constraints){
  const violations=constraints?.violations||[];
  const seams=violations.filter(item=>item.ruleId==="structural.no-seam-straddle");
  const decoration=violations.filter(item=>item.ruleId==="decoration.yields-to-meaning");
  return Object.freeze({
    seamStraddles:seams.length,
    decorationTextOrMark:decoration.filter(item=>item.zoneIds.some(id=>id.startsWith("content:")||id.startsWith("mark:"))).length,
    decorationSubject:decoration.filter(item=>item.zoneIds.includes("protected:media-subject")).length,
  });
}
