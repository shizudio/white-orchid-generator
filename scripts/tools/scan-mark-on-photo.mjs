/* ─────────────────────────────────────────────────────────────────────────
   THE MARK-ON-PHOTO SWEEP — where template three's photo scrim comes from.

   TEMPLATE TWO TAUGHT THIS THE HARD WAY. A mark over an unknown photograph is
   exactly where the §10 backdrop check bites, and template two discovered it
   late, after the geometry was already drawn. Template three puts the mark ON
   the photograph by design (client reference: top-right, on the picture), so
   this runs FIRST and the geometry is authored around what it says.

   ── WHAT IT MEASURES, AND HOW IT DIFFERS FROM scan-library-backdrop.mjs ─────
   That tool sweeps TEXT boxes and the mark for the DEFAULT mark ink implied by
   each pair's colour class. It answers "how heavy must the scrim be for the
   copy to be readable". This one answers a narrower and harder question:

     for EVERY photo in the brand's live library, in EVERY declared dimension,
     at EVERY sanctioned mark position, for EVERY pair, and for BOTH inks the
     sanctioned mark variants actually paint in —
     at what scrim opacity does the mark clear its 3.0 floor on ALL of them?

   BOTH INKS MATTERS. `allowedLogoAssets` lets her swap the mark, and the five
   sanctioned variants paint in exactly two colours (see logo-assets.mjs
   INK_BY_COLOUR). So the matrix is per INK, not per variant: five variants
   collapse to two questions, and reporting five rows would be five copies of
   two answers.

   A combination is TONE-APPROPRIATE when the ink is the one the pair's colour
   class implies (green on a light pair, ivory on a dark one). The off-tone
   combinations are reported too, and they are EXPECTED to fail on a flat
   field — that is the honest refusal Classic already documents, not a defect.

   ── WHY IT IS ANALYTIC, AND WHY THAT IS NOT A SHORTCUT ──────────────────────
   Identical reasoning to scan-library-backdrop.mjs: a scrim is `source-over` at
   a constant alpha, so each destination channel is `round(under*(1-a) + s*a)`
   in 8-bit sRGB, independently. The stack is therefore painted ONCE per box and
   every rung is arithmetic on those same pixels. Two details are carried
   faithfully rather than approximated:
     · the FIELD is painted first and the photo goes over its box, so a mark box
       that straddles the photo's edge is part photo and part flat field — each
       sample carries an `inPhoto` flag and only those pixels take the scrim
     · alpha is kept, so a PNG with transparency composites against the pair's
       own field exactly as the core paints it
   `--verify` re-renders a sample through the REAL renderTemplate at the chosen
   opacity and fails if the analytic ratio and the painted one disagree.

   MONEY LAW: reads the photo cache built by
   `scan-library-backdrop.mjs --cache`. Nothing is generated, nothing spends.

   Usage:
     node scripts/tools/scan-mark-on-photo.mjs [--template caption_band]
                                               [--ladder 0.00:0.90:0.02]
                                               [--margin 0.25] [--verify]
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

/* The same tolerance scan-library-backdrop.mjs uses, for the same reason: the
   canvas composites in premultiplied 8-bit and rounds at every step while the
   ladder rounds once, which moves a ratio by about 0.1. */
const CROSS_CHECK_TOLERANCE = 0.15;

function parseLadder(spec) {
  const [from, to, step] = String(spec).split(':').map(Number);
  const out = [];
  for (let a = from; a <= to + 1e-9; a += step) out.push(Math.round(a * 1000) / 1000);
  return out;
}

