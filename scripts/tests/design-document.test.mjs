import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDesignCommand,
  createDesignDocumentV1,
  DESIGN_COMMAND_TYPES,
  designDocumentToLegacyFields,
  isDesignCommand,
  normalizeShapeInstances,
  migrateDesignDocument,
  validateDesignDocument,
} from "../../lib/design-document.mjs";

test("migrates the current flat saved-template shape into DesignDocumentV1", () => {
  const doc = migrateDesignDocument({
    headline:"Learning with confidence",
    microLabel:"ENRICHMENT",
    bgColor:"celadon",
    bgAlpha:0.7,
    textColorId:"burnham",
    backdropMode:"gradient",
    pinnedProps:{ textColorId:true },
    copyAuthors:{ headline:"owner" },
  });

  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.content.headline, "Learning with confidence");
  assert.equal(doc.content.authorship.headline, "owner");
  assert.equal(doc.palette.background, "celadon");
  assert.equal(doc.palette.backgroundOpacity, 0.7);
  assert.equal(doc.palette.backdrop, "auto");
  assert.equal(validateDesignDocument(doc).valid, true);
});

test("canonical nested values win over transitional flat compatibility fields", () => {
  const doc = createDesignDocumentV1({
    schemaVersion:1,
    content:{ headline:"Canonical", subtext:"", attribution:"", dateText:"", microLabel:null, pillText:null },
    palette:{ background:"burnham", field:null, text:"whiteSmoke", backdrop:"none", backgroundOpacity:1 },
    headline:"Legacy",
    textColorId:"jet",
  });

  assert.equal(doc.content.headline, "Canonical");
  assert.equal(doc.palette.text, "whiteSmoke");
});

test("content commands are immutable and report the exact changed path", () => {
  const before = createDesignDocumentV1();
  const result = applyDesignCommand(before, { type:"content/set", field:"headline", value:"A better beginning" });

  assert.equal(before.content.headline, "");
  assert.equal(result.document.content.headline, "A better beginning");
  assert.deepEqual(result.changedPaths, ["content.headline"]);
});

test("owner authorship cannot be downgraded by a later AI stamp", () => {
  const before = createDesignDocumentV1({ copyAuthors:{ headline:"owner" } });
  const result = applyDesignCommand(before, {
    type:"content/stamp-authorship",
    fields:["headline", "subtext"],
    author:"ai",
  });

  assert.deepEqual(result.document.content.authorship, { headline:"owner", subtext:"ai" });
});

test("palette commands clamp opacity and synchronise explicit pins", () => {
  const before = createDesignDocumentV1();
  const opacityResult = applyDesignCommand(before, { type:"palette/set", field:"backgroundOpacity", value:4 });
  const pinResult = applyDesignCommand(opacityResult.document, {
    type:"palette/sync-pins",
    patch:{ textColorId:true, backdropMode:false },
  });

  assert.equal(opacityResult.document.palette.backgroundOpacity, 1);
  assert.deepEqual(pinResult.document.palette.pins, { textColorId:true });
});

test("transitional persistence adapter round-trips through the migration", () => {
  const doc = createDesignDocumentV1({ headline:"Round trip", bgColor:"wisteria", fieldColorOverride:"celadon", imageSrc:"data:image/png;base64,one-copy" });
  const stored = designDocumentToLegacyFields(doc);
  const restored = migrateDesignDocument(stored);

  assert.deepEqual(restored.content, doc.content);
  assert.deepEqual(restored.palette, doc.palette);
  assert.equal(stored.media.source, undefined);
  assert.equal(stored.imageSrc, "data:image/png;base64,one-copy");
  assert.equal(restored.media.source, doc.media.source);
});

test("future schema versions fail loudly instead of silently corrupting work", () => {
  assert.throws(() => migrateDesignDocument({ schemaVersion:2 }), /Unsupported design document schema version/);
});

