/* ─────────────────────────────────────────────────────────────────────────
   LIBRARY BACKDROP SWEEP — where every scrim opacity in a template comes from.

   Runs EVERY photo in the brand's live library through the same backdrop check
   the render core applies (lib/render-core/backdrop-contrast.mjs), for EVERY
   colour pair the template declares, over EVERY text-slot box and the mark box,
   in EVERY declared dimension, across an OPACITY LADDER — and reports, per pair,
   the LOWEST opacity at which every photo in the library clears both floors.

   The numbers in a template's `scrim` table are the output of this file. They
   are MEASURED, not taste. Re-run it when the library grows, when a pair is
   added, or when a template's boxes move.

   ── WHY IT IS ANALYTIC, AND WHY THAT IS NOT A SHORTCUT ──────────────────────
   A scrim is `source-over` at a constant alpha: every destination channel
   becomes `round(photo*(1-a) + scrim*a)`, independently, in 8-bit sRGB. So the
   photo only has to be PAINTED ONCE per box; each rung of the ladder is that
   same pixel set put through the blend arithmetic the canvas would do anyway.
   That is what makes 131 photos × 4 pairs × 4 dimensions × 36 rungs tractable.

   It is checked rather than asserted: `--verify` re-renders a sample of photos
   through the REAL renderTemplate at the chosen opacity and fails if the
   analytic ratio and the painted one disagree by more than 0.02.

   MONEY LAW: reads GET /api/images to learn the library, and the bytes from a
   local cache. Nothing is generated, nothing spends.

   Setup (once — the cache is gitignored under generated/):
     node scripts/tools/scan-library-backdrop.mjs --cache [--port 3100]

   Usage:
     node scripts/tools/scan-library-backdrop.mjs [--template label_headline]
                                                  [--ladder 0.60:0.96:0.01]
                                                  [--verify]
   ───────────────────────────────────────────────────────────────────────── */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openHarness, REPO_ROOT } from './template-harness.mjs';

const CACHE_DIR = join(REPO_ROOT, 'generated', '.photo-cache');
const MANIFEST = join(CACHE_DIR, 'manifest.json');

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

/** See the note at the cross-check report for why this is 0.15 and not 0. */
const CROSS_CHECK_TOLERANCE = 0.15;

/* ── The cache. The library lives behind short-lived signed URLs, so the sweep
      would otherwise be un-rerunnable an hour later. Bytes only; no metadata is
      invented and nothing is uploaded. ─────────────────────────────────────── */
async function buildCache() {
  const port = Number(flag('port', '3100'));
  mkdirSync(CACHE_DIR, { recursive: true });
  const rows = await (await fetch(`http://localhost:${port}/api/images`)).json();
  const list = rows.filter((r) => r.url);
  const manifest = [];
  let fresh = 0; let kept = 0; let failed = 0;
  for (const [i, r] of list.entries()) {
    const raw = String(r.metadata?.ext || String(r.filename || '').split('.').pop() || 'png').toLowerCase();
    const ext = ({ jpeg: 'jpg' }[raw] || raw);
    const file = `${String(i).padStart(3, '0')}.${['png', 'jpg', 'webp'].includes(ext) ? ext : 'png'}`;
    const path = join(CACHE_DIR, file);
    if (!existsSync(path)) {
      try {
        const res = await fetch(r.url);
        if (!res.ok) { failed += 1; continue; }
        writeFileSync(path, Buffer.from(await res.arrayBuffer()));
        fresh += 1;
      } catch { failed += 1; continue; }
    } else kept += 1;
    manifest.push({ file, filename: r.filename, id: r.id, source: r.source_type });
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`cached ${manifest.length}/${list.length} photos (new ${fresh}, kept ${kept}, unreachable ${failed}) → ${CACHE_DIR}`);
}

function parseLadder(spec) {
  const [from, to, step] = String(spec).split(':').map(Number);
  const out = [];
  for (let a = from; a <= to + 1e-9; a += step) out.push(Math.round(a * 1000) / 1000);
  return out;
}

