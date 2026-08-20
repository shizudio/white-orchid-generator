// ── THE MASKED PHOTO WINDOW + THE REQUIRED PHOTO ────────────────────────────
// (client ruling 2026-08-18 — template two, "Petal Window")
//
// Two pieces of render-core behaviour arrive with this template, and both are
// driven by DECLARED DATA rather than by a branch in a template:
//
//   · `slots.photo.mask` — the photo is composited against a REAL brand
//     silhouette's alpha. With no silhouette to hand, the core REFUSES rather
//     than painting the rectangle it could have painted (M3, law 3).
//   · `required: true` on the photo — the core paints an honest placeholder IN
//     THE SHAPE OF THE WINDOW and MEASURES that a required slot is empty. It
//     does not fill it, substitute it, or nag; the surface refuses on the
//     measurement (§7.2 idiom).
//
// Pixel truth lives in the browser (scripts/tools/verify-template-two.mjs);
// this suite pins the LOGIC with a deterministic context stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from '../../lib/render-core/render-template.mjs';
import { TEMPLATE_PETAL_WINDOW as TWO, TEMPLATE_LABEL_HEADLINE as ONE } from '../../lib/templates/index.mjs';

/** A 2D context stub that records the compositing it is asked to do. */
function stubCtx(readback = [200, 210, 190]) {
  let size = 10;
  const calls = {
    drawImage: 0, fillRect: 0, fillText: [], composites: [], alphas: [], fills: [], scratches: 0,
  };
  const make = () => ({
    calls,
    canvas: { width: 0, height: 0 },
    letterSpacing: '0px',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, clearRect() {},
    set font(v) { size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(v)?.[1] || '10'); },
    get font() { return `${size}px stub`; },
    measureText: (t) => ({ width: String(t).length * size * 0.5 }),
    fillText(t) { calls.fillText.push(String(t)); },
    fillRect() {
      calls.fillRect += 1;
      calls.alphas.push(this.globalAlpha);
      calls.fills.push(this.fillStyle);
      calls.composites.push(this.globalCompositeOperation);
    },
    drawImage() { calls.drawImage += 1; },
    getImageData(x, y, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i += 1) {
        data[i * 4] = readback[0]; data[i * 4 + 1] = readback[1]; data[i * 4 + 2] = readback[2]; data[i * 4 + 3] = 255;
      }
      return { data, width: w, height: h };
    },
  });
  const ctx = make();
  // The scratch surface the mask compositing needs, handed in explicitly so the
  // core never has to reach for a document.
  ctx.makeScratchCanvas = () => {
    calls.scratches += 1;
    const sc = make();
    return { width: 0, height: 0, getContext: () => sc };
  };
  return ctx;
}

const fakeImage = { naturalWidth: 1600, naturalHeight: 1200, width: 1600, height: 1200 };
const fakeMask = { naturalWidth: 58, naturalHeight: 57, width: 58, height: 57 };
const opts = (ctx) => ({ makeScratchCanvas: ctx.makeScratchCanvas });

test('a photo + a mask is composited through the silhouette, and the truth SAYS which one', () => {
  const ctx = stubCtx();
  const truth = renderTemplate(ctx, TWO, 'portrait', {
    heading: 'Where the day begins', colourPairId: 'sage',
    photoImage: fakeImage, maskImage: fakeMask,
  }, opts(ctx));
  assert.ok(truth.photo, 'the photo did not paint');
  assert.equal(truth.photo.mask, TWO.slots.photo.mask, 'the render must report WHICH silhouette cut it');
  assert.deepEqual(truth.photo.scrim, TWO.slots.photo.scrim.sage);
  assert.equal(ctx.calls.scratches, 2, 'one scratch for the cut-out, one for the alpha-saturated mask stamp');
  // The silhouette's own alpha is what cuts it, and the tint lands only on what
  // survived the cut — both are composite modes, not a rectangle clip.
  assert.ok(ctx.calls.composites.includes('source-atop'), 'the tint must be clipped to the cut-out');
});

test('the render reports HER chosen silhouette, not the template default', () => {
  const ctx = stubCtx();
  const chosen = TWO.allowedMaskShapes.find((id) => id !== TWO.slots.photo.mask);
  assert.ok(chosen, 'the template must offer more than one window shape');
  const truth = renderTemplate(ctx, TWO, 'square', {
    heading: 'Where the day begins', colourPairId: 'sage',
    photoImage: fakeImage, maskImage: fakeMask, maskShapeId: chosen,
  }, opts(ctx));
  assert.equal(truth.photo.mask, chosen);
  // …and with no pick it falls back to the template's own default.
  const dflt = renderTemplate(stubCtx(), TWO, 'square', {
    heading: 'x', colourPairId: 'sage', photoImage: fakeImage, maskImage: fakeMask,
  }, opts(stubCtx()));
  assert.equal(dflt.photo.mask, TWO.slots.photo.mask);
});

