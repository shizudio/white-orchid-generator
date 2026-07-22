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
