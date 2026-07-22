import test from "node:test";
import assert from "node:assert/strict";
import { computeReadyVerdict, runLocalAudit, THUMB_MIN_PX } from "../../lib/audit-local.js";

// A caption fit-shrunk to 40px in a 1080px canvas projects to 40·130/1080 ≈ 4.8px in
// the 3-up IG feed grid — below the THUMB_MIN_PX (6.5) legibility floor.
const readyFor = (canvasW, subtextPx = 40) => ({
  canvasW,
  fontPx: { headline: 220, subtext: subtextPx, date: 0 },
  textBoxes: [], logoBox: null, pinned: [],
});

const signalFor = (dimensionId, canvasW, { floored = true } = {}) => ({
  dimensionId,
  hasText: true,
  hasMedia: false,
  // Flat, legible solid field so the contrast blocker never fires and we isolate the
  // thumbnail-legibility gate.
  zoneContrast: { flat: true, mean: 8 },
  flooredRoles: floored ? [{ label: "Body text" }] : [],
  ready: readyFor(canvasW),
  copy: {},
});

test("thumb-legibility fires on the IG feed grid when a floored caption projects below the floor", () => {
  const { issues } = computeReadyVerdict(signalFor("ig_square", 1080), "ig_square");
  const hit = issues.find(i => i.id === "thumb-legibility");
  assert.ok(hit, "expected a thumb-legibility finding on ig_square");
  assert.equal(hit.field, "subtext", "the finding names the fit-shrunk copy field for a one-tap shorten action");
  assert.equal(hit.fix, null, "no incoherent band fix on a size finding");
  assert.ok(4.8 < THUMB_MIN_PX);
});

test("thumb-legibility does NOT false-positive on wide platform formats (twitter/facebook/banner)", () => {
  for (const [dim, w] of [["twitter", 1600], ["facebook", 1200], ["banner", 1500]]) {
    const { issues } = computeReadyVerdict(signalFor(dim, w), dim);
    assert.ok(!issues.some(i => i.id === "thumb-legibility"),
      `${dim}: a wide format is never shown as a 3-up square thumbnail — must not fire`);
  }
});

test("thumb-legibility verifies the remedy: it does not fire when the role is not fit-shrunk", () => {
  // Same tiny projected size, but the caption is NOT floored — shortening wouldn't
  // grow it, so claiming "shortening lets it render larger" would be dishonest.
  const { issues } = computeReadyVerdict(signalFor("ig_square", 1080, { floored: false }), "ig_square");
  assert.ok(!issues.some(i => i.id === "thumb-legibility"));
});

test("type-size-floor carries the fit-shrunk field so its action can shorten the copy", () => {
  const findings = runLocalAudit({
    dimensionId: "ig_square", hasText: true,
    zoneContrast: { flat: true, mean: 8 },
    flooredRoles: [{ label: "Body text" }],
    ready: { textBoxes: [], logoBox: null, pinned: [] },
    copy: {},
  });
  const floor = findings.find(f => f.id === "type-size-floor");
  assert.ok(floor, "expected a type-size-floor finding");
  assert.equal(floor.field, "subtext");
});

test("ready verdict trusts measured platform constraints over stale ready boxes", () => {
  const signal=signalFor("story",1080,{floored:false});
  signal.ready={...signal.ready,textBoxes:[]};
  signal.constraintResult={
    version:1,status:"blocked",errors:[],deferredRelationIds:[],
    evaluatedRelationIds:["content:hero-avoids-protected:platform-top"],
    violations:[{
      ruleId:"format.platform-occlusion",
      zoneIds:["content:hero","protected:platform-top"],
      geometry:{from:{x:0.1,y:0.04,w:0.8,h:0.18},to:{x:0,y:0,w:1,h:0.13}},
    }],
  };
  const {issues}=computeReadyVerdict(signal,"story");
  assert.ok(issues.some(issue=>issue.id==="safe-area-text"));
  assert.ok(!issues.some(issue=>issue.id==="safe-zone-violation"));
});

