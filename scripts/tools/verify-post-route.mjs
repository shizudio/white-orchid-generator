/* Live verification of the USER APP route (/post) against an isolated
   test-hooks production build. Proves, with numbers not impressions:
     · zero console errors (the known orchid-petal.svg 404 excepted)
     · all four dimensions paint at their declared canvas sizes
     · maxLength on every field equals the baked charBudget
     · a hard break that busts maxLines BLOCKS that dimension's export (§7.2)
     · improve degrades honestly with NO key and spends nothing (money law)
     · the photo library degrades honestly with NO key ({configured:false}, 200)
   Screenshots land in generated/template-one/.

   Usage: WO_DIST_DIR=.next-s73 node scripts/tools/verify-post-route.mjs [--port 3458]
*/
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { REPO_ROOT } from './template-harness.mjs';
import { TEMPLATE_LABEL_HEADLINE as T } from '../../lib/templates/index.mjs';

const BLANK_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'HIGGSFIELD_API_KEY', 'HIGGSFIELD_API_SECRET'];
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 3458;
const OUT = join(REPO_ROOT, 'generated', 'template-one');

function startServer() {
  const env = { ...process.env, WO_DIST_DIR: process.env.WO_DIST_DIR || '.next-s73', NEXT_PUBLIC_WO_TEST_HOOKS: '1' };
  for (const k of BLANK_KEYS) env[k] = '';
  const child = spawn('npx', ['next', 'start', '-p', String(port)], { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server not ready')), 90_000);
    const on = (b) => { if (/Ready in|Local:/i.test(String(b))) { clearTimeout(t); resolve(child); } };
    child.stdout.on('data', on); child.stderr.on('data', on);
    child.on('exit', (c) => { clearTimeout(t); reject(new Error(`server exited ${c}`)); });
  });
}

const KNOWN_404 = /orchid-petal\.svg/;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error' && !KNOWN_404.test(m.text())) errors.push(`console: ${m.text()}`); });

    await page.goto(`http://localhost:${port}/post`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, 'route-desktop.png'), fullPage: true });

    // 1. the four canvases, at their declared sizes
    const canvases = await page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`));
    const expected = ['1080x1350', '1080x1920', '1080x1080', '1600x900'];
    if (JSON.stringify(canvases) !== JSON.stringify(expected)) failures.push(`canvases ${JSON.stringify(canvases)} != ${JSON.stringify(expected)}`);

    // 2. maxLength === the baked charBudget on every field
    const maxes = await page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll('textarea[id^="slot-"]')].map((t) => [t.id.replace('slot-', ''), Number(t.maxLength)]),
    ));
    for (const slot of T.paintOrder) {
      if (maxes[slot] !== T.slots[slot].charBudget) failures.push(`${slot}: maxLength ${maxes[slot]} != budget ${T.slots[slot].charBudget}`);
    }

    // 3. every canvas actually painted ink (not a blank field)
    const inked = await page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const first = [d[0], d[1], d[2]];
      for (let i = 0; i < d.length; i += 4 * 997) if (d[i] !== first[0] || d[i + 1] !== first[1] || d[i + 2] !== first[2]) return true;
      return false;
    }));
    if (inked.some((v) => !v)) failures.push(`a canvas painted no ink: ${JSON.stringify(inked)}`);

    // 4. §7.2 — hard breaks that bust maxLines put dimensions ON HOLD
    const beforeHold = await page.evaluate(() => [...document.querySelectorAll('.wo-cell-dl')].map((b) => b.textContent.trim()));
    if (beforeHold.some((t) => t !== 'Download')) failures.push(`clean copy should have no holds: ${JSON.stringify(beforeHold)}`);
    await page.evaluate(() => {
      const ta = document.querySelector('#slot-heading');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, 'a\nb\nc\nd\ne');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const afterHold = await page.evaluate(() => [...document.querySelectorAll('.wo-cell-dl')].map((b) => b.textContent.trim()));
    if (!afterHold.includes('On hold')) failures.push(`five hard breaks did not block any export: ${JSON.stringify(afterHold)}`);
    await page.screenshot({ path: join(OUT, 'route-overbudget.png'), fullPage: true });
    console.log('export state with 4 hard breaks in the heading:', JSON.stringify(afterHold));

    // restore
    await page.evaluate(() => {
      const ta = document.querySelector('#slot-heading');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, 'Every child is capable of leading their own day');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(300);

    // 5. IMPROVE with NO key — honest degradation, zero spend
    const improve = await page.evaluate(async () => {
      const res = await fetch('/api/improve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: 'heading', text: '  every  child leads their own  day ', templateId: 'label_headline' }),
      });
      return { status: res.status, body: await res.json() };
    });
    console.log('improve (no key):', JSON.stringify(improve));
    if (improve.status !== 200) failures.push(`improve returned HTTP ${improve.status} — must never be a 500`);
    if (improve.body.configured !== false) failures.push('improve claimed configured with no key');
    if (!improve.body.reason) failures.push('improve degraded without an honest reason');
    if (improve.body.fallback && improve.body.fallback.length > T.slots.heading.charBudget) failures.push('the offline fallback exceeded the budget');

    // 5b. THE PHOTO LIBRARY with NO key — the graceful-degradation contract.
    //     An unconfigured cloud must be a 200 with {configured:false}, never a
    //     500, and the surface must still be usable without a photo.
    const lib = await page.evaluate(async () => {
      const res = await fetch('/api/images');
      return { status: res.status, body: await res.json() };
    });
    console.log('GET /api/images (no key):', JSON.stringify(lib).slice(0, 120));
    if (lib.status !== 200) failures.push(`/api/images returned HTTP ${lib.status} unconfigured — must be 200`);
    if (lib.body?.configured !== false) failures.push('/api/images did not report itself unconfigured');
    // …and with no photo, nothing is on hold: the amendment adds no noise to the
    // pre-verified path (§10A still stands where it always did).
    const cleanHolds = await page.evaluate(() => [...document.querySelectorAll('.wo-cell-dl')].map((b) => b.textContent.trim()));
    if (cleanHolds.some((t) => t !== 'Download')) failures.push(`the clean text-only tile is on hold: ${JSON.stringify(cleanHolds)}`);

    // 6. mobile viewport sanity (M9 — measure BOTH)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log('mobile horizontal overflow (px):', overflowX);
    if (overflowX > 1) failures.push(`the page scrolls horizontally at 375px (${overflowX}px overflow)`);
    await page.screenshot({ path: join(OUT, 'route-mobile.png'), fullPage: true });

    if (errors.length) failures.push(`console/page errors: ${JSON.stringify(errors)}`);
    console.log(`\ncanvases: ${JSON.stringify(canvases)}`);
    console.log(`maxLength per slot: ${JSON.stringify(maxes)} (budgets ${JSON.stringify(Object.fromEntries(T.paintOrder.map((s) => [s, T.slots[s].charBudget])))})`);
    console.log(`console errors (excluding the known orchid-petal 404): ${errors.length}`);
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
  if (failures.length) { console.error('\nFAIL:'); for (const f of failures) console.error('  · ' + f); process.exit(1); }
  console.log('\nPASS — /post verified.');
}

main().catch((e) => { console.error(e); process.exit(1); });
