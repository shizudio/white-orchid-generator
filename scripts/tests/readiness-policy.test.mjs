import test from "node:test";
import assert from "node:assert/strict";
import {createExportAuthorization,createReadinessPolicyState,createReadinessReviewState,findingAcknowledgedByMap,findingHasActionableRemedy,readinessDomainForFinding} from "../../lib/readiness-policy.mjs";

test("readiness separates technical, accessibility, brand and channel state",()=>{
  const state=createReadinessPolicyState([
    {id:"crop",ruleId:"format.export-bounds",severity:"fail",fix:{textLayout:{x:0.1}}},
    {id:"contrast",ruleId:"typography.surface-contrast",severity:"warn",field:"headline"},
    {id:"logo",ruleId:"logo.no-text-overlap",severity:"fail",policy:{remedies:["move-logo"]}},
    {id:"story",ruleId:"format.platform-occlusion",severity:"warn",fix:{logoPosition:"mid-left"}},
  ]);
  assert.equal(state.domains.technical.status,"blocked");
  assert.equal(state.domains.accessibility.status,"review");
  assert.equal(state.domains.brand.status,"blocked");
  assert.equal(state.domains.channel.status,"review");
  assert.equal(state.canPublish,false);
});

test("blocking issues expose whether a real remedy exists",()=>{
  const state=createReadinessPolicyState([
    {id:"dead",severity:"fail",message:"No path"},
    {id:"editable",severity:"fail",field:"subtext"},
  ]);
  assert.deepEqual(state.blockersWithoutRemedy.map(item=>item.id),["dead"]);
  assert.equal(findingHasActionableRemedy(state.blockers.find(item=>item.id==="editable")),true);
});

test("a normalized canvas anchor alone does not pretend to be an edit remedy",()=>{
  assert.equal(findingHasActionableRemedy({id:"dead",severity:"fail",elementId:"canvas"}),false);
  assert.equal(findingHasActionableRemedy({id:"copy",severity:"fail",elementId:"canvas",category:"copy-limit"}),true);
});

test("approval is orthogonal to quality domains",()=>{
  const state=createReadinessPolicyState([{
    id:"subject",ruleId:"media.protected-subject",severity:"fail",
    commands:[{type:"finding/apply-remedy",requiresApproval:true}],
  }]);
  assert.equal(readinessDomainForFinding(state.blockers[0]),"technical");
  assert.deepEqual(state.approvalRequired,["subject"]);
  assert.equal(state.domains.approval.status,"review");
});

test("acknowledging a blocker marks it reviewed but never approved",()=>{
  const blocker={id:"contrast",ruleId:"typography.surface-contrast",severity:"fail",field:"headline"};
  const state=createReadinessReviewState([blocker],()=>true);
  assert.equal(state.status,"approval-required");
  assert.equal(state.canPublish,false);
  assert.deepEqual(state.openBlockers,[]);
  assert.deepEqual(state.acknowledgedBlockers.map(item=>item.id),["contrast"]);
});

test("advisory notes do not block publishing whether open or reviewed",()=>{
  const warning={id:"density",ruleId:"decoration.density-budget",severity:"warn"};
  assert.equal(createReadinessReviewState([warning],()=>false).status,"ready");
  assert.equal(createReadinessReviewState([warning],()=>true).canPublish,true);
});

test("acknowledgements match the exact finding fingerprint, not every issue category",()=>{
  const acknowledgements={one:{dimensionId:"story",issueId:"contrast",category:"contrast",fingerprint:"geo:old",geometryFingerprint:"geo"}};
  assert.equal(findingAcknowledgedByMap(acknowledgements,"story",{id:"contrast",category:"contrast",fingerprint:"geo:old"}),true);
  assert.equal(findingAcknowledgedByMap(acknowledgements,"story",{id:"contrast",category:"contrast",fingerprint:"geo:new"}),false);
  assert.equal(findingAcknowledgedByMap(acknowledgements,"story",{id:"different",category:"contrast",fingerprint:"geo:old"}),false);
});

test("export authorization follows blocking policy for all and current formats",()=>{
  const clear=createReadinessPolicyState([{id:"note",severity:"warn"}]);
  const blocked=createReadinessPolicyState([{id:"contrast",severity:"fail",field:"headline"}]);
  const authorization=createExportAuthorization({formats:[
    {dimensionId:"ig_square",ready:true,policyState:clear},
    {dimensionId:"story",ready:false,policyState:blocked},
  ]},"ig_square");
  assert.equal(authorization.known,true);
  assert.equal(authorization.currentAllowed,true);
  assert.equal(authorization.allAllowed,false);
  assert.equal(authorization.firstBlockedDimensionId,"story");
});

test("export remains closed while readiness is unknown",()=>{
  assert.deepEqual(createExportAuthorization(null,"ig_square"),{
    known:false,allAllowed:false,currentAllowed:false,firstBlockedDimensionId:null,blockedDimensionIds:[],
  });
});