test("all planned mutation families have recognised command contracts", () => {
  for (const type of Object.values(DESIGN_COMMAND_TYPES)) {
    assert.equal(isDesignCommand({ type }), true, `${type} should be recognised`);
  }
  assert.equal(isDesignCommand({ type:"unknown/change" }), false);
});

test("migrates legacy typography and per-format role offsets", () => {
  const doc = migrateDesignDocument({
    heroRegister:"serif",
    fontSizes:{ heading:"l" },
    typeLayouts:{ quote:{ x:0.1, y:0.2 } },
    typeLayoutsByDim:{ story:{ quote:{ x:0.2, y:0.3 } } },
    roleOffsetsByDim:{ story:{ quote:{ support:{ dx:0.1, dy:-0.1 } } } },
  });

  assert.equal(doc.typography.heroRegister, "serif");
  assert.equal(doc.typography.masterLayouts.quote.x, 0.1);
  assert.equal(doc.typography.formatLayouts.story.quote.y, 0.3);
  assert.equal(doc.typography.roleOffsetsByFormat.story.quote.support.dx, 0.1);
});

test("globalSizeStep defaults to M and validates as S/M/L (global hierarchical size)", () => {
  const fresh = createDesignDocumentV1();
  assert.equal(fresh.typography.globalSizeStep, "M", "default is M (pixel-invariant)");
  assert.equal(validateDesignDocument(fresh).valid, true);
  // Unknown stored values normalise to M rather than corrupting the document.
  const migrated = migrateDesignDocument({ typography:{ globalSizeStep:"XL" } });
  assert.equal(migrated.typography.globalSizeStep, "M");
  // A hand-corrupted document is rejected by the validator.
  const bad = { ...fresh, typography:{ ...fresh.typography, globalSizeStep:"XL" } };
  assert.equal(validateDesignDocument(bad).valid, false);
});

test("set-global-size-step changes one path, no-ops on same value, one undo (M2)", () => {
  const before = createDesignDocumentV1();
  const toL = applyDesignCommand(before, { type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_GLOBAL_SIZE_STEP, value:"L" });
  assert.equal(toL.document.typography.globalSizeStep, "L");
  assert.deepEqual(toL.changedPaths, ["typography.globalSizeStep"], "exactly one changed path = one undo");
  // Same value is a no-op — no dead undo entry.
  const again = applyDesignCommand(toL.document, { type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_GLOBAL_SIZE_STEP, value:"L" });
  assert.deepEqual(again.changedPaths, [], "same value = no changed path");
  assert.equal(again.document.typography.globalSizeStep, "L");
  // A bogus value normalises to M (never throws, never a silent wrong step).
  const toBogus = applyDesignCommand(toL.document, { type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_GLOBAL_SIZE_STEP, value:"HUGE" });
  assert.equal(toBogus.document.typography.globalSizeStep, "M");
  assert.deepEqual(toBogus.changedPaths, ["typography.globalSizeStep"]);
});

test("globalSizeStep survives the legacy persistence round-trip (nested + flat)", () => {
  const doc = applyDesignCommand(createDesignDocumentV1(), {
    type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_GLOBAL_SIZE_STEP, value:"S",
  }).document;
  const persisted = designDocumentToLegacyFields(doc);
  assert.equal(persisted.typography.globalSizeStep, "S", "nested survives");
  assert.equal(persisted.globalSizeStep, "S", "flat compat field survives");
  assert.equal(migrateDesignDocument(persisted).typography.globalSizeStep, "S", "restores from persistence");
  // A flat-only legacy blob (no nested typography) still restores the step.
  assert.equal(migrateDesignDocument({ globalSizeStep:"L" }).typography.globalSizeStep, "L");
});

