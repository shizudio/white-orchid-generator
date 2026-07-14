import { hitTestScene } from "./render-result.mjs";

/** Resolve the semantic canvas element under a pointer without knowing about React.
 * Gesture construction remains a UI concern; target ordering lives here so canvas
 * clicks, inspector selection, and renderer scene identities cannot drift apart.
 */
export function resolveScenePointerTarget(sceneElements, x, y, {
  selectedShapeId = null,
  minSize = 0,
  padding = 0,
} = {}) {
  const scene = Array.isArray(sceneElements) ? sceneElements : [];
  if (selectedShapeId) {
    const selected = scene.find(item => item.id === selectedShapeId);
    if (selected && hitTestScene([selected], x, y, { minSize, padding })) {
      return { kind: "shape", element: selected, selected: true };
    }
  }

  const copy = hitTestScene(scene, x, y, {
    types: ["text", "furniture"], minSize, padding,
  });
  if (copy) {
    return {
      kind: copy.type,
      role: copy.type === "furniture" ? `furn_${copy.role}` : copy.role,
      element: copy,
      selected: false,
    };
  }

  const logo = hitTestScene(scene, x, y, { types: ["logo"], minSize, padding });
  if (logo) return { kind: "logo", element: logo, selected: false };

  const shape = hitTestScene(scene, x, y, { types: ["shape"] });
  if (shape) return { kind: "shape", element: shape, selected: false };

  // Photo is the lowest interactive element (above background only). Resolve it
  // from its painted scene bounds so a click on the bare photo selects the media
  // element instead of dead-clicking through to background (invariant 9). Tight
  // bounds — no minSize/padding inflation — so clicks just outside the painted
  // photo still fall through to background.
  const photo = hitTestScene(scene, x, y, { types: ["photo"] });
  if (photo) return { kind: "photo", element: photo, selected: false };
  return null;
}
