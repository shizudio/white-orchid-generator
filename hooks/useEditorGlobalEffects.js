import { useEffect, useRef } from "react";
import { pointerClearsSelection } from "@/lib/editor-input-controller.mjs";

/** Owns document/window listeners that dismiss editor chrome and navigate history. */
export function useEditorGlobalEffects({
  canvasShellRef,
  canvasRef,
  clearSelection,
  advisorOpen,
  closeAdvisor,
  undo,
  redo,
}) {
  const actionsRef = useRef({ clearSelection, closeAdvisor, undo, redo });
  actionsRef.current = { clearSelection, closeAdvisor, undo, redo };

  useEffect(() => {
    const onPointerDown = event => {
      const shell = canvasShellRef.current;
      if (!shell) return;
      const target = event.target;
      // The inspector is a flex sibling of the shell but edits the live selection;
      // a pointerdown inside it must not deselect (which would unmount the panel
      // mid-edit). Only true empty chrome / the canvas backdrop clears selection.
      const withinCanvasShell = shell.contains(target);
      const withinInspector = !!(target && target.closest && target.closest(".wo-inspector"));
      // (Half-sheet ruling 2026-07-15) The mobile floating undo/redo floats in the
      // canvas band OUTSIDE both trees; deselecting on its pointerdown unmounts the
      // button before pointerup and swallows the tap (see editor-input-controller).
      const withinEditorChrome = !!(target && target.closest && target.closest(".wo-float-undo"));
      if (!pointerClearsSelection({ withinCanvasShell, withinInspector, withinEditorChrome })) return;
      actionsRef.current.clearSelection?.();
      canvasRef.current?.blur();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [canvasRef, canvasShellRef]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === "Escape" && advisorOpen) {
        event.stopPropagation();
        actionsRef.current.closeAdvisor?.();
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = String(event.key || "").toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target;
      if (target && (
        target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.isContentEditable
      )) return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) actionsRef.current.redo?.();
      else actionsRef.current.undo?.();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [advisorOpen]);
}
