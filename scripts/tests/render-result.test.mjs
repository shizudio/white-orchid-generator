import test from "node:test";
import assert from "node:assert/strict";
import { createRenderResult, hitTestScene, shapeBounds } from "../../lib/render-result.mjs";

test("render result exposes stable scene identities for every measured element", () => {
  const result=createRenderResult({
    dimensionId:"ig_square",width:1080,height:1080,
    roleBounds:{ hero:{x:80,y:100,w:500,h:200},furn_date:{x:80,y:340,w:180,h:40} },
    logoBox:{x:850,y:850,w:120,h:120},photoBox:{x:0,y:0,w:1080,h:1080},subjectBox:{x:320,y:180,w:420,h:500},
    shapes:[{id:"petal-7",bounds:{x:100,y:700,w:150,h:150},transform:{x:0.16,y:0.72}}],
    constraints:{status:"clear",violations:[]},
    contentTypography:{version:1,violations:[]},
    mediaLogo:{version:1,violations:[]},
    surface:{version:1,violations:[]},
    decoration:{version:1,violations:[]},
  });
  assert.deepEqual(result.sceneElements.map(item=>item.id),[
    "photo:primary","shape:petal-7","furniture:date","text:hero","logo:primary",
  ]);
  assert.equal(result.constraints.status,"clear");
  assert.equal(result.contentTypography.version,1);
  assert.equal(result.mediaLogo.version,1);
  assert.equal(result.surface.version,1);
  assert.equal(result.decoration.version,1);
  assert.deepEqual(result.measurements.subjectBox,{x:320,y:180,w:420,h:500});
});

test("added content elements register stable per-uid scene identities at z-band 40", () => {
  const result=createRenderResult({
    dimensionId:"ig_square",width:1080,height:1080,
    roleBounds:{ hero:{x:80,y:100,w:500,h:200} },
    contentElements:[
      { uid:"el_a", class:"body", placed:true, box:{x:80,y:360,w:400,h:120} },
      { uid:"el_b", class:"cta", placed:true, box:{x:80,y:520,w:220,h:60} },
      { uid:"el_c", class:"caption", placed:false },   // unplaceable → non-interactive, no box
    ],
  });
  const el=result.sceneElements.find(s=>s.id==="element:el_a");
  assert.ok(el, "placed element registers a scene node");
  assert.equal(el.type,"text");
  assert.equal(el.z,40);
  assert.equal(el.uid,"el_a");
  assert.equal(el.elementClass,"body");
  assert.equal(el.interactive,true);
  // The cta element is present and interactive.
  assert.ok(result.sceneElements.some(s=>s.id==="element:el_b"&&s.interactive));
  // The unplaceable element registers NO scene node (complete-or-absent; no phantom hit box).
  assert.ok(!result.sceneElements.some(s=>s.id==="element:el_c"));
  // Hit-testing the placed body box returns exactly that element.
  const hit=hitTestScene(result.sceneElements,120,400,{types:["text"]});
  assert.equal(hit.id,"element:el_a");
});

test("a solver-placed date is a first-class draggable text role, not the textBounds hero fallback", () => {
  // (ISSUE 2 / element-placement-spec §2) On the legacy layouts the date is now placed
  // through the solver and published in roleBounds alongside the hero. Once roleBounds is
  // non-empty, createRenderResult must NOT fall back to the textBounds→hero element, and
  // BOTH the hero and the placed date must be selectable/hit-testable scene text roles.
  const result=createRenderResult({
    dimensionId:"ig_portrait",width:1080,height:1350,
    textBounds:{x:80,y:200,w:600,h:180},
    roleBounds:{ hero:{x:80,y:200,w:600,h:180}, date:{x:820,y:1180,w:180,h:52} },
    logoBox:{x:60,y:1180,w:120,h:120},
  });
  const textRoles=result.sceneElements.filter(item=>item.type==="text").map(item=>item.role).sort();
  assert.deepEqual(textRoles,["date","hero"]);
  // the date is hit-testable at its own bounds (drag entry point)
  assert.equal(hitTestScene(result.sceneElements,900,1205,{types:["text"]}).role,"date");
});

test("shape bounds use the same width-relative transform as canvas painting", () => {
  assert.deepEqual(shapeBounds({x:0.5,y:0.25,scale:0.2},2,1000,500),{x:400,y:75,w:200,h:100});
});

test("scene hit testing prefers the topmost small element and respects rotated shapes", () => {
  const result=createRenderResult({dimensionId:"square",width:100,height:100,
    roleBounds:{hero:{x:10,y:10,w:80,h:80},eyebrow:{x:20,y:20,w:20,h:8}},
    shapes:[{id:"rotated",bounds:{x:40,y:40,w:40,h:10},transform:{rotation:45},z:60}],
  });
  assert.equal(hitTestScene(result.sceneElements,25,24,{types:["text"],minSize:12}).id,"text:eyebrow");
  assert.equal(hitTestScene(result.sceneElements,70,55,{types:["shape"]}).id,"shape:rotated");
  assert.equal(hitTestScene(result.sceneElements,42,45,{types:["shape"]}),null);
});
