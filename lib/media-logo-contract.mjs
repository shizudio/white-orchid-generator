import { migrateDesignDocument } from "./design-document.mjs";
import { LAYOUT_MEDIA_MODELS } from "./layout-contract.mjs";
import { coverClampT, coversFrameBox } from "./photo-cover.mjs";

export const MEDIA_LOGO_CONTRACT_VERSION=1;

const COVERAGE_MODELS=new Set([
  LAYOUT_MEDIA_MODELS.RECTANGULAR,
  LAYOUT_MEDIA_MODELS.CARD,
  LAYOUT_MEDIA_MODELS.SHAPE_FRAME,
]);

export function deriveMediaLogoCapability(document,dimensionId,{layout}={}){
  const doc=migrateDesignDocument(document);
  const placement=doc.logo.formatPlacements?.[dimensionId]||doc.logo.masterPlacement||{};
  const mediaModel=layout?.mediaModel||LAYOUT_MEDIA_MODELS.NONE;
  return Object.freeze({
    version:MEDIA_LOGO_CONTRACT_VERSION,
    dimensionId:String(dimensionId||""),
    media:Object.freeze({
      present:!!doc.media.source,
      model:mediaModel,
      coverageRequired:!!doc.media.source&&COVERAGE_MODELS.has(mediaModel),
      transform:Object.freeze({...((doc.media.formatTransforms?.[dimensionId])||doc.media.masterTransform||{})}),
    }),
    logo:Object.freeze({
      present:!doc.logo.hidden&&!!doc.logo.assetId,
      assetId:doc.logo.assetId||null,
      variantPinned:!!doc.logo.variantPinned,
      placementPinned:!!doc.logo.placementPinned||!!placement.free,
      placement:Object.freeze({...placement}),
      intrinsicClearSpaceFractionOfWidth:0.05,
      minimumContrast:3,
    }),
  });
}

const normalizedBox=(box,width,height)=>box&&width>0&&height>0?{x:box.x/width,y:box.y/height,w:box.w/width,h:box.h/height}:null;

export function evaluateMediaLogoContract(capability,{
  width,height,sourceWidth,sourceHeight,photoBox,logoBox,logoEvidence={},
}={}){
  if(!capability||capability.version!==MEDIA_LOGO_CONTRACT_VERSION)throw new TypeError("invalid media logo capability");
  const violations=[];
  if(capability.media.coverageRequired&&photoBox&&sourceWidth&&sourceHeight){
    const transform=photoBox.eff||capability.media.transform;
    if(!coversFrameBox(sourceWidth,sourceHeight,photoBox.w,photoBox.h,transform)){
      violations.push({
        ruleId:"media.crop-coverage",severity:"fail",element:"photo",
        evidence:{window:normalizedBox(photoBox,width,height),transform:{...transform}},
        suggestedPatch:{photoTransform:coverClampT(sourceWidth,sourceHeight,photoBox.w,photoBox.h,transform)},
      });
    }
  }
  if(capability.logo.present&&logoBox&&width>0&&height>0){
    const pad=capability.logo.intrinsicClearSpaceFractionOfWidth*width;
    const clear={left:logoBox.x,top:logoBox.y,right:width-(logoBox.x+logoBox.w),bottom:height-(logoBox.y+logoBox.h)};
    const failedEdges=Object.entries(clear).filter(([,value])=>value+0.5<pad).map(([edge])=>edge);
    if(failedEdges.length){
      violations.push({
        ruleId:"logo.intrinsic-clear-space",severity:"fail",element:"logo",
        evidence:{failedEdges,requiredPx:pad,actualPx:clear,box:normalizedBox(logoBox,width,height)},
        suggestedPatch:{logoFree:null},
      });
    }
  }
  if(capability.logo.present&&logoEvidence.illegible){
    violations.push({
      ruleId:"logo.surface-contrast",severity:"fail",element:"logo",
      evidence:{contrast:logoEvidence.photoContrast??null,busy:!!logoEvidence.photoBusy,pinned:!!logoEvidence.pinned},
      suggestedPatch:logoEvidence.suggestPosition?{logoPosition:logoEvidence.suggestPosition,logoFree:null}:null,
    });
  }
  return Object.freeze({
    version:MEDIA_LOGO_CONTRACT_VERSION,
    dimensionId:capability.dimensionId,
    status:violations.some(item=>item.severity==="fail")?"blocked":"clear",
    violations:Object.freeze(violations),
  });
}