test("role-offset commands preserve a frozen solver base and can unpin", () => {
  const before = createDesignDocumentV1();
  const placed = applyDesignCommand(before, {
    type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_ROLE_OFFSET,
    dimensionId:"story",
    postType:"event",
    role:"date",
    dx:0.1,
    dy:0.2,
    bx:0.3,
    by:0.4,
  }).document;
  const moved = applyDesignCommand(placed, {
    type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_ROLE_OFFSET,
    dimensionId:"story",
    postType:"event",
    role:"date",
    dx:0.15,
    dy:0.25,
  }).document;
  const reset = applyDesignCommand(moved, {
    type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_ROLE_OFFSET,
    dimensionId:"story",
    postType:"event",
    role:"date",
    dx:null,
  }).document;

  assert.deepEqual(moved.typography.roleOffsetsByFormat.story.event.date, {
    dx:0.15, dy:0.25, bx:0.3, by:0.4,
  });
  assert.equal(reset.typography.roleOffsetsByFormat.story.event.date, undefined);
});

test("resetting one format removes both its text layouts and role offsets", () => {
  const before = createDesignDocumentV1({
    typeLayoutsByDim:{ story:{ quote:{ x:0.2 } }, banner:{ quote:{ x:0.3 } } },
    roleOffsetsByDim:{ story:{ quote:{ support:{ dx:0.1, dy:0 } } } },
  });
  const result = applyDesignCommand(before, {
    type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_RESET_FORMAT,
    dimensionId:"story",
  });

  assert.equal(result.document.typography.formatLayouts.story, undefined);
  assert.equal(result.document.typography.roleOffsetsByFormat.story, undefined);
  assert.equal(result.document.typography.formatLayouts.banner.quote.x, 0.3);
});

test("migrates legacy serialisable media without storing decoded browser objects", () => {
  const doc = migrateDesignDocument({
    imageSrc:"data:image/png;base64,abc",
    mediaKind:"image",
    photoTreatment:"warmGrade",
    photoFrame:{ type:"card" },
    imgT:{ zoom:1.4, cx:0.4, cy:0.6, rotation:2 },
    imgTByDim:{ story:{ zoom:1.8, cx:0.5, cy:0.4, rotation:0 } },
    photoTouchedByDim:{ story:true },
    imageObj:{ decoded:true },
  });

  assert.equal(doc.media.source, "data:image/png;base64,abc");
  assert.equal(doc.media.masterTransform.zoom, 1.4);
  assert.equal(doc.media.formatPins.story, true);
  assert.equal("imageObj" in doc.media, false);
});

test("a genuinely new media source resets stale transforms atomically", () => {
  const before = createDesignDocumentV1({
    imageSrc:"old.jpg",
    imgT:{ zoom:2, cx:0.2, cy:0.7, rotation:4 },
    imgTByDim:{ banner:{ zoom:3 } },
    photoTouchedByDim:{ banner:true },
  });
  const result = applyDesignCommand(before, {
    type:DESIGN_COMMAND_TYPES.MEDIA_SET_SOURCE,
    source:"new.jpg",
  });

  assert.equal(result.document.media.source, "new.jpg");
  assert.deepEqual(result.document.media.masterTransform, { zoom:1, cx:0.5, cy:0.5, rotation:0 });
  assert.deepEqual(result.document.media.formatTransforms, {});
  assert.deepEqual(result.document.media.formatPins, {});
});

test("decoding or restoring the same source can preserve stored transforms", () => {
  const before = createDesignDocumentV1({ imageSrc:"saved.jpg", imgT:{ zoom:1.7 } });
  const result = applyDesignCommand(before, {
    type:DESIGN_COMMAND_TYPES.MEDIA_SET_SOURCE,
    source:"saved.jpg",
    resetTransforms:false,
  });

  assert.equal(result.document.media.masterTransform.zoom, 1.7);
});

