import { useEffect, useRef } from "react";

const LANDING_PLAN_KEY = "wo-landing-plan";

/**
 * Consumes the one-time landing-page design handoff and schedules its born-clean
 * first-shot gate. The pending ref is shared with session bootstrap so an old
 * current-session pointer can never overwrite a newly generated post.
 */
export function useLandingHandoff({
  fontsLoaded,
  imageSource,
  imageObject,
  actionsRef,
  firstShotResolveRef,
}) {
  const landingPendingRef = useRef(false);
  const firstShotGateRanRef = useRef(false);

  useEffect(() => {
    let raw = null;
    try {
      raw = sessionStorage.getItem(LANDING_PLAN_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return undefined;

    landingPendingRef.current = true;
    try {
      sessionStorage.removeItem(LANDING_PLAN_KEY);
    } catch {
      // A restricted storage environment still gets the in-memory handoff.
    }

    let handoff;
    try {
      handoff = JSON.parse(raw);
    } catch {
      return undefined;
    }
    const actions = actionsRef.current;
    if (handoff?.patch) {
      actions.applyDesignPatch?.(handoff.patch, {
        harmonize: true,
        systemFreeVariables: true,
      });
    }
    if (handoff?.scenePrompt || handoff?.originalMessage) {
      actions.setGenerationBrief?.({
        scene: handoff.scenePrompt || "",
        message: handoff.originalMessage || "",
      });
    }

    let active = true;
    if (handoff?.imageUrl) {
      actions.setImageSource?.(handoff.imageUrl);
      actions.loadImage?.(handoff.imageUrl)
        .then(image => {
          if (!active || !image) return;
          actionsRef.current.setImageObject?.(image);
          actionsRef.current.rearmHarmonizer?.();
        })
        .catch(() => {});
    }
    actions.setChatSeed?.({
      originalMessage: handoff?.originalMessage || "",
      reply: handoff?.reply || "",
    });
    actions.setGalleryOpen?.(false);
    return () => { active = false; };
  }, [actionsRef]);

  useEffect(() => {
    if (firstShotGateRanRef.current) return undefined;
    if (!landingPendingRef.current) return undefined;
    if (!fontsLoaded) return undefined;
    if (imageSource && !imageObject) return undefined;
    firstShotGateRanRef.current = true;
    const timer = setTimeout(() => {
      try {
        firstShotResolveRef.current?.();
      } catch {
        // The advisory gate must never prevent the editor from opening.
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [firstShotResolveRef, fontsLoaded, imageObject, imageSource]);

  return landingPendingRef;
}
