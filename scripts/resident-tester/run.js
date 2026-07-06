#!/usr/bin/env node
// ── Resident Tester — MAIN RUNNER ────────────────────────────────────────────
// Launches a LOCAL PRODUCTION build of the studio (next start) with photo
// generation HARD-MOCKED (Higgsfield keys unset → the route degrades to Library
// samples, spending ZERO credits), drives the golden journeys + persona fuzzing
// under strict time/spend caps, and writes both a machine-readable events log and
// a client-facing markdown report.
//
// Usage:
//   node scripts/resident-tester/run.js            (assumes a build already exists)
//   npm run test:resident                          (see package.json script)
//
// It does NOT run `next build` itself (build is slow + noisy) — build once, then
// run. The runner starts `next start` on the spare port and tears it down cleanly.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const config = require('./config');
const { Run, fortifyContext, captureConsole } = require('./harness');
const { runJourneys } = require('./journeys');
const { runFuzz } = require('./fuzz');
const report = require('./report');

const REPO = path.resolve(__dirname, '../..');
const notes = [];

function log(...a) { console.log('[resident]', ...a); }

// Poll the server root until it answers or times out.
function waitForServer(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(true); });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error('server did not start in time'));
        else setTimeout(tick, 1000);
      });
    };
    tick();
  });
}

// Ask the running server how many cloud sessions exist (active + archived). Used
// to VERIFY the run added zero rows to the client's Supabase brand.
function cloudSessionCount(baseUrl) {
  return new Promise((resolve) => {
    const out = { configured: false, active: 0, archived: 0 };
    const grab = (qs, key, next) => {
      http.get(`${baseUrl}/api/sessions${qs}`, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try { const j = JSON.parse(body); if (j.configured !== false) { out.configured = true; out[key] = (j.sessions || []).length; } } catch {}
          next();
        });
      }).on('error', () => next());
    };
    grab('', 'active', () => grab('?archived=1', 'archived', () => resolve(out)));
  });
}

async function main() {
  const startedAt = Date.now();
  const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = path.join(__dirname, 'runs', stamp);
  fs.mkdirSync(runDir, { recursive: true });
  const run = new Run(runDir);
  log('run dir:', runDir);

  // ── 1. Launch the production server with photo generation mocked ──────────
  // Unset Higgsfield creds → higgsfieldConfigured() is false → /api/design-generate
  // returns { unconfigured } → the client falls back to Library/sample photos.
  // ZERO Higgsfield credits by construction; the Playwright route-block is the belt.
  const env = { ...process.env, PORT: String(config.port), HIGGSFIELD_API_KEY: '', HIGGSFIELD_API_SECRET: '' };
  log(`starting: next start -p ${config.port} (Higgsfield keys unset → photo gen mocked)`);
  const server = spawn('npx', ['next', 'start', '-p', String(config.port)], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const serverLog = fs.createWriteStream(path.join(runDir, 'server.log'));
  server.stdout.pipe(serverLog); server.stderr.pipe(serverLog);

  let browser;
  const cleanup = () => { try { server.kill('SIGTERM'); } catch {} try { if (browser) browser.close(); } catch {} };
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  try {
    await waitForServer(config.baseUrl + '/', 90000);
    log('server up at', config.baseUrl);

    // ── 2. VERIFY BASELINE — cloud sessions before the run ──────────────────
    const before = await cloudSessionCount(config.baseUrl);
    notes.push(`Cloud sessions before run: ${before.configured ? `${before.active} active + ${before.archived} archived` : 'cloud unconfigured (nothing to pollute)'}.`);
    log('cloud baseline:', JSON.stringify(before));

    // ── 3. Launch a hardened, headless Chromium ─────────────────────────────
    const { chromium } = require('playwright');
    const profileDir = path.join(runDir, 'chrome-profile');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'WhiteOrchidResidentTester/1.0',
    });
    await fortifyContext(context, run);
    const page = await context.newPage();
    const cons = captureConsole(page);

    // ── 4. Golden journeys ───────────────────────────────────────────────────
    log('running golden journeys…');
    await runJourneys(page, run, cons, config.baseUrl);
    log(`journeys done — ${run.defects().length} defect(s) so far; elapsed ${(run.elapsedMs() / 1000).toFixed(0)}s`);

    // ── 5. Persona fuzzing (budget-capped) ──────────────────────────────────
    if (!run.overBudget()) {
      log('running persona fuzzing…');
      // Trim target if the clock is already tight (leave 5 min of headroom).
      const remainingMs = config.budget.wallClockMs - run.elapsedMs();
      const roomFor = Math.floor((remainingMs - 3 * 60000) / 20000); // ~20s/turn budget
      const target = Math.max(config.fuzz.minSamples, Math.min(config.fuzz.targetSamples, roomFor));
      notes.push(`Fuzzing target this run: ${target} utterances (from a pool of realistic staff phrasings).`);
      await runFuzz(page, run, cons, { targetSamples: target, minSamples: config.fuzz.minSamples });
    } else {
      notes.push('Fuzzing skipped — journeys alone reached the time/spend cap.');
    }
    log(`fuzz done — ${run.fuzz.length} utterances; ${run.defects().length} total defect(s)`);

    // ── 6. VERIFY — cloud sessions after the run (must be unchanged) ─────────
    const after = await cloudSessionCount(config.baseUrl);
    const grew = before.configured && after.configured
      ? (after.active - before.active) + (after.archived - before.archived) : 0;
    notes.push(`Cloud sessions after run: ${after.configured ? `${after.active} active + ${after.archived} archived` : 'cloud unconfigured'} → ${grew === 0 ? 'ZERO new rows (verified clean).' : `${grew} NEW ROW(S) — investigate!`}`);
    notes.push(`Higgsfield calls intercepted: ${run.higgsfieldCalls} (must be 0).`);
    notes.push(`Cloud write attempts intercepted + discarded: ${run.cloudWriteAttempts}.`);
    run.recordInfo({ verify: { before, after, newCloudRows: grew, higgsfieldCalls: run.higgsfieldCalls, cloudWriteAttempts: run.cloudWriteAttempts } });

    await context.close();
  } catch (e) {
    log('RUN ERROR:', e.message);
    notes.push('Run error: ' + e.message);
    run.recordInfo({ error: e.message, stack: e.stack });
  } finally {
    cleanup();
  }

  // ── 7. Write the client-facing report ─────────────────────────────────────
  const md = report.generate(run, { notes });
  const dateStr = new Date(run.startedAt).toISOString().slice(0, 10);
  const reportPath = path.join(REPO, 'docs', 'resident-tester', `smoke-report-${dateStr}.md`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, md);
  // Also drop a copy inside the run dir for a self-contained artifact.
  fs.writeFileSync(path.join(runDir, 'report.md'), md);

  log('─'.repeat(60));
  log(`DONE — ${run.defects().length} defect(s), ${run.fuzz.length} utterances, ${(run.elapsedMs() / 60000).toFixed(1)} min, ~$${run.estCostUsd().toFixed(2)}`);
  log('report:', path.relative(REPO, reportPath));
  log('events:', path.relative(REPO, run.eventsPath));
  process.exit(0);
}

main().catch((e) => { console.error('[resident] FATAL', e); process.exit(1); });
