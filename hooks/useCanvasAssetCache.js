import { useEffect, useRef, useState } from "react";

// (client ruling 2026-07-23) "orchid-petal" was retired from the catalog; the
// petalMask / petal_window mask is now the sanctioned "shape-1" silhouette, so
// the retired asset is no longer preloaded here.
const ARCHETYPE_ASSET_IDS = Object.freeze([
  "shape-1",
  "shape-2",
  "shape-3",
  "acc-spark",
]);

/**
 * Decodes persistent asset records into transient browser Image objects used by
 * the canvas renderer. Late loads always redraw through drawRef, so a format
 * switch cannot be overwritten by a stale render closure.
 */
export function useCanvasAssetCache({
  overlays,
  builtinOverlays,
  logoVariants,
  selectedLogoVariant,
  selectedLogoId,
  archetypeId,
  logoVariantsVersion,
  loadImage,
  drawRef,
}) {
  const [logoImage, setLogoImage] = useState(null);
  const overlayImages = useRef({});
  const archetypeImages = useRef({});
  const logoVariantImages = useRef({});

  useEffect(() => {
    let cancelled = false;
    const pending = overlays.filter(asset => !overlayImages.current[asset.id]);
    if (!pending.length) return undefined;
    Promise.all(pending.map(asset =>
      loadImage(asset.dataUrl || asset.src).then(image => {
        if (image) overlayImages.current[asset.id] = image;
      })))
      .then(() => { if (!cancelled) drawRef.current?.("drawRef-async"); });
    return () => { cancelled = true; };
  }, [drawRef, loadImage, overlays]);

  useEffect(() => {
    let cancelled = false;
    const pendingIds = ARCHETYPE_ASSET_IDS.filter(id => !archetypeImages.current[id]);
    if (!pendingIds.length) return undefined;
    Promise.all(pendingIds.map(id => {
      const asset = builtinOverlays.find(candidate => candidate.id === id);
      if (!asset) return Promise.resolve();
      return loadImage(asset.src).then(image => {
        if (image) archetypeImages.current[id] = image;
      });
    })).then(() => { if (!cancelled) drawRef.current?.("drawRef-async"); });
    return () => { cancelled = true; };
  }, [archetypeId, builtinOverlays, drawRef, loadImage]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedLogoVariant) {
      setLogoImage(null);
      return undefined;
    }
    loadImage(selectedLogoVariant.src).then(image => {
      if (!cancelled) setLogoImage(image || null);
    });
    return () => { cancelled = true; };
  }, [loadImage, selectedLogoId, selectedLogoVariant]);

  useEffect(() => {
    let cancelled = false;
    const pending = logoVariants.filter(variant => !logoVariantImages.current[variant.id]);
    Promise.all(pending.map(variant =>
      loadImage(variant.src).then(image => {
        if (image) logoVariantImages.current[variant.id] = image;
      })))
      .then(() => {
        if (!cancelled && archetypeId) drawRef.current?.("drawRef-async");
      });
    return () => { cancelled = true; };
  }, [archetypeId, drawRef, loadImage, logoVariants, logoVariantsVersion, selectedLogoId, selectedLogoVariant]);

  return {
    logoImage,
    overlayImages,
    archetypeImages,
    logoVariantImages,
  };
}
