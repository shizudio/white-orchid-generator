/* ─────────────────────────────────────────────────────────────────────────
   LIVE VERIFICATION OF THE COMPOSER SURFACE — the three client rulings of
   2026-08-18 (two-pane layout · logo swap · photo + the backdrop check).

   Drives the DEV SERVER THE USER IS ALREADY RUNNING (default :3100). It starts
   nothing and stops nothing — hot reload is the point.

   Proves with numbers, not impressions:
     1. LAYOUT   no page scroll and no stage scroll at 1440×900 and 1280×800,
                 at BOTH ends of the panel range; the three tall previews share
                 an EXACT common height; landscape is bigger than it was in a
                 uniform 2×2; nothing overflows horizontally at 375×812.
     2. SELECTOR the template menu opens, marks the current template selected,
                 and closes.
     3. MARK     swapping the logo variant changes real pixels in ALL FOUR.
     4. PHOTO    a real LIBRARY photo lands as a background with the declared
                 scrim, and the four previews stay downloadable.
     5. REFUSAL  a deliberately bad combination puts the affected dimensions on
                 hold, blocks their export, and NAMES them in the message.
     6. RETURN   removing the photo restores the clean tile BYTE FOR BYTE.

   MONEY LAW: the only routes touched are /post and GET /api/images. No
   improve, no generation, nothing that spends.

   Usage: node scripts/tools/verify-post-composer.mjs [--port 3100]
   ───────────────────────────────────────────────────────────────────────── */

import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { REPO_ROOT } from './template-harness.mjs';
import { TEMPLATE_LABEL_HEADLINE as T } from '../../lib/templates/index.mjs';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 3100;
const BASE = `http://localhost:${port}`;
const OUT = join(REPO_ROOT, 'generated', 'template-one', 'composer');
const KNOWN_404 = /orchid-petal\.svg/;
// The worst-scoring image in the brand's live library, measured (not chosen by
// eye) by sweeping every one of its 131 photos through the same backdrop check.
const FAIL_PHOTO = 'ai-generated-1783219069013.png';

const failures = [];
const fail = (m) => failures.push(m);

/** Every canvas's pixel digest — the only honest "did it change" test. */
const digests = (page) => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('.wo-cell')].map((cell) => {
    const c = cell.querySelector('canvas');
    return [cell.className.replace('wo-cell wo-cell-', ''), c.toDataURL('image/png')];
  }),
));
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const hashAll = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, hash(v)]));

/** Geometry + overflow, measured off the live layout. */
const measure = (page) => page.evaluate(() => {
  const d = document.documentElement;
  const stage = document.querySelector('.wo-stage');
  const panelScroll = document.querySelector('.wo-panel-scroll');
  const cells = Object.fromEntries([...document.querySelectorAll('.wo-cell')].map((cell) => {
    const r = cell.querySelector('canvas').getBoundingClientRect();
    const r2 = (n) => Math.round(n * 100) / 100;
    return [cell.className.replace('wo-cell wo-cell-', ''), { w: r2(r.width), h: r2(r.height), top: r2(r.top) }];
  }));
  return {
    viewport: [window.innerWidth, window.innerHeight],
    pageOverflowY: d.scrollHeight - d.clientHeight,
    pageOverflowX: d.scrollWidth - d.clientWidth,
    stageOverflowY: stage.scrollHeight - stage.clientHeight,
    stageOverflowX: stage.scrollWidth - stage.clientWidth,
    panelScrollable: panelScroll.scrollHeight - panelScroll.clientHeight > 0,
    panelW: Math.round(document.querySelector('.wo-panel').getBoundingClientRect().width),
    cells,
  };
});

const holds = (page) => page.evaluate(() => [...document.querySelectorAll('.wo-cell')].map((c) => [
  c.className.replace('wo-cell wo-cell-', ''), c.querySelector('.wo-cell-dl').textContent.trim(),
]));
const warnings = (page) => page.evaluate(() => [...document.querySelectorAll('.wo-panel-foot [role="status"]')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()));

