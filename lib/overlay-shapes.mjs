/* ─────────────────────────────────────────────────────────────────────────
   OVERLAY SHAPES — pure contract helpers for the Shapes tray (client ruling
   2026-08-18):

   1. DISPLAY NAMES — built-in Shape 1/2/3 present as "Petal 1/2/3" and the
      uploaded orchid line drawing ("image 1") presents as "Motif 1". Ids stay
      STABLE (stored designs + the PATCH_OPTIONS.overlayAssetId enum never
      churn) — the rename is presentation-only, resolved at render time from
      the brand-fact maps in lib/brand-defaults.js.

   2. ART CLASS — every shape asset is either a SILHOUETTE (one closed filled
      path; correct line-art renderer = the stroked-silhouette painter,
      internal mode "outline") or LINEWORK (stroke-carrying drawing; correct
      renderer = the native-stroke keying painter, internal mode "lineart").
      The user-facing mode is ONE "Line art" option; the internal mode is
      chosen per asset here. Both internal enum values stay valid so every
      stored design keeps rendering byte-identically (fingerprint law).

   3. UPLOADS — the "+" tile stores a user SVG as a brand asset. The SVG is
      sanitized (scripts / event handlers / external refs stripped) and
      auto-classified (closed filled paths vs stroke-carrying paths) before it
      is stored; the classification rides the brand-asset object name.

   Pure module: no React, no DOM, no network — unit-tested in
   scripts/tests/overlay-shapes.test.mjs and imported by the Generator client,
   app/api/brand-assets/route.js and the tests alike.
   ───────────────────────────────────────────────────────────────────────── */

import {
  OVERLAY_DISPLAY_NAMES,
  UPLOAD_DISPLAY_NAMES,
} from './brand-defaults.js';

// ── Art classes ──────────────────────────────────────────────────────────────
export const OVERLAY_ART_SILHOUETTE = 'silhouette';
export const OVERLAY_ART_LINEWORK = 'linework';
const ART_CLASSES = [OVERLAY_ART_SILHOUETTE, OVERLAY_ART_LINEWORK];

// Resolve an asset's art class. An explicit stored classification wins; the
// built-in petal silhouettes are the known silhouette set; accessories are
// stroke art; uploads without a stored class default to LINEWORK (the client's
// existing motif upload — a line drawing — predates stored classification and
// looks correct only through the native-stroke painter).
export function overlayArtClass(asset = {}) {
  if (ART_CLASSES.includes(asset.art)) return asset.art;
  if (asset.builtin && asset.category === 'overlays') return OVERLAY_ART_SILHOUETTE;
  return OVERLAY_ART_LINEWORK;
}

// The INTERNAL renderer mode behind the single user-facing "Line art" option.
export function lineArtModeFor(asset = {}) {
  return overlayArtClass(asset) === OVERLAY_ART_SILHOUETTE ? 'outline' : 'lineart';
}

export function isLineArtMode(mode) {
  return mode === 'outline' || mode === 'lineart';
}

// Normalize a REQUESTED overlay mode for a NEW placement: either line-art
// spelling (the AI grammar keeps both enum values) lands on the asset's
// correct renderer. Non-line-art modes pass through untouched. NEVER applied
// to already-stored layers — stored designs keep their exact mode (§ render
// fingerprint law).
export function normalizeOverlayModeForAsset(mode, asset = {}) {
  return isLineArtMode(mode) ? lineArtModeFor(asset) : mode;
}

// ── Display names (ids stay stable — presentation only) ─────────────────────
export function displayOverlayName(asset = {}) {
  if (asset.id && OVERLAY_DISPLAY_NAMES[asset.id]) return OVERLAY_DISPLAY_NAMES[asset.id];
  const key = String(asset.name || '').trim().toLowerCase();
  if (key && UPLOAD_DISPLAY_NAMES[key]) return UPLOAD_DISPLAY_NAMES[key];
  return asset.name || 'Shape';
}

// ── Tray partition ───────────────────────────────────────────────────────────
// The SHAPES row = the brand's placeable shape marks: built-in petal
// silhouettes PLUS uploaded/official shape-class assets (kind "center") — the
// motif and any "+"-tile upload join the same row (client ruling 2, 2026-08-18).
// DECORATION = everything else (accessories + non-center uploads).
// `hidden` removes an asset from the tray ONLY — placed instances keep
// rendering because paint-time asset resolution never consults this filter.
export function partitionShapeTray(overlays = [], { retired = [], hidden = [] } = {}) {
  const out = { shapes: [], decorations: [] };
  for (const asset of overlays) {
    if (!asset || !asset.id) continue;
    if (retired.includes(asset.id) || hidden.includes(asset.id)) continue;
    const isShapeRow = (asset.builtin && asset.category === 'overlays')
      || (!asset.builtin && (asset.kind || 'center') === 'center');
    (isShapeRow ? out.shapes : out.decorations).push(asset);
  }
  return out;
}

// ── Deletion semantics (client ruling 1, 2026-08-18) ─────────────────────────
// Uploaded assets are truly removable (their storage object is deleted).
// Built-in brand shapes are HIDDEN from the picker, never destroyed: the asset
// row (and the DEFAULT_OVERLAY_ASSETS fallback) survives so every placed
// instance on existing designs keeps rendering — the simpler of the two
// sanctioned options (vs the orchid-petal retire-and-migrate precedent).
export function shapeDeletePlan(asset = {}) {
  if (asset.builtin) {
    return {
      action: 'hide',
      confirm: 'brand',
      message: `“${displayOverlayName(asset)}” is a brand-wide asset. Removing it takes it out of the shape library for the whole workspace. Designs already using it keep rendering.`,
    };
  }
  return {
    action: 'remove',
    confirm: 'standard',
    message: 'This permanently removes the shape from your brand.',
  };
}

