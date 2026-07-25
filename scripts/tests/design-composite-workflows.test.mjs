import test from "node:test";
import assert from "node:assert/strict";
import { applyDesignCommand, createDesignDocumentV1, hasUserFormatOverride } from "../../lib/design-document.mjs";
import { mergeOwnerAuthoredContent, planArchetypeMaterializationWorkflow, planCopyAuthorshipWorkflow, planFormatResetWorkflow, planFurniturePatchWorkflow, planLogoPatchWorkflow, planMediaSourceWorkflow, planPalettePinWorkflow, planPhotoTransformWorkflow, planShapeCollectionWorkflow, planShapeMutationWorkflow, planShapePatchWorkflow, planSnapshotRestoreWorkflow, planTemplateApplicationWorkflow, planTypographyPlacementWorkflow, shouldCommitPatchHistory } from "../../lib/design-composite-workflows.mjs";

const applyGroups = (document, groups) => groups.reduce(
  (current, workflowGroup) => workflowGroup.commands.reduce(
    (next, command) => applyDesignCommand(next, command).document,
    current,
  ),
  document,
);

const logoContext = overrides => ({
  patch:{},
  current:{ assetId:"p3-ivory", position:"bottom-center", sizeId:"m", hidden:false },
  rendered:{ position:"bottom-center", drawn:true },
  dimensionId:"ig_square",
  masterDimensionId:"ig_square",
  ...overrides,
});

test("authorship and palette pin metadata use named workflows",()=>{
  const authorship=planCopyAuthorshipWorkflow({fields:["headline"],author:"owner"});
  const pinned=planPalettePinWorkflow({patch:{textColorId:"whiteSmoke",backdropMode:"auto"}});
  const after=applyGroups(createDesignDocumentV1(),[...authorship,...pinned]);
  assert.equal(after.content.authorship.headline,"owner");
  assert.deepEqual(after.palette.pins,{textColorId:true});
  assert.deepEqual(authorship[0].changedFields,[]);
  assert.deepEqual(pinned[0].changedFields,["palettePins"]);
});

test("a human logo variant choice pins the variant and declares its inspector effect", () => {
  const groups = planLogoPatchWorkflow(logoContext({ patch:{ logoId:"s1-green" } }));
  const after = applyGroups(createDesignDocumentV1(), groups);

  assert.deepEqual(groups[0].changedFields, ["logoId"]);
  assert.deepEqual(groups[0].effects, [{ type:"select-logo-tab", value:"secondary" }]);
  assert.equal(after.logo.assetId, "s1-green");
  assert.equal(after.logo.variantPinned, true);
});

test("system logo placement stays unpinned while a human master placement is pinned", () => {
  const systemGroups = planLogoPatchWorkflow(logoContext({
    patch:{ logoPosition:"top-left" }, systemFreeVariables:true,
  }));
  const humanGroups = planLogoPatchWorkflow(logoContext({ patch:{ logoPosition:"top-left" } }));
  const system = applyGroups(createDesignDocumentV1(), systemGroups);
  const human = applyGroups(createDesignDocumentV1(), humanGroups);

  assert.equal(system.logo.masterPlacement.position, "top-left");
  assert.equal(system.logo.placementPinned, false);
  assert.equal(human.logo.masterPlacement.position, "top-left");
  assert.equal(human.logo.placementPinned, true);
});

test("non-master UI placement writes a local override and mirrors the master without globally pinning", () => {
  const groups = planLogoPatchWorkflow(logoContext({
    patch:{ logoPosition:"mid-right", logoSize:"l" },
    dimensionId:"story",
    uiSource:true,
  }));
  const after = applyGroups(createDesignDocumentV1(), groups);

  assert.deepEqual(after.logo.masterPlacement, { position:"mid-right", sizeId:"l", free:null });
  assert.deepEqual(after.logo.formatPlacements.story, { position:"mid-right", sizeId:"l" });
  assert.equal(after.logo.placementPinned, false);
});

test("free logo positions clamp and adding a hidden logo back pins it visible", () => {
  const before = createDesignDocumentV1({ logoHidden:true });
  const groups = planLogoPatchWorkflow(logoContext({
    patch:{ logoFree:{ x:-2, y:3 }, hideLogo:false },
    current:{ assetId:"p3-ivory", position:"bottom-center", sizeId:"m", hidden:true },
  }));
  const after = applyGroups(before, groups);

  assert.deepEqual(after.logo.masterPlacement.free, { x:0, y:1 });
  assert.equal(after.logo.hidden, false);
  assert.equal(after.logo.placementPinned, true);
});

