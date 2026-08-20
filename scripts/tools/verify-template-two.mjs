/* ─────────────────────────────────────────────────────────────────────────
   §11 VERIFICATION BAR FOR TEMPLATE TWO — "Petal Window"

     · all four declared dimensions render CLEAN with
         (a) photo + EMPTY heading      — the reference itself: petal plus air
         (b) photo + heading at exactly charBudget
         (c) photo + heading at budget WITH TWO HARD LINE BREAKS
     · AUTOFIT FLOOR CHECK: at charBudget the painted px is the declared floor
     · the BACKDROP CHECK passes for the mark and for the heading in its band
     · budgets measured in the canvas render core, never off Figma

   …and the three things that are new in this template, each proven rather than
   asserted:

     · THE PHOTO IS REQUIRED. With no photo the render must paint the honest
       placeholder, report `missingRequired: ['photo']`, and the surface must
       block export. With a photo it must report none.
     · TEXT NEVER SITS OVER THE PHOTO. Not a promise — a measured geometric
       fact: the heading box and the petal box must not intersect in ANY
       dimension, and the mark's placed rect must not either.
     · THE PETAL IS FIXED — WITHIN A STATE. The geometry with ONE character of
       heading and with a full budget must be IDENTICAL; the petal may not move
       or shrink to make room for words. Proved by masking the heading band out
       of both renders and comparing the remaining pixels byte for byte.
       (AMENDED by the client ruling of 2026-08-18 — the photoOnly state. An
       EMPTY heading no longer belongs in that comparison: it is a different
       AUTHORED LAYOUT, deliberately drawn with a bigger petal, not the same
       layout reflowing. The ban on reflow is unchanged and is what this gate
       still measures; it now measures it where reflow could actually happen.)
     · THE TWO AUTHORED STATES. photoOnly (a photo, no words) and withHeading
       both clear the §11 bar in all four dimensions, the switch is binary on
       emptiness in both directions, and NOTHING else moves across it.

   Runs in the same headless-Chromium harness the budget measurement uses, so
   the thing being verified is the thing that paints. Writes PNG evidence to
   generated/template-two/ (gitignored — M10).

   Usage: node scripts/tools/verify-template-two.mjs
   ───────────────────────────────────────────────────────────────────────── */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openHarness, REPO_ROOT } from './template-harness.mjs';
import { templateMaskAsset, templateMaskShapes } from '../../lib/templates/mask-assets.mjs';
import { TEMPLATE_PETAL_WINDOW as T } from '../../lib/templates/index.mjs';
import { DIMENSIONS } from '../../lib/templates/template-contract.mjs';