// ── SVG sanitizing (upload path) ─────────────────────────────────────────────
// Strips active/remote content from an untrusted SVG: script + foreignObject
// elements, on* event handlers, javascript: URLs, external href/xlink:href and
// url(...) references (local #fragment refs survive), DOCTYPE/ENTITY blocks
// and CSS @import. Regex-based on purpose — it must run identically in the
// browser, the API route, and node:test.
export function sanitizeSvgText(text) {
  const original = String(text || '');
  let svg = original;
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  svg = svg.replace(/<!ENTITY[\s\S]*?>/gi, '');
  svg = svg.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  svg = svg.replace(/<script[\s\S]*?\/>/gi, '');
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  svg = svg.replace(/<foreignObject[\s\S]*?\/>/gi, '');
  // Event handlers: onload=, onclick=, … (quoted or bare values).
  svg = svg.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // href / xlink:href keeping only local fragment references.
  svg = svg.replace(/\s+(xlink:href|href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, attr, _q, dq, sq) => {
    const value = (dq ?? sq ?? '').trim();
    return value.startsWith('#') ? m : '';
  });
  // javascript: anywhere that survived (defence in depth).
  svg = svg.replace(/javascript:/gi, '');
  // External url(...) references in styles/attributes; local url(#id) survives.
  svg = svg.replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none');
  svg = svg.replace(/@import[^;]*;/gi, '');
  return { svg, changed: svg !== original };
}

// ── SVG classification (upload path) ─────────────────────────────────────────
// silhouette = closed filled paths carry the artwork; linework = the artwork
// lives in stroke-carrying paths. Elements with NEITHER fill nor stroke count
// as filled (the SVG default paint is a black fill) unless an ancestor-style
// root fill="none" is all the file declares — kept simple: explicit counts
// first, default-fill elements as a tiebreaker.
export function classifySvgArt(text) {
  const svg = String(text || '');
  const elements = svg.match(/<(path|rect|circle|ellipse|polygon|polyline|line)\b[^>]*>/gi) || [];
  let filled = 0;
  let stroked = 0;
  let bare = 0;
  for (const el of elements) {
    const fill = /fill\s*[=:]\s*["']?\s*([^"';\s>]+)/i.exec(el);
    const stroke = /stroke\s*[=:]\s*["']?\s*([^"';\s>]+)/i.exec(el);
    const hasFill = !!fill && fill[1].toLowerCase() !== 'none';
    const hasStroke = !!stroke && stroke[1].toLowerCase() !== 'none';
    if (hasFill) filled += 1;
    if (hasStroke) stroked += 1;
    if (!fill && !hasStroke) bare += 1;
  }
  if (stroked > 0 && filled === 0) return OVERLAY_ART_LINEWORK;
  if (filled > 0 && stroked === 0) return OVERLAY_ART_SILHOUETTE;
  if (stroked > 0 && filled > 0) return stroked >= filled ? OVERLAY_ART_LINEWORK : OVERLAY_ART_SILHOUETTE;
  // No explicit paint at all (default black fill) — or nothing recognisable.
  return OVERLAY_ART_SILHOUETTE;
}

// Aspect ratio (width/height) from the SVG's viewBox, falling back to
// width/height attributes, falling back to 1.
export function svgAspectRatio(text) {
  const svg = String(text || '');
  const vb = /viewBox\s*=\s*["']\s*([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)\s*["']/i.exec(svg);
  if (vb) {
    const w = parseFloat(vb[3]);
    const h = parseFloat(vb[4]);
    if (w > 0 && h > 0) return w / h;
  }
  const wAttr = /<svg\b[^>]*\bwidth\s*=\s*["']?([\d.]+)/i.exec(svg);
  const hAttr = /<svg\b[^>]*\bheight\s*=\s*["']?([\d.]+)/i.exec(svg);
  if (wAttr && hAttr) {
    const w = parseFloat(wAttr[1]);
    const h = parseFloat(hAttr[1]);
    if (w > 0 && h > 0) return w / h;
  }
  return 1;
}

// ── Brand-asset object names ─────────────────────────────────────────────────
// Legacy format:  <ts>__<kind>__<ratio*1000>__<name>.<ext>
// Extended:       <ts>__<kind>__<ratio*1000>__<art>__<name>.<ext>
//   where <art> is "sil" | "line". Legacy names (no art segment) parse fine and
//   surface art: null (the resolver above then defaults them to linework).
const ART_SEGMENTS = { sil: OVERLAY_ART_SILHOUETTE, line: OVERLAY_ART_LINEWORK };
const ART_TO_SEGMENT = { [OVERLAY_ART_SILHOUETTE]: 'sil', [OVERLAY_ART_LINEWORK]: 'line' };

export function parseBrandAssetObjectName(name) {
  const m = /^(\d+)__([a-z]+)__(\d+)__(?:(sil|line)__)?(.+)\.(svg|png)$/.exec(String(name || ''));
  if (!m) return null;
  return {
    ts: Number(m[1]),
    kind: m[2],
    ratio: Math.max(0.05, Number(m[3]) / 1000 || 1),
    art: m[4] ? ART_SEGMENTS[m[4]] : null,
    name: m[5].replace(/_/g, ' '),
    ext: m[6],
  };
}

export function buildBrandAssetObjectName({ ts, kind, ratio, art, name, ext }) {
  const artSegment = ART_TO_SEGMENT[art] ? `${ART_TO_SEGMENT[art]}__` : '';
  return `${ts}__${kind}__${Math.round((ratio || 1) * 1000)}__${artSegment}${name}.${ext}`;
}
