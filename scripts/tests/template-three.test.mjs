// ── TEMPLATE THREE, "Caption Band" (client ruling 2026-08-20) ───────────────
// The five ratified decisions, asserted as data rather than trusted as prose:
//   1. the PILL is the dominant line, above the heading — and the labels say so
//   2. the photo is REQUIRED
//   3. landscape is photo-LEFT / text-RIGHT
//   4. the motif is FIXED — one real asset, no picker
//   5. the photo is croppable
// Plus law 3 (every asset is real), §7.1 (boxes sized from the floor), and the
// two things this template put into the shared core: the pill's floor register
// and the mark plate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TEMPLATE_CAPTION_BAND as T, TEMPLATE_LABEL_HEADLINE, TEMPLATE_PETAL_WINDOW,
  TEMPLATES, templateById, DEFAULT_TEMPLATE_ID,
} from '../../lib/templates/index.mjs';
import {
  validateTemplate, DIMENSIONS, slotConstraint, PANEL_SECTION_SERVES, SLOTS, TEXT_SLOTS,
  MOTIF_MAX_OPACITY,
} from '../../lib/templates/template-contract.mjs';
import { motifAssetById, templateMotifAsset, templateMotifs, MOTIF_LABELS } from '../../lib/templates/motif-assets.mjs';
import { templateLogoVariants } from '../../lib/templates/logo-assets.mjs';
import { floorPxFor, SLOT_FLOOR_REGISTER } from '../../lib/render-core/floor.mjs';
import { MEASURED_BUDGETS } from '../../lib/templates/template-caption-band.mjs';
import { DEFAULT_OVERLAY_ASSETS } from '../../lib/brand-defaults.js';
import { svgSeedRefusal } from '../tools/export-template-svg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', '..', 'public');
const dimIds = () => Object.keys(T.dimensions);
const rect = (b) => ({ x: b.x, y: b.y, r: b.x + b.w, b: b.y + b.h });
const hit = (a, c) => !(a.r <= c.x || c.r <= a.x || a.b <= c.y || c.b <= a.y);

test('template three is valid and registered — and it did not take over the default', () => {
  assert.deepEqual(validateTemplate(T).errors, []);
  assert.equal(templateById('caption_band'), T);
  assert.ok(TEMPLATES.includes(T));
  assert.equal(TEMPLATES.length, 3, 'the composer offers all three');
  assert.equal(DEFAULT_TEMPLATE_ID, 'label_headline', 'the app still opens on Classic');
});

test('DECISION 1 — the PILL is the dominant line, and it is authored, not hoped for', () => {
  for (const dimId of dimIds()) {
    const dim = DIMENSIONS[dimId];
    const head = T.slots.heading.dimensions[dimId];
    const pill = T.slots.pill.dimensions[dimId];
    const floor = floorPxFor('pill', dim.w, dim.h);
    // The kicker's box is the house convention: ONE line at the floor.
    const kickerLine = head.maxLines * floorPxFor('heading', dim.w, dim.h) * T.registers.heading.lineRatio;
    assert.ok(Math.abs(head.box.h * dim.h - kickerLine * 1.02) < 2,
      `${dimId}: the kicker box is ${(head.box.h * dim.h).toFixed(1)}px, not the ${(kickerLine * 1.02).toFixed(1)}px convention`);
    // The pill's box is deliberately taller, so short copy paints large (§7).
    const ratio = (pill.box.h * dim.h) / floor;
    assert.ok(ratio > 1.8 && ratio < 2.0,
      `${dimId}: the pill box is ${ratio.toFixed(3)}x its floor line — the authored value is 1.906x`);
    assert.ok(pill.box.h > head.box.h, `${dimId}: the pill box must be taller than the kicker's`);
    // Both are ONE line: a two-line pill leaves a dead line under short copy.
    assert.equal(pill.maxLines, 1, `${dimId}: the pill is one line`);
    assert.equal(head.maxLines, 1, `${dimId}: the kicker is one line`);
    // …and the pill sits BELOW the kicker.
    assert.ok(pill.box.y > head.box.y, `${dimId}: the big words sit under the quiet line`);
  }
  // Registers: a light sans kicker, a tracked serif caps pill.
  assert.equal(T.registers.heading.face, 'body');
  assert.equal(T.registers.heading.weight, 300);
  assert.equal(T.registers.heading.caps, false);
  assert.equal(T.registers.pill.face, 'title');
  assert.equal(T.registers.pill.caps, true);
  assert.equal(T.paintOrder.join(','), 'heading,pill');
});

