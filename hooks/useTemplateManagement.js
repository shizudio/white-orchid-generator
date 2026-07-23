import { useEffect } from "react";
import {
  deleteTemplate as cloudDeleteTemplate,
  isTemplateSyncEligible,
  pushTemplate,
} from "@/lib/cloud-sync";
import { planTemplateApplicationWorkflow } from "@/lib/design-composite-workflows.mjs";
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
  convertLegacyLayoutShape,
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
  typeLayoutDefaults,
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
      // (§2.9.2 slice 3) Convert a legacy layout shape (media.frame shapeMask/
      // petalMask) into the genuine frame-mode layer EXACTLY ONCE at load, with
      // the archetype-exact per-format geometry (the converter lives beside the
      // archetype data model in Generator.jsx). Idempotent — an already-migrated
      // or frameless document passes through unchanged, so old sessions render
      // identically and re-saves stay stable.
      if (typeof convertLegacyLayoutShape === "function") {
        migrated = convertLegacyLayoutShape(migrated, {
          archetypeId: archetypeIds.includes(legacy.archetypeId) ? legacy.archetypeId : null,
          variant: Number.isInteger(legacy.archVariant) ? legacy.archVariant : 0,
          postType: legacy.postType || "photo_logo",
        });
      }
    } catch (error) {
      console.error("Cannot open design document", error);
      return;
    }

    const templateArchetypeId = archetypeIds.includes(legacy.archetypeId) ? legacy.archetypeId : null;
    const variant = Number.isInteger(legacy.archVariant) ? legacy.archVariant : 0;
    const alreadyMaterialized = !!migrated.typography.masterLayouts?.[legacy.postType]?.roles;
    const materialized = templateArchetypeId && !alreadyMaterialized
      ? buildMaterialized(templateArchetypeId, {
        postType: legacy.postType,
        attribution: migrated.content.attribution,
        subtext: migrated.content.subtext,
        variant,
      })
      : null;
    actions.executeWorkflowGroups(planTemplateApplicationWorkflow({
      document:migrated,
      // (DLC §3.4/§10, pins law 5) A template swap adapts to work in progress: the
      // owner's typed copy, added text elements, and pins are merged onto the template
      // rather than discarded. The template supplies every unpinned/AI-authored field.
      currentDocument:designDocument,
      metadata:restored.metadata,
      acknowledgements:restored.acknowledgements,
      archetypeId:templateArchetypeId,
      variant,
      materialized,
      alreadyMaterialized,
      typeLayoutDefault:typeLayoutDefaults[legacy.postType] || typeLayoutDefaults.text_post,
    }));
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
