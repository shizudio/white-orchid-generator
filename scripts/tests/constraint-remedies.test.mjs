import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSTRAINT_REMEDY_COMMAND_TYPE,
  createConstraintRemedyCommands,
  isConstraintRemedyCommand,
} from "../../lib/constraint-remedies.mjs";
import { computeReadyVerdict, runLocalAudit } from "../../lib/audit-local.js";

test("logo collisions produce an explicit, user-approved semantic remedy command", () => {
  const commands=createConstraintRemedyCommands({
    id:"constraint:mark-subject",ruleId:"logo.no-subject-overlap",relationId:"mark-subject",
    zoneIds:["mark:primary","protected:media-subject"],
    geometry:{from:{x:0.2,y:0.2,w:0.12,h:0.08},to:{x:0.1,y:0.1,w:0.45,h:0.5}},
  },{dimensionId:"story"});
  assert.equal(commands[0].type,CONSTRAINT_REMEDY_COMMAND_TYPE);
  assert.equal(commands[0].patch.logoPosition,"bottom-right");
  assert.equal(commands[0].requiresApproval,true);
  assert.equal(commands[0].autoApplicable,false);
  assert.equal(isConstraintRemedyCommand(commands[0]),true);
});

test("content subject collisions move the text box to the nearest legal negative space", () => {
  const commands=createConstraintRemedyCommands({
    id:"constraint:hero-subject",ruleId:"media.protected-subject",
    zoneIds:["content:hero","protected:media-subject"],
    geometry:{from:{x:0.3,y:0.3,w:0.35,h:0.2},to:{x:0.25,y:0.2,w:0.45,h:0.45}},
  },{dimensionId:"ig_square"});
  assert.equal(commands[0].remedyId,"move-element");
  assert.equal(commands[0].target.role,"hero");
  assert.equal(commands[0].patch.dimensionId,"ig_square");
  assert.ok(Number.isFinite(commands[0].patch.textLayout.x));
  assert.ok(Number.isFinite(commands[0].patch.textLayout.y));
});

test("subject collisions offer crop reframing as an explicit alternative", () => {
  const violation={
    id:"constraint:hero-subject",ruleId:"media.protected-subject",
    zoneIds:["content:hero","protected:media-subject"],
    geometry:{from:{x:0.3,y:0.3,w:0.3,h:0.18},to:{x:0.38,y:0.25,w:0.28,h:0.34}},
  };
  const commands=createConstraintRemedyCommands(violation,{
    dimensionId:"story",
    media:{transform:{zoom:1.2,cx:0.5,cy:0.5,rotation:0},window:{x:0,y:0,w:1,h:1}},
  });
  assert.deepEqual(commands.map(item=>item.remedyId),["move-element","adjust-crop"]);
  assert.ok(commands[1].patch.photoTransform.cx!==0.5||commands[1].patch.photoTransform.cy!==0.5);
  assert.equal(commands[1].requiresApproval,true);
});

test("structural seam remedies may move content fully inside its surface", () => {
  const commands=createConstraintRemedyCommands({
    id:"constraint:hero-seam",ruleId:"structural.no-seam-straddle",
    zoneIds:["content:hero","structural:frame-a"],
    geometry:{from:{x:0.62,y:0.3,w:0.25,h:0.15},to:{x:0.15,y:0.15,w:0.6,h:0.6}},
  },{dimensionId:"ig_portrait"});
  assert.equal(commands.length,1);
  const moved=commands[0].patch.textLayout;
  assert.ok(moved.x>=0.18&&moved.x+0.25<=0.72);
  assert.ok(moved.y>=0.18&&moved.y+0.15<=0.72);
});

test("subject and seam findings keep auto-fix null but expose typed user remedies and block readiness", () => {
  const violation={
    id:"constraint:hero-subject",ruleId:"media.protected-subject",
    zoneIds:["content:hero","protected:media-subject"],
    geometry:{from:{x:0.3,y:0.3,w:0.35,h:0.2},to:{x:0.25,y:0.2,w:0.45,h:0.45}},
  };
  const signal={
    dimensionId:"ig_square",hasText:true,hasMedia:true,copy:{},flooredRoles:[],
    zoneContrast:{mean:8,min:8},logo:{},
    ready:{canvasW:1080,canvasH:1080,fontPx:{},textBoxes:[],logoBox:null,pinned:[]},
    constraintResult:{version:1,status:"blocked",violations:[violation],evaluatedRelationIds:[],deferredRelationIds:[],errors:[]},
  };
  const finding=runLocalAudit(signal).find(item=>item.id==="media-subject-overlap");
  assert.equal(finding.fix,null,"a measured repair never silently moves owner content");
  assert.equal(isConstraintRemedyCommand(finding.remedyCommands[0]),true);
  assert.ok(computeReadyVerdict(signal,"ig_square").issues.some(item=>item.id==="media-subject-overlap"));
});

test("decoration conflicts offer both move and remove commands", () => {
  const violation={
    id:"constraint:arrow-hero",ruleId:"decoration.yields-to-meaning",
    zoneIds:["decoration:arrow-a","content:hero"],
    geometry:{from:{x:0.55,y:0.3,w:0.18,h:0.12},to:{x:0.2,y:0.2,w:0.5,h:0.25}},
  };
  const commands=createConstraintRemedyCommands(violation,{dimensionId:"story"});
  assert.deepEqual(commands.map(item=>item.remedyId),["move-decoration","remove-decoration"]);
  assert.equal(commands[0].patch.overlayUpdate.uid,"arrow-a");
  assert.equal(commands[1].patch.removeOverlay,"arrow-a");

  const signal={
    dimensionId:"story",hasText:true,hasMedia:false,copy:{},flooredRoles:[],zoneContrast:{flat:true,mean:8},logo:{},
    ready:{canvasW:1080,canvasH:1920,fontPx:{},textBoxes:[],logoBox:null,pinned:[]},
    constraintResult:{version:1,status:"blocked",violations:[violation],evaluatedRelationIds:[],deferredRelationIds:[],errors:[]},
  };
  const finding=runLocalAudit(signal).find(item=>item.id==="decoration-overlap:arrow-a");
  assert.equal(finding.elementId,"shape:arrow-a");
  assert.equal(finding.fix,null);
  assert.equal(finding.remedyCommands.length,2);
  assert.ok(computeReadyVerdict(signal,"story").issues.some(item=>item.id==="decoration-overlap:arrow-a"));
});
