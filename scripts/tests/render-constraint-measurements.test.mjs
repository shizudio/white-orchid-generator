import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDecorationRelationTests,
  buildPaintAwareRelationTests,
  projectFocalSubjectBox,
  summarizeConstraintEvidence,
} from "../../lib/render-constraint-measurements.mjs";

test("focal subjects project deterministically through the active crop",()=>{
  const subject=projectFocalSubjectBox({
    sourceWidth:1600,
    sourceHeight:900,
    photoBox:{x:100,y:50,w:400,h:400,eff:{zoom:1,panX:0,panY:0,rot:0}},
    focal:{fx:0.5,fy:0.5},
  });
  assert.deepEqual(subject,{x:212,y:162,w:176,h:176});
});

test("decoration relation tests use rendered paint rather than bounding boxes",()=>{
  const calls=[];
  const result=buildDecorationRelationTests({
    layout:{
      zones:[{id:"content:hero",geometry:{rect:{x:0.1,y:0.2,w:0.3,h:0.4}}}],
      relations:[{id:"decoration-clears-hero",from:"decoration:petal",to:"content:hero"}],
    },
    zoneRects:{},
    shapes:[{id:"petal"}],
    width:1000,
    height:500,
    imageForShape:uid=>({uid}),
    paintIntersects:(image,shape,target)=>{
      calls.push({image,shape,target});
      return false;
    },
  });
  assert.deepEqual(result,{"decoration-clears-hero":false});
  assert.deepEqual(calls[0].target,{x:100,y:100,w:300,h:200});
});

test("structural seam relation tests use alpha evidence for organic frames",()=>{
  const layout={zones:[
    {id:"content:hero",geometry:{type:"rect",rect:{x:0.1,y:0.2,w:0.3,h:0.3}}},
    {id:"structural:frame",geometry:{type:"shape-ref",shapeId:"frame"}},
  ],relations:[{id:"hero-seam",type:"does-not-straddle",from:"content:hero",to:"structural:frame"}]};
  const base={
    layout,zoneRects:{"content:hero":{x:0.1,y:0.2,w:0.3,h:0.3}},width:100,height:100,
    shapes:[{id:"frame",bounds:{x:0,y:0,w:60,h:80}}],imageForShape:()=>({}),
  };
  assert.equal(buildPaintAwareRelationTests({...base,paintStraddles:()=>false})["hero-seam"],false);
  assert.equal(buildPaintAwareRelationTests({...base,paintStraddles:()=>true})["hero-seam"],true);
});

test("constraint evidence is summarized by canonical rule and layer",()=>{
  const summary=summarizeConstraintEvidence({violations:[
    {ruleId:"structural.no-seam-straddle",zoneIds:["content:hero","structural:frame"]},
    {ruleId:"decoration.yields-to-meaning",zoneIds:["decoration:a","content:support"]},
    {ruleId:"decoration.yields-to-meaning",zoneIds:["decoration:b","protected:media-subject"]},
  ]});
  assert.deepEqual(summary,{seamStraddles:1,decorationTextOrMark:1,decorationSubject:1});
});
