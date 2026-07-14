import { useCallback } from "react";
import { newSessionId, setCurrentSessionId } from "@/lib/sessions";

/** Reset the design and conversation as one undoable new-post action. */
export function useNewPostAction({
  snapshotApplyableState,
  restoreSnapshot,
  undoDepth,
  freshTypeLayouts,
  freshFontSizes,
  defaultImage,
  setAiUndoStack,
  setRedoStack,
  setGenerationBrief,
  setActiveTemplateName,
  closeInspector,
  setSessionId,
  setSessionTitle,
  setSessionConversation,
  setSessionInitialMessages,
  setSessionRestoreKey,
  setExportNudge,
  setCurrentLiked,
}) {
  return useCallback(() => {
    setAiUndoStack(previous => [snapshotApplyableState(), ...previous].slice(0, undoDepth));
    setRedoStack([]);
    restoreSnapshot({
      postType: "photo_logo",
      archetypeId: null,
      dimensionId: "ig_portrait",
      headline: "",
      subtext: "",
      attribution: "",
      dateText: "",
      bgColor: "burnham",
      fieldColorOverride: null,
      bgAlpha: 1,
      textColorId: "auto",
      selectedLogoId: "p3-ivory",
      logoPosition: "bottom-center",
      logoSize: "m",
      backdropMode: "auto",
      photoTreatment: "none",
      photoFrame: { type: "none" },
      microLabel: "",
      pillText: "",
      heroRegister: "",
      typeLayouts: freshTypeLayouts(),
      userLogoTouched: false,
      logoByDim: {},
      logoFreePos: null,
      logoHidden: false,
      roleOffsetsByDim: {},
      typeLayoutsByDim: {},
      fontSizes: freshFontSizes(),
      overlayLayers: [],
      furnitureOverrides: {},
      markTab: "primary",
      image: defaultImage,
      imgT: { zoom: 1, cx: 0.5, cy: 0.5, rotation: 0 },
      imgTByDim: {},
      photoTouchedByDim: {},
    });
    setGenerationBrief(null);
    setActiveTemplateName("");
    closeInspector();

    const nextSessionId = newSessionId();
    setSessionId(nextSessionId);
    setCurrentSessionId(nextSessionId);
    setSessionTitle("");
    setSessionConversation([]);
    setSessionInitialMessages([]);
    setSessionRestoreKey(key => key + 1);
    setExportNudge(false);
    setCurrentLiked(false);
  }, [
    snapshotApplyableState, restoreSnapshot, undoDepth, freshTypeLayouts,
    freshFontSizes, defaultImage, setAiUndoStack, setRedoStack,
    setGenerationBrief, setActiveTemplateName, closeInspector, setSessionId,
    setSessionTitle, setSessionConversation, setSessionInitialMessages,
    setSessionRestoreKey, setExportNudge, setCurrentLiked,
  ]);
}
