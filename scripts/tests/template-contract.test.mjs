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
      { id: 'a', label: 'A', bg: '#FFFFFF', ink: '#000000', contrast: 21 },
      { id: 'b', label: 'B', bg: '#254E48', ink: '#F5F6E7', contrast: 8.5 },
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
