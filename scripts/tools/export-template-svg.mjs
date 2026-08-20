/* ─────────────────────────────────────────────────────────────────────────
   TEMPLATE → FIGMA SVG SEED  (docs/template-system-spec.md §12, path 1)

   §12 names "generate from Figma" as an acceptable authoring path. This script
   builds the OTHER half of that bridge: it emits an SVG per dimension that the
   designer IMPORTS into Figma, so the Figma file starts as an exact copy of
   what the canvas actually paints instead of a hand-transcription.

   THE ROUND-TRIP TRUTH IS THE `box` RECT inside each `slot/*` group. That rect
   carries the authored x/y/w/h; the designer moves/resizes it, and the re-bake
   reads it back. The text inside the group is a PREVIEW of how real copy fills
   the box — it is not authored data.

   §11 STILL HOLDS: budgets are measured in the canvas render core, never read
   off Figma. Nothing here measures anything. Every line break, type size, line
   height and baseline in the emitted SVG is produced by running the REAL
   render-core primitives (lib/render-core/text.mjs autofit / autofitTrackedCaps)
   inside the existing headless-Chromium harness, with the real brand webfonts.
   Node never re-derives layout — it only serialises what the canvas measured.

   MONEY LAW: zero network (the harness aborts every non-localhost request),
   zero AI calls, zero photo spend.

   Usage: node scripts/tools/export-template-svg.mjs
   ───────────────────────────────────────────────────────────────────────── */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The harness pulls in playwright, so it is imported LAZILY (inside
// measureLayouts) — the serialiser and the parser below stay cheap enough for
// scripts/tests/export-template-svg.test.mjs to import without a browser.
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(REPO_ROOT, 'generated', 'template-one', 'figma');
const TEMPLATE_ID = 'label_headline';

/* The SAME realistic strings the `real-*.png` evidence renders use
   (scripts/tools/verify-template-one.mjs), so what the client sees in Figma is
   the post she already reviewed as a PNG. */
export const PREVIEW_COPY = Object.freeze({
  eyebrow: 'OUR BELIEF',
  heading: 'Every child is capable of leading their own day',
  body: 'Enrolling now for the autumn term',
});

/* The default pair — §6.2 pre-verified, ivory field / burnham ink. */
export const PREVIEW_PAIR_ID = 'ivory';
export const PREVIEW_LOGO_POSITION = 'bottom-right';

/* ── LAYER NAMING ───────────────────────────────────────────────────────────
   Figma's SVG importer names a layer from `data-name` when present and falls
   back to the `id` attribute. `slot/heading` is NOT a legal XML `ID` (an XML
   Name forbids `/`), which is exactly why Figma's own exporter emits the twin
   `id="slot_heading" data-name="slot/heading"` — the same convention every
   vector asset already in public/assets/logos/ uses.

   So we write BOTH, and the sanitised `id` stays human-readable, so the layer
   name is usable whichever attribute Figma reads. The re-bake reader accepts
   either spelling (`slot/heading` or `slot_heading`).                        */
const xmlId = (name) => name.replace(/[^A-Za-z0-9_.-]/g, '_');
export function layerAttrs(name) {
  return `id="${xmlId(name)}" data-name="${esc(name)}"`;
}

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const r2 = (n) => Math.round(n * 100) / 100;

/** Inlines a real brand mark: root viewBox + everything inside <svg>…</svg>. */
function readMark(publicPath) {
  const raw = readFileSync(join(REPO_ROOT, 'public', publicPath), 'utf8');
  const open = /<svg\b[^>]*>/i.exec(raw);
  if (!open) throw new Error(`export-template-svg: no <svg> root in ${publicPath}`);
  const viewBox = /viewBox="([^"]+)"/i.exec(open[0])?.[1];
  if (!viewBox) throw new Error(`export-template-svg: no viewBox in ${publicPath}`);
  let inner = raw.slice(open.index + open[0].length, raw.lastIndexOf('</svg>'));

  // The shipped asset carries a duplicated id ("Layer_1-2") from its own
  // Illustrator export. Left alone that makes OUR document invalid XML, so the
  // ids are namespaced and de-duplicated on the way in. Artwork untouched: only
  // identifiers change, and `url(#…)` references follow the FIRST binding —
  // which is what every renderer already resolved them to.
  const first = new Map();
  let n = 0;
  inner = inner.replace(/id="([^"]+)"/g, (_, id) => {
    const renamed = `mark-${id}${first.has(id) ? `-${++n}` : ''}`;
    if (!first.has(id)) first.set(id, `mark-${id}`);
    return `id="${renamed}"`;
  });
  inner = inner.replace(/url\(#([^)]+)\)/g, (m, id) => (first.has(id) ? `url(#${first.get(id)})` : m));
  return { viewBox, inner };
}

/** Serialises one dimension's measured layout into a Figma-importable SVG. */
export function buildSvg(layout, mark) {
  const { dimensionId, width, height, bg, ink, slots, logoBox, photo } = layout;
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
    + `viewBox="0 0 ${width} ${height}" ${layerAttrs(`template-one/${dimensionId}`)}>`);
  parts.push(
    `  <!-- GENERATED by scripts/tools/export-template-svg.mjs — template ${layout.templateId} v${layout.templateVersion}, `
    + `dimension ${dimensionId} (${width}x${height}). The 'box' rect in each slot/* group is the round-trip truth. -->`);

  // ── background ────────────────────────────────────────────────────────────
  parts.push(`  <g ${layerAttrs('background')}>`);
  parts.push(`    <rect ${layerAttrs('field')} x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>`);
  parts.push('  </g>');

  // ── the photo box (client amendment 2026-08-18) ───────────────────────────
  // The seed carries NO photo: the template's photo slot is optional and the
  // default render is the clean tile, so painting one here would be a picture of
  // a design that does not exist. What IS emitted is the authored box — the same
  // round-trip truth every other slot contributes — plus the declared treatment
  // in a comment, so the designer can move the box in Figma and re-bake it.
  if (photo) {
    parts.push(`  <g ${layerAttrs('slot/photo')}>`);
    parts.push(
      `    <!-- authored box: x=${photo.frac.x} y=${photo.frac.y} w=${photo.frac.w} h=${photo.frac.h} of the frame · `
      + `fit=${photo.fit} · scrim ${photo.scrim ? `${photo.scrim.colour} @ ${photo.scrim.opacity}` : 'none'} · `
      + 'optional: no photo renders the plain colour field -->');
    parts.push(
      `    <rect id="box_photo" data-name="box" x="${r2(photo.box.x)}" y="${r2(photo.box.y)}" `
      + `width="${r2(photo.box.w)}" height="${r2(photo.box.h)}" fill="none" `
      + `stroke="${ink}" stroke-opacity="0.3" stroke-width="2" stroke-dasharray="12 8"/>`);
    parts.push('  </g>');
  }

  // ── one group per present text slot ───────────────────────────────────────
  for (const s of slots) {
    parts.push(`  <g ${layerAttrs(`slot/${s.name}`)}>`);
    parts.push(
      `    <!-- authored box: x=${s.frac.x} y=${s.frac.y} w=${s.frac.w} h=${s.frac.h} of the frame · `
      + `maxLines=${s.maxLines} · floor=${r2(s.floorPx)}px · charBudget=${s.charBudget} -->`);
    // `id` is unique per document (XML ID rules); `data-name` carries the layer
    // name Figma shows. Either spelling reads back as this slot's box.
    parts.push(
      `    <rect id="box_${s.name}" data-name="box" x="${r2(s.box.x)}" y="${r2(s.box.y)}" `
      + `width="${r2(s.box.w)}" height="${r2(s.box.h)}" fill="none" `
      + `stroke="${ink}" stroke-opacity="0.3" stroke-width="2" stroke-dasharray="12 8"/>`);
    const anchor = s.align === 'center' ? 'middle' : s.align === 'right' ? 'end' : 'start';
    const tx = s.align === 'center' ? s.box.x + s.box.w / 2 : s.align === 'right' ? s.box.x + s.box.w : s.box.x;
    const tracking = s.letterSpacing ? ` letter-spacing="${r2(s.letterSpacing)}"` : '';
    s.lines.forEach((line, i) => {
      // Baseline convention is the render core's own (text.mjs paintLines):
      // first baseline one em below the box top, then + lineHeight per line.
      const y = s.box.y + s.size + i * s.lineHeight;
      parts.push(
        `    <text ${layerAttrs(`${s.name}/line-${i + 1}`)} x="${r2(tx)}" y="${r2(y)}" `
        + `font-family="${esc(s.family)}" font-size="${s.size}" font-weight="${s.weight}"${tracking} `
        + `text-anchor="${anchor}" fill="${ink}" xml:space="preserve">${esc(line)}</text>`);
    });
    parts.push('  </g>');
  }

  // ── logo — the REAL brand mark, inlined (law 3: only real assets) ─────────
  if (logoBox) {
    parts.push(`  <g ${layerAttrs('slot/logo')}>`);
    parts.push(`    <!-- ${esc(layout.logoAsset)} at the template's authored widthFrac/pad, position ${logoBox.position} -->`);
    parts.push(
      `    <svg ${layerAttrs('mark')} x="${r2(logoBox.x)}" y="${r2(logoBox.y)}" `
      + `width="${r2(logoBox.w)}" height="${r2(logoBox.h)}" viewBox="${mark.viewBox}" overflow="visible">`);
    parts.push(mark.inner.trim());
    parts.push('    </svg>');
    parts.push('  </g>');
  }

  parts.push('</svg>');
  return parts.join('\n') + '\n';
}

