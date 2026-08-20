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
                 scrim, ON ALL FOUR COLOUR PAIRS, every one still downloadable,
                 and no two pairs rendering the same pixels.
     5. REFUSAL  a deliberately bad combination puts the affected dimensions on
                 hold, blocks their export, and NAMES them in the message.
                 (2026-08-18: the bad combination is now a MARK the field cannot
                 carry, not a photo — see the note on FAIL_PHOTO below.)
     6. RETURN   removing the photo restores the clean tile BYTE FOR BYTE.
     8. WINDOW   template two's petal shape is HERS to pick: every sanctioned
                 silhouette is offered, each renders differently in all four,
                 and none of them appears on template one.
     7. SWAP     the selector offers BOTH templates and really switches; the
                 required photo on template two blocks export until one is
                 chosen; and a round trip through the two loses NOTHING (§6.3).

   MONEY LAW: the only routes touched are /post and GET /api/images. No
   improve, no generation, nothing that spends.

   Usage: node scripts/tools/verify-post-composer.mjs [--port 3100]
   ───────────────────────────────────────────────────────────────────────── */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { REPO_ROOT } from './template-harness.mjs';
import { TEMPLATE_LABEL_HEADLINE as T, TEMPLATE_PETAL_WINDOW as TWO } from '../../lib/templates/index.mjs';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 3100;
const BASE = `http://localhost:${port}`;
const OUT = join(REPO_ROOT, 'generated', 'template-one', 'composer');
const KNOWN_404 = /orchid-petal\.svg/;
/* There is deliberately NO "worst library photo" fixture here any more.
   (client ruling 2026-08-18 — per-pair scrims) The scrim opacities are measured
   so that NOT ONE of the library's 131 photos breaks the text floor on ANY of
   the four pairs — that is precisely what "all four colours fully accessible
   with image" means. Keeping a photo here that is supposed to be refused would
   be asserting a failure the system no longer has. The refusal is instead shown
   where it is still reachable and still real: a sanctioned mark the field cannot
   carry (step 5), and a tainted/unreadable backdrop (unit-tested). That the
   library is clean is not assumed — scripts/tools/scan-library-backdrop.mjs
   measures all 131 every time it runs. */

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
    /* A "Failed to load resource" console line carries no URL, so it cannot be
       told apart from a real fault by its text. `requestfailed` does carry one,
       so the two are correlated: a resource error whose matching failed request
       is a LIBRARY THUMBNAIL is counted separately and reported by number.
       That is a real distinction, not a mute: the library is 131 signed remote
       URLs fetched at once, and the dev server closing a few of those
       connections says nothing about the app. Anything else still fails the run. */
    const netFlakes = [];
    page.on('requestfailed', (r) => {
      const url = r.url();
      if (r.resourceType() === 'image' && !url.startsWith(BASE)) netFlakes.push(url);
      else netFlakes.push(`OTHER ${r.resourceType()} ${url} :: ${r.failure()?.errorText}`);
    });
    page.on('console', (m) => {
      const t = m.type() === 'error' ? m.text() : null;
      if (!t || KNOWN_404.test(t)) return;
      if (/^Failed to load resource/.test(t)) return; // accounted for by requestfailed
      errors.push(`console: ${t}`);
    });

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

    // ── 4. A REAL LIBRARY PHOTO, ON ALL FOUR PAIRS ─────────────────────────
    //     (client ruling 2026-08-18) "i also want the 4 background colours to be
    //     fully accessible with image, currently only forest and ivory are
    //     options." That is the gate: every pair must take a real library photo,
    //     stay off hold, and — the actual bug — RENDER DIFFERENTLY from the
    //     others. Keyed by colour class the three light pairs were byte-identical.
    console.log('\n4. LIBRARY PHOTO — real asset, per-pair scrim, all four pairs usable');
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

      // THE SAME PHOTO, THROUGH EVERY PAIR.
      const perPair = {};
      for (const pair of T.colourPairs) {
        await page.locator(`button[title^="${pair.label} "]`).click();
        await page.waitForTimeout(900);
        const d = await digests(page);
        perPair[pair.id] = d;
        const held = (await holds(page)).filter(([, t]) => t === 'On hold').map(([k]) => k);
        const warn = await warnings(page);
        if (held.length) fail(`${pair.label}: an ordinary library photo put ${held.join(', ')} on hold — the pair is not usable with an image (${warn.join(' | ')})`);
        console.log(`  ${pair.label.padEnd(7)} scrim ${T.slots.photo.scrim[pair.id].colour} @ ${T.slots.photo.scrim[pair.id].opacity}  holds=${held.length ? held.join(',') : 'none'}  ${JSON.stringify(hashAll(d))}`);
        await page.screenshot({ path: join(OUT, `photo-pair-${pair.id}.png`) });
        // The bare portrait render, so the four can be compared side by side.
        const png = await page.evaluate(() => document.querySelector('.wo-cell-portrait canvas').toDataURL('image/png'));
        writeFileSync(join(OUT, `photo-pair-${pair.id}-portrait.png`), Buffer.from(png.split(',')[1], 'base64'));
      }
      // …and no two of them may be the same picture. THIS is the reported bug.
      const ids = Object.keys(perPair);
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          for (const k of Object.keys(clean)) {
            if (perPair[ids[i]][k] === perPair[ids[j]][k]) {
              fail(`${ids[i]} and ${ids[j]} render IDENTICAL ${k} behind the same photo — the class-keyed scrim bug is back`);
            }
          }
        }
      }
      console.log('  all four pairs render distinct pixels behind the same photo');

      // ── 5. THE REFUSAL, WITH A PHOTO ON THE CANVAS ──────────────────────
      //     The measured opacities are chosen so NO photo in the library breaks
      //     the text floor on any pair — that is the ruling, and step 4 is the
      //     proof. So the refusal is demonstrated where it is still reachable:
      //     a sanctioned mark the field cannot carry, WITH the photo present.
      //     Nothing is substituted (M3); the affected dimensions go on hold and
      //     the message names them.
      console.log('\n5. THE REFUSAL — still live, with the photo on the canvas');
      await page.locator('button[title^="Ivory "]').click();
      await page.waitForTimeout(700);
      await page.locator('button[title="Secondary 1 · ivory"]').click();
      await page.waitForTimeout(900);
      const photoRefuseHolds = await holds(page);
      const photoRefuseWarn = await warnings(page);
      const heldNow = photoRefuseHolds.filter(([, t]) => t === 'On hold').map(([k]) => k);
      if (!heldNow.length) fail('an ivory mark on the ivory field, over a photo, was NOT refused — the check has gone decorative');
      else {
        for (const d of heldNow) {
          if (!photoRefuseWarn.join(' ').includes(d[0].toUpperCase() + d.slice(1))) fail(`the message does not name ${d}`);
        }
        const disabled = await page.evaluate(() => [...document.querySelectorAll('.wo-cell')].map((c) => [
          c.className.replace('wo-cell wo-cell-', ''), c.querySelector('.wo-cell-dl').disabled,
        ]));
        for (const d of heldNow) {
          if (!disabled.find(([k]) => k === d)?.[1]) fail(`${d} says "On hold" but its Download button is still live (M4)`);
        }
        console.log(`  holds: ${JSON.stringify(photoRefuseHolds)}`);
        console.log(`  message: ${JSON.stringify(photoRefuseWarn)}`);
        console.log(`  download buttons: ${JSON.stringify(disabled)}`);
      }
      await page.screenshot({ path: join(OUT, 'photo-refused-mark.png') });
      await page.locator('button[aria-pressed][title="Whichever mark suits the colour you picked"]').click();
      await page.waitForTimeout(700);

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

    /* ── 7. TWO TEMPLATES — the selector is a real switch, and §6.3 holds ────
       (client ruling 2026-08-18 — template two) Three things are proved here,
       all against the LIVE surface rather than the data:
         · the menu offers both templates and picking one changes the design
         · REQUIRED PHOTO: with no photo, template two blocks every export and
           says why; with one, it releases
         · §6.3 "deactivating never deletes": fill template one's slots, swap to
           two (which shows only a heading), swap back — nothing may be lost,
           and her colour/mark/position choices must come back too.            */
    console.log('\n7. TEMPLATE TWO — the selector is a real switch, and nothing is lost in a swap');
    const setField = async (slot, text) => {
      const el = page.locator(`#slot-${slot}`);
      if (!(await el.count())) return false;
      await el.fill(text);
      await page.waitForTimeout(120);
      return true;
    };
    const readFields = () => page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll('textarea[id^="slot-"]')].map((t) => [t.id.replace('slot-', ''), t.value]),
    ));
    const readChoices = () => page.evaluate(() => ({
      pair: [...document.querySelectorAll('button[aria-pressed]')].find((b) => /contrast/.test(b.title || '') && b.getAttribute('aria-pressed') === 'true')?.title || null,
      position: [...document.querySelectorAll('button[aria-pressed]')].filter((b) => /^(Bottom|Top)/.test(b.textContent || '')).find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent || null,
      mark: [...document.querySelectorAll('button[aria-pressed]')].filter((b) => (b.title || '').includes('·') || /suits the colour/.test(b.title || '')).find((b) => b.getAttribute('aria-pressed') === 'true')?.title || null,
    }));
    const pickTemplate = async (name) => {
      await page.locator('[aria-haspopup="listbox"]').click();
      await page.waitForTimeout(200);
      await page.locator('[role="option"] button', { hasText: name }).first().click();
      await page.waitForTimeout(1200);
    };

    // Distinctive copy in EVERY slot template one shows, all inside BOTH
    // templates' budgets so the swap itself is what is under test.
    const ONE_COPY = { eyebrow: 'OUR MORNING', heading: 'The day the garden opened', body: 'Tuesdays from nine' };
    for (const [slot, text] of Object.entries(ONE_COPY)) {
      if (!(await setField(slot, text))) fail(`template one has no ${slot} field to fill`);
    }
    await page.locator('button[title^="Blush "]').click();
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: 'Bottom left' }).click();
    await page.waitForTimeout(300);
    const beforeSwapFields = await readFields();
    const beforeSwapChoices = await readChoices();
    console.log(`  template one, filled: ${JSON.stringify(beforeSwapFields)}`);
    console.log(`  choices: ${JSON.stringify(beforeSwapChoices)}`);

    // The menu must list BOTH.
    await page.locator('[aria-haspopup="listbox"]').click();
    await page.waitForTimeout(200);
    const bothMenu = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => ({
      selected: o.getAttribute('aria-selected'), name: o.textContent.split('✓')[0].trim().slice(0, 30),
    })));
    console.log(`  menu now lists: ${JSON.stringify(bothMenu)}`);
    if (bothMenu.length !== 2) fail(`the selector offers ${bothMenu.length} template(s), the registry has 2`);
    // Escape must close an open listbox — pressed here so the run FAILS if that
    // ever regresses, rather than the menu being dismissed by a stray click.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    if ((await page.locator('[aria-haspopup="listbox"]').getAttribute('aria-expanded')) !== 'false') {
      fail('Escape did not close the open template listbox');
    }
    await page.locator('[aria-haspopup="listbox"]').click();
    await page.waitForTimeout(200);
    await page.locator('[role="option"] button', { hasText: 'Petal Window' }).first().click();
    await page.waitForTimeout(1500);

    // The design changed, and the swap SAID what it was doing (§6.3 rule 2).
    const twoDigests = await digests(page);
    if (Object.keys(beforeSwapFields).every((k) => k) && JSON.stringify(twoDigests) === JSON.stringify(clean)) {
      fail('picking template two changed nothing on the canvas — the selector is still decorative');
    }
    const swapLine = await page.evaluate(() => [...document.querySelectorAll('.wo-panel [role="status"]')].map((n) => n.textContent));
    console.log(`  swap line: ${JSON.stringify(swapLine)}`);
    if (!swapLine.join(' ').toLowerCase().includes('kept for later')) {
      fail(`the swap did not say that the hidden copy is kept: ${JSON.stringify(swapLine)}`);
    }

    // REQUIRED PHOTO — every dimension on hold, said honestly, export dead.
    const twoHolds = await holds(page);
    const twoWarn = await warnings(page);
    const heldTwo = twoHolds.filter(([, t]) => t === 'On hold').map(([d]) => d);
    console.log(`  no photo yet → holds ${JSON.stringify(twoHolds)}`);
    console.log(`  message: ${JSON.stringify(twoWarn)}`);
    if (heldTwo.length !== 4) fail(`template two requires a photo but only ${heldTwo.length}/4 dimensions are on hold`);
    if (!twoWarn.join(' ').toLowerCase().includes('photo')) fail('the hold does not say a photo is what is missing');
    const twoDisabled = await page.evaluate(() => [...document.querySelectorAll('.wo-cell')].map((c) => c.querySelector('.wo-cell-dl').disabled));
    if (!twoDisabled.every(Boolean)) fail(`template two allows export with no photo: ${JSON.stringify(twoDisabled)}`);
    const dlAll = await page.locator('button', { hasText: 'Download all sizes' }).isDisabled();
    if (!dlAll) fail('"Download all sizes" is live while a required photo is missing');
    await page.screenshot({ path: join(OUT, 'two-empty-state.png') });
    const emptyShot = await page.evaluate(() => document.querySelector('.wo-cell-portrait canvas').toDataURL('image/png'));
    writeFileSync(join(OUT, 'two-empty-portrait.png'), Buffer.from(emptyShot.split(',')[1], 'base64'));

    // …and a real library photo releases it.
    await page.locator('button', { hasText: 'Choose from library' }).click();
    await page.waitForTimeout(1800);
    await page.locator('img[alt$=".png"], img[alt$=".jpg"], img[alt$=".jpeg"]').first().click();
    let released = [];
    for (let i = 0; i < 40; i += 1) {
      await page.waitForTimeout(500);
      released = (await holds(page)).filter(([, t]) => t === 'On hold').map(([d]) => d);
      if (!released.length) break;
    }
    if (released.length) {
      // Say WHICH failure this is: a signed URL that never decoded is a network
      // blip, not the required-photo gate misbehaving. Naming it keeps a flake
      // from being read as a bug (and vice versa).
      const fieldNote = await page.evaluate(() => [...document.querySelectorAll('.wo-panel-scroll [role="status"]')].map((n) => n.textContent).join(' | '));
      fail(`template two stayed on hold with a real photo: ${released.join(', ')} — footer ${JSON.stringify(await warnings(page))} · field note ${JSON.stringify(fieldNote)}`);
    }
    console.log(`  with a library photo → holds ${released.length ? released.join(',') : 'none'}`);
    await page.screenshot({ path: join(OUT, 'two-with-photo.png') });
    for (const dimId of ['portrait', 'story', 'square', 'landscape']) {
      const png = await page.evaluate((d) => document.querySelector(`.wo-cell-${d} canvas`).toDataURL('image/png'), dimId);
      writeFileSync(join(OUT, `two-photo-${dimId}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }

    /* ── 8. THE WINDOW SHAPE PICKER (client ruling 2026-08-18) ──────────────
       "i have a few petal shapes, can u make them as selections?" — so every
       sanctioned shape must be offered, picking one must move real pixels in
       ALL FOUR dimensions, and nothing may go on hold when it does.        */
    console.log('\n8. WINDOW SHAPE PICKER — every sanctioned petal, all four dimensions');
    const shapeButtons = await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')]
      .filter((b) => b.querySelector('[data-shape-src]'))
      .map((b) => ({ title: b.title, src: b.querySelector('[data-shape-src]').dataset.shapeSrc, on: b.getAttribute('aria-pressed') })));
    console.log(`  offered: ${JSON.stringify(shapeButtons)}`);
    if (shapeButtons.length !== TWO.allowedMaskShapes.length) {
      fail(`the picker offers ${shapeButtons.length} window shape(s), the template sanctions ${TWO.allowedMaskShapes.length}`);
    }
    for (const id of TWO.allowedMaskShapes) {
      if (!shapeButtons.some((b) => b.src === `/assets/shapes/${id}.svg`)) fail(`'${id}' is sanctioned but not offered`);
    }
    if (shapeButtons.filter((b) => b.on === 'true').length !== 1) fail('the picker does not mark exactly one shape as current');

    const seenShapes = new Map();
    for (const id of TWO.allowedMaskShapes) {
      await page.locator(`button[aria-pressed]:has([data-shape-src="/assets/shapes/${id}.svg"])`).click();
      await page.waitForTimeout(900);
      const d = await digests(page);
      const held = (await holds(page)).filter(([, t]) => t === 'On hold').map(([k]) => k);
      if (held.length) fail(`window shape '${id}' put ${held.join(', ')} on hold — ${JSON.stringify(await warnings(page))}`);
      for (const [prevId, prev] of seenShapes) {
        for (const k of Object.keys(d)) {
          if (prev[k] === d[k]) fail(`'${id}' and '${prevId}' render IDENTICAL ${k} — the shape picker is not changing the window`);
        }
      }
      seenShapes.set(id, d);
      console.log(`  ${id.padEnd(12)} holds=${held.length ? held.join(',') : 'none'}  ${JSON.stringify(hashAll(d))}`);
      const png = await page.evaluate(() => document.querySelector('.wo-cell-portrait canvas').toDataURL('image/png'));
      writeFileSync(join(OUT, `two-window-${id}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
    await page.screenshot({ path: join(OUT, 'two-shape-picker.png') });
    // Back to the template's own default before the swap-back check.
    await page.locator(`button[aria-pressed]:has([data-shape-src="/assets/shapes/${TWO.slots.photo.mask}.svg"])`).click();
    await page.waitForTimeout(700);

    // …and the template-ONE surface must NOT grow a window-shape control: the
    // shapes belong to template two alone (client ruling, same day).
    // (checked after the swap back, below)

    // §6.3 — SWAP BACK. Nothing may have been lost.
    await pickTemplate('Label + Headline');
    const afterSwapFields = await readFields();
    const afterSwapChoices = await readChoices();
    console.log(`  back on template one: ${JSON.stringify(afterSwapFields)}`);
    console.log(`  choices: ${JSON.stringify(afterSwapChoices)}`);
    for (const [slot, text] of Object.entries(ONE_COPY)) {
      if (afterSwapFields[slot] !== text) {
        fail(`§6.3 VIOLATED — '${slot}' was '${text}' before the swap and is '${afterSwapFields[slot]}' after: deactivating DELETED her words`);
      }
    }
    if (JSON.stringify(afterSwapChoices) !== JSON.stringify(beforeSwapChoices)) {
      fail(`the swap back did not restore her choices: ${JSON.stringify(beforeSwapChoices)} -> ${JSON.stringify(afterSwapChoices)}`);
    }
    console.log('  every word and every choice survived the round trip');
    const shapeControlOnOne = await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')]
      .filter((b) => b.querySelector('[data-shape-src]')).length);
    if (shapeControlOnOne) fail(`template one shows ${shapeControlOnOne} window-shape control(s) — the petal shapes are template two's alone`);
    console.log('  template one shows no window-shape control (the shapes are template two\'s alone)');
    await page.screenshot({ path: join(OUT, 'two-swapped-back.png') });

    const realNetFailures = netFlakes.filter((u) => u.startsWith('OTHER '));
    const libraryFlakes = netFlakes.length - realNetFailures.length;
    if (errors.length) fail(`console/page errors: ${JSON.stringify(errors)}`);
    if (realNetFailures.length) fail(`non-image request failures: ${JSON.stringify([...new Set(realNetFailures)].slice(0, 8))}`);
    console.log(`\nconsole/page errors (excluding the known orchid-petal 404): ${errors.length}`);
    console.log(`remote library thumbnails that did not load this run: ${libraryFlakes} of ~${131 * 2} fetched (transient; the picker shows what arrives)`);
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
