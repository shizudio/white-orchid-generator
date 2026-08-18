// ── RENDER CORE (spec §4, §7, §7.2) ─────────────────────────────────────────
// Pure-node coverage of the core's decisions, using a deterministic monospace
// measurement stub for the canvas context. The PIXEL truth is proven separately
// in the real browser (scripts/tools/verify-template-one.mjs, §11) — this suite
// pins the LOGIC: hard breaks are real, autofit never breaches the floor, and
// the §7.2 second check fires when a break pushes copy past maxLines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { wrapLines, autofit, autofitTrackedCaps } from '../../lib/render-core/text.mjs';
import { MIN_FONT_PX, SLOT_FLOOR_REGISTER, floorPxFor } from '../../lib/render-core/floor.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** A context stub whose glyph advance is exactly 0.5em — deterministic, no canvas. */
function stubCtx() {
  let size = 10;
  return {
    letterSpacing: '0px',
    save() {}, restore() {},
    set font(v) { size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(v)?.[1] || '10'); },
    get font() { return `${size}px stub`; },
    measureText: (t) => ({ width: String(t).length * size * 0.5 }),
  };
}

// ── §7.3 THE FLOOR IS REUSED, NOT REINVENTED ────────────────────────────────
test('MIN_FONT_PX is byte-for-byte the admin renderer\'s basis (fails closed on drift)', () => {
  const gen = readFileSync(join(here, '..', '..', 'components', 'Generator.jsx'), 'utf8');
  const at = gen.indexOf('const MIN_FONT_PX={');
  assert.ok(at > 0, 'MIN_FONT_PX vanished from Generator.jsx — the floor basis moved');
  const block = gen.slice(at, gen.indexOf('};', at));
  // Each role's two constants, read out of the live admin source.
  const expected = {
    headline: [0.068, 38], date: [0.100, 60], intro: [0.062, 34],
    body: [0.062, 32], dateLabel: [0.040, 22],
  };
  for (const [role, [frac, px]] of Object.entries(expected)) {
    const re = new RegExp(`${role}:\\s*h=>Math\\.max\\(([\\d.]+)\\*h,\\s*([\\d.]+)\\*\\(h/1080\\)\\)`);
    const m = re.exec(block);
    assert.ok(m, `${role}: not found in the admin MIN_FONT_PX map — the basis changed shape`);
    assert.equal(parseFloat(m[1]), frac, `${role}: admin fraction moved`);
    assert.equal(parseFloat(m[2]), px, `${role}: admin px term moved`);
    // …and the render core's copy agrees with the admin source, at two heights.
    for (const h of [900, 1080, 1920]) {
      assert.equal(MIN_FONT_PX[role](h), Math.max(frac * h, px * (h / 1080)), `${role}@${h}: render-core copy drifted`);
    }
  }
});

test('the floor is evaluated on the canvas SHORTER SIDE (the documented interpretation)', () => {
  assert.equal(floorPxFor('heading', 1080, 1920), MIN_FONT_PX.headline(1080));
  assert.equal(floorPxFor('heading', 1600, 900), MIN_FONT_PX.headline(900));
  assert.equal(SLOT_FLOOR_REGISTER.eyebrow, 'dateLabel');
  assert.equal(SLOT_FLOOR_REGISTER.heading, 'headline');
  assert.equal(SLOT_FLOOR_REGISTER.body, 'body');
  assert.equal(floorPxFor('photo', 1080, 1080), null, 'non-text slots have no type floor');
});

// ── §7.2 HARD BREAKS ARE REAL ───────────────────────────────────────────────
test('wrapLines splits on newlines FIRST, then wraps each segment on width', () => {
  const ctx = stubCtx();
  ctx.font = '10px stub'; // 5px per char
  assert.deepEqual(wrapLines(ctx, 'ab\ncd', 1000), ['ab', 'cd']);
  assert.deepEqual(wrapLines(ctx, 'aaaa bbbb', 25), ['aaaa', 'bbbb'], 'width wrap still applies');
  assert.deepEqual(wrapLines(ctx, 'a\n\n\nb', 1000), ['a', 'b'], 'blank segments collapse');
  assert.deepEqual(wrapLines(ctx, '', 1000), []);
  assert.deepEqual(wrapLines(ctx, '   ', 1000), []);
});

