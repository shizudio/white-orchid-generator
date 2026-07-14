import { useEffect, useMemo } from "react";

/** Build the contextual-inspector route, layer rail, and element removal action. */
export function useInspectorModel({
  inspectorElement,
  selectedShapeId,
  postType,
  hasMedia,
  hasVideo,
  hasRenderedLogo,
  archetypeId,
  shapeLayers,
  textRole,
  selectionFlags,
  renderResultRef,
  furnitureMetaFor,
  furnitureLabels,
  shapeAssets,
  closeInspector,
  applyPatch,
  deleteShape,
  renderBackground,
  renderShapes,
  renderPhoto,
  renderText,
  renderLogo,
  renderFurniture,
  renderShape,
}) {
  const postHasCopy = ["quote", "event", "text_post", "texture_text", "photo_logo"].includes(postType);
  const textRoleLabel = postType === "quote" ? "Quote"
    : postType === "event" ? "Event text"
      : postType === "texture_text" ? "Overlay text"
        : postType === "photo_logo" ? "Caption" : "Text";
  const textInspectorTitle = textRole === "date" ? "Date"
    : textRole === "eyebrow" ? "Little label"
      : textRole === "pill" ? "Button"
        : textRole === "support" ? "Text"
          : textRole === "hero" ? (postType === "quote" ? "Quote" : "Title") : "Text";

  const activeElements = useMemo(() => [
    { key: "bg", label: "Background", icon: "◐" },
    ...(hasMedia ? [{ key: "photo", label: hasVideo ? "Video" : "Photo", icon: "▣" }] : []),
    ...(postHasCopy ? [{ key: "text", label: textRoleLabel, icon: "T" }] : []),
    ...(hasRenderedLogo ? [{ key: "logo", label: "Logo", icon: "❋" }] : []),
    ...((archetypeId || postHasCopy || hasMedia || shapeLayers.length)
      ? [{ key: "shape", label: "Shapes", icon: "✦" }] : []),
    ...(renderResultRef.current?.sceneElements || [])
      .filter(item => item.type === "furniture")
      .map(item => {
        const key = `furn_${item.role}`;
        const meta = furnitureMetaFor(key);
        return { key, label: furnitureLabels[meta?.type] || "Detail", icon: "—" };
      }),
  ], [
    hasMedia, hasVideo, postHasCopy, textRoleLabel, hasRenderedLogo, archetypeId,
    shapeLayers.length, renderResultRef, furnitureMetaFor, furnitureLabels,
  ]);

  const activeElementKey = selectedShapeId ? "shape"
    : inspectorElement != null ? inspectorElement
      : selectionFlags.photo ? "photo"
        : selectionFlags.text ? "text"
          : selectionFlags.logo ? "logo"
            : selectionFlags.background ? "bg" : null;
  const activeKeysSignature = activeElements.map(element => element.key).join("|");
  useEffect(() => {
    if (inspectorElement == null) return;
    if (!activeElements.some(element => element.key === inspectorElement)) closeInspector();
  }, [activeKeysSignature, inspectorElement, activeElements, closeInspector]);

  let inspectorInfo = null;
  if (inspectorElement === "bg") inspectorInfo = { title: "Background", body: renderBackground() };
  else if (inspectorElement === "shape") inspectorInfo = { title: "Shapes", body: renderShapes() };
  else if (inspectorElement === "photo") inspectorInfo = { title: hasVideo ? "Video" : "Photo", body: renderPhoto() };
  else if (inspectorElement === "text") inspectorInfo = { title: textInspectorTitle, body: renderText() };
  else if (inspectorElement === "logo") inspectorInfo = { title: "Logo", body: renderLogo() };
  else if (String(inspectorElement || "").startsWith("furn_")) {
    const meta = furnitureMetaFor(inspectorElement);
    inspectorInfo = { title: furnitureLabels[meta?.type] || "Detail", body: renderFurniture(inspectorElement) };
  } else if (inspectorElement != null) {
    const layer = shapeLayers.find(item => item.uid === inspectorElement);
    if (layer) {
      const asset = shapeAssets.find(item => item.id === layer.assetId);
      inspectorInfo = { title: asset?.name || "Overlay", body: renderShape(layer) };
    }
  }

  let removeAction = null;
  if (inspectorElement === "text") {
    removeAction = { label: "Clear text", act: () => applyPatch({ headline: "", subtext: "", attribution: "", dateText: "", microLabel: "", pillText: "" }, { source: "ui" }) };
  } else if (inspectorElement === "photo") {
    removeAction = { label: hasVideo ? "Remove video" : "Remove photo", act: () => { applyPatch({ removeImage: true }, { source: "ui" }); closeInspector(); } };
  } else if (String(inspectorElement || "").startsWith("furn_")) {
    removeAction = { label: "Delete", act: () => { applyPatch({ furnitureUpdate: { key: inspectorElement, hidden: true } }, { source: "ui" }); closeInspector(); } };
  } else if (inspectorElement === "shape" && selectedShapeId) {
    removeAction = { label: "Delete shape", act: () => deleteShape(selectedShapeId) };
  } else if (inspectorElement && !["bg", "logo", "text", "photo", "shape"].includes(inspectorElement)) {
    removeAction = { label: "Delete", act: () => deleteShape(inspectorElement) };
  }

  return { activeElements, activeElementKey, inspectorInfo, removeAction };
}
