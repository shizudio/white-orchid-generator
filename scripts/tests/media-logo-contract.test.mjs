import test from "node:test";
import assert from "node:assert/strict";
import {deriveMediaLogoCapability,evaluateMediaLogoContract} from "../../lib/media-logo-contract.mjs";
import {computeReadyVerdict,runLocalAudit} from "../../lib/audit-local.js";

const capability=(overrides={})=>deriveMediaLogoCapability({
  image:"/photo.jpg",selectedLogoId:"p1-green",postType:"photo_logo",
  ...overrides,
},"square",{layout:{mediaModel:"shape-frame"}});

test("media and logo intent derive from the canonical document",()=>{
  const result=capability({userLogoTouched:true,logoFreePos:{x:0.2,y:0.3}});
  assert.equal(result.media.coverageRequired,true);
  assert.equal(result.logo.present,true);
  assert.equal(result.logo.placementPinned,true);
  assert.equal(result.logo.intrinsicClearSpaceFractionOfWidth,0.05);
});

test("a frame window below cover produces one executable crop repair",()=>{
  const result=evaluateMediaLogoContract(capability(),{
    width:1000,height:1000,sourceWidth:1600,sourceHeight:900,
    photoBox:{x:100,y:100,w:800,h:800,eff:{zoom:0.5,cx:0.5,cy:0.5,rotation:0}},
    logoBox:{x:800,y:800,w:100,h:50},
  });
  const violation=result.violations.find(item=>item.ruleId==="media.crop-coverage");
  assert.ok(violation);
  assert.ok(violation.suggestedPatch.photoTransform.zoom>=1);
});

test("logo clear space is measured from visible ink bounds",()=>{
  const result=evaluateMediaLogoContract(capability(),{
    width:1000,height:1000,sourceWidth:1600,sourceHeight:900,
    photoBox:{x:0,y:0,w:1000,h:1000,eff:{zoom:1,cx:0.5,cy:0.5,rotation:0}},
    logoBox:{x:10,y:100,w:160,h:80},
  });
  const violation=result.violations.find(item=>item.ruleId==="logo.intrinsic-clear-space");
  assert.deepEqual(violation.evidence.failedEdges,["left"]);
  assert.deepEqual(violation.suggestedPatch,{logoFree:null});
});

test("renderer contrast evidence becomes a canonical logo violation",()=>{
  const result=evaluateMediaLogoContract(capability(),{
    width:1000,height:1000,logoBox:{x:100,y:100,w:160,h:80},
    logoEvidence:{illegible:true,photoContrast:2.4,photoBusy:true,suggestPosition:"top-right"},
  });
  const violation=result.violations.find(item=>item.ruleId==="logo.surface-contrast");
  assert.deepEqual(violation.suggestedPatch,{logoPosition:"top-right",logoFree:null});
});

test("media and logo contract failures use the unified advisor and readiness voice",()=>{
  const signal={
    dimensionId:"square",
    mediaLogoResult:{violations:[
      {ruleId:"media.crop-coverage",suggestedPatch:{photoTransform:{zoom:1,cx:0.5,cy:0.5,rotation:0}}},
      {ruleId:"logo.intrinsic-clear-space"},
    ]},
    logo:{},ready:{},
  };
  const findings=runLocalAudit(signal);
  assert.equal(findings.find(item=>item.id==="media-crop-coverage").ruleId,"media.crop-coverage");
  assert.equal(findings.find(item=>item.id==="logo-clear-space").fix,null);
  const verdict=computeReadyVerdict(signal,"square");
  assert.ok(verdict.issues.some(item=>item.id==="media-crop-coverage"));
  assert.ok(verdict.issues.some(item=>item.id==="logo-clear-space"));
});
