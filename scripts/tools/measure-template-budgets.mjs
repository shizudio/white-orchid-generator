/* ─────────────────────────────────────────────────────────────────────────
   MEASURE TEMPLATE BUDGETS — docs/template-system-spec.md §7.4, §7.1, §11.

     "The charBudget is MEASURED at the floor — how much fits in maxLines at the
      floor size — with a conservative safety margin."
     "The shown budget is the MINIMUM across the dimensions the template
      supports."
     "Budgets must be measured in the canvas render core, never read off Figma."

   Method, per text slot × dimension:
     1. Pin the type at the legibility FLOOR for that dimension (floor.mjs — the
        MIN_FONT_PX basis, never a new number).
     2. Grow a deterministic corpus word by word and re-wrap IN THE RENDER CORE
        (the same autofit/wrap the painter uses) until it exceeds maxLines.
        Record the character count of the longest prefix that still fits.
     3. Repeat across several corpora with different word-length profiles and
        take the MINIMUM — a budget honest for short words only is not honest.
     4. Apply the conservative safety margin (§7.4).
   Then take the cross-dimension minimum (§7.1) and write both into the template
   data, so the tightest dimension is visible rather than buried.

   DETERMINISM: the run measures twice and refuses to write unless the two
   measurements are byte-identical (the fingerprint battery's discipline).

   Usage:  node scripts/tools/measure-template-budgets.mjs [--check] [--template id]
           --check  measure and diff against the baked numbers; write nothing.
   ───────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openHarness, REPO_ROOT } from './template-harness.mjs';

// §7.4 "with a conservative safety margin". 10% off the measured capacity —
// enough to absorb a word-boundary landing badly and a hard break costing part
// of a line, while staying a number a person can check by counting.
export const SAFETY_MARGIN = 0.90;

// Deterministic corpora. Three word-length profiles so the budget is honest for
// the long-word case, not just the friendly one. Fixed forever — a corpus edit
// moves every budget, so treat it like a baseline bump.
const CORPORA = [
  // (a) the brand's own register — short, warm, mostly 3–6 letter words
  'every child leads their own day here with us and we make room for what they want to try next in the garden or at the table and we watch them find it in their own time each day of the week',
  // (b) mixed register with ordinary long words
  'our educators document each discovery so families understand exactly how curiosity becomes confidence throughout the whole enrolment year and beyond into their first classroom experience together',
  // (c) long-word heavy — the pessimistic profile
  'extraordinary developmental observations demonstrate remarkable independence throughout collaborative investigation experiences supporting communication breakthroughs enthusiastically documented consistently',
];

async function measure(page, templateId) {
  return page.evaluate(async ({ templateId }) => {
    const { templateById, DIMENSIONS, slotConstraint, floorPxFor, autofit, autofitTrackedCaps, DEFAULT_FONTS } = window.__wo;
    const CORPORA = window.__CORPORA;
    const tpl = templateById(templateId);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const FONT_ROLE = { title: 'title', subtitle: 'subtitle', body: 'body' };
    const out = {};

    for (const slotName of tpl.paintOrder) {
      const slot = tpl.slots[slotName];
      if (!slot?.present) continue;
      const reg = tpl.registers[slotName];
      const family = DEFAULT_FONTS[FONT_ROLE[reg.face]];
      out[slotName] = {};

      for (const dimId of Object.keys(tpl.dimensions)) {
        const per = slotConstraint(tpl, slotName, dimId);
        if (!per) continue;
        const dim = DIMENSIONS[dimId];
        canvas.width = dim.w; canvas.height = dim.h;
        const box = { x: per.box.x * dim.w, y: per.box.y * dim.h, w: per.box.w * dim.w, h: per.box.h * dim.h };
        const floorPx = floorPxFor(slotName, dim.w, dim.h);
        // Pin the fit at the FLOOR: a box exactly one floor-line tall per
        // declared line, so autofit cannot choose a larger size and flatter itself.
        const floorBox = { ...box, h: per.maxLines * floorPx * reg.lineRatio };

        const fitFor = (text) => (reg.caps
          ? autofitTrackedCaps(ctx, { text, font: family, weight: reg.weight, tracking: reg.tracking ?? 0.08, box: floorBox, maxLines: per.maxLines, floorPx, lineRatio: reg.lineRatio, ceilingPx: Number.isFinite(reg.ceilingScale) ? floorPx * reg.ceilingScale : Infinity })
          : autofit(ctx, { text, fontFor: (s) => `${reg.weight} ${s}px ${family}`, box: floorBox, maxLines: per.maxLines, floorPx, lineRatio: reg.lineRatio, ceilingPx: Number.isFinite(reg.ceilingScale) ? floorPx * reg.ceilingScale : Infinity }));

        // Honest capacity: the copy fits within maxLines AND the type never fell
        // below the floor. Grown word by word, then refined CHARACTER by
        // character into the next word so the answer is a real capacity and not
        // an artefact of where the corpus happens to have a space.
        const fits = (t) => { const f = fitFor(t); return !f.overBudget && f.size >= Math.floor(floorPx); };
        let worst = Infinity;
        for (const corpus of CORPORA) {
          const words = corpus.split(' ');
          let best = 0;
          let text = '';
          let i = 0;
          for (; i < words.length; i += 1) {
            const next = text ? `${text} ${words[i]}` : words[i];
            if (!fits(next)) break;
            best = next.length;
            text = next;
          }
          if (i < words.length) {
            const tail = words[i];
            for (let k = 1; k <= tail.length; k += 1) {
              const next = text ? `${text} ${tail.slice(0, k)}` : tail.slice(0, k);
              if (!fits(next)) break;
              best = next.length;
            }
          }
          if (best < worst) worst = best;
        }
        out[slotName][dimId] = { capacity: worst, floorPx: Math.round(floorPx * 100) / 100, maxLines: per.maxLines, boxW: Math.round(box.w) };
      }
    }
    return out;
  }, { templateId });
}

function applyMargin(raw) {
  const out = {};
  for (const [slot, dims] of Object.entries(raw)) {
    out[slot] = {};
    for (const [dimId, m] of Object.entries(dims)) out[slot][dimId] = Math.max(1, Math.floor(m.capacity * SAFETY_MARGIN));
    out[slot].min = Math.min(...Object.values(out[slot]));
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const idIndex = args.indexOf('--template');
  const templateId = idIndex >= 0 ? args[idIndex + 1] : 'label_headline';

  const h = await openHarness();
  try {
    await h.page.evaluate((c) => { window.__CORPORA = c; }, CORPORA);
    const a = await measure(h.page, templateId);
    const b = await measure(h.page, templateId);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      console.error('NON-DETERMINISTIC measurement — two in-process runs disagreed. Refusing to write.');
      console.error(JSON.stringify({ a, b }, null, 2));
      process.exit(2);
    }
    if (h.errors.length) { console.error('page errors:', h.errors); process.exit(3); }

    const budgets = applyMargin(a);
    console.log('\nRAW CAPACITY AT THE FLOOR (chars, before the %d%% safety margin)', Math.round(SAFETY_MARGIN * 100));
    for (const [slot, dims] of Object.entries(a)) {
      for (const [dimId, m] of Object.entries(dims)) {
        console.log(`  ${slot.padEnd(8)} ${dimId.padEnd(10)} floor ${String(m.floorPx).padStart(6)}px  maxLines ${m.maxLines}  boxW ${String(m.boxW).padStart(4)}  capacity ${m.capacity}`);
      }
    }
    console.log('\nDECLARED BUDGETS (after margin; `min` is the §7.1 cross-dimension minimum)');
    console.log(JSON.stringify(budgets, null, 2));

    const file = join(REPO_ROOT, 'lib', 'templates', `template-${templateId.replace(/_/g, '-')}.mjs`);
    const src = readFileSync(file, 'utf8');
    const block = `// <<<BUDGETS_BEGIN>>>\nexport const MEASURED_BUDGETS = ${JSON.stringify(budgets, null, 2)};\n// <<<BUDGETS_END>>>`;
    const next = src.replace(/\/\/ <<<BUDGETS_BEGIN>>>[\s\S]*?\/\/ <<<BUDGETS_END>>>/, block);
    if (next === src) {
      console.log('\nbudgets unchanged — file already matches the measurement.');
    } else if (checkOnly) {
      console.error('\n--check: baked budgets DIFFER from the measurement (see above). Re-run without --check to regenerate.');
      process.exit(1);
    } else {
      writeFileSync(file, next);
      console.log(`\nwrote ${file}`);
    }
  } finally {
    await h.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
