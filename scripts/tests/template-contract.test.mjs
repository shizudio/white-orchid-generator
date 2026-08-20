// ── THE TEMPLATE CONTRACT (docs/template-system-spec.md §6) ─────────────────
// §6.2 is the hard rule the whole design rests on: "Constraints are DATA, never
// behaviour." These tests prove the validator FAILS CLOSED — a template that has
// started re-growing the solver in data cannot be loaded at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOTS, TEXT_SLOTS, NON_TEXT_SLOTS, DIMENSIONS, DIMENSION_IDS,
  validateTemplate, contrastRatio, slotConstraint, MIN_PAIR_CONTRAST,
} from '../../lib/templates/template-contract.mjs';

/** A minimal template that VALIDATES — every negative test mutates a copy of it. */
function baseline() {
  const box = { x: 0.1, y: 0.1, w: 0.8, h: 0.1 };
  const dimRow = (charBudget) => Object.fromEntries(
    ['portrait', 'square'].map((d) => [d, { present: true, required: false, maxLines: 2, charBudget, box }]),
  );
  const inert = { present: false };
  return {
    id: 't', name: 'T', purpose: 'why you would choose this', version: 1,
    dimensions: { portrait: { w: 1080, h: 1350 }, square: { w: 1080, h: 1080 } },
    allowedLogoPositions: ['bottom-right'],
    colourPairs: [
      { id: 'a', label: 'A', bg: '#FFFFFF', ink: '#000000', contrast: 21, klass: 'light' },
      { id: 'b', label: 'B', bg: '#254E48', ink: '#F5F6E7', contrast: 8.5, klass: 'dark' },
    ],
    motif: 'none',
    paintOrder: ['heading'],
    registers: { heading: { face: 'title', weight: 500, lineRatio: 1.02 } },
    slots: {
      eyebrow: inert, body: inert, pill: inert, attribution: inert,
      photo: inert, motif: inert, colourPair: inert, logo: inert,
      heading: { present: true, charBudget: 30, dimensions: dimRow(30) },
    },
  };
}

test('the slot vocabulary is the CLOSED set from §6.1 — and there is no `date` slot', () => {
  assert.deepEqual([...TEXT_SLOTS], ['eyebrow', 'heading', 'body', 'pill', 'attribution']);
  assert.deepEqual([...NON_TEXT_SLOTS], ['photo', 'logo', 'colourPair', 'motif']);
  assert.equal(SLOTS.length, 9);
  assert.ok(!SLOTS.includes('date'), '§6.1: a date is served by heading/eyebrow/body — never its own slot');
});

test('the four dimensions are exactly the four (banner is retired, twitter/facebook merged)', () => {
  assert.deepEqual([...DIMENSION_IDS].sort(), ['landscape', 'portrait', 'square', 'story']);
  assert.deepEqual(
    Object.fromEntries(DIMENSION_IDS.map((d) => [d, [DIMENSIONS[d].w, DIMENSIONS[d].h]])),
    { portrait: [1080, 1350], story: [1080, 1920], square: [1080, 1080], landscape: [1600, 900] },
  );
  assert.ok(!DIMENSIONS.banner && !DIMENSIONS.twitter && !DIMENSIONS.facebook);
});

test('the baseline template validates', () => {
  const { valid, errors } = validateTemplate(baseline());
  assert.deepEqual(errors, []);
  assert.ok(valid);
});

// ── §6.2 CONSTRAINTS ARE DATA, NEVER BEHAVIOUR ──────────────────────────────
test('REJECTS a template carrying a function anywhere in the tree', () => {
  const t = baseline();
  t.slots.heading.dimensions.portrait.charBudget = 30;
  t.slots.heading.shrinkWhenLong = (n) => n;
  const { valid, errors } = validateTemplate(t);
  assert.ok(!valid);
  assert.ok(errors.some((e) => /FUNCTION/.test(e)), errors.join('\n'));
});

test('REJECTS a nested function (deep in a per-dimension row)', () => {
  const t = baseline();
  t.slots.heading.dimensions.square.box = { x: 0, y: 0, w: 1, h: () => 0.5 };
  assert.ok(!validateTemplate(t).valid);
});

test('REJECTS a computed accessor — "if body is long then shrink heading" in disguise', () => {
  const t = baseline();
  Object.defineProperty(t.slots.heading, 'charBudget', { get: () => 30, enumerable: true, configurable: true });
  const { valid, errors } = validateTemplate(t);
  assert.ok(!valid);
  assert.ok(errors.some((e) => /accessor/.test(e)), errors.join('\n'));
});

