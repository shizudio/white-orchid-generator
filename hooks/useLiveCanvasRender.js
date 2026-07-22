import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Owns the on-screen canvas draw, render-result publication, and post-draw UI sync. */
export function useLiveCanvasRender({
  canvasRef,
  renderScene,
  width,
  height,
  dimensionId,
  fontsLoaded,
  drawRef,
  renderResultRef,
  drawSequenceRef,
  textBoundsRef,
  roleBoundsRef,
  logoBoxRef,
  photoWindowRef,
  deadRolesRef,
  auditRef,
  fontMetaRef,
  setDropHint,
  setLogoOverlapHint,
  setDeadRoles,
  setContentLedger,
  devHooks,
}) {
  const dropInfoRef = useRef(null);
  const logoOverlapRef = useRef(false);

  const draw = useCallback((source) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const result = renderScene(canvas.getContext("2d"), width, height, {
      dimensionId,
      live: true,
      source: source || "live-draw",
    });
    if (!result) return null;

    renderResultRef.current = result;
    drawSequenceRef.current += 1;
    textBoundsRef.current = result.measurements.textBounds;
    roleBoundsRef.current = result.measurements.roleBounds;
    logoBoxRef.current = result.measurements.logoBox;
    photoWindowRef.current = result.measurements.photoBox;
    deadRolesRef.current = result.droppedRoles;
    auditRef.current = result.auditSignal;
    dropInfoRef.current = result.auditSignal?.dropped?.length
      ? { dropped: result.auditSignal.dropped }
      : null;
    fontMetaRef.current = result.textMetrics;
    logoOverlapRef.current = !!result.auditSignal?.logo?.overlapsText;
    return result;
  }, [
    auditRef,
    canvasRef,
    deadRolesRef,
    dimensionId,
    drawSequenceRef,
    fontMetaRef,
    height,
    logoBoxRef,
    photoWindowRef,
    renderResultRef,
    renderScene,
    roleBoundsRef,
    textBoundsRef,
    width,
  ]);

  // Async decoded-asset callbacks must always repaint the current format.
  drawRef.current = draw;

  useEffect(() => {
    if (!fontsLoaded) return;
    const result = draw();
    const nextDropHint = dropInfoRef.current
      ? dropInfoRef.current.dropped.join(", ")
      : null;
    setDropHint(previous => previous === nextDropHint ? previous : nextDropHint);
    const overlaps = logoOverlapRef.current;
    setLogoOverlapHint(previous => previous === overlaps ? previous : overlaps);
    const droppedRoles = deadRolesRef.current || [];
    setDeadRoles(previous => previous.join(",") === droppedRoles.join(",") ? previous : droppedRoles);
    // (Slice 3) Publish the added-element placement ledger as REACTIVE state so the
    // element inspector + rail can honestly show "placed here / no room in this format"
    // (M2 — never a silent no-op). renderResultRef alone is a ref and would leave the
    // panel stale on the render right after an add; the setter forces the re-render.
    if (setContentLedger) {
      const ledger = result?.contentElements || [];
      setContentLedger(previous => JSON.stringify(previous) === JSON.stringify(ledger) ? previous : ledger);
    }
    if (devHooks && typeof window !== "undefined") window.__woFontMeta = fontMetaRef.current;
  }, [deadRolesRef, devHooks, draw, fontMetaRef, fontsLoaded, setContentLedger, setDeadRoles, setDropHint, setLogoOverlapHint]);

  // Canvas backing dimensions change synchronously on format switch. Repaint before
  // browser paint so the previous format never flashes in the resized buffer.
  useLayoutEffect(() => {
    if (fontsLoaded && canvasRef.current) draw("layout-effect");
    // Width and height change only on format switch; draw itself intentionally stays
    // out of this dependency list so ordinary edits do not trigger a second sync draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  return draw;
}
