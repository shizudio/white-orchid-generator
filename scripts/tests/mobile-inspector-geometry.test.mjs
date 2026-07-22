import test from "node:test";
import assert from "node:assert/strict";
import {resolveMobileInspectorViewport} from "../../lib/mobile-inspector-geometry.mjs";

const base={
  canvasRect:{top:100,bottom:700,left:20,width:360,height:600},
  canvasWidth:1080,canvasHeight:1350,viewportWidth:400,bandTop:80,bandBottom:480,
};

test("a low selection scrolls above the sheet and moves undo away from it",()=>{
  const result=resolveMobileInspectorViewport({...base,selectedBounds:{x:100,y:900,w:200,h:180}});
  assert.ok(result.scrollDelta>0);
  assert.equal(result.undoSide,"right");
  assert.ok(result.elementBottom-result.scrollDelta<=base.bandBottom+0.001);
});

test("a visible selection does not move the page",()=>{
  const result=resolveMobileInspectorViewport({...base,selectedBounds:{x:700,y:150,w:200,h:120}});
  assert.equal(result.scrollDelta,0);
  assert.equal(result.undoSide,"left");
});

test("an unusably short canvas band declines to auto-scroll",()=>{
  assert.equal(resolveMobileInspectorViewport({...base,bandTop:420,bandBottom:480}),null);
});
