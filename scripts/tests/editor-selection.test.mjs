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
