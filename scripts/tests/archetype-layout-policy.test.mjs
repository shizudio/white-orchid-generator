import test from "node:test";
import assert from "node:assert/strict";
import {
  archetypeFormatClass,
  isTextOnlyArchetype,
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

test("a saved design referencing a RETIRED variant index degrades to the default variant, never crashes", () => {
  // (Client ruling 2026-07-23) The 4th shape_cutout variant (the dusty-pink
  // orchid-petal) was removed. Designs saved with archVariant:3 must still render:
  // the ring is now length 3, so index 3 wraps modulo back to variant 0 — a fully
  // defined variant, never `undefined`. This locks that graceful-degradation contract.
  const THREE_VARIANT_ARCH = { ...ARCHETYPE, variants: ARCHETYPE.variants.concat(
    { bg: "sage", ink: "burnham", shapeId: "shape-3", klass: "light" },
    { bg: "whiteSmoke", ink: "burnham", shapeId: "shape-1", klass: "light" },
  ) };
  const staleIndex = 5; // one past the last valid index (0..2 after a retirement)
  const resolved = resolveArchetypeVariant(THREE_VARIANT_ARCH, staleIndex);
  assert.ok(resolved, "resolves to a defined variant object, not undefined");
  assert.equal(typeof resolved.bg, "string", "field colour is present");
  assert.equal(typeof resolved.shapeId, "string", "shape is present");
  // Index 5 modulo 4 → variant 1; the point is it lands on a REAL variant.
  assert.deepEqual(
    { bg: resolved.bg, shapeId: resolved.shapeId },
    { bg: THREE_VARIANT_ARCH.variants[staleIndex % THREE_VARIANT_ARCH.variants.length].bg,
      shapeId: THREE_VARIANT_ARCH.variants[staleIndex % THREE_VARIANT_ARCH.variants.length].shapeId },
  );
  // A materialization through the retired index must not throw either.
  assert.doesNotThrow(() => materializeArchetypeLayout(THREE_VARIANT_ARCH, "twitter", staleIndex));
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


// ── (client ruling 2026-07-27, element-placement-spec §7d) text-only detection ──
// The photo-add auto-switch fires ONLY on archetypes with no media model at all.
// Derived from geometry (the §7b honesty rule): no photo column, no mask, no
// card, not full-bleed. Frozen here so a geometry edit or a new archetype can't
// silently change which layouts auto-switch on a photo add.
test("isTextOnlyArchetype: only a no-media-model archetype is text-only", () => {
  // A manifesto-like text field: no photo/mask/card, not fullBleed → text-only.
  assert.equal(isTextOnlyArchetype({ elements: { hero: { x: 0.1, y: 0.2, w: 0.8, h: 0.4 } } }), true);
  // An editorial split (bounded photo column) has a media model.
  assert.equal(isTextOnlyArchetype({ elements: { hero: {}, photo: { x: 0.55, y: 0, w: 0.45, h: 1 } } }), false);
  // A mask window (petal_window / shape_cutout) has a media model.
  assert.equal(isTextOnlyArchetype({ special: "petalWindow", elements: { mask: { x: 0.46, y: 0.34, w: 0.52, h: 0.54 } } }), false);
  // A floated card hosts the photo.
  assert.equal(isTextOnlyArchetype({ special: "floatedCard", elements: { card: { x: 0.2, y: 0.2, w: 0.6, h: 0.5 } } }), false);
  // Full-bleed IS the photo — never text-only.
  assert.equal(isTextOnlyArchetype({ fullBleed: true, elements: { hero: {} } }), false);
  // The free layout (no archetype) is not in §7d's scope.
  assert.equal(isTextOnlyArchetype(null), false);
});
