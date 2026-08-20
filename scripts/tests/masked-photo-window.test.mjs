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
    // The SOURCE rects actually asked for — how the crop is proven rather than
    // trusted (the render truth reports the transform; this reports the pixels).
    drawRects: [],
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
    drawImage(...a) { calls.drawImage += 1; if (a.length === 9) calls.drawRects.push({ sx: a[1], sy: a[2], sw: a[3], sh: a[4] }); },
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


/* ── HER CROP INSIDE THE FIXED WINDOW (client ruling 2026-08-18) ─────────────
   "i want to still shift around the image and resize the image. this only
    applies to petal window template."

   The guarantee that matters is that the window can NEVER show empty field, and
   it is structural rather than defensive: the transform is expressed in units of
   the slack the zoom creates, so there is no unclamped quantity to get around.
   These tests take it to every extreme and check the SOURCE RECT, which is what
   actually decides whether the picture covers the mask. */
const photoOf = (ctx) => ctx.calls.drawRects[0];

test('the crop is offered ONLY where the template declares the photo adjustable', () => {
  assert.equal(TWO.slots.photo.adjustable, true, 'Petal Window: the photo IS the design');
  assert.equal(ONE.slots.photo.adjustable, false, 'Classic: a scrimmed texture behind type has no framing decision');

  // Classic IGNORES a transform entirely — a value that arrives from anywhere
  // must not be able to crop a template that did not opt in.
  const plain = stubCtx();
  renderTemplate(plain, ONE, 'portrait', { heading: 'A line', colourPairId: 'ivory', photoImage: fakeImage }, opts(plain));
  const untouched = stubCtx();
  renderTemplate(untouched, ONE, 'portrait', {
    heading: 'A line', colourPairId: 'ivory', photoImage: fakeImage,
    photoTransform: { x: 1, y: 1, zoom: 3 },
  }, opts(untouched));
  assert.deepEqual(photoOf(untouched), photoOf(plain), 'a transform reached a template that never declared one adjustable');
});

test('the window is ALWAYS fully covered — at every extreme of pan and zoom', () => {
  const iw = fakeImage.naturalWidth;
  const ih = fakeImage.naturalHeight;
  const extremes = [];
  for (const zoom of [1, 1.0001, 1.5, 2, 3, 9, 0, -4, NaN, undefined]) {
    for (const x of [-1, 0, 1, -9, 9, NaN, undefined]) {
      for (const y of [-1, 0, 1, -9, 9]) extremes.push({ x, y, zoom });
    }
  }
  for (const dimId of Object.keys(TWO.dimensions)) {
    for (const t of extremes) {
      const ctx = stubCtx();
      renderTemplate(ctx, TWO, dimId, {
        heading: 'Where the day begins', colourPairId: 'sage',
        photoImage: fakeImage, maskImage: fakeMask, photoTransform: t,
      }, opts(ctx));
      const r = photoOf(ctx);
      const at = `${dimId} ${JSON.stringify(t)}`;
      // THE SOURCE RECT MUST LIE INSIDE THE IMAGE. Anything else means the
      // window is showing something that is not the photograph.
      assert.ok(r.sx >= -1e-6, `${at}: source starts left of the image (sx=${r.sx})`);
      assert.ok(r.sy >= -1e-6, `${at}: source starts above the image (sy=${r.sy})`);
      assert.ok(r.sx + r.sw <= iw + 1e-6, `${at}: source runs past the right edge`);
      assert.ok(r.sy + r.sh <= ih + 1e-6, `${at}: source runs past the bottom edge`);
      assert.ok(r.sw > 0 && r.sh > 0, `${at}: empty source rect`);
    }
  }
});

test('pan and zoom really move the picture — and reset returns to the default fit', () => {
  const shot = (photoTransform) => {
    const ctx = stubCtx();
    renderTemplate(ctx, TWO, 'portrait', {
      heading: 'x', colourPairId: 'sage', photoImage: fakeImage, maskImage: fakeMask, photoTransform,
    }, opts(ctx));
    return photoOf(ctx);
  };
  const base = shot(undefined);
  const reset = shot({ x: 0, y: 0, zoom: 1 });
  assert.deepEqual(reset, base, 'reset must land exactly on the default fit');

  const zoomed = shot({ x: 0, y: 0, zoom: 2 });
  assert.ok(zoomed.sw < base.sw && zoomed.sh < base.sh, 'zooming in must take LESS of the photo, not more');

  /* AT THE DEFAULT FIT, ONE AXIS IS ALREADY EXACTLY FILLED. A `cover` fit makes
     one dimension of the photo match the window exactly, so that axis has zero
     slack and cannot pan — correctly, because there is nothing there to reveal.
     The other axis is the one the cover already cropped, and panning it chooses
     which part of the picture that crop keeps. Both halves are asserted, so a
     regression that made panning move nothing at all would be caught. */
  const movedX = shot({ x: 1, y: 0, zoom: 1 }).sx !== base.sx;
  const movedY = shot({ x: 0, y: 1, zoom: 1 }).sy !== base.sy;
  assert.notEqual(movedX, movedY, 'at the default fit exactly one axis has slack to pan into');

  // Zoomed in, both axes move, and the two ends of the range are different
  // pictures.
  const left = shot({ x: -1, y: 0, zoom: 2 });
  const right = shot({ x: 1, y: 0, zoom: 2 });
  const up = shot({ x: 0, y: -1, zoom: 2 });
  const down = shot({ x: 0, y: 1, zoom: 2 });
  assert.ok(right.sx > left.sx, 'panning right must show a later part of the picture');
  assert.ok(down.sy > up.sy, 'panning down must show a lower part of the picture');
  assert.equal(left.sx, 0, 'the left extreme is the left edge of the photo, exactly');
  assert.equal(Math.round(right.sx + right.sw), fakeImage.naturalWidth, 'the right extreme is the right edge, exactly');
});

test('the truth REPORTS the crop it actually applied, already clamped', () => {
  const ctx = stubCtx();
  const truth = renderTemplate(ctx, TWO, 'square', {
    heading: 'x', colourPairId: 'sage', photoImage: fakeImage, maskImage: fakeMask,
    photoTransform: { x: 12, y: -12, zoom: 99 },
  }, opts(ctx));
  assert.deepEqual(truth.photo.transform, { x: 1, y: -1, zoom: 3 }, 'the truth must say what landed, not what was asked for');
  const plain = renderTemplate(stubCtx(), ONE, 'portrait', {
    heading: 'x', colourPairId: 'ivory', photoImage: fakeImage,
  }, {});
  assert.equal(plain.photo.transform, null, 'a template with no crop reports none');
});
