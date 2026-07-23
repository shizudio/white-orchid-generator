import { useCallback, useEffect, useRef, useState } from "react";
import { planManualEditBurstStep } from "@/lib/design-history.mjs";

/** Group rapid owner edits and their delayed accessibility repair into one history step. */
export function useManualEditBurst({
  captureSnapshot,setUndoStack,setRedoStack,depth=8,debounceMs=600,
}) {
  const actionsRef=useRef({captureSnapshot,setUndoStack,setRedoStack,depth,debounceMs});
  actionsRef.current={captureSnapshot,setUndoStack,setRedoStack,depth,debounceMs};
  const stateRef=useRef({pending:false,timer:null,snap:null,touched:null});
  const [tick,setTick]=useState(0);
  useEffect(()=>()=>{if(stateRef.current.timer)clearTimeout(stateRef.current.timer);},[]);

  const noteEdit=useCallback((tags,preEditSnapshot=null)=>{
    const state=stateRef.current;
    const actions=actionsRef.current;
    // One action = one undo. A new burst opens for the first edit AND for a distinct
    // action landing inside the debounce window (disjoint interaction kind); a
    // continuation of the same gesture (typing, dragging) folds into the open entry.
    const plan=planManualEditBurstStep({
      pending:state.pending,
      touchedTags:state.touched?[...state.touched]:[],
      tags,
    });
    if(plan.startNewEntry){
      state.pending=true;
      // preEditSnapshot is captured by the caller BEFORE the mutating patch runs, so it
      // is the correct pre-edit state whether this opens the burst or splits a distinct
      // action mid-window; captureSnapshot() is only a fallback for callers that omit it.
      state.snap=preEditSnapshot||actions.captureSnapshot();
      actions.setUndoStack(previous=>[state.snap,...previous].slice(0,actions.depth));
      actions.setRedoStack([]);
    }
    state.touched=new Set(plan.nextTouched);
    if(state.timer)clearTimeout(state.timer);
    state.timer=setTimeout(()=>{
      state.timer=null;
      setTick(value=>value+1);
    },actions.debounceMs);
  },[]);
  return {manualHarmonizationRef:stateRef,manualHarmonizationTick:tick,noteManualEdit:noteEdit};
}
