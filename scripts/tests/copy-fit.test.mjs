// ── COPY FIT (spec §8.1 requirement 1) ──────────────────────────────────────
// "One-click improve must write within the slot's charBudget. Otherwise it hands
//  back copy that does not fit and re-opens overflow through the front door."
//
// Also a MIRROR GUARD (trap M6): lib/copy-fit.mjs is the third copy of this trim.
// If the assistant route's copy drifts, this fails closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fitCopy, templateCopyBudgets } from '../../lib/copy-fit.mjs';
import { TEMPLATE_LABEL_HEADLINE as T } from '../../lib/templates/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('never returns more than the budget', () => {
  const long = 'Every child at the White Orchid is capable of leading their own day, and our educators are here to follow.';
  for (const max of [8, 12, 24, 36, 48, 60, 200]) {
    assert.ok(fitCopy(long, max).length <= max, `budget ${max} breached`);
  }
});

test('prefers a sentence boundary inside budget when one sits past halfway', () => {
  assert.equal(fitCopy('We are open. Come and see the garden today.', 20), 'We are open.');
});

test('otherwise cuts on a whole word and never on a dangling function word', () => {
  assert.equal(fitCopy('a week of creativity and colour', 26), 'a week of creativity');
  // (and when the copy already fits, it is returned VERBATIM — dangle and all)
  assert.equal(fitCopy('a week of creativity and', 24), 'a week of creativity and');
  assert.ok(!/\s(and|the|of|to|a|our)$/i.test(fitCopy('a week of creativity and colour', 24)));
});

test('leaves copy already inside budget completely alone (her words are verbatim)', () => {
  assert.equal(fitCopy('Open house on Saturday', 48), 'Open house on Saturday');
  assert.equal(fitCopy('   padded   ', 48), 'padded');
  assert.equal(fitCopy('', 48), '');
  assert.equal(fitCopy(null, 48), '');
});

test('templateCopyBudgets reads the BAKED budgets, not a recomputation (§10B)', () => {
  const b = templateCopyBudgets(T);
  assert.deepEqual(Object.keys(b).sort(), ['body', 'eyebrow', 'heading']);
  assert.equal(b.heading, T.slots.heading.charBudget);
  assert.ok(!('photo' in b) && !('pill' in b), 'absent slots carry no budget');
});

test('MIRROR: the assistant route still carries the same trim (fails closed on drift)', () => {
  const src = readFileSync(join(here, '..', '..', 'app', 'api', 'assistant', 'route.js'), 'utf8');
  const at = src.indexOf('function fitCopy(s, max) {');
  assert.ok(at > 0, 'fitCopy vanished from app/api/assistant/route.js — the mirror moved');
  const body = src.slice(at, src.indexOf('\n}\n', at));
  for (const marker of ['[.!?](\\s|$)', 'max * 0.5', 'DANGLES', "replace(/\\s+\\S*$/, '')"]) {
    assert.ok(body.includes(marker), `assistant fitCopy no longer contains '${marker}' — the two trims have drifted`);
  }
});