const OUT_DIR = join(REPO_ROOT, 'generated', 'template-two');
const FILLER = 'every child leads their own day here with us and we make room for what they want to try next in the garden';
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/* ── THE LANDSCAPE photoOnly WINDOW, AND WHY IT IS GATED SHAPE-AGNOSTICALLY ──
   RESOLVED (client ruling 2026-08-18). The first landscape ruling — "make 1.6x
   bigger", centred — put the petal under the mark's corner: measured here over
   11 library photos x 5 sanctioned marks x 2 sanctioned corners, only 2 of 30
   combinations cleared all four dimensions, and sage (the default pair) and
   forest had no clean mark at all. The client took the evidence and ruled
   1.38x. There is no outstanding conflict and nothing in this file is excused.

   ONE THING TO KEEP IN MIND WHEN TOUCHING THAT GEOMETRY: what must clear the
   mark is the WINDOW BOX, not the painted silhouette. A shape is contained in
   the box at its own proportions, so how far it insets depends on WHICH shape
   she picked — a naive 1.38x box let the default petal clear by ~9px while
   shape-2, which is wider than that box and therefore fills it, ran straight
   under the bottom-right mark (8/16 combinations, field under the mark 0.04).
   The gates below are on the box and on every sanctioned shape for exactly
   that reason; a gate on the default shape alone would have shipped it. */

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });

  // LAW 3 — every SELECTABLE window shape must resolve to a real asset.
  const mask = templateMaskAsset(T);
  const shapes = templateMaskShapes(T);
  const failures = [];
  const fail = (m) => failures.push(m);
  if (!mask) failures.push(`the declared default mask id '${T.slots.photo.mask}' does not resolve — law 3`);
  if (shapes.length !== (T.allowedMaskShapes || []).length) failures.push('a declared window shape id did not resolve');

  const h = await openHarness();
  try {
    const result = await h.page.evaluate(async ({ FILLER, maskSrc, shapeList }) => {
      const { templateById, DIMENSIONS, slotConstraint, renderTemplate } = window.__wo;
      const tpl = templateById('petal_window');

      const exactly = (n) => {
        if (n <= 0) return '';
        let s = '';
        while (s.length < n) s += (s ? ' ' : '') + FILLER;
        return s.slice(0, n);
      };
      const withTwoBreaks = (n) => {
        const s = exactly(n);
        const a = Math.max(1, s.lastIndexOf(' ', Math.floor(n / 3)));
        const b = Math.max(a + 1, s.lastIndexOf(' ', Math.floor((2 * n) / 3)));
        return `${s.slice(0, a)}\n${s.slice(a + 1, b)}\n${s.slice(b + 1)}`;
      };
      const loadImage = (src) => new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => res(null);
        i.src = src;
      });

      const maskImage = await loadImage(maskSrc);
      const logoLight = await loadImage('/public' + tpl.logoAssets.light);
      const logoDark = await loadImage('/public' + tpl.logoAssets.dark);

      /* THE PHOTO. A neutral mid-grey studio card, painted here — the real
         library path is proven live in the composer run. It carries a visible
         diagonal so a MASK FAILURE (an unmasked rectangle) is obvious in the
         PNG rather than hiding behind a flat fill. */
      const photo = (() => {
        const c = document.createElement('canvas');
        c.width = 1400; c.height = 1400;
        const cx = c.getContext('2d');
        cx.fillStyle = '#8A8A8A'; cx.fillRect(0, 0, 1400, 1400);
        cx.strokeStyle = '#4A4A4A'; cx.lineWidth = 40;
        for (let i = -1400; i < 2800; i += 220) { cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i + 1400, 1400); cx.stroke(); }
        return c;
      })();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const dimIds = Object.keys(tpl.dimensions);
      const budget = tpl.slots.heading.charBudget;
      const shots = [];
      const cases = [];

      const base = (pairId) => {
        const pair = tpl.colourPairs.find((p) => p.id === pairId);
        return {
          colourPairId: pairId,
          logoPosition: tpl.allowedLogoPositions[0],
          logoImage: pair.klass === 'dark' ? logoDark : logoLight,
          logoInk: pair.klass === 'dark' ? '#F5F6E7' : '#254E48',
          maskImage,
        };
      };

      // ── (a) (b) (c), every dimension, on the client's own sage field ──────
      for (const [kind, text] of [['empty', ''], ['budget', exactly(budget)], ['breaks', withTwoBreaks(budget)]]) {
        for (const dimId of dimIds) {
          const dim = DIMENSIONS[dimId];
          canvas.width = dim.w; canvas.height = dim.h;
          const truth = renderTemplate(ctx, tpl, dimId, { ...base('sage'), heading: text, photoImage: photo }, {});
          cases.push({ kind, dimId, truth });
          shots.push({ name: `${kind}-${dimId}`, data: canvas.toDataURL('image/png') });
        }
      }

      /* ── THE photoOnly STATE, ITS OWN §11 SWEEP (client ruling 2026-08-18) ─
         TEXT OFF is a choice she makes, so it is set here as a value — the core
         inspects no copy. Her words are deliberately still in the values, to
         prove that turning text off HIDES rather than discards them. */
      const photoOnly = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        canvas.width = dim.w; canvas.height = dim.h;
        const truth = renderTemplate(ctx, tpl, dimId, {
          ...base('sage'), showText: false, heading: exactly(budget), photoImage: photo,
        }, {});
        photoOnly.push({ dimId, truth });
        shots.push({ name: `photoonly-${dimId}`, data: canvas.toDataURL('image/png') });
      }

      /* EVERY SANCTIONED SHAPE, BLED (client ruling 2026-08-18). A silhouette
         that read well contained can crop awkwardly once the window bleeds, so
         every one she can pick is rendered in this state too — and its painted
         rect is reported so an awkward crop is a NUMBER, not an impression. */
      const photoOnlyShapes = [];
      for (const sh of shapeList) {
        const img = await loadImage(sh.src);
        const rec = { id: sh.id, loaded: !!img, dims: {} };
        if (img) {
          for (const dimId of dimIds) {
            const dim = DIMENSIONS[dimId];
            canvas.width = dim.w; canvas.height = dim.h;
            const truth = renderTemplate(ctx, tpl, dimId, {
              ...base('sage'), showText: false, photoImage: photo, maskImage: img, maskShapeId: sh.id,
            }, {});
            // WHERE THE SILHOUETTE ACTUALLY LANDS: the core CONTAINS it in the
            // window at the asset's own ratio, so this is the real crop.
            const b = truth.photo ? truth.photo.box : null;
            const ar = img.naturalWidth / img.naturalHeight;
            let paint = null;
            if (b) {
              const s2 = Math.min(b.w / img.naturalWidth, b.h / img.naturalHeight);
              const pw = img.naturalWidth * s2; const ph = img.naturalHeight * s2;
              paint = {
                l: (b.x + (b.w - pw) / 2) / dim.w, r: (b.x + (b.w + pw) / 2) / dim.w,
                t: (b.y + (b.h - ph) / 2) / dim.h, b: (b.y + (b.h + ph) / 2) / dim.h,
              };
            }
            rec.dims[dimId] = {
              reported: truth.photo ? truth.photo.mask : null, ar, paint,
              missingAssets: truth.missingAssets, missingRequired: truth.missingRequired,
              contrastFailures: truth.contrastFailures, mark: truth.backdrop.logo,
            };
            if (dimId === 'portrait') shots.push({ name: `photoonly-shape-${sh.id}-portrait`, data: canvas.toDataURL('image/png') });
          }
        }
        photoOnlyShapes.push(rec);
      }

      /* ── HER CROP INSIDE THE WINDOW (client ruling 2026-08-18) ────────────
         Rendered in the real core, at the extremes of the range, so "the window
         can never show empty field" is a measured fact. The mark sits on flat
         field by geometry, so a photo transform must NOT move its backdrop
         verdict — asserted rather than assumed. */
      const crops = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        for (const [name, tf] of [
          ['default', { x: 0, y: 0, zoom: 1 }],
          ['zoom-2', { x: 0, y: 0, zoom: 2 }],
          ['top-left', { x: -1, y: -1, zoom: 2 }],
          ['bottom-right', { x: 1, y: 1, zoom: 2 }],
          ['zoom-max', { x: 1, y: -1, zoom: 3 }],
          ['out-of-range', { x: 9, y: -9, zoom: 99 }],
        ]) {
          canvas.width = dim.w; canvas.height = dim.h;
          const truth = renderTemplate(ctx, tpl, dimId, {
            ...base('sage'), heading: 'Where the day begins', photoImage: photo, photoTransform: tf,
          }, {});
          /* THE REAL TEST OF "no empty field in the window": sample the painted
             window and count pixels that are the FIELD colour. The studio card
             is mid-grey with dark stripes; the sage field is #C3D2BC. If the
             photo ever failed to cover the mask, field pixels would appear
             INSIDE the silhouette — which is what this counts. */
          let fieldInside = 0; let sampled = 0;
          const b = truth.photo ? truth.photo.box : null;
          if (b) {
            const x0 = Math.max(0, Math.round(b.x)); const y0 = Math.max(0, Math.round(b.y));
            const x1 = Math.min(dim.w, Math.round(b.x + b.w)); const y1 = Math.min(dim.h, Math.round(b.y + b.h));
            // The centre quarter of the visible window is inside every
            // silhouette, so field colour there can only mean a gap.
            const cx = Math.round((x0 + x1) / 2); const cy = Math.round((y0 + y1) / 2);
            const qw = Math.max(4, Math.round((x1 - x0) / 4)); const qh = Math.max(4, Math.round((y1 - y0) / 4));
            const d = ctx.getImageData(cx - qw / 2, cy - qh / 2, qw, qh).data;
            for (let i = 0; i < d.length; i += 4 * 7) {
              sampled += 1;
              if (Math.abs(d[i] - 195) + Math.abs(d[i + 1] - 210) + Math.abs(d[i + 2] - 188) < 18) fieldInside += 1;
            }
          }
          crops.push({
            dimId, name, fieldInside, sampled,
            transform: truth.photo ? truth.photo.transform : null,
            mark: truth.backdrop.logo, contrastFailures: truth.contrastFailures,
            missingRequired: truth.missingRequired,
          });
          if (dimId === 'portrait' && (name === 'zoom-2' || name === 'bottom-right')) {
            shots.push({ name: `crop-${name}-portrait`, data: canvas.toDataURL('image/png') });
          }
        }
      }

      // ── THE EMPTY STATE — no photo at all ────────────────────────────────
      const emptyState = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        canvas.width = dim.w; canvas.height = dim.h;
        const truth = renderTemplate(ctx, tpl, dimId, { ...base('sage'), heading: '' }, {});
        emptyState.push({ dimId, truth });
        shots.push({ name: `nophoto-${dimId}`, data: canvas.toDataURL('image/png') });
      }

      // ── A MASK THAT NEVER ARRIVED must refuse, not paint a rectangle ─────
      const maskless = (() => {
        const dim = DIMENSIONS.portrait;
        canvas.width = dim.w; canvas.height = dim.h;
        const v = { ...base('sage'), heading: 'A quiet afternoon', photoImage: photo };
        delete v.maskImage;
        return renderTemplate(ctx, tpl, 'portrait', v, {});
      })();

      // ── EVERY PAIR, portrait, for visual review + the backdrop numbers ───
      const pairCases = [];
      for (const pair of tpl.colourPairs) {
        const dim = DIMENSIONS.portrait;
        canvas.width = dim.w; canvas.height = dim.h;
        const truth = renderTemplate(ctx, tpl, 'portrait', {
          ...base(pair.id), heading: 'Where the day begins', photoImage: photo,
        }, {});
        pairCases.push({ pairId: pair.id, truth });
        shots.push({ name: `pair-${pair.id}-portrait`, data: canvas.toDataURL('image/png') });
      }

      /* ── THE PETAL IS FIXED (not a solver in data) ────────────────────────
         Render empty-heading and full-heading, blank the heading band out of
         BOTH, and hash what is left. If the petal moved or resized to make room
         for the words, these two hashes differ.

         STILL EXACTLY THIS GATE after the two authored states landed (client
         ruling 2026-08-18), and that is the point: the second layout is chosen
         by HER TOGGLE, never by the copy, so text-on with an empty heading is
         the same drawing as text-on with a full one — geometry is never
         recomputed from content. The toggle is gated separately, below. */
      const fixedGeometry = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        const band = slotConstraint(tpl, 'heading', dimId);
        const shot = (text) => {
          canvas.width = dim.w; canvas.height = dim.h;
          renderTemplate(ctx, tpl, dimId, { ...base('sage'), heading: text, photoImage: photo }, {});
          /* Blank the band, generously and ASYMMETRICALLY. The box height
             convention (maxLines × floorPx × lineRatio) measures BASELINE to
             baseline, so the last line's descenders paint a little BELOW the
             declared box — about 13px on portrait at this floor. That overhang
             is a property of the convention, not of the petal, so it must not
             be allowed to masquerade as moved geometry. 20% of the band height
             below covers it and still leaves clear air before the petal. */
          const padTop = 6;
          const padBottom = Math.ceil(band.box.h * dim.h * 0.20);
          ctx.save();
          ctx.fillStyle = '#FF00FF';
          ctx.fillRect(band.box.x * dim.w - padTop, band.box.y * dim.h - padTop,
            band.box.w * dim.w + 2 * padTop, band.box.h * dim.h + padTop + padBottom);
          ctx.restore();
          return canvas.toDataURL('image/png');
        };
        fixedGeometry.push({ dimId, empty: shot(''), full: shot(exactly(budget)) });
      }

      /* ── THE TEXT TOGGLE (client ruling 2026-08-18) ────────────────────────
         Text OFF renders photoOnly; text ON renders withHeading. Both
         directions, in every dimension, with deliberately NON-DEFAULT choices
         in play (a second silhouette, the forest pair, the other mark corner)
         and REAL WORDS IN THE HEADING throughout — so the gate proves both that
         nothing she chose is disturbed by the switch and that turning text off
         HIDES her words rather than discarding them (§6.3 rule 1). */
      const altMask = shapeList.length > 1 ? await loadImage(shapeList[1].src) : maskImage;
      const transition = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        const held = {
          ...base('forest'),
          logoPosition: tpl.allowedLogoPositions[1] || tpl.allowedLogoPositions[0],
          maskImage: altMask, maskShapeId: shapeList[1] ? shapeList[1].id : null,
          photoImage: photo,
        };
        const shot = (show) => {
          canvas.width = dim.w; canvas.height = dim.h;
          const tr = renderTemplate(ctx, tpl, dimId, { ...held, heading: 'Where the day begins', showText: show }, {});
          return {
            state: tr.state,
            png: canvas.toDataURL('image/png'),
            mask: tr.photo ? tr.photo.mask : null,
            pair: tr.colourPair ? tr.colourPair.id : null,
            scrim: tr.photo ? tr.photo.scrim : null,
            logoBox: tr.logoBox,
            photoBox: tr.photo ? tr.photo.box : null,
            markBackdrop: tr.backdrop.logo,
            contrastFailures: tr.contrastFailures,
            heading: tr.slots.heading ? tr.slots.heading.lines : null,
            words: 'Where the day begins',
          };
        };
        transition.push({ dimId, before: shot(false), typed: shot(true), after: shot(false) });
      }

      /* ── TEXT NEVER SITS OVER THE PHOTO — measured, not promised ─────────── */
      const overlaps = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        const p = slotConstraint(tpl, 'photo', dimId).box;
        const t = slotConstraint(tpl, 'heading', dimId).box;
        const l = slotConstraint(tpl, 'logo', dimId);
        const rect = (b) => ({ x: b.x, y: b.y, r: b.x + b.w, b: b.y + b.h });
        const hit = (a, c) => !(a.r <= c.x || c.r <= a.x || a.b <= c.y || c.b <= a.y);
        // The mark's real placed rect, for BOTH allowed corners.
        const markRects = tpl.allowedLogoPositions.map((position) => {
          const pad = (l.pad ?? 0.05) * dim.w;
          const lw = (l.widthFrac ?? 0.12) * dim.w;
          const lh = lw * 0.8333; // the secondary lockup's shipped ratio
          const x = position.endsWith('left') ? pad : position.endsWith('center') ? (dim.w - lw) / 2 : dim.w - pad - lw;
          const y = position.startsWith('top') ? pad : dim.h - pad - lh;
          return { position, x: x / dim.w, y: y / dim.h, r: (x + lw) / dim.w, b: (y + lh) / dim.h };
        });
        overlaps.push({
          dimId,
          headingOverPhoto: hit(rect(t), rect(p)),
          markOverPhoto: markRects.map((m) => [m.position, hit(m, rect(p))]),
          markOverHeading: markRects.map((m) => [m.position, hit(m, rect(t))]),
          petalRatio: (p.w * dim.w) / (p.h * dim.h),
        });
      }

      /* ── EVERY SELECTABLE WINDOW SHAPE, IN EVERY DIMENSION ────────────────
         (client ruling 2026-08-18) The shape is hers to pick, so every shape
         she can pick has to be verified — not just the default. A shape whose
         proportions break a dimension is a FINDING, and this is what finds it.
         `coverage` is how much of the window box the silhouette actually
         occupies at its true proportions: the core CONTAINS it rather than
         stretching it, so a shape far from the box's ratio reads smaller. */
      const shapeSweep = [];
      for (const sh of shapeList) {
        const img = await loadImage(sh.src);
        const rec = { id: sh.id, label: sh.label, loaded: !!img, assetRatio: img ? img.naturalWidth / img.naturalHeight : null, dims: {} };
        if (img) {
          for (const dimId of dimIds) {
            const dim = DIMENSIONS[dimId];
            canvas.width = dim.w; canvas.height = dim.h;
            const truth = renderTemplate(ctx, tpl, dimId, {
              ...base('sage'), heading: 'Where the day begins',
              photoImage: photo, maskImage: img, maskShapeId: sh.id,
            }, {});
            // How much of the window box is photograph rather than flat field.
            let coverage = null;
            if (truth.photo) {
              const b = truth.photo.box;
              const d = ctx.getImageData(Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)).data;
              let on = 0; let total = 0;
              for (let i = 0; i < d.length; i += 4 * 11) {
                total += 1;
                if (Math.abs(d[i] - 195) + Math.abs(d[i + 1] - 210) + Math.abs(d[i + 2] - 188) > 24) on += 1;
              }
              coverage = Math.round((on / total) * 1000) / 1000;
            }
            rec.dims[dimId] = {
              reported: truth.photo ? truth.photo.mask : null,
              coverage,
              missingAssets: truth.missingAssets,
              missingRequired: truth.missingRequired,
              contrastFailures: truth.contrastFailures,
              band: truth.backdrop.slots.heading || null,
              mark: truth.backdrop.logo || null,
              overBudget: truth.overBudgetSlots,
            };
            if (dimId === 'portrait') shots.push({ name: `shape-${sh.id}-portrait`, data: canvas.toDataURL('image/png') });
          }
        }
        shapeSweep.push(rec);
      }

      return {
        cases, shots, emptyState, maskless, pairCases, fixedGeometry, overlaps, shapeSweep, transition, photoOnly, photoOnlyShapes, crops,
        budget, dimIds,
        assetsLoaded: { mask: !!maskImage, logoLight: !!logoLight, logoDark: !!logoDark },
      };
    }, {
      FILLER,
      maskSrc: mask ? `/public${mask.src}` : '/public/assets/shapes/__missing__.svg',
      shapeList: shapes.map((sh) => ({ id: sh.id, label: sh.label, src: `/public${sh.src}` })),
    });

    for (const s of result.shots) {
      writeFileSync(join(OUT_DIR, `${s.name}.png`), Buffer.from(s.data.split(',')[1], 'base64'));
    }

    // ── §11 (a)(b)(c) ──────────────────────────────────────────────────────
    for (const c of result.cases) {
      const at = `${c.kind}/${c.dimId}`;
      if (!c.truth.photo) failures.push(`${at}: the photo did not paint`);
      else if (c.truth.photo.mask !== T.slots.photo.mask) failures.push(`${at}: the photo painted WITHOUT the declared mask`);
      if (c.truth.missingRequired.length) failures.push(`${at}: a satisfied required slot was reported missing (${c.truth.missingRequired.join(', ')})`);
      if (c.truth.missingAssets.length) failures.push(`${at}: missing assets ${c.truth.missingAssets.join(', ')}`);
      if (!c.truth.logoBox) failures.push(`${at}: the mark did not paint`);

      /* THE STATE. These three cases all have TEXT ON, so all three are the
         withHeading layout — an empty heading paints an empty band, honestly
         and stably, and does NOT flip the composition (client ruling
         2026-08-18: the state is her toggle, never inferred from the copy). */
      if (c.truth.state !== 'withHeading') failures.push(`${at}: rendered state '${c.truth.state}', expected 'withHeading' — text is ON`);
      const t = c.truth.slots.heading;
      if (!t) { failures.push(`${at}: the heading slot was not rendered`); continue; }
      if (c.kind === 'empty') {
        if (!t.empty || t.lines !== 0) failures.push(`${at}: an empty heading painted ${t.lines} line(s)`);
        if (t.overBudget) failures.push(`${at}: an empty heading reported over-budget`);
      } else {
        if (c.kind === 'budget' && t.overBudget) failures.push(`${at}: OVER BUDGET at exactly charBudget — the measurement is wrong`);
        if (t.lines > t.maxLines) failures.push(`${at}: painted ${t.lines} lines past maxLines ${t.maxLines} — unclipped spill`);
        if (t.overBudget && t.wrappedLines <= t.maxLines) failures.push(`${at}: flagged over-budget but fits — false alarm`);
        if (!t.overBudget && t.wrappedLines > t.maxLines) failures.push(`${at}: overflows to ${t.wrappedLines} lines but was NOT flagged — §7.2 second check failed`);
        if (t.paintedPx < Math.floor(t.floorPx)) failures.push(`${at}: painted ${t.paintedPx}px BELOW the floor ${t.floorPx}px`);
      }
      /* §11 "at charBudget the painted px must equal the declared floor, not
         below it". EXACT equality is arithmetically impossible while §7.4's
         conservative safety margin exists: the budget is 90% of the measured
         capacity, so copy at budget is by construction slightly short of the
         box and autofit lands ONE step above the floor. The honest form of the
         gate is therefore: never below the floor, and never more than a step or
         two above it — which is what proves the budget really is the FLOOR's
         budget and not a much smaller box's. (Template one behaves identically;
         reported rather than silently reinterpreted.) */
      if (c.kind === 'budget') {
        const floor = Math.floor(t.floorPx);
        if (t.paintedPx < floor) failures.push(`${at}: painted ${t.paintedPx}px BELOW the declared floor ${floor}px`);
        if (t.paintedPx > floor + 2) failures.push(`${at}: at charBudget the heading painted ${t.paintedPx}px against a ${floor}px floor — more than the safety margin explains, so the budget is not the floor's budget`);
      }
      // THE BACKDROP CHECK must have run (a photo is painted) and must PASS —
      // the band and the corner are flat pre-verified field, by construction.
      if (!c.truth.backdrop.checked) failures.push(`${at}: a photo was painted but nothing was measured`);
      if (c.kind !== 'empty') {
        const r = c.truth.backdrop.slots.heading;
        if (!r) failures.push(`${at}: the filled heading was not measured against its band`);
        else if (!r.ok) failures.push(`${at}: the heading measures ${r.ratio}:1 in its own band — below ${r.minimum}`);
      }
      const lg = c.truth.backdrop.logo;
      if (!lg) failures.push(`${at}: the mark was not measured`);
      else if (!lg.ok) failures.push(`${at}: the mark measures ${lg.ratio}:1 — below ${lg.minimum}`);
      if (c.truth.contrastFailures.length) failures.push(`${at}: contrast failures ${c.truth.contrastFailures.join(', ')}`);
    }
    const breaksFlagged = result.cases.filter((c) => c.kind === 'breaks' && c.truth.overBudgetSlots.length).length;
    if (!breaksFlagged) failures.push('the breaks sweep flagged nothing — the §7.2 hard-break check is inert on this template');

    // ── THE REQUIRED PHOTO ─────────────────────────────────────────────────
    for (const c of result.emptyState) {
      const at = `nophoto/${c.dimId}`;
      if (c.truth.photo) failures.push(`${at}: a photo was reported where none was given`);
      if (!c.truth.missingRequired.includes('photo')) failures.push(`${at}: a REQUIRED photo is missing and the render did not say so — export could not be blocked`);
      if (!c.truth.photoPlaceholder) failures.push(`${at}: no placeholder was painted — the empty state is a blank, not an invitation`);
      else if (c.truth.photoPlaceholder.mask !== T.slots.photo.mask) failures.push(`${at}: the placeholder is not in the shape of the window`);
    }
    if (!result.maskless.missingAssets.includes('mask')) {
      failures.push('a render with no mask image did not report the missing asset');
    }
    if (result.maskless.photo) {
      failures.push('a render with no mask image painted the photo ANYWAY — an unmasked rectangle under this template\'s name (M3)');
    }

    // ── THE PETAL IS FIXED ─────────────────────────────────────────────────
    for (const g of result.fixedGeometry) {
      const a = sha(Buffer.from(g.empty.split(',')[1], 'base64'));
      const b = sha(Buffer.from(g.full.split(',')[1], 'base64'));
      if (a !== b) failures.push(`${g.dimId}: the layout OUTSIDE the heading band changed when a heading was typed — the petal is reflowing, which is the solver back as data (§6.2)`);
    }

    // ── THE photoOnly STATE, §11 IN ALL FOUR DIMENSIONS ────────────────────
    for (const c of result.photoOnly) {
      const at = `photoOnly/${c.dimId}`;
      if (c.truth.state !== 'photoOnly') failures.push(`${at}: rendered '${c.truth.state}'`);
      if (!c.truth.photo) failures.push(`${at}: the photo did not paint`);
      else if (c.truth.photo.mask !== T.slots.photo.mask) failures.push(`${at}: the photo painted WITHOUT the declared mask`);
      if (c.truth.slots.heading) failures.push(`${at}: the band must be ABSENT in this layout, not empty`);
      if (c.truth.missingRequired.length) failures.push(`${at}: a satisfied required slot was reported missing (${c.truth.missingRequired.join(', ')})`);
      if (c.truth.missingAssets.length) failures.push(`${at}: missing assets ${c.truth.missingAssets.join(', ')}`);
      if (!c.truth.logoBox) failures.push(`${at}: the mark did not paint`);
      if (c.truth.overBudgetSlots.length) failures.push(`${at}: over budget ${c.truth.overBudgetSlots.join(', ')} — with no text painted, nothing can be`);
      // THE AUTHORED WINDOW, not the base one.
      const want = T.states.photoOnly.photo[c.dimId].box;
      const got = c.truth.photo && c.truth.photo.box;
      if (!got || Math.abs(got.w - want.w * c.truth.width) > 1 || Math.abs(got.h - want.h * c.truth.height) > 1) {
        failures.push(`${at}: this state did not paint its OWN window (${JSON.stringify(got)})`);
      }
      // THE BACKDROP CHECK RUNS HERE TOO — the mark's field is not the same
      // once the petal grows, so it is measured again rather than assumed.
      if (!c.truth.backdrop.checked) failures.push(`${at}: a photo was painted but nothing was measured`);
      const lg = c.truth.backdrop.logo;
      if (!lg) failures.push(`${at}: the mark was not measured in this state`);
      else if (!lg.ok) failures.push(`${at}: the mark measures ${lg.ratio}:1 — below ${lg.minimum}`);
      if (c.truth.contrastFailures.length) failures.push(`${at}: contrast failures ${c.truth.contrastFailures.join(', ')}`);
    }

    /* ── EVERY SHAPE, BLED, IN EVERY DIMENSION ──────────────────────────── */
    for (const sh of result.photoOnlyShapes) {
      if (!sh.loaded) { fail(`photoOnly shape '${sh.id}': the asset did not load — law 3`); continue; }
      for (const [dimId, r] of Object.entries(sh.dims)) {
        const at = `photoOnly-${sh.id}/${dimId}`;
        if (r.reported !== sh.id) fail(`${at}: the render reported '${r.reported}' — her pick was not honoured`);
        if (r.missingAssets.length) fail(`${at}: missing assets ${r.missingAssets.join(', ')}`);
        if (r.missingRequired.length) fail(`${at}: a photo WAS given but ${r.missingRequired.join(', ')} was reported missing`);
        if (r.contrastFailures.length) fail(`${at}: contrast failures ${r.contrastFailures.join(', ')}`);
        if (!r.mark || !r.mark.ok) fail(`${at}: the mark was not measured, or failed (${JSON.stringify(r.mark)})`);
        if (!r.paint) { fail(`${at}: nothing painted`); continue; }
        /* IT MUST BLEED, AND IT MUST BE CENTRED (client rulings 2026-08-18:
           "overflowing the frame like referenced" … "no i need the petals to be
            centralized"). WHICH edge it overflows is a property of the frame
           and of the silhouette's own proportions — story bleeds sideways, at
           9:16 a petal that also cleared the top would have to be half again as
           wide; landscape bleeds top and bottom. Requiring a particular edge
           would be gating an accident rather than the ruling. */
        if (!(r.paint.t < 0 || r.paint.l < 0 || r.paint.r > 1 || r.paint.b > 1)) {
          fail(`${at}: the silhouette is fully inside the frame (l=${r.paint.l.toFixed(3)} t=${r.paint.t.toFixed(3)} r=${r.paint.r.toFixed(3)}) — it is not bleeding at all`);
        }
        const offCentre = Math.abs((r.paint.l + r.paint.r) / 2 - 0.5);
        if (offCentre > 0.002) fail(`${at}: the silhouette is off-centre horizontally by ${offCentre.toFixed(3)}`);
        /* …AND IT MUST NEVER REACH EITHER MARK CORNER. A RECT test, not a
           "stays above the mark's top line" one: how a dimension clears the
           mark is its own business. The three tall frames clear it VERTICALLY
           (the petal's bottom edge sits above the mark); landscape clears it
           HORIZONTALLY (the petal passes between the two mark columns while
           bleeding off the top and bottom). A vertical-only proxy would have
           refused a composition that is measurably clean — the mark measures
           the pair's own flat-field ratio there — so the gate tests what the
           constraint actually is, in both axes, for BOTH sanctioned corners. */
        const dim = DIMENSIONS[dimId];
        const lg = T.slots.logo.dimensions[dimId];
        const pad = (lg.pad ?? 0.05) * dim.w;
        const lw = (lg.widthFrac ?? 0.12) * dim.w;
        const lh = lw * 0.8333;
        for (const position of T.allowedLogoPositions) {
          const mx = position.endsWith('left') ? pad : dim.w - pad - lw;
          const my = dim.h - pad - lh;
          const m = { x: mx / dim.w, y: my / dim.h, r: (mx + lw) / dim.w, b: (my + lh) / dim.h };
          const hit = !(m.r <= r.paint.l || r.paint.r <= m.x || m.b <= r.paint.t || r.paint.b <= m.y);
          if (hit) fail(`${at}/${position}: the silhouette runs under the mark (petal ${r.paint.l.toFixed(3)}-${r.paint.r.toFixed(3)} x ${r.paint.t.toFixed(3)}-${r.paint.b.toFixed(3)}, mark ${m.x.toFixed(3)}-${m.r.toFixed(3)} x ${m.y.toFixed(3)}-${m.b.toFixed(3)})`);
        }
      }
    }

    /* ── HER CROP: NEVER A GAP, NEVER A DIFFERENT MARK VERDICT ───────────── */
    const cropDefaults = Object.fromEntries(result.crops.filter((c) => c.name === 'default').map((c) => [c.dimId, c]));
    for (const c of result.crops) {
      const at = `crop-${c.name}/${c.dimId}`;
      if (c.missingRequired.length) failures.push(`${at}: ${c.missingRequired.join(', ')} reported missing`);
      if (!c.transform) { failures.push(`${at}: the render reported no transform on an adjustable template`); continue; }
      // THE CLAMP IS REPORTED, not silently applied out of range.
      if (Math.abs(c.transform.x) > 1 || Math.abs(c.transform.y) > 1) failures.push(`${at}: pan escaped the range (${JSON.stringify(c.transform)})`);
      if (c.transform.zoom < 1 || c.transform.zoom > 3) failures.push(`${at}: zoom escaped the range (${c.transform.zoom})`);
      // NO EMPTY FIELD INSIDE THE WINDOW, at any extreme.
      if (c.sampled && c.fieldInside / c.sampled > 0.02) {
        failures.push(`${at}: ${Math.round((c.fieldInside / c.sampled) * 100)}% of the window centre is FIELD colour — the photo stopped covering the mask`);
      }
      // The mark sits on flat field by geometry, so a crop cannot move it.
      const d = cropDefaults[c.dimId];
      if (!c.mark || !c.mark.ok) failures.push(`${at}: the mark was not measured, or failed (${JSON.stringify(c.mark)})`);
      else if (d && d.mark && c.mark.ratio !== d.mark.ratio) {
        failures.push(`${at}: the mark's backdrop moved with the photo crop (${d.mark.ratio} -> ${c.mark.ratio}) — the crop is reaching outside the window`);
      }
      if (c.contrastFailures.length) failures.push(`${at}: contrast failures ${c.contrastFailures.join(', ')}`);
    }

    // ── THE TEXT TOGGLE, BOTH DIRECTIONS ───────────────────────────────────
    for (const tr of result.transition) {
      const at = `transition/${tr.dimId}`;
      if (tr.before.state !== 'photoOnly') failures.push(`${at}: text OFF did not render photoOnly (got '${tr.before.state}')`);
      if (tr.typed.state !== 'withHeading') failures.push(`${at}: text ON did not render withHeading (got '${tr.typed.state}')`);
      if (tr.after.state !== 'photoOnly') failures.push(`${at}: turning text off again did not switch back`);
      // REVERSIBLE, byte for byte. A switch that does not come back exactly is
      // a surprise, which is the whole failure class this app exists to avoid.
      if (sha(Buffer.from(tr.before.png.split(',')[1], 'base64')) !== sha(Buffer.from(tr.after.png.split(',')[1], 'base64'))) {
        failures.push(`${at}: turning text off again did NOT restore the photoOnly render byte for byte`);
      }
      if (sha(Buffer.from(tr.before.png.split(',')[1], 'base64')) === sha(Buffer.from(tr.typed.png.split(',')[1], 'base64'))) {
        failures.push(`${at}: the two states render IDENTICAL pixels — the second layout is decorative`);
      }
      // The petal really is bigger with no words.
      if (!tr.before.photoBox || !tr.typed.photoBox || tr.before.photoBox.w <= tr.typed.photoBox.w) {
        failures.push(`${at}: photoOnly's window is not larger (${JSON.stringify([tr.before.photoBox, tr.typed.photoBox])})`);
      }
      // The words are still THERE, unspent, while text is off — the toggle
      // hides a layout, it does not eat her copy (§6.3 rule 1).
      if (tr.before.words !== tr.typed.words) failures.push(`${at}: the heading VALUE changed across the toggle — text off ate her words`);
      if (!tr.typed.heading) failures.push(`${at}: text ON painted no heading (${tr.typed.heading})`);
      if (tr.before.heading !== null) failures.push(`${at}: text OFF still painted a heading band`);
      // NOTHING SHE CHOSE MOVES ACROSS THE SWITCH.
      for (const key of ['mask', 'pair', 'logoBox']) {
        if (JSON.stringify(tr.before[key]) !== JSON.stringify(tr.typed[key])) {
          failures.push(`${at}: her ${key} changed across the state switch (${JSON.stringify(tr.before[key])} -> ${JSON.stringify(tr.typed[key])})`);
        }
      }
      if (JSON.stringify(tr.before.scrim) !== JSON.stringify(tr.typed.scrim)) failures.push(`${at}: the scrim changed across the state switch`);
      // THE BACKDROP CHECK RUNS IN BOTH STATES — the mark's backdrop is not the
      // same field once the petal grows, so it must be measured again, not
      // assumed from the other state.
      for (const k of ['before', 'typed', 'after']) {
        if (!tr[k].markBackdrop) failures.push(`${at}/${k}: the mark was not measured in this state`);
        else if (!tr[k].markBackdrop.ok) failures.push(`${at}/${k}: the mark measures ${tr[k].markBackdrop.ratio}:1 — below ${tr[k].markBackdrop.minimum}`);
        if (tr[k].contrastFailures.length) failures.push(`${at}/${k}: contrast failures ${tr[k].contrastFailures.join(', ')}`);
      }
    }

    // ── TEXT NEVER OVER THE PHOTO ──────────────────────────────────────────
    for (const o of result.overlaps) {
      if (o.headingOverPhoto) failures.push(`${o.dimId}: the heading box INTERSECTS the petal box — text would sit over the photograph`);
      for (const [position, hitP] of o.markOverPhoto) if (hitP) failures.push(`${o.dimId}: the mark at ${position} intersects the petal`);
      for (const [position, hitH] of o.markOverHeading) if (hitH) failures.push(`${o.dimId}: the mark at ${position} intersects the heading band`);
      // The window box is SHAPE-AGNOSTIC now (the shape is hers to pick), so what
      // it must be is close to square — near enough to every sanctioned
      // silhouette's ratio that none is badly letterboxed inside it.
      if (o.petalRatio < 0.9 || o.petalRatio > 1.15) {
        failures.push(`${o.dimId}: the window box is ${o.petalRatio.toFixed(4)}:1 — too far from square for a set of near-square silhouettes`);
      }
    }

    /* ── EVERY SELECTABLE SHAPE MUST RENDER CLEAN, IN EVERY DIMENSION ────── */
    for (const sh of result.shapeSweep) {
      if (!sh.loaded) { failures.push(`shape '${sh.id}': the asset did not load — law 3, it must be a real file`); continue; }
      for (const [dimId, r] of Object.entries(sh.dims)) {
        const at = `shape-${sh.id}/${dimId}`;
        if (r.reported !== sh.id) failures.push(`${at}: the render reported '${r.reported}' — her pick was not honoured`);
        if (r.missingAssets.length) failures.push(`${at}: missing assets ${r.missingAssets.join(', ')}`);
        if (r.missingRequired.length) failures.push(`${at}: a photo WAS given but ${r.missingRequired.join(', ')} was reported missing`);
        if (r.contrastFailures.length) failures.push(`${at}: contrast failures ${r.contrastFailures.join(', ')}`);
        if (r.overBudget.length) failures.push(`${at}: over budget ${r.overBudget.join(', ')}`);
        // The backdrop check must STILL run against the new silhouette.
        if (!r.band || !r.band.ok) failures.push(`${at}: the heading was not measured, or failed, against this silhouette (${JSON.stringify(r.band)})`);
        if (!r.mark || !r.mark.ok) failures.push(`${at}: the mark was not measured, or failed (${JSON.stringify(r.mark)})`);
        // A shape that all but disappears in a dimension is a finding.
        if (r.coverage == null || r.coverage < 0.45) {
          failures.push(`${at}: the window fills only ${r.coverage} of its box — this shape's proportions break this dimension`);
        }
      }
      // …and it must behave the SAME in all four, or a dimension is broken for
      // this shape specifically.
      const covs = Object.values(sh.dims).map((r) => r.coverage).filter((n) => n != null);
      if (covs.length && Math.max(...covs) - Math.min(...covs) > 0.05) {
        failures.push(`shape '${sh.id}': coverage varies ${JSON.stringify(covs)} across dimensions — the window is not the same window everywhere`);
      }
    }

    if (!result.assetsLoaded.mask) failures.push('the mask asset failed to load');
    if (!result.assetsLoaded.logoLight || !result.assetsLoaded.logoDark) failures.push(`logo assets failed to load: ${JSON.stringify(result.assetsLoaded)}`);
    if (h.errors.length) failures.push(`console/page errors: ${JSON.stringify(h.errors)}`);

    // ── The report ─────────────────────────────────────────────────────────
    console.log(`\nDEFAULT WINDOW: ${mask ? `${mask.id} → ${mask.src}` : 'UNRESOLVED'}`);
    console.log('SELECTABLE WINDOW SHAPES  (asset ratio · coverage of the box, per dimension · band/mark ratio)');
    for (const sh of result.shapeSweep) {
      if (!sh.loaded) { console.log(`  ${sh.id.padEnd(12)} DID NOT LOAD`); continue; }
      const covs = result.dimIds.map((d) => sh.dims[d]?.coverage).join('/');
      const one = sh.dims[result.dimIds[0]];
      console.log(`  ${sh.id.padEnd(12)} ${sh.assetRatio.toFixed(4)}:1  ${covs}  band ${one.band?.ratio}/${one.band?.minimum}  mark ${one.mark?.ratio}/${one.mark?.minimum}${sh.id === T.slots.photo.mask ? '   ← DEFAULT' : ''}`);
    }
    console.log(`DECLARED heading budget (cross-dimension minimum): ${result.budget}`);
    console.log('\n§11 CASE TABLE  (paintedPx / floorPx · lines/maxLines · heading band ratio · mark ratio)');
    for (const c of result.cases) {
      const t = c.truth.slots.heading;
      const hb = c.truth.backdrop.slots.heading;
      const lg = c.truth.backdrop.logo;
      // photoOnly has no heading at all, and the table says so rather than
      // printing a size for type nobody can see.
      const type = t ? `${String(t.paintedPx).padStart(3)}/${Math.round(t.floorPx)}  ${t.lines}/${t.maxLines}${t.overBudget ? ' OVER' : '     '}` : '  no heading (photoOnly)';
      console.log(`  ${c.kind.padEnd(7)} ${c.dimId.padEnd(10)} ${type}  band=${hb ? `${hb.ratio}/${hb.minimum}` : '—'.padEnd(8)}  mark=${lg ? `${lg.ratio}/${lg.minimum}` : '—'}  ${c.truth.logoBox ? 'logo✓' : 'logo✗'}  state=${c.truth.state}`);
    }
    console.log('\nGEOMETRY  (petal ratio · heading over photo · mark over photo/band)');
    for (const o of result.overlaps) {
      console.log(`  ${o.dimId.padEnd(10)} petal ${o.petalRatio.toFixed(4)}:1  headingOverPhoto=${o.headingOverPhoto}  markOverPhoto=${JSON.stringify(o.markOverPhoto)}  markOverHeading=${JSON.stringify(o.markOverHeading)}`);
    }
    console.log('\nTHE REQUIRED PHOTO');
    for (const c of result.emptyState) {
      console.log(`  ${c.dimId.padEnd(10)} missingRequired=${JSON.stringify(c.truth.missingRequired)}  placeholder=${c.truth.photoPlaceholder ? `${c.truth.photoPlaceholder.mask} "${c.truth.photoPlaceholder.label}"` : 'NONE'}`);
    }
    console.log(`  no-mask render → missingAssets=${JSON.stringify(result.maskless.missingAssets)} photo=${result.maskless.photo ? 'PAINTED (wrong)' : 'refused ✓'}`);
    console.log('\nTHE PETAL IS FIXED (sha256 of everything outside the heading band)');
    for (const g of result.fixedGeometry) {
      const a = sha(Buffer.from(g.empty.split(',')[1], 'base64')).slice(0, 16);
      const b = sha(Buffer.from(g.full.split(',')[1], 'base64')).slice(0, 16);
      console.log(`  ${g.dimId.padEnd(10)} empty ${a}  full ${b}  ${a === b ? 'identical ✓' : 'MOVED ✗'}`);
    }
    console.log('\nTHE photoOnly STATE  (window px · mark ratio · heading band)');
    for (const c of result.photoOnly) {
      const b = c.truth.photo ? c.truth.photo.box : null;
      console.log(`  ${c.dimId.padEnd(10)} window ${b ? `${Math.round(b.w)}×${Math.round(b.h)}` : '—'}  mark ${c.truth.backdrop.logo?.ratio}/${c.truth.backdrop.logo?.minimum}  band=${c.truth.slots.heading ? 'PRESENT (wrong)' : 'absent ✓'}  state=${c.truth.state}`);
    }
    console.log('\nEVERY SHAPE, BLED  (painted left/right/top/bottom as canvas fractions)');
    for (const sh of result.photoOnlyShapes) {
      for (const [dimId, r] of Object.entries(sh.dims)) {
        const pnt = r.paint;
        console.log(`  ${sh.id.padEnd(9)} ${dimId.padEnd(10)} l=${pnt.l.toFixed(3)} r=${pnt.r.toFixed(3)} t=${pnt.t.toFixed(3)} b=${pnt.b.toFixed(3)}  mark ${r.mark?.ratio}/${r.mark?.minimum}`);
      }
    }
    console.log('\nHER CROP INSIDE THE WINDOW  (clamped transform · field pixels inside the window · mark ratio)');
    for (const c of result.crops) {
      console.log(`  ${c.name.padEnd(13)} ${c.dimId.padEnd(10)} ${JSON.stringify(c.transform)}  gap=${c.sampled ? `${Math.round((c.fieldInside / c.sampled) * 1000) / 10}%` : 'n/a'}  mark ${c.mark?.ratio}/${c.mark?.minimum}`);
    }
    console.log('\nTHE TEXT TOGGLE  (state · window width px · mark ratio · reversible)');
    for (const tr of result.transition) {
      const h = (p) => sha(Buffer.from(p.split(',')[1], 'base64')).slice(0, 12);
      console.log(`  ${tr.dimId.padEnd(10)} text off → ${String(tr.before.state).padEnd(11)} window ${tr.before.photoBox ? Math.round(tr.before.photoBox.w) : '—'}px  mark ${tr.before.markBackdrop?.ratio}`
        + `   text on → ${String(tr.typed.state).padEnd(11)} window ${tr.typed.photoBox ? Math.round(tr.typed.photoBox.w) : '—'}px  mark ${tr.typed.markBackdrop?.ratio}`
        + `   back → ${h(tr.after.png) === h(tr.before.png) ? 'identical ✓' : 'DRIFTED ✗'}`);
    }
    console.log('\nCOLOUR PAIRS (portrait)');
    for (const c of result.pairCases) {
      const hb = c.truth.backdrop.slots.heading;
      const lg = c.truth.backdrop.logo;
      console.log(`  ${c.pairId.padEnd(7)} band=${hb?.ratio}/${hb?.minimum}  mark=${lg?.ratio}/${lg?.minimum}  failures=${JSON.stringify(c.truth.contrastFailures)}`);
    }
    console.log(`\nPNG evidence: ${OUT_DIR} (${result.shots.length} files)`);

    if (failures.length) {
      console.error(`\nFAIL — ${failures.length} gate(s):`);
      for (const f of failures) console.error('  · ' + f);
      process.exit(1);
    }
    console.log(`\nPASS — ${result.cases.length} cases clean across ${result.dimIds.length} dimensions.`);
  } finally {
    await h.close();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
