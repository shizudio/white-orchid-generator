import { useEffect, useRef, useState } from "react";
import { resolveMobileInspectorViewport } from "@/lib/mobile-inspector-geometry.mjs";

// ── (Half-sheet ruling 2026-07-15, ux-architecture §2.11) Mobile sheet
// orchestration: everything the LIVE canvas band above the half-sheet needs.
//   1. AUTO-SCROLL-TO-SELECTION (#1): when the sheet opens or the selection /
//      detent changes, scroll the page so the selected element's canvas region
//      sits in the visible band between the sticky top bar and the sheet. The
//      element box comes from the renderer's scene bounds (canvas px). A recent
//      EXPLICIT user scroll (wheel/touch) suppresses the auto-scroll (M3 — never
//      override an explicit user choice; the system only moves its own frame).
//   2. FLOATING UNDO ANCHOR (#5): measures the sheet's live height (ResizeObserver
//      — detents and content changes both fire it) so the undo pair can sit just
//      above the sheet, and flips it away from the selected element's side.
//   3. OUTSIDE-TAP DISMISS (#19): with the dimming backdrop gone, a tap outside
//      the sheet, the canvas stage, and the floating undo closes the inspector.
//      Canvas taps are NOT outside — they re-select (tap-through) or select the
//      background per the canvas's own semantics.
// Desktop (>760px): completely inert — returns active:false, no listeners run
// their mobile branches, so the in-flow inspector column is untouched.

const MOBILE_MQ = "(max-width: 760px)";
const USER_SCROLL_SUPPRESS_MS = 900;
const BAND_MARGIN = 8;

const isMobile = () => typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;

export function useMobileInspectorSheet({
  open,               // inspector open?
  canvasRef,          // live canvas element ref
  selectedBounds,     // {x,y,w,h} in canvas px, or null (background/none)
  canvasWidth,        // canvas buffer W
  canvasHeight,       // canvas buffer H
  onOutsideTap,       // close the inspector
}) {
  const [sheetHeight, setSheetHeight] = useState(0);
  const [undoSide, setUndoSide] = useState("left");
  const userScrollTsRef = useRef(0);
  const boundsKey = selectedBounds
    ? `${Math.round(selectedBounds.x)},${Math.round(selectedBounds.y)},${Math.round(selectedBounds.w)},${Math.round(selectedBounds.h)}`
    : "none";

  // Track explicit user scrolls only (wheel / touchmove — programmatic
  // window.scrollBy fires neither), for the M3 suppression window.
  useEffect(() => {
    if (!open || !isMobile()) return;
    const mark = () => { userScrollTsRef.current = Date.now(); };
    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("touchmove", mark, { passive: true });
    return () => {
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchmove", mark);
    };
  }, [open]);

  // Measure the sheet (content-height + detent changes both resize it).
  useEffect(() => {
    if (!open || !isMobile()) { setSheetHeight(0); return; }
    const dock = document.querySelector(".wo-inspector-dock");
    if (!dock) { setSheetHeight(0); return; }
    const measure = () => setSheetHeight(dock.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [open]);

  // Auto-scroll the selected element into the band above the sheet, and pick
  // the undo side away from the element. Re-runs on open, selection change and
  // sheet resize (detent). offsetHeight is layout height — immune to the
  // sheet's translateY entry animation, so the band math is stable immediately.
  useEffect(() => {
    if (!open || !isMobile() || !sheetHeight) return;
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.height) return;
      // Band: below the sticky nav+topbar, above the sheet.
      const topbar = document.querySelector(".wo-topbar");
      const bandTop = (topbar ? Math.max(topbar.getBoundingClientRect().bottom, 0) : 104) + BAND_MARGIN;
      const bandBottom = window.innerHeight - sheetHeight - BAND_MARGIN;
      if (bandBottom - bandTop < 90) return; // no usable band (tall detent on a short phone)

      const viewport=resolveMobileInspectorViewport({
        canvasRect:rect,selectedBounds,canvasWidth,canvasHeight,
        viewportWidth:window.innerWidth,bandTop,bandBottom,
      });
      if(!viewport)return;
      setUndoSide(viewport.undoSide);

      // M3: an explicit user scroll within the window wins — do not fight it.
      if (Date.now() - userScrollTsRef.current < USER_SCROLL_SUPPRESS_MS) return;

      const dy=viewport.scrollDelta;
      if (Math.abs(dy) > 1) {
        // Smooth when motion is welcome; instant under prefers-reduced-motion.
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const target = Math.max(0, window.scrollY + dy);
        window.scrollBy({ top: dy, behavior: reduced ? "auto" : "smooth" });
        if (!reduced) {
          // SETTLE CHECK (M2 — no silent no-op): smooth window scrolls are
          // silently dropped by some renderers and cancelled by competing
          // scrolls. If we haven't landed near the target, snap instantly —
          // unless the USER scrolled meanwhile (M3: their scroll wins).
          const settleGuard = Date.now();
          setTimeout(() => {
            if (userScrollTsRef.current > settleGuard) return;
            if (Math.abs(window.scrollY - target) > 24) window.scrollTo({ top: target });
          }, 550);
        }
      }
    }, 80); // one frame after the sheet mounts/re-renders its content
    return () => clearTimeout(timer);
  }, [open, sheetHeight, boundsKey, canvasWidth, canvasHeight, canvasRef, selectedBounds]);

  // Outside-tap dismiss (the backdrop's old job, minus the canvas intercept).
  useEffect(() => {
    if (!open || !isMobile()) return;
    const onPointerDown = event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".wo-inspector-dock")) return;      // the sheet itself
      if (target.closest(".generator-preview-frame")) return; // live canvas band
      if (target.closest(".wo-float-undo")) return;           // floating undo
      onOutsideTap && onOutsideTap();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onOutsideTap]);

  return {
    active: open && sheetHeight > 0 && isMobile(),
    sheetHeight,
    undoSide,
  };
}
