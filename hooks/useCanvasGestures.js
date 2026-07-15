import { useRef, useState } from "react";
import { resolveScenePointerTarget } from "@/lib/editor-input-controller.mjs";

const HANDLE_HIT = 24;
const SNAP_PX = 12;

/** Owns direct canvas manipulation for text, furniture, logo, shapes, and photos. */
export function useCanvasGestures({
  canvasRef,
  dragRef,
  renderResultRef,
  photoWindowRef,
  width,
  height,
  dimensionId,
  platformSafe,
  devHooks,
  mediaObject,
  photoTransform,
  photoSelected,
  selectedShapeId,
  shapeLayers,
  shapeAssets,
  textLayout,
  effectiveShapeTransform,
  getStoredRoleOffset,
  updateRoleOffset,
  updateTextLayout,
  updateShapeTransform,
  patchPhoto,
  pinPhotoTouched,
  applyPatch,
  selectElement,
  focusTextField,
  setOverlayChromeVisible,
  setInspectorElement,
  setTextSelected,
  setPhotoSelected,
}) {
  const [snapGuide, setSnapGuide] = useState(null);
  const snapGuideRef = useRef(null);
  snapGuideRef.current = snapGuide;
  const [dragLift, setDragLift] = useState(null);
  const dragLiftRef = useRef(null);
  dragLiftRef.current = dragLift;
  // (Mobile audit #8) Two-finger pinch-to-zoom for the photo on touch. We track
  // every active pointer; a second concurrent pointer over a photo starts a pinch
  // that drives the SAME `patchPhoto({zoom})` path the inspector slider + resize
  // handle use — so the cover-clamp in Generator.applyPatch (mask/card frames floor
  // zoom at 1) applies identically and a pinch-OUT can never expose backing.
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);

  const canPan = !!mediaObject;
  const clearSnapGuide = () => {
    if (snapGuideRef.current) setSnapGuide(null);
  };
  const clearDragLift = () => {
    if (dragLiftRef.current) setDragLift(null);
  };

  const snapAnchors = (elementWidth, elementHeight) => {
    const safe = platformSafe[dimensionId] || {};
    const padX = Math.max(0.05, (safe.left || 0) + 0.015, (safe.right || 0) + 0.015);
    const padTop = Math.max(0.05, (safe.top || 0) + 0.015);
    const padBottom = Math.max(0.05, (safe.bottom || 0) + 0.015);
    const xs = { left: padX + elementWidth / 2, center: 0.5, right: 1 - padX - elementWidth / 2 };
    const ys = { top: padTop + elementHeight / 2, center: 0.5, bottom: 1 - padBottom - elementHeight / 2 };
    const anchors = [];
    for (const [vertical, cy] of Object.entries(ys)) {
      for (const [horizontal, cx] of Object.entries(xs)) {
        anchors.push({ id: `${vertical}-${horizontal}`, cx, cy });
      }
    }
    return anchors;
  };

  const snapCentre = (cx, cy, elementWidth, elementHeight, rectWidth, rectHeight, original) => {
    const radiusX = SNAP_PX / (rectWidth || 1);
    const radiusY = SNAP_PX / (rectHeight || 1);
    const xCandidates = [];
    const yCandidates = [];
    for (const anchor of snapAnchors(elementWidth, elementHeight)) {
      xCandidates.push({ value: anchor.cx, kind: "anchor" });
      yCandidates.push({ value: anchor.cy, kind: "anchor" });
    }
    if (original) {
      xCandidates.push({ value: original.cx, kind: "original" });
      yCandidates.push({ value: original.cy, kind: "original" });
    }

    const scene = renderResultRef.current?.sceneElements || [];
    const otherBoxes = [];
    for (const element of scene.filter(item => ["text", "furniture"].includes(item.type))) {
      const key = element.type === "furniture" ? `furn_${element.role}` : element.role;
      if (!original || key !== original.key) otherBoxes.push(element.bounds);
    }
    const liveLogo = scene.find(item => item.type === "logo");
    if (liveLogo && (!original || original.key !== "logo")) otherBoxes.push(liveLogo.bounds);
    for (const box of otherBoxes) {
      const x = box.x / width;
      const y = box.y / height;
      const w = box.w / width;
      const h = box.h / height;
      xCandidates.push({ value: x + w / 2 }, { value: x }, { value: x + w });
      yCandidates.push({ value: y + h / 2 }, { value: y }, { value: y + h });
    }

    let bestX = null;
    let bestY = null;
    for (const candidate of xCandidates) {
      const distance = Math.abs(cx - candidate.value);
      if (distance <= radiusX && (!bestX || distance < bestX.distance)) bestX = { ...candidate, distance };
    }
    for (const candidate of yCandidates) {
      const distance = Math.abs(cy - candidate.value);
      if (distance <= radiusY && (!bestY || distance < bestY.distance)) bestY = { ...candidate, distance };
    }

    const nextX = bestX ? bestX.value : cx;
    const nextY = bestY ? bestY.value : cy;
    const lines = [];
    if (bestX) lines.push({ x1: nextX, y1: 0, x2: nextX, y2: 1 });
    if (bestY) lines.push({ x1: 0, y1: nextY, x2: 1, y2: nextY });
    const snapped = !!(bestX || bestY);
    return {
      cx: nextX,
      cy: nextY,
      snapped,
      guide: snapped ? {
        lines,
        dot: bestX && bestY ? { x: nextX, y: nextY } : null,
        landing: {
          x: nextX - elementWidth / 2,
          y: nextY - elementHeight / 2,
          w: elementWidth,
          h: elementHeight,
        },
      } : null,
    };
  };

  const drawnPhotoWindow = () => {
    const windowBox = photoWindowRef.current;
    if (windowBox && windowBox.w > 1 && windowBox.h > 1) return windowBox;
    return { x: 0, y: 0, w: width, h: height, kind: "full", sideBand: false };
  };

  const photoHandles = rect => {
    if (!mediaObject) return null;
    const windowBox = drawnPhotoWindow();
    const scale = rect.width / width;
    const toDisplay = (x, y) => ({ x: rect.left + x * scale, y: rect.top + y * scale });
    const angle = (photoTransform.rotation || 0) * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const centerX = windowBox.x + windowBox.w / 2;
    const centerY = windowBox.y + windowBox.h / 2;
    const rotatePoint = (x, y) => toDisplay(centerX + x * cosine - y * sine, centerY + x * sine + y * cosine);
    const halfWidth = windowBox.w / 2;
    const halfHeight = windowBox.h / 2;
    const keepVisible = point => ({
      x: Math.max(rect.left + 14, Math.min(rect.right - 14, point.x)),
      y: Math.max(rect.top + 14, Math.min(rect.bottom - 14, point.y)),
    });
    const corners = [
      rotatePoint(-halfWidth, -halfHeight),
      rotatePoint(halfWidth, -halfHeight),
      rotatePoint(halfWidth, halfHeight),
      rotatePoint(-halfWidth, halfHeight),
    ].map(keepVisible);
    return {
      windowBox,
      scale,
      cosine,
      sine,
      halfWidth,
      halfHeight,
      corners,
      rotateHandle: keepVisible(rotatePoint(0, -halfHeight - 30 / scale)),
      center: toDisplay(centerX, centerY),
    };
  };

  const pointInPhoto = (handles, x, y) => {
    const localX = (x - handles.center.x) / handles.scale;
    const localY = (y - handles.center.y) / handles.scale;
    const rotatedX = localX * handles.cosine + localY * handles.sine;
    const rotatedY = -localX * handles.sine + localY * handles.cosine;
    return Math.abs(rotatedX) <= handles.halfWidth && Math.abs(rotatedY) <= handles.halfHeight;
  };

  const pinchDistance = () => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };
  const currentPhotoZoom = () =>
    (photoWindowRef.current && photoWindowRef.current.eff && typeof photoWindowRef.current.eff.zoom === "number"
      ? photoWindowRef.current.eff.zoom
      : (photoTransform && typeof photoTransform.zoom === "number" ? photoTransform.zoom : 1)) || 1;

  const onPointerDown = event => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // A second finger over a photo promotes the gesture to a pinch: abandon any
    // single-pointer drag the first finger started and seed the zoom baseline.
    if (pointersRef.current.size >= 2 && canPan) {
      const startDist = pinchDistance();
      if (startDist > 0) {
        dragRef.current = null;
        clearSnapGuide();
        clearDragLift();
        pinchRef.current = { startDist, startZoom: currentPhotoZoom() };
        try { canvas.setPointerCapture(event.pointerId); } catch {}
        return;
      }
    }
    if (devHooks && typeof performance !== "undefined") performance.mark("wo-editor-gesture-start");
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * width / rect.width;
    const y = (event.clientY - rect.top) * height / rect.height;
    const scene = renderResultRef.current?.sceneElements || [];
    const selectedLayer = selectedShapeId ? shapeLayers.find(layer => layer.uid === selectedShapeId) : null;
    const pointerTarget = resolveScenePointerTarget(scene, x, y, {
      selectedShapeId: selectedLayer ? `shape:${selectedLayer.uid}` : null,
      minSize: Math.max(28, 24 * width / rect.width),
      padding: 10,
    });

    if (selectedLayer && pointerTarget?.kind === "shape" && pointerTarget.selected) {
      const transform = effectiveShapeTransform(selectedLayer);
      if (transform) {
        setOverlayChromeVisible(true);
        setInspectorElement("shape");
        const asset = shapeAssets.find(item => item.id === selectedLayer.assetId);
        const size = transform.scale ?? 0.2;
        dragRef.current = {
          mode: "overlay", x: event.clientX, y: event.clientY, ox: transform.x, oy: transform.y, rect,
          shapeId: selectedLayer.uid,
          elementSize: size, ratio: asset?.ratio || 1,
          original: { key: "overlay", cx: transform.x, cy: transform.y },
        };
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
        return;
      }
    }

    const sceneTextHit = ["text", "furniture"].includes(pointerTarget?.kind) ? pointerTarget.element : null;
    const roleBoxes = Object.fromEntries(scene.filter(item => item.type === "text" || item.type === "furniture").map(item => [
      item.type === "furniture" ? `furn_${item.role}` : item.role,
      item.bounds,
    ]));
    const furnitureRoles = Object.keys(roleBoxes).filter(role => role.startsWith("furn_"));
    for (const role of ["pill", "eyebrow", "date", "support", ...furnitureRoles, "hero"]) {
      const box = roleBoxes[role];
      if (!box) continue;
      const hitRole = sceneTextHit?.type === "furniture" ? `furn_${sceneTextHit.role}` : sceneTextHit?.role;
      if (hitRole !== role) continue;
      if (role.startsWith("furn_")) selectElement(role);
      else selectElement("text", null, role);

      if (role === "hero") {
        const elementHeight = box.h / height;
        const elementWidth = textLayout.width || box.w / width;
        dragRef.current = {
          mode: "text", role, x: event.clientX, y: event.clientY, ox: textLayout.x, oy: textLayout.y, rect,
          downX: event.clientX, downY: event.clientY, downTime: Date.now(), moved: false,
          elementHeight,
          original: { key: role, cx: textLayout.x + elementWidth / 2, cy: textLayout.y + elementHeight / 2 },
        };
      } else {
        const elementWidth = box.w / width;
        const elementHeight = box.h / height;
        const centerX = (box.x + box.w / 2) / width;
        const centerY = (box.y + box.h / 2) / height;
        const stored = getStoredRoleOffset(role) || null;
        const frozenBase = ["date", "eyebrow", "pill"].includes(role)
          ? (Number.isFinite(stored?.bx) && Number.isFinite(stored?.by)
            ? { bx: stored.bx, by: stored.by }
            : { bx: centerX - (stored?.dx || 0), by: centerY - (stored?.dy || 0) })
          : null;
        dragRef.current = {
          mode: "text", role, x: event.clientX, y: event.clientY, ox: box.x / width, oy: box.y / height, rect,
          downX: event.clientX, downY: event.clientY, downTime: Date.now(), moved: false,
          elementWidth, elementHeight, roleFree: true,
          baseCenterX: centerX, baseCenterY: centerY,
          baseOffset: { dx: stored?.dx || 0, dy: stored?.dy || 0 },
          frozenBase,
          original: { key: role, cx: centerX, cy: centerY },
        };
      }
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      return;
    }

    const logoHit = pointerTarget?.kind === "logo" ? pointerTarget.element : null;
    if (logoHit) {
      selectElement("logo");
      const box = logoHit.bounds;
      const centerX = (box.x + box.w / 2) / width;
      const centerY = (box.y + box.h / 2) / height;
      const pointerX = (event.clientX - rect.left) / rect.width;
      const pointerY = (event.clientY - rect.top) / rect.height;
      dragRef.current = {
        mode: "logo", x: event.clientX, y: event.clientY, rect,
        downX: event.clientX, downY: event.clientY, downTime: Date.now(), moved: false,
        elementWidth: box.w / width, elementHeight: box.h / height,
        offsetX: centerX - pointerX, offsetY: centerY - pointerY,
        original: { key: "logo", cx: centerX, cy: centerY },
      };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      return;
    }

    const shapeHit = pointerTarget?.kind === "shape" ? pointerTarget.element : null;
    const hitLayer = shapeHit ? shapeLayers.find(layer => `shape:${layer.uid}` === shapeHit.id) : null;
    if (hitLayer) {
      selectElement("overlay", hitLayer.uid);
      const transform = effectiveShapeTransform(hitLayer);
      const asset = shapeAssets.find(item => item.id === hitLayer.assetId);
      if (transform) {
        const size = transform.scale ?? 0.2;
        dragRef.current = {
          mode: "overlay", x: event.clientX, y: event.clientY, ox: transform.x, oy: transform.y, rect,
          shapeId: hitLayer.uid,
          elementSize: size, ratio: asset?.ratio || 1,
          original: { key: "overlay", cx: transform.x, cy: transform.y },
        };
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      }
      return;
    }

    setTextSelected(false);
    if (!canPan) {
      selectElement("bg");
      return;
    }
    const handles = photoHandles(rect);
    if (!handles) {
      selectElement("bg");
      return;
    }
    const near = point => Math.hypot(event.clientX - point.x, event.clientY - point.y) <= HANDLE_HIT;
    const effective = handles.windowBox?.eff || photoTransform;
    if (photoSelected && near(handles.rotateHandle)) {
      dragRef.current = {
        mode: "rotate",
        angle: Math.atan2(event.clientY - handles.center.y, event.clientX - handles.center.x),
        startRotation: effective.rotation || 0,
        center: handles.center,
        base: effective,
      };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      return;
    }
    if (photoSelected && handles.corners.some(near)) {
      dragRef.current = {
        mode: "resize",
        startDistance: Math.hypot(event.clientX - handles.center.x, event.clientY - handles.center.y) || 1,
        startZoom: effective.zoom || 1,
        center: handles.center,
        base: effective,
      };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      return;
    }
    // Select on a scene-graph photo hit (the input controller resolved the bare
    // photo element) OR on the geometric photo-window test. The scene hit keeps
    // canvas selection aligned with the renderer's painted photo bounds; the
    // photomove drag still pans exactly as before.
    if (pointerTarget?.kind === "photo" || pointInPhoto(handles, event.clientX, event.clientY)) {
      selectElement("photo");
      dragRef.current = {
        mode: "photomove", x: event.clientX, y: event.clientY,
        cx: effective.cx, cy: effective.cy, rect,
        windowBox: handles.windowBox, scale: handles.scale, base: effective, moved: false,
      };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      return;
    }
    setPhotoSelected(false);
    selectElement("bg");
  };

  const onPointerMove = event => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    // (Mobile audit #8) Pinch takes precedence over any single-pointer drag.
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const dist = pinchDistance();
      if (dist > 0) {
        let zoom = pinchRef.current.startZoom * (dist / pinchRef.current.startDist);
        zoom = Math.max(0.1, Math.min(6, zoom)); // Generator.applyPatch floors frames at cover
        patchPhoto({ zoom: Math.round(zoom * 1000) / 1000 });
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === "text") {
      if (!drag.moved && Math.hypot(event.clientX - drag.downX, event.clientY - drag.downY) <= 5) return;
      drag.moved = true;
      let x = drag.ox + (event.clientX - drag.x) / drag.rect.width;
      let y = drag.oy + (event.clientY - drag.y) / drag.rect.height;
      const elementWidth = drag.roleFree ? (drag.elementWidth || 0.4) : (textLayout.width || 0.6);
      const elementHeight = drag.elementHeight || 0.14;
      const snap = snapCentre(
        x + elementWidth / 2,
        y + elementHeight / 2,
        elementWidth,
        elementHeight,
        drag.rect.width,
        drag.rect.height,
        drag.original,
      );
      x = snap.cx - elementWidth / 2;
      y = snap.cy - elementHeight / 2;
      setSnapGuide(snap.guide);
      setDragLift({ x, y, w: elementWidth, h: elementHeight });
      if (drag.roleFree) {
        updateRoleOffset(
          drag.role,
          (drag.baseOffset?.dx || 0) + (x + elementWidth / 2 - drag.baseCenterX),
          (drag.baseOffset?.dy || 0) + (y + elementHeight / 2 - drag.baseCenterY),
          drag.frozenBase?.bx,
          drag.frozenBase?.by,
        );
      } else {
        updateTextLayout({
          x: Math.max(0.08, Math.min(0.92 - textLayout.width, x)),
          y: Math.max(0.08, Math.min(0.82, y)),
        });
      }
      return;
    }
    if (drag.mode === "overlay") {
      let x = drag.ox + (event.clientX - drag.x) / drag.rect.width;
      let y = drag.oy + (event.clientY - drag.y) / drag.rect.height;
      const size = drag.elementSize || 0.2;
      const snap = snapCentre(x, y, size, size / (drag.ratio || 1), drag.rect.width, drag.rect.height, drag.original);
      x = snap.cx;
      y = snap.cy;
      setSnapGuide(snap.guide);
      updateShapeTransform(drag.shapeId || selectedShapeId, {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      });
      return;
    }
    if (drag.mode === "logo") {
      if (!drag.moved && Math.hypot(event.clientX - drag.downX, event.clientY - drag.downY) <= 5) return;
      drag.moved = true;
      const pointerX = (event.clientX - drag.rect.left) / drag.rect.width;
      const pointerY = (event.clientY - drag.rect.top) / drag.rect.height;
      const elementWidth = drag.elementWidth || 0.14;
      const elementHeight = drag.elementHeight || 0.14;
      const snap = snapCentre(
        pointerX + drag.offsetX,
        pointerY + drag.offsetY,
        elementWidth,
        elementHeight,
        drag.rect.width,
        drag.rect.height,
        drag.original,
      );
      drag.free = { x: Math.max(0, Math.min(1, snap.cx)), y: Math.max(0, Math.min(1, snap.cy)) };
      setSnapGuide(snap.guide);
      setDragLift({
        x: drag.free.x - elementWidth / 2,
        y: drag.free.y - elementHeight / 2,
        w: elementWidth,
        h: elementHeight,
      });
      return;
    }
    if (drag.mode === "rotate") {
      const angle = Math.atan2(event.clientY - drag.center.y, event.clientX - drag.center.x);
      let degrees = drag.startRotation + (angle - drag.angle) * 180 / Math.PI;
      const snap = Math.round(degrees / 45) * 45;
      if (Math.abs(degrees - snap) < 6) degrees = snap;
      degrees = ((degrees % 360) + 360) % 360;
      if (degrees > 180) degrees -= 360;
      if (!drag.pinned) {
        drag.pinned = true;
        pinPhotoTouched(drag.base);
      }
      patchPhoto({ rotation: Math.round(degrees * 10) / 10 });
      return;
    }
    if (drag.mode === "resize") {
      const distance = Math.hypot(event.clientX - drag.center.x, event.clientY - drag.center.y);
      let zoom = Math.max(0.1, Math.min(6, drag.startZoom * distance / drag.startDistance));
      for (const common of [0.25, 0.5, 0.75, 1, 1.5, 2]) {
        if (Math.abs(zoom - common) < 0.025) {
          zoom = common;
          break;
        }
      }
      if (!drag.pinned) {
        drag.pinned = true;
        pinPhotoTouched(drag.base);
      }
      patchPhoto({ zoom });
      return;
    }
    if (drag.mode === "photomove") {
      const displayWidth = drag.windowBox && drag.scale ? drag.windowBox.w * drag.scale : drag.rect.width;
      const displayHeight = drag.windowBox && drag.scale ? drag.windowBox.h * drag.scale : drag.rect.height;
      let cx = drag.cx + (event.clientX - drag.x) / displayWidth;
      let cy = drag.cy + (event.clientY - drag.y) / displayHeight;
      if (Math.abs(cx - 0.5) < 0.02) cx = 0.5;
      if (Math.abs(cy - 0.5) < 0.02) cy = 0.5;
      if (!drag.moved) {
        drag.moved = true;
        pinPhotoTouched(drag.base);
      }
      patchPhoto({ cx, cy });
    }
  };

  const onPointerEnd = event => {
    if (event && typeof event.pointerId !== "undefined") pointersRef.current.delete(event.pointerId);
    // (Mobile audit #8) End the pinch when a finger lifts. The remaining finger has
    // no dragRef (cleared on pinch start), so it can't spuriously become a drag —
    // it will simply do nothing until it too lifts.
    if (pinchRef.current && pointersRef.current.size < 2) {
      pinchRef.current = null;
      clearSnapGuide();
      clearDragLift();
      dragRef.current = null;
      return;
    }
    const drag = dragRef.current;
    if (drag?.mode === "text" && !drag.moved && Date.now() - drag.downTime <= 300 &&
      !(drag.role || "").startsWith("furn_")) {
      focusTextField(drag.role || "hero");
    }
    if (drag?.mode === "logo") {
      if (drag.moved && drag.free) applyPatch({ logoFree: drag.free }, { source: "ui" });
      else if (!drag.moved && Date.now() - drag.downTime <= 300) selectElement("logo");
    }
    clearSnapGuide();
    clearDragLift();
    dragRef.current = null;
    if (devHooks && typeof performance !== "undefined") {
      try {
        performance.mark("wo-editor-gesture-end");
        performance.measure("wo-editor-gesture", "wo-editor-gesture-start", "wo-editor-gesture-end");
      } catch {}
    }
  };

  return {
    canPan,
    snapGuide,
    dragLift,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    setZoom: zoom => patchPhoto({ zoom }),
  };
}
