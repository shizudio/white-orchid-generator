// ── TEMPLATE ONE — the baked `label_headline` (spec §12) ────────────────────
// The template loads through assertValidTemplate at import time, so simply
// importing it is already the contract gate. These tests pin the facts a future
// edit could silently move: the slot MAPPING from today's roles, the four
// authored dimensions, the §7.1 minimum, and the text-only honesty of §6.3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TEMPLATE_LABEL_HEADLINE as T, MEASURED_BUDGETS } from '../../lib/templates/template-label-headline.mjs';
import { TEMPLATES, templateById, DEFAULT_TEMPLATE_ID } from '../../lib/templates/index.mjs';
import { validateTemplate, DIMENSIONS } from '../../lib/templates/template-contract.mjs';
import { floorPxFor } from '../../lib/render-core/floor.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('template one is valid, registered, and the app default', () => {
  assert.deepEqual(validateTemplate(T).errors, []);
  assert.equal(templateById('label_headline'), T);
  assert.equal(DEFAULT_TEMPLATE_ID, 'label_headline');
  assert.equal(TEMPLATES.length, 1, '§12: build ONE template end to end first');
});

test('SLOT MAPPING from today\'s archetype roles — microLabel→eyebrow, hero→heading, support→body, logo→logo', () => {
  // The archetype these fractions descend from, read from the live catalog so a
  // catalog edit that drifts from the bake is visible here.
  const gen = readFileSync(join(here, '..', '..', 'components', 'Generator.jsx'), 'utf8');
  const at = gen.indexOf('id:"label_headline"');
  assert.ok(at > 0, 'the label_headline archetype vanished from the catalog');
  const block = gen.slice(at, at + 2400);
  assert.ok(/microLabel:\{x:0\.08,y:0\.13/.test(block), 'archetype microLabel geometry moved — re-review the bake');
  assert.ok(/hero:\{x:0\.08,y:0\.22/.test(block));
  assert.ok(/support:\{x:0\.08,y:0\.62/.test(block));
  assert.ok(/heroRegister:"serif"/.test(block) && /caps:false/.test(block));
  assert.ok(/logoUse:"mark"/.test(block));

  // …and the baked template carries those roles under the CLOSED vocabulary names.
  assert.equal(T.slots.eyebrow.present, true);
  assert.equal(T.slots.heading.present, true);
  assert.equal(T.slots.body.present, true);
  assert.equal(T.slots.logo.present, true);
  assert.equal(T.registers.heading.face, 'title', 'hero → serif register');
  assert.equal(T.registers.eyebrow.caps, true, 'microLabel → tracked all-caps');
  assert.equal(T.registers.body.face, 'body');
});

test('this template is TEXT-ONLY and says so honestly (§6.3 — deactivating never deletes)', () => {
  for (const s of ['photo', 'motif', 'pill', 'attribution']) {
    assert.equal(T.slots[s].present, false, `${s} must be declared absent, not omitted`);
  }
  assert.equal(T.motif, 'none');
  assert.match(T.purpose, /text only/i, '§6.3 rule 3: the purpose text states the slots');
});

test('all four dimensions are AUTHORED — every text slot has its own box per dimension (§5)', () => {
  assert.deepEqual(Object.keys(T.dimensions).sort(), ['landscape', 'portrait', 'square', 'story']);
  for (const slot of T.paintOrder) {
    const boxes = Object.keys(T.dimensions).map((d) => JSON.stringify(T.slots[slot].dimensions[d].box));
    assert.equal(new Set(boxes).size >= 2, true, `${slot}: every dimension shares one box — that is derive-from-master, not authoring`);
  }
  // …and the declared canvas sizes match the contract's four.
  for (const [id, dim] of Object.entries(T.dimensions)) {
    assert.equal(dim.w, DIMENSIONS[id].w);
    assert.equal(dim.h, DIMENSIONS[id].h);
  }
});

test('every text box is sized for its declared maxLines AT THE FLOOR (§7.1)', () => {
  for (const slot of T.paintOrder) {
    const reg = T.registers[slot];
    for (const [dimId, dim] of Object.entries(T.dimensions)) {
      const per = T.slots[slot].dimensions[dimId];
      const floorPx = floorPxFor(slot, dim.w, dim.h);
      const needed = per.maxLines * floorPx * reg.lineRatio;
      const actual = per.box.h * dim.h;
      assert.ok(actual >= needed - 0.5, `${slot}/${dimId}: box ${actual.toFixed(1)}px cannot hold ${per.maxLines} lines at the ${floorPx.toFixed(1)}px floor (needs ${needed.toFixed(1)}px)`);
      assert.ok(actual <= needed * 1.30, `${slot}/${dimId}: box ${actual.toFixed(1)}px is far taller than its ${per.maxLines} floor-lines (${needed.toFixed(1)}px) — the box is meant to be sized FROM the floor`);
    }
  }
});

test('every box stays on canvas', () => {
  for (const slot of [...T.paintOrder, 'logo']) {
    for (const dimId of Object.keys(T.dimensions)) {
      const per = T.slots[slot].dimensions[dimId];
      const b = per.box;
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001, `${slot}/${dimId}: box escapes the canvas`);
    }
  }
});

test('declared budgets ARE the cross-dimension minimum, and the per-dimension row is recorded (§7.1)', () => {
  for (const slot of T.paintOrder) {
    const measured = MEASURED_BUDGETS[slot];
    const perDim = Object.keys(T.dimensions).map((d) => measured[d]);
    assert.equal(measured.min, Math.min(...perDim), `${slot}: recorded min disagrees with its own row`);
    assert.equal(T.slots[slot].charBudget, measured.min);
    assert.deepEqual(T.slots[slot].measured, measured, `${slot}: the per-dimension measurements must stay visible in the data`);
    for (const d of Object.keys(T.dimensions)) {
      assert.equal(T.slots[slot].dimensions[d].charBudget, measured[d]);
    }
  }
});

test('budgets are big enough to write a real post in (the §12 usability check)', () => {
  assert.ok(T.slots.eyebrow.charBudget >= 13, `eyebrow budget ${T.slots.eyebrow.charBudget} cannot hold "NOW ENROLLING"`);
  assert.ok(T.slots.heading.charBudget >= 40, `heading budget ${T.slots.heading.charBudget} is too small for a statement`);
  assert.ok(T.slots.body.charBudget >= 30, `body budget ${T.slots.body.charBudget} is too small for a support line`);
});

test('every colour pair is pre-verified and both logo assets are real files (law 3)', () => {
  assert.ok(T.colourPairs.length >= 4);
  for (const p of T.colourPairs) assert.ok(p.contrast >= 4.5, `${p.id}: ${p.contrast}`);
  for (const src of Object.values(T.logoAssets)) {
    const path = join(here, '..', '..', 'public', src.replace(/^\//, ''));
    assert.doesNotThrow(() => readFileSync(path), `logo asset missing: ${src}`);
  }
});

test('allowedLogoPositions is a real subset — no free placement (§3 non-goals)', () => {
  assert.ok(Array.isArray(T.allowedLogoPositions) && T.allowedLogoPositions.length >= 1);
  assert.ok(T.allowedLogoPositions.every((p) => /^(top|bottom)-(left|right|center)$/.test(p)));
});
