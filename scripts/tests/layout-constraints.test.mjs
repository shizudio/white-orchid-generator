import test from "node:test";
import assert from "node:assert/strict";
import { createLayoutCapability } from "../../lib/layout-contract.mjs";
import { createMeasuredZoneRects, evaluateLayoutConstraints } from "../../lib/layout-constraints.mjs";

test("preflight maps platform overlap to the canonical rule and remedies", () => {
  const capability=createLayoutCapability({dimensionId:"story",zones:[
    {id:"content:hero",kind:"content",geometry:{type:"rect",rect:{x:0.1,y:0.05,w:0.8,h:0.2}}},
    {id:"protected:platform-top",kind:"protected",geometry:{type:"rect",rect:{x:0,y:0,w:1,h:0.12}}},
  ],relations:[{id:"hero-avoids-top",type:"avoids",from:"content:hero",to:"protected:platform-top"}]});
  const result=evaluateLayoutConstraints(capability);
  assert.equal(result.status,"blocked");
  assert.equal(result.violations[0].ruleId,"format.platform-occlusion");
  assert.ok(result.violations[0].remedies.includes("move-inside"));
  assert.deepEqual(result.evaluatedRelationIds,["hero-avoids-top"]);
});

test("preflight evaluates reading order and defers unavailable geometry", () => {
  const capability=createLayoutCapability({dimensionId:"ig_square",zones:[
    {id:"content:hero",kind:"content",geometry:{type:"rect",rect:{x:0.1,y:0.3,w:0.8,h:0.2}}},
    {id:"content:support",kind:"content",geometry:{type:"rect",rect:{x:0.1,y:0.2,w:0.8,h:0.1}}},
    {id:"mark:primary",kind:"mark",geometry:{type:"anchor",anchor:"bottom-right"}},
  ],relations:[
    {id:"support-follows-hero",type:"follows",from:"content:support",to:"content:hero",minGap:0.02},
    {id:"mark-clears-hero",type:"clears",from:"mark:primary",to:"content:hero",minGap:0.02},
  ]});
  const result=evaluateLayoutConstraints(capability);
  assert.equal(result.violations[0].ruleId,"typography.minimum-role-gap");
  assert.deepEqual(result.deferredRelationIds,["mark-clears-hero"]);
  const measured=evaluateLayoutConstraints(capability,{zoneRects:{"mark:primary":{x:0.75,y:0.75,w:0.15,h:0.15}}});
  assert.deepEqual(measured.deferredRelationIds,[]);
});

test("shape-ref containment is evaluated without raster geometry", () => {
  const capability=createLayoutCapability({dimensionId:"ig_square",mediaModel:"shape-frame",mediaHostShapeId:"frame-a",zones:[
    {id:"structural:frame-a",kind:"structural",geometry:{type:"shape-ref",shapeId:"frame-a"}},
    {id:"media:primary",kind:"media",geometry:{type:"shape-ref",shapeId:"frame-a"}},
  ],relations:[{id:"media-contained",type:"contains",from:"structural:frame-a",to:"media:primary"}]});
  const result=evaluateLayoutConstraints(capability);
  assert.equal(result.status,"clear");
  assert.deepEqual(result.evaluatedRelationIds,["media-contained"]);
});

test("canvas measurements map to semantic zones and become post-render evidence", () => {
  const capability=createLayoutCapability({dimensionId:"story",zones:[
    {id:"content:hero",kind:"content",geometry:{type:"unconstrained"}},
    {id:"mark:primary",kind:"mark",geometry:{type:"anchor",anchor:"top-right"}},
    {id:"structural:frame-a",kind:"structural",geometry:{type:"shape-ref",shapeId:"frame-a"}},
    {id:"protected:platform-top",kind:"protected",geometry:{type:"rect",rect:{x:0,y:0,w:1,h:0.13}}},
  ],relations:[
    {id:"hero-avoids-top",type:"avoids",from:"content:hero",to:"protected:platform-top"},
    {id:"mark-clears-hero",type:"clears",from:"mark:primary",to:"content:hero",minGap:0.02},
  ]});
  const zoneRects=createMeasuredZoneRects(capability,{
    width:1000,height:2000,
    textBounds:{x:100,y:100,w:600,h:300},
    logoBox:{x:650,y:120,w:180,h:100},
    shapes:[{id:"frame-a",bounds:{x:50,y:400,w:900,h:1200}}],
  });
  assert.deepEqual(zoneRects["content:hero"],{x:0.1,y:0.05,w:0.6,h:0.15});
  assert.deepEqual(zoneRects["mark:primary"],{x:0.65,y:0.06,w:0.18,h:0.05});
  assert.deepEqual(zoneRects["structural:frame-a"],{x:0.05,y:0.2,w:0.9,h:0.6});
  const result=evaluateLayoutConstraints(capability,{zoneRects,source:"post-render"});
  assert.equal(result.status,"blocked");
  assert.ok(result.violations.some(row=>row.ruleId==="format.platform-occlusion"));
  assert.ok(result.violations.some(row=>row.ruleId==="logo.no-text-overlap"));
  assert.ok(result.violations.every(row=>row.source==="post-render"));
});