test("remove plus add is atomic and cannot resurrect stale shapes", () => {
  const currentShapes = [
    { uid:"old-a", assetId:"shape-1", mode:"overlay", master:{} },
    { uid:"old-b", assetId:"shape-2", mode:"overlay", master:{} },
  ];
  const groups = planShapePatchWorkflow({
    patch:{ removeOverlays:true, addOverlay:{ assetId:"shape-3", mode:"frame" } },
    currentShapes,
    resolvedAsset:{ id:"shape-3" },
    suggestedTransform:{ x:0.5, y:0.5, scale:0.4 },
    uid:"new-shape",
    uiSource:false,
  });
  const after = applyGroups(createDesignDocumentV1({ overlayLayers:currentShapes }), groups);

  assert.deepEqual(after.shapes.map(shape => shape.uid), ["new-shape"]);
  assert.equal(after.shapes[0].mode, "frame");
});

test("UI shape additions retain existing instances, offset duplicates, and request selection", () => {
  const groups = planShapePatchWorkflow({
    patch:{ addOverlay:{ assetId:"shape-1", mode:"overlay" } },
    currentShapes:[{ uid:"old", assetId:"shape-1", mode:"overlay", master:{} }],
    resolvedAsset:{ id:"shape-1" },
    suggestedTransform:{ x:0.5, y:0.5, scale:0.2 },
    uid:"new",
    uiSource:true,
  });

  assert.equal(groups[0].commands.length, 1);
  assert.deepEqual(groups[0].commands[0].shape.master, { x:0.56, y:0.56, scale:0.2 });
  assert.deepEqual(groups[0].effects, [{ type:"select-shape", uid:"new" }]);
});

test("shape collection import replaces through one canonical command and clears selection", () => {
  const imported=[{uid:"imported",assetId:"shape-2",mode:"overlay",master:{x:0.4},byDim:{}}];
  const groups=planShapeCollectionWorkflow({patch:{replaceShapeCollection:imported}});
  const after=applyGroups(createDesignDocumentV1({overlayLayers:[
    {uid:"old",assetId:"shape-1",mode:"frame",master:{},byDim:{}},
  ]}),groups);

  assert.deepEqual(after.shapes.map(shape=>shape.uid),["imported"]);
  assert.deepEqual(groups[0].effects,[{type:"clear-shape-selection"}]);
  assert.deepEqual(planShapeCollectionWorkflow({patch:{replaceShapeCollection:"invalid"}}),[]);
});

test("media source workflows separate serialisable commands from decode effects", () => {
  const groups=planMediaSourceWorkflow({patch:{imageSrc:"data:image/png;base64,new"}});
  const after=applyGroups(createDesignDocumentV1(),groups);
  assert.equal(after.media.source,"data:image/png;base64,new");
  assert.equal(after.media.kind,"image");
  assert.deepEqual(groups[0].effects,[{type:"remove-video"},{type:"decode-image",source:"data:image/png;base64,new"}]);
});

test("remove media wins over a contradictory source and cancels decoded state", () => {
  const groups=planMediaSourceWorkflow({patch:{imageSrc:"stale",removeImage:true}});
  const after=applyGroups(createDesignDocumentV1({imageSrc:"old"}),groups);
  assert.equal(after.media.source,null);
  assert.deepEqual(groups[0].changedFields,["removeImage"]);
  assert.deepEqual(groups[0].effects,[{type:"remove-video"},{type:"clear-decoded-image"}]);
});

const archetypeMaterialized = overrides => ({
  postType:"event",
  bg:"sage",
  register:"heavySans",
  microLabel:"TERM 3",
  photoTreatment:"wash",
  photoFrame:{ type:"none" },
  layout:{ x:0.1, y:0.2, width:0.72, roles:{ hero:{ x:0.1, y:0.2, w:0.72 } } },
  layoutShapeLayer:{
    uid:"incoming-frame", assetId:"shape-2", mode:"frame", origin:"layout",
    master:{ x:0.5, y:0.5, scale:0.7 }, byDim:{},
  },
  motifLayers:[{
    uid:"incoming-motif", assetId:"acc-spark", mode:"overlay", motif:true,
    master:{ x:0.85, y:0.15, scale:0.1 }, byDim:{},
  }],
  ...overrides,
});