test('DECISION 1 — the FIELD LABELS must not lie about the hierarchy', () => {
  // Both fields are renamed. Reusing the surface's Classic-shaped defaults here
  // would tell her the heading carries the post, which is the opposite of what
  // the picture shows (M4).
  for (const slot of ['heading', 'pill']) {
    const row = T.slotLabels?.[slot];
    assert.ok(row && row.label && row.hint, `${slot}: this template must override the surface's default copy`);
  }
  assert.ok(!/carries the post/i.test(T.slotLabels.heading.label),
    "the heading is a KICKER here — Classic's label would be a lie");
  assert.match(T.slotLabels.pill.hint, /capital/i, 'the pill hint must say the words are set in capitals');
  assert.match(T.slotLabels.pill.hint, /biggest/i, 'the pill hint must say it is the biggest type on the design');
  // The other two templates keep their own copy — the three are independent.
  assert.equal(TEMPLATE_LABEL_HEADLINE.slotLabels, undefined);
  assert.deepEqual(Object.keys(TEMPLATE_PETAL_WINDOW.slotLabels), ['heading']);
});

test('DECISION 2 — the photo is REQUIRED in every dimension, and the purpose text says so', () => {
  assert.equal(T.slots.photo.present, true);
  for (const dimId of dimIds()) {
    assert.equal(T.slots.photo.dimensions[dimId].required, true, `${dimId}: a caption band with no picture is not this design`);
  }
  assert.match(T.purpose, /photo is required/i);
});

test('DECISION 3 — landscape is photo-LEFT / text-RIGHT, at a TALL crop', () => {
  const p = T.slots.photo.dimensions.landscape.box;
  const dim = DIMENSIONS.landscape;
  assert.equal(p.x, 0);
  assert.equal(p.h, 1, 'the photo column runs the full height');
  assert.ok(p.w < 0.5, 'the photo takes the left column, not the frame');
  const ratio = (p.w * dim.w) / (p.h * dim.h);
  assert.ok(ratio < 0.9, `the landscape crop is ${ratio.toFixed(3)}:1 — the whole point is that it stays TALL`);
  for (const slot of ['heading', 'pill']) {
    const t = T.slots[slot].dimensions.landscape.box;
    assert.ok(t.x >= p.x + p.w, `${slot}: the text column must start right of the photo`);
  }
  // …and the three tall frames are the other arrangement: full-bleed on top.
  for (const dimId of ['portrait', 'story', 'square']) {
    const b = T.slots.photo.dimensions[dimId].box;
    assert.equal(b.x, 0); assert.equal(b.y, 0); assert.equal(b.w, 1);
    assert.ok(b.h > 0.6 && b.h < 0.8, `${dimId}: the photo is roughly the top 72%, not ${b.h}`);
  }
});