/* ── THE READ-BACK SHAPE ────────────────────────────────────────────────────
   The same parse the re-bake performs on a Figma file: find every `slot/*`
   group, take the `box` rect inside it, ignore the preview text except to count
   lines and read the painted size. Regex, not a DOM — the emitted file is ours
   and its shape is pinned by the test.                                       */
export function parseSvg(svgText) {
  const root = /<svg\b[^>]*\bwidth="(\d+(?:\.\d+)?)"[^>]*\bheight="(\d+(?:\.\d+)?)"[^>]*\bviewBox="([^"]+)"/.exec(svgText);
  if (!root) throw new Error('parseSvg: no root <svg> with width/height/viewBox');
  const out = {
    width: Number(root[1]), height: Number(root[2]), viewBox: root[3],
    background: null, slots: {}, logo: null, photo: null,
  };
  const bgRect = /<g id="background"[^>]*>\s*<rect\b([^>]*)\/>/.exec(svgText);
  if (bgRect) out.background = attrs(bgRect[1]);

  const groupRe = /<g id="(slot_[A-Za-z0-9_]+)" data-name="slot\/([A-Za-z0-9_]+)">([\s\S]*?)\n {2}<\/g>/g;
  let m;
  while ((m = groupRe.exec(svgText))) {
    const name = m[2];
    const body = m[3];
    const rect = /<rect id="box[^"]*" data-name="box"[^>]*?\bx="([-\d.]+)"\s+y="([-\d.]+)"\s+width="([-\d.]+)"\s+height="([-\d.]+)"/.exec(body);
    const lines = [...body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map((t) => ({
      ...attrs(t[1]), text: t[2],
    }));
    const nested = /<svg id="mark"[^>]*?\bx="([-\d.]+)"\s+y="([-\d.]+)"\s+width="([-\d.]+)"\s+height="([-\d.]+)"/.exec(body);
    const entry = {
      idAttr: m[1],
      box: rect ? { x: +rect[1], y: +rect[2], w: +rect[3], h: +rect[4] } : null,
      lines,
      mark: nested ? { x: +nested[1], y: +nested[2], w: +nested[3], h: +nested[4] } : null,
      hasMarkGeometry: /<path\b|<circle\b|<polygon\b/.test(body),
    };
    if (name === 'logo') out.logo = entry;
    else if (name === 'photo') out.photo = entry;
    else out.slots[name] = entry;
  }
  return out;
}

