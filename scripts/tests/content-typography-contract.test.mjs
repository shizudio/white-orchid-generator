import test from "node:test";
import assert from "node:assert/strict";
import {deriveContentTypographyCapability,evaluateContentTypographyContract} from "../../lib/content-typography-contract.mjs";

test("content capability records authored roles and renderer-independent floors",()=>{
  const capability=deriveContentTypographyCapability({headline:"A clear idea",subtext:"Supporting detail",postType:"text_post"},"square");
  assert.equal(capability.roles.find(role=>role.id==="hero").required,true);
  assert.equal(capability.roles.find(role=>role.id==="support").present,true);
  assert.equal(capability.roles.find(role=>role.id==="microLabel").present,false);
});

test("required authored content cannot silently disappear",()=>{
  const capability=deriveContentTypographyCapability({headline:"A clear idea",postType:"text_post"},"square");
  const result=evaluateContentTypographyContract(capability,{width:1000,height:1000,roleBounds:{},textMetrics:{},droppedRoles:["hero"]});
  assert.equal(result.violations[0].ruleId,"content.required-never-dropped");
  assert.equal(result.violations[0].severity,"fail");
});

test("font floors and editorial role gaps are evaluated from render evidence",()=>{
  const capability=deriveContentTypographyCapability({headline:"A clear idea",subtext:"Supporting detail",postType:"text_post"},"square");
  const result=evaluateContentTypographyContract(capability,{
    width:1000,height:1000,
    roleBounds:{hero:{x:100,y:100,w:700,h:120},support:{x:100,y:225,w:700,h:100}},
    textMetrics:{headline:60,subtext:61},
  });
  assert.ok(result.violations.some(item=>item.ruleId==="typography.minimum-readable-size"&&item.role==="hero"));
  assert.ok(result.violations.some(item=>item.ruleId==="typography.minimum-role-gap"));
  assert.deepEqual(result.atFloorRoles,["support"]);
});
