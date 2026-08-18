/* ─────────────────────────────────────────────────────────────────────────
   THE GUARD BATTERY DRIVER — proves the ADMIN RENDER PATH did not move.

   Runs, against an isolated test-hooks production build:
     · render fingerprint  144 cells vs scripts/guards/render-fingerprint-baseline.json
     · born-clean          456 cells
     · arch-stress         114 cells
     · legacy-dup           30 cells

   CAPTURE DISCIPLINE, verbatim from the baseline's own `captureDiscipline`
   field (docs/design-layer-contract.md §23):
     await document.fonts.ready
       -> settle: take round-trip-separated captures until two consecutive ones
          are identical (background preview/asset queues keep mutating shared
          render state for seconds after mount)
       -> then an in-process double capture; reject unless byte-identical.

   ENV: every key blanked in build AND serve; every non-localhost request aborted.
   A fingerprint diff is NEVER regenerated here — this driver only reports.

   Usage:
     WO_DIST_DIR=.next-s73 node scripts/tools/run-guard-battery.mjs [--port 3457]
   (build first: WO_DIST_DIR=.next-s73 NEXT_PUBLIC_WO_TEST_HOOKS=1 next build)
   ───────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { REPO_ROOT } from './template-harness.mjs';

const BLANK_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY', 'HIGGSFIELD_API_KEY', 'HIGGSFIELD_API_SECRET',
];

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 3457;
const distDir = process.env.WO_DIST_DIR || '.next-s73';

function startServer() {
  const env = { ...process.env, WO_DIST_DIR: distDir, NEXT_PUBLIC_WO_TEST_HOOKS: '1', PORT: String(port) };
  for (const k of BLANK_KEYS) env[k] = '';
  const child = spawn('npx', ['next', 'start', '-p', String(port)], { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not report ready in 90s')), 90_000);
    const onData = (b) => { if (/Ready in|started server|Local:/i.test(String(b))) { clearTimeout(t); resolve(child); } };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (c) => { clearTimeout(t); reject(new Error(`server exited ${c}`)); });
  });
}

async function main() {
  const baseline = JSON.parse(readFileSync(join(REPO_ROOT, 'scripts', 'guards', 'render-fingerprint-baseline.json'), 'utf8'));
  const server = await startServer();
  const browser = await chromium.launch({ headless: true }); // chrome-headless-shell — the canonical engine
  let failed = false;
  try {
    const context = await browser.newContext();
    await context.route('**/*', (route) => {
      const u = route.request().url();
      return u.startsWith(`http://localhost:${port}`) || u.startsWith(`http://127.0.0.1:${port}`) || u.startsWith('data:') || u.startsWith('blob:')
        ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/generate`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction('typeof window.__woRenderFingerprint === "function"', null, { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);

    // ── settle ───────────────────────────────────────────────────────────
    let prev = null; let settled = null; let rounds = 0;
    for (; rounds < 12; rounds += 1) {
      await page.waitForTimeout(1500);
      const cur = await page.evaluate(() => JSON.stringify(window.__woRenderFingerprint().hashes));
      if (prev && cur === prev) { settled = cur; break; }
      prev = cur;
    }
    if (!settled) { console.error('did not settle in 12 rounds'); process.exitCode = 2; return; }
    console.log(`settled after ${rounds + 1} rounds`);

    // ── in-process double capture (determinism gate) ──────────────────────
    const fp = await page.evaluate((base) => {
      const a = window.__woRenderFingerprint({ baseline: base });
      const b = window.__woRenderFingerprint({ baseline: base });
      return { a, identical: JSON.stringify(a.hashes) === JSON.stringify(b.hashes) };
    }, baseline);
    if (!fp.identical) { console.error('NON-DETERMINISTIC in-process capture — rejected'); process.exitCode = 2; return; }

    const report = fp.a;
    console.log(`fingerprint: ${report.cells}/${baseline.cells} cells, errors ${report.errors}, diffs ${report.diffs.length}`);
    if (report.diffs.length) {
      failed = true;
      console.error('\nFINGERPRINT MOVED — you have leaked into the admin render path. DO NOT re-baseline.');
      for (const d of report.diffs.slice(0, 40)) console.error(`  · ${d.cell}: ${d.baseline} -> ${d.current}`);
    }

    // ── the sibling guards ───────────────────────────────────────────────
    const others = await page.evaluate(() => ({
      bornClean: window.__woBornCleanGuard(),
      archStress: window.__woArchStress(),
      legacyDup: window.__woLegacyDupGuard(),
    }));
    for (const [name, r] of Object.entries(others)) {
      const offenders = (r.offenders || r.failures || []).length;
      console.log(`${name}: ${r.cells} cells, pass=${r.pass}, offenders=${offenders}`);
      if (!r.pass) { failed = true; console.error(`  ${name} OFFENDERS: ${JSON.stringify((r.offenders || r.failures || []).slice(0, 10))}`); }
    }
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
  if (failed) process.exitCode = 1;
  else console.log('\nGUARD BATTERY CLEAN — the admin render path is byte-identical.');
}

main().catch((e) => { console.error(e); process.exit(1); });