test("archetype materialization resets system-owned layout state through one command plan", () => {
  const before=createDesignDocumentV1({
    bgColor:"burnham",
    fieldColorOverride:"butter",
    textColorId:"burnham",
    backdropMode:"solid",
    userLogoTouched:true,
    microLabel:"OLD",
    pillText:"OLD PILL",
    typeLayoutsByDim:{story:{event:{x:0.8}}},
    roleOffsetsByDim:{story:{event:{hero:{dx:0.2,dy:0.1}}}},
    photoTouchedByDim:{story:true},
    imgTByDim:{story:{zoom:2,cx:0.2,cy:0.4,rotation:0}},
    pinnedProps:{textColorId:true},
    furnitureOverrides:{"item:0":{hidden:true}},
  });
  const groups=planArchetypeMaterializationWorkflow({
    archetypeId:"arch-editorial",
    variant:2,
    materialized:archetypeMaterialized(),
    currentShapes:before.shapes,
    typeLayoutDefault:{x:0.08,y:0.18,width:0.8},
  });
  const after=applyGroups(before,groups);

  assert.equal(after.composition.archetypeId,"arch-editorial");
  assert.equal(after.composition.archetypeVariant,2);
  assert.equal(after.palette.background,"sage");
  assert.equal(after.palette.field,null);
  assert.equal(after.palette.text,"auto");
  assert.equal(after.palette.backdrop,"auto");
  assert.deepEqual(after.palette.pins,{});
  assert.equal(after.logo.variantPinned,false);
  assert.equal(after.content.microLabel,"TERM 3");
  assert.equal(after.content.pillText,null);
  assert.equal(after.typography.heroRegister,"heavySans");
  assert.deepEqual(after.typography.formatLayouts,{});
  assert.deepEqual(after.typography.roleOffsetsByFormat,{});
  assert.deepEqual(after.media.formatPins,{});
  assert.deepEqual(after.media.formatTransforms,{});
  assert.deepEqual(after.furniture.overrides,{});
  assert.deepEqual(after.shapes.map(shape=>shape.uid),["incoming-frame","incoming-motif"]);
  assert.deepEqual(groups[0].effects,[{type:"clear-shape-selection"}]);
});

test("archetype swaps preserve user shapes and a touched layout frame wins over the incoming frame", () => {
  const currentShapes=[
    {uid:"old-motif",assetId:"shape-1",mode:"overlay",motif:true,master:{},byDim:{}},
    {uid:"old-free-layout",assetId:"shape-1",mode:"frame",origin:"layout",master:{},byDim:{}},
    {uid:"pinned-frame",assetId:"shape-3",mode:"frame",origin:"layout",userTouched:true,master:{},byDim:{}},
    {uid:"user-shape",assetId:"shape-2",mode:"overlay",master:{},byDim:{}},
  ];
  const groups=planArchetypeMaterializationWorkflow({
    archetypeId:"arch-cutout",
    materialized:archetypeMaterialized(),
    currentShapes,
  });
  const after=applyGroups(createDesignDocumentV1({overlayLayers:currentShapes}),groups);

  assert.deepEqual(after.shapes.map(shape=>shape.uid),["pinned-frame","user-shape","incoming-motif"]);
  assert.equal(after.shapes.some(shape=>shape.uid==="incoming-frame"),false);
});

test("an untouched layout frame is replaced by the incoming archetype frame", () => {
  const currentShapes=[
    {uid:"old-frame",assetId:"shape-1",mode:"frame",origin:"layout",master:{},byDim:{}},
    {uid:"user-shape",assetId:"shape-2",mode:"overlay",master:{},byDim:{}},
  ];
  const after=applyGroups(createDesignDocumentV1({overlayLayers:currentShapes}),
    planArchetypeMaterializationWorkflow({
      archetypeId:"arch-cutout",
      materialized:archetypeMaterialized(),
      currentShapes,
    }));

  assert.deepEqual(after.shapes.map(shape=>shape.uid),["user-shape","incoming-frame","incoming-motif"]);
});

test("the none sentinel only clears archetype provenance and its variant", () => {
  const before=createDesignDocumentV1({
    archetypeId:"arch-cutout", archVariant:4, bgColor:"sage", headline:"Keep me",
    overlayLayers:[{uid:"user-shape",assetId:"shape-2",mode:"overlay",master:{},byDim:{}}],
  });
  const after=applyGroups(before,planArchetypeMaterializationWorkflow({archetypeId:"none"}));

  assert.equal(after.composition.archetypeId,null);
  assert.equal(after.composition.archetypeVariant,0);
  assert.equal(after.palette.background,before.palette.background);
  assert.equal(after.content.headline,"Keep me");
  assert.deepEqual(after.shapes,before.shapes);
});

test("snapshot restore replaces the canonical document atomically and declares transient UI work", () => {
  const restored=createDesignDocumentV1({
    headline:"Restored",
    selectedLogoId:"s1-green",
    image:"data:image/png;base64,restored",
    imgT:{zoom:1.7,cx:0.3,cy:0.6,rotation:0},
  });
  const groups=planSnapshotRestoreWorkflow({snapshot:{
    designDocument:restored,
    dimensionId:"story",
    markTab:"secondary",
  }});
  const after=applyGroups(createDesignDocumentV1({headline:"Current"}),groups);

  assert.equal(groups.length,1);
  assert.equal(groups[0].commands.length,1);
  assert.equal(groups[0].commands[0].type,"document/replace");
  assert.deepEqual(after,restored);
  assert.deepEqual(groups[0].effects,[
    {type:"select-dimension",value:"story"},
    {type:"clear-shape-selection"},
    {type:"select-logo-tab",value:"secondary"},
    {type:"decode-image",source:"data:image/png;base64,restored"},
    {type:"clear-photo-selection"},
  ]);
});