async function sweep() {
  if (!existsSync(MANIFEST)) {
    console.error(`no photo cache at ${CACHE_DIR}. Run once with --cache (the dev server on :3100 must be up).`);
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const templateId = flag('template', 'label_headline');
  const ladder = parseLadder(flag('ladder', '0.60:0.96:0.01'));
  const verify = has('verify');

  const h = await openHarness();
  try {
    const result = await h.page.evaluate(async ({ manifest, templateId, ladder, verify }) => {
      const {
        templateById, DIMENSIONS, slotConstraint, renderTemplate,
      } = window.__wo;
      const tpl = templateById(templateId);
      if (!tpl) throw new Error(`no template '${templateId}'`);

      /* The contrast maths, verbatim from lib/surface-contrast-policy.mjs —
         same formulas, same busy threshold, same worst-case rule. */
      const chan = (v) => { const n = Math.max(0, Math.min(255, v)) / 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
      const rgbLum = (r, g, b) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
      const hexLum = (hex) => { const s = hex.replace('#', ''); return rgbLum(parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)); };
      const lc = (a, b) => { const hi = Math.max(a, b); const lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };
      const verdict = (mean, sd, inkL, minimum) => {
        const busy = sd > 0.14;
        const meanC = lc(mean, inkL);
        const worstC = busy ? Math.min(lc(Math.max(0, mean - sd), inkL), lc(Math.min(1, mean + sd), inkL)) : meanC;
        return {
          ok: meanC >= minimum && (!busy || worstC >= minimum),
          ratio: busy ? Math.min(meanC, worstC) : meanC,
        };
      };
      const hexRGB = (hex) => { const s = hex.replace('#', ''); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };

      const TEXT_MIN = 4.5;
      const MARK_MIN = 3;

      const loadImage = (src) => new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => res(null);
        i.src = src;
      });

      const dimIds = Object.keys(tpl.dimensions);
      const textSlots = (tpl.paintOrder || []).filter((s) => tpl.slots[s]?.present);

      /* THE BOXES, in canvas px, read off the template exactly as the render
         core reads them. Includes the MARK box: the mark is checked at 3.0 and
         it sits in a corner the text never covers, so it can be the binding
         constraint on its own. */
      const boxesFor = (dimId) => {
        const { w, h } = DIMENSIONS[dimId];
        const out = [];
        for (const s of textSlots) {
          const per = slotConstraint(tpl, s, dimId);
          if (!per) continue;
          out.push({ name: s, kind: 'text', x: per.box.x * w, y: per.box.y * h, w: per.box.w * w, h: per.box.h * h });
        }
        const logo = slotConstraint(tpl, 'logo', dimId);
        if (logo) {
          // The mark's true placed rect for each allowed position, at the
          // authored width. Squared off at widthFrac so the sweep does not
          // depend on which asset's aspect ratio happens to load.
          const pad = (logo.pad ?? 0.05) * w;
          const lw = (logo.widthFrac ?? 0.12) * w;
          for (const position of (Array.isArray(tpl.allowedLogoPositions) ? tpl.allowedLogoPositions : [])) {
            const x = position.endsWith('left') ? pad : position.endsWith('center') ? (w - lw) / 2 : w - pad - lw;
            const y = position.startsWith('top') ? pad : h - pad - lw;
            out.push({ name: `logo:${position}`, kind: 'mark', x, y, w: lw, h: lw });
          }
        }
        return out;
      };

      /* The photo's destination rect and source crop — the same `cover`/`contain`
         arithmetic renderTemplate uses. */
      const fitRects = (img, box, fit) => {
        const iw = img.naturalWidth || img.width || 1;
        const ih = img.naturalHeight || img.height || 1;
        if (fit === 'contain') {
          const s = Math.min(box.w / iw, box.h / ih);
          const dw = iw * s; const dh = ih * s;
          return { sx: 0, sy: 0, sw: iw, sh: ih, dx: box.x + (box.w - dw) / 2, dy: box.y + (box.h - dh) / 2, dw, dh };
        }
        const s = Math.max(box.w / iw, box.h / ih);
        const sw = box.w / s; const sh = box.h / s;
        return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh, dx: box.x, dy: box.y, dw: box.w, dh: box.h };
      };

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const pairs = tpl.colourPairs.map((p) => ({
        id: p.id, label: p.label, bg: p.bg, ink: p.ink, klass: p.klass,
        scrimRGB: hexRGB(p.scrimColour || p.bg),
        fieldRGB: hexRGB(p.bg),
        inkL: hexLum(p.ink),
      }));
      // The scrim colour a pair would use = its OWN field colour. That is the
      // ruling; the ladder only decides HOW MUCH of it.
      const markInk = { light: '#254E48', dark: '#F5F6E7' };

      // rows[pairId][alphaIndex] = { textFails, markFails, worstText, worstMark, worstPhoto }
      const acc = {};
      for (const p of pairs) {
        acc[p.id] = ladder.map(() => ({ textFails: 0, markFails: 0, worstText: 99, worstMark: 99, worstTextPhoto: null, worstMarkPhoto: null }));
      }
      const perPhoto = [];
      let missing = 0;

      for (const row of manifest) {
        const img = await loadImage(`/generated/.photo-cache/${row.file}`);
        if (!img) { missing += 1; continue; }

        // Per photo: sample the BARE photo once per box per dimension.
        const samples = []; // { boxKind, r[], g[], b[] }
        for (const dimId of dimIds) {
          const { w, h } = DIMENSIONS[dimId];
          const per = slotConstraint(tpl, 'photo', dimId);
          if (!per) continue;
          canvas.width = w; canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          const pbox = { x: per.box.x * w, y: per.box.y * h, w: per.box.w * w, h: per.box.h * h };
          const r = fitRects(img, pbox, per.fit);
          ctx.save();
          ctx.beginPath(); ctx.rect(pbox.x, pbox.y, pbox.w, pbox.h); ctx.clip();
          ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
          ctx.restore();

          for (const b of boxesFor(dimId)) {
            const bx = Math.max(0, Math.floor(b.x));
            const by = Math.max(0, Math.floor(b.y));
            const bw = Math.min(Math.ceil(b.w), w - bx);
            const bh = Math.min(Math.ceil(b.h), h - by);
            if (!(bw > 0 && bh > 0)) continue;
            const d = ctx.getImageData(bx, by, bw, bh).data;
            const stepX = Math.max(1, Math.floor(bw / 24));
            const stepY = Math.max(1, Math.floor(bh / 24));
            // ALPHA IS KEPT. The render core fills the field colour first and
            // the photo goes over it, so a PNG with transparency composites
            // against that pair's own bg before the scrim ever lands. Dropping
            // near-transparent pixels here would measure a photo the core never
            // paints; carrying alpha reproduces the real stack exactly.
            const R = []; const G = []; const B = []; const A = [];
            for (let py = 0; py < bh; py += stepY) {
              for (let px = 0; px < bw; px += stepX) {
                const i = (py * bw + px) * 4;
                R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); A.push(d[i + 3] / 255);
              }
            }
            if (R.length) samples.push({ dimId, name: b.name, kind: b.kind, R, G, B, A });
          }
        }

        // …then run the whole ladder over those pixels, per pair.
        const rec = { file: row.file, filename: row.filename, pairs: {} };
        for (const p of pairs) {
          const [sr, sg, sb] = p.scrimRGB;
          const [fr, fg, fb] = p.fieldRGB;
          rec.pairs[p.id] = { minTextAlpha: null, minMarkAlpha: null };
          for (const [ai, a] of ladder.entries()) {
            let worstText = 99; let worstMark = 99; let textOk = true; let markOk = true;
            const inv = 1 - a;
            for (const s of samples) {
              const inkL = s.kind === 'mark' ? hexLum(markInk[p.klass]) : p.inkL;
              const minimum = s.kind === 'mark' ? MARK_MIN : TEXT_MIN;
              let sum = 0; let sq = 0;
              const n = s.R.length;
              for (let i = 0; i < n; i += 1) {
                const al = s.A[i]; const ial = 1 - al;
                const L = rgbLum(
                  Math.round((s.R[i] * al + fr * ial) * inv + sr * a),
                  Math.round((s.G[i] * al + fg * ial) * inv + sg * a),
                  Math.round((s.B[i] * al + fb * ial) * inv + sb * a),
                );
                sum += L; sq += L * L;
              }
              const mean = sum / n;
              const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
              const v = verdict(mean, sd, inkL, minimum);
              if (s.kind === 'mark') {
                worstMark = Math.min(worstMark, v.ratio);
                if (!v.ok) markOk = false;
              } else {
                worstText = Math.min(worstText, v.ratio);
                if (!v.ok) textOk = false;
              }
            }
            const cell = acc[p.id][ai];
            if (!textOk) cell.textFails += 1;
            if (!markOk) cell.markFails += 1;
            if (worstText < cell.worstText) { cell.worstText = worstText; cell.worstTextPhoto = row.filename; }
            if (worstMark < cell.worstMark) { cell.worstMark = worstMark; cell.worstMarkPhoto = row.filename; }
            if (textOk && rec.pairs[p.id].minTextAlpha == null) rec.pairs[p.id].minTextAlpha = a;
            if (markOk && rec.pairs[p.id].minMarkAlpha == null) rec.pairs[p.id].minMarkAlpha = a;
          }
        }
        perPhoto.push(rec);
      }

      /* ── THE CROSS-CHECK. The analytic blend is only trustworthy if it agrees
            with the thing that paints. Re-render a sample through the REAL
            render core at each pair's own declared scrim and compare. ───────── */
      const crossCheck = [];
      if (verify) {
        const step = Math.max(1, Math.floor(manifest.length / 12));
        for (let i = 0; i < manifest.length; i += step) {
          const row = manifest[i];
          const img = await loadImage(`/generated/.photo-cache/${row.file}`);
          if (!img) continue;
          for (const p of pairs) {
            const scrim = tpl.slots.photo?.scrim?.[p.id];
            if (!scrim) continue;
            const dimId = dimIds[0];
            const { w, h } = DIMENSIONS[dimId];
            canvas.width = w; canvas.height = h;
            const truth = renderTemplate(ctx, tpl, dimId, {
              eyebrow: 'OUR BELIEF',
              heading: 'Every child is capable of leading their own day',
              body: 'Enrolling now for the autumn term',
              colourPairId: p.id, logoPosition: tpl.allowedLogoPositions[0],
              photoImage: img,
            }, {});
            // The same boxes, computed analytically at the same alpha.
            const analytic = {};
            for (const b of boxesFor(dimId)) {
              if (b.kind !== 'text') continue;
              const per = slotConstraint(tpl, 'photo', dimId);
              const c2 = document.createElement('canvas');
              c2.width = w; c2.height = h;
              const cx2 = c2.getContext('2d', { willReadFrequently: true });
              const pbox = { x: per.box.x * w, y: per.box.y * h, w: per.box.w * w, h: per.box.h * h };
              const r = fitRects(img, pbox, per.fit);
              cx2.fillStyle = p.bg; cx2.fillRect(0, 0, w, h);
              cx2.save(); cx2.beginPath(); cx2.rect(pbox.x, pbox.y, pbox.w, pbox.h); cx2.clip();
              cx2.drawImage(img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh); cx2.restore();
              const bx = Math.max(0, Math.floor(b.x)); const by = Math.max(0, Math.floor(b.y));
              const bw = Math.min(Math.ceil(b.w), w - bx); const bh = Math.min(Math.ceil(b.h), h - by);
              const d = cx2.getImageData(bx, by, bw, bh).data;
              const stepX = Math.max(1, Math.floor(bw / 24)); const stepY = Math.max(1, Math.floor(bh / 24));
              const [sr, sg, sb] = hexRGB(scrim.colour);
              const inv = 1 - scrim.opacity;
              let sum = 0; let sq = 0; let n = 0;
              for (let py = 0; py < bh; py += stepY) {
                for (let px = 0; px < bw; px += stepX) {
                  const i = (py * bw + px) * 4;
                  if (d[i + 3] < 16) continue;
                  const L = rgbLum(
                    Math.round(d[i] * inv + sr * scrim.opacity),
                    Math.round(d[i + 1] * inv + sg * scrim.opacity),
                    Math.round(d[i + 2] * inv + sb * scrim.opacity),
                  );
                  void 0;
                  sum += L; sq += L * L; n += 1;
                }
              }
              const mean = sum / n; const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
              analytic[b.name] = verdict(mean, sd, p.inkL, TEXT_MIN).ratio;
            }
            for (const [slot, r] of Object.entries(truth.backdrop.slots || {})) {
              if (analytic[slot] == null) continue;
              crossCheck.push({
                file: row.file, pair: p.id, slot,
                painted: r.ratio, analytic: Math.round(analytic[slot] * 100) / 100,
              });
            }
          }
        }
      }

      return {
        templateId, ladder, missing,
        pairs: pairs.map((p) => ({ id: p.id, label: p.label, bg: p.bg, ink: p.ink, klass: p.klass })),
        acc, perPhoto, crossCheck, total: perPhoto.length,
        dimIds, textSlots,
      };
    }, { manifest, templateId, ladder, verify });

    /* ── THE REPORT ───────────────────────────────────────────────────────── */
    const r2 = (n) => (Number.isFinite(n) && n < 90 ? Math.round(n * 100) / 100 : null);
    console.log(`\ntemplate ${result.templateId} · ${result.total} photos · dims ${result.dimIds.join(',')} · text slots ${result.textSlots.join(',')}`);
    if (result.missing) console.log(`  (${result.missing} cached photo(s) failed to decode and were skipped)`);

    /* THE PICK. Not merely "nothing fails" — nothing fails WITH MARGIN. The
       cross-check above puts the measurement's own error bar at ~0.12 of a
       contrast ratio, so a rung that lands on 4.51 is inside the noise. The
       chosen rung must clear the floor by MARGIN (default 0.25), which is
       comfortably outside it and also leaves room for a photo slightly outside
       the library's distribution. */
    const margin = Number(flag('margin', '0.25'));
    const chosen = {};
    for (const p of result.pairs) {
      const rows = result.acc[p.id];
      const idx = rows.findIndex((c) => c.textFails === 0 && c.markFails === 0
        && c.worstText >= 4.5 + margin && c.worstMark >= 3 + margin);
      chosen[p.id] = idx >= 0 ? { alpha: result.ladder[idx], idx } : null;
    }
    console.log(`margin over the floors: +${margin} of a contrast ratio`);

    console.log('\nPER-PAIR LADDER  (α · text fails/131 · mark fails/131 · worst text · worst mark)');
    for (const p of result.pairs) {
      console.log(`\n  ${p.label} (${p.id}, ${p.klass}, field ${p.bg}, ink ${p.ink})`);
      const pick = chosen[p.id];
      result.ladder.forEach((a, i) => {
        const c = result.acc[p.id][i];
        // Print the neighbourhood of the decision, not 36 rows of noise.
        const near = pick ? Math.abs(i - pick.idx) <= 3 : i % 4 === 0;
        if (!near) return;
        const mark = pick && i === pick.idx ? ' ←CHOSEN' : '';
        console.log(`    α=${a.toFixed(2)}  text ${String(c.textFails).padStart(3)}  mark ${String(c.markFails).padStart(3)}  worstText ${String(r2(c.worstText)).padStart(5)}  worstMark ${String(r2(c.worstMark)).padStart(5)}${mark}`);
      });
      if (!pick) console.log(`    NO RUNG CLEARS THE LIBRARY on this ladder — see the report note.`);
    }

    console.log('\nCHOSEN TABLE (paste into the template)');
    for (const p of result.pairs) {
      const pick = chosen[p.id];
      if (!pick) { console.log(`  ${p.id}: NONE`); continue; }
      const c = result.acc[p.id][pick.idx];
      const below = pick.idx > 0 ? result.acc[p.id][pick.idx - 1] : null;
      console.log(`  ${p.id.padEnd(8)} colour ${p.bg}  opacity ${pick.alpha.toFixed(2)}  worstText ${r2(c.worstText)}  worstMark ${r2(c.worstMark)}  ·  at α=${below ? result.ladder[pick.idx - 1].toFixed(2) : 'n/a'}: ${below ? `${below.textFails} text + ${below.markFails} mark of ${result.total} fail` : 'n/a'}  ·  worst photo: ${c.worstTextPhoto}`);
    }

    if (result.crossCheck.length) {
      const worst = result.crossCheck.reduce((m, c) => Math.max(m, Math.abs((c.painted ?? 0) - c.analytic)), 0);
      console.log(`\nANALYTIC↔PAINTED CROSS-CHECK: ${result.crossCheck.length} comparisons, max |Δratio| = ${worst.toFixed(3)}`);
      // TOLERANCE, and why it is not zero: the canvas composites in PREMULTIPLIED
      // 8-bit and rounds at every step, while the ladder rounds once. That is a
      // ±1-per-channel disagreement, which at these luminances moves a ratio by
      // ~0.1. It is also exactly why the chosen opacities carry a >= 0.25 ratio
      // margin over the 4.5 floor rather than sitting on it: the margin is
      // larger than the measurement's own error bar.
      if (worst > CROSS_CHECK_TOLERANCE) {
        console.error('  MISMATCH — the analytic blend does not reproduce the render core. Do not trust the ladder.');
        for (const c of result.crossCheck.filter((c) => Math.abs((c.painted ?? 0) - c.analytic) > CROSS_CHECK_TOLERANCE).slice(0, 10)) console.error(`    ${JSON.stringify(c)}`);
        process.exitCode = 1;
      }
    }

    const outFile = join(REPO_ROOT, 'generated', 'backdrop-sweep.json');
    mkdirSync(join(REPO_ROOT, 'generated'), { recursive: true });
    writeFileSync(outFile, JSON.stringify({ chosen, ladder: result.ladder, acc: result.acc, pairs: result.pairs, perPhoto: result.perPhoto }, null, 2));
    console.log(`\nfull data: ${outFile}`);
    if (h.errors.length) { console.error('console/page errors:', h.errors); process.exitCode = 1; }
  } finally {
    await h.close();
  }
}

if (has('cache')) await buildCache();
else await sweep();
