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
import { DIMENSIONS } from '../../lib/templates/template-contract.mjs';

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

// ONE named exception, and it is named rather than loosened (client amendment
// 2026-08-18): the left panel's resize grip. §3 bans dragging things that
// RENDER — a pointer drag that moves the boundary between the two panes changes
// no slot value and touches no canvas. It is stripped by exact handler name, so
// a second pointer handler appearing anywhere still fails this suite closed.
const CHROME_GRIP = /onPointer(Down|Move|Up|Cancel)=\{(startPanelResize|movePanelResize|endPanelResize)\}/g;

test('§3 NON-GOALS are absent, permanently — no drag, zoom, size control, or free colour', () => {
  const banned = [
    [/onPointerDown|onMouseDown|onDragStart|draggable/, 'drag'],
    [/onWheel|zoom|scale\s*[:=]\s*\d/i, 'zoom/scale'],
    [/type=["']color["']/, 'a free colour picker'],
    [/fontSize.*slider|sizeStep|globalSizeStep|<input[^>]*type=["']range["']/, 'a size control'],
  ];
  for (const [name, src] of SOURCES) {
    const scanned = src.replace(CHROME_GRIP, '');
    for (const [re, what] of banned) {
      assert.ok(!re.test(scanned), `${name} introduces ${what} — a §3 non-goal, permanently out of scope`);
    }
  }
});

test('the ONE sanctioned pointer drag moves chrome only — never a preview', () => {
  const composer = stripComments(readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8'));
  // Every pointer handler in the file belongs to the grip.
  const handlers = [...composer.matchAll(/onPointer[A-Za-z]+=\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);
  assert.ok(handlers.length > 0, 'the grip vanished — the panel is no longer resizable');
  for (const h of handlers) {
    assert.match(h, /^(startPanelResize|movePanelResize|endPanelResize)$/, `pointer handler '${h}' is not the panel grip`);
  }
  // …and it only ever writes the panel width.
  const body = composer.slice(composer.indexOf('function movePanelResize'), composer.indexOf('function endPanelResize'));
  assert.match(body, /setPanelWidth\(clampPanel\(/);
  assert.ok(!/setValues|setColourPairId|setLogoPosition|canvasRefs/.test(body), 'the grip reaches design state');
  // The canvases carry no pointer/mouse handlers at all.
  const canvasTag = composer.slice(composer.indexOf('<canvas'), composer.indexOf('</div>', composer.indexOf('<canvas')));
  assert.ok(!/on(Pointer|Mouse|Touch|Drag)/.test(canvasTag), 'a preview canvas grew an input handler');
});

test('the composer consumes ONLY the template contract + render core', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  const imports = [...composer.matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const spec of imports) {
    const allowed = spec === 'react'
      || spec.startsWith('@/lib/templates/')
      || spec.startsWith('@/lib/render-core/')
      // (client amendment 2026-08-18 — the photo slot) The library PICKER is a
      // shared media chooser, not a control: it hands back a row from
      // /api/images and nothing else. Reusing it is what kept "pick a photo"
      // from becoming a second photo surface. It is enumerated here — one named
      // exception — precisely so the allowlist stays the boundary it was.
      || spec === '@/components/LibraryPicker';
    assert.ok(allowed, `PostComposer imports '${spec}' — outside the template contract`);
  }
});

// ── MONEY LAW — staff PICK photos, they do not prompt for them (§3) ─────────
test('the user app cannot spend: no photo generation, no credit-spending route', () => {
  for (const [name, src] of SOURCES) {
    for (const re of [/feed-photo/, /brand-library/, /higgsfield/i, /gpt-image/i, /design-audit/, /\/api\/generate/]) {
      assert.ok(!re.test(src), `${name} reaches a credit-spending or retired route (${re})`);
    }
  }
});

// ── THE RATIFIED COMPOSITION (client ruling 2026-08-18) ─────────────────────
test('two panes: a resizable left panel that scrolls, and a stage that never does', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /\.wo-post-shell\s*\{[^}]*grid-template-columns:\s*var\(--wo-panel-w, 420px\)/, 'the panel width is a live variable, defaulting to ~420px');
  assert.match(composer, /\.wo-post-shell\s*\{[^}]*overflow:\s*hidden/, 'the page itself must not scroll');
  assert.match(composer, /\.wo-panel-scroll\s*\{[^}]*overflow-y:\s*auto/, 'the panel owns its own scroll');
  assert.match(composer, /\.wo-stage\s*\{[^}]*overflow:\s*hidden/, 'the preview stage NEVER scrolls');
  // Every preview is CONTAIN-fitted, so nothing can overflow its cell at any
  // panel width — that is what makes the resize safe rather than clever.
  // Every preview is CONTAIN-fitted at its DECLARED ratio, so nothing can
  // overflow its cell at any panel width — that is what makes the resize safe
  // rather than clever — and the three tall ones land on one exact baseline.
  assert.match(composer, /\.wo-cell-frame canvas\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*100%/);
  assert.match(composer, /aspectRatio: `\$\{dim\.w\} \/ \$\{dim\.h\}`/);
  assert.match(composer, /@media \(max-width: 900px\)/, 'below 900px it stacks (M9)');
});

test('THREE + ONE: the tall family shares a common height baseline, landscape gets its own row', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /const TALL_ROW = \['portrait', 'story', 'square'\]/);
  assert.match(composer, /const WIDE_ROW = \['landscape'\]/);
  // The baseline is a CONSEQUENCE of flex-grow === aspect ratio, so the numbers
  // are checked against the real dimensions rather than trusted as literals.
  const { portrait, story, square } = DIMENSIONS;
  for (const [cls, dim] of [['portrait', portrait], ['story', story], ['square', square]]) {
    const m = new RegExp(`\\.wo-cell-${cls} \\{ flex: ([\\d.]+) 1 0; \\}`).exec(composer);
    assert.ok(m, `.wo-cell-${cls} has no flex row`);
    assert.equal(Number(m[1]), dim.w / dim.h, `${cls}: flex-grow must BE the aspect ratio or the baseline is a guess`);
  }
  assert.match(composer, /\.wo-row-tall \{ flex: 1 1 0; \}/);
  assert.match(composer, /\.wo-row-wide \{ flex: 1 1 0; \}/);
});

test('the panel width is clamped, persisted and keyboard-reachable', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /const PANEL_MIN = 320;/);
  assert.match(composer, /const PANEL_MAX = 560;/);
  assert.match(composer, /const PANEL_DEFAULT = 420;/);
  assert.match(composer, /localStorage\.setItem\(PANEL_KEY/, 'the chosen width must survive a reload');
  assert.match(composer, /aria-label="Resize the panel"/);
  assert.match(composer, /role="separator"/);
  assert.match(composer, /aria-valuenow=\{panelWidth\}/);
  assert.match(composer, /onKeyDown=\{nudgePanel\}/);
  assert.match(composer, /event\.key === 'ArrowLeft'/);
  assert.match(composer, /event\.key === 'ArrowRight'/);
  assert.match(composer, /touch-action: none/, 'a touch drag must not turn into a page scroll');
});

test('per-format download is a hover control that stays visible on touch and when refusing', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /\.wo-cell:hover \.wo-cell-dl/, 'revealed on hover');
  assert.match(composer, /@media \(hover: none\) \{ \.wo-cell-dl \{ opacity: 1/, 'always visible on touch');
  assert.match(composer, /\.wo-cell-dl:disabled \{ opacity: 1/, 'a control that is refusing must stay readable');
  // …and it hangs off a box that lands on exactly the render, not the cell.
  assert.match(composer, /\.wo-shot-anchor \{[^}]*position: absolute;[^}]*inset: 0;[^}]*margin: auto/);
  assert.match(composer, /className="wo-shot-anchor" style=\{\{ aspectRatio/);
});

test('the template selector is a REAL control, not a dead chevron (M4)', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /aria-haspopup="listbox"/);
  assert.match(composer, /aria-expanded=\{templateMenuOpen\}/);
  assert.match(composer, /setTemplateMenuOpen\(\(o\) => !o\)/, 'it opens AND closes');
  assert.match(composer, /TEMPLATES\.map/, 'the menu lists the real registry, not a hardcoded row');
  assert.match(composer, /aria-selected=\{t\.id === TEMPLATE\.id\}/, 'the current template shows as selected');
});

// ── LOGO SWAP (client ruling 2026-08-18) ────────────────────────────────────
test('the mark picker offers the template\'s sanctioned set and defaults to the colour class', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /templateLogoVariants\(TEMPLATE\)/, 'the set comes from the template, not the app');
  assert.match(composer, /useState\(null\)/, 'no explicit pick === the colour-class default');
  assert.match(composer, /resolveLogoAsset\(TEMPLATE, pair\.klass, logoVariantId\)/);
  assert.ok(!/logoAssets\.(light|dark)/.test(composer), 'the composer must not reach past the resolver into the asset map');
});