test("legacy undo snapshots migrate once and empty media cancels stale decoded images", () => {
  const groups=planSnapshotRestoreWorkflow({snapshot:{
    postType:"quote",
    headline:"Legacy",
    bgColor:"wisteria",
    selectedLogoId:"p3-ivory",
    image:null,
    pinnedProps:{textColorId:true},
  }});
  const after=applyGroups(createDesignDocumentV1(),groups);

  assert.equal(after.composition.postType,"quote");
  assert.equal(after.content.headline,"Legacy");
  assert.equal(after.palette.background,"wisteria");
  assert.deepEqual(after.palette.pins,{textColorId:true});
  assert.deepEqual(groups[0].effects,[
    {type:"clear-shape-selection"},
    {type:"select-logo-tab",value:"primary"},
    {type:"clear-decoded-image"},
    {type:"clear-photo-selection"},
  ]);
});

test("missing snapshots produce no restore commands or effects", () => {
  assert.deepEqual(planSnapshotRestoreWorkflow({snapshot:null}),[]);
});

test("a master photo reframe pins and updates through one workflow", () => {
  const groups=planPhotoTransformWorkflow({
    patch:{zoom:1.8,cx:0.35,ignored:"no"},
    dimensionId:"ig_portrait",
    masterDimensionId:"ig_portrait",
    renderedTransform:{zoom:1.3,cx:0.4,cy:0.6,rotation:2},
    masterTransform:{zoom:1,cx:0.5,cy:0.5,rotation:0},
  });
  const after=applyGroups(createDesignDocumentV1(),groups);

  assert.deepEqual(groups[0].changedFields,["photoTransform"]);
  assert.equal(after.media.formatPins.ig_portrait,true);
  assert.deepEqual(after.media.masterTransform,{zoom:1.8,cx:0.35,cy:0.6,rotation:2});
});

test("a format photo reframe seeds from rendered truth and leaves master unchanged", () => {
  const before=createDesignDocumentV1({imgT:{zoom:1.1,cx:0.5,cy:0.5,rotation:0}});
  const groups=planPhotoTransformWorkflow({
    patch:{cy:0.28},
    dimensionId:"story",
    masterDimensionId:"ig_portrait",
    renderedTransform:{zoom:1.6,cx:0.42,cy:0.55,rotation:-3},
    masterTransform:before.media.masterTransform,
  });
  const after=applyGroups(before,groups);

  assert.deepEqual(after.media.masterTransform,before.media.masterTransform);
  assert.equal(after.media.formatPins.story,true);
  assert.deepEqual(after.media.formatTransforms.story,{zoom:1.6,cx:0.42,cy:0.28,rotation:-3});
});

test("masked and card photo windows enforce cover zoom in stored state", () => {
  for (const windowKind of ["mask","card"]) {
    const after=applyGroups(createDesignDocumentV1(),planPhotoTransformWorkflow({
      patch:{zoom:0.2},
      dimensionId:"ig_portrait",
      masterDimensionId:"ig_portrait",
      renderedTransform:{zoom:1,cx:0.5,cy:0.5,rotation:0},
      masterTransform:{zoom:1,cx:0.5,cy:0.5,rotation:0},
      windowKind,
    }));
    assert.equal(after.media.masterTransform.zoom,1);
  }
});

test("invalid photo transform patches emit no mutation group", () => {
  assert.deepEqual(planPhotoTransformWorkflow({
    patch:{zoom:"large"},dimensionId:"story",masterDimensionId:"ig_portrait",
  }),[]);
});

test("a materialized template restores exactly, including explicit logo ownership", () => {
  const saved=createDesignDocumentV1({
    headline:"Exact template",
    archetypeId:"arch-editorial",
    logoVariantTouched:true,
    selectedLogoId:"s1-green",
    typeLayouts:{event:{roles:{hero:{x:0.1,y:0.2,w:0.7}}}},
  });
  const groups=planTemplateApplicationWorkflow({
    document:saved,
    metadata:{dimensionId:"facebook",exportFormat:"jpeg"},
    acknowledgements:{"known:key":{issueId:"known"}},
    archetypeId:"arch-editorial",
    alreadyMaterialized:true,
  });
  const after=applyGroups(createDesignDocumentV1(),groups);

  assert.deepEqual(after,saved);
  assert.equal(after.logo.variantPinned,true);
  assert.deepEqual(groups[0].effects,[
    {type:"select-dimension",value:"facebook"},
    {type:"select-export-format",value:"jpeg"},
    {type:"clear-editor-selection"},
    {type:"remove-video"},
    {type:"clear-decoded-image"},
    {type:"select-logo-tab",value:"secondary"},
    {type:"set-acknowledgements",value:{"known:key":{issueId:"known"}}},
    {type:"set-overlay-clean"},
  ]);
});

