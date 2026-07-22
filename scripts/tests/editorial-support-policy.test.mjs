import test from "node:test";
import assert from "node:assert/strict";
import { planCompleteSupportPlacement } from "../../lib/editorial-support-policy.mjs";

test("complete support copy draws only when every fitted line clears the floor", () => {
  const result = planCompleteSupportPlacement({
    fit:{ size:40,lineHeight:52,lines:["one","two","three"] },
    box:{ x:100,y:500,w:600,h:200 },
    floor:720,
    canvasHeight:1000,
    heroBottom:450,
  });
  assert.equal(result.willDraw,true);
  assert.deepEqual(result.lines,["one","two","three"]);
  assert.equal(result.usedHeight,156);
  assert.ok(result.bottom<=720);
});

test("a mid-copy cut is rejected instead of drawing a partial caption", () => {
  const result = planCompleteSupportPlacement({
    fit:{ size:40,lineHeight:52,lines:["one","two","three","four"] },
    box:{ x:100,y:500,w:600,h:200 },
    floor:720,
    canvasHeight:1000,
    heroBottom:450,
  });
  assert.equal(result.willDraw,false);
  assert.deepEqual(result.lines,[]);
  assert.equal(result.usedHeight,0);
});

test("one floored line may lift but never crosses the hero", () => {
  const result = planCompleteSupportPlacement({
    fit:{ size:60,lineHeight:78,lines:["one"] },
    box:{ x:100,y:690,w:600,h:100 },
    floor:730,
    canvasHeight:1000,
    heroBottom:650,
  });
  assert.ok(result.y>=650);
  assert.ok(result.bottom<=730);
  assert.equal(result.willDraw,true);
});

test("surface prediction can disable lifting and remain conservative", () => {
  const result = planCompleteSupportPlacement({
    fit:{ size:60,lineHeight:78,lines:["one"] },
    box:{ x:100,y:690,w:600,h:100 },
    floor:730,
    canvasHeight:1000,
    allowLift:false,
  });
  assert.equal(result.y,690);
  assert.equal(result.willDraw,false);
});