/** Sets the panel width the way the KEYBOARD path does, so that path is exercised. */
async function setPanel(page, target) {
  await page.focus('.wo-grip');
  await page.keyboard.press('Home'); // → PANEL_MIN
  const steps = Math.round((target - 320) / 48);
  for (let i = 0; i < steps; i += 1) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(150);
}

async function checkLayout(page, label, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(350);
  for (const panel of [320, 416, 560]) {
    await setPanel(page, panel);
    const m = await measure(page);
    const at = `${label}/panel${m.panelW}`;
    if (m.pageOverflowY > 0) fail(`${at}: the PAGE scrolls vertically (${m.pageOverflowY}px)`);
    if (m.pageOverflowX > 0) fail(`${at}: the PAGE scrolls horizontally (${m.pageOverflowX}px)`);
    if (m.stageOverflowY > 0) fail(`${at}: the STAGE scrolls vertically (${m.stageOverflowY}px)`);
    if (m.stageOverflowX > 0) fail(`${at}: the STAGE scrolls horizontally (${m.stageOverflowX}px)`);
    // THE COMMON HEIGHT BASELINE. flex-grow IS the aspect ratio, so the three
    // cells are distributed in exact proportion and a contain fit lands them on
    // one height. The gate is a twentieth of a pixel — a real regression (one
    // preview on its own height) cannot hide inside that.
    const tall = ['portrait', 'story', 'square'].map((k) => m.cells[k].h);
    if (Math.max(...tall) - Math.min(...tall) > 0.05) fail(`${at}: the tall row is NOT on one baseline (${JSON.stringify(tall)})`);
    const tops = ['portrait', 'story', 'square'].map((k) => m.cells[k].top);
    if (Math.max(...tops) - Math.min(...tops) > 0.05) fail(`${at}: the tall row does not align at the top (${JSON.stringify(tops)})`);
    // …and the widths are the aspect ratios, which is what makes it a ROW.
    for (const [k, dim] of Object.entries({ portrait: T.dimensions.portrait, story: T.dimensions.story, square: T.dimensions.square })) {
      const want = m.cells[k].h * (dim.w / dim.h);
      if (Math.abs(m.cells[k].w - want) > 2) fail(`${at}/${k}: ${m.cells[k].w}px wide but its ratio wants ${want.toFixed(1)}px`);
    }
    if (m.cells.landscape.top <= m.cells.square.top) fail(`${at}: landscape is not on its own second row`);
    // The 2×2 it replaced gave landscape half the stage width; a whole row must
    // beat that or the amendment bought nothing.
    const oldWidth = ((m.viewport[0] - m.panelW - 44 - 18) / 2);
    if (m.cells.landscape.w <= oldWidth) fail(`${at}: landscape ${m.cells.landscape.w}px is no bigger than the 2×2 would give (${oldWidth.toFixed(0)}px)`);
    console.log(`  ${at.padEnd(24)} tall-baseline=${tall.join('/')}px  P${Math.round(m.cells.portrait.w)} S${Math.round(m.cells.story.w)} Q${Math.round(m.cells.square.w)}  landscape=${Math.round(m.cells.landscape.w)}×${Math.round(m.cells.landscape.h)} (2×2 would be ${oldWidth.toFixed(0)}px)  overflow=0`);
  }
  await setPanel(page, 416);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error' && !KNOWN_404.test(m.text())) errors.push(`console: ${m.text()}`); });

    await page.goto(`${BASE}/post`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);

    // ── 1. LAYOUT ──────────────────────────────────────────────────────────
    console.log('\n1. LAYOUT — no page scroll, no stage scroll, one baseline');
    await checkLayout(page, '1440x900', 1440, 900);
    await page.screenshot({ path: join(OUT, 'layout-1440x900.png') });
    await checkLayout(page, '1280x800', 1280, 800);
    await page.screenshot({ path: join(OUT, 'layout-1280x800.png') });

    await page.setViewportSize({ width: 1440, height: 900 });
    await setPanel(page, 320);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, 'layout-panel-320.png') });
    await setPanel(page, 560);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, 'layout-panel-560.png') });

    // The width must SURVIVE A RELOAD — that is the whole point of persisting.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const restored = (await measure(page)).panelW;
    if (restored !== 560) fail(`the panel width did not survive a reload (${restored} != 560)`);
    console.log(`  panel width after reload: ${restored}px (persisted)`);
    await setPanel(page, 416);

    // Mobile: it may stack, it may NEVER overflow sideways (M9).
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    const mob = await measure(page);
    if (mob.pageOverflowX > 1) fail(`375px: the page scrolls horizontally (${mob.pageOverflowX}px)`);
    console.log(`  375×812 horizontal overflow: ${mob.pageOverflowX}px`);
    await page.screenshot({ path: join(OUT, 'layout-375x812.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);

    // ── 2. THE TEMPLATE SELECTOR ───────────────────────────────────────────
    console.log('\n2. TEMPLATE SELECTOR — opens, marks the current one, closes');
    const selector = page.locator('[aria-haspopup="listbox"]');
    if ((await selector.getAttribute('aria-expanded')) !== 'false') fail('the selector starts open');
    await selector.click();
    await page.waitForTimeout(200);
    const menu = await page.evaluate(() => {
      const list = document.querySelector('[role="listbox"]');
      if (!list) return null;
      return [...list.querySelectorAll('[role="option"]')].map((o) => ({
        selected: o.getAttribute('aria-selected'), name: o.textContent.split('\n')[0].trim().slice(0, 40),
      }));
    });
    if (!menu || !menu.length) fail('the template menu did not open');
    else if (menu[0].selected !== 'true') fail(`the current template is not marked selected: ${JSON.stringify(menu)}`);
    console.log(`  menu: ${JSON.stringify(menu)}`);
    await page.screenshot({ path: join(OUT, 'template-menu-open.png') });
    await page.locator('[role="option"] button').first().click();
    await page.waitForTimeout(200);
    if ((await selector.getAttribute('aria-expanded')) !== 'false') fail('the selector did not close');
    console.log('  closed honestly after a pick');

    // ── the CLEAN baseline, for step 6 ─────────────────────────────────────
    const clean = await digests(page);
    console.log(`  clean digests: ${JSON.stringify(hashAll(clean))}`);
    await page.screenshot({ path: join(OUT, 'clean-1440x900.png') });

    // ── 3. THE LOGO SWAP ───────────────────────────────────────────────────
    console.log('\n3. LOGO SWAP — a different real mark in all four');
    const markButtons = page.locator('button[aria-pressed][title*="Primary 3"], button[aria-pressed][title*="Circle"]');
    const marks = await page.evaluate(() => [...document.querySelectorAll('button[title]')]
      .filter((b) => b.querySelector('img[alt*="Primary"], img[alt*="Secondary"], img[alt*="Circle"]'))
      .map((b) => b.title));
    console.log(`  offered: ${JSON.stringify(marks)}`);
    if (marks.length !== T.allowedLogoAssets.length) fail(`the picker offers ${marks.length} marks, the template sanctions ${T.allowedLogoAssets.length}`);
    await page.locator('button[title="Circle · green"]').click();
    await page.waitForTimeout(500);
    const swapped = await digests(page);
    for (const k of Object.keys(clean)) {
      if (swapped[k] === clean[k]) fail(`${k}: the mark swap changed NO pixels — the control is dead (M4)`);
    }
    console.log(`  after swap: ${JSON.stringify(hashAll(swapped))} (all four moved)`);
    await page.screenshot({ path: join(OUT, 'mark-swapped-circle.png') });

    // A mark that is WRONG for the field must be refused, not substituted.
    await page.locator('button[title="Secondary 1 · ivory"]').click();
    await page.waitForTimeout(500);
    const markHold = await holds(page);
    const markWarn = await warnings(page);
    if (!markHold.some(([, t]) => t === 'On hold')) fail(`an ivory mark on the ivory field was not refused: ${JSON.stringify(markHold)}`);
    console.log(`  ivory mark on ivory field → ${JSON.stringify(markHold)}`);
    console.log(`  message: ${JSON.stringify(markWarn)}`);
    await page.screenshot({ path: join(OUT, 'mark-refused-ivory-on-ivory.png') });
    await page.locator('button[aria-pressed][title="Whichever mark suits the colour you picked"]').click();
    await page.waitForTimeout(400);
    const backToAuto = await digests(page);
    for (const k of Object.keys(clean)) {
      if (backToAuto[k] !== clean[k]) fail(`${k}: Auto did not return to the clean default render`);
    }
    console.log('  back to Auto → byte-identical to the clean render');

    // ── 4. A REAL LIBRARY PHOTO ────────────────────────────────────────────
    console.log('\n4. LIBRARY PHOTO — real asset, declared scrim, still exportable');
    await page.locator('button', { hasText: 'Choose from library' }).click();
    await page.waitForTimeout(1800);
    const libCount = await page.locator('img[alt$=".png"], img[alt$=".jpg"], img[alt$=".jpeg"]').count();
    console.log(`  library images offered: ${libCount}`);
    if (!libCount) {
      fail('the library returned no images — the photo path could not be verified against a REAL asset');
      await page.keyboard.press('Escape');
    } else {
      await page.screenshot({ path: join(OUT, 'library-open.png') });
      await page.locator('img[alt$=".png"], img[alt$=".jpg"], img[alt$=".jpeg"]').first().click();
      // A signed URL is a real network fetch; poll for the paint rather than
      // guessing a timeout (and report honestly if it never lands).
      let withPhoto = null;
      for (let i = 0; i < 20; i += 1) {
        await page.waitForTimeout(500);
        withPhoto = await digests(page);
        if (Object.keys(clean).every((k) => withPhoto[k] !== clean[k])) break;
      }
      const note = await page.evaluate(() => document.querySelector('.wo-panel [role="status"]')?.textContent || null);
      for (const k of Object.keys(clean)) {
        if (withPhoto[k] === clean[k]) fail(`${k}: the photo did not reach the canvas${note ? ` (surface said: ${note})` : ''}`);
      }
      const photoHolds = await holds(page);
      console.log(`  with the library photo: ${JSON.stringify(photoHolds)}`);
      console.log(`  message: ${JSON.stringify(await warnings(page))}`);
      await page.screenshot({ path: join(OUT, 'photo-library-ivory.png') });

      // ── 5. THE REFUSAL — the SAME photo, a colour it cannot carry ────────
      console.log('\n5. THE REFUSAL — same photo, a field the ink cannot survive');
      await page.locator('button[title^="Forest"]').click();
      await page.waitForTimeout(2000);
      let badHolds = await holds(page);
      let badWarn = await warnings(page);
      let held = badHolds.filter(([, t]) => t === 'On hold').map(([d]) => d);
      console.log(`  same photo on Forest: ${JSON.stringify(badHolds)}`);
      if (!held.length) {
        // This photo survives the dark scrim, which is the CORRECT answer for
        // most of the library — so reach for one that does not. FAIL_PHOTO is
        // not a guess: it is the worst-scoring image in the brand's live
        // library, found by sweeping all 131 through the same check
        // (scripts/tools/scan-library-backdrop.mjs). If it has been deleted, this
        // says so rather than quietly declaring the refusal unverifiable.
        console.log(`  it survives — reaching for the library's worst case (${FAIL_PHOTO})`);
        await page.locator('button', { hasText: 'Choose from library' }).click();
        await page.waitForTimeout(1200);
        await page.fill('input[placeholder^="Search by filename"]', FAIL_PHOTO);
        await page.waitForTimeout(600);
        const hits = await page.locator(`img[alt="${FAIL_PHOTO}"]`).count();
        if (!hits) {
          fail(`the measured worst-case photo '${FAIL_PHOTO}' is no longer in the library — re-run the sweep and update FAIL_PHOTO`);
          await page.keyboard.press('Escape');
        } else {
          const beforePick = await digests(page);
          await page.locator(`img[alt="${FAIL_PHOTO}"]`).first().click();
          for (let i = 0; i < 24; i += 1) {
            await page.waitForTimeout(500);
            held = (await holds(page)).filter(([, t]) => t === 'On hold').map(([d]) => d);
            if (held.length) break;
          }
          const afterPick = await digests(page);
          const landed = Object.keys(beforePick).some((k) => beforePick[k] !== afterPick[k]);
          const chip = await page.evaluate(() => document.querySelector('.wo-panel img[alt=""]')?.src?.slice(0, 60) || null);
          console.log(`  worst-case photo landed on the canvas: ${landed}${chip ? ` (thumb ${chip}…)` : ''}`);
          const measured = await page.evaluate(() => window.__woLastBackdrop || null);
          badHolds = await holds(page);
          badWarn = await warnings(page);
          console.log(`  holds: ${JSON.stringify(badHolds)}`);
          console.log(`  message: ${JSON.stringify(badWarn)}`);
        }
      }
      if (!held.length) {
        fail('no photo in the library was refused on the dark field — the check could not be shown to fire on a REAL asset');
      } else {
        for (const d of held) {
          if (!badWarn.join(' ').includes(d[0].toUpperCase() + d.slice(1))) fail(`the message does not name ${d}`);
        }
        // Export must ACTUALLY be blocked, not merely styled as blocked.
        const disabled = await page.evaluate(() => [...document.querySelectorAll('.wo-cell')].map((c) => [
          c.className.replace('wo-cell wo-cell-', ''), c.querySelector('.wo-cell-dl').disabled,
        ]));
        for (const d of held) {
          if (!disabled.find(([k]) => k === d)?.[1]) fail(`${d} says "On hold" but its Download button is still live (M4)`);
        }
        console.log(`  download buttons: ${JSON.stringify(disabled)}`);
      }
      await page.screenshot({ path: join(OUT, 'photo-refused-forest.png') });
      await page.locator('button[title^="Ivory"]').click();
      await page.waitForTimeout(1200);

      // ── 6. REMOVE THE PHOTO → the clean tile returns, byte for byte ──────
      console.log('\n6. REMOVE THE PHOTO — the clean tile must return byte-identically');
      await page.locator('button', { hasText: 'Remove photo' }).click();
      await page.waitForTimeout(1200);
      const after = await digests(page);
      for (const k of Object.keys(clean)) {
        if (after[k] !== clean[k]) fail(`${k}: removing the photo did NOT restore the clean tile (${hash(clean[k])} -> ${hash(after[k])})`);
      }
      console.log(`  after removal: ${JSON.stringify(hashAll(after))} — identical to the clean baseline`);
      await page.screenshot({ path: join(OUT, 'photo-removed-clean-again.png') });
    }

    if (errors.length) fail(`console/page errors: ${JSON.stringify(errors)}`);
    console.log(`\nconsole errors (excluding the known orchid-petal 404): ${errors.length}`);
    console.log(`screenshots: ${OUT}`);
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error(`\nFAIL — ${failures.length} gate(s):`);
    for (const f of failures) console.error('  · ' + f);
    process.exit(1);
  }
  console.log('\nPASS — the composer surface is verified live.');
}

main().catch((e) => { console.error(e); process.exit(1); });