test("legacy templates materialize through the canonical shape ownership law", () => {
  const shapes=[
    {uid:"old-motif",assetId:"shape-1",mode:"overlay",motif:true,master:{},byDim:{}},
    {uid:"old-layout",assetId:"shape-1",mode:"frame",origin:"layout",master:{},byDim:{}},
    {uid:"user-shape",assetId:"shape-2",mode:"overlay",master:{},byDim:{}},
  ];
  const saved=createDesignDocumentV1({
    postType:"event",archetypeId:"arch-cutout",archVariant:1,overlayLayers:shapes,
  });
  const groups=planTemplateApplicationWorkflow({
    document:saved,
    archetypeId:"arch-cutout",
    variant:1,
    materialized:archetypeMaterialized(),
    alreadyMaterialized:false,
    typeLayoutDefault:{x:0.08,y:0.18,width:0.8},
  });
  const after=applyGroups(createDesignDocumentV1(),groups);

  assert.deepEqual(after.shapes.map(shape=>shape.uid),["user-shape","incoming-frame","incoming-motif"]);
  assert.equal(after.composition.archetypeId,"arch-cutout");
  assert.equal(after.composition.archetypeVariant,1);
  assert.ok(after.typography.masterLayouts.event.roles);
});

// (BUG 2) A template swap must adapt to work in progress, not discard it.
const editedInProgressDocument = () => createDesignDocumentV1({
  headline:"Owner headline",
  subtext:"Owner subtext",
  attribution:"AI attribution",
  copyAuthors:{ headline:"owner", subtext:"owner", attribution:"ai" },
  textColorId:"tangerine",
  pinnedProps:{ textColorId:true },
  selectedLogoId:"s1-green",
  logoVariantTouched:true,
  bgColor:"burnham",
  elements:[
    { uid:"el_body_owner", class:"body", text:"My added note", authorship:"owner", priority:30 },
  ],
});

const incomingTemplateDocument = () => createDesignDocumentV1({
  headline:"Template headline",
  subtext:"Template subtext",
  attribution:"Template attribution",
  copyAuthors:{ headline:"ai", subtext:"ai", attribution:"ai" },
  textColorId:"ivory",
  bgColor:"sage",
  selectedLogoId:"p3-ivory",
  elements:[
    { uid:"el_heading_tpl", class:"heading", text:"Template heading", authorship:"ai" },
  ],
});

test("template merge preserves owner copy, added elements, and pins", () => {
  const merged=mergeOwnerAuthoredContent({
    template:incomingTemplateDocument(),
    current:editedInProgressDocument(),
  });

  // Owner-typed copy survives; owner authorship is retained.
  assert.equal(merged.content.headline,"Owner headline");
  assert.equal(merged.content.subtext,"Owner subtext");
  assert.equal(merged.content.authorship.headline,"owner");
  // AI-authored copy is a free variable the template may replace.
  assert.equal(merged.content.attribution,"Template attribution");
  // Owner-added text element survives; the template's own element is also kept.
  const uids=merged.content.elements.map(element=>element.uid);
  assert.ok(uids.includes("el_body_owner"),"owner element survives");
  assert.ok(uids.includes("el_heading_tpl"),"template element retained");
  // A pinned contrast field keeps the owner's value; the pin itself survives.
  assert.equal(merged.palette.text,"tangerine");
  assert.equal(merged.palette.pins.textColorId,true);
  // A pinned logo variant survives.
  assert.equal(merged.logo.assetId,"s1-green");
  assert.equal(merged.logo.variantPinned,true);
  // Unpinned palette (a system proposal) comes from the template.
  assert.equal(merged.palette.background,"sage");
});

test("template merge without a current document is a straight template load", () => {
  const template=incomingTemplateDocument();
  assert.deepEqual(mergeOwnerAuthoredContent({template,current:null}),template);
});

test("planTemplateApplicationWorkflow keeps owner content when a current document is supplied", () => {
  const groups=planTemplateApplicationWorkflow({
    document:incomingTemplateDocument(),
    currentDocument:editedInProgressDocument(),
    metadata:{dimensionId:"ig_square",exportFormat:"png"},
    alreadyMaterialized:true,
  });
  const after=applyGroups(createDesignDocumentV1(),groups);

  assert.equal(after.content.headline,"Owner headline");
  assert.equal(after.content.attribution,"Template attribution");
  assert.ok(after.content.elements.some(element=>element.uid==="el_body_owner"));
  assert.equal(after.palette.text,"tangerine");
  assert.equal(after.logo.assetId,"s1-green");
});

