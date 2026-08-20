// ── TEMPLATE TWO, "Petal Window" (client ruling 2026-08-18) ─────────────────
// The three ratified decisions, asserted as data rather than trusted as prose:
//   1. the photo is REQUIRED
//   2. text NEVER sits over the photo — fixed geometry, not a conditional
//   3. landscape is petal-left / field-right at the petal's TRUE proportions
// Plus law 3 (the mask is a REAL asset) and §7.1 (boxes sized from the floor).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TEMPLATE_PETAL_WINDOW as T, TEMPLATES, templateById,
} from '../../lib/templates/index.mjs';
import { validateTemplate, DIMENSIONS, MIN_PAIR_CONTRAST, contrastRatio } from '../../lib/templates/template-contract.mjs';
import {
  maskAssetById, templateMaskAsset, templateMaskShapes, resolveMaskAsset, MASK_SHAPE_LABELS,
} from '../../lib/templates/mask-assets.mjs';
import { DEFAULT_OVERLAY_ASSETS, PETAL_WINDOW_MASK_ASSET } from '../../lib/brand-defaults.js';
import { floorPxFor } from '../../lib/render-core/floor.mjs';
import { MEASURED_BUDGETS } from '../../lib/templates/template-petal-window.mjs';
import { svgSeedRefusal } from '../tools/export-template-svg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', '..', 'public');

test('template two is valid and registered', () => {
  assert.deepEqual(validateTemplate(T).errors, []);
  assert.equal(templateById('petal_window'), T);
  assert.ok(TEMPLATES.includes(T));
});

test('DECISION 1 — the photo is REQUIRED in every dimension, and the purpose text says so', () => {
  assert.equal(T.slots.photo.present, true);
  for (const dimId of Object.keys(T.dimensions)) {
    assert.equal(T.slots.photo.dimensions[dimId].required, true, `${dimId}: a petal window with no photo is not a design`);
  }
  assert.match(T.purpose, /photo is required/i, 'the gallery card must say the photo is required (§6.3 rule 3)');
});

test('DECISION 2 — the heading is OPTIONAL and its box never touches the photo box', () => {
  for (const dimId of Object.keys(T.dimensions)) {
    const dim = DIMENSIONS[dimId];
    const h = T.slots.heading.dimensions[dimId];
    const p = T.slots.photo.dimensions[dimId];
    assert.equal(h.required, false, `${dimId}: an empty heading must be a first-class result`);
    const hit = !(h.box.x + h.box.w <= p.box.x || p.box.x + p.box.w <= h.box.x
      || h.box.y + h.box.h <= p.box.y || p.box.y + p.box.h <= h.box.y);
    assert.equal(hit, false, `${dimId}: the heading band overlaps the petal — text would sit on the photograph`);
    // …and the band is REAL air, not a sliver: it must hold its own lines.
    assert.ok(h.box.h * dim.h >= h.maxLines * floorPxFor('heading', dim.w, dim.h) * T.registers.heading.lineRatio - 0.5,
      `${dimId}: the band cannot hold ${h.maxLines} lines at the floor`);
  }
});

test('DECISION 2 — the geometry is FIXED, never conditional (§6.2)', () => {
  // There is exactly ONE photo box and ONE heading box per dimension. A second
  // set keyed by "has a heading" would be the solver returning as data.
  for (const dimId of Object.keys(T.dimensions)) {
    for (const slot of ['photo', 'heading', 'logo']) {
      const per = T.slots[slot].dimensions[dimId];
      assert.equal(typeof per.box, 'object');
      assert.deepEqual(Object.keys(per.box).sort(), ['h', 'w', 'x', 'y']);
    }
  }
  // The contract's own behaviour scanner is the real guard; assert it is armed.
  const sneaky = JSON.parse(JSON.stringify({ ...T, slots: { ...T.slots } }));
  sneaky.slots.photo.when = { headingPresent: { box: { x: 0, y: 0, w: 1, h: 1 } } };
  assert.ok(validateTemplate(sneaky).errors.some((e) => /rule-shaped/.test(e)));
});

