// ── THE BACKDROP CHECK (client AMENDMENT 2026-08-18 to spec §10) ────────────
// §10A retired runtime contrast guards BECAUSE colour pairs are pre-verified.
// A photo she picks cannot be pre-verified at authoring time, so the core
// measures the painted backdrop — and only then. These tests pin the scope:
//
//   · no photo  → nothing is sampled at all, and the render is unchanged
//   · photo     → the ink is measured against the REAL pixels under its box
//   · failing   → reported, never fixed (no ladder, no substitution, no dot)
//
// Pixel truth is proven in the real browser (scripts/tools/verify-template-one
// .mjs, §11); this suite pins the LOGIC with a deterministic context stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleBackdropLuminance, checkInkOnBackdrop, TEXT_MIN_CONTRAST, MARK_MIN_CONTRAST } from '../../lib/render-core/backdrop-contrast.mjs';
import { renderTemplate } from '../../lib/render-core/render-template.mjs';
import { MIN_PAIR_CONTRAST } from '../../lib/templates/template-contract.mjs';
import { TEMPLATE_LABEL_HEADLINE as T } from '../../lib/templates/index.mjs';

/** A 2D context stub: measures like 0.5em monospace, reads back a flat colour. */
function stubCtx(readback = [255, 255, 255]) {
  let size = 10;
  const calls = { getImageData: 0, drawImage: 0, fillRect: 0, alphas: [], fills: [] };
  return {
    calls,
    canvas: { width: 0, height: 0 },
    letterSpacing: '0px',
    globalAlpha: 1,
    fillStyle: '#000',
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, clearRect() {},
    set font(v) { size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(v)?.[1] || '10'); },
    get font() { return `${size}px stub`; },
    measureText: (t) => ({ width: String(t).length * size * 0.5 }),
    fillText() {},
    fillRect() { calls.fillRect += 1; calls.alphas.push(this.globalAlpha); calls.fills.push(this.fillStyle); },
    drawImage() { calls.drawImage += 1; },
    getImageData(x, y, w, h) {
      calls.getImageData += 1;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i += 1) {
        data[i * 4] = readback[0]; data[i * 4 + 1] = readback[1]; data[i * 4 + 2] = readback[2]; data[i * 4 + 3] = 255;
      }
      return { data, width: w, height: h };
    },
  };
}

const fakeImage = { naturalWidth: 1600, naturalHeight: 1200, width: 1600, height: 1200 };

test('the text floor is the SAME number pre-verified pairs must clear — one bar, not two', () => {
  assert.equal(TEXT_MIN_CONTRAST, MIN_PAIR_CONTRAST);
  assert.equal(MARK_MIN_CONTRAST, 3, 'a mark is a graphical object — WCAG 1.4.11 non-text');
});

test('sampling reads the ACTUAL pixels, and an unreadable canvas is not a pass', () => {
  const ctx = stubCtx([255, 255, 255]);
  const white = sampleBackdropLuminance(ctx, { x: 0, y: 0, w: 100, h: 100 }, 1080, 1080);
  assert.ok(white.mean > 0.99, `white read back as ${white.mean}`);
  const dark = sampleBackdropLuminance(stubCtx([0, 0, 0]), { x: 0, y: 0, w: 100, h: 100 }, 1080, 1080);
  assert.ok(dark.mean < 0.01);

  // A tainted canvas throws on getImageData. Refusing is the honest answer:
  // claiming a check that did not happen is exactly M4.
  const tainted = { ...stubCtx(), getImageData() { throw new Error('SecurityError'); } };
  assert.equal(sampleBackdropLuminance(tainted, { x: 0, y: 0, w: 10, h: 10 }, 100, 100), null);
  const verdict = checkInkOnBackdrop(tainted, { x: 0, y: 0, w: 10, h: 10 }, '#254E48', 100, 100);
  assert.equal(verdict.unreadable, true);
  assert.equal(verdict.ok, false, 'unverifiable must never read as verified');
});

