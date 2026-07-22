import { migrateDesignDocument } from "./design-document.mjs";

export const DECORATION_CONTRACT_VERSION=1;

export const DEFAULT_DECORATION_BUDGET=Object.freeze({
  maxInstances:6,
  maxPaintFraction:0.18,
  maxAccentColors:2,
});

const finite=value=>Number.isFinite(value);
const clamp01=value=>Math.max(0,Math.min(1,value));
const styleColor=shape=>shape?.master?.colorId||shape?.fillColor||shape?.outlineColor||shape?.lineArtColor||null;

function normalizeBudget(value={}){
  return Object.freeze({
    maxInstances:Number.isInteger(value.maxInstances)&&value.maxInstances>=0?value.maxInstances:DEFAULT_DECORATION_BUDGET.maxInstances,
    maxPaintFraction:finite(value.maxPaintFraction)?clamp01(value.maxPaintFraction):DEFAULT_DECORATION_BUDGET.maxPaintFraction,
    maxAccentColors:Number.isInteger(value.maxAccentColors)&&value.maxAccentColors>=0?value.maxAccentColors:DEFAULT_DECORATION_BUDGET.maxAccentColors,
  });
}

/** Decoration intent only. Structural shapes remain owned by the layout contract. */
export function deriveDecorationCapability(document,dimensionId,{budget,approvedAssetIds}={}){
  const doc=migrateDesignDocument(document);
  const approved=approvedAssetIds==null?null:new Set(approvedAssetIds);
  const decorations=(doc.shapes||[]).filter(shape=>!shape.structural).map(shape=>Object.freeze({
    uid:shape.uid,
    assetId:shape.assetId||null,
    role:shape.role,
    owner:shape.owner,
    userPinned:shape.owner==="user"||shape.userTouched===true,
    renderMode:shape.renderMode,
    transform:Object.freeze({...((shape.byDim?.[dimensionId])||shape.master||{})}),
    colorId:styleColor(shape),
    approved:approved==null?null:approved.has(shape.assetId),
  }));
  return Object.freeze({
    version:DECORATION_CONTRACT_VERSION,
    dimensionId:String(dimensionId||""),
    budget:normalizeBudget(budget),
    decorations:Object.freeze(decorations),
  });
}

const clippedArea=(bounds,width,height)=>{
  if(!bounds||![bounds.x,bounds.y,bounds.w,bounds.h,width,height].every(finite)||width<=0||height<=0)return 0;
  const x0=Math.max(0,bounds.x),y0=Math.max(0,bounds.y);
  const x1=Math.min(width,bounds.x+Math.max(0,bounds.w)),y1=Math.min(height,bounds.y+Math.max(0,bounds.h));
  return Math.max(0,x1-x0)*Math.max(0,y1-y0);
};

const removalTarget=items=>items.find(item=>!item.userPinned)||items[0]||null;

/** Converts measured paint coverage into budget findings; it never re-checks collisions. */
export function evaluateDecorationContract(capability,{width,height,shapes=[]}={}){
  if(!capability||capability.version!==DECORATION_CONTRACT_VERSION)throw new TypeError("invalid decoration capability");
  const rendered=new Map((shapes||[]).map(shape=>[shape.id,shape]));
  const active=capability.decorations.map(item=>{
    const measured=rendered.get(item.uid);
    const opacity=finite(measured?.transform?.opacity)?clamp01(measured.transform.opacity):1;
    const paintFraction=finite(measured?.paintFraction)?clamp01(measured.paintFraction):1;
    const area=clippedArea(measured?.bounds,width,height);
    return {...item,bounds:measured?.bounds||null,estimatedPaintFraction:width>0&&height>0?area/(width*height)*paintFraction*opacity:0};
  }).filter(item=>item.bounds&&rendered.get(item.uid)?.painted!==false);
  const violations=[];
  for(const item of active.filter(item=>item.approved===false)){
    violations.push({
      ruleId:"decoration.approved-asset",severity:"fail",element:`shape:${item.uid}`,target:{uid:item.uid},
      evidence:{uid:item.uid,assetId:item.assetId},
      suggestedPatch:item.userPinned?null:{removeOverlay:item.uid},
    });
  }
  if(active.length>capability.budget.maxInstances){
    const target=removalTarget([...active].reverse());
    violations.push({
      ruleId:"decoration.density-budget",severity:"warn",element:target?`shape:${target.uid}`:"canvas",target:target?{uid:target.uid}:null,
      evidence:{count:active.length,maximum:capability.budget.maxInstances},
      suggestedPatch:target&&!target.userPinned?{removeOverlay:target.uid}:null,
    });
  }
  const estimatedPaintFraction=active.reduce((sum,item)=>sum+item.estimatedPaintFraction,0);
  if(estimatedPaintFraction>capability.budget.maxPaintFraction+0.001){
    const target=removalTarget([...active].sort((a,b)=>b.estimatedPaintFraction-a.estimatedPaintFraction));
    violations.push({
      ruleId:"decoration.occupied-area-budget",severity:"warn",element:target?`shape:${target.uid}`:"canvas",target:target?{uid:target.uid}:null,
      evidence:{estimatedPaintFraction,maximum:capability.budget.maxPaintFraction},
      suggestedPatch:target&&!target.userPinned?{removeOverlay:target.uid}:null,
    });
  }
  const explicitColors=[...new Set(active.map(item=>item.colorId).filter(color=>color&&color!=="auto"))];
  if(explicitColors.length>capability.budget.maxAccentColors){
    const target=[...active].reverse().find(item=>item.colorId===explicitColors.at(-1))||active.at(-1)||null;
    violations.push({
      ruleId:"decoration.accent-color-budget",severity:"warn",element:target?`shape:${target.uid}`:"canvas",target:target?{uid:target.uid}:null,
      evidence:{colors:explicitColors,maximum:capability.budget.maxAccentColors},
      suggestedPatch:null,
    });
  }
  return Object.freeze({
    version:DECORATION_CONTRACT_VERSION,
    dimensionId:capability.dimensionId,
    status:violations.some(item=>item.severity==="fail")?"blocked":violations.length?"warning":"clear",
    budget:capability.budget,
    measured:Object.freeze({instances:active.length,estimatedPaintFraction,accentColors:Object.freeze(explicitColors)}),
    violations:Object.freeze(violations),
  });
}
