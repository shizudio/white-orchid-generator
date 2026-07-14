import { useEffect, useRef } from "react";
import {
  cloudGetSession,
  getCurrentSessionId,
  installFeedbackDump,
  localGetSession,
  looksLikeGuardSession,
  newSessionId,
  purgeGuardSessions,
  resolveSessionConflict,
  setCurrentSessionId,
} from "@/lib/sessions";

function pinRestoredFormat(state, firstPaintDimensionId) {
  if (!firstPaintDimensionId) return state;
  if (state?.persistenceVersion === 1) {
    return {
      ...state,
      metadata: {
        ...(state.metadata || {}),
        dimensionId: firstPaintDimensionId,
      },
    };
  }
  return state?.dimensionId !== firstPaintDimensionId
    ? { ...state, dimensionId: firstPaintDimensionId }
    : state;
}

function recordSignature(record, firstPaintDimensionId) {
  try {
    return JSON.stringify([
      pinRestoredFormat(record.state, firstPaintDimensionId),
      record.conversation,
      record.title,
      record.liked,
    ]);
  } catch {
    return null;
  }
}

/**
 * Restores the current working session local-first and then reconciles its cloud
 * counterpart. A landing handoff always mints a separate session. Save/autosave
 * stays outside this hook so bootstrap and ongoing persistence cannot race each other.
 */
export function useSessionBootstrap({
  ready,
  firstPaintDimensionId,
  landingPendingRef,
  actionsRef,
  setSessionId,
  setSessionTitle,
  setSessionConversation,
  setSessionInitialMessages,
  setSessionRestoreKey,
  setSessionCloudConfigured,
  setCurrentLiked,
}) {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!ready || initializedRef.current) return;
    initializedRef.current = true;
    installFeedbackDump();
    let cancelled = false;

    const applyRecord = record => {
      if (cancelled) return;
      const actions = actionsRef.current;
      actions.applyDesignTemplate?.({
        state: pinRestoredFormat(record.state, firstPaintDimensionId),
      });
      setSessionId(record.id);
      setSessionTitle(record.title || "");
      setSessionConversation(record.conversation || []);
      setSessionInitialMessages(record.conversation || []);
      setSessionRestoreKey(value => value + 1);
      setCurrentLiked(record.liked === true);
      actions.refreshPostTiles?.();
    };

    const bootstrap = async () => {
      try {
        const purged = await purgeGuardSessions();
        if (purged.removedLocal || purged.removedCloud) {
          console.log("[woGuardPurge]", JSON.stringify(purged));
        }
      } catch {
        // Guard cleanup is best-effort; it must never stop the studio opening.
      }
      if (cancelled) return;

      const landingPending = landingPendingRef.current;
      const existingId = getCurrentSessionId();
      if (existingId && !landingPending) {
        const localMirror = localGetSession(existingId);
        let appliedSignature = null;
        if (localMirror?.state
          && Object.keys(localMirror.state).length
          && !looksLikeGuardSession(localMirror)) {
          const localRecord = {
            id: localMirror.id,
            title: localMirror.title,
            state: localMirror.state,
            conversation: localMirror.conversation || [],
            liked: localMirror.liked === true,
          };
          applyRecord(localRecord);
          appliedSignature = recordSignature(localRecord, firstPaintDimensionId);
        }

        const { configured, session } = await cloudGetSession(existingId);
        if (cancelled) return;
        if (configured && session) {
          setSessionCloudConfigured(true);
          const cloudRecord = {
            id: session.id,
            title: session.title,
            state: session.state,
            conversation: session.conversation || [],
            liked: session.liked != null
              ? session.liked === true
              : localMirror?.liked === true,
            updatedAt: session.updated_at ? Date.parse(session.updated_at) : 0,
          };
          if (cloudRecord.state && Object.keys(cloudRecord.state).length) {
            const winner = resolveSessionConflict(localMirror, cloudRecord);
            if (winner === localMirror && appliedSignature != null) return;
            const cloudSignature = recordSignature(cloudRecord, firstPaintDimensionId);
            if (appliedSignature == null
              || cloudSignature == null
              || cloudSignature !== appliedSignature) {
              applyRecord(cloudRecord);
            }
            return;
          }
        }
        if (appliedSignature != null) return;
      }

      if (cancelled) return;
      const nextId = existingId && !landingPending ? existingId : newSessionId();
      setSessionId(nextId);
      setCurrentSessionId(nextId);
      actionsRef.current.refreshPostTiles?.();
    };

    bootstrap();
    return () => { cancelled = true; };
  }, [
    actionsRef,
    firstPaintDimensionId,
    landingPendingRef,
    ready,
    setCurrentLiked,
    setSessionCloudConfigured,
    setSessionConversation,
    setSessionId,
    setSessionInitialMessages,
    setSessionRestoreKey,
    setSessionTitle,
  ]);
}