test('REJECTS a RegExp — a matcher is behaviour', () => {
  const t = baseline();
  t.slots.heading.match = /abc/;
  assert.ok(!validateTemplate(t).valid);
});

test('REJECTS rule-shaped keys by NAME, even when their value is inert data', () => {
  for (const key of ['if', 'when', 'condition', 'compute', 'rule', 'derive']) {
    const t = baseline();
    t.slots.heading[key] = { some: 'plain data' };
    const { valid, errors } = validateTemplate(t);
    assert.ok(!valid, `'${key}' should be rejected`);
    assert.ok(errors.some((e) => /rule-shaped/.test(e)));
  }
});

test('REJECTS a class instance and a circular reference (not readable as a table)', () => {
  class Thing { constructor() { this.a = 1; } }
  const t1 = baseline(); t1.slots.heading.thing = new Thing();
  assert.ok(!validateTemplate(t1).valid);
  const t2 = baseline(); t2.self = t2;
  assert.ok(!validateTemplate(t2).valid);
});

// ── §6.1 / §6.2 the table itself ────────────────────────────────────────────
test('REJECTS a slot outside the closed vocabulary (e.g. a re-added `date`)', () => {
  const t = baseline();
  t.slots.date = { present: true, charBudget: 10, dimensions: {} };
  const { valid, errors } = validateTemplate(t);
  assert.ok(!valid);
  assert.ok(errors.some((e) => /CLOSED slot vocabulary/.test(e)));
});

test('REJECTS a template that omits a slot from the closed set entirely (§6.3: opt out with present:false)', () => {
  const t = baseline();
  delete t.slots.pill;
  assert.ok(!validateTemplate(t).valid);
});

test('REJECTS a dimension that is not one of the four', () => {
  const t = baseline();
  t.dimensions.banner = { w: 1500, h: 500 };
  const { valid, errors } = validateTemplate(t);
  assert.ok(!valid);
  assert.ok(errors.some((e) => /not one of the four dimensions/.test(e)));
});

test('REJECTS a present text slot missing constraints for a supported dimension', () => {
  const t = baseline();
  delete t.slots.heading.dimensions.square;
  assert.ok(!validateTemplate(t).valid);
});

test('REJECTS a logo position outside the enum', () => {
  const t = baseline();
  t.allowedLogoPositions = ['mid-left'];
  assert.ok(!validateTemplate(t).valid);
});

// ── §7.1 THE CROSS-DIMENSION MINIMUM ────────────────────────────────────────
test('the declared budget MUST be the cross-dimension minimum (§7.1)', () => {
  const t = baseline();
  t.slots.heading.dimensions.portrait.charBudget = 40;
  t.slots.heading.dimensions.square.charBudget = 28;
  t.slots.heading.charBudget = 40; // the optimistic lie
  const { valid, errors } = validateTemplate(t);
  assert.ok(!valid);
  assert.ok(errors.some((e) => /cross-dimension MINIMUM is 28/.test(e)), errors.join('\n'));

  t.slots.heading.charBudget = 28;
  assert.deepEqual(validateTemplate(t).errors, []);
});

// ── §6.2 / §10B PRE-VERIFIED COLOUR PAIRS ───────────────────────────────────
test('REJECTS a colour pair below the pre-verified contrast floor', () => {
  const t = baseline();
  t.colourPairs[0] = { id: 'a', label: 'A', bg: '#F5F6E7', ink: '#E7C9CC', contrast: contrastRatio('#F5F6E7', '#E7C9CC') };
  const { valid, errors } = validateTemplate(t);
  assert.ok(!valid);
  assert.ok(errors.some((e) => new RegExp(`below the pre-verified floor ${MIN_PAIR_CONTRAST}`).test(e)));
});

test('REJECTS a STALE recorded contrast ratio (bake-time verification, not a comment)', () => {
  const t = baseline();
  t.colourPairs[0].contrast = 12.0; // the colours actually measure 21
  const { valid, errors } = validateTemplate(t);
  assert.ok(!valid);
  assert.ok(errors.some((e) => /stale bake/.test(e)));
});

test('REJECTS a pair with no recorded ratio at all', () => {
  const t = baseline();
  delete t.colourPairs[1].contrast;
  assert.ok(!validateTemplate(t).valid);
});

