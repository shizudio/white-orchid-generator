import test from "node:test";
import assert from "node:assert/strict";
import {fallbackAdvisorEditTarget,hasNonAcknowledgementAction} from "../../lib/advisor-action-policy.mjs";

test("blocking rules route to the layer that can actually change them",()=>{
  assert.deepEqual(fallbackAdvisorEditTarget({ruleId:"typography.surface-contrast",field:"subtext"}),{kind:"text",role:"support",label:"Edit the text"});
  assert.deepEqual(fallbackAdvisorEditTarget({ruleId:"logo.surface-contrast"}),{kind:"element",element:"logo",label:"Edit the logo"});
  assert.deepEqual(fallbackAdvisorEditTarget({ruleId:"media.crop-coverage"}),{kind:"element",element:"photo",label:"Edit the photo"});
  assert.deepEqual(fallbackAdvisorEditTarget({ruleId:"decoration.yields-to-meaning",target:{uid:"arrow-a"}}),{kind:"shape",uid:"arrow-a",label:"Edit the shape"});
  assert.deepEqual(fallbackAdvisorEditTarget({ruleId:"format.platform-occlusion"}),{kind:"text",role:"hero",label:"Edit placement"});
  assert.deepEqual(fallbackAdvisorEditTarget({ruleId:"pin.no-silent-overwrite",element:"content"}),{kind:"text",role:"hero",label:"Edit the text color"});
});

test("acknowledgement-only action rows are detectable",()=>{
  assert.equal(hasNonAcknowledgementAction([{kind:"ack"}]),false);
  assert.equal(hasNonAcknowledgementAction([{kind:"ack"},{kind:"deep-link"}]),true);
});
