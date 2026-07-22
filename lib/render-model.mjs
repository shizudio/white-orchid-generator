import { migrateDesignDocument } from "./design-document.mjs";
import { deriveLayoutCapability } from "./layout-contract.mjs";
import { evaluateLayoutConstraints } from "./layout-constraints.mjs";
import { deriveContentTypographyCapability } from "./content-typography-contract.mjs";
import { deriveMediaLogoCapability } from "./media-logo-contract.mjs";
import { deriveSurfaceCapability } from "./surface-contract.mjs";
import { deriveDecorationCapability } from "./decoration-contract.mjs";

export const RENDER_MODEL_VERSION = 1;

/**
 * Explicit boundary between React/editor state and the canvas renderer.
 * The design document is serialisable; decoded browser assets deliberately live
 * in the separate assets bag. Neither bag is cloned because reducer documents
 * are immutable and browser image objects cannot be serialised.
 */
export function createRenderModel({ document, dimensionId, runtime = {}, assets = {}, layoutContext = {} } = {}) {
  if (typeof dimensionId !== "string" || !dimensionId) {
    throw new TypeError("render model dimensionId must be a non-empty string");
  }
  const canonicalDocument = migrateDesignDocument(document);
  const layout = deriveLayoutCapability(canonicalDocument, dimensionId, layoutContext);
  const contentTypography=deriveContentTypographyCapability(canonicalDocument,dimensionId);
  const mediaLogo=deriveMediaLogoCapability(canonicalDocument,dimensionId,{layout});
  const surface=deriveSurfaceCapability(canonicalDocument,dimensionId);
  const approvedDecorationAssetIds=Array.isArray(runtime.overlays)?runtime.overlays.map(item=>item?.id).filter(Boolean):null;
  const decoration=deriveDecorationCapability(canonicalDocument,dimensionId,{
    budget:layoutContext.decorationBudget,
    approvedAssetIds:approvedDecorationAssetIds,
  });
  return Object.freeze({
    version:RENDER_MODEL_VERSION,
    dimensionId,
    document:canonicalDocument,
    layout,
    contentTypography,
    mediaLogo,
    surface,
    decoration,
    constraints:evaluateLayoutConstraints(layout),
    layoutContext:Object.freeze({ ...layoutContext }),
    runtime:Object.freeze({ ...runtime }),
    assets:Object.freeze({ ...assets }),
  });
}

export function resolveRenderContentTypography(model,override){
  const dimensionId=resolveRenderDimension(model,override);
  if(dimensionId===model.dimensionId)return model.contentTypography;
  return deriveContentTypographyCapability(model.document,dimensionId);
}

export function resolveRenderMediaLogo(model,override){
  const dimensionId=resolveRenderDimension(model,override);
  if(dimensionId===model.dimensionId)return model.mediaLogo;
  const layout=deriveLayoutCapability(model.document,dimensionId,model.layoutContext);
  return deriveMediaLogoCapability(model.document,dimensionId,{layout});
}

export function resolveRenderSurface(model,override){
  const dimensionId=resolveRenderDimension(model,override);
  if(dimensionId===model.dimensionId)return model.surface;
  return deriveSurfaceCapability(model.document,dimensionId);
}

export function resolveRenderDecoration(model,override){
  const dimensionId=resolveRenderDimension(model,override);
  if(dimensionId===model.dimensionId)return model.decoration;
  const approvedDecorationAssetIds=Array.isArray(model.runtime.overlays)?model.runtime.overlays.map(item=>item?.id).filter(Boolean):null;
  return deriveDecorationCapability(model.document,dimensionId,{
    budget:model.layoutContext.decorationBudget,
    approvedAssetIds:approvedDecorationAssetIds,
  });
}

export function resolveRenderLayout(model, override) {
  const dimensionId = resolveRenderDimension(model, override);
  if (dimensionId === model.dimensionId) return model.layout;
  return deriveLayoutCapability(model.document, dimensionId, model.layoutContext);
}

export function resolveRenderConstraints(model, override, measurements) {
  const dimensionId = resolveRenderDimension(model, override);
  if (dimensionId === model.dimensionId && !measurements) return model.constraints;
  return evaluateLayoutConstraints(resolveRenderLayout(model, dimensionId), measurements);
}

export function resolveRenderDimension(model, override) {
  if (!model || model.version !== RENDER_MODEL_VERSION) throw new TypeError("invalid render model");
  return typeof override === "string" && override ? override : model.dimensionId;
}