test("media transform commands merge rapid edits and reset one format only", () => {
  const before = createDesignDocumentV1({
    imgTByDim:{ story:{ zoom:1.2, cx:0.5 }, banner:{ zoom:1.4 } },
    photoTouchedByDim:{ story:true, banner:true },
  });
  const moved = applyDesignCommand(before, {
    type:DESIGN_COMMAND_TYPES.MEDIA_MERGE_FORMAT_TRANSFORM,
    dimensionId:"story",
    patch:{ cx:0.7 },
  }).document;
  const reset = applyDesignCommand(moved, {
    type:DESIGN_COMMAND_TYPES.MEDIA_RESET_FORMAT,
    dimensionId:"story",
  }).document;

  assert.equal(moved.media.formatTransforms.story.zoom, 1.2);
  assert.equal(moved.media.formatTransforms.story.cx, 0.7);
  assert.equal(reset.media.formatTransforms.story, undefined);
  assert.equal(reset.media.formatPins.story, undefined);
  assert.equal(reset.media.formatTransforms.banner.zoom, 1.4);
});

test("migrates legacy logo placement and user pins", () => {
  const doc = migrateDesignDocument({ selectedLogoId:"s1-ivory", logoVariantTouched:true, logoHidden:true,
    userLogoTouched:true, logoPosition:"top-right", logoSize:"l", logoFreePos:{x:0.8,y:0.2},
    logoByDim:{ story:{position:"bottom-center",sizeId:"m"} } });
  assert.equal(doc.logo.assetId, "s1-ivory");
  assert.equal(doc.logo.variantPinned, true);
  assert.equal(doc.logo.masterPlacement.position, "top-right");
  assert.equal(doc.logo.formatPlacements.story.position, "bottom-center");
});

test("logo placement commands merge without losing sibling properties", () => {
  const before = createDesignDocumentV1({ logoPosition:"top-left", logoSize:"m" });
  const master = applyDesignCommand(before, { type:DESIGN_COMMAND_TYPES.LOGO_MERGE_MASTER_PLACEMENT, patch:{sizeId:"xl"} }).document;
  const format = applyDesignCommand(master, { type:DESIGN_COMMAND_TYPES.LOGO_MERGE_FORMAT_PLACEMENT,
    dimensionId:"story", base:{position:"bottom-left",sizeId:"m"}, patch:{free:{x:0.4,y:0.7}} }).document;
  assert.equal(master.logo.masterPlacement.position, "top-left");
  assert.equal(master.logo.masterPlacement.sizeId, "xl");
  assert.equal(format.logo.formatPlacements.story.position, "bottom-left");
  assert.deepEqual(format.logo.formatPlacements.story.free, {x:0.4,y:0.7});
});

test("shape migration preserves stable ids and deterministically repairs legacy ids", () => {
  const shapes = normalizeShapeInstances([
    { uid:"ol_saved", assetId:"shape-1" },
    { assetId:"shape-2" },
  ]);
  assert.equal(shapes[0].uid, "ol_saved");
  assert.equal(shapes[1].uid, "shape:shape-2:1");
  assert.deepEqual(normalizeShapeInstances(shapes), shapes);
});

test("shape commands never permit an update to replace identity", () => {
  const before = createDesignDocumentV1({ overlayLayers:[{uid:"ol_1",assetId:"shape-1"}] });
  const result = applyDesignCommand(before, { type:DESIGN_COMMAND_TYPES.SHAPE_UPDATE, uid:"ol_1", patch:{uid:"wrong",mode:"lineart"} });
  assert.equal(result.document.shapes[0].uid, "ol_1");
  assert.equal(result.document.shapes[0].mode, "lineart");
});

test("composition commands replace one field without disturbing provenance", () => {
  const before = createDesignDocumentV1({ postType:"quote", archetypeId:"quote_margin", archVariant:2 });
  const result = applyDesignCommand(before, { type:DESIGN_COMMAND_TYPES.COMPOSITION_SET, field:"postType", value:"event" });
  assert.deepEqual(result.document.composition, {
    postType:"event", archetypeId:"quote_margin", archetypeVariant:2, mediaHostShapeId:null,
  });
});

