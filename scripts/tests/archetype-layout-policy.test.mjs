import test from "node:test";
import assert from "node:assert/strict";
import {
  archetypeFormatClass,
  materializeArchetypeLayout,
  resolveArchetypeElements,
  resolveArchetypeVariant,
} from "../../lib/archetype-layout-policy.mjs";

const ARCHETYPE = {
  elements: {
    hero: { x: 0.1, y: 0.2, w: 0.7, h: 0.2 },
    support: { x: 0.1, y: 0.5, w: 0.6, h: 0.1 },
    mask: { x: 0.6, y: 0.1, w: 0.3, h: 0.7 },
    logo: { position: "bottom-right", sizeId: "s" },
  },
  perDim: {
    wide: { hero: { x: 0.08, w: 0.42 } },
    facebook: { hero: { x: 0.12 } },
  },
  special: "shapeCutout",
  heroRegister: "heavySans",
  photoTreatment: "duotone",
  scaleRatio: { heroCapFrac: 0.2, heroToSupport: 6 },
  variants: [
    { bg: "whiteSmoke", ink: "burnham", shapeId: "shape-1", klass: "light" },
    { bg: "burnham", ink: "whiteSmoke", shapeId: "shape-2", klass: "dark" },
  ],
};

test("format classes and exact overrides resolve deterministically", () => {
  assert.equal(archetypeFormatClass("twitter"), "wide");
  assert.equal(archetypeFormatClass("facebook"), "wide");
  const twitter = resolveArchetypeElements(ARCHETYPE, "twitter");
  const facebook = resolveArchetypeElements(ARCHETYPE, "facebook");
  assert.equal(twitter.hero.x, 0.08);
  assert.equal(twitter.hero.w, 0.42);
  assert.equal(facebook.hero.x, 0.12, "exact dimension wins over format class");
  assert.equal(facebook.hero.w, 0.7, "exact override merges over the base role");
});

test("variant rings support positive and negative cycling", () => {
  assert.equal(resolveArchetypeVariant(ARCHETYPE, 1).shapeId, "shape-2");
  assert.equal(resolveArchetypeVariant(ARCHETYPE, -1).shapeId, "shape-2");
  assert.equal(resolveArchetypeVariant(ARCHETYPE, 2).shapeId, "shape-1");
});

test("shape-cutout materialization produces structural intent, not paint instructions", () => {
  const result = materializeArchetypeLayout(ARCHETYPE, "twitter", 1);
  assert.deepEqual(result.photoFrame, {
    type: "shapeMask",
    box: { x: 0.6, y: 0.1, w: 0.3, h: 0.7, align: "left" },
    shapeId: "shape-2",
  });
  assert.deepEqual(result.roles.hero, {
    x: 0.08,
    y: 0.2,
    w: 0.42,
    h: 0.2,
    align: "left",
  });
  assert.equal(result.register, "heavySans");
  assert.equal(result.heroToSupport, 6);
  assert.equal(result.logoPos, "bottom-right");
});

test("materialization never mutates archetype specification data", () => {
  const before = structuredClone(ARCHETYPE);
  materializeArchetypeLayout(ARCHETYPE, "facebook", 0);
  assert.deepEqual(ARCHETYPE, before);
});

