import { useCallback, useEffect, useState } from "react";
import {
  cloudListSessions,
  localGetAllSessions,
  mergeSessionTiles,
} from "@/lib/sessions";

/** Owns the local/cloud Posts tile catalogue and its on-open archive refresh. */
export function usePostLibrary({
  feedOpen,
  setCloudConfigured,
  moodboardActionsRef,
}) {
  const [postTiles, setPostTiles] = useState([]);
  const [archivedTiles, setArchivedTiles] = useState(null);

  const refreshPostTiles = useCallback(async () => {
    const localTiles = localGetAllSessions().map(session => ({
      id: session.id,
      title: session.title,
      thumb: session.thumb,
      updatedAt: session.updatedAt,
      local: true,
      liked: session.liked === true,
      exportedAt: session.exportedAt || null,
    }));
    const { configured, sessions } = await cloudListSessions();
    if (configured) setCloudConfigured(true);
    setPostTiles(mergeSessionTiles(localTiles, configured ? sessions : []));
  }, [setCloudConfigured]);

  const loadArchivedTiles = useCallback(async () => {
    const { configured, sessions } = await cloudListSessions({ archived: true });
    setArchivedTiles(configured ? mergeSessionTiles([], sessions) : []);
  }, []);

  useEffect(() => {
    if (!feedOpen) return;
    refreshPostTiles();
    loadArchivedTiles();
    moodboardActionsRef.current.load?.();
  }, [feedOpen, loadArchivedTiles, moodboardActionsRef, refreshPostTiles]);

  return {
    postTiles,
    setPostTiles,
    archivedTiles,
    setArchivedTiles,
    refreshPostTiles,
    loadArchivedTiles,
  };
}