test('DECISION 3 — landscape is petal-LEFT / field-RIGHT, and every window box is SHAPE-AGNOSTIC', () => {
  const mask = templateMaskAsset(T);
  assert.ok(mask, 'the default mask must resolve to a real asset');
  // The shape is HERS to choose (client ruling 2026-08-18), so the box can no
  // longer be authored to one asset's ratio — the core CONTAINS each silhouette
  // in the box at its own proportions instead. What the box must be is close to
  // square, so no sanctioned shape (0.82 : 1 to 1.11 : 1) is badly letterboxed.
  for (const dimId of Object.keys(T.dimensions)) {
    const dim = DIMENSIONS[dimId];
    const p = T.slots.photo.dimensions[dimId].box;
    const ratio = (p.w * dim.w) / (p.h * dim.h);
    assert.ok(ratio > 0.9 && ratio < 1.15,
      `${dimId}: window box is ${ratio.toFixed(4)}:1 — too far from square for a set of near-square silhouettes`);
  }
  // …and every dimension uses the SAME box ratio, or one shape would fill the
  // window in one dimension and float in another.
  const ratios = Object.keys(T.dimensions).map((d) => {
    const dim = DIMENSIONS[d];
    const p = T.slots.photo.dimensions[d].box;
    return (p.w * dim.w) / (p.h * dim.h);
  });
  assert.ok(Math.max(...ratios) - Math.min(...ratios) < 0.01, `window box ratios diverge: ${JSON.stringify(ratios.map((r) => +r.toFixed(3)))}`);
  const lp = T.slots.photo.dimensions.landscape.box;
  const lh = T.slots.heading.dimensions.landscape.box;
  assert.ok(lp.x + lp.w <= 0.5, 'the landscape petal must live in the LEFT column');
  assert.ok(lh.x >= lp.x + lp.w, 'the landscape heading must live in the RIGHT field');
  // The reason this matters: a 16:9 letterbox crop destroys a vertical photo.
  // The left column is nearly square, so the photo keeps its frame.
  assert.ok(lp.w * 1600 / (lp.h * 900) < 1.1, 'the landscape petal column must not be a letterbox');
});