test("planTemplateApplicationWorkflow without a current document replaces wholesale (legacy path)", () => {
  const template=incomingTemplateDocument();
  const groups=planTemplateApplicationWorkflow({ document:template, alreadyMaterialized:true });
  const after=applyGroups(editedInProgressDocument(),groups);

  assert.equal(after.content.headline,"Template headline");
  assert.equal(after.content.attribution,"Template attribution");
});

test("shape edits pin generated layout ownership and one format before updating", () => {
  const before=createDesignDocumentV1({overlayLayers:[{
    uid:"layout-frame",assetId:"shape-1",mode:"frame",origin:"layout",
    master:{x:0.5,y:0.5,scale:0.7,rotation:0,opacity:1},byDim:{},
  }]});
  const groups=planShapeMutationWorkflow({
    patch:{overlayUpdate:{
      uid:"layout-frame",
      transform:{x:0.62,rotation:12},
      mode:"outline",
      style:{outlineColor:"sage"},
    }},
    currentShapes:before.shapes,
    dimensionId:"story",
    masterDimensionId:"ig_portrait",
    transformBase:{x:0.5,y:0.5,scale:0.7,rotation:0,opacity:1},
  });
  const after=applyGroups(before,groups);
  const shape=after.shapes[0];

  assert.equal(shape.userTouched,true);
  assert.equal(shape.touchedByDim.story,true);
  assert.equal(shape.mode,"outline");
  assert.equal(shape.outlineColor,"sage");
  assert.equal(shape.outlineWidth,0.08);
  assert.deepEqual(shape.byDim.story,{x:0.62,y:0.5,scale:0.7,rotation:12,opacity:1});
  assert.deepEqual(groups[0].effects,[{type:"set-overlay-dirty"}]);
});

test("shape reset restores the supplied master placement and reset wins over an update", () => {
  const before=createDesignDocumentV1({overlayLayers:[{
    uid:"shape-a",assetId:"shape-1",mode:"overlay",
    master:{x:0.8,y:0.7,scale:1.2,rotation:24,opacity:0.4},byDim:{},
  }]});
  const reset={x:0.5,y:0.5,scale:0.6,rotation:0,opacity:1};
  const groups=planShapeMutationWorkflow({
    patch:{
      resetOverlay:{uid:"shape-a",masterTransform:reset},
      overlayUpdate:{uid:"shape-a",transform:{x:0.9}},
    },
    currentShapes:before.shapes,
    dimensionId:"ig_portrait",
    masterDimensionId:"ig_portrait",
  });
  const after=applyGroups(before,groups);

  assert.deepEqual(after.shapes[0].master,reset);
  assert.deepEqual(groups[0].changedFields,["resetOverlay"]);
  assert.deepEqual(groups[0].effects,[{type:"set-overlay-dirty"}]);
  assert.equal(groups.length,1);
});

test("format shape reset removes both its placement and stale ownership pin", () => {
  const before=createDesignDocumentV1({overlayLayers:[{
    uid:"layout-frame",assetId:"shape-1",mode:"frame",origin:"layout",userTouched:true,
    master:{x:0.5,y:0.5,scale:0.7,rotation:0,opacity:1},
    byDim:{story:{x:0.6,y:0.4,scale:0.8,rotation:3,opacity:1}},
    touchedByDim:{story:true},
  }]});
  const groups=planShapeMutationWorkflow({
    patch:{resetOverlay:{uid:"layout-frame"}},
    currentShapes:before.shapes,
    dimensionId:"story",
    masterDimensionId:"ig_portrait",
  });
  const after=applyGroups(before,groups);

  assert.equal(after.shapes[0].byDim.story,undefined);
  assert.equal(after.shapes[0].touchedByDim.story,undefined);
  assert.deepEqual(planShapeMutationWorkflow({
    patch:{resetOverlay:{uid:"layout-frame"}},
    currentShapes:after.shapes,
    dimensionId:"story",
    masterDimensionId:"ig_portrait",
  }),[]);
});

test("shape removal declares selection cleanup and promotes the next media host", () => {
  const before=createDesignDocumentV1({
    overlayLayers:[
      {uid:"frame-a",assetId:"shape-1",mode:"frame",master:{},byDim:{}},
      {uid:"frame-b",assetId:"shape-2",mode:"frame",master:{},byDim:{}},
    ],
    mediaHostShapeId:"frame-b",
  });
  const groups=planShapeMutationWorkflow({
    patch:{removeOverlay:"frame-b"},
    currentShapes:before.shapes,
    currentMediaHostShapeId:"frame-b",
    dimensionId:"ig_portrait",
    masterDimensionId:"ig_portrait",
  });
  const after=applyGroups(before,groups);

  assert.deepEqual(after.shapes.map(shape=>shape.uid),["frame-a"]);
  assert.equal(after.composition.mediaHostShapeId,"frame-a");
  assert.deepEqual(groups[0].effects,[
    {type:"clear-shape-selection-if",uid:"frame-b"},
    {type:"set-overlay-dirty"},
  ]);
});

