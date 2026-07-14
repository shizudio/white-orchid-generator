import { useEffect } from "react";
import {
  deleteTemplate as cloudDeleteTemplate,
  isTemplateSyncEligible,
  pushTemplate,
} from "@/lib/cloud-sync";
import { normalizeShapeInstances } from "@/lib/design-document.mjs";
import {
  createPersistedDesignPayload,
  persistedDesignToLegacyView,
  readPersistedDesignPayload,
} from "@/lib/design-persistence.mjs";
import { localGetSession } from "@/lib/sessions";

const clonePlain = value => JSON.parse(JSON.stringify(value));

/** Owns complete-design template serialization, restore, sync, edit, and removal. */
export function useTemplateManagement({
  designDocument,
  imageSource,
  sessionId,
  dimensionId,
  exportFormat,
  acknowledgements,
  canvasRef,
  drawRef,
  draw,
  thumbnailBackground,
  designTemplates,
  setDesignTemplates,
  cloudConfigured,
  replaceTemplateId,
  markLocalOnly,
  markUnsynced,
  saveOverlays,
  archetypeIds,
  starterTemplates,
  buildMaterialized,
  freshTypeLayouts,
  typeLayoutDefaults,
  imageFromSource,
  guardRef,
  editingTemplate,
  setEditingTemplate,
  setHiddenStarters,
  setConfirmRemoveTemplate,
  setTopMenu,
  topMenu,
  templateNotice,
  setTemplateNotice,
  actions,
}) {
  const currentTemplateState = () => {
    const portableSource = typeof imageSource === "string" && imageSource.length < 900000
      ? imageSource
      : null;
    const portableDocument = portableSource === imageSource
      ? designDocument
      : { ...designDocument, media: { ...designDocument.media, source: portableSource } };
    const revision = (localGetSession(sessionId)?.state?.metadata?.revision || 0) + 1;
    return createPersistedDesignPayload(
      portableDocument,
      { dimensionId, exportFormat, revision },
      clonePlain(acknowledgements),
    );
  };

  const templateThumb = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    (drawRef.current || draw)("template-thumb");
    const thumbnail = document.createElement("canvas");
    thumbnail.width = 160;
    thumbnail.height = 160;
    const context = thumbnail.getContext("2d");
    context.fillStyle = thumbnailBackground;
    context.fillRect(0, 0, 160, 160);
    const scale = Math.min(160 / canvas.width, 160 / canvas.height);
    const width = canvas.width * scale;
    const height = canvas.height * scale;
    context.drawImage(canvas, (160 - width) / 2, (160 - height) / 2, width, height);
    return thumbnail.toDataURL("image/jpeg", 0.68);
  };

  const saveDesignTemplate = () => {
    const name = (window.prompt("Template name", `Design template ${designTemplates.length + 1}`) || "").trim();
    if (!name) return false;
    const thumbnail = templateThumb();
    const state = currentTemplateState();
    const localId = `dt_${Date.now().toString(36)}`;
    const template = { id: localId, name, thumb: thumbnail, state, createdAt: Date.now() };
    setDesignTemplates(previous => [template, ...previous]);
    saveOverlays();
    if (cloudConfigured) {
      if (!isTemplateSyncEligible(template)) {
        markLocalOnly(localId);
        return true;
      }
      pushTemplate({ name, thumb: thumbnail, state }).then(result => {
        if (result.configured && result.template) replaceTemplateId(localId, result.template);
        else if (result.tooLarge) markLocalOnly(localId);
        else markUnsynced(localId, true);
      });
    }
    return true;
  };

  const applyDesignTemplate = template => {
    const saved = template?.state;
    if (!saved) return;
    let restored;
    let migrated;
    let legacy;
    try {
      restored = readPersistedDesignPayload(saved);
      migrated = restored.document;
      legacy = persistedDesignToLegacyView(saved);
    } catch (error) {
      console.error("Cannot open design document", error);
      return;
    }

    const storedContent = migrated.content;
    const storedTypography = migrated.typography;
    actions.setPostType(legacy.postType || "photo_logo");
    actions.setArchetypeId(archetypeIds.includes(legacy.archetypeId) ? legacy.archetypeId : null);
    actions.setArchVariant(Number.isInteger(legacy.archVariant) ? legacy.archVariant : 0);
    actions.setDimensionId(restored.metadata.dimensionId || "ig_portrait");
    actions.dispatchDesignCommand({ type: "document/replace", document: migrated });
    actions.setExportFormat(restored.metadata.exportFormat || "png");
    actions.setLogoVariantTouched(false);

    const nextLayers = normalizeShapeInstances(migrated.shapes);
    const templateArchetypeId = archetypeIds.includes(legacy.archetypeId) ? legacy.archetypeId : null;
    const alreadyMaterialized = !!storedTypography.masterLayouts?.[legacy.postType]?.roles;
    if (templateArchetypeId && !alreadyMaterialized) {
      const materialized = buildMaterialized(templateArchetypeId, {
        postType: legacy.postType,
        attribution: storedContent.attribution,
        subtext: storedContent.subtext,
        variant: Number.isInteger(legacy.archVariant) ? legacy.archVariant : 0,
      });
      if (materialized) {
        if (materialized.bg) actions.setBgColor(materialized.bg);
        actions.setHeroRegister(materialized.register);
        actions.setMicroLabel(materialized.microLabel);
        actions.setPhotoTreatment(materialized.photoTreatment);
        actions.setPhotoFrame(materialized.photoFrame);
        const baseLayouts = Object.keys(storedTypography.masterLayouts || {}).length
          ? storedTypography.masterLayouts
          : freshTypeLayouts();
        actions.setTypeLayouts({
          ...baseLayouts,
          [materialized.postType]: {
            ...(baseLayouts[materialized.postType] || typeLayoutDefaults[materialized.postType] || typeLayoutDefaults.text_post),
            ...materialized.layout,
          },
        });
        actions.setTypeLayoutsByDimension({});
        actions.dispatchDesignCommand({
          type: "shapes/replace",
          shapes: materialized.motifLayers || nextLayers.filter(layer => !layer.motif),
        });
      } else {
        actions.dispatchDesignCommand({ type: "shapes/replace", shapes: nextLayers });
      }
    } else {
      actions.dispatchDesignCommand({ type: "shapes/replace", shapes: nextLayers });
    }

    actions.clearSelection();
    if (migrated.media.source) {
      imageFromSource(migrated.media.source).then(image => actions.setImageObject(image)).catch(() => {});
      actions.setVideoObject(null);
    } else {
      actions.setImageObject(null);
      actions.setVideoObject(null);
    }
    actions.setMarkTab((migrated.logo.assetId || "p3-ivory").startsWith("s") ? "secondary" : "primary");
    actions.setAcknowledgements({ ...restored.acknowledgements });
    actions.setOverlayDirty(false);
  };

  const deleteDesignTemplate = id => {
    setDesignTemplates(previous => previous.filter(template => template.id !== id));
    if (cloudConfigured && /^[0-9a-f-]{36}$/i.test(id)) cloudDeleteTemplate(id);
  };

  const isStarterTemplate = template => !!template && starterTemplates.some(item => item.id === template.id);

  const removeTemplate = template => {
    if (!template) return;
    if (isStarterTemplate(template)) {
      setHiddenStarters(previous => previous.includes(template.id) ? previous : [...previous, template.id]);
    } else {
      deleteDesignTemplate(template.id);
    }
    if (editingTemplate?.id === template.id) setEditingTemplate(null);
    setConfirmRemoveTemplate(null);
  };

  const startEditTemplate = template => {
    if (!template || !guardRef.current?.(template)) return;
    setEditingTemplate({ id: template.id, name: template.name, starter: isStarterTemplate(template) });
    setTopMenu(null);
  };

  const saveEditedTemplate = () => {
    const editing = editingTemplate;
    if (!editing || editing.starter) return;
    if (!window.confirm(`Update the template “${editing.name}” with the current design?`)) return;
    let thumbnail = null;
    try { thumbnail = templateThumb(); } catch {}
    const state = currentTemplateState();
    setDesignTemplates(previous => previous.map(template =>
      template.id === editing.id ? { ...template, ...(thumbnail ? { thumb: thumbnail } : {}), state } : template));
    const template = { id: editing.id, name: editing.name, thumb: thumbnail, state };
    if (cloudConfigured && /^[0-9a-f-]{36}$/i.test(editing.id)) {
      if (!isTemplateSyncEligible(template)) markLocalOnly(editing.id);
      else pushTemplate(template).then(result => {
        if (result.configured && result.template) {
          setDesignTemplates(previous => previous.map(item => item.id === editing.id ? {
            ...item,
            name: result.template.name,
            thumb: result.template.thumb,
            state: result.template.state,
            synced: true,
            unsynced: false,
          } : item));
        } else if (result.tooLarge) markLocalOnly(editing.id);
        else markUnsynced(editing.id, true);
      });
    }
    setTemplateNotice(`Template “${editing.name}” updated.`);
    setEditingTemplate(null);
  };

  const saveEditedAsNew = () => {
    if (saveDesignTemplate()) {
      setTemplateNotice("Saved as a new template.");
      setEditingTemplate(null);
    }
  };

  useEffect(() => {
    if (!templateNotice) return;
    const timer = setTimeout(() => setTemplateNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [setTemplateNotice, templateNotice]);

  useEffect(() => {
    if (topMenu !== "templates") setConfirmRemoveTemplate(null);
  }, [setConfirmRemoveTemplate, topMenu]);

  return {
    currentTemplateState,
    templateThumb,
    saveDesignTemplate,
    applyDesignTemplate,
    isStarterTemplate,
    removeTemplate,
    startEditTemplate,
    saveEditedTemplate,
    saveEditedAsNew,
  };
}
