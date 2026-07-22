import test from "node:test";
import assert from "node:assert/strict";
import {deriveSurfaceCapability,evaluateSurfaceContract,SURFACE_STACK} from "../../lib/surface-contract.mjs";
import {runLocalAudit,computeReadyVerdict} from "../../lib/audit-local.js";

const document={
  headline:"Creative learning",
  image:"/photo.jpg",
  bgColor:"burnham",
  fieldColorOverride:"whiteSmoke",
  textColorId:"auto",
  backdropMode:"band",
  pinnedProps:{backdropMode:true},
  photoTreatment:"burnhamTint",
  overlayLayers:[
    {uid:"panel",assetId:"panel",role:"content-panel",mode:"overlay"},
    {uid:"motif",assetId:"motif",role:"decorative-overlay",mode:"overlay"},
  ],
};

test("surface capability declares the canonical stack and requested choices",()=>{
  const capability=deriveSurfaceCapability(document,"ig_portrait");
  assert.deepEqual(capability.stack,SURFACE_STACK);
  assert.equal(capability.requested.field,"whiteSmoke");
  assert.equal(capability.requested.backdrop,"band");
  assert.equal(capability.requested.pins.backdropMode,true);
  assert.ok(capability.activeLayers.includes("media-treatment"));
  assert.ok(capability.activeLayers.includes("structural-panel"));
  assert.ok(capability.activeLayers.includes("decoration"));
});

test("surface result records requested, resolved, measured, and pinned evidence",()=>{
  const capability=deriveSurfaceCapability(document,"ig_portrait");
  const result=evaluateSurfaceContract(capability,{
    resolved:{background:"#173e38",field:"#f4f2e7",text:"#173e38",backdrop:"band"},
    contrast:{min:5.2,mean:7.1},bandCount:1,appliedTreatments:["band"],
  });
  assert.equal(result.status,"clear");
  assert.equal(result.requested.text,"auto");
  assert.equal(result.resolved.text,"#173e38");
  assert.equal(result.measured.contrast.min,5.2);
  assert.equal(result.measured.bandCount,1);
  assert.equal(result.pins.backdropMode,true);
});

test("surface contract catches duplicate treatment and an explicitly blocked band",()=>{
  const capability=deriveSurfaceCapability(document,"ig_portrait");
  const result=evaluateSurfaceContract(capability,{doubleBackdrop:1,bandOverShape:1,appliedTreatments:["tint","band"]});
  assert.equal(result.status,"blocked");
  assert.deepEqual(result.violations.map(item=>item.ruleId),[
    "surface.single-legibility-treatment",
    "surface.shape-band-exclusion",
  ]);
  assert.deepEqual(result.violations[1].suggestedPatch,{backdropMode:"auto"});
});

test("a pinned text color can never resolve to a different paint color",()=>{
  const capability=deriveSurfaceCapability({...document,textColorId:"whiteSmoke",pinnedProps:{textColorId:true}},"ig_portrait");
  const result=evaluateSurfaceContract(capability,{
    requestedResolved:{text:"#f4f2e7"},resolved:{text:"#173e38"},
  });
  assert.equal(result.status,"blocked");
  assert.equal(result.violations[0].ruleId,"pin.no-silent-overwrite");
  assert.equal(result.violations[0].evidence.property,"palette.text");
  const finding=runLocalAudit({dimensionId:"ig_portrait",surfaceResult:result})
    .find(item=>item.id==="surface-pinned-color-overridden");
  assert.equal(finding.ruleId,"pin.no-silent-overwrite");
});

test("an auto band rejected by a shape does not create a duplicate user-facing contrast finding",()=>{
  const capability=deriveSurfaceCapability({...document,backdropMode:"auto"},"ig_portrait");
  const result=evaluateSurfaceContract(capability,{bandOverShape:1});
  assert.equal(result.status,"clear");
  assert.equal(result.violations.length,0);
});

test("surface violations use the unified advisor and readiness path",()=>{
  const capability=deriveSurfaceCapability(document,"ig_portrait");
  const surfaceResult=evaluateSurfaceContract(capability,{bandOverShape:1});
  const signal={dimensionId:"ig_portrait",surfaceResult};
  const finding=runLocalAudit(signal).find(item=>item.id==="surface-band-shape-conflict");
  assert.equal(finding.ruleId,"surface.shape-band-exclusion");
  assert.deepEqual(finding.fix,{backdropMode:"auto"});
  assert.equal(computeReadyVerdict(signal,"ig_portrait").ready,false);
});
