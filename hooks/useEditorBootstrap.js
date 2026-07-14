import { useEffect } from "react";

/** Waits for self-hosted fonts and decodes the non-destructive greeting image. */
export function useEditorBootstrap({ sampleImageSource, loadImage, setImageObject, setFontsLoaded }) {
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
      if (active && image) setImageObject(previous => previous || image);
    });
    return () => { active = false; };
  }, [loadImage, sampleImageSource, setImageObject]);
}
