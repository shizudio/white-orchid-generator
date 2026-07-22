// Pure tests for the extracted text-element placement solver (PRD §B1).
// Proves date + eyebrow placement can be exercised without DOM or Canvas painting:
// the solver takes injected measure/surface adapters and returns final coordinates +
// font/ink/band, and the candidate ladders are byte-identical to the extracted painter.
import test from "node:test";
import assert from "node:assert/strict";
import {
  placeTextElement, makeDateClass, makeEyebrowClass, makeBadgeClass,
  dateFurnitureObstacles, mergeSafeMargins, buildDateAnchors, buildEyebrowAnchors,
  buildContentBlockAnchors, makeHeadingClass, makeSubheadingClass, makeBodyClass,
  makeSupportClass, resolveElementClassConfig, buildElementAnchors,
  ELEMENT_SIZE_STEPS, elementStepPx,
} from "../../lib/element-placement-solver.mjs";

const F = { title: "TitleFace", body: "BodyFace", subtitle: "SubFace" };
const solidSurface = () => null;               // solid field → always legible (no photo)
const fixedMeasure = (w = 200, h = 60) => () => ({ w, h });

// A fixture matching the editorial date geometry.
const GEOM = {
  heroBox: { x: 100, y: 200, w: 800, h: 300 },
  usedH: 250, dGap: 40, supBelow: true, supBottom: 600,
  safe: { l: 0.05, r: 0.05, t: 0.06, b: 0.08 }, w: 1080, h: 1080, align: "left",
};

test("buildDateAnchors — exact ids + order + coordinates (painter parity)", () => {
  const cands = buildDateAnchors(GEOM);
  assert.deepEqual(cands.map(c => c.id),
    ["below-hero", "below-support", "above-hero", "corner-bl", "corner-br", "corner-tl", "corner-tr", "bottom-center"]);
  const at = (id, bw = 200, bh = 60) => cands.find(c => c.id === id).at(bw, bh);
  assert.deepEqual(at("below-hero"), { x: 100, y: 490 });          // heroBox.y+usedH+dGap
  assert.deepEqual(at("below-support"), { x: 100, y: 640 });        // supBottom+dGap
  assert.deepEqual(at("above-hero"), { x: 100, y: 100 });           // heroBox.y-dGap-bh
  assert.deepEqual(at("corner-bl"), { x: 54, y: 933.6 });           // l*w, (1-b)*h-bh
  assert.deepEqual(at("corner-tr"), { x: 826, y: 64.8 });           // (1-r)*w-bw, t*h
  assert.deepEqual(at("bottom-center"), { x: 440, y: 933.6 });      // (w-bw)/2
});

test("buildDateAnchors — below-support absent when no caption below", () => {
  const cands = buildDateAnchors({ ...GEOM, supBelow: false });
  assert.ok(!cands.some(c => c.id === "below-support"));
  assert.equal(cands.length, 7);
});

test("buildDateAnchors — center/right alignment shifts the column anchors", () => {
  const center = buildDateAnchors({ ...GEOM, align: "center" });
  assert.deepEqual(center.find(c => c.id === "below-hero").at(200, 60), { x: 400, y: 490 }); // 100+(800-200)/2
  const right = buildDateAnchors({ ...GEOM, align: "right" });
  assert.deepEqual(right.find(c => c.id === "below-hero").at(200, 60), { x: 700, y: 490 });  // 100+800-200
});

test("buildEyebrowAnchors — exact ids + order (painter parity)", () => {
  const cands = buildEyebrowAnchors({
    heroBox: GEOM.heroBox, supBox: true, supBottom: 600, ebGap: 30, usedH: 250,
    safe: GEOM.safe, w: 1080, h: 1080, align: "left",
  });
  assert.deepEqual(cands.map(c => c.id),
    ["above-hero", "corner-tl", "corner-tr", "top-center", "below-hero", "below-support", "corner-bl", "corner-br"]);
  assert.deepEqual(cands.find(c => c.id === "above-hero").at(200, 40), { x: 100, y: 130 }); // heroBox.y-ebGap-bh
  assert.deepEqual(cands.find(c => c.id === "top-center").at(200), { x: 440, y: 64.8 });
});

test("buildEyebrowAnchors — below-support absent when no caption", () => {
  const cands = buildEyebrowAnchors({
    heroBox: GEOM.heroBox, supBox: false, supBottom: 0, ebGap: 30, usedH: 250,
    safe: GEOM.safe, w: 1080, h: 1080, align: "left",
  });
  assert.ok(!cands.some(c => c.id === "below-support"));
  assert.equal(cands.length, 7);
});

