import { useEffect, useState } from "react";

/**
 * Hydrates the runtime brand kit and server-managed logo/overlay catalogues.
 * Generator supplies the catalogue installation seam because its legacy canvas
 * renderer still reads module-scoped arrays; this hook owns all network timing.
 */
export function useBrandCatalogHydration({ brandKitFromContext, actionsRef }) {
  const [brandKit, setBrandKit] = useState(null);
  const [logoVariantsVersion, setLogoVariantsVersion] = useState(0);

  useEffect(() => {
    if (!brandKitFromContext) return;
    actionsRef.current.applyBrandKit?.(brandKitFromContext);
    setBrandKit(brandKitFromContext);
  }, [actionsRef, brandKitFromContext]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/logo-variants")
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (cancelled
          || !data
          || data.configured === false
          || !Array.isArray(data.variants)
          || !data.variants.length) return;
        actionsRef.current.installLogoVariants?.(data.variants);
        setLogoVariantsVersion(version => version + 1);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [actionsRef]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/overlay-assets")
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (cancelled
          || !data
          || data.configured === false
          || !Array.isArray(data.overlays)
          || !data.overlays.length) return;
        actionsRef.current.installBuiltinOverlays?.(data.overlays);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [actionsRef]);

  return { brandKit, logoVariantsVersion };
}
