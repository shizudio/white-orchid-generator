import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchTemplates,
  isTemplateSyncEligible,
  mergeTemplates,
  pushTemplate,
} from "@/lib/cloud-sync";
import { migratePersistedDesignCollection } from "@/lib/design-persistence.mjs";

const STORAGE = Object.freeze({
  library: "wo-image-library",
  overlays: "wo-overlays",
  legacyWorkDocument: "wo-workdoc",
  legacyWorkTimestamp: "wo-workdoc-ts",
  templates: "wo-design-templates",
  templateV0Backup: "wo-design-templates-v0-backup",
  migrationTelemetry: "wo-persistence-migration-v1",
  hiddenStarters: "wo-hidden-starters",
});

async function readStorage(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Storage error:", error);
  }
}

async function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage is an optional enhancement; the editor remains usable without it.
  }
}

function cloudTemplateView(cloudRow, fallbackCreatedAt) {
  return {
    id: cloudRow.id,
    name: cloudRow.name,
    thumb: cloudRow.thumb,
    state: cloudRow.state,
    createdAt: cloudRow.created_at ? Date.parse(cloudRow.created_at) : fallbackCreatedAt,
    synced: true,
  };
}

/**
 * Owns the editor's local template/asset bootstrap and template cloud reconciliation.
 * Session restore/save deliberately remains a separate lifecycle: it has different
 * conflict rules and should not be coupled to the reusable-template library.
 */
