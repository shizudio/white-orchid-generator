import { useEffect, useRef } from "react";

/** Coordinates mutually exclusive editor overlays and their Escape-key priority. */
export function useOverlayDiscipline({
  topMenu,
  auditOpen,
  feedOpen,
  exportOpen,
  libraryPickerOpen,
  inspectorOpen,
  actions,
}) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!topMenu) return;
    const current = actionsRef.current;
    current.closeInspector?.();
    current.closeAudit?.();
    current.closeLibraryPicker?.();
    current.closeFeed?.();
    current.closeAdvisor?.();
  }, [topMenu]);

  useEffect(() => {
    if (!auditOpen) return;
    const current = actionsRef.current;
    current.closeInspector?.();
    current.closeTopMenu?.();
    current.closeAdvisor?.();
    current.closeFeed?.();
  }, [auditOpen]);

  useEffect(() => {
    if (!feedOpen) return;
    const current = actionsRef.current;
    current.closeInspector?.();
    current.closeTopMenu?.();
    current.closeAudit?.();
    current.closeLibraryPicker?.();
    current.closeAdvisor?.();
  }, [feedOpen]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        target.blur();
        return;
      }
      const current = actionsRef.current;
      if (feedOpen) current.closeFeed?.();
      else if (exportOpen) current.closeExport?.();
      else if (topMenu) current.closeTopMenu?.();
      else if (auditOpen) current.closeAudit?.();
      else if (libraryPickerOpen) current.closeLibraryPicker?.();
      else if (inspectorOpen) current.closeInspector?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [auditOpen, exportOpen, feedOpen, inspectorOpen, libraryPickerOpen, topMenu]);
}
