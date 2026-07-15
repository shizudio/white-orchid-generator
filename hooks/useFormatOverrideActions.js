import { useCallback } from "react";
import { normalizeShapeInstances } from "@/lib/design-document.mjs";

/** Cross-device draft intake plus per-format override visibility and reset. */
export function useFormatOverrideActions({
  newerDraft,
  setNewerDraft,
  setGalleryOpen,
  dispatchDesignCommand,
  masterDimensionId,
  dimensionId,
  typeLayoutsByDimension,
  logoByDimension,
  imageTransformByDimension,
  shapeLayers,
  noteManualEdit,
  setShapeDirty,
}) {
  const loadNewerDraft = useCallback(() => {
    const layers = newerDraft?.state?.overlayLayers;
    if (Array.isArray(layers)) {
      dispatchDesignCommand({ type: "shapes/replace", shapes: normalizeShapeInstances(layers) });
      setGalleryOpen(false);
    }
    setNewerDraft(null);
  }, [newerDraft, dispatchDesignCommand, setGalleryOpen, setNewerDraft]);

  const dimensionHasOverride = useCallback(targetDimensionId => {
    if (targetDimensionId === masterDimensionId) return false;
    const layouts = typeLayoutsByDimension?.[targetDimensionId];
    if (layouts && Object.keys(layouts).some(key => layouts[key] && Object.keys(layouts[key]).length)) return true;
    if (logoByDimension?.[targetDimensionId]) return true;
    if (imageTransformByDimension?.[targetDimensionId]) return true;
    // (§2.9.2) A GENERATED layout shape carries SYSTEM-authored per-format geometry
    // in byDim (the archetype's own 6-format cascade, baked at emission) — that is
    // not a user adjustment. It counts as an override only once the owner actually
    // edited the shape on that format (touchedByDim, written by the shape writers).
    return shapeLayers.some(layer => layer?.byDim?.[targetDimensionId]
      && (layer.origin !== "layout" || layer.touchedByDim?.[targetDimensionId]));
  }, [masterDimensionId, typeLayoutsByDimension, logoByDimension, imageTransformByDimension, shapeLayers]);

  const resetFormatToMaster = useCallback(targetDimensionId => {
    const id = targetDimensionId || dimensionId;
    if (id === masterDimensionId) return;
    noteManualEdit(["text", "logo", "photo", "overlay"]);
    dispatchDesignCommand({ type: "format/reset-to-master", dimensionId: id });
    setShapeDirty(true);
  }, [dimensionId, masterDimensionId, noteManualEdit, dispatchDesignCommand, setShapeDirty]);

  return { loadNewerDraft, dimensionHasOverride, resetFormatToMaster };
}