test("one format reset clears every local design override and ownership marker", () => {
  const before=createDesignDocumentV1({typeLayoutsByDim:{story:{quote:{x:1}}},roleOffsetsByDim:{story:{quote:{hero:{dx:1}}}},imgTByDim:{story:{zoom:2}},photoTouchedByDim:{story:true},logoByDim:{story:{position:"top-left"}},overlayLayers:[{uid:"s",assetId:"shape-1",master:{x:.5},byDim:{story:{x:.2}},touchedByDim:{story:true}}]});
  const applied=applyDesignCommand(before,{type:DESIGN_COMMAND_TYPES.FORMAT_RESET_TO_MASTER,dimensionId:"story"});
  const result=applied.document;
  assert.equal(result.typography.formatLayouts.story,undefined);
  assert.equal(result.typography.roleOffsetsByFormat.story,undefined);
  assert.equal(result.media.formatTransforms.story,undefined);
  assert.equal(result.logo.formatPlacements.story,undefined);
  assert.equal(result.shapes[0].byDim.story,undefined);
  assert.equal(result.shapes[0].touchedByDim.story,undefined);
  const noop=applyDesignCommand(result,{type:DESIGN_COMMAND_TYPES.FORMAT_RESET_TO_MASTER,dimensionId:"story"});
  assert.deepEqual(noop.document,result);
  assert.deepEqual(noop.changedPaths,[]);
});

test("add-element generates a unique uid and reports one changed path (one undo)", () => {
  const before = createDesignDocumentV1();
  const result = applyDesignCommand(before, {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ class:"caption", text:"Doors open 9am" },
  });
  assert.equal(result.document.content.elements.length, 1);
  const added = result.document.content.elements[0];
  assert.equal(added.class, "caption");
  assert.equal(added.text, "Doors open 9am");
  assert.equal(added.authorship, "owner");
  assert.equal(added.required, false);
  assert.equal(typeof added.uid, "string");
  assert.deepEqual(result.changedPaths, [`content.elements.${added.uid}`]);
});

test("add-element with a colliding explicit uid is a safe no-op", () => {
  const seeded = applyDesignCommand(createDesignDocumentV1(), {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ uid:"el_dup", class:"heading", text:"One" },
  }).document;
  const again = applyDesignCommand(seeded, {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ uid:"el_dup", class:"body", text:"Two" },
  });
  assert.equal(again.document.content.elements.length, 1);
  assert.deepEqual(again.changedPaths, []);
});

test("element text/class/priority commands each change exactly one element in one undo", () => {
  const seeded = applyDesignCommand(createDesignDocumentV1(), {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ uid:"el_1", class:"body", text:"draft" },
  }).document;

  const textResult = applyDesignCommand(seeded, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_TEXT, uid:"el_1", value:"final",
  });
  assert.equal(textResult.document.content.elements[0].text, "final");
  assert.deepEqual(textResult.changedPaths, ["content.elements.el_1.text"]);
  // A no-op text set reports nothing (M2 — a visible action that changes nothing is a defect).
  assert.deepEqual(applyDesignCommand(textResult.document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_TEXT, uid:"el_1", value:"final",
  }).changedPaths, []);

  const classResult = applyDesignCommand(textResult.document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_CLASS, uid:"el_1", value:"heading",
  });
  assert.equal(classResult.document.content.elements[0].class, "heading");
  assert.deepEqual(classResult.changedPaths, ["content.elements.el_1.class"]);

  const priorityResult = applyDesignCommand(classResult.document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_PRIORITY, uid:"el_1", value:5,
  });
  assert.equal(priorityResult.document.content.elements[0].priority, 5);
  assert.deepEqual(priorityResult.changedPaths, ["content.elements.el_1.priority"]);
});

test("set-element-size stamps a sanctioned S/M/L step on the element master (one undo)", () => {
  const seeded = applyDesignCommand(createDesignDocumentV1(), {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ uid:"el_1", class:"heading", text:"Hero" },
  }).document;

  const large = applyDesignCommand(seeded, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_SIZE, uid:"el_1", value:"L",
  });
  assert.equal(large.document.content.elements[0].master.sizeStep, "L");
  assert.deepEqual(large.changedPaths, ["content.elements.el_1.master.sizeStep"]);

  // Re-setting the same step, or a non-sanctioned value, changes nothing (M2).
  assert.deepEqual(applyDesignCommand(large.document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_SIZE, uid:"el_1", value:"L",
  }).changedPaths, []);
  assert.deepEqual(applyDesignCommand(large.document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_SIZE, uid:"el_1", value:"XL",
  }).changedPaths, []);
  // The default (no explicit step) reads as "M" — setting "M" on the default is a no-op.
  assert.deepEqual(applyDesignCommand(seeded, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_SIZE, uid:"el_1", value:"M",
  }).changedPaths, []);
});

