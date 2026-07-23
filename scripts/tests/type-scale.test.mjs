import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TYPE_SCALE,
  FORMAT_FAMILIES,
  FORMAT_FAMILY_BY_DIMENSION,
  formatFamilyOf,
  legacyStepMult,
  elementStepMult,
  elementStepPx,
  resolveEffectiveStep,
  describeEffectiveStep,
  STEP_MIN_DELTA,
  LADDER_MIN_DELTA,
} from "../../lib/type-scale.mjs";

const LEGACY_LADDER = ["xs", "s", "m", "l", "xl"];
const ELEMENT_LADDER = ["S", "M", "L"];
const delta = (lo, hi) => (hi - lo) / lo;

test("scale table — M/m pinned at 1.0 in every family (fixture invariance)", () => {
  for (const family of FORMAT_FAMILIES) {
    assert.equal(TYPE_SCALE[family].legacy.m, 1.0, `${family} legacy m`);
    assert.equal(TYPE_SCALE[family].element.M, 1.0, `${family} element M`);
  }
});

test("scale table — ladders are strictly monotonic ascending", () => {
  for (const family of FORMAT_FAMILIES) {
    const legacy = LEGACY_LADDER.map(id => TYPE_SCALE[family].legacy[id]);
    const element = ELEMENT_LADDER.map(id => TYPE_SCALE[family].element[id]);
    for (let i = 1; i < legacy.length; i += 1) {
      assert.ok(legacy[i] > legacy[i - 1], `${family} legacy ${LEGACY_LADDER[i]} > ${LEGACY_LADDER[i - 1]}`);
    }
    for (let i = 1; i < element.length; i += 1) {
      assert.ok(element[i] > element[i - 1], `${family} element ${ELEMENT_LADDER[i]} > ${ELEMENT_LADDER[i - 1]}`);
    }
  }
});

test("scale table — adjacent S/M/L steps are perceptibly distinct (>= STEP_MIN_DELTA)", () => {
  for (const family of FORMAT_FAMILIES) {
    const el = TYPE_SCALE[family].element;
    assert.ok(delta(el.S, el.M) >= STEP_MIN_DELTA, `${family} S→M ${delta(el.S, el.M).toFixed(3)}`);
    assert.ok(delta(el.M, el.L) >= STEP_MIN_DELTA, `${family} M→L ${delta(el.M, el.L).toFixed(3)}`);
    // legacy s/m/l share the element anchors, same guarantee.
    const lg = TYPE_SCALE[family].legacy;
    assert.equal(lg.s, el.S, `${family} legacy s == element S`);
    assert.equal(lg.l, el.L, `${family} legacy l == element L`);
    assert.ok(delta(lg.s, lg.m) >= STEP_MIN_DELTA, `${family} legacy s→m`);
    assert.ok(delta(lg.m, lg.l) >= STEP_MIN_DELTA, `${family} legacy m→l`);
  }
});

test("scale table — legacy xs/xl extensions clear the looser ladder floor", () => {
  for (const family of FORMAT_FAMILIES) {
    const lg = TYPE_SCALE[family].legacy;
    assert.ok(delta(lg.xs, lg.s) >= LADDER_MIN_DELTA, `${family} xs→s ${delta(lg.xs, lg.s).toFixed(3)}`);
    assert.ok(delta(lg.l, lg.xl) >= LADDER_MIN_DELTA, `${family} l→xl ${delta(lg.l, lg.xl).toFixed(3)}`);
  }
});

test("scale table — wide keeps the highest S floor; tall spreads the widest L", () => {
  assert.ok(TYPE_SCALE.wide.element.S > TYPE_SCALE.square.element.S, "wide S > square S");
  assert.ok(TYPE_SCALE.square.element.S > TYPE_SCALE.tall.element.S, "square S > tall S");
  assert.ok(TYPE_SCALE.tall.element.L > TYPE_SCALE.square.element.L, "tall L > square L");
  assert.ok(TYPE_SCALE.square.element.L > TYPE_SCALE.wide.element.L, "square L > wide L");
});