test('the verdict is the real ratio: dark ink passes on a light backdrop and fails on a dark one', () => {
  const box = { x: 0, y: 0, w: 200, h: 100 };
  const onIvory = checkInkOnBackdrop(stubCtx([245, 246, 231]), box, '#254E48', 1080, 1080);
  assert.equal(onIvory.ok, true);
  assert.ok(onIvory.ratio >= 8, `expected the pre-verified 8.5:1, got ${onIvory.ratio}`);

  const onNearBlack = checkInkOnBackdrop(stubCtx([12, 12, 12]), box, '#254E48', 1080, 1080);
  assert.equal(onNearBlack.ok, false);
  assert.ok(onNearBlack.ratio < TEXT_MIN_CONTRAST);

  // …and the mark's lower bar is genuinely lower, not the same number twice.
  const markOnMid = checkInkOnBackdrop(stubCtx([150, 150, 150]), box, '#F5F6E7', 1080, 1080, MARK_MIN_CONTRAST);
  const textOnMid = checkInkOnBackdrop(stubCtx([150, 150, 150]), box, '#F5F6E7', 1080, 1080, TEXT_MIN_CONTRAST);
  assert.equal(markOnMid.ratio, textOnMid.ratio, 'the measurement must not depend on the bar');
  assert.equal(markOnMid.minimum, 3);
  assert.equal(textOnMid.minimum, 4.5);
});

const COPY = { eyebrow: 'OUR BELIEF', heading: 'Every child is capable of leading their own day', body: 'Enrolling now for the autumn term' };

test('NO PHOTO → nothing is painted for it and NOTHING is sampled (§10A stands)', () => {
  const ctx = stubCtx([245, 246, 231]);
  const truth = renderTemplate(ctx, T, 'portrait', { ...COPY, colourPairId: 'ivory' });
  assert.equal(truth.photo, null);
  assert.equal(truth.backdrop.checked, false);
  assert.deepEqual(truth.contrastFailures, []);
  assert.equal(ctx.calls.drawImage, 0, 'no photo means no image drawn');
  assert.equal(ctx.calls.getImageData, 0, 'the amendment must not run on the pre-verified path');
  assert.equal(ctx.calls.fillRect, 1, 'exactly the one field fill — the clean tile is untouched');
});

test('A PHOTO → the declared scrim is ALWAYS painted over it, at the declared opacity', () => {
  const ctx = stubCtx([245, 246, 231]);
  const truth = renderTemplate(ctx, T, 'portrait', { ...COPY, colourPairId: 'ivory', photoImage: fakeImage });
  assert.equal(ctx.calls.drawImage, 1);
  assert.equal(truth.photo.fit, 'cover');
  assert.deepEqual(truth.photo.scrim, T.slots.photo.scrim.ivory);
  // field fill + scrim fill, and the scrim carries the template's own opacity —
  // not a value adapted to the photo (there is no ladder).
  assert.equal(ctx.calls.fillRect, 2);
  assert.equal(ctx.calls.alphas[1], T.slots.photo.scrim.ivory.opacity);
  assert.equal(ctx.calls.fills[1], T.slots.photo.scrim.ivory.colour);
});

