/* ─────────────────────────────────────────────────────────────────────────
   §11 VERIFICATION BAR FOR TEMPLATE THREE — "Caption Band"

     · all four declared dimensions render CLEAN with
         (a) photo + BOTH lines empty
         (b) both lines at exactly charBudget
         (c) both lines at budget WITH TWO HARD LINE BREAKS
     · AUTOFIT FLOOR CHECK: at charBudget the painted px is at the floor
     · the BACKDROP CHECK passes for the mark on EVERY pair, in every dimension,
       at every sanctioned corner — and passes because of the declared plate,
       which is proved by the ratio coming back as the pair's own FLAT-FIELD
       number rather than something the photograph decided
     · the required-photo empty state blocks export honestly
     · budgets measured in the canvas render core, never off Figma

   …and the four things that are new in this template, each proven rather than
   asserted:

     · THE PILL IS DOMINANT. Not a claim about intent — a measured fact, at
       every copy length from one character to the full budget, in all four
       dimensions: paintedPx(pill) > paintedPx(heading), always.
     · THE MARK IS ON THE PHOTOGRAPH, AND SURVIVES IT. With `--library` every
       photo in the brand's live library is rendered through the REAL core at
       every pair, dimension and corner, and the mark's verdict must be clean
       on all of them. Without the plate this fails on 58% of them — the bare
       numbers are in scripts/tools/scan-mark-on-photo.mjs.
     · THE MOTIF IS A REAL ASSET, DATA, AND FIXED. It paints, it is the declared
       id, it is under the words when they are measured, and a motif that never
       arrived REFUSES rather than quietly dropping out of the design (M3).
     · TEXT NEVER SITS ON THE PHOTOGRAPH. A measured geometric fact in every
       dimension, exactly as it is on template two — the band is where the type
       lives, and the band is flat pre-verified field.

   Runs in the same headless-Chromium harness the budget measurement uses, so
   the thing being verified is the thing that paints. Writes PNG evidence to
   generated/template-three/ (gitignored — M10).

   Usage: node scripts/tools/verify-template-three.mjs [--library]
   ───────────────────────────────────────────────────────────────────────── */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openHarness, REPO_ROOT } from './template-harness.mjs';
import { templateMotifAsset } from '../../lib/templates/motif-assets.mjs';
import { templateLogoVariants } from '../../lib/templates/logo-assets.mjs';
import { TEMPLATE_CAPTION_BAND as T } from '../../lib/templates/index.mjs';
import { DIMENSIONS } from '../../lib/templates/template-contract.mjs';

const OUT_DIR = join(REPO_ROOT, 'generated', 'template-three');
const CACHE_DIR = join(REPO_ROOT, 'generated', '.photo-cache');
const MANIFEST = join(CACHE_DIR, 'manifest.json');
const FILLER = 'every child leads their own day here with us in the garden and at the table together';
/* The measurement's OWN THREE CORPORA, verbatim from
   scripts/tools/measure-template-budgets.mjs. The declared budget is the
   MINIMUM capacity across all three, so the autofit-floor gate has to be run
   against all three too and judged on the TIGHTEST — the corpus that actually
   set the number. Which one that is differs per slot and is not guessable: for
   the tracked-caps pill it is not the long-word profile (word length barely
   matters in a one-line box, and the measurement refines character by
   character into the next word) but whichever profile has the widest CAPITALS.
   Picking one by hand would be gating the wrong sentence. */
const CORPORA = [
  'every child leads their own day here with us and we make room for what they want to try next in the garden or at the table and we watch them find it in their own time each day of the week',
  'our educators document each discovery so families understand exactly how curiosity becomes confidence throughout the whole enrolment year and beyond into their first classroom experience together',
  'extraordinary developmental observations demonstrate remarkable independence throughout collaborative investigation experiences supporting communication breakthroughs enthusiastically documented consistently',
];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const withLibrary = process.argv.includes('--library');

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });

  const failures = [];
  const fail = (m) => failures.push(m);

  // LAW 3 — the declared motif must resolve to a real asset before anything
  // else is worth measuring.
  const motifDeclared = T.slots.motif?.present === true;
