import { useCallback } from "react";
import { hasUserFormatOverride } from "@/lib/design-document.mjs";

/** Cross-device draft intake plus per-format override visibility and reset. */
export function useFormatOverrideActions({
  newerDraft,
  setNewerDraft,
  setGalleryOpen,
  masterDimensionId,
  dimensionId,
  designDocument,
  applyPatch,
}) {
  const loadNewerDraft = useCallback(() => {
    const layers = newerDraft?.state?.overlayLayers;
    if (Array.isArray(layers)) {
      applyPatch({replaceShapeCollection:layers},{source:"ui"});
      setGalleryOpen(false);
    }
    setNewerDraft(null);
  }, [newerDraft, applyPatch, setGalleryOpen, setNewerDraft]);

  const dimensionHasOverride = useCallback(targetDimensionId => {
    if (targetDimensionId === masterDimensionId) return false;
    return hasUserFormatOverride(designDocument,targetDimensionId,masterDimensionId);
  }, [designDocument, masterDimensionId]);

  const resetFormatToMaster = useCallback(targetDimensionId => {
    const id = targetDimensionId || dimensionId;
    if (id === masterDimensionId) return;
    applyPatch({resetFormatToMaster:id},{source:"ui"});
  }, [dimensionId, masterDimensionId, applyPatch]);

  return { loadNewerDraft, dimensionHasOverride, resetFormatToMaster };
}
