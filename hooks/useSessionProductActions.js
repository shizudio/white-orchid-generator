import { useCallback } from "react";
import {
  buildGenes,
  classifySceneCategory,
  getCurrentSessionId,
  logFeedback,
  newTurnId,
} from "@/lib/sessions";

/** Session-facing titles and the liked-design "more like this" workflow. */
export function useSessionProductActions({
  sessionTitle,
  generationBrief,
  conversation,
  headline,
  subtext,
  postTypeLabel,
  currentTemplateState,
  hasMedia,
  startNewPost,
  applyPatchRef,
  applyPatch,
}) {
  const deriveSessionTitle = useCallback(() => {
    const clip = value => String(value || "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (sessionTitle) return sessionTitle;
    if (generationBrief?.message) return clip(generationBrief.message);
    const firstUser = conversation.find(message => message.role === "user" && message.content);
    if (firstUser) return clip(firstUser.content);
    if (headline?.trim()) return clip(headline);
    if (subtext?.trim()) return clip(subtext);
    return postTypeLabel || "Post";
  }, [sessionTitle, generationBrief, conversation, headline, subtext, postTypeLabel]);

  const moreLikeThis = useCallback(async () => {
    const genes = buildGenes(currentTemplateState(), {
      sceneCategory: classifySceneCategory(generationBrief?.scene),
    });
    const hadPhoto = !!hasMedia;
    startNewPost();

    // Apply inherited genes only after the fresh session has committed, using
    // the current patch pipeline rather than the pre-reset render closure.
    await new Promise(resolve => setTimeout(resolve, 250));
    const patch = {};
    if (genes.postType) patch.postType = genes.postType;
    if (genes.dimensionId) patch.dimensionId = genes.dimensionId;
    if (genes.archetypeId && genes.archetypeId !== "none") {
      patch.archetypeId = genes.archetypeId;
      patch.archVariant = genes.archVariant;
    } else {
      if (genes.bgColor) patch.bgColor = genes.bgColor;
      if (genes.photoTreatment && genes.photoTreatment !== "none") patch.photoTreatment = genes.photoTreatment;
    }
    (applyPatchRef.current || applyPatch)(patch, { source: "ui" });
    logFeedback({
      turn_id: newTurnId(),
      session_id: getCurrentSessionId() || undefined,
      user_message: "[chip] More like this",
      verdict: { event: "more-like-this", genes },
    });
    return { hadPhoto, genes };
  }, [currentTemplateState, generationBrief, hasMedia, startNewPost, applyPatchRef, applyPatch]);

  return { deriveSessionTitle, moreLikeThis };
}
