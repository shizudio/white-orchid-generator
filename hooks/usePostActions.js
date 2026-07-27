import { useCallback } from "react";
import {
  buildGenes,
  classifySceneCategory,
  cloudGetSession,
  localGetSession,
  localSaveSession,
  logLike,
  setCurrentSessionId,
  setSessionLiked,
} from "@/lib/sessions";

/** Owns mutations and restore actions for records surfaced in the Posts gallery. */
export function usePostActions({
  sessionId,
  currentLiked,
  postActionsRef,
  setCurrentLiked,
  setPostTiles,
  setArchivedTiles,
  setSessionId,
  setSessionTitle,
  setSessionConversation,
  setSessionInitialMessages,
  setSessionRestoreKey,
  setActiveTemplateName,
  setGenBrief,
  setExportNudge,
  setTopMenu,
  setFeedOpen,
}) {
  const toggleLike = useCallback(async id => {
    const target = id || sessionId;
    if (!target) return;
    const prior = localGetSession(target);
    const wasLiked = target === sessionId ? currentLiked : prior?.liked === true;
    const nextLiked = !wasLiked;
    if (target === sessionId) setCurrentLiked(nextLiked);
    setPostTiles(previous => previous.map(tile =>
      tile.id === target ? { ...tile, liked: nextLiked } : tile));
    setArchivedTiles(previous => Array.isArray(previous)
      ? previous.map(tile => tile.id === target ? { ...tile, liked: nextLiked } : tile)
      : previous);
    const record = await setSessionLiked(target, nextLiked);
    const actions = postActionsRef.current;
    const geneState = target === sessionId
      ? actions.createState?.()
      : (record?.state || prior?.state || null);
    const genes = buildGenes(geneState, {
      sceneCategory: target === sessionId
        ? classifySceneCategory(actions.scene?.())
        : null,
    });
    logLike({
      liked: nextLiked,
      genes,
      thumb: record?.thumb || prior?.thumb || null,
      sessionId: target,
    });
  }, [currentLiked, postActionsRef, sessionId, setArchivedTiles, setCurrentLiked, setPostTiles]);

  const markSessionExported = useCallback(() => {
    if (!sessionId) return;
    const exportedAt = Date.now();
    localSaveSession({ id: sessionId, exportedAt });
    postActionsRef.current.saveNow?.();
    setPostTiles(previous => previous.map(tile =>
      tile.id === sessionId ? { ...tile, exportedAt } : tile));
  }, [postActionsRef, sessionId, setPostTiles]);

  const openSession = useCallback(async id => {
    if (!id || id === sessionId) {
      setTopMenu(null);
      setFeedOpen(false);
      return;
    }
    let record = null;
    const { configured, session } = await cloudGetSession(id);
    if (configured && session) {
      const localMirror = localGetSession(id);
      record = {
        id: session.id,
        title: session.title,
        state: session.state,
        conversation: session.conversation || [],
        groupId: session.group_id ?? null,
        groupTitle: session.group_title,
        groupOrder: session.group_order,
        liked: session.liked != null ? session.liked === true : localMirror?.liked === true,
        exportedAt: session.exported_at
          ? Date.parse(session.exported_at)
          : (localMirror?.exportedAt ?? null),
      };
    } else {
      const local = localGetSession(id);
      if (local) {
        record = {
          id: local.id,
          title: local.title,
          state: local.state,
          conversation: local.conversation || [],
          groupId: local.groupId ?? null,
          groupTitle: local.groupTitle,
          groupOrder: local.groupOrder,
          liked: local.liked === true,
          exportedAt: local.exportedAt ?? null,
        };
      }
    }
    if (!record) {
      setTopMenu(null);
      setFeedOpen(false);
      return;
    }
    localSaveSession({
      id: record.id,
      title: record.title,
      state: record.state,
      conversation: record.conversation,
      groupId: record.groupId ?? null,
      groupTitle: record.groupTitle,
      groupOrder: record.groupOrder,
      liked: record.liked === true,
      exportedAt: record.exportedAt ?? null,
    });
    const actions = postActionsRef.current;
    // Opening a stored post is a RESTORE, not a re-skin — the post's own copy must
    // open verbatim rather than inheriting whatever is on the canvas right now.
    actions.applyDesignTemplate?.({ state: record.state }, { intent: "restore" });
    setSessionId(record.id);
    setCurrentSessionId(record.id);
    setSessionTitle(record.title || "");
    setActiveTemplateName("");
    setGenBrief(null);
    setSessionConversation(record.conversation);
    setSessionInitialMessages(record.conversation);
    setSessionRestoreKey(value => value + 1);
    setExportNudge(false);
    setCurrentLiked(record.liked === true);
    actions.closeInspector?.();
    setTopMenu(null);
    setFeedOpen(false);
  }, [
    postActionsRef,
    sessionId,
    setActiveTemplateName,
    setCurrentLiked,
    setExportNudge,
    setFeedOpen,
    setGenBrief,
    setSessionConversation,
    setSessionId,
    setSessionInitialMessages,
    setSessionRestoreKey,
    setSessionTitle,
    setTopMenu,
  ]);

  return { toggleLike, markSessionExported, openSession };
}
