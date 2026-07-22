import test from "node:test";
import assert from "node:assert/strict";
import {
  dodgeMessagePillFromFocal,
  planScheduleRows,
  synthesizeMissingEditorialRoles,
} from "../../lib/editorial-placement-policy.mjs";

const CANVAS = {
  width: 1000,
  height: 1000,
  safe: { t: 0.08, b: 0.08, l: 0.08, r: 0.08 },
};

test("authored support remains reachable when an archetype has no support zone", () => {
  const result = synthesizeMissingEditorialRoles({
    ...CANVAS,
    heroBox: { x: 100, y: 200, w: 600, h: 200 },
    supportBox: null,
    labelBox: null,
    supportText: "A supporting thought",
    eyebrowText: "",
    roles: { hero: {} },
    furniture: [],
    provenanceElements: { hero: {} },
    special: null,
  });
  assert.deepEqual(
    { x:result.supportBox.x,w:result.supportBox.w,h:result.supportBox.h },
    { x:100,w:600,h:60 },
  );
  assert.ok(Math.abs(result.supportBox.y-415)<1e-9);
});

test("schedule rows and index furniture do not create competing synthetic roles", () => {
  const schedule = synthesizeMissingEditorialRoles({
    ...CANVAS,
    heroBox: { x:100,y:200,w:600,h:400 },
    supportBox: null,
    labelBox: null,
    supportText: "2.30 Pick-up | 3.30 Free play",
    eyebrowText: "A DAY HERE",
    roles: { hero: {} },
    furniture: [{ type:"index" }],
    provenanceElements: { hero: {} },
    special: "scheduleRows",
  });
  assert.equal(schedule.supportBox, null);
  assert.equal(schedule.labelBox, null);
  assert.equal(schedule.hasIndexCarrier, true);
});

test("message pills dodge a confident focal subject as one text group", () => {
  const result = dodgeMessagePillFromFocal({
    ...CANVAS,
    heroBox: { x:300,y:600,w:400,h:150 },
    supportBox: { x:320,y:770,w:360,h:80 },
    labelBox: { x:320,y:550,w:250,h:40 },
    focal: { fx:0.6,fy:0.65,confidence:0.8 },
    photoGeometry: { cx:500,cy:500,dw:1000,dh:1000 },
  });
  assert.equal(result.shifted, true);
  assert.equal(result.heroBox.x, 80);
  assert.equal(result.supportBox.x, 100);
  assert.equal(result.labelBox.x, 100);
});

test("low-confidence focal estimates never disturb authored placement", () => {
  const heroBox = { x:300,y:600,w:400,h:150 };
  const result = dodgeMessagePillFromFocal({
    ...CANVAS,
    heroBox,
    supportBox: null,
    labelBox: null,
    focal: { fx:0.6,fy:0.65,confidence:0.2 },
    photoGeometry: { cx:500,cy:500,dw:1000,dh:1000 },
  });
  assert.equal(result.heroBox, heroBox);
  assert.equal(result.shifted, false);
});

test("schedule planning parses bounded rows and returns paint-ready rhythm", () => {
  const result = planScheduleRows({
    raw: "*2.30* School pick-up | 3.30 Free play\n4.00 Tea together",
    box: { x:100,y:200,w:800,h:600 },
    width:1000,
    height:1000,
    stripMarkers: (value) => value.replaceAll("*", ""),
  });
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows[0], {
    time:"2.30",
    activity:"School pick-up",
    centerY:300,
    ruleY:399,
  });
  assert.equal(result.rows[2].ruleY, null);
  assert.equal(result.timeSize, 84);
  assert.ok(Math.abs(result.activitySize-46.4)<1e-9);
});

test("empty schedule copy produces no paint plan", () => {
  assert.equal(planScheduleRows({
    raw:"  ",box:{x:0,y:0,w:100,h:100},width:100,height:100,
  }), null);
});