test("set-element-register pins a sanctioned register; unsanctioned/self are no-ops (Font Ruling B)", () => {
  const seeded = applyDesignCommand(createDesignDocumentV1(), {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ uid:"el_1", class:"heading", text:"Hero" },
  }).document;
  assert.equal(seeded.content.elements[0].register, null);   // default = class default

  // heading sanctions serif|heavySans — pinning heavySans lands, one undo.
  const pinned = applyDesignCommand(seeded, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_REGISTER, uid:"el_1", value:"heavySans",
  });
  assert.equal(pinned.document.content.elements[0].register, "heavySans");
  assert.deepEqual(pinned.changedPaths, ["content.elements.el_1.register"]);

  // Re-pinning the same register is a no-op (M2 — no dead undo).
  assert.deepEqual(applyDesignCommand(pinned.document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_REGISTER, uid:"el_1", value:"heavySans",
  }).changedPaths, []);

  // A register NOT sanctioned for the heading class (eyebrow) is a refusal — no change.
  assert.deepEqual(applyDesignCommand(pinned.document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_REGISTER, uid:"el_1", value:"eyebrow",
  }).changedPaths, []);

  // Junk register value is refused too.
  assert.deepEqual(applyDesignCommand(pinned.document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_REGISTER, uid:"el_1", value:"comic-sans",
  }).changedPaths, []);

  // null clears the pin back to the class default.
  const cleared = applyDesignCommand(pinned.document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_REGISTER, uid:"el_1", value:null,
  });
  assert.equal(cleared.document.content.elements[0].register, null);
  assert.deepEqual(cleared.changedPaths, ["content.elements.el_1.register"]);
});

test("changing an element's class drops a register no longer sanctioned for it (Font Ruling B)", () => {
  const seeded = applyDesignCommand(createDesignDocumentV1(), {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ uid:"el_1", class:"caption", text:"note" },
  }).document;
  // caption sanctions serif|eyebrow — pin eyebrow.
  const pinned = applyDesignCommand(seeded, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_REGISTER, uid:"el_1", value:"eyebrow",
  }).document;
  assert.equal(pinned.content.elements[0].register, "eyebrow");
  // caption → heading: eyebrow is not sanctioned for heading, so the pin is dropped.
  const reclassed = applyDesignCommand(pinned, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_CLASS, uid:"el_1", value:"heading",
  });
  assert.equal(reclassed.document.content.elements[0].class, "heading");
  assert.equal(reclassed.document.content.elements[0].register, null);
});

test("set-element-class rejects a non-sanctioned class and a self no-op", () => {
  const seeded = applyDesignCommand(createDesignDocumentV1(), {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ uid:"el_1", class:"heading", text:"Hero" },
  }).document;
  assert.deepEqual(applyDesignCommand(seeded, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_CLASS, uid:"el_1", value:"banner",
  }).changedPaths, []);
  assert.deepEqual(applyDesignCommand(seeded, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_CLASS, uid:"el_1", value:"heading",
  }).changedPaths, []);
});

test("remove-element deletes exactly the named element", () => {
  const seeded = applyDesignCommand(applyDesignCommand(createDesignDocumentV1(), {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT, element:{ uid:"el_1", class:"body", text:"a" },
  }).document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT, element:{ uid:"el_2", class:"cta", text:"b" },
  }).document;
  const removed = applyDesignCommand(seeded, { type:DESIGN_COMMAND_TYPES.CONTENT_REMOVE_ELEMENT, uid:"el_1" });
  assert.deepEqual(removed.document.content.elements.map(e => e.uid), ["el_2"]);
  assert.deepEqual(removed.changedPaths, ["content.elements.el_1"]);
  // Removing an unknown element is a safe no-op.
  assert.deepEqual(applyDesignCommand(removed.document, {
    type:DESIGN_COMMAND_TYPES.CONTENT_REMOVE_ELEMENT, uid:"ghost",
  }).changedPaths, []);
});