test("placeTextElement — clean solid field picks the top-priority candidate at rung 0", () => {
  const cands = buildDateAnchors(GEOM);
  const sol = placeTextElement({
    cfg: makeDateClass(60, F), candidates: cands, hardObstacles: [], softObstacles: [],
    safe: { x0: 0, y0: 0, x1: 1080, y1: 1080, tolX: 0, tolY: 0 }, focalBox: null,
    measure: fixedMeasure(200, 60), surface: solidSurface, baseInk: "#000", inkPoles: ["#000", "#fff"],
  });
  assert.equal(sol.id, "below-hero");
  assert.deepEqual([sol.x, sol.y, sol.w, sol.h], [100, 490, 200, 60]);
  assert.equal(sol.face, F.title);
  assert.equal(sol.weight, 300);
  assert.equal(sol.band, false);
});

test("placeTextElement — a hard obstacle over the prior yields the next clean candidate", () => {
  const cands = buildDateAnchors(GEOM);
  // Cover both below-hero (y490) and below-support (y640) so the solver falls to above-hero.
  const obstacle = { x: 0, y: 480, w: 1080, h: 300 };
  const sol = placeTextElement({
    cfg: makeDateClass(60, F), candidates: cands, hardObstacles: [obstacle], softObstacles: [],
    safe: { x0: 0, y0: 0, x1: 1080, y1: 1080, tolX: 0, tolY: 0 }, focalBox: null,
    measure: fixedMeasure(200, 60), surface: solidSurface, baseInk: "#000", inkPoles: ["#000", "#fff"],
  });
  assert.equal(sol.id, "above-hero");
});

test("placeTextElement — busy/low-contrast surface escalates to the band last resort", () => {
  const busy = () => ({ min: 2.0, maxV: 0.9 });  // fails optical + AA at every non-band rung
  const cands = buildDateAnchors(GEOM);
  const sol = placeTextElement({
    cfg: makeDateClass(60, F), candidates: cands, hardObstacles: [], softObstacles: [],
    safe: { x0: 0, y0: 0, x1: 1080, y1: 1080, tolX: 0, tolY: 0 }, focalBox: null,
    measure: fixedMeasure(200, 60), surface: busy, baseInk: "#000", inkPoles: ["#000"],
  });
  assert.equal(sol.band, true);
  assert.equal(sol.id, "below-hero");
});

test("placeTextElement — noBand makes an unresolvable surface an HONEST refusal (null)", () => {
  const busy = () => ({ min: 2.0, maxV: 0.9 });
  const cands = buildDateAnchors(GEOM);
  const sol = placeTextElement({
    cfg: makeDateClass(60, F, { noBand: true }), candidates: cands, hardObstacles: [], softObstacles: [],
    safe: { x0: 0, y0: 0, x1: 1080, y1: 1080, tolX: 0, tolY: 0 }, focalBox: null,
    measure: fixedMeasure(200, 60), surface: busy, baseInk: "#000", inkPoles: ["#000"],
  });
  assert.equal(sol, null);
});

test("placeTextElement — soft obstacles are honoured only in the first pass", () => {
  const cands = buildDateAnchors(GEOM);
  // Soft obstacle covers below-hero; the hard-only second pass still places it there.
  const soft = [{ x: 0, y: 480, w: 1080, h: 40 }];
  const sol = placeTextElement({
    cfg: makeDateClass(60, F), candidates: cands, hardObstacles: [], softObstacles: soft,
    safe: { x0: 0, y0: 0, x1: 1080, y1: 1080, tolX: 0, tolY: 0 }, focalBox: null,
    measure: fixedMeasure(200, 60), surface: solidSurface, baseInk: "#000", inkPoles: ["#000", "#fff"],
  });
  // below-support (y640) clears the soft obstacle in pass 1, so it wins over below-hero.
  assert.equal(sol.id, "below-support");
});

test("makeDateClass — rung ladder faces/weights, noBand drops the band rung", () => {
  const full = makeDateClass(48, F).escalate.rungs;
  assert.equal(full.length, 5);
  assert.deepEqual(full[0], { face: F.title, weight: 300 });
  assert.equal(full[4].band, true);
  const noBand = makeDateClass(48, F, { noBand: true }).escalate.rungs;
  assert.equal(noBand.length, 4);
  assert.ok(!noBand.some(r => r.band));
});

