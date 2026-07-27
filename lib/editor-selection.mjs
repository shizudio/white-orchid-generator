export const EDITOR_SELECTION_TYPES = Object.freeze([
  "background",
  "photo",
  "text",
  "logo",
  "shape",
  "furniture",
]);

const SELECTION_TYPE_SET = new Set(EDITOR_SELECTION_TYPES);

export function normalizeEditorSelection(value) {
  if (!value || !SELECTION_TYPE_SET.has(value.type)) return null;

  const selection = { type: value.type };
  if (value.id != null && value.id !== "") selection.id = String(value.id);
  if (value.type === "text") selection.role = value.role || "hero";
  return selection;
}

export function selectionForElement(kind, uid = null, role = null) {
  if (kind === "bg" || kind === "background") {
    return { type: "background", id: "background" };
  }
  if (kind === "photo") return { type: "photo", id: "primary" };
  if (kind === "text") return { type: "text", id: "text", role: role || "hero" };
  if (kind === "logo") return { type: "logo", id: "primary" };
  if (kind === "overlay" || kind === "shape") {
    if (uid) return { type: "shape", id: String(uid) };
    // The Shapes HOME route: the rail chip / driver selects "shape" with no
    // layer uid to open the shapes overview panel. An id-less shape selection
    // is valid (normalizeEditorSelection keeps it) and routes to the Shapes
    // home via selectionInspectorKey → "shape"; pre-refactor this was
    // setInspectorEl("shape"). Returning null here closed the panel instead
    // (the shape-pill dead-click regression). Only the home chip omits the
    // uid — a bare "overlay" without uid stays a no-op as before.
    if (kind === "shape") return { type: "shape" };
  }
  if (typeof kind === "string" && kind.startsWith("furn_")) {
    return { type: "furniture", id: kind };
  }
  return null;
}

export function selectionInspectorKey(selection) {
  if (!selection) return null;
  if (selection.type === "background") return "bg";
  if (selection.type === "shape") return "shape";
  if (selection.type === "furniture") return selection.id || null;
  // (Text unification Phase A — ONE TEXT HOME, docs/text-unification-spec.md §Phase A)
  // EVERY text on the design — fixed archetype role or added `el:<uid>` element —
  // routes to the single "text" panel. The role is still carried on the selection
  // (selectionSceneId + the panel's row focus read it), but it no longer forks the
  // inspector: the per-element inspector key is retired along with its rail pill.
  return selection.type;
}

export function selectionSceneId(selection) {
  if (!selection) return null;
  // (Slice 3) Added elements paint as scene nodes `element:<uid>` — the mobile
  // half-sheet auto-scroll resolves the selected box by this id, so an el:<uid>
  // text selection must map to the element node, not a `text:el:<uid>` phantom.
  if (selection.type === "text" && String(selection.role || "").startsWith("el:")) return `element:${selection.role.slice(3)}`;
  if (selection.type === "text") return `text:${selection.role || "hero"}`;
  if (selection.type === "background") return "background:field";
  if (selection.type === "furniture") return `furniture:${String(selection.id||"").replace(/^furn_/,"")}`;
  return `${selection.type}:${selection.id || "primary"}`;
}

function selectFromInspector(state, key) {
  if (key == null) return null;
  if (key === selectionInspectorKey(state)) return state;
  return selectionForElement(key);
}

export function editorSelectionReducer(state, action) {
  switch (action?.type) {
    case "select":
      return normalizeEditorSelection(action.selection);
    case "select-element":
      return normalizeEditorSelection(selectionForElement(action.kind, action.uid, action.role));
    case "select-inspector": {
      const next = selectFromInspector(state, action.key);
      return next === state ? state : normalizeEditorSelection(next);
    }
    case "set-text-role":
      return normalizeEditorSelection({ type: "text", id: "text", role: action.role });
    case "set-shape":
      return action.id
        ? normalizeEditorSelection({ type: "shape", id: action.id })
        : state?.type === "shape" ? null : state;
    case "set-type-selected":
      if (action.selected) {
        const currentRole = state?.type === "text" ? state.role : null;
        return normalizeEditorSelection(selectionForElement(action.elementType, null, currentRole));
      }
      return state?.type === action.elementType ? null : state;
    case "clear-if":
      if (state?.type !== action.elementType) return state;
      if (action.id != null && state.id !== String(action.id)) return state;
      return null;
    case "clear":
      return null;
    default:
      return state;
  }
}
