import test from "node:test";
import assert from "node:assert/strict";
import {
  editorSelectionReducer,
  selectionForElement,
  selectionInspectorKey,
  selectionSceneId,
} from "../../lib/editor-selection.mjs";

test("selecting an element replaces the previous selection", () => {
  const photo = editorSelectionReducer(null, { type: "select-element", kind: "photo" });
  const text = editorSelectionReducer(photo, { type: "select-element", kind: "text", role: "support" });

  assert.deepEqual(text, { type: "text", id: "text", role: "support" });
});

test("legacy deselect actions cannot clear a different active element", () => {
  const text = { type: "text", id: "text", role: "hero" };
  const unchanged = editorSelectionReducer(text, {
    type: "set-type-selected",
    elementType: "photo",
    selected: false,
  });

  assert.equal(unchanged, text);
});

test("shape selection retains its stable uid when its inspector opens", () => {
  const shape = editorSelectionReducer(null, { type: "set-shape", id: "shape-17" });
  const inspected = editorSelectionReducer(shape, { type: "select-inspector", key: "shape" });

  assert.equal(inspected, shape);
  assert.equal(selectionSceneId(inspected), "shape:shape-17");
});

test("text roles have distinct scene identities and share the text inspector", () => {
  const caption = selectionForElement("text", null, "support");

  assert.equal(selectionSceneId(caption), "text:support");
  assert.equal(selectionInspectorKey(caption), "text");
});

test("an added element rides a text selection into the ONE Text panel + its own scene node", () => {
  // (Text unification Phase A) The canvas gesture selects an added content.element as
  // a text selection whose role is the synthetic el:<uid> key. Its inspector key is
  // now "text" — ONE text home, the panel scrolls/focuses the matching row — while
  // its scene id stays the renderer node `element:<uid>` so the mobile half-sheet
  // auto-scroll still resolves the right box.
  const element = selectionForElement("text", null, "el:el_heading_0");
  assert.deepEqual(element, { type: "text", id: "text", role: "el:el_heading_0" });
  assert.equal(selectionInspectorKey(element), "text");
  assert.equal(selectionSceneId(element), "element:el_heading_0");

  // A fixed archetype text role is unaffected — still the shared text panel.
  const hero = selectionForElement("text", null, "hero");
  assert.equal(selectionInspectorKey(hero), "text");
  assert.equal(selectionSceneId(hero), "text:hero");
});

test("furniture keys map to a selectable scene element and their own inspector", () => {
  const furniture = selectionForElement("furn_rule_0");

  assert.deepEqual(furniture, { type: "furniture", id: "furn_rule_0" });
  assert.equal(selectionInspectorKey(furniture), "furn_rule_0");
  assert.equal(selectionSceneId(furniture), "furniture:rule_0");
});

test("photo and furniture selection ids match renderer scene identities", () => {
  assert.equal(selectionSceneId(selectionForElement("photo")),"photo:primary");
  assert.equal(selectionSceneId(selectionForElement("furn_date")),"furniture:date");
});

test("the Shapes home chip selects an id-less shape (never clears the panel)", () => {
  // The rail chip fires select-element kind:"shape" with NO uid to open the
  // Shapes overview. This used to resolve to null (selection cleared → panel
  // closed → the chip read as dead). It must resolve to a valid id-less shape
  // selection that routes to the "shape" inspector.
  const home = selectionForElement("shape");
  assert.deepEqual(home, { type: "shape" });
  assert.equal(selectionInspectorKey(home), "shape");

  const viaReducer = editorSelectionReducer(
    { type: "background", id: "background" },
    { type: "select-element", kind: "shape" },
  );
  assert.deepEqual(viaReducer, { type: "shape" });

  // A specific layer still selects by uid; a bare "overlay" stays a no-op.
  assert.deepEqual(selectionForElement("overlay", "shape-9"), { type: "shape", id: "shape-9" });
  assert.equal(selectionForElement("overlay"), null);
});

test("clear-if only clears the matching shape instance", () => {
  const shape = { type: "shape", id: "shape-2" };

  assert.equal(
    editorSelectionReducer(shape, { type: "clear-if", elementType: "shape", id: "shape-1" }),
    shape,
  );
  assert.equal(
    editorSelectionReducer(shape, { type: "clear-if", elementType: "shape", id: "shape-2" }),
    null,
  );
});