test('contrastRatio matches known WCAG values', () => {
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21);
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  assert.equal(contrastRatio('#254E48', '#F5F6E7'), 8.5);
});

test('slotConstraint returns null for a deactivated slot and the row for a live one', () => {
  const t = baseline();
  assert.equal(slotConstraint(t, 'photo', 'portrait'), null);
  assert.equal(slotConstraint(t, 'heading', 'story'), null, 'unsupported dimension');
  assert.equal(slotConstraint(t, 'heading', 'portrait').charBudget, 30);
});

// ── THE PHOTO SLOT + THE LOGO SET (client AMENDMENT 2026-08-18) ─────────────
// Everything the amendment adds to a template is a number, an enum or a flag.
// These prove the validator still FAILS CLOSED on the new surface area — the
// point of the amendment is a photo, not a foothold for behaviour.
function withPhoto(extra = {}) {
  const t = baseline();
  t.slots.photo = {
    present: true,
    // PER PAIR, not per class (client ruling 2026-08-18) — keyed by the pair's
    // own id, so every declared pair keeps its own field colour behind a photo.
    scrim: { a: { colour: '#FFFFFF', opacity: 0.62 }, b: { colour: '#254E48', opacity: 0.62 } },
    dimensions: {
      portrait: { present: true, required: false, fit: 'cover', box: { x: 0, y: 0, w: 1, h: 1 } },
      square: { present: true, required: false, fit: 'cover', box: { x: 0, y: 0, w: 1, h: 1 } },
    },
    ...extra,
  };
  return t;
}

test('a photo slot declared as pure data VALIDATES', () => {
  assert.deepEqual(validateTemplate(withPhoto()).errors, []);
});

test('REJECTS behaviour smuggled in through the photo treatment', () => {
  const fn = withPhoto();
  fn.slots.photo.scrim.a.opacity = () => 0.62;
  assert.ok(validateTemplate(fn).errors.some((e) => /FUNCTION/.test(e)));

  const ruled = withPhoto();
  ruled.slots.photo.when = { darkPhoto: 'more scrim' };
  assert.ok(validateTemplate(ruled).errors.some((e) => /rule-shaped/.test(e)));

  const re = withPhoto();
  re.slots.photo.dimensions.portrait.match = /dark/;
  assert.ok(!validateTemplate(re).valid);
});

test('REJECTS a present photo with no scrim, or a scrim that does nothing', () => {
  const none = withPhoto();
  delete none.slots.photo.scrim;
  assert.ok(validateTemplate(none).errors.some((e) => /must declare the fixed scrim/.test(e)));

  const half = withPhoto();
  delete half.slots.photo.scrim.b;
  assert.ok(validateTemplate(half).errors.some((e) => /scrim\.b/.test(e)));

  // A 0-opacity scrim would be a declaration the render core "always applies"
  // while applying nothing — a dead control in data form (M4).
  const zero = withPhoto();
  zero.slots.photo.scrim.a.opacity = 0;
  assert.ok(validateTemplate(zero).errors.some((e) => /cannot be a no-op/.test(e)));

  const overOne = withPhoto();
  overOne.slots.photo.scrim.b.opacity = 1.4;
  assert.ok(!validateTemplate(overOne).valid);

  const notHex = withPhoto();
  notHex.slots.photo.scrim.a.colour = 'ivory';
  assert.ok(validateTemplate(notHex).errors.some((e) => /scrim\.a\.colour/.test(e)));
});

// ── PER-PAIR SCRIMS (client ruling 2026-08-18) ──────────────────────────────
// The bug this ruling fixes was silent: three `light` pairs shared one wash, so
// two of the four colours did nothing once a photo was chosen. The validator's
// job is to make the same mistake LOUD — in both directions.
test('EVERY declared colour pair must declare its own scrim — a pair added later fails closed', () => {
  const late = withPhoto();
  late.colourPairs.push({ id: 'c', label: 'C', bg: '#C3D2BC', ink: '#254E48', contrast: 5.86, klass: 'light' });
  const { valid, errors } = validateTemplate(late);
  assert.ok(!valid, 'a pair with no scrim row must not load');
  assert.ok(errors.some((e) => /scrim\.c/.test(e) && /EVERY declared colour pair/.test(e)), errors.join('\n'));

  // …and it loads again the moment the new pair brings its own scrim.
  late.slots.photo.scrim.c = { colour: '#C3D2BC', opacity: 0.9 };
  assert.deepEqual(validateTemplate(late).errors, []);
});