test('DECISION 4 — the motif is FIXED, and it is a REAL asset (law 3)', () => {
  assert.ok(Array.isArray(T.motif));
  assert.equal(T.motif.length, 1, 'the client ruled the motif fixed — a second id would be a choice she cannot make');
  assert.equal(T.slots.motif.present, true);
  assert.equal(T.slots.motif.asset, T.motif[0]);
  const asset = templateMotifAsset(T);
  assert.ok(asset, 'the declared motif must resolve');
  assert.equal(asset.id, 'petal-brand');
  assert.ok(existsSync(join(publicDir, asset.src.replace(/^\//, ''))), `law 3: ${asset.src} must be a real file`);
  assert.deepEqual(templateMotifs(T).map((m) => m.id), ['petal-brand']);
  // It is the BRAND petal, derived from the ratified orchid mark — not a new
  // shape invented for this template.
  assert.ok(DEFAULT_OVERLAY_ASSETS.some((o) => o.id === 'petal-brand' && o.src === asset.src));
  assert.equal(MOTIF_LABELS['petal-brand'], 'Brand petal');
  // NO PICKER. Nothing in the panel serves a motif, in either direction.
  for (const section of T.panelSections) {
    assert.ok(!PANEL_SECTION_SERVES[section].includes('motif'), `${section} must not offer a motif picker`);
  }
});

test('DECISION 4 — the motif is DATA: a box and a ghosted opacity per dimension', () => {
  for (const dimId of dimIds()) {
    const m = T.slots.motif.dimensions[dimId];
    assert.equal(typeof m.opacity, 'number');
    assert.ok(m.opacity > 0 && m.opacity <= MOTIF_MAX_OPACITY, `${dimId}: ${m.opacity} is not a ghost`);
    assert.equal(m.required, false, 'a fixed motif can never be something SHE failed to supply');
    // It lives in the BAND, never over the photograph.
    const p = T.slots.photo.dimensions[dimId].box;
    assert.equal(hit(rect(m.box), rect(p)), false, `${dimId}: the motif must not reach the photo`);
    // …and inside the frame: only a photo window may bleed.
    assert.ok(m.box.x >= 0 && m.box.y >= 0 && m.box.x + m.box.w <= 1 && m.box.y + m.box.h <= 1);
  }
});

test('an id that would traverse a path resolves to NOTHING rather than a 404 (law 3)', () => {
  for (const bad of ['../secret', '/etc/passwd', 'Shape-1', '', null]) {
    assert.equal(motifAssetById(bad), null, `${bad} must not resolve`);
  }
  assert.equal(motifAssetById('petal-brand').src, '/assets/shapes/petal-brand.svg');
  // A template with no motif slot resolves to null and fetches nothing.
  assert.equal(templateMotifAsset(TEMPLATE_LABEL_HEADLINE), null);
  assert.equal(templateMotifAsset(TEMPLATE_PETAL_WINDOW), null);
});

test("the brand petal is the WATERMARK here and the WINDOW nowhere — two jobs, one honest asset", () => {
  // Template two curated `petal-brand` out of its window picker because its
  // column notch reads as a bite out of a photograph. That is a fact about
  // CUTTING a photo, not about the asset, so stamping it into flat field here
  // is not a contradiction — and this test pins both halves so neither can
  // drift into the other.
  assert.ok(!TEMPLATE_PETAL_WINDOW.allowedMaskShapes.includes('petal-brand'));
  assert.equal(T.allowedMaskShapes, undefined, 'this template has no window, so it sanctions no silhouettes');
  assert.equal(T.slots.photo.mask, undefined, 'the photo here is a full frame, not a cut-out');
});

test('DECISION 5 — the photo is croppable, and Classic\'s still is not', () => {
  assert.equal(T.slots.photo.adjustable, true);
  assert.equal(TEMPLATE_PETAL_WINDOW.slots.photo.adjustable, true);
  assert.equal(TEMPLATE_LABEL_HEADLINE.slots.photo.adjustable, false);
});

test('THE MARK PLATE — declared for every pair, opaque, and clear of the type', () => {
  const plate = T.slots.logo.plate;
  assert.ok(plate, 'the mark is on the photograph, so it must declare its own field');
  assert.ok(plate.pad > 0 && plate.pad <= 1);
  assert.equal(plate.radius, 0.5, 'a stadium');
  for (const pair of T.colourPairs) {
    const row = plate.fill[pair.id];
    assert.ok(row, `${pair.id}: every pair needs its own plate`);
    assert.equal(row.colour, pair.bg, `${pair.id}: the plate is the pair's OWN field colour, never a new one (law 7)`);
    assert.equal(row.opacity, 1,
      `${pair.id}: the plate is opaque on purpose — a translucent one leaves the mark's ratio a function of her photograph`);
  }
  // The plate is bigger than the mark, inside the frame, and never on the type.
  for (const dimId of dimIds()) {
    const dim = DIMENSIONS[dimId];
    const l = T.slots.logo.dimensions[dimId];
    const lw = l.widthFrac * dim.w;
    const lh = lw * 0.8333;
    const pp = plate.pad * lw;
    for (const position of T.allowedLogoPositions) {
      const x = position.endsWith('left') ? l.pad * dim.w : dim.w - l.pad * dim.w - lw;
      const y = l.pad * dim.w;
      const q = { x: (x - pp) / dim.w, y: (y - pp) / dim.h, r: (x + lw + pp) / dim.w, b: (y + lh + pp) / dim.h };
      assert.ok(q.x >= 0 && q.y >= 0 && q.r <= 1 && q.b <= 1, `${dimId}/${position}: the plate falls outside the frame`);
      for (const slot of ['heading', 'pill']) {
        assert.equal(hit(q, rect(T.slots[slot].dimensions[dimId].box)), false, `${dimId}/${position}: the plate covers the ${slot}`);
      }
    }
  }
});

test('the mark sits in a TOP corner — the bottom of every frame is the band', () => {
  assert.deepEqual(T.allowedLogoPositions, ['top-right', 'top-left']);
  for (const p of T.allowedLogoPositions) assert.ok(p.startsWith('top'));
  // And the inset is bigger than the other two templates', because the plate
  // grows outward from the mark and has to fit inside the frame.
  for (const dimId of dimIds()) {
    assert.equal(T.slots.logo.dimensions[dimId].pad, 0.07);
  }
});

test('TEXT NEVER SITS ON THE PHOTOGRAPH — measured rects, in every dimension', () => {
  for (const dimId of dimIds()) {
    const p = rect(T.slots.photo.dimensions[dimId].box);
    for (const slot of ['heading', 'pill']) {
      assert.equal(hit(rect(T.slots[slot].dimensions[dimId].box), p), false,
        `${dimId}: the ${slot} box intersects the photo — the band is where the type lives`);
    }
  }
  // …which is exactly why NO legibility scrim is declared under the type: the
  // band is the pre-verified field. The photo's scrim is a TINT and says so.
  for (const pair of T.colourPairs) {
    const s = T.slots.photo.scrim[pair.id];
    assert.ok(s, `${pair.id}: the contract requires a scrim row for every pair`);
    assert.equal(s.colour, pair.bg, 'the tint is the pair\'s own field colour');
    assert.ok(s.opacity <= 0.15, `${pair.id}: ${s.opacity} is a wash, not a tint — the photograph is the point here`);
  }
});

test('THE PILL\'S FLOOR REGISTER changed, and NOTHING else could have been touched by it', () => {
  assert.equal(SLOT_FLOOR_REGISTER.pill, 'headline',
    'on the dateLabel floor the budget was ~28 and the hierarchy inverted at full copy');
  // The change is safe because this is the ONLY template that paints a pill.
  const withPill = TEMPLATES.filter((t) => t.slots.pill?.present);
  assert.deepEqual(withPill.map((t) => t.id), ['caption_band']);
  // The other slots' registers are untouched.
  assert.equal(SLOT_FLOOR_REGISTER.heading, 'headline');
  assert.equal(SLOT_FLOOR_REGISTER.eyebrow, 'dateLabel');
  assert.equal(SLOT_FLOOR_REGISTER.body, 'body');
});

test('budgets ARE the cross-dimension minimum and are well equalised (§7.1)', () => {
  for (const slot of ['heading', 'pill']) {
    const measured = MEASURED_BUDGETS[slot];
    const perDim = dimIds().map((d) => measured[d]);
    assert.equal(measured.min, Math.min(...perDim), `${slot}: min must be the cross-dimension minimum`);
    assert.equal(T.slots[slot].charBudget, measured.min);
    for (const d of dimIds()) assert.equal(T.slots[slot].dimensions[d].charBudget, measured[d]);
    // §7.1: "a landscape form far tighter than its portrait sibling drags
    // everyone's budget down." Two characters is authored equalisation.
    assert.ok(Math.max(...perDim) - Math.min(...perDim) <= 2,
      `${slot}: budgets ${JSON.stringify(perDim)} are not equalised across the dimensions`);
  }
  // The client's own two lines must FIT the budgets they are the example for.
  assert.ok('NOW ENROLLING'.length <= T.slots.pill.charBudget);
  assert.ok('Term 3 places open'.length <= T.slots.heading.charBudget);
});

test('every box can hold its declared lines AT THE FLOOR (§7)', () => {
  for (const dimId of dimIds()) {
    const dim = DIMENSIONS[dimId];
    for (const slot of ['heading', 'pill']) {
      const per = T.slots[slot].dimensions[dimId];
      const need = per.maxLines * floorPxFor(slot, dim.w, dim.h) * T.registers[slot].lineRatio;
      assert.ok(per.box.h * dim.h >= need - 0.5, `${dimId}/${slot}: the box cannot hold ${per.maxLines} line(s) at the floor`);
    }
  }
});

test('the slots it does not use are declared ABSENT, not omitted (§6.3 — deactivating never deletes)', () => {
  for (const slot of ['eyebrow', 'body', 'attribution']) {
    assert.equal(T.slots[slot].present, false, `${slot} must be declared absent`);
  }
  // …and every template declares the WHOLE closed set, which is what makes a
  // three-way swap incapable of dropping a key.
  for (const tpl of TEMPLATES) {
    for (const slot of SLOTS) assert.ok(tpl.slots[slot], `${tpl.id}: ${slot} must be declared`);
  }
  /* FOUR OF THE FIVE TEXT SLOTS ARE NOW PAINTED SOMEWHERE, so the three-way
     swap round trip really exercises them: eyebrow and body on Classic,
     heading on all three, pill here. `attribution` is still painted by NO
     template — recorded rather than glossed over, because a closed-set slot
     that no template has ever used is worth the client knowing about (§13's
     "are motifs actually used?" question, wearing a different name). */
  for (const slot of ['eyebrow', 'heading', 'body', 'pill']) {
    assert.ok(TEMPLATES.some((t) => t.slots[slot]?.present), `${slot} is painted by no template`);
  }
  assert.equal(TEXT_SLOTS.length, 5);
  assert.ok(!TEMPLATES.some((t) => t.slots.attribution?.present),
    'if a template starts painting `attribution`, delete this line — it is a note, not a rule');
});

test('the panel leads with what sits BEHIND the words, then the words, then the mark', () => {
  assert.deepEqual(T.panelSections, ['background', 'words', 'mark', 'markPosition']);
  // `background` is the merged section: on this template the pair IS the band
  // and the photo is the field above it, so they are two halves of one thing.
  assert.deepEqual([...PANEL_SECTION_SERVES.background], ['colourPair', 'photo']);
  assert.ok(T.panelSections.indexOf('background') < T.panelSections.indexOf('words'));
  assert.ok(T.panelSections.indexOf('words') < T.panelSections.indexOf('mark'));
  // …and it declares no `window` section, because it has no window.
  assert.ok(!T.panelSections.includes('window'));
});

test('every sanctioned mark variant is a REAL brand asset (law 3)', () => {
  const variants = templateLogoVariants(T);
  assert.equal(variants.length, T.allowedLogoAssets.length, 'an id resolved to nothing');
  for (const v of variants) {
    assert.ok(existsSync(join(publicDir, v.src.replace(/^\//, ''))), `law 3: ${v.src} must exist`);
    assert.ok(v.ink, `${v.id}: the backdrop check needs the ink this variant paints in`);
  }
  for (const klass of ['light', 'dark']) {
    const src = T.logoAssets[klass];
    assert.ok(existsSync(join(publicDir, src.replace(/^\//, ''))), `law 3: ${src} must exist`);
  }
});

test('it declares ONE layout — no states, so the core cannot branch at all', () => {
  assert.equal(T.states, undefined);
  assert.equal(slotConstraint(T, 'pill', 'portrait', 'photoOnly'), T.slots.pill.dimensions.portrait);
});

test('nothing about Classic or Petal Window moved', () => {
  // The two things this template put into shared code are both no-ops for them:
  // neither declares a pill, and neither declares a plate.
  for (const tpl of [TEMPLATE_LABEL_HEADLINE, TEMPLATE_PETAL_WINDOW]) {
    assert.equal(tpl.slots.pill.present, false);
    assert.equal(tpl.slots.logo.plate, undefined);
    assert.equal(tpl.slots.motif.present, false);
    assert.equal(tpl.motif, 'none');
    assert.deepEqual(validateTemplate(tpl).errors, [], `${tpl.id} must still validate`);
  }
});

test('the Figma SVG seed REFUSES this template rather than dropping the motif or the plate (M4)', () => {
  // The seed's round-trip truth is a plain box rect. It cannot carry a
  // silhouette stamped into the field, and it cannot carry the plate that is
  // the entire reason the mark is legible on a photograph. Handing the designer
  // a Figma file that is not the template — and then importing that difference
  // back as truth — is the failure this refusal exists to prevent.
  const refusal = svgSeedRefusal(T);
  assert.ok(refusal, 'a template with a motif and a plate must refuse the seed');
  assert.match(refusal, /motif/);
  // …and it still emits for the template that has neither.
  assert.equal(svgSeedRefusal(TEMPLATE_LABEL_HEADLINE), null);
});