const motif = motifDeclared ? templateMotifAsset(T) : null;
  if (motifDeclared && !motif) fail(`the declared motif id '${T.slots.motif?.asset}' does not resolve — law 3`);
  const variants = templateLogoVariants(T);
  if (variants.length !== (T.allowedLogoAssets || []).length) fail('a sanctioned logo variant id did not resolve — law 3');

  let manifest = [];
  if (withLibrary) {
    if (!existsSync(MANIFEST)) {
      fail(`--library was asked for but there is no photo cache at ${CACHE_DIR}`);
    } else manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  }

  const h = await openHarness();
  try {
    const result = await h.page.evaluate(async ({ FILLER, CORPORA, motifSrc, variantList, manifest }) => {
      const { templateById, DIMENSIONS, slotConstraint, renderTemplate } = window.__wo;
      const tpl = templateById('caption_band');

      const exactly = (n) => {
        if (n <= 0) return '';
        let s = '';
        while (s.length < n) s += (s ? ' ' : '') + FILLER;
        return s.slice(0, n);
      };
      const exactlyFrom = (corpus, n) => {
        if (n <= 0) return '';
        let s = '';
        while (s.length < n) s += (s ? ' ' : '') + corpus;
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

      // A RETIRED motif is not fetched at all: requesting a deliberately-absent
      // file would log a 404 the console gate would (rightly) flag as an error.
      const motifImage = motifSrc ? await loadImage(motifSrc) : null;
      const logoLight = await loadImage('/public' + tpl.logoAssets.light);
      const logoDark = await loadImage('/public' + tpl.logoAssets.dark);
      const variantImages = {};
      for (const v of variantList) variantImages[v.id] = await loadImage('/public' + v.src);

      /* THE PHOTO. Painted here rather than fetched, so the §11 sweep is
         deterministic — the real library path is exercised by --library below.
         It is deliberately HOSTILE to the mark: a mid burnham-green field, the
         exact tone that makes a green lockup vanish, with hard light and dark
         bars so any variance test has something to bite on. If the mark clears
         on this card, it is the plate doing it and nothing else. */
      const photo = (() => {
        const c = document.createElement('canvas');
        c.width = 1400; c.height = 1750;
        const cx = c.getContext('2d');
        cx.fillStyle = '#2F5A52'; cx.fillRect(0, 0, c.width, c.height);
        for (let i = -1750; i < 2800; i += 180) {
          cx.fillStyle = ((i / 180) % 2 === 0) ? '#0B0B0B' : '#EFEFEF';
          cx.save(); cx.translate(i, 0); cx.rotate(0.5); cx.fillRect(0, -2000, 62, 5000); cx.restore();
        }
        return c;
      })();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const dimIds = Object.keys(tpl.dimensions);
      const headBudget = tpl.slots.heading.charBudget;
      const pillBudget = tpl.slots.pill.charBudget;
      const shots = [];

      const base = (pairId, position) => {
        const pair = tpl.colourPairs.find((p) => p.id === pairId);
        return {
          colourPairId: pairId,
          logoPosition: position || tpl.allowedLogoPositions[0],
          logoImage: pair.klass === 'dark' ? logoDark : logoLight,
          logoInk: pair.klass === 'dark' ? '#F5F6E7' : '#254E48',
          motifImage,
        };
      };

      // ── (a) (b) (c), every dimension, on the client's own ivory field ─────
      const cases = [];
      for (const [kind, head, pill] of [
        ['empty', '', ''],
        ['budget', exactly(headBudget), exactly(pillBudget)],
        ['breaks', withTwoBreaks(headBudget), withTwoBreaks(pillBudget)],
      ]) {
        for (const dimId of dimIds) {
          const dim = DIMENSIONS[dimId];
          canvas.width = dim.w; canvas.height = dim.h;
          const truth = renderTemplate(ctx, tpl, dimId, { ...base('ivory'), heading: head, pill, photoImage: photo }, {});
          cases.push({ kind, dimId, truth });
          shots.push({ name: `${kind}-${dimId}`, data: canvas.toDataURL('image/png') });
        }
      }

      /* ── THE REFERENCE ITSELF — the client's own two lines, every dimension,
            every pair. This is the picture a person looks at. */
      const reference = [];
      for (const pair of tpl.colourPairs) {
        for (const dimId of dimIds) {
          const dim = DIMENSIONS[dimId];
          canvas.width = dim.w; canvas.height = dim.h;
          const truth = renderTemplate(ctx, tpl, dimId, {
            ...base(pair.id), heading: 'Term 3 places open', pill: 'NOW ENROLLING', photoImage: photo,
          }, {});
          reference.push({ pairId: pair.id, dimId, truth });
          shots.push({ name: `reference-${pair.id}-${dimId}`, data: canvas.toDataURL('image/png') });
        }
      }

      /* ── THE HIERARCHY, AT EVERY LENGTH ──────────────────────────────────
         The ratified decision is that the pill DOMINATES the heading. That is
         only true if it is true at the extremes too: one character, the
         client's own copy, and the full budget. Measured off paintedPx, in
         every dimension. */
      const hierarchy = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        for (const [name, head, pill] of [
          ['one-char', 'a', 'A'],
          ['client', 'Term 3 places open', 'NOW ENROLLING'],
          ['at-budget', exactly(headBudget), exactly(pillBudget)],
        ]) {
          canvas.width = dim.w; canvas.height = dim.h;
          const truth = renderTemplate(ctx, tpl, dimId, { ...base('ivory'), heading: head, pill, photoImage: photo }, {});
          hierarchy.push({
            dimId, name,
            headingPx: truth.slots.heading?.paintedPx ?? null,
            pillPx: truth.slots.pill?.paintedPx ?? null,
            headingFloor: truth.slots.heading?.floorPx ?? null,
            pillFloor: truth.slots.pill?.floorPx ?? null,
          });
        }
      }

      /* ── THE AUTOFIT FLOOR CHECK, ON THE COPY THE BUDGET CAME FROM ───────
         §11: "at charBudget the painted px must equal the declared floor, not
         below it." Run on the measurement's own pessimistic corpus, because
         that is the profile whose capacity BECAME the budget — the same count
         of friendly short words is narrower and honestly paints larger, and
         gating that would be gating the wrong sentence. */
      const floorCheck = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        for (const slot of ['heading', 'pill']) {
          const budget = tpl.slots[slot].charBudget;
          const seen = [];
          for (const corpus of CORPORA) {
            canvas.width = dim.w; canvas.height = dim.h;
            const truth = renderTemplate(ctx, tpl, dimId, {
              ...base('ivory'), heading: '', pill: '', [slot]: exactlyFrom(corpus, budget), photoImage: photo,
            }, {});
            const t = truth.slots[slot];
            seen.push({ paintedPx: t.paintedPx, floorPx: t.floorPx, overBudget: t.overBudget, lines: t.lines, maxLines: t.maxLines });
          }
          const tightest = seen.reduce((m, x) => (x.paintedPx < m.paintedPx ? x : m), seen[0]);
          floorCheck.push({ dimId, slot, budget, all: seen.map((x) => x.paintedPx), ...tightest });
        }
      }

      /* ── THE MARK, ON THE PHOTOGRAPH, EVERYWHERE ─────────────────────────
         Every pair x every sanctioned corner x every dimension, on the hostile
         card. And the ratio is compared against the pair's own FLAT-FIELD
         contrast: a mark that merely "passes" could be passing by luck of the
         photograph, while a mark sitting on its declared plate returns the
         pair's own number. That equality is the plate, measured. */
      const markSweep = [];
      for (const pair of tpl.colourPairs) {
        for (const position of tpl.allowedLogoPositions) {
          for (const dimId of dimIds) {
            const dim = DIMENSIONS[dimId];
            canvas.width = dim.w; canvas.height = dim.h;
            const truth = renderTemplate(ctx, tpl, dimId, {
              ...base(pair.id, position), heading: 'Term 3 places open', pill: 'NOW ENROLLING', photoImage: photo,
            }, {});
            markSweep.push({
              pairId: pair.id, position, dimId,
              pairContrast: pair.contrast,
              mark: truth.backdrop.logo,
              plate: truth.logoPlate,
              logoBox: truth.logoBox,
              band: { heading: truth.backdrop.slots.heading || null, pill: truth.backdrop.slots.pill || null },
              contrastFailures: truth.contrastFailures,
            });
            if (dimId === 'portrait') shots.push({ name: `mark-${pair.id}-${position}-portrait`, data: canvas.toDataURL('image/png') });
          }
        }
      }

      /* ── EVERY SANCTIONED MARK VARIANT ───────────────────────────────────
         She may swap the mark. A TONE-APPROPRIATE variant must clear on every
         pair; an OFF-TONE one (an ivory mark on the ivory plate) must REFUSE
         and say so, never be silently substituted (M3). Both halves are gated. */
      const variantSweep = [];
      for (const v of variantList) {
        const img = variantImages[v.id];
        for (const pair of tpl.colourPairs) {
          const dim = DIMENSIONS.portrait;
          canvas.width = dim.w; canvas.height = dim.h;
          const truth = renderTemplate(ctx, tpl, 'portrait', {
            ...base(pair.id), heading: 'Term 3 places open', pill: 'NOW ENROLLING',
            photoImage: photo, logoImage: img, logoInk: v.ink,
          }, {});
          variantSweep.push({
            id: v.id, colour: v.colour, pairId: pair.id, pairKlass: pair.klass,
            loaded: !!img, mark: truth.backdrop.logo, failures: truth.contrastFailures,
          });
        }
      }

      // ── THE REQUIRED PHOTO — no photo at all ─────────────────────────────
      const emptyState = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        canvas.width = dim.w; canvas.height = dim.h;
        const truth = renderTemplate(ctx, tpl, dimId, { ...base('ivory'), heading: 'Term 3 places open', pill: 'NOW ENROLLING' }, {});
        emptyState.push({ dimId, truth });
        shots.push({ name: `nophoto-${dimId}`, data: canvas.toDataURL('image/png') });
      }

      // ── A MOTIF THAT NEVER ARRIVED must refuse, not silently drop out ────
      const motifless = (() => {
        const dim = DIMENSIONS.portrait;
        canvas.width = dim.w; canvas.height = dim.h;
        const v = { ...base('ivory'), heading: 'Term 3 places open', pill: 'NOW ENROLLING', photoImage: photo };
        delete v.motifImage;
        return renderTemplate(ctx, tpl, 'portrait', v, {});
      })();

      /* ── HER CROP INSIDE THE FIXED FRAME ─────────────────────────────────
         The transform is clamped in units of the slack, so the frame can never
         show empty field, and the MARK's verdict must not move with it — the
         plate is the mark's field, and the plate does not move. */
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
            ...base('ivory'), heading: 'Term 3 places open', pill: 'NOW ENROLLING',
            photoImage: photo, photoTransform: tf,
          }, {});
          /* NO FIELD INSIDE THE FRAME, measured: sample the centre quarter of
             the photo box and count pixels that are the pair's own field
             colour. The hostile card contains no ivory-ish tone, so a field
             pixel inside the frame can only mean the photo stopped covering. */
          let fieldInside = 0; let sampled = 0;
          const b = truth.photo ? truth.photo.box : null;
          if (b) {
            const cx = Math.round(b.x + b.w / 2); const cy = Math.round(b.y + b.h / 2);
            const qw = Math.max(4, Math.round(b.w / 4)); const qh = Math.max(4, Math.round(b.h / 4));
            const d = ctx.getImageData(cx - qw / 2, cy - qh / 2, qw, qh).data;
            for (let i = 0; i < d.length; i += 4 * 7) {
              sampled += 1;
              if (Math.abs(d[i] - 245) + Math.abs(d[i + 1] - 246) + Math.abs(d[i + 2] - 231) < 18) fieldInside += 1;
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

      /* ── THE GEOMETRY IS FIXED, NEVER CONDITIONAL ────────────────────────
         Render one character of copy and a full budget of it, blank BOTH text
         boxes out of each, and hash what is left. If the photograph, the motif
         or the mark moved to make room for words, these differ. */
      const fixedGeometry = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        const boxes = ['heading', 'pill'].map((s) => slotConstraint(tpl, s, dimId));
        const shot = (head, pill) => {
          canvas.width = dim.w; canvas.height = dim.h;
          renderTemplate(ctx, tpl, dimId, { ...base('ivory'), heading: head, pill, photoImage: photo }, {});
          // Blank both boxes generously and asymmetrically — the box-height
          // convention measures baseline to baseline, so descenders paint a
          // little below the declared box. That overhang is a property of the
          // convention, not of the layout.
          ctx.save();
          ctx.fillStyle = '#FF00FF';
          for (const b of boxes) {
            const padTop = 8;
            const padBottom = Math.ceil(b.box.h * dim.h * 0.25);
            ctx.fillRect(b.box.x * dim.w - padTop, b.box.y * dim.h - padTop,
              b.box.w * dim.w + 2 * padTop, b.box.h * dim.h + padTop + padBottom);
          }
          ctx.restore();
          return canvas.toDataURL('image/png');
        };
        fixedGeometry.push({ dimId, short: shot('a', 'A'), full: shot(exactly(headBudget), exactly(pillBudget)) });
      }

      /* ── TEXT NEVER SITS ON THE PHOTOGRAPH, AND THE PLATE NEVER SITS ON THE
            TEXT — measured rects, not promises. */
      const overlaps = [];
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        const p = slotConstraint(tpl, 'photo', dimId).box;
        const mSlot = slotConstraint(tpl, 'motif', dimId);
    const m = mSlot && mSlot.box ? mSlot.box : null;
        const rect = (b) => ({ x: b.x, y: b.y, r: b.x + b.w, b: b.y + b.h });
        const hit = (a, c) => !(a.r <= c.x || c.r <= a.x || a.b <= c.y || c.b <= a.y);
        const textRects = ['heading', 'pill'].map((s) => ({ s, r: rect(slotConstraint(tpl, s, dimId).box) }));
        const l = slotConstraint(tpl, 'logo', dimId);
        const plate = tpl.slots.logo.plate;
        const plateRects = tpl.allowedLogoPositions.map((position) => {
          const pad = (l.pad ?? 0.05) * dim.w;
          const lw = (l.widthFrac ?? 0.12) * dim.w;
          const lh = lw * 0.8333; // the secondary lockup's shipped ratio
          const x = position.endsWith('left') ? pad : dim.w - pad - lw;
          const y = position.startsWith('top') ? pad : dim.h - pad - lh;
          const pp = (plate?.pad ?? 0) * lw;
          return {
            position,
            x: (x - pp) / dim.w, y: (y - pp) / dim.h,
            r: (x + lw + pp) / dim.w, b: (y + lh + pp) / dim.h,
          };
        });
        overlaps.push({
          dimId,
          textOverPhoto: textRects.map((t) => [t.s, hit(t.r, rect(p))]),
          motifOverPhoto: m ? hit(rect(m), rect(p)) : false,
          plateOverText: plateRects.map((q) => [q.position, textRects.some((t) => hit(q, t.r))]),
          plateInFrame: plateRects.map((q) => [q.position, q.x >= 0 && q.y >= 0 && q.r <= 1 && q.b <= 1]),
          plateRects,
        });
      }

      // ── THE LIBRARY, THROUGH THE REAL CORE ───────────────────────────────
      const library = { checked: 0, markFails: [], textFails: [], missing: 0 };
      for (const row of manifest) {
        const img = await loadImage(`/generated/.photo-cache/${row.file}`);
        if (!img) { library.missing += 1; continue; }
        for (const pair of tpl.colourPairs) {
          for (const position of tpl.allowedLogoPositions) {
            for (const dimId of dimIds) {
              const dim = DIMENSIONS[dimId];
              canvas.width = dim.w; canvas.height = dim.h;
              const truth = renderTemplate(ctx, tpl, dimId, {
                ...base(pair.id, position), heading: 'Term 3 places open', pill: 'NOW ENROLLING', photoImage: img,
              }, {});
              library.checked += 1;
              const lg = truth.backdrop.logo;
              if (!lg || !lg.ok) library.markFails.push({ file: row.filename, pair: pair.id, position, dimId, ratio: lg ? lg.ratio : null });
              for (const [slot, r] of Object.entries(truth.backdrop.slots || {})) {
                if (!r.ok) library.textFails.push({ file: row.filename, pair: pair.id, position, dimId, slot, ratio: r.ratio });
              }
            }
          }
        }
      }

      return {
        cases, reference, hierarchy, floorCheck, markSweep, variantSweep, emptyState, motifless,
        crops, fixedGeometry, overlaps, library, shots,
        headBudget, pillBudget, dimIds,
        assetsLoaded: { motif: !!motifImage, logoLight: !!logoLight, logoDark: !!logoDark },
      };
    }, {
      FILLER, CORPORA,
      motifSrc: motifDeclared ? (motif ? `/public${motif.src}` : '/public/assets/shapes/__missing__.svg') : null,
      variantList: variants.map((v) => ({ id: v.id, src: v.src, colour: v.colour, ink: v.ink })),
      manifest,
    });

    for (const s of result.shots) {
      writeFileSync(join(OUT_DIR, `${s.name}.png`), Buffer.from(s.data.split(',')[1], 'base64'));
    }

    // ── §11 (a)(b)(c) ──────────────────────────────────────────────────────
    for (const c of result.cases) {
      const at = `${c.kind}/${c.dimId}`;
      if (!c.truth.photo) fail(`${at}: the photo did not paint`);
      if (!motifDeclared) {
      if (c.truth.motif) fail(`${at}: a RETIRED motif painted anyway — the band carries the words and nothing else`);
    } else if (!c.truth.motif) fail(`${at}: the declared motif did not paint`);
      else if (motifDeclared && c.truth.motif.asset !== T.slots.motif.asset) fail(`${at}: the motif painted '${c.truth.motif.asset}', not the declared asset`);
      if (c.truth.missingRequired.length) fail(`${at}: a satisfied required slot was reported missing (${c.truth.missingRequired.join(', ')})`);
      if (c.truth.missingAssets.length) fail(`${at}: missing assets ${c.truth.missingAssets.join(', ')}`);
      if (!c.truth.logoBox) fail(`${at}: the mark did not paint`);
      if (!c.truth.logoPlate) fail(`${at}: the declared mark plate did not paint`);
      if (c.truth.state !== null) fail(`${at}: this template declares ONE layout, so the state must be null (got '${c.truth.state}')`);

      for (const slot of ['heading', 'pill']) {
        const t = c.truth.slots[slot];
        if (!t) { fail(`${at}: the ${slot} slot was not rendered`); continue; }
        if (c.kind === 'empty') {
          if (!t.empty || t.lines !== 0) fail(`${at}/${slot}: an empty field painted ${t.lines} line(s)`);
          if (t.overBudget) fail(`${at}/${slot}: an empty field reported over-budget`);
          continue;
        }
        if (c.kind === 'budget' && t.overBudget) fail(`${at}/${slot}: OVER BUDGET at exactly charBudget — the measurement is wrong`);
        if (t.lines > t.maxLines) fail(`${at}/${slot}: painted ${t.lines} lines past maxLines ${t.maxLines} — unclipped spill`);
        if (t.overBudget && t.wrappedLines <= t.maxLines) fail(`${at}/${slot}: flagged over-budget but fits — false alarm`);
        if (!t.overBudget && t.wrappedLines > t.maxLines) fail(`${at}/${slot}: overflows to ${t.wrappedLines} lines but was NOT flagged — §7.2 second check failed`);
        /* §11 "at charBudget the painted px must equal the declared floor, not
           below it". EXACT equality is arithmetically impossible while §7.4's
           conservative safety margin exists: the budget is 90% of the measured
           capacity, so copy at budget is slightly short of the box.

           WHERE THIS TEMPLATE DIVERGES FROM ITS TWO PREDECESSORS, AND WHY IT
           IS THE SAME GATE. On Classic and Petal Window the box height is the
           floor line, so the box binds and painted lands within a pixel or two
           of the floor. Here the PILL's box is deliberately 1.906x its floor
           line (short copy renders large and dramatic — §7), so at budget the
           binding constraint is the box's WIDTH, and width-limited size at
           0.9 x capacity is floor / 0.9. The honest bound is therefore the
           SAFETY MARGIN's own arithmetic, not a fixed +2, and it is applied to
           both slots so neither gets a laxer rule than the other. */
        const floor = Math.floor(t.floorPx);
        if (t.paintedPx < floor) fail(`${at}/${slot}: painted ${t.paintedPx}px BELOW the declared floor ${floor}px`);
      }

      if (!c.truth.backdrop.checked) fail(`${at}: a photo was painted but nothing was measured`);
      const lg = c.truth.backdrop.logo;
      if (!lg) fail(`${at}: the mark was not measured`);
      else if (!lg.ok) fail(`${at}: the mark measures ${lg.ratio}:1 — below ${lg.minimum}`);
      if (c.kind !== 'empty') {
        for (const slot of ['heading', 'pill']) {
          const r = c.truth.backdrop.slots[slot];
          if (!r) fail(`${at}: the filled ${slot} was not measured against its band`);
          else if (!r.ok) fail(`${at}: the ${slot} measures ${r.ratio}:1 in its own band — below ${r.minimum}`);
        }
      }
      if (c.truth.contrastFailures.length) fail(`${at}: contrast failures ${c.truth.contrastFailures.join(', ')}`);
    }
    const breaksFlagged = result.cases.filter((c) => c.kind === 'breaks' && c.truth.overBudgetSlots.length).length;
    if (!breaksFlagged) fail('the breaks sweep flagged nothing — the §7.2 hard-break check is inert on this template');

    // ── THE HIERARCHY ──────────────────────────────────────────────────────
    for (const r of result.hierarchy) {
      if (r.pillPx == null || r.headingPx == null) { fail(`hierarchy ${r.name}/${r.dimId}: a slot did not report a size`); continue; }
      if (!(r.pillPx > r.headingPx)) {
        fail(`hierarchy ${r.name}/${r.dimId}: the pill painted ${r.pillPx}px against the heading's ${r.headingPx}px — the ratified hierarchy INVERTS at this copy length`);
      }
    }

    // ── THE AUTOFIT FLOOR ──────────────────────────────────────────────────
    for (const f of result.floorCheck) {
      const at = `floor ${f.slot}/${f.dimId}`;
      const floor = Math.floor(f.floorPx);
      if (f.overBudget) fail(`${at}: OVER BUDGET at exactly charBudget on the measurement's own corpus — the budget is wrong`);
      if (f.lines > f.maxLines) fail(`${at}: painted ${f.lines} lines past maxLines ${f.maxLines}`);
      if (f.paintedPx < floor) fail(`${at}: painted ${f.paintedPx}px BELOW the declared floor ${floor}px`);
      /* AND NOT MEANINGFULLY ABOVE IT EITHER. Exact equality is arithmetically
         impossible while §7.4's conservative safety margin exists, so the gate
         reads the size BACK as a capacity and checks the budget really is that
         capacity's 90%:

           impliedCapacity = budget x paintedPx / floorPx

         because in a one-line box the size a fixed character count takes is
         inversely proportional to the count. The upper bound is what the
         margin plus TWO integer truncations can explain — `budget` is
         floor(capacity x 0.9), so the real capacity can be up to
         (budget + 1) / 0.9, and the measurement itself floors a fractional
         capacity, which is worth one more character. Anything past that would
         mean the budget was measured against a box other than the floor's. */
      const implied = (f.budget * f.paintedPx) / f.floorPx;
      const bound = ((f.budget + 1) / 0.9) + 1;
      if (implied > bound) {
        fail(`${at}: at charBudget (${f.budget}) it painted ${f.paintedPx}px against a ${floor}px floor — an implied capacity of ${implied.toFixed(1)} against a bound of ${bound.toFixed(1)}, which is more than the 90% safety margin explains, so the budget is not the floor's budget`);
      }
    }

    // ── THE MARK, ON THE PHOTOGRAPH ────────────────────────────────────────
    for (const m of result.markSweep) {
      const at = `mark ${m.pairId}/${m.position}/${m.dimId}`;
      if (!m.plate) { fail(`${at}: no plate was painted`); continue; }
      if (!m.mark) { fail(`${at}: the mark was not measured`); continue; }
      if (!m.mark.ok) fail(`${at}: the mark measures ${m.mark.ratio}:1 — below ${m.mark.minimum}`);
      /* THE PLATE, PROVED. A ratio that merely clears could be the photograph
         being kind. The pair's own flat-field number coming back means the
         mark is measuring the plate — which is the whole claim. */
      if (Math.abs(m.mark.ratio - m.pairContrast) > 0.05) {
        fail(`${at}: the mark measures ${m.mark.ratio}:1 where this pair's FLAT FIELD is ${m.pairContrast}:1 — the photograph is still reaching the mark, so the plate is not doing its job`);
      }
      for (const [slot, r] of Object.entries(m.band)) {
        if (!r) fail(`${at}: the ${slot} was not measured`);
        else if (!r.ok) fail(`${at}: the ${slot} measures ${r.ratio}:1 in the band — below ${r.minimum}`);
      }
      if (m.contrastFailures.length) fail(`${at}: contrast failures ${m.contrastFailures.join(', ')}`);
    }

    // ── EVERY SANCTIONED VARIANT, TONE AND OFF-TONE ────────────────────────
    for (const v of result.variantSweep) {
      const at = `variant ${v.id}/${v.pairId}`;
      if (!v.loaded) { fail(`${at}: the asset did not load — law 3`); continue; }
      if (!v.mark) { fail(`${at}: the mark was not measured`); continue; }
      const toneOk = (v.colour === 'green' && v.pairKlass === 'light') || (v.colour === 'ivory' && v.pairKlass === 'dark');
      if (toneOk && !v.mark.ok) fail(`${at}: a TONE-APPROPRIATE mark measures ${v.mark.ratio}:1 and refuses — the plate should carry it`);
      if (!toneOk && v.mark.ok) fail(`${at}: an OFF-TONE mark (${v.colour} on a ${v.pairKlass} field) came back readable at ${v.mark.ratio}:1 — the check is not measuring what it claims to`);
      if (!toneOk && !v.failures.includes('logo')) fail(`${at}: an off-tone mark failed the floor but was not reported — export could not be blocked`);
    }

    // ── THE REQUIRED PHOTO ─────────────────────────────────────────────────
    for (const c of result.emptyState) {
      const at = `nophoto/${c.dimId}`;
      if (c.truth.photo) fail(`${at}: a photo was reported where none was given`);
      if (!c.truth.missingRequired.includes('photo')) fail(`${at}: a REQUIRED photo is missing and the render did not say so — export could not be blocked`);
      if (!c.truth.photoPlaceholder) fail(`${at}: no placeholder was painted — the empty state is a blank, not an invitation`);
      if (motifDeclared && !c.truth.motif) fail(`${at}: the motif must still paint while the photo is missing — the band is not waiting on the picture`);
    if (!motifDeclared && c.truth.motif) fail(`${at}: a retired motif painted in the empty state`);
    }
    if (motifDeclared && !result.motifless.missingAssets.includes('motif')) fail('a render with no motif image did not report the missing asset');
    if (result.motifless.motif) fail('a render with no motif image reported a motif anyway');
  if (!motifDeclared && result.motifless.missingAssets.includes('motif')) fail('a RETIRED motif was reported missing — it is not declared, so nothing may await it');

    // ── THE GEOMETRY IS FIXED ──────────────────────────────────────────────
    for (const g of result.fixedGeometry) {
      const a = sha(Buffer.from(g.short.split(',')[1], 'base64'));
      const b = sha(Buffer.from(g.full.split(',')[1], 'base64'));
      if (a !== b) fail(`${g.dimId}: the layout OUTSIDE the two text boxes changed with the copy — geometry is being recomputed from content (§6.2)`);
    }

    // ── OVERLAPS ───────────────────────────────────────────────────────────
    for (const o of result.overlaps) {
      for (const [slot, hit] of o.textOverPhoto) if (hit) fail(`${o.dimId}: the ${slot} box INTERSECTS the photo box — text would sit on the photograph`);
      if (o.motifOverPhoto) fail(`${o.dimId}: the motif box intersects the photo box — the watermark belongs in the band`);
      for (const [position, hit] of o.plateOverText) if (hit) fail(`${o.dimId}: the mark plate at ${position} covers a text box`);
      for (const [position, inside] of o.plateInFrame) if (!inside) fail(`${o.dimId}: the mark plate at ${position} falls outside the frame`);
    }

    // ── HER CROP ───────────────────────────────────────────────────────────
    const cropDefaults = Object.fromEntries(result.crops.filter((c) => c.name === 'default').map((c) => [c.dimId, c]));
    for (const c of result.crops) {
      const at = `crop-${c.name}/${c.dimId}`;
      if (c.missingRequired.length) fail(`${at}: ${c.missingRequired.join(', ')} reported missing`);
      if (!c.transform) { fail(`${at}: the render reported no transform on an adjustable template`); continue; }
      if (Math.abs(c.transform.x) > 1 || Math.abs(c.transform.y) > 1) fail(`${at}: pan escaped the range (${JSON.stringify(c.transform)})`);
      if (c.transform.zoom < 1 || c.transform.zoom > 3) fail(`${at}: zoom escaped the range (${c.transform.zoom})`);
      if (c.sampled && c.fieldInside / c.sampled > 0.02) {
        fail(`${at}: ${Math.round((c.fieldInside / c.sampled) * 100)}% of the frame centre is FIELD colour — the photo stopped covering`);
      }
      const d = cropDefaults[c.dimId];
      if (!c.mark || !c.mark.ok) fail(`${at}: the mark was not measured, or failed (${JSON.stringify(c.mark)})`);
      else if (d && d.mark && c.mark.ratio !== d.mark.ratio) fail(`${at}: the mark's backdrop moved with the crop (${d.mark.ratio} -> ${c.mark.ratio}) — the plate is not the mark's field`);
      if (c.contrastFailures.length) fail(`${at}: contrast failures ${c.contrastFailures.join(', ')}`);
    }

    // ── THE LIBRARY ────────────────────────────────────────────────────────
    if (withLibrary) {
      if (!result.library.checked) fail('--library ran nothing');
      for (const f of result.library.markFails.slice(0, 20)) fail(`library mark FAIL ${f.pair}/${f.position}/${f.dimId} on ${f.file} — ${f.ratio}:1`);
      if (result.library.markFails.length > 20) fail(`…and ${result.library.markFails.length - 20} more library mark failures`);
      for (const f of result.library.textFails.slice(0, 20)) fail(`library text FAIL ${f.slot} ${f.pair}/${f.dimId} on ${f.file} — ${f.ratio}:1`);
    }

    if (motifDeclared && !result.assetsLoaded.motif) fail('the motif asset failed to load');
    if (!result.assetsLoaded.logoLight || !result.assetsLoaded.logoDark) fail(`logo assets failed to load: ${JSON.stringify(result.assetsLoaded)}`);
    if (h.errors.length) fail(`console/page errors: ${JSON.stringify(h.errors)}`);

    // ── The report ─────────────────────────────────────────────────────────
    console.log(`\nMOTIF: ${motifDeclared ? (motif ? `${motif.id} → ${motif.src} (FIXED — no picker)` : 'UNRESOLVED') : 'RETIRED by client ruling — asserted ABSENT on every render'}`);
    console.log(`DECLARED BUDGETS (cross-dimension minimum): heading ${result.headBudget} · pill ${result.pillBudget}`);
    console.log('\n§11 CASE TABLE  (paintedPx/floorPx · lines/maxLines · band ratio · mark ratio)');
    for (const c of result.cases) {
      const hd = c.truth.slots.heading; const pl = c.truth.slots.pill;
      const hb = c.truth.backdrop.slots.heading; const pb = c.truth.backdrop.slots.pill;
      const lg = c.truth.backdrop.logo;
      console.log(`  ${c.kind.padEnd(7)} ${c.dimId.padEnd(10)} `
        + `head ${String(hd.paintedPx).padStart(3)}/${Math.round(hd.floorPx)} ${hd.lines}/${hd.maxLines}${hd.overBudget ? ' OVER' : '     '}  `
        + `pill ${String(pl.paintedPx).padStart(3)}/${Math.round(pl.floorPx)} ${pl.lines}/${pl.maxLines}${pl.overBudget ? ' OVER' : '     '}  `
        + `band=${hb ? hb.ratio : '—'}/${pb ? pb.ratio : '—'}  mark=${lg ? `${lg.ratio}/${lg.minimum}` : '—'}  ${c.truth.motif ? 'motif✓' : 'motif✗'} ${c.truth.logoPlate ? 'plate✓' : 'plate✗'}`);
    }
    console.log('\nTHE HIERARCHY  (heading px vs pill px — the pill must always be larger)');
    for (const r of result.hierarchy) {
      console.log(`  ${r.name.padEnd(10)} ${r.dimId.padEnd(10)} heading ${String(r.headingPx).padStart(3)}px (floor ${Math.round(r.headingFloor)})   pill ${String(r.pillPx).padStart(3)}px (floor ${Math.round(r.pillFloor)})   x${(r.pillPx / r.headingPx).toFixed(2)}`);
    }
    console.log('\nTHE AUTOFIT FLOOR AT charBudget  (all three measurement corpora, judged on the tightest)');
    for (const f of result.floorCheck) {
      console.log(`  ${f.slot.padEnd(8)} ${f.dimId.padEnd(10)} tightest ${String(f.paintedPx).padStart(3)}px of ${JSON.stringify(f.all)}  floor ${String(Math.round(f.floorPx)).padStart(3)}px  implied capacity ${(((f.budget * f.paintedPx) / f.floorPx)).toFixed(1)} vs bound ${((((f.budget + 1) / 0.9) + 1)).toFixed(1)}  ${f.lines}/${f.maxLines} lines`);
    }
    console.log('\nTHE MARK ON THE PHOTOGRAPH  (measured ratio vs this pair\'s FLAT-FIELD ratio — equal means the plate is the field)');
    for (const m of result.markSweep) {
      console.log(`  ${m.pairId.padEnd(7)} ${m.position.padEnd(10)} ${m.dimId.padEnd(10)} mark ${String(m.mark?.ratio).padStart(5)}/${m.mark?.minimum}  flat field ${m.pairContrast}  plate ${m.plate ? `${Math.round(m.plate.box.w)}x${Math.round(m.plate.box.h)} @${m.plate.opacity}` : 'NONE'}`);
    }
    console.log('\nEVERY SANCTIONED MARK VARIANT (portrait)  — off-tone marks are EXPECTED to refuse');
    for (const v of result.variantSweep) {
      const toneOk = (v.colour === 'green' && v.pairKlass === 'light') || (v.colour === 'ivory' && v.pairKlass === 'dark');
      console.log(`  ${v.id.padEnd(9)} ${v.colour.padEnd(6)} on ${v.pairId.padEnd(7)} ${toneOk ? 'TONE' : 'off '}  ${String(v.mark?.ratio).padStart(5)}:1  ${v.mark?.ok ? 'ok' : 'REFUSED'}`);
    }
    console.log('\nGEOMETRY  (text over photo · motif over photo · plate over text · plate in frame)');
    for (const o of result.overlaps) {
      console.log(`  ${o.dimId.padEnd(10)} textOverPhoto=${JSON.stringify(o.textOverPhoto)}  motifOverPhoto=${o.motifOverPhoto}  plateOverText=${JSON.stringify(o.plateOverText)}  plateInFrame=${JSON.stringify(o.plateInFrame)}`);
    }
    console.log('\nTHE REQUIRED PHOTO');
    for (const c of result.emptyState) {
      console.log(`  ${c.dimId.padEnd(10)} missingRequired=${JSON.stringify(c.truth.missingRequired)}  placeholder=${c.truth.photoPlaceholder ? 'painted ✓' : 'NONE'}  motif=${c.truth.motif ? 'painted ✓' : 'NONE'}`);
    }
    console.log(`  no-motif render → missingAssets=${JSON.stringify(result.motifless.missingAssets)} motif=${result.motifless.motif ? 'PAINTED (wrong)' : 'refused ✓'}`);
    console.log('\nTHE GEOMETRY IS FIXED (sha256 of everything outside the two text boxes)');
    for (const g of result.fixedGeometry) {
      const a = sha(Buffer.from(g.short.split(',')[1], 'base64')).slice(0, 16);
      const b = sha(Buffer.from(g.full.split(',')[1], 'base64')).slice(0, 16);
      console.log(`  ${g.dimId.padEnd(10)} short ${a}  full ${b}  ${a === b ? 'identical ✓' : 'MOVED ✗'}`);
    }
    console.log('\nHER CROP  (clamped transform · field pixels inside the frame · mark ratio)');
    for (const c of result.crops) {
      console.log(`  ${c.name.padEnd(13)} ${c.dimId.padEnd(10)} ${JSON.stringify(c.transform)}  gap=${c.sampled ? `${Math.round((c.fieldInside / c.sampled) * 1000) / 10}%` : 'n/a'}  mark ${c.mark?.ratio}`);
    }
    if (withLibrary) {
      console.log(`\nTHE LIVE LIBRARY, THROUGH THE REAL RENDER CORE`);
      console.log(`  ${result.library.checked} renders (every photo x every pair x every corner x every dimension)`);
      console.log(`  mark failures: ${result.library.markFails.length}   band text failures: ${result.library.textFails.length}   photos that would not decode: ${result.library.missing}`);
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