test("protected media subjects distinguish content and logo collision rules", () => {
  const capability=createLayoutCapability({dimensionId:"ig_square",zones:[
    {id:"content:hero",kind:"content",geometry:{type:"unconstrained"}},
    {id:"mark:primary",kind:"mark",geometry:{type:"anchor",anchor:"bottom-right"}},
    {id:"protected:media-subject",kind:"protected",geometry:{type:"unconstrained"},surface:"media",owner:"media"},
  ],relations:[
    {id:"hero-avoids-subject",type:"avoids",from:"content:hero",to:"protected:media-subject"},
    {id:"mark-avoids-subject",type:"avoids",from:"mark:primary",to:"protected:media-subject"},
  ]});
  const zoneRects=createMeasuredZoneRects(capability,{
    width:1000,height:1000,
    textBounds:{x:350,y:300,w:300,h:250},
    logoBox:{x:580,y:430,w:120,h:80},
    subjectBox:{x:400,y:250,w:250,h:350},
  });
  const result=evaluateLayoutConstraints(capability,{zoneRects,source:"post-render"});
  assert.ok(result.violations.some(row=>row.ruleId==="media.protected-subject"));
  assert.ok(result.violations.some(row=>row.ruleId==="logo.no-subject-overlap"));
});

test("structural boundaries allow contained content but reject seam straddling", () => {
  const capability=createLayoutCapability({dimensionId:"ig_square",zones:[
    {id:"content:hero",kind:"content",geometry:{type:"unconstrained"}},
    {id:"structural:frame-a",kind:"structural",geometry:{type:"shape-ref",shapeId:"frame-a"}},
  ],relations:[{id:"hero-one-surface",type:"does-not-straddle",from:"content:hero",to:"structural:frame-a"}]});
  const contained=evaluateLayoutConstraints(capability,{zoneRects:{
    "content:hero":{x:0.2,y:0.2,w:0.2,h:0.2},
    "structural:frame-a":{x:0.1,y:0.1,w:0.6,h:0.6},
  }});
  assert.equal(contained.status,"clear");
  const straddling=evaluateLayoutConstraints(capability,{zoneRects:{
    "content:hero":{x:0.6,y:0.2,w:0.25,h:0.2},
    "structural:frame-a":{x:0.1,y:0.1,w:0.6,h:0.6},
  }});
  assert.equal(straddling.violations[0].ruleId,"structural.no-seam-straddle");
});

test("decoration collisions resolve to the decoration-yields rule", () => {
  const capability=createLayoutCapability({dimensionId:"ig_square",zones:[
    {id:"decoration:arrow-a",kind:"decoration",geometry:{type:"shape-ref",shapeId:"arrow-a"}},
    {id:"content:hero",kind:"content",geometry:{type:"unconstrained"}},
  ],relations:[{id:"arrow-avoids-hero",type:"avoids",from:"decoration:arrow-a",to:"content:hero"}]});
  const zoneRects=createMeasuredZoneRects(capability,{
    width:1000,height:1000,
    textBounds:{x:200,y:200,w:500,h:250},
    shapes:[{id:"arrow-a",bounds:{x:550,y:300,w:180,h:120}}],
  });
  const result=evaluateLayoutConstraints(capability,{zoneRects,source:"post-render"});
  assert.equal(result.violations[0].ruleId,"decoration.yields-to-meaning");
  const paintAware=evaluateLayoutConstraints(capability,{zoneRects,relationTests:{"arrow-avoids-hero":false},source:"post-render"});
  assert.equal(paintAware.status,"clear","a hollow/transparent decoration does not fail from its bounding box alone");
});

// ── DLC-2 guard-reconciliation regressions (adopted-WIP false positives) ─────────
// Both defects traced to the post-render constraint judging CONTENT against geometry
// that is NOT the actually-drawn text: a generous DECLARED allocation column (seam) or
// a DROPPED role's phantom allocation (safe-area). The detectors must agree with the
// system's own placement (born-clean, Law 4) yet still fire on genuinely bad geometry.

