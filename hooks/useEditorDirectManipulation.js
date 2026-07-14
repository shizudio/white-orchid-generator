import { useCanvasGestures } from "@/hooks/useCanvasGestures";
import { resolveInheritedValue } from "@/lib/format-inheritance.mjs";

/** Canvas gestures plus keyboard and shape-layer command adapters. */
export function useEditorDirectManipulation({
  width, height, canvasRef, dragRef, renderResultRef, photoWindowRef,
  dimensionId, masterDimensionId, platformSafe, devHooks, mediaObject,
  photoTransform, photoSelected, selectedShapeId, shapeLayers, shapeAssets,
  textLayout, textRole, textSelected, roleOffsetsByDimensionRef, postType,
  deriveShapeTransform, suggestShapePlacement, resolveRoleOffsets,
  updateRoleOffset, updateTextLayout, patchPhoto, pinPhotoTouched, applyPatch,
  selectElement, focusTextField, setShapeChromeVisible, setInspectorElement,
  setTextSelected, setPhotoSelected, dispatchDesignCommand, setShapeDirty,
}) {
  const effectiveShapeTransform = layer => {
    if (!layer) return null;
    const asset = shapeAssets.find(item => item.id === layer.assetId);
    return resolveInheritedValue(
      { master:layer.master, byFormat:layer.byDim || {} }, dimensionId,
      masterDimensionId,
      master => deriveShapeTransform(master, asset?.kind || "center", asset?.ratio || 1, width, height),
    ).value;
  };
  const updateShapeTransform = (uid, transform) =>
    applyPatch({ overlayUpdate:{ uid, transform } }, { source:"ui" });
  const {
    canPan, snapGuide, dragLift,
    onPointerDown:onPanStart,
    onPointerMove:onPanMove,
    onPointerEnd:onPanEnd,
  } = useCanvasGestures({
    canvasRef, dragRef, renderResultRef, photoWindowRef,
    width, height, dimensionId, platformSafe, devHooks,
    mediaObject, photoTransform, photoSelected, selectedShapeId,
    shapeLayers, shapeAssets, textLayout,
    effectiveShapeTransform,
    getStoredRoleOffset: role => resolveRoleOffsets(dimensionId, postType, roleOffsetsByDimensionRef.current)?.[role] || null,
    updateRoleOffset, updateTextLayout, updateShapeTransform,
    patchPhoto, pinPhotoTouched, applyPatch, selectElement, focusTextField,
    setOverlayChromeVisible:setShapeChromeVisible,
    setInspectorElement, setTextSelected, setPhotoSelected,
  });

  const addShape = asset => {
    const mode = asset.kind === "corner" || asset.kind === "accessory" ? "overlay" : (mediaObject ? "frame" : "overlay");
    applyPatch({ addOverlay:{ assetId:asset.id, mode } }, { source:"ui" });
  };
  const setLayerMode = (uid, mode) => applyPatch({ overlayUpdate:{ uid, mode } }, { source:"ui" });
  const setLayerStyle = (uid, style) => applyPatch({ overlayUpdate:{ uid, style } }, { source:"ui" });

  const onCanvasKeyDown = event => {
    const arrows = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] };
    if (arrows[event.key]) {
      event.preventDefault();
      const [dx,dy] = arrows[event.key];
      const step = event.shiftKey ? 0.03 : 0.01;
      if (selectedShapeId) {
        const layer = shapeLayers.find(item => item.uid === selectedShapeId);
        const transform = effectiveShapeTransform(layer);
        if (transform) updateShapeTransform(selectedShapeId, {
          x:Math.max(0,Math.min(1,(transform.x??0.5)+dx*step)),
          y:Math.max(0,Math.min(1,(transform.y??0.5)+dy*step)),
        });
      } else if (textSelected) {
        if (textRole && textRole !== "hero" && renderResultRef.current?.sceneElements?.some(item=>item.type==="text"&&item.role===textRole)) {
          const stored=resolveRoleOffsets(dimensionId,postType,roleOffsetsByDimensionRef.current)?.[textRole]||{};
          updateRoleOffset(textRole,(stored.dx||0)+dx*step,(stored.dy||0)+dy*step,stored.bx,stored.by);
        } else {
          updateTextLayout({x:Math.max(0.08,Math.min(0.92-textLayout.width,textLayout.x+dx*step)),y:Math.max(0.08,Math.min(0.82,textLayout.y+dy*step))});
        }
      } else if (canPan) {
        setPhotoSelected(true);
        patchPhoto({ cx:photoTransform.cx+dx*step, cy:photoTransform.cy+dy*step });
      }
      return;
    }
    if (!canPan || selectedShapeId || textSelected) return;
    if (["+","=","-","_","[","]"].includes(event.key)) event.preventDefault();
    if (event.key === "+" || event.key === "=") patchPhoto({ zoom:Math.min(6,photoTransform.zoom+0.05) });
    if (event.key === "-" || event.key === "_") patchPhoto({ zoom:Math.max(0.1,photoTransform.zoom-0.05) });
    if (event.key === "[") patchPhoto({ rotation:(photoTransform.rotation||0)-1 });
    if (event.key === "]") patchPhoto({ rotation:(photoTransform.rotation||0)+1 });
  };

  const resetLayer = uid => {
    const layer=shapeLayers.find(item=>item.uid===uid); if(!layer)return;
    const asset=shapeAssets.find(item=>item.id===layer.assetId);
    if(dimensionId===masterDimensionId) dispatchDesignCommand({ type:"shape/update", uid, patch:{master:suggestShapePlacement(asset?.kind||"center",asset?.ratio||1,width,height)} });
    else { const byDim={...(layer.byDim||{})}; delete byDim[dimensionId]; dispatchDesignCommand({type:"shape/update",uid,patch:{byDim}}); }
    setShapeDirty(true);
  };
  const deleteLayer = uid => applyPatch({ removeOverlay:uid }, { source:"ui" });
  const saveOverlays = () => setShapeDirty(false);

  return {
    addShape, canPan, deleteLayer, dragLift,
    effectiveT:effectiveShapeTransform,
    onCanvasKeyDown, onPanEnd, onPanMove, onPanStart,
    resetLayer, saveOverlays, setLayerMode, setLayerStyle,
    snapGuide, updateLayerT:updateShapeTransform,
  };
}