function attrs(s) {
  const o = {};
  for (const a of s.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) o[a[1]] = a[2];
  return o;
}

/**
 * The §11-shaped gates on what was actually written to disk: every `slot/*` box
 * matches the baked template's authored fractions FOR THAT DIMENSION to the
 * pixel; no slot paints more than `maxLines`; no type sits below the floor.
 * @returns {string[]} failures — empty means clean.
 */
export function auditEmitted(svgText, { template, dimensionId, floorPxFor, slotConstraint, DIMENSIONS }) {
  const fails = [];
  const dim = DIMENSIONS[dimensionId];
  const doc = parseSvg(svgText);
  const at = `${template.id}/${dimensionId}`;

  if (doc.width !== dim.w || doc.height !== dim.h) fails.push(`${at}: root svg is ${doc.width}x${doc.height}, dimension is ${dim.w}x${dim.h}`);
  if (doc.viewBox !== `0 0 ${dim.w} ${dim.h}`) fails.push(`${at}: viewBox '${doc.viewBox}' is not '0 0 ${dim.w} ${dim.h}'`);
  if (!doc.background) fails.push(`${at}: no background layer`);
  else if (Number(doc.background.width) !== dim.w || Number(doc.background.height) !== dim.h) {
    fails.push(`${at}: background rect ${doc.background.width}x${doc.background.height} does not fill the frame`);
  }

  for (const name of template.paintOrder) {
    const per = slotConstraint(template, name, dimensionId);
    if (!per) continue;
    const got = doc.slots[name];
    if (!got) { fails.push(`${at}/${name}: no slot/${name} group`); continue; }
    if (!got.box) { fails.push(`${at}/${name}: no 'box' rect — nothing to read back`); continue; }
    const want = { x: per.box.x * dim.w, y: per.box.y * dim.h, w: per.box.w * dim.w, h: per.box.h * dim.h };
    for (const k of ['x', 'y', 'w', 'h']) {
      if (Math.abs(got.box[k] - want[k]) > 0.01) {
        fails.push(`${at}/${name}.box.${k}: emitted ${got.box[k]} but the baked fraction is ${per.box[k]} → ${want[k]}px`);
      }
    }
    if (got.lines.length > per.maxLines) fails.push(`${at}/${name}: ${got.lines.length} preview lines exceeds maxLines ${per.maxLines}`);
    const floor = Math.floor(floorPxFor(name, dim.w, dim.h));
    for (const line of got.lines) {
      if (Number(line['font-size']) < floor) fails.push(`${at}/${name}: font-size ${line['font-size']} is BELOW the floor ${floor}`);
    }
  }

  // The photo box is round-trip truth too, and it must carry NO artwork — the
  // seed shows where a photo would sit, it never ships a stand-in photo (law 3).
  const photoPer = slotConstraint(template, 'photo', dimensionId);
  if (photoPer) {
    if (!doc.photo) fails.push(`${at}: no slot/photo group, but the template declares a photo box`);
    else if (!doc.photo.box) fails.push(`${at}/photo: no 'box' rect — nothing to read back`);
    else {
      const want = { x: photoPer.box.x * dim.w, y: photoPer.box.y * dim.h, w: photoPer.box.w * dim.w, h: photoPer.box.h * dim.h };
      for (const k of ['x', 'y', 'w', 'h']) {
        if (Math.abs(doc.photo.box[k] - want[k]) > 0.01) {
          fails.push(`${at}/photo.box.${k}: emitted ${doc.photo.box[k]} but the baked fraction is ${photoPer.box[k]} → ${want[k]}px`);
        }
      }
      if (doc.photo.hasMarkGeometry || doc.photo.lines.length) fails.push(`${at}/photo: the seed must not carry stand-in artwork`);
    }
  } else if (doc.photo) {
    fails.push(`${at}: emitted a slot/photo group the template does not declare`);
  }

  const logoPer = slotConstraint(template, 'logo', dimensionId);
  if (logoPer) {
    if (!doc.logo) fails.push(`${at}: no slot/logo group`);
    else if (!doc.logo.hasMarkGeometry) fails.push(`${at}: slot/logo carries no real vector geometry (law 3: only real assets)`);
    else if (!doc.logo.mark) fails.push(`${at}: slot/logo has no placed mark`);
  }
  return fails;
}

