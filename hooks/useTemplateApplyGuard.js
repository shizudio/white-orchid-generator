import { useCallback, useMemo } from "react";

/** Protect meaningful work before replacing the complete design with a template. */
export function useTemplateApplyGuard({
  copy,
  shapeCount,
  imageSource,
  defaultImageSource,
  hasVideo,
  imageTransform,
  setActiveTemplateName,
  setGalleryOpen,
  applyDesignTemplate,
  confirmReplace = message => window.confirm(message),
}) {
  const hasMeaningfulEdits = useMemo(() => {
    const hasCopy = Object.values(copy || {}).some(value => !!String(value || "").trim());
    const transform = imageTransform || {};
    return hasCopy || shapeCount > 0 ||
      (typeof imageSource === "string" && imageSource !== defaultImageSource) ||
      hasVideo || transform.zoom !== 1 || transform.cx !== 0.5 ||
      transform.cy !== 0.5 || (transform.rotation || 0) !== 0;
  }, [copy, shapeCount, imageSource, defaultImageSource, hasVideo, imageTransform]);

  const applyTemplateWithGuard = useCallback(template => {
    if (hasMeaningfulEdits && !confirmReplace("Replace your current design with this template?")) return false;
    setActiveTemplateName(template?.name || "");
    setGalleryOpen(false);
    applyDesignTemplate(template);
    return true;
  }, [hasMeaningfulEdits, confirmReplace, setActiveTemplateName, setGalleryOpen, applyDesignTemplate]);

  return { hasMeaningfulEdits, applyTemplateWithGuard };
}