test("makeEyebrowClass / makeBadgeClass — sanctioned registers", () => {
  const eb = makeEyebrowClass(40, F).escalate.rungs;
  assert.deepEqual(eb[0], { face: F.subtitle, weight: 400 });
  const badge = makeBadgeClass(30, F).escalate;
  assert.equal(badge.rungs.length, 1);
  assert.equal(badge.contrastFloor, 0);              // opaque pill → ladder never fires
});

test("mergeSafeMargins — tighter of editorial vs platform per side; null platform passthrough", () => {
  const sm = { l: 0.05, r: 0.05, t: 0.06, b: 0.08 };
  const ps = { left: 0.03, right: 0.09, top: 0.10, bottom: 0.02 };
  assert.deepEqual(mergeSafeMargins(sm, ps), { l: 0.05, r: 0.09, t: 0.10, b: 0.08 });
  assert.deepEqual(mergeSafeMargins(sm, null), { l: 0.05, r: 0.05, t: 0.06, b: 0.08 });
});

/* ── Slice 2b: added-element anchors + class configs ──────────────────────────── */

test("buildContentBlockAnchors — exact ids + order + coordinates (column stack)", () => {
  const cands = buildContentBlockAnchors({
    heroBox: GEOM.heroBox, usedH: 250, gap: 40, supBelow: true, supBottom: 600,
    safe: GEOM.safe, w: 1080, h: 1080, align: "left",
  });
  assert.deepEqual(cands.map(c => c.id),
    ["below-support", "below-hero", "above-hero", "column-top", "corner-tl", "corner-bl", "corner-br"]);
  assert.deepEqual(cands.find(c => c.id === "below-support").at(200, 60), { x: 100, y: 640 });   // supBottom+gap
  assert.deepEqual(cands.find(c => c.id === "below-hero").at(200, 60), { x: 100, y: 490 });      // heroBox.y+usedH+gap
  assert.deepEqual(cands.find(c => c.id === "above-hero").at(200, 60), { x: 100, y: 100 });      // heroBox.y-gap-bh
  assert.deepEqual(cands.find(c => c.id === "column-top").at(200), { x: 100, y: 64.8 });         // ax, t*h
  assert.deepEqual(cands.find(c => c.id === "corner-br").at(200, 60), { x: 826, y: 933.6 });
});

test("buildContentBlockAnchors — below-support absent when no caption below; centre align", () => {
  const noSup = buildContentBlockAnchors({
    heroBox: GEOM.heroBox, usedH: 250, gap: 40, supBelow: false, supBottom: 0,
    safe: GEOM.safe, w: 1080, h: 1080, align: "left",
  });
  assert.ok(!noSup.some(c => c.id === "below-support"));
  assert.equal(noSup.length, 6);
  const center = buildContentBlockAnchors({
    heroBox: GEOM.heroBox, usedH: 250, gap: 40, supBelow: false, supBottom: 0,
    safe: GEOM.safe, w: 1080, h: 1080, align: "center",
  });
  assert.deepEqual(center.find(c => c.id === "below-hero").at(200, 60), { x: 400, y: 490 }); // 100+(800-200)/2
});

test("makeHeadingClass — serif hero register ladder; heavySans variant; noBand drops band", () => {
  const serif = makeHeadingClass(80, F).escalate.rungs;
  assert.equal(serif.length, 5);
  assert.deepEqual(serif[0], { face: F.title, weight: 400 });
  assert.equal(serif[4].band, true);
  const heavy = makeHeadingClass(80, F, { register: "heavySans" }).escalate.rungs;
  assert.deepEqual(heavy[0], { face: F.subtitle, weight: 700 });
  assert.equal(heavy[heavy.length - 1].band, true);
  const noBand = makeHeadingClass(80, F, { noBand: true }).escalate.rungs;
  assert.ok(!noBand.some(r => r.band));
  assert.equal(noBand.length, 4);
});

test("makeSupportClass — subheading/body share the F.body support register", () => {
  const rungs = makeSupportClass(40, F).escalate.rungs;
  assert.deepEqual(rungs[0], { face: F.body, weight: 400 });
  assert.equal(rungs[4].band, true);
  // subheading + body are the SAME builder, differing only by caller-supplied px.
  assert.equal(makeSubheadingClass, makeSupportClass);
  assert.equal(makeBodyClass, makeSupportClass);
});

