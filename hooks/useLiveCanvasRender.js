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
  // (Client ruling 2026-07-26 — EDITING GRACE) The role whose field/on-canvas editor is
  // ACTIVE right now ("hero" | "support" | "eyebrow" | "date" | "pill" | null). While a
  // role is being typed into, its verdict is not final: half a word is not a layout
  // failure. Its drop is never published, so the "Not shown in this layout" banner cannot
  // flip between keystrokes. Passed as a VALUE (not a ref) so focus/blur re-runs the draw
  // effect and the settled truth publishes the moment the field is left.
  editingRole = null,
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
    // (Item 2 — the "Not shown in this layout" banner must track ASYNC repaints) An async
    // decoded-asset repaint runs through drawRef.current() (this same draw), updating
    // deadRolesRef but never the post-draw effect below — so setDeadRoles lagged a React
    // commit behind and the banner "resurrected" a role a later commit had already cleared.
    // Publish the drop set here too, diff-guarded (join guard, so an unchanged set never
    // re-renders — drags stay cheap). GATED ON fontsLoaded: a pre-settle first paint can
    // transiently drop a role it will place once fonts/assets land, so the banner must
    // never claim a first-paint drop that a settled render disproves — the settled repaint
    // (fonts ready) publishes the truth.
    // (EDITING GRACE) The role under the cursor is withheld from the published set: the
    // renderer keeps painting it (required roles always, optional roles at their floor
    // while focused), and the banner never claims a loss the next keystroke disproves.
    // On blur editingRole becomes null, this effect re-runs, and the honest verdict lands.
    if (fontsLoaded) {
      const droppedRoles = (result.droppedRoles || []).filter(role => role !== editingRole);
      setDeadRoles(previous => previous.join(",") === droppedRoles.join(",") ? previous : droppedRoles);
    }
    return result;
  }, [
    auditRef,
    canvasRef,
    deadRolesRef,
    dimensionId,
    drawSequenceRef,
    editingRole,
    fontMetaRef,
    fontsLoaded,
    height,
    logoBoxRef,
    photoWindowRef,
    renderResultRef,
    renderScene,
    roleBoundsRef,
    setDeadRoles,
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
    // deadRoles is published inside draw() (above) — diff-guarded and gated on fontsLoaded —
    // so async decoded-asset repaints keep the banner in sync, not just this effect's draw.
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
