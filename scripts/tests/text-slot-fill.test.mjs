import test from "node:test";
import assert from "node:assert/strict";
import {
  POST_TYPE_DECLARED_ROLES,
  SLOT_FILL_ROLES_BY_CLASS,
  contentFieldForRole,
  declaredRolesForDocument,
  slotFillTargetForClass,
} from "../../lib/text-slot-fill.mjs";
import { createDesignDocumentV1 } from "../../lib/design-document.mjs";
import { ELEMENT_CLASSES } from "../../lib/text-elements.mjs";

const doc = (source = {}) => createDesignDocumentV1(source);

test("every sanctioned element class has a slot-fill entry (closed vocabulary)", () => {
  for (const cls of ELEMENT_CLASSES) {
    assert.ok(Array.isArray(SLOT_FILL_ROLES_BY_CLASS[cls]), `missing slot-fill entry: ${cls}`);
  }
  assert.equal(Object.keys(SLOT_FILL_ROLES_BY_CLASS).length, ELEMENT_CLASSES.length);
});

test("every declared role resolves to a real content field", () => {
  for (const [postType, roles] of Object.entries(POST_TYPE_DECLARED_ROLES)) {
    for (const role of roles) {
      const field = contentFieldForRole(role, postType);
      assert.ok(field, `${postType}/${role} has no content field`);
      assert.ok(field in doc({ postType }).content, `${postType}/${role} → ${field} is not a content field`);
    }
  }
});

test("a quote's support line IS its attribution (ContentFieldsPanel parity)", () => {
  assert.equal(contentFieldForRole("support", "quote"), "attribution");
  assert.equal(contentFieldForRole("support", "photo_logo"), "subtext");
});

test("slot-fill mapping per class × archetype-declared roles", () => {
  const empty = doc();
  assert.deepEqual(slotFillTargetForClass(empty, "heading"), { role:"hero", field:"headline" });
  assert.deepEqual(slotFillTargetForClass(empty, "subheading"), { role:"support", field:"subtext" });
  // caption prefers the eyebrow micro-label, but only where the layout declares one.
  assert.deepEqual(slotFillTargetForClass(empty, "caption"), { role:"date", field:"dateText" });
  const withEyebrow = doc({ typography:{ masterLayouts:{ photo_logo:{ roles:{ microLabel:{ x:0.1,y:0.1,w:0.3,h:0.05 } } } } } });
  assert.deepEqual(slotFillTargetForClass(withEyebrow, "caption"), { role:"eyebrow", field:"microLabel" });
  // `body` is a free reading block — never a slot fill.
  assert.equal(slotFillTargetForClass(empty, "body"), null);
  // `cta` fills the pill only where the design declares one (pillText present).
  assert.equal(slotFillTargetForClass(empty, "cta"), null);
  assert.deepEqual(slotFillTargetForClass(doc({ pillText:"" }), "cta"), { role:"pill", field:"pillText" });
});

test("a FILLED slot is never a fill target — and whitespace still counts as empty", () => {
  assert.equal(slotFillTargetForClass(doc({ headline:"Taken" }), "heading"), null);
  assert.deepEqual(slotFillTargetForClass(doc({ headline:"   " }), "heading"), { role:"hero", field:"headline" });
});

test("the caption family FALLS THROUGH a filled eyebrow to the date line", () => {
  const withEyebrow = doc({
    microLabel:"LABEL",
    typography:{ masterLayouts:{ photo_logo:{ roles:{ microLabel:{ x:0.1,y:0.1,w:0.3,h:0.05 } } } } },
  });
  assert.deepEqual(slotFillTargetForClass(withEyebrow, "caption"), { role:"date", field:"dateText" });
});

test("declaredRolesForDocument reads the layout, not a hardcoded archetype list", () => {
  assert.equal(declaredRolesForDocument(doc()).includes("eyebrow"), false);
  const perFormat = doc({ typography:{ formatLayouts:{ story:{ photo_logo:{ roles:{ microLabel:{ x:0,y:0,w:0.3,h:0.05 } } } } } } });
  assert.equal(declaredRolesForDocument(perFormat).includes("eyebrow"), true);
});

test("an unknown class and a junk document degrade to no fill (never throws)", () => {
  assert.equal(slotFillTargetForClass(doc(), "nonsense"), null);
  assert.equal(slotFillTargetForClass(null, "heading"), null);
  assert.equal(slotFillTargetForClass(undefined, "caption"), null);
});