test("measured clear geometry suppresses the legacy safe-margin false positive", () => {
  const signal=signalFor("story",1080,{floored:false});
  signal.safeZoneViolation=true;
  signal.constraintResult={
    version:1,status:"clear",errors:[],violations:[],deferredRelationIds:[],
    evaluatedRelationIds:["content:hero-avoids-protected:platform-top","content:hero-avoids-protected:platform-bottom"],
  };
  const findings=runLocalAudit(signal);
  assert.ok(!findings.some(finding=>finding.id==="safe-zone-violation"));
});

test("explicit logo clearance uses the shared measured constraint result", () => {
  const findings=runLocalAudit({
    dimensionId:"ig_square",hasText:true,hasMedia:false,
    zoneContrast:{flat:true,mean:8},flooredRoles:[],copy:{},ready:{textBoxes:[],logoBox:null,pinned:[]},
    logo:{explicit:true,overlapsText:false},
    constraintResult:{
      version:1,status:"blocked",errors:[],deferredRelationIds:[],
      evaluatedRelationIds:["mark-clears:content:hero"],
      violations:[{ruleId:"logo.no-text-overlap",zoneIds:["mark:primary","content:hero"]}],
    },
  });
  assert.ok(findings.some(finding=>finding.id==="logo-overlap-text"));
});

test("logo subject protection uses shared measured evidence and an executable move", () => {
  const findings=runLocalAudit({
    dimensionId:"ig_square",hasText:false,hasMedia:true,
    zoneContrast:null,flooredRoles:[],copy:{},ready:{textBoxes:[],logoBox:null,pinned:[]},
    logo:{explicit:true,inFocalBand:false,suggestPosition:"bottom-left"},
    constraintResult:{
      version:1,status:"blocked",errors:[],deferredRelationIds:[],
      evaluatedRelationIds:["mark:primary-avoids-protected:media-subject"],
      violations:[{ruleId:"logo.no-subject-overlap",zoneIds:["mark:primary","protected:media-subject"]}],
    },
  });
  const finding=findings.find(item=>item.id==="logo-focal-band");
  assert.deepEqual(finding.fix,{logoPosition:"bottom-left"});
});

// ── (2026-07-15) copy-stump: the stored-stump advisor surface ────────────────
const stumpSignal = (copy, copyAuthors) => ({
  dimensionId: "ig_square", hasText: true,
  zoneContrast: { flat: true, mean: 8 },
  flooredRoles: [],
  ready: { textBoxes: [], logoBox: null, pinned: [] },
  copy, copyAuthors,
});

test("copy-stump fires on a stored AI-authored dangling fragment and carries the standard action hint", () => {
  const { issues } = computeReadyVerdict(stumpSignal({ subtext: "On the of" }, { subtext: "ai" }), "ig_square");
  const hit = issues.find(f => f.id === "copy-stump");
  assert.ok(hit, "expected a copy-stump finding");
  assert.equal(hit.field, "subtext");
  assert.equal(hit.dropped[0].field, "subtext", "the dropped hint drives the Tighten/Edit/Leave-off action row");
  assert.ok(hit.message.includes("On the of"), "names the actual words (law 2)");
});

test("copy-stump never fires on owner copy, clean endings, or content-word endings", () => {
  for (const [copy, authors] of [
    [{ subtext: "On the of" }, { subtext: "owner" }],          // owner-typed (law 5)
    [{ subtext: "On the of" }, {}],                             // no authorship record
    [{ subtext: "Welcome back to school." }, { subtext: "ai" }],// clean ending
    [{ subtext: "A bright new term" }, { subtext: "ai" }],      // content-word ending
  ]) {
    const { issues } = computeReadyVerdict(stumpSignal(copy, authors), "ig_square");
    assert.ok(!issues.some(f => f.id === "copy-stump"), JSON.stringify(copy));
  }
});
