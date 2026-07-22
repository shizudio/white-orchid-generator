import { useEffect, useMemo } from "react";

// (docs/text-elements-spec.md §3; Slice 3) The five brand-governed classes carry
// PLAIN labels a preschool teacher reads at a glance — "Button", never "CTA".
const ELEMENT_CLASS_LABELS = { heading:"Heading", subheading:"Subheading", body:"Body", caption:"Caption", cta:"Button" };

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
  contentElements = [],
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
  renderElement,
  removeElement,
}) {
  const elementUidOf = key => (String(key || "").startsWith("el:") ? key.slice(3) : null);
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
    // (B2 · never a dead end) The photo chip is ALWAYS present. With media it opens the
    // Photo panel to reframe/swap; with NO media it reads "Add photo" and opens the same
    // panel in its add state (upload / Library / sample / generate) — the only recovery
    // path once media is null (e.g. a failed refresh left the design photo-less).
    { key: "photo", label: hasMedia ? (hasVideo ? "Video" : "Photo") : "Add photo", icon: hasMedia ? "▣" : "＋" },
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
    // (Slice 3) One chip per ADDED text element so tap-through re-selection works
    // like every other element (desktop rail + mobile half-sheet). Driven by the
    // document collection (reactive) — an element the solver could not place in this
    // format still lists here (its chip carries a ∅ tell) so the owner can reach it
    // to shorten/resize/remove it (never orphaned; complete-or-absent).
    ...contentElements.map(el => ({
      key: `el:${el.uid}`, label: ELEMENT_CLASS_LABELS[el.class] || "Text", icon: el.placed === false ? "∅" : "T",
      element: true, uid: el.uid, elementClass: el.class, unplaced: el.placed === false,
    })),
  ], [
    hasMedia, hasVideo, postHasCopy, textRoleLabel, hasRenderedLogo, archetypeId,
    shapeLayers.length, renderResultRef, furnitureMetaFor, furnitureLabels, contentElements,
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
  else if (String(inspectorElement || "").startsWith("el:")) {
    const uid = elementUidOf(inspectorElement);
    const model = contentElements.find(el => el.uid === uid);
    inspectorInfo = { title: ELEMENT_CLASS_LABELS[model?.class] || "Text", body: renderElement ? renderElement(uid) : null };
  }
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
  } else if (inspectorElement === "photo" && hasMedia) {
    // Only offer removal when a photo/video actually exists — in the no-media "Add
    // photo" state there is nothing to remove (a dead button would violate law 2).
    removeAction = { label: hasVideo ? "Remove video" : "Remove photo", act: () => { applyPatch({ removeImage: true }, { source: "ui" }); closeInspector(); } };
  } else if (String(inspectorElement || "").startsWith("el:")) {
    // (Slice 3) Remove the added element through the typed remove command (one undo);
    // closing the inspector afterwards keeps the standard element-removal pattern.
    const uid = elementUidOf(inspectorElement);
    removeAction = { label: "Remove", act: () => { if (removeElement) removeElement(uid); closeInspector(); } };
  } else if (String(inspectorElement || "").startsWith("furn_")) {
    removeAction = { label: "Delete", act: () => { applyPatch({ furnitureUpdate: { key: inspectorElement, hidden: true } }, { source: "ui" }); closeInspector(); } };
  } else if (inspectorElement === "shape" && selectedShapeId) {
    removeAction = { label: "Delete shape", act: () => deleteShape(selectedShapeId) };
  } else if (inspectorElement && !["bg", "logo", "text", "photo", "shape"].includes(inspectorElement)) {
    removeAction = { label: "Delete", act: () => deleteShape(inspectorElement) };
  }

  return { activeElements, activeElementKey, inspectorInfo, removeAction };
}
