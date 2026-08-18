// ── THE USER APP'S BOUNDARY (spec §3, §4) ───────────────────────────────────
// "The user app may only ever consume the template contract. The FIRST control
//  added to the user app outside this contract is the beginning of a rebuild of
//  the thing being escaped."
//
// The discipline is a property of the source, so it is guarded in the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const USER_APP = [
  ...filesUnder(join(root, 'components', 'post')),
  join(root, 'app', 'post', 'page.jsx'),
  join(root, 'app', 'api', 'improve', 'route.js'),
];
// Comments are prose ABOUT the rules; the guards below read the CODE, so the
// leading block comment (which names every banned affordance on purpose) is
// stripped first. Fail-closed either way: stripping only removes /* … */ blocks.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SOURCES = USER_APP.map((p) => [p.replace(root + '/', ''), stripComments(readFileSync(p, 'utf8'))]);

test('§4 BUILD FRESH — the user app imports nothing from Generator.jsx or its hooks', () => {
  for (const [name, src] of SOURCES) {
    assert.ok(!/Generator/.test(src), `${name} references Generator — the user app must not be subtracted from it`);
    assert.ok(!/from ['"]@\/hooks\//.test(src), `${name} imports an admin hook`);
    assert.ok(!/design-patch|design-document|editorial-.*-solver|element-placement-solver|archetype/.test(src), `${name} reaches into the solver/patch stack`);
  }
});

test('§3 NON-GOALS are absent, permanently — no drag, zoom, size control, or free colour', () => {
  const banned = [
    [/onPointerDown|onMouseDown|onDragStart|draggable/, 'drag'],
    [/onWheel|zoom|scale\s*[:=]\s*\d/i, 'zoom/scale'],
    [/type=["']color["']/, 'a free colour picker'],
    [/fontSize.*slider|sizeStep|globalSizeStep|<input[^>]*type=["']range["']/, 'a size control'],
  ];
  for (const [name, src] of SOURCES) {
    for (const [re, what] of banned) {
      assert.ok(!re.test(src), `${name} introduces ${what} — a §3 non-goal, permanently out of scope`);
    }
  }
});

test('the composer consumes ONLY the template contract + render core', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  const imports = [...composer.matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const spec of imports) {
    const allowed = spec === 'react'
      || spec.startsWith('@/lib/templates/')
      || spec.startsWith('@/lib/render-core/');
    assert.ok(allowed, `PostComposer imports '${spec}' — outside the template contract`);
  }
});

test('the four dimensions are all shown together (§5)', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /DIM_ORDER = \['portrait', 'story', 'square', 'landscape'\]/);
  assert.ok(!/banner/.test(composer), 'banner is retired');
});

test('every text field carries a VISIBLE counter and a hard maxLength = charBudget (§7.5)', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /const budget = TEMPLATE\.slots\[slot\]\.charBudget/);
  assert.match(composer, /maxLength=\{budget\}/);
  assert.match(composer, /\{used\}\/\{budget\}/, 'the counter must be visible, not just enforced');
});

test('§7.2 the over-budget state BLOCKS export for the affected dimension', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /overBudgetSlots/, 'the block reads the measured render truth, not a char count');
  assert.match(composer, /function download\(dimId\) \{\s*\n\s*if \(blocked\.perDim\[dimId\]\) return;/);
  assert.match(composer, /downloadAll[\s\S]{0,160}if \(!blocked\.perDim\[dimId\]\)/);
});

test('improve is visibly revertible on the surface (§8.1 requirement 2)', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /What you wrote/, 'her original must be shown alongside');
  assert.match(composer, /Keep my words/, 'a one-tap way back');
  assert.match(composer, /function discardImprove/);
  // Nothing is written into the field until she accepts.
  const accept = composer.slice(composer.indexOf('function acceptImprove'));
  assert.match(accept, /setSlot\(improve\.slot, improve\.improved\)/);
});