test("formatFamilyOf — all six ratified formats map, unknown falls back to square", () => {
  assert.equal(formatFamilyOf("ig_portrait"), "tall");
  assert.equal(formatFamilyOf("story"), "tall");
  assert.equal(formatFamilyOf("ig_square"), "square");
  assert.equal(formatFamilyOf("twitter"), "wide");
  assert.equal(formatFamilyOf("facebook"), "wide");
  assert.equal(formatFamilyOf("banner"), "wide");
  assert.equal(formatFamilyOf("nonsense"), "square");
  assert.equal(formatFamilyOf(null), "square");
  // every mapped dimension resolves to a known family
  for (const family of Object.values(FORMAT_FAMILY_BY_DIMENSION)) {
    assert.ok(FORMAT_FAMILIES.includes(family));
  }
});

test("legacyStepMult / elementStepMult — unknown step resolves to the neutral anchor", () => {
  assert.equal(legacyStepMult("bogus", "square"), 1.0);
  assert.equal(legacyStepMult("l", "tall"), TYPE_SCALE.tall.legacy.l);
  assert.equal(legacyStepMult("s", "nonsense-family"), TYPE_SCALE.square.legacy.s); // family falls back
  assert.equal(elementStepMult("bogus", "tall"), 1.0);
  assert.equal(elementStepMult("L", "wide"), TYPE_SCALE.wide.element.L);
});

test("elementStepPx — arithmetic and family default", () => {
  assert.equal(elementStepPx(200, "M"), 200);
  assert.equal(elementStepPx(200, "S"), 200 * TYPE_SCALE.square.element.S);
  assert.equal(elementStepPx(200, "L", "tall"), 200 * TYPE_SCALE.tall.element.L);
});

test("resolveEffectiveStep — uncapped request survives", () => {
  const r = resolveEffectiveStep({ basePx: 100, step: "L", family: "square" });
  assert.equal(r.requestedStep, "L");
  assert.equal(r.effectiveStep, "L");
  assert.equal(r.capped, false);
  assert.equal(r.requestedPx, 100 * TYPE_SCALE.square.element.L);
  assert.equal(r.effectivePx, r.requestedPx);
});

test("resolveEffectiveStep — capacity clamps L down and reports it honestly (M2)", () => {
  // Base 100, square L=1.28 → wants 128, but the box only fits 100 (== the M target).
  const r = resolveEffectiveStep({ basePx: 100, step: "L", family: "square", capacityPx: 100 });
  assert.equal(r.requestedStep, "L");
  assert.equal(r.effectiveStep, "M");
  assert.equal(r.capped, true);
  assert.equal(r.effectivePx, 100);
  assert.equal(describeEffectiveStep(r), "L (fits as M here)");
});

test("resolveEffectiveStep — clamp to just under M target reports S, never above request", () => {
  // Capacity between S (80) and M (100) target → coarsest step at/under it is S.
  const r = resolveEffectiveStep({ basePx: 100, step: "L", family: "square", capacityPx: 90 });
  assert.equal(r.effectiveStep, "S");
  assert.equal(r.capped, true);
  // A generous capacity never inflates an S request to L.
  const up = resolveEffectiveStep({ basePx: 100, step: "S", family: "square", capacityPx: 500 });
  assert.equal(up.effectiveStep, "S");
  assert.equal(up.capped, false);
});

test("resolveEffectiveStep — floor lifts the painted px and flags atFloor", () => {
  const r = resolveEffectiveStep({ basePx: 100, step: "S", family: "square", capacityPx: 40, floorPx: 70 });
  assert.equal(r.effectivePx, 70);
  assert.equal(r.atFloor, true);
});

test("describeEffectiveStep — plain label when not capped, null-safe", () => {
  assert.equal(describeEffectiveStep(resolveEffectiveStep({ basePx: 100, step: "M" })), "M");
  assert.equal(describeEffectiveStep(null), "M");
});
