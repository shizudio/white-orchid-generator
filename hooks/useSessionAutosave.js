import { useCallback, useEffect, useRef } from "react";
import { localGetSession, saveSession } from "@/lib/sessions";

/**
 * Debounces the canonical design + conversation into one session record.
 * Snapshot/title/thumbnail creation stays behind actionsRef because those actions
 * depend on the live renderer and must always use the latest render closure.
 */
export function useSessionAutosave({
  ready,
  sessionId,
  conversation,
  designDocument,
  dimensionId,
  exportFormat,
  acknowledgements,
  sessionTitle,
  briefMessage,
  actionsRef,
  setCloudConfigured,
  // (tombstone guard) Latched by the editor when a dispatched edit emptied copy —
  // the owner's deliberate clear. Without it saveSession holds an all-empty
  // document rather than overwriting a stored record that still has words.
  copyEmptiedByOwnerRef,
  delay = 2500,
}) {
  const timerRef = useRef(null);

  const saveNow = useCallback(() => {
    if (!sessionId) return;
    const actions = actionsRef.current;
    let thumbnail = null;
    try {
      thumbnail = actions.createThumbnail?.() || null;
    } catch {
      // The canvas may not have committed yet; the design still saves without a thumb.
    }
    const prior = localGetSession(sessionId);
    const record = {
      id: sessionId,
      title: actions.deriveTitle?.() || "Post",
      thumb: thumbnail,
      state: actions.createState?.(),
      conversation,
      updatedAt: Date.now(),
      groupId: prior?.groupId ?? null,
      groupTitle: prior?.groupTitle,
      groupOrder: prior?.groupOrder,
      liked: prior?.liked === true,
      exportedAt: prior?.exportedAt ?? null,
    };
    saveSession(record, {
      copyEmptiedByOwner: copyEmptiedByOwnerRef?.current === true,
    }).then(result => {
      if (result?.configured) setCloudConfigured(true);
    });
  }, [actionsRef, conversation, copyEmptiedByOwnerRef, sessionId, setCloudConfigured]);

  useEffect(() => {
    if (!ready || !sessionId) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(saveNow, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    acknowledgements,
    briefMessage,
    delay,
    designDocument,
    dimensionId,
    exportFormat,
    ready,
    saveNow,
    sessionId,
    sessionTitle,
  ]);

  return saveNow;
}