test("media host promotion is idempotent and pins a generated target", () => {
  const before=createDesignDocumentV1({overlayLayers:[{
    uid:"layout-shape",assetId:"shape-1",mode:"overlay",origin:"layout",master:{},byDim:{},
  }]});
  const groups=planShapeMutationWorkflow({
    patch:{mediaHostShapeId:"layout-shape"},
    currentShapes:before.shapes,
    currentMediaHostShapeId:null,
    masterDimensionId:"ig_portrait",
  });
  const after=applyGroups(before,groups);

  assert.equal(after.shapes[0].userTouched,true);
  assert.equal(after.shapes[0].mode,"frame");
  assert.equal(after.composition.mediaHostShapeId,"layout-shape");
  assert.deepEqual(planShapeMutationWorkflow({
    patch:{mediaHostShapeId:"layout-shape"},
    currentShapes:after.shapes,
    currentMediaHostShapeId:"layout-shape",
    masterDimensionId:"ig_portrait",
  }),[]);
});

test("furniture workflow validates brand colors and clamps authored width", () => {
  const groups=planFurniturePatchWorkflow({
    patch:{furnitureUpdate:{key:"furn_rule_0",hidden:false,color:"sage",widthScale:9}},
    validColorIds:["sage","burnham"],
  });
  const after=applyGroups(createDesignDocumentV1({
    furnitureOverrides:{furn_rule_0:{hidden:true,color:"burnham"}},
  }),groups);

  assert.deepEqual(after.furniture.overrides.furn_rule_0,{color:"sage",widthScale:3});
  assert.deepEqual(planFurniturePatchWorkflow({
    patch:{furnitureUpdate:{key:"furn_rule_0",color:"not-a-token"}},
    validColorIds:["sage"],
  }),[]);
});

test("master and format text boxes compile to the correct responsive command", () => {
  const masterGroups=planTypographyPlacementWorkflow({
    patch:{textLayout:{x:0.16,y:0.24,width:0.68,align:"right",ignored:4}},
    dimensionId:"ig_portrait",
    masterDimensionId:"ig_portrait",
    postType:"event",
    defaultLayout:{x:0.08,y:0.18,width:0.8,roles:{hero:{x:0.08,y:0.18,w:0.8}}},
  });
  const master=applyGroups(createDesignDocumentV1(),masterGroups);
  assert.equal(master.typography.masterLayouts.event.x,0.16);
  assert.equal(master.typography.masterLayouts.event.align,"right");

  const resolved={x:0.2,y:0.3,width:0.6,roles:{hero:{x:0.2,y:0.3,w:0.6}}};
  const formatGroups=planTypographyPlacementWorkflow({
    patch:{textLayout:{y:0.4}},
    dimensionId:"story",
    masterDimensionId:"ig_portrait",
    postType:"event",
    resolvedLayout:resolved,
  });
  const format=applyGroups(master,formatGroups);
  assert.deepEqual(format.typography.formatLayouts.story.event,{...resolved,y:0.4});
});

test("text reset restores the master default and removes a format override", () => {
  const authored=createDesignDocumentV1({
    typeLayouts:{event:{x:0.2,y:0.3,width:0.6}},
    typeLayoutsByDim:{story:{event:{x:0.1,y:0.5,width:0.8}}},
  });
  const defaultLayout={x:0.08,y:0.18,width:0.8,align:"left"};
  const masterGroups=planTypographyPlacementWorkflow({
    patch:{resetTextLayout:true,textLayout:{x:0.9}},
    dimensionId:"ig_portrait",masterDimensionId:"ig_portrait",postType:"event",
    defaultLayout,
  });
  const master=applyGroups(authored,masterGroups);
  assert.deepEqual(master.typography.masterLayouts.event,defaultLayout);
  assert.equal(masterGroups.length,1);

  const formatGroups=planTypographyPlacementWorkflow({
    patch:{resetTextLayout:true},
    dimensionId:"story",masterDimensionId:"ig_portrait",postType:"event",
    defaultLayout,
  });
  const format=applyGroups(master,formatGroups);
  assert.equal(format.typography.formatLayouts.story.event,undefined);
});

