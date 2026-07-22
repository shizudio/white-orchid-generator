import { useCallback } from "react";
import { newSessionId, setCurrentSessionId } from "@/lib/sessions";
import { createNewPostHistorySnapshot } from "@/lib/design-history.mjs";

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
    restoreSnapshot(createNewPostHistorySnapshot({
      typeLayouts:freshTypeLayouts(),
      fontSizes:freshFontSizes(),
      defaultImage,
    }));
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