test('a scrim row naming no declared pair is a DEAD declaration and is rejected (M4)', () => {
  const orphan = withPhoto();
  orphan.slots.photo.scrim.forest = { colour: '#254E48', opacity: 0.8 };
  const { valid, errors } = validateTemplate(orphan);
  assert.ok(!valid);
  assert.ok(errors.some((e) => /scrim\.forest/.test(e) && /dead declaration/.test(e)), errors.join('\n'));
});

test('the scrim can no longer be keyed by colour CLASS — the shape that caused the bug', () => {
  const byClass = withPhoto();
  byClass.slots.photo.scrim = { light: { colour: '#FFFFFF', opacity: 0.62 }, dark: { colour: '#254E48', opacity: 0.62 } };
  const { valid, errors } = validateTemplate(byClass);
  assert.ok(!valid, 'class keying must not silently validate');
  assert.ok(errors.some((e) => /scrim\.a/.test(e)), 'pair a has no scrim');
  assert.ok(errors.some((e) => /scrim\.light/.test(e) && /dead declaration/.test(e)), 'light is not a pair id');
});

test('a pair must declare its colour CLASS — logoAssets is keyed by it', () => {
  const t = baseline();
  delete t.colourPairs[0].klass;
  assert.ok(validateTemplate(t).errors.some((e) => /klass: required/.test(e)));
  t.colourPairs[0].klass = 'medium';
  assert.ok(validateTemplate(t).errors.some((e) => /klass: required/.test(e)));
});

test('duplicate colour pair ids are rejected — the scrim table could not be keyed', () => {
  const t = withPhoto();
  t.colourPairs.push({ id: 'a', label: 'A2', bg: '#FFFFFF', ink: '#000000', contrast: 21, klass: 'light' });
  assert.ok(validateTemplate(t).errors.some((e) => /duplicate pair id/.test(e)));
});

// ── THE PHOTO MASK (client ruling 2026-08-18 — template two) ────────────────
// The new field is a STRING ID, and the validator must keep it that way: the
// moment a template can carry geometry, there are two copies of the silhouette
// and one of them will drift from the file on disk.
test('the mask is an ASSET ID — a string, or absent; never geometry and never behaviour', () => {
  const withMask = withPhoto();
  withMask.slots.photo.mask = 'petal-brand';
  assert.deepEqual(validateTemplate(withMask).errors, []);

  // Absent is legal — a template with a plain rectangular photo box.
  assert.deepEqual(validateTemplate(withPhoto()).errors, []);

  for (const [label, value] of [
    ['empty string', ''],
    ['whitespace', '   '],
    ['a number', 3],
    ['an array of shapes', ['petal-brand']],
  ]) {
    const t = withPhoto();
    t.slots.photo.mask = value;
    assert.ok(validateTemplate(t).errors.some((e) => /photo\.mask/.test(e)), `${label} was accepted as a mask`);
  }

  // Inline geometry, a chooser function and a rule-shaped key are all rejected
  // — the last two by the behaviour scanner, which must still be armed here.
  const fn = withPhoto();
  fn.slots.photo.mask = () => 'petal-brand';
  assert.ok(validateTemplate(fn).errors.some((e) => /FUNCTION/.test(e)));

  const shaped = withPhoto();
  shaped.slots.photo.maskRules = { darkPhoto: 'shape-1' };
  assert.ok(validateTemplate(shaped).errors.some((e) => /rule-shaped/.test(e)));

  const re = withPhoto();
  re.slots.photo.mask = /petal/;
  assert.ok(validateTemplate(re).errors.some((e) => /RegExp/.test(e)));
});

// A whole-key set lookup missed the COMPOUNDS — `maskRules` is the same
// regression wearing a prefix. Found while testing the mask field; pinned here
// so the scanner cannot quietly narrow again.
test('the behaviour scanner catches a rule word ANYWHERE in a compound key', () => {
  for (const key of ['maskRules', 'photoCondition', 'sizeHandler', 'headingSolver', 'photo_rule', 'whenDark', 'boxExpression']) {
    const t = withPhoto();
    t.slots.photo[key] = { a: 1 };
    assert.ok(validateTemplate(t).errors.some((e) => /rule-shaped/.test(e)), `'${key}' slipped past the scanner`);
  }
  // …and it must not start rejecting ordinary constraint names.
  for (const key of ['lineRatio', 'charBudget', 'maxLines', 'widthFrac', 'allowedLogoPositions', 'paintOrder', 'colourPairs']) {
    const t = withPhoto();
    t.slots.photo[key] = 1;
    assert.ok(!validateTemplate(t).errors.some((e) => /rule-shaped/.test(e)), `'${key}' was wrongly called rule-shaped`);
  }
});