test("post-render seam: a drawn headline that clears a side photo panel does not straddle; one crossing it does", () => {
  // editorial_split shape: the hero's DECLARED column spans nearly full width (0.06..0.94)
  // and overlaps the right photo panel (0.6..1.0). The generous column must never decide
  // the seam — only the ACTUALLY-DRAWN hero box does.
  const capability=createLayoutCapability({dimensionId:"ig_portrait",zones:[
    {id:"content:hero",kind:"content",geometry:{type:"rect",rect:{x:0.06,y:0.2,w:0.88,h:0.2}}},
    {id:"media:primary",kind:"media",geometry:{type:"rect",rect:{x:0.6,y:0,w:0.4,h:1}}},
  ],relations:[
    {id:"hero-does-not-straddle-media:primary",type:"does-not-straddle",from:"content:hero",to:"media:primary"},
  ]});
  // (regression) The drawn hero is the left column (right edge 0.54 < panel left 0.6): clear.
  const cleared=evaluateLayoutConstraints(capability,{zoneRects:{
    "content:hero":{x:0.08,y:0.22,w:0.46,h:0.27},
    "media:primary":{x:0.6,y:0,w:0.4,h:1},
  },source:"post-render"});
  assert.equal(cleared.status,"clear");
  assert.equal(cleared.violations.length,0);
  // (true positive) A hero dragged to genuinely cross the panel's left edge straddles.
  const bad=evaluateLayoutConstraints(capability,{zoneRects:{
    "content:hero":{x:0.4,y:0.22,w:0.4,h:0.27},
    "media:primary":{x:0.6,y:0,w:0.4,h:1},
  },source:"post-render"});
  assert.equal(bad.status,"blocked");
  assert.equal(bad.violations[0].ruleId,"structural.no-seam-straddle");
});

test("post-render drops undrawn content roles; preflight still evaluates the declared allocation", () => {
  // serif_word:story with long copy DROPS its eyebrow — it never reaches the canvas — yet
  // its declared allocation sits in the story top band. A dropped role must not be judged.
  const capability=createLayoutCapability({dimensionId:"story",zones:[
    {id:"content:microLabel",kind:"content",geometry:{type:"rect",rect:{x:0.06,y:0.08,w:0.6,h:0.05}}},
    {id:"protected:platform-top",kind:"protected",geometry:{type:"rect",rect:{x:0,y:0,w:1,h:0.13}}},
  ],relations:[
    {id:"microLabel-avoids-protected:platform-top",type:"avoids",from:"content:microLabel",to:"protected:platform-top"},
  ]});
  // Preflight: the declared allocation overlaps the band → flagged (no render exists yet).
  const pre=evaluateLayoutConstraints(capability);
  assert.equal(pre.status,"blocked");
  assert.equal(pre.violations[0].ruleId,"format.platform-occlusion");
  // Post-render, eyebrow DROPPED (no measured box): deferred, never a false safe-area dot.
  const post=evaluateLayoutConstraints(capability,{zoneRects:{},source:"post-render"});
  assert.equal(post.violations.length,0);
  assert.ok(post.deferredRelationIds.includes("microLabel-avoids-protected:platform-top"));
});

test("post-render safe-area: a drawn role inside the story chrome band fires; one at the standard margin clears", () => {
  const capability=createLayoutCapability({dimensionId:"story",zones:[
    {id:"content:hero",kind:"content",geometry:{type:"unconstrained"}},
    {id:"protected:platform-top",kind:"protected",geometry:{type:"rect",rect:{x:0,y:0,w:1,h:0.13}}},
  ],relations:[
    {id:"hero-avoids-protected:platform-top",type:"avoids",from:"content:hero",to:"protected:platform-top"},
  ]});
  // (true positive) A drawn hero parked at y=0.05 sits under the 0.13 chrome band.
  const bad=evaluateLayoutConstraints(capability,{zoneRects:{"content:hero":{x:0.08,y:0.05,w:0.8,h:0.1}},source:"post-render"});
  assert.equal(bad.status,"blocked");
  assert.equal(bad.violations[0].ruleId,"format.platform-occlusion");
  // (regression) A drawn hero at the standard content band (y=0.2) clears the chrome.
  const good=evaluateLayoutConstraints(capability,{zoneRects:{"content:hero":{x:0.08,y:0.2,w:0.8,h:0.1}},source:"post-render"});
  assert.equal(good.status,"clear");
});