test('EVERY colour pair washes the photo in ITS OWN colour — the per-pair ruling', () => {
  // (client ruling 2026-08-18) Before this, the scrim was keyed by colour CLASS.
  // ivory, sage and blush are all `light`, so all three painted the ivory wash
  // over a full-bleed photo and the three tiles came out identical — which is
  // why the client could only use forest and ivory. Keyed by pair, each one
  // paints its own field colour at its own measured opacity.
  const seen = new Set();
  for (const pair of T.colourPairs) {
    const ctx = stubCtx([245, 246, 231]);
    const truth = renderTemplate(ctx, T, 'portrait', { ...COPY, colourPairId: pair.id, photoImage: fakeImage });
    assert.deepEqual(truth.photo.scrim, T.slots.photo.scrim[pair.id], `${pair.id}: wrong scrim row`);
    assert.equal(ctx.calls.fills[1], pair.bg, `${pair.id}: the wash is not this pair's own field colour`);
    assert.equal(ctx.calls.alphas[1], T.slots.photo.scrim[pair.id].opacity);
    const signature = `${ctx.calls.fills[1]}@${ctx.calls.alphas[1]}`;
    assert.ok(!seen.has(signature), `${pair.id} paints the same wash as an earlier pair — the class-keying bug is back`);
    seen.add(signature);
  }
  assert.equal(seen.size, T.colourPairs.length);
});

test('A PHOTO → each filled text slot is measured, and a bad backdrop BLOCKS rather than adapts', () => {
  // Read-back is near-black: burnham ink cannot be read on it.
  const ctx = stubCtx([10, 10, 10]);
  const truth = renderTemplate(ctx, T, 'portrait', { ...COPY, colourPairId: 'ivory', photoImage: fakeImage });
  assert.equal(truth.backdrop.checked, true);
  assert.deepEqual(truth.contrastFailures.sort(), ['body', 'eyebrow', 'heading']);
  for (const slot of ['eyebrow', 'heading', 'body']) {
    assert.equal(truth.backdrop.slots[slot].ok, false);
    assert.ok(truth.backdrop.slots[slot].ratio < TEXT_MIN_CONTRAST);
  }
  // NOTHING was fixed: same two fills as the passing case, same ink, same box.
  assert.equal(ctx.calls.fillRect, 2, 'no extra band, no fabricated backing (law 3)');
  assert.equal(truth.colourPair.ink, T.colourPairs[0].ink, 'the ink was not swapped (M3)');

  // An EMPTY slot has no ink to be unreadable, so it is not measured.
  const partial = renderTemplate(stubCtx([10, 10, 10]), T, 'portrait', {
    ...COPY, body: '', colourPairId: 'ivory', photoImage: fakeImage,
  });
  assert.ok(!('body' in partial.backdrop.slots));
  assert.ok(!partial.contrastFailures.includes('body'));
});

test('the MARK is measured against what is actually behind it, and names its dimension', () => {
  // An ivory mark on the ivory field: no photo needed for this to be wrong.
  const ivoryOnIvory = renderTemplate(stubCtx([245, 246, 231]), T, 'portrait', {
    ...COPY, colourPairId: 'ivory', logoImage: fakeImage, logoInk: '#F5F6E7',
  });
  assert.equal(ivoryOnIvory.backdrop.logo.ok, false);
  assert.ok(ivoryOnIvory.contrastFailures.includes('logo'));
  assert.ok(ivoryOnIvory.logoBox, 'it is still PAINTED as chosen — reported, never substituted');

  // The default green mark on the same field is clean (born-clean holds).
  const greenOnIvory = renderTemplate(stubCtx([245, 246, 231]), T, 'portrait', {
    ...COPY, colourPairId: 'ivory', logoImage: fakeImage, logoInk: '#254E48',
  });
  assert.equal(greenOnIvory.backdrop.logo.ok, true);
  assert.deepEqual(greenOnIvory.contrastFailures, []);
});

test('every colour pair × its default mark is clean with no photo — the amendment adds no noise', () => {
  for (const pair of T.colourPairs) {
    const ink = pair.klass === 'dark' ? '#F5F6E7' : '#254E48';
    const bg = pair.bg.replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16));
    for (const dimId of Object.keys(T.dimensions)) {
      const truth = renderTemplate(stubCtx(rgb), T, dimId, {
        ...COPY, colourPairId: pair.id, logoImage: fakeImage, logoInk: ink,
      });
      assert.deepEqual(truth.contrastFailures, [], `${pair.id}/${dimId} flagged its own pre-verified default`);
    }
  }
});
