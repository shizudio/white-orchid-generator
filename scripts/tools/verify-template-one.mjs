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

      /* ── THE BACKDROP CHECK, AND WHAT THE PER-PAIR OPACITIES DID TO IT ───
         (client ruling 2026-08-18 — PER-PAIR SCRIMS)

         This block used to assert that two extreme fixtures FAILED — "a check
         that never trips is not a check". At the opacities the client asked for
         (0.75 / 0.90 / 0.88 / 0.79, all MEASURED so that no photo in the library
         breaks the floor) that assertion is no longer true, and pretending
         otherwise would be the lie. So the gate is RESTATED, not deleted:

         · A scrim at opacity a leaves the photo contributing (1-a) of every
           channel. The WORST photo a pair can be handed is therefore a FLAT
           field at the extreme nearest its ink — pure black under a dark-ink
           pair, pure white under a light-ink one. Nothing an image can contain
           lands outside that, and the busy/variance term cannot either, because
           mean±sd is bounded by the sample min/max.
         · So this now measures THE BOUND: the ink-nearest extreme, per pair.
           If it clears 4.5, no photograph can push that pair below 4.5, and the
           scrim is proven sufficient by bound rather than by sampling.
         · Passing that bound means the TEXT refusal is unreachable for this
           template. That is a real consequence of the ruling and it is reported
           in the table below rather than hidden — but the refusal MACHINERY is
           still live and still reachable, so two gates below prove it:
           an unreadable (tainted) backdrop, and a mark swapped to an ink its
           own field cannot carry.

         The fixtures are painted here, never fetched — they are not brand
         assets and never reach a user. The real-library path is measured by
         scripts/tools/scan-library-backdrop.mjs (131 photos, 0 failures at
         these opacities) and in the live browser (generated/template-one/composer/). */
      const flat = (rgb) => {
        const c = document.createElement('canvas');
        c.width = 1600; c.height = 1600;
        const cx = c.getContext('2d');
        cx.fillStyle = rgb; cx.fillRect(0, 0, 1600, 1600);
        return c;
      };
      /* A hard black/white bar field — the highest-variance image that exists.
         It exercises the `busy` branch of the verdict, which is the only path
         that can report a ratio BELOW the flat-extreme bound. */
      const bars = (period) => {
        const c = document.createElement('canvas');
        c.width = 1600; c.height = 1600;
        const cx = c.getContext('2d');
        for (let y = 0; y < 1600; y += period) {
          cx.fillStyle = (Math.floor(y / period) % 2) ? '#FFFFFF' : '#000000';
          cx.fillRect(0, y, 1600, period);
        }
        return c;
      };

      const copy = {
        eyebrow: 'OUR BELIEF',
        heading: 'Every child is capable of leading their own day',
        body: 'Enrolling now for the autumn term',
      };
      const markFor = (klass) => (klass === 'dark' ? logoDark : logoLight);
      const inkFor = (klass) => (klass === 'dark' ? '#F5F6E7' : '#254E48');

      /* THE BOUND, per pair, in every dimension. `worstFixture` is the extreme
         NEAREST that pair's ink — which is the only extreme that can hurt it. */
      const boundCases = [];
      for (const pair of tpl.colourPairs) {
        const worstFixture = pair.klass === 'dark' ? '#FFFFFF' : '#000000';
        for (const [fixName, img] of [['bound', flat(worstFixture)], ['bars4', bars(4)], ['bars80', bars(80)]]) {
          for (const dimId of dimIds) {
            const dim = DIMENSIONS[dimId];
            canvas.width = dim.w; canvas.height = dim.h;
            const truth = renderTemplate(ctx, tpl, dimId, {
              ...copy, colourPairId: pair.id, logoPosition: 'bottom-right',
              logoImage: markFor(pair.klass), logoInk: inkFor(pair.klass),
              photoImage: img,
            }, {});
            boundCases.push({ fixture: fixName, extreme: worstFixture, pairId: pair.id, dimId, truth });
            if (dimId === 'portrait') shots.push({ name: `photo-${fixName}-${pair.id}-${dimId}`, data: canvas.toDataURL('image/png') });
          }
        }
      }

      /* AN ORDINARY PHOTO must simply work, on EVERY pair — that is the client's
         actual ask ("all 4 background colours fully accessible with image"). */
      const midOk = [];
      {
        const img = flat('#8A8A8A');
        for (const pair of tpl.colourPairs) {
          for (const dimId of dimIds) {
            const dim = DIMENSIONS[dimId];
            canvas.width = dim.w; canvas.height = dim.h;
            midOk.push({
              pairId: pair.id, dimId,
              truth: renderTemplate(ctx, tpl, dimId, {
                ...copy, colourPairId: pair.id, logoPosition: 'bottom-right',
                logoImage: markFor(pair.klass), logoInk: inkFor(pair.klass), photoImage: img,
              }, {}),
            });
            if (dimId === 'portrait') shots.push({ name: `photo-mid-${pair.id}-portrait`, data: canvas.toDataURL('image/png') });
          }
        }
      }

      /* THE REFUSAL IS STILL REACHABLE — proven, not asserted.
         An ivory mark on the ivory field is a legal pick out of
         `allowedLogoAssets` and a hopeless one. Nothing substitutes it (M3);
         the check measures it and the surface refuses. */
      const refusalCases = [];
      for (const [name, pairId, ink] of [['ivory-mark-on-ivory', 'ivory', '#F5F6E7'], ['green-mark-on-forest', 'forest', '#254E48']]) {
        const dim = DIMENSIONS.portrait;
        canvas.width = dim.w; canvas.height = dim.h;
        const truth = renderTemplate(ctx, tpl, 'portrait', {
          ...copy, colourPairId: pairId, logoPosition: 'bottom-right',
          logoImage: pairId === 'forest' ? logoLight : logoDark, logoInk: ink,
        }, {});
        refusalCases.push({ name, pairId, truth });
      }

      /* …and the UNREADABLE path: a cross-origin-tainted canvas cannot be
         sampled, and an unverifiable photo is refused exactly like a failing
         one. Simulated at the primitive, since the harness has no remote host. */
      const tainted = (() => {
        const c = document.createElement('canvas');
        c.width = 100; c.height = 100;
        const cx = c.getContext('2d');
        const real = cx.getImageData.bind(cx);
        cx.getImageData = () => { throw new Error('tainted'); };
        const r = window.__wo.checkInkOnBackdrop(cx, { x: 0, y: 0, w: 100, h: 100 }, '#254E48', 100, 100, 4.5);
        cx.getImageData = real;
        return r;
      })();

      /* EVERY PAIR MUST STILL LOOK LIKE ITSELF BEHIND A PHOTO. This is the
         client's report in gate form: keyed by colour CLASS, ivory/sage/blush
         produced IDENTICAL pixels. Keyed by pair they must all differ. */
      const pairFingerprints = [];
      {
        const img = flat('#8A8A8A');
        for (const pair of tpl.colourPairs) {
          const dim = DIMENSIONS.portrait;
          canvas.width = dim.w; canvas.height = dim.h;
          renderTemplate(ctx, tpl, 'portrait', {
            ...copy, colourPairId: pair.id, logoPosition: 'bottom-right',
            logoImage: markFor(pair.klass), photoImage: img,
          }, {});
          pairFingerprints.push({ pairId: pair.id, data: canvas.toDataURL('image/png') });
        }
      }

      return {
        cases, shots, boundCases, midOk, refusalCases, tainted, pairFingerprints,
        scrim: tpl.slots.photo.scrim,
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
    /* ── EVERY PAIR MUST DECLARE ITS OWN SCRIM (client ruling 2026-08-18) ─── */
    for (const pair of ['ivory', 'sage', 'blush', 'forest']) {
      const row = result.scrim?.[pair];
      if (!row) { failures.push(`scrim.${pair}: missing — every declared pair must carry its own scrim`); continue; }
      if (!(row.opacity > 0 && row.opacity <= 1)) failures.push(`scrim.${pair}.opacity: ${row.opacity} is not a usable opacity`);
    }

    /* ── THE BOUND. The extreme nearest each pair's ink must CLEAR the floor.
          Clearing it is the proof that no photograph can break that pair, which
          is what "all four colours are fully accessible with an image" means. */
    let barsTripped = 0;
    for (const c of result.boundCases) {
      const at = `${c.fixture}(${c.extreme})/${c.pairId}/${c.dimId}`;
      if (!c.truth.photo) failures.push(`${at}: the photo did not paint`);
      else if (!c.truth.photo.scrim) failures.push(`${at}: NO SCRIM over the photo — the core must always apply it`);
      if (!c.truth.backdrop.checked) failures.push(`${at}: a photo was painted but nothing was measured`);
      for (const slot of ['eyebrow', 'heading', 'body']) {
        const r = c.truth.backdrop.slots[slot];
        if (!r) { failures.push(`${at}/${slot}: filled slot was not measured`); continue; }
        if (r.unreadable) failures.push(`${at}/${slot}: backdrop could not be read`);
        if (r.ok) continue;
        if (c.fixture === 'bound') {
          // THE BOUND MUST PASS. A flat field at the extreme nearest the ink is
          // the darkest/lightest MEAN any image can produce; if that clears the
          // floor, no ordinary photograph can push this pair's mean below it.
          failures.push(`${at}/${slot}: the flattest worst case measures ${r.ratio}:1 — below the ${r.minimum} floor, so this pair is not honestly photo-capable at its declared opacity`);
        } else {
          // A BAR FIELD IS ALLOWED TO FAIL — and something must, or the check is
          // decorative. Hard black/white bars are not a photograph; they are the
          // structured, high-variance case that survives the wash, which is
          // exactly the case the runtime check exists for. The 131 real photos
          // in the library all pass (scan-library-backdrop.mjs); this does not.
          barsTripped += 1;
        }
      }
      const lg = c.truth.backdrop.logo;
      if (lg && !lg.ok && c.fixture === 'bound') failures.push(`${at}/mark: the default mark measures ${lg.ratio}:1 against the flattest worst case — below ${lg.minimum}`);
    }
    /* ── "A CHECK THAT NEVER TRIPS IS NOT A CHECK" — where that stands now ──
       At the SHIPPED opacities (client ruling 2026-08-18: ivory raised to 0.82
       because the measured minimum still read too thin), no image at all can
       make the TEXT fail on any pair — not a library photo, not a flat black
       card, not a hard black/white bar field. That is the price of the heavier
       wash and it is REPORTED, in the run's headline and in the template's own
       comment, rather than left to be discovered later. The text arm of the
       backdrop check has become a bake-time proof that happens to run at
       runtime; it is not a guard on this template any more.

       What is NOT allowed is for the whole check to go decorative. The MARK arm
       (3.0, and a sanctioned mark can genuinely be wrong for its field) and the
       UNREADABLE arm (a tainted canvas is refused, never passed) must both stay
       live, and they are gated below. If every arm ever goes quiet, this fails. */
    const textArmReachable = barsTripped > 0;

    /* ── AN ORDINARY PHOTO, ON ALL FOUR PAIRS. The client's literal ask. ──── */
    for (const c of result.midOk) {
      if (c.truth.contrastFailures.length) {
        failures.push(`photo-mid/${c.pairId}/${c.dimId}: an ORDINARY photo was refused on a pair the client expects to work — ${JSON.stringify(c.truth.backdrop.slots)}`);
      }
    }

    /* ── THE REFUSAL IS STILL REACHABLE. Two live paths prove the machinery is
          not decorative even though the TEXT bound is now unreachable. ─────── */
    for (const c of result.refusalCases) {
      if (!c.truth.backdrop.logo) { failures.push(`refusal/${c.name}: the mark was not measured at all`); continue; }
      if (c.truth.backdrop.logo.ok || !c.truth.contrastFailures.includes('logo')) {
        failures.push(`refusal/${c.name}: a mark that vanishes into its own field was NOT refused (${c.truth.backdrop.logo.ratio}:1) — the check has gone decorative`);
      }
    }
    if (!result.tainted?.unreadable || result.tainted.ok) {
      failures.push(`refusal/tainted: an unreadable backdrop must refuse, got ${JSON.stringify(result.tainted)}`);
    }
    const markArmReachable = result.refusalCases.every((c) => c.truth.contrastFailures.includes('logo'));
    const unreadableArmReachable = !!result.tainted?.unreadable && !result.tainted.ok;
    if (!textArmReachable && !markArmReachable && !unreadableArmReachable) {
      failures.push('EVERY arm of the backdrop check is now unreachable — it has gone decorative and must not ship as a check');
    }

    /* ── AND EVERY PAIR MUST STILL BE ITSELF BEHIND A PHOTO. This is the whole
          bug, in gate form: three `light` pairs used to render byte-identical. */
    {
      const seen = new Map();
      for (const f of result.pairFingerprints) {
        const digest = sha(Buffer.from(f.data.split(',')[1], 'base64'));
        if (seen.has(digest)) failures.push(`pair ${f.pairId} renders BYTE-IDENTICAL to ${seen.get(digest)} behind the same photo — the scrim is not carrying the pair's own colour`);
        seen.set(digest, f.pairId);
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
    console.log('\nBACKDROP CHECK — WHICH ARMS CAN STILL REFUSE');
    console.log(`  text  (4.5, over the photo)      ${textArmReachable ? 'REACHABLE' : 'UNREACHABLE at the shipped opacities — a bake-time proof, not a guard'}`);
    console.log(`  mark  (3.0, a wrong variant)     ${markArmReachable ? 'REACHABLE' : 'UNREACHABLE'}`);
    console.log('  unreadable (tainted canvas)      ' + (unreadableArmReachable ? 'REACHABLE' : 'UNREACHABLE'));

    console.log('\nPER-PAIR SCRIM (declared)');
    for (const [id, row] of Object.entries(result.scrim || {})) {
      console.log(`  ${id.padEnd(7)} ${row.colour}  opacity ${row.opacity}  · the photo keeps ${Math.round((1 - row.opacity) * 100)}% of every pixel`);
    }
    console.log('\nBACKDROP CHECK  (ratio / floor · portrait row shown for each pair)');
    const shown = [
      ...result.boundCases.filter((c) => c.dimId === 'portrait').map((c) => ({ tag: c.fixture, ...c })),
      ...result.midOk.filter((c) => c.dimId === 'portrait').map((c) => ({ tag: 'mid', ...c })),
    ];
    for (const c of shown) {
      const cells = Object.entries(c.truth.backdrop.slots)
        .map(([s, r]) => `${s}=${r.ratio}/${r.minimum}${r.ok ? '' : ' FAIL'}`).join('  ');
      const logo = c.truth.backdrop.logo ? ` logo=${c.truth.backdrop.logo.ratio}/${c.truth.backdrop.logo.minimum}${c.truth.backdrop.logo.ok ? '' : ' FAIL'}` : '';
      console.log(`  ${String(c.tag).padEnd(7)} ${c.pairId.padEnd(7)} ${cells}${logo}`);
    }
    console.log(`\nREFUSAL STILL REACHABLE  (text: ${result.boundCases.filter((c) => c.fixture !== 'bound').reduce((n, c) => n + Object.values(c.truth.backdrop.slots).filter((r) => !r.ok).length, 0)} high-variance box(es) refused across the bar fixtures)`);
    for (const c of result.refusalCases) {
      console.log(`  ${c.name.padEnd(22)} mark ${c.truth.backdrop.logo?.ratio}/${c.truth.backdrop.logo?.minimum} ${c.truth.backdrop.logo?.ok ? 'pass' : 'REFUSED ✓'}`);
    }
    console.log(`  ${'tainted canvas'.padEnd(22)} unreadable=${result.tainted?.unreadable} ok=${result.tainted?.ok}`);
    console.log('\nPAIR DISTINCTNESS BEHIND ONE PHOTO (sha256 of the painted tile)');
    for (const f of result.pairFingerprints) {
      console.log(`  ${f.pairId.padEnd(7)} ${sha(Buffer.from(f.data.split(',')[1], 'base64')).slice(0, 16)}`);
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