test("legacy content roles migrate into elements, invisibly and idempotently", () => {
  const doc = migrateDesignDocument({
    headline:"Now enrolling", subtext:"Term 3", dateText:"September", pillText:"RSVP",
    copyAuthors:{ headline:"owner" },
  });
  // The legacy fixed roles survive untouched (the renderer still reads them in Slice 1).
  assert.equal(doc.content.headline, "Now enrolling");
  assert.equal(doc.content.pillText, "RSVP");
  // And they are ALSO projected into the dynamic element collection.
  const byRole = Object.fromEntries(doc.content.elements.map(e => [e.sourceRole, e]));
  assert.equal(byRole.headline.class, "heading");
  assert.equal(byRole.headline.authorship, "owner");
  assert.equal(byRole.dateText.class, "caption");
  assert.equal(byRole.pillText.class, "cta");
  // Migrating twice is byte-identical (guard-battery discipline).
  assert.equal(JSON.stringify(migrateDesignDocument(doc)), JSON.stringify(doc));
});

test("added elements survive the legacy persistence round-trip", () => {
  const withElement = applyDesignCommand(createDesignDocumentV1({ headline:"Base" }), {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ uid:"el_added", class:"caption", text:"Free entry" },
  }).document;
  const restored = migrateDesignDocument(designDocumentToLegacyFields(withElement));
  assert.deepEqual(restored.content.elements, withElement.content.elements);
  assert.ok(restored.content.elements.some(e => e.uid === "el_added"));
});

test("equivalent semantic updates report no changed paths", () => {
  const before=createDesignDocumentV1({
    typeLayouts:{event:{x:0.1,y:0.2,width:0.8}},
    typeLayoutsByDim:{story:{event:{x:0.2,y:0.3,width:0.7}}},
    imgT:{zoom:1,cx:0.5,cy:0.5,rotation:0},
    imgTByDim:{story:{zoom:1.2,cx:0.5,cy:0.5,rotation:0}},
    logoPosition:"top-left",
    overlayLayers:[{uid:"s",assetId:"shape-1",master:{x:.5,y:.5},byDim:{}}],
    furnitureOverrides:{rule:{color:"sage"}},
  });
  const commands=[
    {type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_MERGE_MASTER_LAYOUT,postType:"event",patch:{x:0.1}},
    {type:DESIGN_COMMAND_TYPES.TYPOGRAPHY_SET_FORMAT_LAYOUT,dimensionId:"story",postType:"event",patch:{y:0.3}},
    {type:DESIGN_COMMAND_TYPES.MEDIA_MERGE_MASTER_TRANSFORM,patch:{zoom:1}},
    {type:DESIGN_COMMAND_TYPES.MEDIA_MERGE_FORMAT_TRANSFORM,dimensionId:"story",patch:{zoom:1.2}},
    {type:DESIGN_COMMAND_TYPES.LOGO_MERGE_MASTER_PLACEMENT,patch:{position:"top-left"}},
    {type:DESIGN_COMMAND_TYPES.SHAPE_UPDATE,uid:"s",patch:{mode:"frame"}},
    {type:DESIGN_COMMAND_TYPES.SHAPE_UPDATE_TRANSFORM,uid:"s",isMaster:true,patch:{x:0.5}},
    {type:DESIGN_COMMAND_TYPES.FURNITURE_UPDATE,key:"rule",patch:{color:"sage"}},
  ];
  for (const command of commands) {
    assert.deepEqual(applyDesignCommand(before,command).changedPaths,[],command.type);
  }
});