test("resolveElementClassConfig — 1:1 class → ratified config binding", () => {
  assert.deepEqual(resolveElementClassConfig("heading", { preferredPx: 80, F }).escalate.rungs[0], { face: F.title, weight: 400 });
  assert.deepEqual(resolveElementClassConfig("subheading", { preferredPx: 40, F }).escalate.rungs[0], { face: F.body, weight: 400 });
  assert.deepEqual(resolveElementClassConfig("body", { preferredPx: 32, F }).escalate.rungs[0], { face: F.body, weight: 400 });
  // caption defaults to the date edge line; opts.eyebrow selects the tracked micro-label.
  assert.deepEqual(resolveElementClassConfig("caption", { preferredPx: 28, F }).escalate.rungs[0], { face: F.title, weight: 300 });
  assert.deepEqual(resolveElementClassConfig("caption", { preferredPx: 28, F, opts: { eyebrow: true } }).escalate.rungs[0], { face: F.subtitle, weight: 400 });
  // cta → opaque badge: self-legible, ladder never fires.
  assert.equal(resolveElementClassConfig("cta", { preferredPx: 30, F }).contrastFloor ?? resolveElementClassConfig("cta", { preferredPx: 30, F }).escalate.contrastFloor, 0);
  assert.equal(resolveElementClassConfig("bogus", { preferredPx: 10, F }), null);
});

test("buildElementAnchors — class routes to its sanctioned ladder", () => {
  const geom = { heroBox: GEOM.heroBox, usedH: 250, gap: 40, dGap: 40, ebGap: 30,
    supBelow: true, supBox: true, supBottom: 600, safe: GEOM.safe, w: 1080, h: 1080, align: "left" };
  assert.equal(buildElementAnchors("heading", geom)[0].id, "below-support");   // content-block ladder
  assert.equal(buildElementAnchors("body", geom)[0].id, "below-support");
  assert.equal(buildElementAnchors("caption", geom)[0].id, "below-hero");      // date ladder
  assert.equal(buildElementAnchors("caption", { ...geom, eyebrow: true })[0].id, "above-hero"); // eyebrow ladder
  assert.equal(buildElementAnchors("cta", geom)[0].id, "below-hero");          // badge on the date corners
  assert.deepEqual(buildElementAnchors("nope", geom), []);
});

test("resolveElementClassConfig + placeTextElement — an added heading places at rung 0 on a clean field", () => {
  const geom = { heroBox: GEOM.heroBox, usedH: 250, gap: 40, supBelow: false, supBottom: 0,
    safe: GEOM.safe, w: 1080, h: 1080, align: "left" };
  const cfg = resolveElementClassConfig("heading", { preferredPx: 80, F });
  const cands = buildElementAnchors("heading", geom);
  const sol = placeTextElement({
    cfg, candidates: cands, hardObstacles: [], softObstacles: [],
    safe: { x0: 0, y0: 0, x1: 1080, y1: 1080, tolX: 0, tolY: 0 }, focalBox: null,
    measure: fixedMeasure(300, 90), surface: solidSurface, baseInk: "#000", inkPoles: ["#000", "#fff"],
  });
  assert.equal(sol.id, "below-hero");
  assert.equal(sol.face, F.title);
  assert.equal(sol.weight, 400);
  assert.equal(sol.band, false);
});

test("ELEMENT_SIZE_STEPS / elementStepPx — S/M/L multipliers within range", () => {
  assert.deepEqual({ ...ELEMENT_SIZE_STEPS }, { S: 0.82, M: 1, L: 1.25 });
  assert.equal(elementStepPx(100, "S"), 82);
  assert.equal(elementStepPx(100, "M"), 100);
  assert.equal(elementStepPx(100, "L"), 125);
  assert.equal(elementStepPx(100, "bogus"), 100);   // unknown step → M
});

test("dateFurnitureObstacles — projects rule/index/counterweight/badge boxes; junk-safe", () => {
  const mat = { furniture: [
    { type: "rule", x: 0.1, y: 0.2, w: 0.3 },
    { type: "index", x: 0.8, y: 0.1, align: "right" },
    null,
    { type: "badge", x: 0.1, y: 0.9 },
  ] };
  const obs = dateFurnitureObstacles(mat, 1000, 1000);
  assert.equal(obs.length, 3);
  assert.deepEqual(obs[0], { x: 100, y: 185, w: 300, h: 30 });     // rule
  assert.equal(dateFurnitureObstacles({}, 1000, 1000).length, 0);  // no furniture → empty
  assert.equal(dateFurnitureObstacles(null, 1000, 1000).length, 0);
});
