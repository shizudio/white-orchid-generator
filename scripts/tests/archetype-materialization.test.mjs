import test from "node:test";
import assert from "node:assert/strict";
import { buildArchetypeMaterialization } from "../../lib/archetype-materialization.mjs";

test("shape-mask archetypes materialize a genuine responsive layout layer",()=>{
  const result=buildArchetypeMaterialization({
    archetype:{id:"cutout"},context:{postType:"event",attribution:"ENROLMENT",subtext:"Details"},
    masterDimensionId:"ig_square",dimensions:[{id:"ig_square"},{id:"story"}],
    overlayAssets:[{id:"shape-2",ratio:1.2}],backgroundIds:["celadon"],
    materializeLayout:(_arch,id)=>({roles:{hero:{x:0.1,y:0.2,w:0.7,align:"left"},microLabel:{x:0.1}},register:"serif",photoTreatment:"warmGrade",photoFrame:{type:"shapeMask",shapeId:"shape-2",box:{x:0.2,y:id==="story"?0.3:0.2,w:0.5,h:0.5}},palette:{bg:"celadon"}}),
    layoutShapeTransform:(dimension,_postType,box,ratio)=>({x:box.x,y:box.y,scale:ratio,dimension:dimension.id}),
    createUid:prefix=>`${prefix}_fixed`,
  });
  assert.equal(result.photoFrame.type,"none");
  assert.equal(result.layoutShapeLayer.origin,"layout");
  assert.equal(result.layoutShapeLayer.master.dimension,"ig_square");
  assert.equal(result.layoutShapeLayer.byDim.story.dimension,"story");
  assert.equal(result.microLabel,"ENROLMENT");
});

test("motif materialization is deterministic with injected ids and sanctioned backgrounds",()=>{
  const result=buildArchetypeMaterialization({
    archetype:{id:"motif"},current:{postType:"text_post"},masterDimensionId:"ig_square",
    backgroundIds:["sage"],createUid:prefix=>`${prefix}_id`,
    materializeLayout:()=>({roles:{hero:null},register:"heavySans",photoFrame:{type:"card",rotationDeg:12},motif:{count:3,pastels:["sage","butter"]},palette:{bg:"unknown"}}),
  });
  assert.equal(result.bg,null);
  assert.equal(result.photoFrame.rotationDeg,0);
  assert.equal(result.motifLayers.length,3);
  assert.equal(result.layout.lineHeight,1.05);
});
