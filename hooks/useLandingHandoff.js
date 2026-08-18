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
  photoRemovedRef = null,
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
    // (Task #69 photo-load fix — honest fallback) A landing plan that DELIBERATELY
    // landed photo-less (removeImage: the degraded AI-decide path) must stay a clean
    // solid design: flag it so the editor bootstrap never seeds the greeting sample
    // photo into this generation's media window (law 6 — the scratch photo must not
    // masquerade as this generation's photo).
    if (photoRemovedRef && handoff?.patch?.removeImage === true && !handoff?.imageUrl) {
      photoRemovedRef.current = true;
    }
    const designPatch = {
      ...(handoff?.patch || {}),
      ...(handoff?.imageUrl ? {imageSrc:handoff.imageUrl} : {}),
    };
    if (Object.keys(designPatch).length) {
      actions.applyDesignPatch?.(designPatch, {
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
    // (Task #69) A landing UPLOAD lands in the Library like any studio upload:
    // source_type 'uploaded' + session lineage (the #64 machinery). The editor
    // owns the POST because only it knows the freshly created session id.
    if (handoff?.imageOrigin === "uploaded"
        && typeof handoff?.imageUrl === "string"
        && handoff.imageUrl.startsWith("data:")) {
      actions.persistLandingUpload?.(handoff.imageUrl);
    }

    actions.setChatSeed?.({
      originalMessage: handoff?.originalMessage || "",
      reply: handoff?.reply || "",
    });
    actions.setGalleryOpen?.(false);
    return undefined;
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
