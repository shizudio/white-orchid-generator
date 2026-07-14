import { useEffect, useRef } from "react";

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
      if (shell && !shell.contains(event.target)) {
        actionsRef.current.clearSelection?.();
        canvasRef.current?.blur();
      }
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
