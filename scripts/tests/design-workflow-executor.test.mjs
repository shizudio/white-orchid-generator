import test from "node:test";
import assert from "node:assert/strict";
import { executeDesignCommandEntries, executeDesignWorkflowGroups } from "../../lib/design-workflow-executor.mjs";

test("semantic command execution reports only reducer-confirmed patch fields", () => {
  const changed=executeDesignCommandEntries([
    {patchField:"headline",command:{id:"same"}},
    {patchField:"logoId",command:{id:"changed"}},
    null,
  ],{
    dispatchCommand:command=>({changedPaths:command.id==="changed"?["logo.assetId"]:[]}),
  });
  assert.deepEqual(changed,["logoId"]);
  assert.deepEqual(executeDesignCommandEntries(null,{dispatchCommand:()=>({})}),[]);
});

test("workflow execution reports only groups with canonical command changes", () => {
  const effects=[];
  const changed=executeDesignWorkflowGroups([
    {changedFields:["headline"],commands:[{id:"same"}],effects:[{type:"clear-photo-selection"}]},
    {changedFields:["logoPosition"],commands:[{id:"move"}],effects:[{type:"select-logo-tab",value:"primary"}]},
  ],{
    dispatchCommand:command=>({changedPaths:command.id==="move"?["logo.masterPlacement"]:[]}),
    applyEffects:groupEffects=>effects.push(...groupEffects),
  });

  assert.deepEqual(changed,["logoPosition"]);
  assert.deepEqual(effects,[{type:"clear-photo-selection"},{type:"select-logo-tab",value:"primary"}]);
});

test("workflow execution tolerates invalid plans and missing result metadata", () => {
  assert.deepEqual(executeDesignWorkflowGroups(null,{dispatchCommand:()=>({})}),[]);
  assert.deepEqual(executeDesignWorkflowGroups([
    null,
    {changedFields:["shape"],commands:[{}]},
  ],{dispatchCommand:()=>({})}),[]);
  assert.deepEqual(executeDesignWorkflowGroups([{
    changedFields:"not-an-array",
    commands:{bad:true},
    effects:{bad:true},
  }],{dispatchCommand:()=>({changedPaths:["unexpected"]})}),[]);
});

test("workflow execution rejects unknown and malformed editor effects", () => {
  const applied=[];
  const invalid=[];
  executeDesignWorkflowGroups([{
    changedFields:[],
    commands:[],
    effects:[
      {type:"select-shape",uid:"shape-a"},
      {type:"select-shape"},
      {type:"future-effect"},
    ],
  }], {
    dispatchCommand:()=>({changedPaths:[]}),
    applyEffects:effects=>applied.push(...effects),
    onInvalidEffect:(effect,detail)=>invalid.push({effect,detail}),
  });

  assert.deepEqual(applied,[{type:"select-shape",uid:"shape-a"}]);
  assert.equal(invalid.length,2);
  assert.equal(invalid[0].detail.error,"shape uid must be a non-empty string");
  assert.equal(invalid[1].detail.error,"unknown effect type: future-effect");
});