test('NO MASK IMAGE → the photo is REFUSED, never painted as a rectangle (M3)', () => {
  const ctx = stubCtx();
  const truth = renderTemplate(ctx, TWO, 'portrait', {
    heading: 'Where the day begins', colourPairId: 'sage', photoImage: fakeImage,
  }, opts(ctx));
  assert.equal(truth.photo, null, 'an unmasked rectangle was painted under a masked template\'s name');
  assert.deepEqual(truth.missingAssets, ['mask']);
  assert.ok(truth.missingRequired.includes('photo'), 'and the required photo is therefore still missing');
});

test('NO PHOTO → an honest placeholder in the shape of the window, and a MEASUREMENT', () => {
  const ctx = stubCtx();
  const truth = renderTemplate(ctx, TWO, 'square', {
    heading: '', colourPairId: 'sage', maskImage: fakeMask,
  }, opts(ctx));
  assert.equal(truth.photo, null);
  assert.deepEqual(truth.missingRequired, ['photo']);
  assert.ok(truth.photoPlaceholder, 'the empty state must be an invitation, not a blank');
  assert.equal(truth.photoPlaceholder.mask, TWO.slots.photo.mask);
  assert.equal(truth.photoPlaceholder.label, 'CHOOSE A PHOTO');
  assert.ok(ctx.calls.fillText.includes('CHOOSE A PHOTO'), 'the placeholder must actually say what it wants');
  // Nothing was substituted for the photograph — law 3. The only image drawn is
  // the brand silhouette used as the placeholder's own shape.
  assert.ok(truth.photoPlaceholder.box.w > 0 && truth.photoPlaceholder.box.h > 0);
});

test('the placeholder is NOT painted where a photo is optional — template one is untouched', () => {
  const ctx = stubCtx();
  const truth = renderTemplate(ctx, ONE, 'portrait', {
    eyebrow: 'OUR BELIEF', heading: 'A quiet statement', body: 'and a line',
    colourPairId: 'ivory',
  }, opts(ctx));
  assert.equal(truth.photo, null);
  assert.equal(truth.photoPlaceholder, null, 'an OPTIONAL photo must leave the clean tile alone');
  assert.deepEqual(truth.missingRequired, []);
  assert.deepEqual(truth.missingAssets, []);
  assert.ok(!ctx.calls.fillText.includes('CHOOSE A PHOTO'));
  assert.equal(ctx.calls.scratches, 0, 'no mask, no scratch surface');
  assert.equal(ctx.calls.drawImage, 0, 'the clean tile draws no image at all');
});

test('a REQUIRED text slot that is empty is measured too — the same idiom, one mechanism', () => {
  const ctx = stubCtx();
  // Template one's heading is required in every dimension.
  const truth = renderTemplate(ctx, ONE, 'portrait', { heading: '   ', colourPairId: 'ivory' }, opts(ctx));
  assert.deepEqual(truth.missingRequired, ['heading']);
  const filled = renderTemplate(stubCtx(), ONE, 'portrait', { heading: 'A line', colourPairId: 'ivory' }, {});
  assert.deepEqual(filled.missingRequired, []);
});

test('the masked path still MEASURES the backdrop, and the band/corner pass on flat field', () => {
  const ctx = stubCtx([195, 210, 188]); // the sage field
  const truth = renderTemplate(ctx, TWO, 'landscape', {
    heading: 'Where the day begins', colourPairId: 'sage',
    photoImage: fakeImage, maskImage: fakeMask, logoImage: fakeMask, logoInk: '#254E48',
  }, opts(ctx));
  assert.equal(truth.backdrop.checked, true, 'a photo is painted, so the check must run');
  assert.ok(truth.backdrop.slots.heading, 'the heading must be measured in its band');
  assert.ok(truth.backdrop.slots.heading.ok, `the band is flat pre-verified field: ${truth.backdrop.slots.heading.ratio}`);
  assert.ok(truth.backdrop.logo?.ok, 'the mark sits on flat field too');
  assert.deepEqual(truth.contrastFailures, []);
});