// ── allowedMaskShapes (client ruling 2026-08-18) ────────────────────────────
// Declared exactly like allowedLogoAssets, so it is guarded exactly like it —
// with one extra rule that list does not need: an id here becomes a FILE PATH.
test('allowedMaskShapes is an id TABLE, and an id may never traverse a path', () => {
  const ok = withPhoto();
  ok.slots.photo.mask = 'shape-1';
  ok.allowedMaskShapes = ['shape-1', 'petal-brand'];
  assert.deepEqual(validateTemplate(ok).errors, []);

  const dup = withPhoto();
  dup.slots.photo.mask = 'shape-1';
  dup.allowedMaskShapes = ['shape-1', 'shape-1'];
  assert.ok(validateTemplate(dup).errors.some((e) => /duplicate id/.test(e)));

  const empty = withPhoto();
  empty.slots.photo.mask = 'shape-1';
  empty.allowedMaskShapes = [];
  assert.ok(validateTemplate(empty).errors.some((e) => /allowedMaskShapes/.test(e)));

  for (const bad of ['../../etc/passwd', 'Shape-1', 'a b', 'shape.1', '/abs']) {
    const t = withPhoto();
    t.slots.photo.mask = 'shape-1';
    t.allowedMaskShapes = ['shape-1', bad];
    assert.ok(validateTemplate(t).errors.some((e) => /plain slug/.test(e)), `'${bad}' was accepted as a shape id`);
  }

  // A default she cannot get back to is a trap, not a default.
  const orphanDefault = withPhoto();
  orphanDefault.slots.photo.mask = 'petal-brand';
  orphanDefault.allowedMaskShapes = ['shape-1'];
  assert.ok(validateTemplate(orphanDefault).errors.some((e) => /not in allowedMaskShapes/.test(e)));

  // A picker with nothing behind it is a dead control (M4).
  const noPhoto = baseline();
  noPhoto.allowedMaskShapes = ['shape-1'];
  assert.ok(validateTemplate(noPhoto).errors.some((e) => /a picker for nothing/.test(e)));

  // …and it is still data: a function or a rule-shaped sibling is refused.
  const fn = withPhoto();
  fn.slots.photo.mask = 'shape-1';
  fn.allowedMaskShapes = ['shape-1'];
  fn.pickMaskRule = () => 'shape-1';
  assert.ok(validateTemplate(fn).errors.some((e) => /FUNCTION|rule-shaped/.test(e)));
});

test('REJECTS a photo fit outside the enum (how it sits is an ENUM, never a computation)', () => {
  const t = withPhoto();
  t.slots.photo.dimensions.square.fit = 'smart';
  assert.ok(validateTemplate(t).errors.some((e) => /fit: required one of cover \| contain/.test(e)));
  const missing = withPhoto();
  delete missing.slots.photo.dimensions.portrait.fit;
  assert.ok(!validateTemplate(missing).valid);
});

test('allowedLogoAssets is an id TABLE — empty, duplicated or non-string is rejected', () => {
  const ok = baseline(); ok.allowedLogoAssets = ['s1-green', 's1-ivory'];
  assert.deepEqual(validateTemplate(ok).errors, []);

  const empty = baseline(); empty.allowedLogoAssets = [];
  assert.ok(validateTemplate(empty).errors.some((e) => /non-empty array/.test(e)));

  const dup = baseline(); dup.allowedLogoAssets = ['s1-green', 's1-green'];
  assert.ok(validateTemplate(dup).errors.some((e) => /duplicate id/.test(e)));

  const notId = baseline(); notId.allowedLogoAssets = ['s1-green', 7];
  assert.ok(!validateTemplate(notId).valid);

  const behaviour = baseline(); behaviour.allowedLogoAssets = [() => 's1-green'];
  assert.ok(validateTemplate(behaviour).errors.some((e) => /FUNCTION/.test(e)));
});
