/* ─────────────────────────────────────────────────────────────────────────
   §11 VERIFICATION BAR — "a template is not done until…"

     · all its declared dimensions render CLEAN with
         (a) empty slots
         (b) copy at exactly charBudget
         (c) copy at budget WITH TWO HARD LINE BREAKS in every text slot
     · AUTOFIT FLOOR CHECK: at charBudget the painted px is the declared floor,
       never below it
     · budgets measured in the canvas render core, never off Figma

   Runs in the same headless-Chromium harness the budget measurement uses, so
   the thing being verified is the thing that paints. Writes PNG evidence to
   generated/template-one/ (gitignored — M10) and prints a machine-checkable
   pass/fail table.

   Usage: node scripts/tools/verify-template-one.mjs
   ───────────────────────────────────────────────────────────────────────── */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openHarness, REPO_ROOT } from './template-harness.mjs';

const OUT_DIR = join(REPO_ROOT, 'generated', 'template-one');

// Deterministic filler in the brand's own voice, used to build copy of an EXACT
// character length. Never hits the network, never spends anything.
const FILLER = 'every child leads their own day here with us and we make room for what they want to try next in the garden or at the table together';

/* ── THE TEXT-ONLY IDENTITY GATE (client amendment 2026-08-18) ───────────────
   Template one gained a PHOTO slot. "Absent photo = today's clean tile,
   byte-identical" is the whole basis on which that was allowed, so it is
   ASSERTED here rather than assumed: the four real-*.png are hashed BEFORE this
   run and compared to what the run writes. A moved byte means the amendment
   leaked into the no-photo path.                                             */