async function main() {
  if (!existsSync(MANIFEST)) {
    console.error(`no photo cache at ${CACHE_DIR}. Run once with:\n  node scripts/tools/scan-library-backdrop.mjs --cache   (dev server on :3100 must be up)`);
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const templateId = flag('template', 'caption_band');
  const ladder = parseLadder(flag('ladder', '0.00:0.90:0.02'));
  const margin = Number(flag('margin', '0.25'));
  const verify = has('verify');

  const h = await openHarness();
  try {
    const result = await h.page.evaluate(async ({ manifest, templateId, ladder, verify }) => {
      const { templateById, DIMENSIONS, slotConstraint, renderTemplate } = window.__wo;
      const tpl = templateById(templateId);
      if (!tpl) throw new Error(`no template '${templateId}'`);

      /* ── The contrast maths, verbatim from lib/surface-contrast-policy.mjs.
            CHAN is a 256-entry lookup rather than a pow() per channel: every
            blended value is rounded to an integer before it is measured (the
            canvas does the same), so the table is exact, not an approximation.
            Without it this sweep is minutes rather than seconds. */
      const CHAN = new Float64Array(256);
      for (let v = 0; v < 256; v += 1) {
        const n = v / 255;
        CHAN[v] = n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      }
      const rgbLum = (r, g, b) => 0.2126 * CHAN[r] + 0.7152 * CHAN[g] + 0.0722 * CHAN[b];
      const hexRGB = (hex) => { const s = hex.replace('#', ''); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };
      const hexLum = (hex) => { const [r, g, b] = hexRGB(hex); return rgbLum(r, g, b); };
      const lc = (a, b) => { const hi = Math.max(a, b); const lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };
      const verdict = (mean, sd, inkL, minimum) => {
        const busy = sd > 0.14;
        const meanC = lc(mean, inkL);
        const worstC = busy ? Math.min(lc(Math.max(0, mean - sd), inkL), lc(Math.min(1, mean + sd), inkL)) : meanC;
        return { ok: meanC >= minimum && (!busy || worstC >= minimum), ratio: busy ? Math.min(meanC, worstC) : meanC };
      };
      const MARK_MIN = 3;

      /* THE TWO INKS THE SANCTIONED VARIANTS ACTUALLY PAINT IN. Read off the
         same palette values lib/templates/logo-assets.mjs reads (law 7 — no
         brand literal is invented here; these are the shipped fills). */
      const INKS = [
        { id: 'green', hex: '#254E48', klass: 'light' },
        { id: 'ivory', hex: '#F5F6E7', klass: 'dark' },
      ];

      const loadImage = (src) => new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => res(null);
        i.src = src;
      });
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

      const dimIds = Object.keys(tpl.dimensions);
      const positions = Array.isArray(tpl.allowedLogoPositions) ? tpl.allowedLogoPositions : [];
      const pairs = tpl.colourPairs.map((p) => ({ id: p.id, label: p.label, bg: p.bg, klass: p.klass, scrimRGB: hexRGB(tpl.slots.photo?.scrim?.[p.id]?.colour || p.bg), fieldRGB: hexRGB(p.bg) }));

      /* THE MARK'S PLACED RECT, per position — the same arithmetic
         render-template.mjs `logoRect` uses. SQUARED at widthFrac so the sweep
         does not depend on which asset's aspect ratio happens to load, which
         also makes it the CONSERVATIVE box: taller than any shipped lockup, so
         it samples more of the photograph than the mark really covers. */
      const markRect = (dimId, position) => {
        const { w, h } = DIMENSIONS[dimId];
        const l = slotConstraint(tpl, 'logo', dimId);
        if (!l) return null;
        const pad = (l.pad ?? 0.05) * w;
        const lw = (l.widthFrac ?? 0.12) * w;
        const x = position.endsWith('left') ? pad : position.endsWith('center') ? (w - lw) / 2 : w - pad - lw;
        const y = position.startsWith('top') ? pad : h - pad - lw;
        return { x, y, w: lw, h: lw };
      };

      // acc[dimId][position][pairId][inkId][rung] = { fails, worst, worstPhoto }
      const acc = {};
      for (const dimId of dimIds) {
        acc[dimId] = {};
        for (const position of positions) {
          acc[dimId][position] = {};
          for (const p of pairs) {
            acc[dimId][position][p.id] = {};
            for (const ink of INKS) acc[dimId][position][p.id][ink.id] = ladder.map(() => ({ fails: 0, worst: 99, worstPhoto: null }));
          }
        }
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let missing = 0;
      let photos = 0;

      for (const row of manifest) {
        const img = await loadImage(`/generated/.photo-cache/${row.file}`);
        if (!img) { missing += 1; continue; }
        photos += 1;

        for (const dimId of dimIds) {
          const { w, h } = DIMENSIONS[dimId];
          const per = slotConstraint(tpl, 'photo', dimId);
          if (!per) continue;
          const pbox = { x: per.box.x * w, y: per.box.y * h, w: per.box.w * w, h: per.box.h * h };
          canvas.width = w; canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          const r = fitRects(img, pbox, per.fit);
          ctx.save();
          ctx.beginPath(); ctx.rect(pbox.x, pbox.y, pbox.w, pbox.h); ctx.clip();
          ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
          ctx.restore();

          for (const position of positions) {
            const b = markRect(dimId, position);
            if (!b) continue;
            const bx = Math.max(0, Math.floor(b.x)); const by = Math.max(0, Math.floor(b.y));
            const bw = Math.min(Math.ceil(b.w), w - bx); const bh = Math.min(Math.ceil(b.h), h - by);
            if (!(bw > 0 && bh > 0)) continue;
            const d = ctx.getImageData(bx, by, bw, bh).data;
            const stepX = Math.max(1, Math.floor(bw / 24));
            const stepY = Math.max(1, Math.floor(bh / 24));
            const R = []; const G = []; const B = []; const A = []; const IN = [];
            for (let py = 0; py < bh; py += stepY) {
              for (let px = 0; px < bw; px += stepX) {
                const i = (py * bw + px) * 4;
                R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); A.push(d[i + 3] / 255);
                // Only pixels inside the PHOTO BOX take the scrim — the rest of
                // this rect is flat pre-verified field and the core paints
                // nothing over it.
                const gx = bx + px; const gy = by + py;
                IN.push(gx >= pbox.x && gx < pbox.x + pbox.w && gy >= pbox.y && gy < pbox.y + pbox.h ? 1 : 0);
              }
            }
            const n = R.length;
            if (!n) continue;

            for (const p of pairs) {
              const [sr, sg, sb] = p.scrimRGB;
              const [fr, fg, fb] = p.fieldRGB;
              for (const [ai, a] of ladder.entries()) {
                const inv = 1 - a;
                let sum = 0; let sq = 0;
                for (let i = 0; i < n; i += 1) {
                  const al = A[i]; const ial = 1 - al;
                  // field under the photo's own alpha, then the scrim on top
                  const cr = R[i] * al + fr * ial;
                  const cg = G[i] * al + fg * ial;
                  const cb = B[i] * al + fb * ial;
                  const L = IN[i]
                    ? rgbLum(Math.round(cr * inv + sr * a), Math.round(cg * inv + sg * a), Math.round(cb * inv + sb * a))
                    : rgbLum(Math.round(cr), Math.round(cg), Math.round(cb));
                  sum += L; sq += L * L;
                }
                const mean = sum / n;
                const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
                for (const ink of INKS) {
                  const v = verdict(mean, sd, hexLum(ink.hex), MARK_MIN);
                  const cell = acc[dimId][position][p.id][ink.id][ai];
                  if (!v.ok) cell.fails += 1;
                  if (v.ratio < cell.worst) { cell.worst = v.ratio; cell.worstPhoto = row.filename; }
                }
              }
            }
          }
        }
      }

      /* ── CROSS-CHECK against the thing that paints ─────────────────────────
         The analytic blend is only trustworthy if the REAL render core agrees.
         Re-render a sample of photos at each pair's own declared scrim and
         compare the mark's measured ratio with the analytic one. */
      const crossCheck = [];
      if (verify) {
        const logoLight = await loadImage(`/public${tpl.logoAssets.light}`);
        const logoDark = await loadImage(`/public${tpl.logoAssets.dark}`);
        const motifSrc = tpl.slots.motif?.asset ? `/public/assets/shapes/${tpl.slots.motif.asset}.svg` : null;
        const motifImage = motifSrc ? await loadImage(motifSrc) : null;
        const step = Math.max(1, Math.floor(manifest.length / 12));
        for (let i = 0; i < manifest.length; i += step) {
          const row = manifest[i];
          const img = await loadImage(`/generated/.photo-cache/${row.file}`);
          if (!img) continue;
          for (const p of pairs) {
            const scrim = tpl.slots.photo?.scrim?.[p.id];
            if (!scrim) continue;
            for (const dimId of dimIds) {
              for (const position of positions) {
                const { w, h } = DIMENSIONS[dimId];
                canvas.width = w; canvas.height = h;
                const dark = p.klass === 'dark';
                const truth = renderTemplate(ctx, tpl, dimId, {
                  heading: 'Term 3 places open',
                  pill: 'NOW ENROLLING',
                  colourPairId: p.id,
                  logoPosition: position,
                  logoImage: dark ? logoDark : logoLight,
                  logoInk: dark ? '#F5F6E7' : '#254E48',
                  photoImage: img, motifImage,
                }, {});
                if (!truth.backdrop.logo) continue;
                // The analytic figure for the SAME rect at the SAME alpha.
                const per = slotConstraint(tpl, 'photo', dimId);
                const pbox = { x: per.box.x * w, y: per.box.y * h, w: per.box.w * w, h: per.box.h * h };
                const c2 = document.createElement('canvas');
                c2.width = w; c2.height = h;
                const cx2 = c2.getContext('2d', { willReadFrequently: true });
                cx2.fillStyle = p.bg; cx2.fillRect(0, 0, w, h);
                const rr = fitRects(img, pbox, per.fit);
                cx2.save(); cx2.beginPath(); cx2.rect(pbox.x, pbox.y, pbox.w, pbox.h); cx2.clip();
                cx2.drawImage(img, rr.sx, rr.sy, rr.sw, rr.sh, rr.dx, rr.dy, rr.dw, rr.dh); cx2.restore();
                const b = truth.logoBox;
                const bx = Math.max(0, Math.floor(b.x)); const by = Math.max(0, Math.floor(b.y));
                const bw = Math.min(Math.ceil(b.w), w - bx); const bh = Math.min(Math.ceil(b.h), h - by);
                const d = cx2.getImageData(bx, by, bw, bh).data;
                const stepX = Math.max(1, Math.floor(bw / 24)); const stepY = Math.max(1, Math.floor(bh / 24));
                const [sr, sg, sb] = hexRGB(scrim.colour);
                const inv = 1 - scrim.opacity;
                /* THE PLATE, IF THE TEMPLATE DECLARES ONE. The mark box lies
                   wholly inside its plate, so the plate composites over
                   whatever the scrim left — and modelling it here is what makes
                   this a check on the ARITHMETIC rather than a comparison
                   between two different pictures. (Without it the ladder above
                   is a COUNTERFACTUAL: what the mark would measure if the plate
                   were taken away. That is exactly the number the plate has to
                   justify itself against, which is why the ladder is still run
                   plate-free.) */
                const plateRow = tpl.slots.logo?.plate?.fill?.[p.id] || null;
                const [pr, pg, pb2] = plateRow ? hexRGB(plateRow.colour) : [0, 0, 0];
                const pa = plateRow ? plateRow.opacity : 0;
                const pinv = 1 - pa;
                let sum = 0; let sq = 0; let n = 0;
                for (let py = 0; py < bh; py += stepY) {
                  for (let px = 0; px < bw; px += stepX) {
                    const i = (py * bw + px) * 4;
                    if (d[i + 3] < 16) continue;
                    const gx = bx + px; const gy = by + py;
                    const inP = gx >= pbox.x && gx < pbox.x + pbox.w && gy >= pbox.y && gy < pbox.y + pbox.h;
                    let cr = d[i]; let cg = d[i + 1]; let cb = d[i + 2];
                    if (inP) {
                      cr = cr * inv + sr * scrim.opacity;
                      cg = cg * inv + sg * scrim.opacity;
                      cb = cb * inv + sb * scrim.opacity;
                    }
                    if (plateRow) {
                      cr = Math.round(cr) * pinv + pr * pa;
                      cg = Math.round(cg) * pinv + pg * pa;
                      cb = Math.round(cb) * pinv + pb2 * pa;
                    }
                    const L = rgbLum(Math.round(cr), Math.round(cg), Math.round(cb));
                    sum += L; sq += L * L; n += 1;
                  }
                }
                if (!n) continue;
                const mean = sum / n; const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
                const analytic = verdict(mean, sd, hexLum(p.klass === 'dark' ? '#F5F6E7' : '#254E48'), MARK_MIN).ratio;
                crossCheck.push({ file: row.file, pair: p.id, dimId, position, painted: truth.backdrop.logo.ratio, analytic: Math.round(analytic * 100) / 100 });
              }
            }
          }
        }
      }

      return { templateId, ladder, dimIds, positions, photos, missing, acc, crossCheck, pairs, inks: INKS, hasPlate: !!tpl.slots.logo?.plate };
    }, { manifest, templateId, ladder, verify });

    /* ── THE REPORT ───────────────────────────────────────────────────────── */
    const r2 = (n) => (Number.isFinite(n) && n < 90 ? Math.round(n * 100) / 100 : null);
    console.log(`\ntemplate ${result.templateId} · ${result.photos} photos · dims ${result.dimIds.join(',')} · positions ${result.positions.join(',')}`);
    if (result.missing) console.log(`  (${result.missing} cached photo(s) failed to decode and were skipped)`);
    console.log(`mark floor 3.0, required margin +${margin} of a contrast ratio, on EVERY photo in the library`);
    if (result.hasPlate) {
      console.log('NOTE: this template declares a PLATE behind the mark, so the ladder below is a');
      console.log('      COUNTERFACTUAL — what the mark would measure with the plate taken away. It is');
      console.log('      the number the plate has to justify itself against. What SHIPS is verified');
      console.log('      against the live library in scripts/tools/verify-template-three.mjs --library.');
    }

    /* The pick, per pair × ink × position: the LOWEST rung at which every photo
       in the library clears 3.0 by the margin, in EVERY dimension at once. A
       per-dimension answer would be a template that works in three sizes. */
    const pick = {};
    for (const p of result.pairs) {
      pick[p.id] = {};
      for (const ink of result.inks) {
        pick[p.id][ink.id] = {};
        for (const position of result.positions) {
          const idx = result.ladder.findIndex((_, ai) => result.dimIds.every((d) => {
            const c = result.acc[d][position][p.id][ink.id][ai];
            return c.fails === 0 && c.worst >= 3 + margin;
          }));
          pick[p.id][ink.id][position] = idx >= 0 ? { alpha: result.ladder[idx], idx } : null;
        }
      }
    }

    console.log('\nTHE MATRIX — lowest scrim opacity at which the mark clears on EVERY photo, in EVERY dimension');
    console.log('  (tone = the ink the pair\'s colour class implies; an off-tone mark is EXPECTED to refuse)');
    for (const p of result.pairs) {
      console.log(`\n  ${p.label} (${p.id}, ${p.klass}, field ${p.bg})`);
      for (const ink of result.inks) {
        const tone = ink.klass === p.klass ? 'TONE ' : 'off  ';
        for (const position of result.positions) {
          const got = pick[p.id][ink.id][position];
          const at0 = result.dimIds.map((d) => result.acc[d][position][p.id][ink.id][0]);
          const fails0 = at0.reduce((m, c) => m + c.fails, 0);
          const worst0 = Math.min(...at0.map((c) => c.worst));
          console.log(`    ${tone} ${ink.id.padEnd(6)} ${position.padEnd(10)} `
            + `α=0.00: ${String(fails0).padStart(4)} fail of ${result.photos * result.dimIds.length}, worst ${String(r2(worst0)).padStart(5)}   `
            + (got ? `CLEAN FROM α=${got.alpha.toFixed(2)}` : 'NO RUNG ON THIS LADDER CLEARS IT'));
        }
      }
    }

    console.log('\nPER DIMENSION, at the tone-appropriate ink (fails / worst ratio at a few rungs)');
    for (const p of result.pairs) {
      const ink = result.inks.find((i) => i.klass === p.klass);
      for (const position of result.positions) {
        for (const d of result.dimIds) {
          const row = result.acc[d][position][p.id][ink.id];
          const cells = [0, 0.2, 0.4, 0.6, 0.8].map((a) => {
            const ai = result.ladder.findIndex((x) => Math.abs(x - a) < 1e-6);
            return ai >= 0 ? `α${a.toFixed(1)} ${String(row[ai].fails).padStart(3)}/${String(r2(row[ai].worst)).padStart(5)}` : '';
          }).filter(Boolean);
          console.log(`  ${p.id.padEnd(7)} ${ink.id.padEnd(6)} ${position.padEnd(10)} ${d.padEnd(10)} ${cells.join('  ')}`);
        }
      }
    }

    if (result.crossCheck.length) {
      const worst = result.crossCheck.reduce((m, c) => Math.max(m, Math.abs((c.painted ?? 0) - c.analytic)), 0);
      console.log(`\nANALYTIC↔PAINTED CROSS-CHECK: ${result.crossCheck.length} comparisons, max |Δratio| = ${worst.toFixed(3)}`);
      if (worst > CROSS_CHECK_TOLERANCE) {
        console.error('  MISMATCH — the analytic blend does not reproduce the render core. Do not trust the ladder.');
        for (const c of result.crossCheck.filter((c) => Math.abs((c.painted ?? 0) - c.analytic) > CROSS_CHECK_TOLERANCE).slice(0, 10)) console.error(`    ${JSON.stringify(c)}`);
        process.exitCode = 1;
      }
    }

    const outFile = join(REPO_ROOT, 'generated', `mark-on-photo-${result.templateId}.json`);
    mkdirSync(join(REPO_ROOT, 'generated'), { recursive: true });
    writeFileSync(outFile, JSON.stringify({ pick, ...result }, null, 2));
    console.log(`\nfull data: ${outFile}`);
    if (h.errors.length) { console.error('console/page errors:', h.errors); process.exitCode = 1; }
  } finally {
    await h.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