test('LAW 3 — EVERY selectable window shape is a real file, and none is inline geometry', () => {
  assert.ok(Array.isArray(T.allowedMaskShapes) && T.allowedMaskShapes.length >= 2,
    'the client asked for a CHOICE of petal shapes, not one');
  assert.equal(new Set(T.allowedMaskShapes).size, T.allowedMaskShapes.length, 'duplicate shape id');
  const shapes = templateMaskShapes(T);
  assert.equal(shapes.length, T.allowedMaskShapes.length, 'a declared shape id did not resolve');
  for (const shape of shapes) {
    assert.ok(existsSync(join(publicDir, shape.src)), `${shape.id}: ${shape.src} is not on disk`);
    assert.ok(shape.label && shape.label.trim(), `${shape.id}: no label`);
  }
  // The default must be one of them, so she can always get back to it.
  assert.ok(T.allowedMaskShapes.includes(T.slots.photo.mask));
  assert.equal(templateMaskAsset(T).id, T.slots.photo.mask);

  // Nothing in the template may carry path data or a viewBox — that would be a
  // second copy of a silhouette, free to drift from the file.
  const json = JSON.stringify(T);
  assert.ok(!/viewBox|\bd["']?\s*:\s*["']M/.test(json), 'the template carries inline vector geometry');

  // An id that is not a plain slug resolves to null and is never turned into a
  // traversing path; an UNSANCTIONED id falls back to the default, never draws.
  for (const bad of ['../secrets', 'Shape-1', 'a b', '', '/etc/passwd']) {
    assert.equal(maskAssetById(bad), null, `'${bad}' was turned into a path`);
  }
  assert.equal(resolveMaskAsset(T, 'not-sanctioned').id, T.slots.photo.mask);
  assert.equal(resolveMaskAsset(T, T.allowedMaskShapes[1]).id, T.allowedMaskShapes[1]);
  assert.equal(resolveMaskAsset(T, T.allowedMaskShapes[1]).explicit, true);
  assert.equal(resolveMaskAsset({ slots: { photo: {} } }, 'shape-1'), null);
});

test('the window shapes are TEMPLATE-TWO ONLY — they cannot reach the admin shapes rail', () => {
  // (client ruling 2026-08-18) The isolation is STRUCTURAL, so it is asserted
  // structurally: the resolver must not read the shared overlay catalog at all.
  // If it did, adding a petal here would mean adding a catalog row, and the new
  // shape would appear in the admin app's rail the moment it appeared here.
  const raw = readFileSync(join(here, '..', '..', 'lib', 'templates', 'mask-assets.mjs'), 'utf8');
  // Comments may DISCUSS the catalog — that is where the reasoning lives. Only
  // executable code is under test, so the comments come out first.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/DEFAULT_OVERLAY_ASSETS/.test(code), 'the mask resolver reads the shared overlay catalog — a template-two shape would leak into the admin rail');
  assert.ok(!/\bimport\b[^;]*brand-defaults/.test(code), 'the mask resolver imports the brand catalog');
  assert.ok(!/\bimport\b/.test(code), 'the mask resolver imports anything at all — isolation is easiest to keep when there is nothing to leak through');

  // And the other direction: what the admin rail offers is INDEPENDENT of this
  // template's list. Adding a shape here changes nothing there.
  const railBefore = DEFAULT_OVERLAY_ASSETS.map((a) => a.id);
  const hypothetical = { ...T, allowedMaskShapes: [...T.allowedMaskShapes, 'petal-4'] };
  assert.equal(templateMaskShapes(hypothetical).length, T.allowedMaskShapes.length + 1,
    'a new id must resolve without a catalog row — otherwise adding a petal is not a one-line change');
  assert.deepEqual(DEFAULT_OVERLAY_ASSETS.map((a) => a.id), railBefore,
    'the admin rail\'s offering moved when a template-two shape was added');
  // Some of the ids happen to also exist in the catalog (petal-brand does).
  // READING one is fine; the point is that the two lists are not the same list.
  assert.notDeepEqual([...T.allowedMaskShapes].sort(), railBefore.sort());
});

test("the NOTCHED petal is not offered — and that is CURATION, not retirement", () => {
  // (client ruling 2026-08-18) "remove the last petal option which has the
  // crop." The shape meant is petal-brand: derived verbatim from the orchid
  // mark, it carries the mark's column notch at the tip — measured at 73 notch
  // rows against 0 for every other candidate (generated/template-two/shape-audit).
  assert.ok(!T.allowedMaskShapes.includes('petal-brand'),
    'the notched brand petal is back in the picker — the client ruled it out');

  // …and NOTHING ELSE about that asset changed. The file is still on disk, the
  // catalog row is still there, and the admin app's Petal Window archetype
  // still masks through it, so every design that already uses it is untouched.
  assert.ok(existsSync(join(publicDir, 'assets', 'shapes', 'petal-brand.svg')),
    'the asset was DELETED — this was a curation decision, not a retirement');
  assert.ok(DEFAULT_OVERLAY_ASSETS.some((a) => a.id === 'petal-brand'),
    'the catalog row was removed — the admin rail and stored designs would move');
  assert.equal(PETAL_WINDOW_MASK_ASSET, 'petal-brand',
    "the admin archetype's mask constant moved — that is the admin app, not this template");

  // A short honest list beats a padded one, but it still has to be a CHOICE.
  assert.ok(T.allowedMaskShapes.length >= 2,
    'fewer than two window shapes is not a selection — say so rather than padding the list');
});

test('ADDING A PETAL is one line and no code — the id IS the filename', () => {
  // The whole documented procedure, executed: an id nobody has ever mentioned
  // resolves to a path and a label with no entry anywhere.
  const fresh = maskAssetById('petal-sunrise');
  assert.equal(fresh.src, '/assets/shapes/petal-sunrise.svg');
  assert.equal(fresh.label, 'Petal Sunrise');
  // A nicer label is optional, not required.
  assert.equal(maskAssetById('shape-1').label, MASK_SHAPE_LABELS['shape-1']);
});

test('the scrim is declared PER PAIR, for every pair, and is honestly labelled a tint', () => {
  const ids = T.colourPairs.map((p) => p.id);
  assert.deepEqual(Object.keys(T.slots.photo.scrim).sort(), [...ids].sort());
  for (const p of T.colourPairs) {
    assert.equal(T.slots.photo.scrim[p.id].colour, p.bg, `${p.id}: the wash must be that pair's own field colour`);
    // No ink is ever over this photo, so this number is a design tint, not a
    // legibility floor. It must therefore stay LIGHT — a heavy wash here would
    // be destroying the photograph for no legibility reason at all.
    assert.ok(T.slots.photo.scrim[p.id].opacity <= 0.2,
      `${p.id}: ${T.slots.photo.scrim[p.id].opacity} is a legibility scrim, not a tint — nothing is read against this photo`);
  }
});

test('every colour pair clears the pre-verified floor — including the one that was excluded', () => {
  for (const p of T.colourPairs) {
    const measured = contrastRatio(p.bg, p.ink);
    assert.ok(measured >= MIN_PAIR_CONTRAST, `${p.id}: ${measured}`);
    assert.equal(p.contrast, measured);
  }
  assert.equal(T.colourPairs[0].id, 'sage', "the client's own reference field comes first");
  // The petal_window archetype also sanctions a terracotta die-cut field. It is
  // NOT here, and the reason is arithmetic: it cannot carry a heading on either
  // ink. Asserted so a future edit cannot quietly add it back.
  assert.ok(!T.colourPairs.some((p) => p.id === 'terracotta'));
  assert.ok(contrastRatio('#D08C6E', '#F5F6E7') < MIN_PAIR_CONTRAST);
  assert.ok(contrastRatio('#D08C6E', '#254E48') < MIN_PAIR_CONTRAST);
});

test('the slots it does not use are declared ABSENT, not omitted (§6.3)', () => {
  for (const slot of ['eyebrow', 'body', 'pill', 'attribution', 'motif']) {
    assert.deepEqual(T.slots[slot], { present: false }, `${slot}: must be declared absent so a swap keeps her words`);
  }
  assert.equal(T.slots.photo.present, true);
  assert.equal(T.slots.heading.present, true);
  assert.equal(T.slots.logo.present, true);
});

test('budgets ARE the cross-dimension minimum and are well equalised (§7.1)', () => {
  const perDim = Object.keys(T.dimensions).map((d) => MEASURED_BUDGETS.heading[d]);
  assert.equal(MEASURED_BUDGETS.heading.min, Math.min(...perDim));
  assert.equal(T.slots.heading.charBudget, MEASURED_BUDGETS.heading.min);
  assert.deepEqual(T.slots.heading.measured, MEASURED_BUDGETS.heading);
  // §7.1 asks the author to EQUALISE, not merely to take a minimum. A spread of
  // more than a few characters means one dimension is dragging the rest down.
  assert.ok(Math.max(...perDim) - Math.min(...perDim) <= 3,
    `the per-dimension budgets ${JSON.stringify(perDim)} are not equalised`);
  assert.ok(MEASURED_BUDGETS.heading.min >= 25, 'a heading budget under 25 characters is not writable');
});

test('the mark stays clear of the petal AND the band, in both allowed corners', () => {
  assert.deepEqual(T.allowedLogoPositions, ['bottom-left', 'bottom-right']);
  assert.equal(T.allowedLogoPositions[0], 'bottom-left', "the client's reference puts the lockup bottom-left");
  const RATIO = 0.8333; // the shipped secondary lockup's height/width
  for (const dimId of Object.keys(T.dimensions)) {
    const dim = DIMENSIONS[dimId];
    const l = T.slots.logo.dimensions[dimId];
    const p = T.slots.photo.dimensions[dimId].box;
    const h = T.slots.heading.dimensions[dimId].box;
    for (const position of T.allowedLogoPositions) {
      const pad = l.pad * dim.w;
      const lw = l.widthFrac * dim.w;
      const lh = lw * RATIO;
      const x = position.endsWith('left') ? pad : dim.w - pad - lw;
      const y = dim.h - pad - lh;
      const m = { x: x / dim.w, y: y / dim.h, r: (x + lw) / dim.w, b: (y + lh) / dim.h };
      for (const [name, box] of [['petal', p], ['band', h]]) {
        const hit = !(m.r <= box.x || box.x + box.w <= m.x || m.b <= box.y || box.y + box.h <= m.y);
        assert.equal(hit, false, `${dimId}/${position}: the mark overlaps the ${name}`);
      }
    }
    assert.ok(l.box.x >= 0 && l.box.y >= 0 && l.box.x + l.box.w <= 1.0001 && l.box.y + l.box.h <= 1.0001);
  }
});

test('the Figma SVG seed REFUSES a masked template rather than dropping the mask (M4)', () => {
  const refusal = svgSeedRefusal(T);
  assert.ok(refusal, 'a masked template must be refused by the seed exporter');
  assert.match(refusal, new RegExp(T.slots.photo.mask));
  assert.match(refusal, /round trip/);
  // …and template one, which has no mask, is still exportable.
  assert.equal(svgSeedRefusal(templateById('label_headline')), null);
});
