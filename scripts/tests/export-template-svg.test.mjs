// ── TEMPLATE → FIGMA SVG SEED (spec §12, authoring workflow) ────────────────
// The outbound half of the Figma bridge: we emit an SVG the designer imports,
// she moves the `box` rect inside each `slot/*` group, and the re-bake reads
// THAT rect back. So the one thing these tests must not let drift is the
// GEOMETRY CONTRACT: every emitted box is the baked fraction × that dimension,
// to the pixel, and the layer names the read-back looks for are still there.
//
// Browser-free by construction — scripts/tools/export-template-svg.mjs imports
// the playwright harness lazily, so the serialiser and the parser are cheap.
// The measured half (line breaks, autofit sizes) is verified where §11 says it
// must be, in the canvas render core: `node scripts/tools/export-template-svg.mjs`
// re-reads what it wrote and runs `auditEmitted` on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildSvg, parseSvg, auditEmitted, layerAttrs, esc, PREVIEW_COPY, PREVIEW_PAIR_ID,
} from '../tools/export-template-svg.mjs';
import { TEMPLATE_LABEL_HEADLINE as T } from '../../lib/templates/template-label-headline.mjs';
import { DIMENSIONS, slotConstraint } from '../../lib/templates/template-contract.mjs';
import { floorPxFor } from '../../lib/render-core/floor.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIGMA_DIR = join(here, '..', '..', 'generated', 'template-one', 'figma');
const svgPath = (dimId) => join(FIGMA_DIR, `label-headline-${dimId}.svg`);

// A stand-in for the real inlined mark — the mark's own geometry is the asset's
// business (law 3 is gated in auditEmitted, which requires real vector nodes).
const STUB_MARK = { viewBox: '0 0 402.97 350.68', inner: '<circle cx="200" cy="175" r="175"/>' };

/**
 * The layout shape the harness produces, rebuilt here from the BAKED TEMPLATE
 * plus plausible fitted lines. Sizes are pinned at the floor so the floor gate
 * is exercised from the tight side.
 */
function layoutFor(dimensionId, { lineCount = null, size = null } = {}) {
  const dim = DIMENSIONS[dimensionId];
  const pair = T.colourPairs.find((p) => p.id === PREVIEW_PAIR_ID);
  const slots = [];
  for (const name of T.paintOrder) {
    const per = slotConstraint(T, name, dimensionId);
    if (!per) continue;
    const reg = T.registers[name];
    const floor = floorPxFor(name, dim.w, dim.h);
    const px = size ?? Math.floor(floor);
    const n = lineCount ?? per.maxLines;
    slots.push({
      name,
      box: { x: per.box.x * dim.w, y: per.box.y * dim.h, w: per.box.w * dim.w, h: per.box.h * dim.h },
      frac: per.box, maxLines: per.maxLines, charBudget: per.charBudget, floorPx: floor,
      family: 'TestFace, serif', weight: reg.weight, align: reg.align || 'left',
      letterSpacing: reg.caps ? ((reg.tracking ?? 0.08) + 0.01) * px : 0,
      size: px, lineHeight: px * reg.lineRatio,
      lines: Array.from({ length: n }, (_, i) => `${name} line ${i + 1} <&"'>`),
    });
  }
  // (client amendment 2026-08-18) The photo box travels with the seed too: the
  // designer must be able to move it in Figma and re-bake it like any other.
  const photoPer = slotConstraint(T, 'photo', dimensionId);
  const photo = photoPer ? {
    frac: photoPer.box,
    box: { x: photoPer.box.x * dim.w, y: photoPer.box.y * dim.h, w: photoPer.box.w * dim.w, h: photoPer.box.h * dim.h },
    fit: photoPer.fit,
    scrim: T.slots.photo.scrim[pair.klass],
  } : null;
  return {
    templateId: T.id, templateVersion: T.version, dimensionId,
    width: dim.w, height: dim.h, bg: pair.bg, ink: pair.ink, pairId: pair.id,
    logoAsset: T.logoAssets.light,
    logoBox: { x: dim.w * 0.83, y: dim.h * 0.9, w: 128, h: 111.6, position: 'bottom-right' },
    slots, photo,
  };
}

const DIM_IDS = Object.keys(T.dimensions);

