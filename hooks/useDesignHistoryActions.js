import { useCallback } from "react";
import { planSnapshotRestoreWorkflow } from "@/lib/design-composite-workflows.mjs";
import { planDesignHistoryStep } from "@/lib/design-history.mjs";

/** Canonical undo/redo traversal and document restoration. */
export function useDesignHistoryActions({
  undoStack,redoStack,setUndoStack,setRedoStack,captureSnapshot,
  executeWorkflowGroups,depth,
}) {
  const restoreSnapshot=useCallback(snapshot=>{
    executeWorkflowGroups(planSnapshotRestoreWorkflow({snapshot}));
  },[executeWorkflowGroups]);

  const undo=useCallback(()=>{
    if(!undoStack.length)return;
    const step=planDesignHistoryStep({stack:undoStack,currentSnapshot:captureSnapshot(),depth});
    if(!step)return;
    setRedoStack(previous=>[step.oppositeEntry,...previous].slice(0,step.depth));
    restoreSnapshot(step.snapshotToRestore);
    setUndoStack(step.remainingStack);
  },[captureSnapshot,depth,restoreSnapshot,setRedoStack,setUndoStack,undoStack]);

  const redo=useCallback(()=>{
    if(!redoStack.length)return;
    const step=planDesignHistoryStep({stack:redoStack,currentSnapshot:captureSnapshot(),depth});
    if(!step)return;
    setUndoStack(previous=>[step.oppositeEntry,...previous].slice(0,step.depth));
    restoreSnapshot(step.snapshotToRestore);
    setRedoStack(step.remainingStack);
  },[captureSnapshot,depth,redoStack,restoreSnapshot,setRedoStack,setUndoStack]);

  return {restoreSnapshot,undo,redo};
}
