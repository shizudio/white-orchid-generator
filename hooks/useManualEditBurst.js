import { useCallback, useEffect, useRef, useState } from "react";

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
    if(!state.pending){
      state.pending=true;
      state.snap=preEditSnapshot||actions.captureSnapshot();
      state.touched=new Set();
      actions.setUndoStack(previous=>[state.snap,...previous].slice(0,actions.depth));
      actions.setRedoStack([]);
    }
    for(const tag of (Array.isArray(tags)?tags:[tags])) if(tag)state.touched.add(tag);
    if(state.timer)clearTimeout(state.timer);
    state.timer=setTimeout(()=>{
      state.timer=null;
      setTick(value=>value+1);
    },actions.debounceMs);
  },[]);
  return {manualHarmonizationRef:stateRef,manualHarmonizationTick:tick,noteManualEdit:noteEdit};
}
