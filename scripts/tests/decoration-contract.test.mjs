import test from "node:test";
import assert from "node:assert/strict";
import {deriveDecorationCapability,evaluateDecorationContract} from "../../lib/decoration-contract.mjs";
import {runLocalAudit,computeReadyVerdict} from "../../lib/audit-local.js";

const document={
  overlayLayers:[
    {uid:"frame",assetId:"shape-1",role:"image-frame",mode:"frame",master:{x:0.5,y:0.5,scale:0.8}},
    {uid:"owner-ring",assetId:"acc-ring",role:"decorative-overlay",mode:"outline",owner:"user",userTouched:true,master:{x:0.2,y:0.2,scale:0.2,colorId:"wisteria"}},
    {uid:"system-spark",assetId:"acc-spark",role:"icon",mode:"overlay",motif:true,master:{x:0.8,y:0.8,scale:0.1,colorId:"tangerine"}},
  ],
};

const measured=[
  {id:"frame",bounds:{x:100,y:100,w:800,h:800},transform:{opacity:1},paintFraction:0.8},
  {id:"owner-ring",bounds:{x:100,y:100,w:200,h:200},transform:{opacity:1},paintFraction:0.1},
  {id:"system-spark",bounds:{x:750,y:750,w:100,h:100},transform:{opacity:0.8},paintFraction:0.5},
];

test("decoration capability excludes structural shapes and preserves ownership",()=>{
  const capability=deriveDecorationCapability(document,"ig_square",{approvedAssetIds:["shape-1","acc-ring","acc-spark"]});
  assert.deepEqual(capability.decorations.map(item=>item.uid),["owner-ring","system-spark"]);
  assert.equal(capability.decorations[0].userPinned,true);
  assert.equal(capability.decorations[1].owner,"system");
});

test("density repair removes system decoration before owner-pinned decoration",()=>{
  const capability=deriveDecorationCapability(document,"ig_square",{
    approvedAssetIds:["shape-1","acc-ring","acc-spark"],
    budget:{maxInstances:1,maxPaintFraction:1,maxAccentColors:3},
  });
  const result=evaluateDecorationContract(capability,{width:1000,height:1000,shapes:measured});
  const violation=result.violations.find(item=>item.ruleId==="decoration.density-budget");
  assert.deepEqual(violation.target,{uid:"system-spark"});
  assert.deepEqual(violation.suggestedPatch,{removeOverlay:"system-spark"});
});

test("painted area uses alpha coverage instead of raw bounding boxes",()=>{
  const capability=deriveDecorationCapability(document,"ig_square",{
    approvedAssetIds:["shape-1","acc-ring","acc-spark"],
    budget:{maxInstances:6,maxPaintFraction:0.02,maxAccentColors:3},
  });
  const result=evaluateDecorationContract(capability,{width:1000,height:1000,shapes:measured});
  assert.ok(Math.abs(result.measured.estimatedPaintFraction-0.008)<0.0001);
  assert.equal(result.violations.some(item=>item.ruleId==="decoration.occupied-area-budget"),false);
});

test("unapproved decorations block readiness through the shared advisor voice",()=>{
  const capability=deriveDecorationCapability(document,"ig_square",{
    approvedAssetIds:["shape-1","acc-ring"],
    budget:{maxInstances:6,maxPaintFraction:1,maxAccentColors:3},
  });
  const decorationResult=evaluateDecorationContract(capability,{width:1000,height:1000,shapes:measured});
  const signal={dimensionId:"ig_square",decorationResult};
  const finding=runLocalAudit(signal).find(item=>item.ruleId==="decoration.approved-asset");
  assert.equal(finding.target.uid,"system-spark");
  assert.deepEqual(finding.fix,{removeOverlay:"system-spark"});
  assert.equal(computeReadyVerdict(signal,"ig_square").ready,false);
});

test("a third explicit decoration color is advisory and never silently recolors a pin",()=>{
  const threeColors={...document,overlayLayers:[
    ...document.overlayLayers,
    {uid:"owner-plus",assetId:"acc-plus",role:"icon",mode:"overlay",owner:"user",userTouched:true,master:{x:0.5,y:0.8,scale:0.1,colorId:"celadon"}},
  ]};
  const capability=deriveDecorationCapability(threeColors,"ig_square",{
    approvedAssetIds:["shape-1","acc-ring","acc-spark","acc-plus"],
    budget:{maxInstances:6,maxPaintFraction:1,maxAccentColors:2},
  });
  const result=evaluateDecorationContract(capability,{width:1000,height:1000,shapes:[...measured,{id:"owner-plus",bounds:{x:450,y:750,w:100,h:100},paintFraction:0.5}]});
  const violation=result.violations.find(item=>item.ruleId==="decoration.accent-color-budget");
  assert.equal(violation.severity,"warn");
  assert.equal(violation.suggestedPatch,null);
});