test("role placement freezes its solver base, preserves it, and clears explicitly", () => {
  const firstGroups=planTypographyPlacementWorkflow({
    patch:{roleOffset:{role:"date",dx:0.1,dy:-0.05,bx:0.35,by:0.7}},
    dimensionId:"story",masterDimensionId:"ig_portrait",postType:"event",
  });
  const first=applyGroups(createDesignDocumentV1(),firstGroups);
  assert.deepEqual(first.typography.roleOffsetsByFormat.story.event.date,
    {dx:0.1,dy:-0.05,bx:0.35,by:0.7});

  const secondGroups=planTypographyPlacementWorkflow({
    patch:{roleOffset:{role:"date",dx:0.2,dy:0.1}},
    dimensionId:"story",masterDimensionId:"ig_portrait",postType:"event",
    roleOffsetsByFormat:first.typography.roleOffsetsByFormat,
  });
  const second=applyGroups(first,secondGroups);
  assert.deepEqual(second.typography.roleOffsetsByFormat.story.event.date,
    {dx:0.2,dy:0.1,bx:0.35,by:0.7});

  const clearGroups=planTypographyPlacementWorkflow({
    patch:{roleOffset:{role:"date",clear:true}},
    dimensionId:"story",masterDimensionId:"ig_portrait",postType:"event",
    roleOffsetsByFormat:second.typography.roleOffsetsByFormat,
  });
  const cleared=applyGroups(second,clearGroups);
  assert.equal(cleared.typography.roleOffsetsByFormat.story.event.date,undefined);
  assert.deepEqual(planTypographyPlacementWorkflow({
    patch:{roleOffset:{role:"date",clear:true}},
    dimensionId:"story",masterDimensionId:"ig_portrait",postType:"event",
  }),[]);
});

test("an additive roleOffset delta (remedy move-clear) sums onto the stored offset and keeps the pin", () => {
  const seeded=applyGroups(createDesignDocumentV1(),planTypographyPlacementWorkflow({
    patch:{roleOffset:{role:"eyebrow",dx:0.15,dy:0.2,bx:0.3,by:0.4}},
    dimensionId:"story",masterDimensionId:"ig_portrait",postType:"event",
  }));
  const addGroups=planTypographyPlacementWorkflow({
    patch:{roleOffset:{role:"eyebrow",dx:-0.05,dy:0.03,add:true}},
    dimensionId:"story",masterDimensionId:"ig_portrait",postType:"event",
    roleOffsetsByFormat:seeded.typography.roleOffsetsByFormat,
  });
  const added=applyGroups(seeded,addGroups);
  const off=added.typography.roleOffsetsByFormat.story.event.eyebrow;
  assert.ok(Math.abs(off.dx-0.1)<1e-9&&Math.abs(off.dy-0.23)<1e-9,"delta sums onto stored dx/dy");
  assert.equal(off.bx,0.3,"frozen pin bx preserved");
  assert.equal(off.by,0.4,"frozen pin by preserved");

  // With no stored offset the additive delta is applied verbatim (treated as 0 base).
  const fresh=applyGroups(createDesignDocumentV1(),planTypographyPlacementWorkflow({
    patch:{roleOffset:{role:"support",dx:0.07,dy:-0.02,add:true}},
    dimensionId:"story",masterDimensionId:"ig_portrait",postType:"event",
  }));
  assert.deepEqual(fresh.typography.roleOffsetsByFormat.story.event.support,{dx:0.07,dy:-0.02});
});

test("history commits only for a real top-level patch mutation", () => {
  assert.equal(shouldCommitPatchHistory({appliedFields:["headline"]}),true);
  assert.equal(shouldCommitPatchHistory({appliedFields:[]}),false);
  assert.equal(shouldCommitPatchHistory({appliedFields:["headline"],amendUndo:true}),false);
  assert.equal(shouldCommitPatchHistory(),false);
});

test("format override detection ignores generated geometry until the owner touches it", () => {
  const generated=createDesignDocumentV1({overlayLayers:[{
    uid:"layout-frame",assetId:"shape-1",mode:"frame",origin:"layout",master:{},
    byDim:{story:{x:0.4}},touchedByDim:{},
  }]});
  assert.equal(hasUserFormatOverride(generated,"story","ig_portrait"),false);
  const touched=createDesignDocumentV1({overlayLayers:[{
    ...generated.shapes[0],touchedByDim:{story:true},
  }]});
  assert.equal(hasUserFormatOverride(touched,"story","ig_portrait"),true);
  assert.equal(hasUserFormatOverride(touched,"ig_portrait","ig_portrait"),false);
});

test("format reset compiles only for a non-master format with owner overrides", () => {
  const groups=planFormatResetWorkflow({
    patch:{resetFormatToMaster:"story"},masterDimensionId:"ig_portrait",hasOverride:true,
  });
  assert.deepEqual(groups,[{
    changedFields:["resetFormatToMaster"],
    commands:[{type:"format/reset-to-master",dimensionId:"story"}],
    effects:[{type:"set-overlay-dirty"}],
  }]);
  assert.deepEqual(planFormatResetWorkflow({
    patch:{resetFormatToMaster:"story"},masterDimensionId:"ig_portrait",hasOverride:false,
  }),[]);
  assert.deepEqual(planFormatResetWorkflow({
    patch:{resetFormatToMaster:"ig_portrait"},masterDimensionId:"ig_portrait",hasOverride:true,
  }),[]);
});