test('the root frame is the EXACT dimension pixel size, so the Figma frame lands right', () => {
  for (const dimensionId of DIM_IDS) {
    const dim = DIMENSIONS[dimensionId];
    const doc = parseSvg(buildSvg(layoutFor(dimensionId), STUB_MARK));
    assert.equal(doc.width, dim.w, `${dimensionId} width`);
    assert.equal(doc.height, dim.h, `${dimensionId} height`);
    assert.equal(doc.viewBox, `0 0 ${dim.w} ${dim.h}`);
  }
});

test('EVERY slot/* box is the baked fraction × that dimension, to the pixel (the round-trip truth)', () => {
  for (const dimensionId of DIM_IDS) {
    const dim = DIMENSIONS[dimensionId];
    const doc = parseSvg(buildSvg(layoutFor(dimensionId), STUB_MARK));
    for (const name of T.paintOrder) {
      const per = slotConstraint(T, name, dimensionId);
      const box = doc.slots[name]?.box;
      assert.ok(box, `${dimensionId}/${name}: no box rect — nothing to read back`);
      assert.equal(box.x, Math.round(per.box.x * dim.w * 100) / 100, `${dimensionId}/${name}.x`);
      assert.equal(box.y, Math.round(per.box.y * dim.h * 100) / 100, `${dimensionId}/${name}.y`);
      assert.equal(box.w, Math.round(per.box.w * dim.w * 100) / 100, `${dimensionId}/${name}.w`);
      assert.equal(box.h, Math.round(per.box.h * dim.h * 100) / 100, `${dimensionId}/${name}.h`);
    }
  }
});