export function useDesignPersistence({
  library,
  setLibrary,
  overlays,
  setOverlays,
  designTemplates,
  setDesignTemplates,
  hiddenStarters,
  setHiddenStarters,
  builtinOverlays,
  onRestoreLegacyShapes,
  onLegacyWorkFound,
}) {
  const [ready, setReady] = useState(false);
  const [cloudTplConfigured, setCloudTplConfigured] = useState(false);
  const hiddenStartersLoadedRef = useRef(false);
  const bootstrapInputsRef = useRef({
    builtinOverlays,
    onRestoreLegacyShapes,
    onLegacyWorkFound,
  });

  const replaceTemplateId = useCallback((localId, cloudRow) => {
    setDesignTemplates(previous => previous.map(template =>
      template.id === localId
        ? cloudTemplateView(cloudRow, template.createdAt)
        : template));
  }, [setDesignTemplates]);

  const markLocalOnly = useCallback(id => {
    setDesignTemplates(previous => previous.map(template =>
      template.id === id ? { ...template, localOnly: true } : template));
  }, [setDesignTemplates]);

  const markUnsynced = useCallback((id, on) => {
    setDesignTemplates(previous => previous.map(template =>
      template.id === id ? { ...template, unsynced: on } : template));
  }, [setDesignTemplates]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const inputs = bootstrapInputsRef.current;
      const builtins = inputs.builtinOverlays || [];
      const storedLibrary = await readStorage(STORAGE.library);
      if (!cancelled && storedLibrary) setLibrary(storedLibrary);

      const storedOverlays = await readStorage(STORAGE.overlays) || [];
      if (!cancelled) {
        setOverlays([
          ...builtins,
          ...storedOverlays.filter(asset => !asset.builtin && !asset.official),
        ]);
      }

      // Official decorations are cloud-authoritative and never written locally.
      fetch("/api/brand-assets")
        .then(response => response.json())
        .then(data => {
          if (cancelled || !data || data.configured === false || !Array.isArray(data.assets)) return;
          const officialAssets = data.assets
            .filter(asset => asset && asset.id && asset.src)
            .map(asset => ({
              id: asset.id,
              name: asset.name || "Decoration",
              src: asset.src,
              kind: asset.kind || "center",
              ratio: asset.ratio || 1,
              // (2026-08-18) Line-art classification stored at upload time;
              // legacy uploads surface null and default to linework client-side.
              art: asset.art || null,
              category: "overlays",
              official: true,
            }));
          if (!officialAssets.length) return;
          setOverlays(previous => [
            ...previous.filter(asset => !asset.official),
            ...officialAssets,
          ]);
        })
        .catch(() => {});

      const legacyWorkDocument = await readStorage(STORAGE.legacyWorkDocument);
      if (legacyWorkDocument && !cancelled) {
        inputs.onRestoreLegacyShapes?.(legacyWorkDocument);
        if (legacyWorkDocument.length) inputs.onLegacyWorkFound?.();
      }
      // Sessions own the working design. Import the old shape-only record once,
      // then remove it so it cannot overwrite a later session restore.
      await removeStorage(STORAGE.legacyWorkDocument);
      await removeStorage(STORAGE.legacyWorkTimestamp);

      const rollbackRequested = typeof location !== "undefined"
        && new URLSearchParams(location.search).get("designPersistenceRollback") === "1";
      const rollbackTemplates = rollbackRequested
        ? await readStorage(STORAGE.templateV0Backup)
        : null;
      const storedTemplates = rollbackTemplates?.length
        ? rollbackTemplates
        : await readStorage(STORAGE.templates);
      const rollout = migratePersistedDesignCollection(storedTemplates || []);
      const localTemplates = rollbackRequested ? (storedTemplates || []) : rollout.migrated;

      if (!rollbackRequested && rollout.backups.length) {
        await writeStorage(STORAGE.templateV0Backup, rollout.backups);
        const previous = await readStorage(STORAGE.migrationTelemetry) || {};
        await writeStorage(STORAGE.migrationTelemetry, {
          version: 1,
          runs: (previous.runs || 0) + 1,
          attempted: (previous.attempted || 0) + rollout.telemetry.attempted,
          succeeded: (previous.succeeded || 0) + rollout.telemetry.succeeded,
          failed: (previous.failed || 0) + rollout.telemetry.failed,
          lastAt: Date.now(),
          rollbackAvailable: true,
        });
      }

      if (cancelled) return;
      if (localTemplates.length) setDesignTemplates(localTemplates);
      setReady(true);

      // Cloud wins on shared ids; eligible local-only records are promoted.
      const { configured, templates: cloudTemplates } = await fetchTemplates();
      if (cancelled || !configured) return;
      setCloudTplConfigured(true);
      const { merged, localOnlyIds } = mergeTemplates(localTemplates, cloudTemplates);
      setDesignTemplates(merged);
      for (const template of merged) {
        if (cancelled || !localOnlyIds.has(template.id)) continue;
        if (!isTemplateSyncEligible(template)) {
          markLocalOnly(template.id);
          continue;
        }
        const result = await pushTemplate({
          name: template.name,
          thumb: template.thumb,
          state: template.state,
        });
        if (cancelled) return;
        if (result.configured && result.template) replaceTemplateId(template.id, result.template);
        else if (result.tooLarge) markLocalOnly(template.id);
      }
    };

    bootstrap();
    return () => { cancelled = true; };
  }, [markLocalOnly, replaceTemplateId, setDesignTemplates, setLibrary, setOverlays]);

  useEffect(() => {
    if (ready) writeStorage(STORAGE.library, library);
  }, [library, ready]);

  useEffect(() => {
    if (ready) writeStorage(STORAGE.overlays, overlays.filter(asset => !asset.official));
  }, [overlays, ready]);

  useEffect(() => {
    if (ready) writeStorage(STORAGE.templates, designTemplates);
  }, [designTemplates, ready]);

  useEffect(() => {
    let cancelled = false;
    readStorage(STORAGE.hiddenStarters).then(stored => {
      if (!cancelled && Array.isArray(stored)) {
        setHiddenStarters(stored.filter(id => typeof id === "string"));
      }
      hiddenStartersLoadedRef.current = true;
    });
    return () => { cancelled = true; };
  }, [setHiddenStarters]);

  useEffect(() => {
    if (hiddenStartersLoadedRef.current) {
      writeStorage(STORAGE.hiddenStarters, hiddenStarters);
    }
  }, [hiddenStarters]);

  return {
    ready,
    cloudTplConfigured,
    replaceTemplateId,
    markLocalOnly,
    markUnsynced,
  };
}
