import { useCallback, useRef } from "react";
import { executeDesignWorkflowGroups } from "@/lib/design-workflow-executor.mjs";
import { DESIGN_WORKFLOW_EFFECT_TYPES as EFFECT } from "@/lib/design-workflow-effects.mjs";

/** Execute canonical design commands and their explicitly declared editor effects. */
export function useDesignWorkflowExecutor(actions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const mediaDecodeRequestRef = useRef(0);

  const applyEffects = useCallback(effects => {
    for (const effect of effects || []) {
      const current = actionsRef.current;
      switch (effect.type) {
        case EFFECT.SELECT_LOGO_TAB: current.setLogoTab(effect.value); break;
        case EFFECT.SELECT_DIMENSION: current.setDimension(effect.value); break;
        case EFFECT.SELECT_EXPORT_FORMAT: current.setExportFormat(effect.value); break;
        case EFFECT.CLEAR_SHAPE_SELECTION: current.setShapeSelection(null); break;
        case EFFECT.CLEAR_SHAPE_SELECTION_IF:
          current.dispatchSelection({ type:"clear-if", elementType:"shape", id:effect.uid });
          break;
        case EFFECT.CLEAR_PHOTO_SELECTION: current.setPhotoSelection(false); break;
        case EFFECT.CLEAR_EDITOR_SELECTION: current.dispatchSelection({ type:"clear" }); break;
        case EFFECT.SET_ACKNOWLEDGEMENTS: current.setAcknowledgements({ ...effect.value }); break;
        case EFFECT.SET_OVERLAY_CLEAN: current.setShapeDirty(false); break;
        case EFFECT.SET_OVERLAY_DIRTY: current.setShapeDirty(true); break;
        case EFFECT.SELECT_SHAPE:
          current.setShapeSelection(effect.uid);
          current.setShapeChromeVisible(true);
          current.setInspectorElement("shape");
          current.setShapeDirty(true);
          break;
        case EFFECT.REMOVE_VIDEO: current.removeVideo(); break;
        case EFFECT.CLEAR_DECODED_IMAGE:
          mediaDecodeRequestRef.current += 1;
          current.setDecodedImage(null);
          break;
        case EFFECT.DECODE_IMAGE: {
          const requestId = ++mediaDecodeRequestRef.current;
          Promise.resolve()
            .then(()=>current.decodeImage(effect.source))
            .then(decoded => {
              if (requestId !== mediaDecodeRequestRef.current) return;
              actionsRef.current.setDecodedImage(decoded || null);
            })
            .catch(() => {
              if (requestId === mediaDecodeRequestRef.current) actionsRef.current.setDecodedImage(null);
            });
          break;
        }
      }
    }
  }, []);

  const reportInvalidEffect = useCallback((effect, detail) => {
    if (process.env.NODE_ENV !== "production") {
      console.error("Invalid design workflow effect", effect, detail);
    }
  }, []);

  return useCallback(groups => executeDesignWorkflowGroups(groups, {
    dispatchCommand:command => actionsRef.current.dispatchCommand(command),
    applyEffects,
    onInvalidEffect:reportInvalidEffect,
  }), [applyEffects, reportInvalidEffect]);
}
