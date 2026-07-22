import { useEffect, useRef, useState } from "react";

const DEFAULT_NOTE = "Using accessible template defaults for this background.";

/**
 * Recommends accessible text ink and seeds an unpinned logo from the visible
 * image regions. It never writes the user's text-colour selection; only the
 * Auto recommendation and system-owned logo placement/variant are updated.
 */
export function useAccessibilityDirector({
  mediaObject,
  imageObject,
  videoObject,
  imageSource,
  sampleImageSource,
  postType,
  backgroundOpacity,
  dimensionId,
  hasFrameLayer,
  backgroundOption,
  userLogoTouched,
  selectedLogoId,
  typeLayoutDefaults,
  palette,
  logoVariants,
  analyzeAsset,
  luminance,
  contrast,
  suggestTextColor,
  suggestTextColorForSurfaces,
  suggestLogoColor,
  formatLayoutFor,
  actionsRef,
}) {
  const [suggestedTextColor, setSuggestedTextColor] = useState("whiteSmoke");
  const [textSurfaceLuminance, setTextSurfaceLuminance] = useState(() => luminance(palette.burnham));
  const [textMinContrast, setTextMinContrast] = useState(4.5);
  const [accessibilityNote, setAccessibilityNote] = useState("Using the template's accessible defaults.");
  const [suggestedLogoColor, setSuggestedLogoColor] = useState("ivory");
  const initialPreviewRef = useRef(true);

  useEffect(() => {
    if (initialPreviewRef.current
      && postType === "photo_logo"
      && imageSource === sampleImageSource) {
      if (mediaObject) initialPreviewRef.current = false;
      return;
    }

    const base = typeLayoutDefaults[postType] || typeLayoutDefaults.text_post;
    const backgroundLuminance = luminance(backgroundOption?.color || palette.burnham);
    let textLuminance = backgroundLuminance;
    let logoRegionLuminance = backgroundLuminance;
    let logoPosition = "bottom-right";
    let textColor = suggestTextColor(textLuminance);
    let minimumContrast = 4.5;

    if (mediaObject) {
      try {
        const regions = analyzeAsset(mediaObject).regions;
        const allowedRows = postType === "texture_text"
          ? [1, 2]
          : postType === "event" ? [0, 1] : [0, 1, 2];
        const textCandidates = regions
          .filter(region => allowedRows.includes(region.row) && region.col !== 1)
          .map(region => ({
            ...region,
            score: region.variance + (region.row === 1 ? 0.008 : 0) + (region.col === 1 ? 0.02 : 0),
          }))
          .sort((a, b) => a.score - b.score);
        const textRegion = textCandidates[0] || regions[0];
        const textColumns = textRegion.col === 0 ? [0, 1] : [1, 2];
        const textRows = textRegion.row === 2
          ? [1, 2]
          : [textRegion.row, Math.min(2, textRegion.row + 1)];
        const textSurfaces = regions
          .filter(region => textColumns.includes(region.col) && textRows.includes(region.row))
          .map(region => region.mean);
        const textRecommendation = suggestTextColorForSurfaces(textSurfaces);
        textLuminance = textRecommendation.worstSurface;
        textColor = textRecommendation.id;
        minimumContrast = textRecommendation.minContrast;

        const greenLuminance = luminance(palette.burnham);
        const ivoryLuminance = luminance(palette.whiteSmoke);
        const logoCandidates = regions.map(region => {
          const overlapsText = textColumns.includes(region.col) && textRows.includes(region.row);
          const bestContrast = Math.max(
            contrast(region.mean, greenLuminance),
            contrast(region.mean, ivoryLuminance),
          );
          return {
            ...region,
            score: bestContrast
              - region.variance * 8
              - (overlapsText ? 8 : 0)
              - (region.row === 1 && region.col === 1 ? 0.8 : 0),
          };
        }).sort((a, b) => b.score - a.score);
        const logoRegion = logoCandidates[0] || regions[8];
        logoRegionLuminance = logoRegion.mean;
        logoPosition = logoRegion.row === 1 && logoRegion.col === 1
          ? "center"
          : `${logoRegion.row === 0 ? "top" : logoRegion.row === 1 ? "mid" : "bottom"}-${logoRegion.col === 0 ? "left" : logoRegion.col === 1 ? "center" : "right"}`;
        setAccessibilityNote(minimumContrast >= 4.5
          ? "Auto-positioned text and logo in the clearest high-contrast regions."
          : "Mixed image tones detected. Auto colour and a subtle contrast edge keep the copy readable.");
      } catch {
        setAccessibilityNote("Using accessible template defaults for this visual.");
      }
    } else {
      logoPosition = (base.y || 0) >= 0.55 ? "top-right" : "bottom-right";
      setAccessibilityNote(DEFAULT_NOTE);
    }

    setTextSurfaceLuminance(textLuminance);
    setSuggestedTextColor(textColor);
    setTextMinContrast(minimumContrast);
    const actions = actionsRef.current;
    const logoColor = suggestLogoColor(logoRegionLuminance);
    setSuggestedLogoColor(logoColor);
    const current = logoVariants.find(variant => variant.id === selectedLogoId);
    const match = current && logoVariants.find(variant =>
      variant.group === current.group
      && variant.label === current.label
      && variant.color === logoColor);
    actions.applyLogoPatch?.({
      ...(!userLogoTouched ? {logoPosition} : {}),
      ...(match ? {logoId:match.id} : {}),
    });
  }, [
    actionsRef,
    analyzeAsset,
    backgroundOpacity,
    backgroundOption,
    contrast,
    dimensionId,
    formatLayoutFor,
    hasFrameLayer,
    imageObject,
    imageSource,
    logoVariants,
    luminance,
    mediaObject,
    palette,
    postType,
    sampleImageSource,
    selectedLogoId,
    suggestLogoColor,
    suggestTextColor,
    suggestTextColorForSurfaces,
    typeLayoutDefaults,
    userLogoTouched,
    videoObject,
  ]);

  useEffect(() => {
    if (userLogoTouched) return;
    const format = formatLayoutFor(dimensionId, postType);
    actionsRef.current.applyLogoPatch?.({
      logoPosition:format.logo.position,
      logoSize:format.logo.sizeId,
    });
  }, [actionsRef, dimensionId, formatLayoutFor, postType, userLogoTouched]);

  return {
    suggestedTextColor,
    textSurfaceLuminance,
    textMinContrast,
    accessibilityNote,
    suggestedLogoColor,
  };
}