/**
 * Measures every dimension IN THE RENDER CORE and returns serialisable layouts.
 * Exported so the test can re-measure rather than trust a committed artifact.
 */
export async function measureLayouts() {
  const { openHarness } = await import('./template-harness.mjs');
  const h = await openHarness();
  try {
    const layouts = await h.page.evaluate(async ({ TEMPLATE_ID, COPY, PAIR_ID, LOGO_POSITION }) => {
      const { templateById, DIMENSIONS, slotConstraint, renderTemplate, resolveColourPair,
        autofit, autofitTrackedCaps, floorPxFor, DEFAULT_FONTS } = window.__wo;
      const tpl = templateById(TEMPLATE_ID);
      const pair = resolveColourPair(tpl, PAIR_ID);

      const loadLogo = (src) => new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = src;
      });
      const logoAsset = pair.klass === 'dark' ? tpl.logoAssets.dark : tpl.logoAssets.light;
      const logoImage = await loadLogo('/public' + logoAsset);
      if (!logoImage) throw new Error('logo asset failed to load: ' + logoAsset);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const FONT_ROLE = { title: 'title', subtitle: 'subtitle', body: 'body', quote: 'quote', logo: 'logo' };

      const out = [];
      for (const dimensionId of Object.keys(tpl.dimensions)) {
        const dim = DIMENSIONS[dimensionId];
        canvas.width = dim.w; canvas.height = dim.h;
        // Render for real first: the logo box (and the §7.2 signal) come from
        // renderTemplate itself, not from a re-implementation.
        const truth = renderTemplate(ctx, tpl, dimensionId, {
          ...COPY, colourPairId: PAIR_ID, logoPosition: LOGO_POSITION, logoImage,
        }, {});

        const slots = [];
        for (const name of tpl.paintOrder) {
          const per = slotConstraint(tpl, name, dimensionId);
          if (!per) continue;
          const reg = tpl.registers[name];
          const box = { x: per.box.x * dim.w, y: per.box.y * dim.h, w: per.box.w * dim.w, h: per.box.h * dim.h };
          const floorPx = floorPxFor(name, dim.w, dim.h);
          const family = DEFAULT_FONTS[FONT_ROLE[reg.face] || 'body'] || DEFAULT_FONTS.body;
          const text = String(COPY[name] ?? '');
          // The SAME primitives renderTemplate just used, same arguments.
          const fit = reg.caps
            ? autofitTrackedCaps(ctx, {
              text, font: family, weight: reg.weight, tracking: reg.tracking ?? 0.08,
              box, maxLines: per.maxLines, floorPx, lineRatio: reg.lineRatio,
            })
            : autofit(ctx, {
              text,
              fontFor: (size) => `${reg.italic ? 'italic ' : ''}${reg.weight} ${size}px ${family}`,
              box, maxLines: per.maxLines, floorPx, lineRatio: reg.lineRatio,
            });
          slots.push({
            name, box, frac: per.box, maxLines: per.maxLines, charBudget: per.charBudget,
            floorPx, family, weight: reg.weight, align: reg.align || 'left',
            // Canvas tracked-caps paints with ctx.letterSpacing = (tracking+0.01)*size.
            letterSpacing: reg.caps ? ((reg.tracking ?? 0.08) + 0.01) * fit.size : 0,
            size: fit.size, lineHeight: fit.lineHeight, lines: fit.lines,
            atFloor: fit.atFloor, overBudget: fit.overBudget, wrappedLines: fit.wrappedLines,
          });
        }

        const photoPer = slotConstraint(tpl, 'photo', dimensionId);
        const photo = photoPer ? {
          frac: photoPer.box,
          box: { x: photoPer.box.x * dim.w, y: photoPer.box.y * dim.h, w: photoPer.box.w * dim.w, h: photoPer.box.h * dim.h },
          fit: photoPer.fit,
          scrim: tpl.slots.photo?.scrim?.[pair.klass] || null,
        } : null;

        out.push({
          templateId: tpl.id, templateVersion: tpl.version, dimensionId,
          width: dim.w, height: dim.h, bg: pair.bg, ink: pair.ink, pairId: pair.id,
          logoAsset, logoBox: truth.logoBox, slots, photo,
          canvasPng: canvas.toDataURL('image/png'),
        });
      }
      return out;
    }, { TEMPLATE_ID, COPY: PREVIEW_COPY, PAIR_ID: PREVIEW_PAIR_ID, LOGO_POSITION: PREVIEW_LOGO_POSITION });

    if (h.errors.length) throw new Error(`harness console errors: ${JSON.stringify(h.errors)}`);
    return layouts;
  } finally {
    await h.close();
  }
}

