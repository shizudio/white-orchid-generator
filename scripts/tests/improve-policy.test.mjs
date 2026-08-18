// ── ONE-CLICK IMPROVE (spec §8.1) ───────────────────────────────────────────
// The two hard requirements, tested WITHOUT spending a cent (money law):
//   1. it must write within the slot's charBudget
//   2. it must be revertible, visibly
// Requirement 2 is a surface property, so it is asserted against the route's
// source: every response shape must carry `original` back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveBudget, localPolish, normalizeImproved, buildImproveSystemPrompt } from '../../lib/improve-policy.mjs';
import { TEMPLATE_LABEL_HEADLINE as T } from '../../lib/templates/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const routeSrc = readFileSync(join(here, '..', '..', 'app', 'api', 'improve', 'route.js'), 'utf8');

test('the budget comes from the BAKED TEMPLATE, never from the request', () => {
  assert.equal(resolveBudget(T, 'heading'), T.slots.heading.charBudget);
  assert.equal(resolveBudget(T, 'photo'), null, 'a non-text slot has no budget');
  assert.equal(resolveBudget(T, 'pill'), null, 'an absent slot has no budget');
  assert.equal(resolveBudget(null, 'heading'), null);
  // …and the route reads it that way, not off the body.
  assert.match(routeSrc, /resolveBudget\(templateById\(templateId\), slot\)/);
  assert.ok(!/payload\?\.budget|body\.budget/.test(routeSrc), 'the client must not be able to widen the budget');
});

test('REQUIREMENT 1 — a model that ignores the budget still cannot overflow', () => {
  const budget = T.slots.heading.charBudget;
  const runaway = 'Here is the improved line: "Every single child at The White Orchid Preschool is entirely capable of leading their own day, every day, all year."';
  const out = normalizeImproved(runaway, budget);
  assert.ok(out.length <= budget, `${out.length} > ${budget}`);
  assert.ok(!out.startsWith('Here is'), 'the preamble must be stripped');
  assert.ok(!/^["“']/.test(out) && !/["”']$/.test(out), 'the quoting must be stripped');
});

test('a model that offers a MENU of options yields one line, not a list', () => {
  const out = normalizeImproved('Option one is good\nOption two is better\nOption three', 48);
  assert.equal(out, 'Option one is good');
});

test('normalizeImproved is total — junk in, empty out, never a throw', () => {
  for (const junk of [null, undefined, '', '   ', '""', 42, {}]) {
    assert.doesNotThrow(() => normalizeImproved(junk, 20));
  }
});

test('the system prompt states the budget and forbids inventing facts (§8: she owns the facts)', () => {
  const p = buildImproveSystemPrompt(48);
  assert.match(p, /at most 48 characters/);
  assert.match(p, /Invent NOTHING/);
  assert.match(p, /No dates, names, prices/);
});

test('MOCK / NO-KEY path: localPolish tidies, invents nothing, and respects the budget', () => {
  assert.equal(localPolish('  every   child leads  their own day ', 48), 'Every child leads their own day');
  // only the OPENING is cased — casing a mid-sentence word would be inventing a proper noun
  assert.equal(localPolish('open house ,saturday', 48), 'Open house, saturday');
  assert.equal(localPolish('', 48), '');
  const long = localPolish('every child at the white orchid is capable of leading their own day and we follow', 24);
  assert.ok(long.length <= 24);
  // Nothing added: every word of the output appears in the input.
  const src = 'every child at the white orchid is capable of leading their own day and we follow';
  for (const w of long.toLowerCase().split(/\s+/)) assert.ok(src.includes(w.replace(/[.,]/g, '')), `invented word: ${w}`);
});

test('REQUIREMENT 2 — every response shape carries `original` back (visibly revertible)', () => {
  // Three exit shapes exist: ok(), unconfigured(), and the no-key branch.
  assert.match(routeSrc, /function unconfigured\(reason, original\)[\s\S]{0,200}original,/);
  assert.match(routeSrc, /ok\(\{ original, improved/);
  assert.match(routeSrc, /original, improved: null,\n\s*fallback: localPolish/);
  // Every `unconfigured(` call site passes the original through.
  const calls = routeSrc.match(/return unconfigured\([^)]*\)/g) || [];
  assert.ok(calls.length >= 5, `expected several honest exits, saw ${calls.length}`);
  for (const c of calls) assert.ok(/original\s*\)/.test(c), `an exit drops her original: ${c}`);
});

test('GRACEFUL DEGRADATION — no 500s, no throws, honest reasons (operating-manual §4)', () => {
  assert.ok(!/status:\s*500|new Response\([^)]*500/.test(routeSrc), 'the route must never 500');
  assert.match(routeSrc, /configured: false/);
  assert.match(routeSrc, /catch \(err\) \{\s*\n\s*return unconfigured/);
  for (const honest of ['your words are unchanged', 'Your words are unchanged']) {
    assert.ok(routeSrc.includes(honest));
  }
});

test('MONEY LAW — the mock path returns before any network call', () => {
  const mockAt = routeSrc.indexOf("WO_IMPROVE_MOCK === '1'");
  const fetchAt = routeSrc.indexOf('await fetch(');
  assert.ok(mockAt > 0 && fetchAt > mockAt, 'the mock short-circuit must precede the paid call');
  // …and with no key there is likewise no call.
  const keyAt = routeSrc.indexOf('if (!apiKey)');
  assert.ok(keyAt > 0 && fetchAt > keyAt);
});
