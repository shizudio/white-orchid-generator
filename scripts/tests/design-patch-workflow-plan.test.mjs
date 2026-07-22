import test from "node:test";
import assert from "node:assert/strict";
import { planDesignPatchCompositeWorkflows, resolveDesignPatchTransitions } from "../../lib/design-patch-workflow-plan.mjs";

test("patch transitions resolve archetype context and format changes deterministically", () => {
  const transitions=resolveDesignPatchTransitions({
    patch:{archetypeId:"editorial",archVariant:2,postType:"event",subtext:"New",dimensionId:"story"},
    currentArchetypeId:"editorial",currentArchetypeVariant:1,currentDimensionId:"ig_square",
    currentPostType:"quote",currentAttribution:"Current",currentSubtext:"Old",
    archetypeIds:["editorial"],dimensionIds:["ig_square","story"],postTypes:["quote","event"],
  });
  assert.deepEqual(transitions,{
    archetype:{id:"editorial",context:{postType:"event",attribution:"Current",subtext:"New",variant:2}},
    dimensionId:"story",
  });
  assert.deepEqual(resolveDesignPatchTransitions({
    patch:{archetypeId:"none"},currentArchetypeId:"editorial",currentArchetypeVariant:0,
  }).archetype,{id:"none",context:null});
});

test("composite patch planning preserves import-before-add and media ordering", () => {
  const groups=planDesignPatchCompositeWorkflows({
    patch:{
      replaceShapeCollection:[{uid:"old",assetId:"shape-1",master:{x:0.5,y:0.5}}],
      addOverlay:{assetId:"shape-2",mode:"overlay"},
      imageSrc:"data:image/png;base64,new",
    },
    logo:{assetId:"p3-ivory",position:"bottom-center",sizeId:"m",hidden:false},
    renderedLogo:{position:"bottom-center",drawn:true},
    dimensionId:"ig_square",
    masterDimensionId:"ig_square",
    currentShapes:[],
    overlayAssets:[{id:"shape-2",kind:"center",ratio:1}],
    allowedOverlayAssetIds:["shape-2"],
    canvasWidth:1080,
    canvasHeight:1080,
    suggestShapePlacement:()=>({x:0.5,y:0.5,scale:0.3}),
    createShapeUid:()=>"new-shape",
    postType:"photo_logo",
    defaultTextLayout:{},
    validColorIds:["burnham"],
  });
  assert.deepEqual(groups.map(group=>group.changedFields[0]),["replaceShapeCollection","addOverlay","imageSrc"]);
  assert.equal(groups[1].commands.at(-1).shape.uid,"new-shape");
});

test("unknown overlay assets cannot enter the shape workflow", () => {
  const groups=planDesignPatchCompositeWorkflows({
    patch:{addOverlay:{assetId:"unknown",mode:"overlay"}},
    logo:{},renderedLogo:{},dimensionId:"ig_square",masterDimensionId:"ig_square",
    overlayAssets:[],allowedOverlayAssetIds:[],postType:"photo_logo",defaultTextLayout:{},
  });
  assert.equal(groups.some(group=>group.changedFields.includes("addOverlay")),false);
});