export async function exportTemplateSvgs({ outDir = OUT_DIR, quiet = false } = {}) {
  const layouts = await measureLayouts();
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const layout of layouts) {
    const mark = readMark(layout.logoAsset);
    const svg = buildSvg(layout, mark);
    const file = join(outDir, `${layout.templateId.replace(/_/g, '-')}-${layout.dimensionId}.svg`);
    writeFileSync(file, svg, 'utf8');
    written.push({ file, layout });
    if (!quiet) {
      const cells = layout.slots
        .map((s) => `${s.name}=${s.size}px/${Math.round(s.floorPx)} ${s.lines.length}/${s.maxLines}${s.overBudget ? ' OVER' : ''}`)
        .join('  ');
      console.log(`  ${layout.dimensionId.padEnd(10)} ${String(layout.width).padStart(4)}x${String(layout.height).padEnd(4)}  ${cells}  logo${layout.logoBox ? '✓' : '✗'}`);
    }
  }
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`\nTEMPLATE ONE → FIGMA SVG  (copy: ${JSON.stringify(PREVIEW_COPY)}, pair: ${PREVIEW_PAIR_ID})\n`);
  const run = async () => {
    const written = await exportTemplateSvgs();
    // Re-read what was written and gate it — the artifact, not the intent.
    const [{ templateById }, { slotConstraint, DIMENSIONS }, { floorPxFor }] = await Promise.all([
      import('../../lib/templates/index.mjs'),
      import('../../lib/templates/template-contract.mjs'),
      import('../../lib/render-core/floor.mjs'),
    ]);
    const template = templateById(TEMPLATE_ID);
    const failures = [];
    for (const w of written) {
      failures.push(...auditEmitted(readFileSync(w.file, 'utf8'), {
        template, dimensionId: w.layout.dimensionId, floorPxFor, slotConstraint, DIMENSIONS,
      }));
    }
    console.log(`\nWrote ${written.length} file(s):`);
    for (const w of written) console.log('  · ' + w.file);
    if (failures.length) {
      console.error(`\nFAIL — ${failures.length} gate(s):`);
      for (const f of failures) console.error('  · ' + f);
      process.exit(1);
    }
    console.log('\nPASS — every slot/* box matches the baked fractions to the pixel; no slot exceeds maxLines; no type below the floor.');
    console.log('Round-trip contract: generated/template-one/figma/README.md');
  };
  run().catch((e) => { console.error(e); process.exit(1); });
}