test('auditEmitted PASSES a faithful emit and FAILS a moved box — the gate is not inert', () => {
  const opts = { template: T, dimensionId: 'portrait', floorPxFor, slotConstraint, DIMENSIONS };
  const good = buildSvg(layoutFor('portrait'), STUB_MARK);
  assert.deepEqual(auditEmitted(good, opts), []);

  // Nudge one box by a single pixel: the read-back truth moved, so the gate fires.
  const moved = good.replace(/(<rect id="box_heading" data-name="box" x=")([\d.]+)/, (_, a, x) => a + (Number(x) + 1));
  const fails = auditEmitted(moved, opts);
  assert.equal(fails.length, 1, JSON.stringify(fails));
  assert.match(fails[0], /heading\.box\.x/);
});

test('auditEmitted refuses more preview lines than maxLines, and type below the floor', () => {
  const opts = { template: T, dimensionId: 'portrait', floorPxFor, slotConstraint, DIMENSIONS };

  const tooManyLines = buildSvg(layoutFor('portrait', { lineCount: 4 }), STUB_MARK);
  assert.ok(auditEmitted(tooManyLines, opts).some((f) => /preview lines exceeds maxLines/.test(f)));

  const belowFloor = buildSvg(layoutFor('portrait', { size: 12 }), STUB_MARK);
  assert.ok(auditEmitted(belowFloor, opts).some((f) => /BELOW the floor/.test(f)));
});

test('law 3 — a slot/logo with no real vector geometry is rejected (no fabricated placeholder)', () => {
  const opts = { template: T, dimensionId: 'portrait', floorPxFor, slotConstraint, DIMENSIONS };
  const hollow = buildSvg(layoutFor('portrait'), { viewBox: '0 0 10 10', inner: '<!-- nothing -->' });
  assert.ok(auditEmitted(hollow, opts).some((f) => /no real vector geometry/.test(f)));
});

test('layer names carry BOTH spellings — data-name exact, id XML-legal', () => {
  // `slot/heading` is not a legal XML ID (a Name forbids `/`), which is why the
  // twin attribute exists at all. Whichever one Figma reads must name the layer.
  assert.equal(layerAttrs('slot/heading'), 'id="slot_heading" data-name="slot/heading"');
  assert.equal(layerAttrs('background'), 'id="background" data-name="background"');

  const svg = buildSvg(layoutFor('portrait'), STUB_MARK);
  for (const name of [...T.paintOrder, 'logo']) {
    assert.ok(svg.includes(`data-name="slot/${name}"`), `missing slot/${name}`);
    assert.ok(svg.includes(`id="slot_${name}"`), `missing id fallback for slot/${name}`);
  }
  assert.ok(svg.includes('data-name="background"'));
  // Duplicate ids would make the document invalid XML — box ids are per slot.
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).filter((i) => i.startsWith('box'));
  assert.equal(new Set(ids).size, ids.length, 'duplicate box ids');
});

test('the background layer fills the frame with the colour pair bg', () => {
  for (const dimensionId of DIM_IDS) {
    const dim = DIMENSIONS[dimensionId];
    const doc = parseSvg(buildSvg(layoutFor(dimensionId), STUB_MARK));
    assert.equal(Number(doc.background.width), dim.w);
    assert.equal(Number(doc.background.height), dim.h);
    assert.equal(doc.background.fill, T.colourPairs.find((p) => p.id === PREVIEW_PAIR_ID).bg);
  }
});

test('preview copy is the SAME strings as the real-*.png evidence renders', () => {
  const verify = readFileSync(join(here, '..', 'tools', 'verify-template-one.mjs'), 'utf8');
  for (const s of Object.values(PREVIEW_COPY)) {
    assert.ok(verify.includes(`'${s}'`), `the real-*.png renders no longer use "${s}" — the Figma seed would show different copy`);
  }
});

test('text is XML-escaped — an apostrophe in her copy must not break the import', () => {
  const doc = parseSvg(buildSvg(layoutFor('portrait'), STUB_MARK));
  assert.ok(doc.slots.heading.lines[0].text.includes('&lt;&amp;&quot;'), doc.slots.heading.lines[0].text);
  assert.equal(esc(`a & b < c > "d"`), 'a &amp; b &lt; c &gt; &quot;d&quot;');
});

// The measured artifacts, when they are on disk (generated/ is gitignored, so a
// clean checkout has none until the exporter runs).
test('the EMITTED artifacts satisfy every gate', { skip: !existsSync(svgPath('portrait')) && 'run: node scripts/tools/export-template-svg.mjs' }, () => {
  for (const dimensionId of DIM_IDS) {
    const svg = readFileSync(svgPath(dimensionId), 'utf8');
    assert.deepEqual(
      auditEmitted(svg, { template: T, dimensionId, floorPxFor, slotConstraint, DIMENSIONS }), [],
    );
    const doc = parseSvg(svg);
    for (const name of T.paintOrder) {
      assert.ok(doc.slots[name].lines.length >= 1, `${dimensionId}/${name}: preview copy did not paint`);
    }
    assert.ok(doc.logo.hasMarkGeometry, `${dimensionId}: the real brand mark is not inlined`);
  }
});


// ── THE PHOTO BOX IN THE SEED (client amendment 2026-08-18) ─────────────────
test('the photo box is emitted as round-trip truth, with NO stand-in photo (law 3)', () => {
  for (const dimId of DIM_IDS) {
    const dim = DIMENSIONS[dimId];
    const doc = parseSvg(buildSvg(layoutFor(dimId), STUB_MARK));
    const per = slotConstraint(T, 'photo', dimId);
    assert.ok(doc.photo, `${dimId}: no slot/photo group`);
    assert.equal(doc.photo.box.w, per.box.w * dim.w);
    assert.equal(doc.photo.box.h, per.box.h * dim.h);
    // A seed that shipped a placeholder image would be a fabricated asset, and
    // would also misrepresent the DEFAULT render (which has no photo at all).
    assert.equal(doc.photo.lines.length, 0, 'the photo group must carry no text');
    assert.equal(doc.photo.hasMarkGeometry, false, 'the photo group must carry no artwork');
  }
});

test('the seed records the DECLARED treatment so the designer can see it', () => {
  const svg = buildSvg(layoutFor('portrait'), STUB_MARK);
  const scrim = T.slots.photo.scrim.light;
  assert.match(svg, new RegExp(`fit=cover · scrim ${scrim.colour} @ ${scrim.opacity}`));
  assert.match(svg, /optional: no photo renders the plain colour field/);
});

test('auditEmitted refuses a moved photo box and an unexpected photo group', () => {
  const good = buildSvg(layoutFor('square'), STUB_MARK);
  const ctx = { template: T, dimensionId: 'square', floorPxFor, slotConstraint, DIMENSIONS };
  assert.deepEqual(auditEmitted(good, ctx), []);
  const moved = good.replace('<rect id="box_photo" data-name="box" x="0"', '<rect id="box_photo" data-name="box" x="40"');
  assert.ok(auditEmitted(moved, ctx).some((f) => /photo\.box\.x/.test(f)));
  // …and a template with no photo slot must not receive one.
  const noPhoto = { ...T, slots: { ...T.slots, photo: { present: false } } };
  assert.ok(auditEmitted(good, { ...ctx, template: noPhoto }).some((f) => /does not declare/.test(f)));
});
