import { useCallback } from "react";
import { getCurrentSessionId, logFeedback as logFeedbackClient, newTurnId } from "@/lib/sessions";
import { canvasPixelSignature } from "@/lib/canvas-pixel-signature.mjs";

/** Apply inspector patches and honestly report controls that do not change pixels. */
export function useInspectorRenderTruth({canvasRef,applyPatch,setInspectorNotes,archetypeId,dimensionId}) {
  return useCallback((patch,{controlId,region=null,deadNote}={})=>{
    const before=canvasPixelSignature(canvasRef.current,region);
    const applied=applyPatch(patch,{source:"ui"});
    const clearNote=()=>setInspectorNotes(previous=>{
      if(!controlId||!(controlId in previous)) return previous;
      const next={...previous};delete next[controlId];return next;
    });
    if(!deadNote){clearNote();return applied;}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const after=canvasPixelSignature(canvasRef.current,region);
      if(before==null||after==null||before!==after){clearNote();return;}
      setInspectorNotes(previous=>({...previous,[controlId]:deadNote}));
      try{
        logFeedbackClient({
          turn_id:newTurnId(),session_id:getCurrentSessionId()||undefined,
          kind:"inspector-render-truth",control:controlId,patch_keys:Object.keys(patch),
          archetypeId,dimensionId,verdict:{honest:false,note:deadNote},
        });
      }catch{}
    }));
    return applied;
  },[applyPatch,archetypeId,canvasRef,dimensionId,setInspectorNotes]);
}
