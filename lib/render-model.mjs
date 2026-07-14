import { migrateDesignDocument } from "./design-document.mjs";

export const RENDER_MODEL_VERSION = 1;

/**
 * Explicit boundary between React/editor state and the canvas renderer.
 * The design document is serialisable; decoded browser assets deliberately live
 * in the separate assets bag. Neither bag is cloned because reducer documents
 * are immutable and browser image objects cannot be serialised.
 */
export function createRenderModel({ document, dimensionId, runtime = {}, assets = {} } = {}) {
  if (typeof dimensionId !== "string" || !dimensionId) {
    throw new TypeError("render model dimensionId must be a non-empty string");
  }
  return Object.freeze({
    version:RENDER_MODEL_VERSION,
    dimensionId,
    document:migrateDesignDocument(document),
    runtime:Object.freeze({ ...runtime }),
    assets:Object.freeze({ ...assets }),
  });
}

export function resolveRenderDimension(model, override) {
  if (!model || model.version !== RENDER_MODEL_VERSION) throw new TypeError("invalid render model");
  return typeof override === "string" && override ? override : model.dimensionId;
}

