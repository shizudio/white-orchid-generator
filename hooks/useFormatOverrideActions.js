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
    return shapeLayers.some(layer => layer?.byDim?.[targetDimensionId]);
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