// ── THE PHOTO + THE BACKDROP CHECK ──────────────────────────────────────────
test('the photo comes from the library or an upload — and export refuses on a bad backdrop', () => {
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  assert.match(composer, /<LibraryPicker onSelect=\{chooseFromLibrary\}/);
  assert.match(composer, /source_type'?, 'uploaded'/, "uploads persist in the 'uploaded' vocabulary");
  assert.match(composer, /crossOrigin = 'anonymous'/, 'the backdrop must be readable back off the canvas');
  // The refusal reads the MEASURED truth and blocks the same way §7.2 does.
  assert.match(composer, /truth\.contrastFailures/);
  assert.match(composer, /hard to read in \{listNames\(blocked\.contrastTextDims\)\}/, 'the message names the dimensions');
  // No negotiation: no auto-fix, no advisor dot, no ledger. Read the CODE —
  // the file's prose names the retired machinery on purpose, to say it is gone.
  const code = stripComments(composer);
  assert.ok(!/applyFix|apply-fix|advisor|ledger|finding/i.test(code), 'the refusal must not grow an advisor');
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

test('the inline <style> block contains no character the server will entity-escape', () => {
  // A quote or an angle bracket inside a <style> element is serialised by the
  // server as an entity and NOT decoded by the HTML parser, so React sees the
  // server text and the client text disagree, logs a hydration error and THROWS
  // THE PAGE AWAY. Both variants cost a real debugging round here; they are
  // cheap to make impossible.
  const composer = readFileSync(join(root, 'components', 'post', 'PostComposer.jsx'), 'utf8');
  const open = composer.indexOf('<style>{`');
  const close = composer.indexOf('`}</style>');
  assert.ok(open > 0 && close > open, 'the inline style block moved');
  const css = composer.slice(open + '<style>{`'.length, close);
  const offenders = css.split('\n').map((l, i) => [i, l]).filter(([, l]) => /['"<>&]/.test(l));
  assert.deepEqual(offenders, [], `escapable characters inside <style>: ${JSON.stringify(offenders)}`);
});
