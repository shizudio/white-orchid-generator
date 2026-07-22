import { migrateDesignDocument } from "./design-document.mjs";
import { inferShapeRole, SHAPE_ROLES } from "./design-layer-contract.mjs";

export const SURFACE_CONTRACT_VERSION=1;

export const SURFACE_STACK=Object.freeze([
  "canvas-field",
  "media",
  "media-treatment",
  "structural-panel",
  "local-legibility-treatment",
  "content",
  "structural-overlay",
  "decoration",
]);

const hasContent=content=>Object.values(content||{}).some(value=>typeof value==="string"&&value.trim());

/** Declares which composed-surface layers a design may use, without painting them. */
export function deriveSurfaceCapability(document,dimensionId){
  const doc=migrateDesignDocument(document);
  const roles=(doc.shapes||[]).map(inferShapeRole);
  const mediaPresent=!!doc.media.source;
  const requested=Object.freeze({
    background:doc.palette.background,
    field:doc.palette.field||doc.palette.background,
    text:doc.palette.text,
    backdrop:doc.palette.backdrop,
    backgroundOpacity:doc.palette.backgroundOpacity,
    mediaTreatment:doc.media.treatment,
    pins:Object.freeze({...doc.palette.pins}),
  });
  const active=new Set(["canvas-field"]);
  if(mediaPresent)active.add("media");
  if(mediaPresent&&doc.media.treatment&&doc.media.treatment!=="none")active.add("media-treatment");
  if(roles.includes(SHAPE_ROLES.CONTENT_PANEL))active.add("structural-panel");
  if(mediaPresent&&doc.palette.backdrop!=="none")active.add("local-legibility-treatment");
  if(hasContent(doc.content))active.add("content");
  if(roles.includes(SHAPE_ROLES.STRUCTURAL_OVERLAY))active.add("structural-overlay");
  if(roles.some(role=>[SHAPE_ROLES.DECORATIVE_OVERLAY,SHAPE_ROLES.ICON,SHAPE_ROLES.DIVIDER].includes(role)))active.add("decoration");
  return Object.freeze({
    version:SURFACE_CONTRACT_VERSION,
    dimensionId:String(dimensionId||""),
    stack:SURFACE_STACK,
    activeLayers:Object.freeze(SURFACE_STACK.filter(layer=>active.has(layer))),
    requested,
  });
}

/**
 * Validates renderer evidence without duplicating typography contrast scoring.
 * Contrast remains in the evidence so requested/resolved/pinned decisions can be
 * inspected together, while typography.surface-contrast remains its sole owner.
 */
export function evaluateSurfaceContract(capability,evidence={}){
  if(!capability||capability.version!==SURFACE_CONTRACT_VERSION)throw new TypeError("invalid surface capability");
  const doubleBackdrop=Math.max(0,Number(evidence.doubleBackdrop)||0);
  const bandOverShape=Math.max(0,Number(evidence.bandOverShape)||0);
  const violations=[];
  const requestedText=evidence.requestedResolved?.text??null;
  const resolvedText=evidence.resolved?.text??null;
  if(capability.requested.pins?.textColorId&&capability.requested.text!=="auto"&&requestedText&&resolvedText&&String(requestedText).toLowerCase()!==String(resolvedText).toLowerCase()){
    violations.push({
      ruleId:"pin.no-silent-overwrite",
      severity:"fail",
      element:"content",
      evidence:{property:"palette.text",requested:capability.requested.text,requestedResolved:requestedText,resolved:resolvedText},
      suggestedPatch:null,
    });
  }
  if(doubleBackdrop>0){
    violations.push({
      ruleId:"surface.single-legibility-treatment",
      severity:"fail",
      element:"content",
      evidence:{count:doubleBackdrop,appliedTreatments:[...(evidence.appliedTreatments||[])]},
      suggestedPatch:null,
    });
  }
  // Auto may silently choose a different rung. A blocked explicit band is different:
  // the requested treatment was not applied, so the user needs a visible decision.
  if(bandOverShape>0&&capability.requested.backdrop==="band"){
    violations.push({
      ruleId:"surface.shape-band-exclusion",
      severity:"fail",
      element:"content",
      evidence:{count:bandOverShape,requestedBackdrop:"band"},
      suggestedPatch:{backdropMode:"auto"},
    });
  }
  return Object.freeze({
    version:SURFACE_CONTRACT_VERSION,
    dimensionId:capability.dimensionId,
    status:violations.some(item=>item.severity==="fail")?"blocked":"clear",
    stack:capability.stack,
    activeLayers:capability.activeLayers,
    requested:capability.requested,
    requestedResolved:Object.freeze({text:requestedText}),
    resolved:Object.freeze({
      background:evidence.resolved?.background??null,
      field:evidence.resolved?.field??null,
      text:evidence.resolved?.text??null,
      backdrop:evidence.resolved?.backdrop??"none",
    }),
    measured:Object.freeze({
      contrast:evidence.contrast??null,
      bandCount:Math.max(0,Number(evidence.bandCount)||0),
      blockedBandCount:bandOverShape,
    }),
    pins:capability.requested.pins,
    appliedTreatments:Object.freeze([...(evidence.appliedTreatments||[])]),
    violations:Object.freeze(violations),
  });
}