// ── §7 AUTOFIT OWNS SIZE, DOWN TO A FLOOR ───────────────────────────────────
test('short copy renders large; longer copy renders smaller; nothing goes below the floor', () => {
  const ctx = stubCtx();
  const fontFor = (s) => `${s}px stub`;
  const box = { x: 0, y: 0, w: 400, h: 200 };
  const short = autofit(ctx, { text: 'hi', fontFor, box, maxLines: 2, floorPx: 20, lineRatio: 1.0 });
  const long = autofit(ctx, { text: 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd', fontFor, box, maxLines: 2, floorPx: 20, lineRatio: 1.0 });
  assert.ok(short.size > long.size, `short ${short.size} should out-size long ${long.size}`);
  assert.ok(long.size >= 20, 'autofit breached the floor');
  assert.ok(short.lines.length <= 2 && long.lines.length <= 2);
});

test('copy that cannot fit at the floor stops AT the floor and reports over-budget', () => {
  const ctx = stubCtx();
  const fontFor = (s) => `${s}px stub`;
  const box = { x: 0, y: 0, w: 100, h: 60 };
  const fit = autofit(ctx, { text: 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eeeeeeeeee', fontFor, box, maxLines: 2, floorPx: 30, lineRatio: 1.0 });
  assert.equal(fit.size, 30, 'stopped exactly at the floor, never below');
  assert.ok(fit.atFloor);
  assert.ok(fit.overBudget, 'the overflow must be reported, not painted');
  assert.equal(fit.lines.length, 2, 'paint is CLIPPED to maxLines — no unclipped spill');
  assert.ok(fit.wrappedLines > 2, 'the true wrap is still reported for the honest message');
});

test('THE §7.2 SECOND CHECK: copy UNDER the char budget can still bust maxLines via hard breaks', () => {
  const ctx = stubCtx();
  const fontFor = (s) => `${s}px stub`;
  const box = { x: 0, y: 0, w: 1000, h: 60 };
  const plain = 'a b c';                 // 5 chars — trivially one line
  const broken = 'a\nb\nc';              // the SAME 5 chars, three hard breaks
  const a = autofit(ctx, { text: plain, fontFor, box, maxLines: 2, floorPx: 20, lineRatio: 1.0 });
  const b = autofit(ctx, { text: broken, fontFor, box, maxLines: 2, floorPx: 20, lineRatio: 1.0 });
  assert.equal(a.overBudget, false);
  assert.equal(b.overBudget, true, 'a character count alone cannot see a break — this is why the second check exists');
  assert.equal(a.chars, b.chars, undefined); // both undefined: autofit does not count chars
});

test('an empty slot paints nothing and is never over budget', () => {
  const ctx = stubCtx();
  const fit = autofit(ctx, { text: '', fontFor: (s) => `${s}px stub`, box: { x: 0, y: 0, w: 100, h: 100 }, maxLines: 2, floorPx: 20, lineRatio: 1.0 });
  assert.deepEqual(fit.lines, []);
  assert.equal(fit.overBudget, false);
});

test('the tracked-caps register autofits under the same contract', () => {
  const ctx = stubCtx();
  const box = { x: 0, y: 0, w: 300, h: 60 };
  const fit = autofitTrackedCaps(ctx, { text: 'now enrolling', font: 'stub', weight: 400, tracking: 0.08, box, maxLines: 1, floorPx: 20, lineRatio: 1.25 });
  assert.equal(fit.lines[0], 'NOW ENROLLING', 'the eyebrow register uppercases');
  assert.ok(fit.size >= 20);
  const bust = autofitTrackedCaps(ctx, { text: 'a\nb', font: 'stub', weight: 400, tracking: 0.08, box, maxLines: 1, floorPx: 20, lineRatio: 1.25 });
  assert.ok(bust.overBudget, 'a hard break in a one-line box must be reported');
  assert.equal(bust.lines.length, 1);
});

test('autofit is DETERMINISTIC — same inputs, same answer', () => {
  const run = () => autofit(stubCtx(), {
    text: 'every child leads their own day here with us', fontFor: (s) => `${s}px stub`,
    box: { x: 0, y: 0, w: 320, h: 140 }, maxLines: 3, floorPx: 24, lineRatio: 1.02,
  });
  const a = run(); const b = run();
  assert.deepEqual({ ...a }, { ...b });
});
