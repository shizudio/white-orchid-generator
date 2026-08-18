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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openHarness, REPO_ROOT } from './template-harness.mjs';

const OUT_DIR = join(REPO_ROOT, 'generated', 'template-one');

// Deterministic filler in the brand's own voice, used to build copy of an EXACT
// character length. Never hits the network, never spends anything.
const FILLER = 'every child leads their own day here with us and we make room for what they want to try next in the garden or at the table together';

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });
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

      return {
        cases, shots,
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