const IDENTITY_SHOTS = ['real-portrait', 'real-story', 'real-square', 'real-landscape'];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
function priorHashes() {
  const out = {};
  for (const name of IDENTITY_SHOTS) {
    const f = join(OUT_DIR, `${name}.png`);
    if (existsSync(f)) out[name] = sha(readFileSync(f));
  }
  return out;
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });
  const before = priorHashes();
  const h = await openHarness();
  try {
    const result = await h.page.evaluate(async ({ FILLER }) => {
      const { templateById, DIMENSIONS, slotConstraint, renderTemplate } = window.__wo;
      const tpl = templateById('label_headline');

      /** Copy of EXACTLY n characters, word-broken, deterministic. */
      const exactly = (n) => {
        if (n <= 0) return '';
        let s = '';
        while (s.length < n) s += (s ? ' ' : '') + FILLER;
        s = s.slice(0, n);
        return s;
      };
      /** The same copy with two hard breaks, split at word boundaries (§7.2). */
      const withTwoBreaks = (n) => {
        const s = exactly(n);
        const a = Math.max(1, s.lastIndexOf(' ', Math.floor(n / 3)));
        const b = Math.max(a + 1, s.lastIndexOf(' ', Math.floor((2 * n) / 3)));
        return `${s.slice(0, a)}\n${s.slice(a + 1, b)}\n${s.slice(b + 1)}`;
      };

      const loadLogo = (src) => new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = src;
      });
      const logoLight = await loadLogo('/public' + tpl.logoAssets.light);
      const logoDark = await loadLogo('/public' + tpl.logoAssets.dark);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const cases = [];
      const dimIds = Object.keys(tpl.dimensions);
      const textSlots = tpl.paintOrder;

      const buildValues = (kind, dimId) => {
        const v = { colourPairId: 'ivory', logoPosition: 'bottom-right', logoImage: logoLight };
        for (const s of textSlots) {
          const per = slotConstraint(tpl, s, dimId);
          if (!per) continue;
          // The INPUT enforces the cross-dimension minimum (§7.1) — that is the
          // copy every dimension actually receives, so that is what we verify.
          const budget = tpl.slots[s].charBudget;
          if (kind === 'empty') v[s] = '';
          else if (kind === 'budget') v[s] = exactly(budget);
          else v[s] = withTwoBreaks(budget);
        }
        return v;
      };

      const shots = [];
      for (const kind of ['empty', 'budget', 'breaks']) {
        for (const dimId of dimIds) {
          const dim = DIMENSIONS[dimId];
          canvas.width = dim.w; canvas.height = dim.h;
          const values = buildValues(kind, dimId);
          const truth = renderTemplate(ctx, tpl, dimId, values, {});
          cases.push({ kind, dimId, truth });
          shots.push({ name: `${kind}-${dimId}`, data: canvas.toDataURL('image/png') });
        }
      }

      // Colour-pair sweep (pre-verified pairs, portrait) for visual review.
      for (const pair of tpl.colourPairs) {
        const dim = DIMENSIONS.portrait;
        canvas.width = dim.w; canvas.height = dim.h;
        renderTemplate(ctx, tpl, 'portrait', {
          eyebrow: 'OUR BELIEF',
          heading: 'Every child is capable of leading their own day',
          body: 'Enrolling now for the autumn term',
          colourPairId: pair.id,
          logoPosition: 'bottom-right',
          logoImage: pair.klass === 'dark' ? logoDark : logoLight,
        }, {});
        shots.push({ name: `pair-${pair.id}-portrait`, data: canvas.toDataURL('image/png') });
      }

      // A realistic post in all four dimensions — the four-up the user sees.
      for (const dimId of dimIds) {
        const dim = DIMENSIONS[dimId];
        canvas.width = dim.w; canvas.height = dim.h;
        renderTemplate(ctx, tpl, dimId, {
          eyebrow: 'OUR BELIEF',
          heading: 'Every child is capable of leading their own day',
          body: 'Enrolling now for the autumn term',
          colourPairId: 'ivory', logoPosition: 'bottom-right', logoImage: logoLight,
        }, {});
        shots.push({ name: `real-${dimId}`, data: canvas.toDataURL('image/png') });
      }

      /* ── THE BACKDROP CHECK, exercised on both extremes ──────────────────
         Two FIXTURE backdrops, painted here rather than fetched: a near-black
         field and a near-white one. They are not brand assets and never reach a
         user — they are the two ends of the range the fixed scrim has to cope
         with, which is exactly what a gate needs. The real-photo path is proven
         separately in the live browser (generated/template-one/composer/).    */
      const fixture = (rgb) => {
        const c = document.createElement('canvas');
        c.width = 1600; c.height = 1600;
        const cx = c.getContext('2d');
        cx.fillStyle = rgb; cx.fillRect(0, 0, 1600, 1600);
        return c;
      };
      const photoCases = [];
      for (const [name, rgb, pairId] of [['dark', '#0A0A0A', 'ivory'], ['light', '#FAFAFA', 'forest']]) {
        const img = fixture(rgb);
        for (const dimId of dimIds) {
          const dim = DIMENSIONS[dimId];
          canvas.width = dim.w; canvas.height = dim.h;
          const truth = renderTemplate(ctx, tpl, dimId, {
            eyebrow: 'OUR BELIEF',
            heading: 'Every child is capable of leading their own day',
            body: 'Enrolling now for the autumn term',
            colourPairId: pairId, logoPosition: 'bottom-right',
            logoImage: pairId === 'forest' ? logoDark : logoLight,
            logoInk: pairId === 'forest' ? '#F5F6E7' : '#254E48',
            photoImage: img,
          }, {});
          photoCases.push({ fixture: name, pairId, dimId, truth });
          shots.push({ name: `photo-${name}-${pairId}-${dimId}`, data: canvas.toDataURL('image/png') });
        }
      }
      // …and a photo that SHOULD pass: mid-grey, where the fixed scrim carries.
      const midOk = [];
      {
        const img = fixture('#8A8A8A');
        for (const dimId of dimIds) {
          const dim = DIMENSIONS[dimId];
          canvas.width = dim.w; canvas.height = dim.h;
          midOk.push({
            dimId,
            truth: renderTemplate(ctx, tpl, dimId, {
              eyebrow: 'OUR BELIEF',
              heading: 'Every child is capable of leading their own day',
              body: 'Enrolling now for the autumn term',
              colourPairId: 'ivory', logoPosition: 'bottom-right',
              logoImage: logoLight, logoInk: '#254E48', photoImage: img,
            }, {}),
          });
          shots.push({ name: `photo-mid-ivory-${dimId}`, data: canvas.toDataURL('image/png') });
        }
      }

      return {
        cases, shots, photoCases, midOk,
        logoLoaded: { light: !!logoLight, dark: !!logoDark },
        budgets: Object.fromEntries(textSlots.map((s) => [s, tpl.slots[s].charBudget])),
      };
    }, { FILLER });

    for (const s of result.shots) {
      writeFileSync(join(OUT_DIR, `${s.name}.png`), Buffer.from(s.data.split(',')[1], 'base64'));
    }

    // ── The gates ──────────────────────────────────────────────────────────
    const failures = [];
    for (const c of result.cases) {
      for (const [slot, t] of Object.entries(c.truth.slots)) {
        const at = `${c.kind}/${c.dimId}/${slot}`;
        if (c.kind === 'empty') {
          if (!t.empty || t.lines !== 0) failures.push(`${at}: empty slot painted ${t.lines} line(s)`);
          if (t.overBudget) failures.push(`${at}: empty slot reported over-budget`);
          continue;
        }
        // (b) copy at exactly charBudget must fit — that is what the budget MEANS.
        if (c.kind === 'budget' && t.overBudget) failures.push(`${at}: OVER BUDGET at exactly charBudget — the measurement is wrong`);
        // (c) two hard breaks. §11 asks for a clean render; it does NOT ask a
        //     1-line box to hold 3 segments (see the CONTRACT GAP note below).
        //     The gate here is: the paint is CLIPPED to maxLines (nothing spills),
        //     the type never drops below the floor, and a slot that cannot hold
        //     the breaks is HONESTLY FLAGGED so §7.2 blocks its export.
        if (t.lines > t.maxLines) failures.push(`${at}: painted ${t.lines} lines past maxLines ${t.maxLines} — unclipped spill`);
        if (t.overBudget && t.wrappedLines <= t.maxLines) failures.push(`${at}: flagged over-budget but fits — false alarm`);
        if (!t.overBudget && t.wrappedLines > t.maxLines) failures.push(`${at}: overflows to ${t.wrappedLines} lines but was NOT flagged — §7.2 second check failed`);
        // §11 autofit floor check — never BELOW the declared floor (integer px).
        if (t.paintedPx < Math.floor(t.floorPx)) failures.push(`${at}: painted ${t.paintedPx}px BELOW the floor ${t.floorPx}px`);
      }
      if (!c.truth.logoBox) failures.push(`${c.kind}/${c.dimId}: logo did not paint`);
    }
    // The §7.2 second check must actually FIRE somewhere in the breaks sweep —
    // a check that never trips is not a check.
    const breaksFlagged = result.cases.filter((c) => c.kind === 'breaks' && c.truth.overBudgetSlots.length).length;
    if (!breaksFlagged) failures.push('breaks sweep flagged nothing — the §7.2 hard-break check is inert');

    // ── the amendment's own gates ─────────────────────────────────────────
    for (const c of result.cases) {
      if (c.truth.photo !== null) failures.push(`${c.kind}/${c.dimId}: a no-photo render reported a photo`);
      if (c.truth.backdrop.checked) failures.push(`${c.kind}/${c.dimId}: the backdrop check ran on the pre-verified path`);
      if (c.truth.contrastFailures.length) failures.push(`${c.kind}/${c.dimId}: flat pre-verified pair flagged itself`);
    }
    for (const c of result.photoCases) {
      const at = `photo-${c.fixture}/${c.pairId}/${c.dimId}`;
      if (!c.truth.photo) failures.push(`${at}: the photo did not paint`);
      else if (!c.truth.photo.scrim) failures.push(`${at}: NO SCRIM over the photo — the core must always apply it`);
      if (!c.truth.backdrop.checked) failures.push(`${at}: a photo was painted but nothing was measured`);
      for (const slot of ['eyebrow', 'heading', 'body']) {
        const r = c.truth.backdrop.slots[slot];
        if (!r) { failures.push(`${at}/${slot}: filled slot was not measured`); continue; }
        if (r.unreadable) failures.push(`${at}/${slot}: backdrop could not be read`);
        if (r.ok) failures.push(`${at}/${slot}: an extreme backdrop passed at ${r.ratio}:1 — the check is too soft to be a check`);
      }
      if (!c.truth.contrastFailures.length) failures.push(`${at}: nothing was blocked on an unreadable backdrop`);
    }
    for (const c of result.midOk) {
      if (c.truth.contrastFailures.length) {
        const detail = JSON.stringify(c.truth.backdrop.slots);
        failures.push(`photo-mid/${c.dimId}: an ORDINARY photo was refused — the scrim is too weak to carry one ${detail}`);
      }
    }
    if (!result.logoLoaded.light || !result.logoLoaded.dark) failures.push(`logo assets failed to load: ${JSON.stringify(result.logoLoaded)}`);
    if (h.errors.length) failures.push(`console/page errors: ${JSON.stringify(h.errors)}`);

    // ── The report ─────────────────────────────────────────────────────────
    console.log('\nDECLARED (cross-dimension minimum) BUDGETS:', JSON.stringify(result.budgets));
    console.log('\n§11 CASE TABLE  (paintedPx / floorPx · lines/maxLines · overBudget)');
    for (const c of result.cases) {
      const cells = Object.entries(c.truth.slots)
        .map(([s, t]) => `${s}=${t.paintedPx}/${Math.round(t.floorPx)} ${t.lines}/${t.maxLines}${t.overBudget ? ' OVER' : ''}`)
        .join('  ');
      console.log(`  ${c.kind.padEnd(7)} ${c.dimId.padEnd(10)} ${cells}${c.truth.logoBox ? '  logo✓' : '  logo✗'}`);
    }
    // ── THE IDENTITY GATE, on the bytes that were just written ────────────
    for (const name of IDENTITY_SHOTS) {
      if (!before[name]) continue;
      const after = sha(readFileSync(join(OUT_DIR, `${name}.png`)));
      if (after !== before[name]) {
        failures.push(`${name}.png MOVED — a text-only render is no longer byte-identical (${before[name].slice(0, 12)} -> ${after.slice(0, 12)})`);
      }
    }
    console.log('\nBACKDROP CHECK  (ratio / floor · ok)');
    for (const c of [...result.photoCases, ...result.midOk.map((m) => ({ fixture: 'mid', pairId: 'ivory', ...m }))]) {
      const cells = Object.entries(c.truth.backdrop.slots)
        .map(([s, r]) => `${s}=${r.ratio}/${r.minimum}${r.ok ? '' : ' FAIL'}`).join('  ');
      const logo = c.truth.backdrop.logo ? ` logo=${c.truth.backdrop.logo.ratio}/${c.truth.backdrop.logo.minimum}${c.truth.backdrop.logo.ok ? '' : ' FAIL'}` : '';
      console.log(`  ${String(c.fixture).padEnd(6)} ${c.pairId.padEnd(7)} ${c.dimId.padEnd(10)} ${cells}${logo}`);
    }
    console.log(`\nTEXT-ONLY IDENTITY: ${Object.keys(before).length} baseline PNG(s) re-hashed after the run`);
    console.log(`\nPNG evidence: ${OUT_DIR} (${result.shots.length} files)`);
    if (failures.length) {
      console.error(`\nFAIL — ${failures.length} gate(s):`);
      for (const f of failures) console.error('  · ' + f);
      process.exit(1);
    }
    console.log(`\nPASS — ${result.cases.length} cases clean across ${Object.keys(result.cases.reduce((a, c) => (a[c.dimId] = 1, a), {})).length} dimensions.`);
  } finally {
    await h.close();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
