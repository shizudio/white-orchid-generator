import { useEffect } from "react";

/** Waits for self-hosted fonts and decodes the non-destructive greeting image. */
export function useEditorBootstrap({ sampleImageSource, loadImage, setImageObject, setFontsLoaded, sampleSuppressedRef = null }) {
  useEffect(() => {
    let active = true;
    document.fonts.ready.then(() => {
      if (active) setFontsLoaded(true);
    });
    return () => { active = false; };
  }, [setFontsLoaded]);

  useEffect(() => {
    let active = true;
    loadImage(sampleImageSource).then(image => {
      // (Task #69 photo-load fix — honest fallback) A landing generation that
      // deliberately landed PHOTO-LESS (the degraded AI-decide path) stays a clean
      // solid design: the greeting sample must not fill its media window (law 6).
      if (sampleSuppressedRef?.current) return;
      if (active && image) setImageObject(previous => previous || image);
    });
    return () => { active = false; };
  }, [loadImage, sampleImageSource, setImageObject, sampleSuppressedRef]);
}
