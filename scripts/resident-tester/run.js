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

const { spawn, execSync } = require('child_process');
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

// Ask the running server which cloud sessions exist (active + archived). We record
// the SET OF IDS, not just a count — the shared brand's archived list is a top-N
// view whose membership can shift as unrelated rows are touched, so a length delta
// is not proof of a leak. Comparing ID sets tells us precisely whether THIS run
// added any NEW session to the client's Supabase brand.
function cloudSessionIds(baseUrl) {
  return new Promise((resolve) => {
    const out = { configured: false, active: [], archived: [] };
    const grab = (qs, key, next) => {
      http.get(`${baseUrl}/api/sessions${qs}`, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try { const j = JSON.parse(body); if (j.configured !== false) { out.configured = true; out[key] = (j.sessions || []).map(s => s.id); } } catch {}
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
  // Free the port first — a lingering next-server from a prior run (npx spawns
  // next-server as a GRANDCHILD, which a plain kill can orphan) would serve a stale
  // .next and cause MODULE_NOT_FOUND after a rebuild. Belt: kill the whole group.
  try { execSync(`lsof -ti:${config.port} | xargs kill -9`, { stdio: 'ignore' }); } catch {}

  // Guard: refuse to start against a build that is missing its BUILD_ID (a
  // half-written .next from an interrupted build serves MODULE_NOT_FOUND 500s and
  // would make every journey look broken). Fail loud instead of testing a ghost.
  if (!fs.existsSync(path.join(REPO, '.next', 'BUILD_ID'))) {
    console.error('[resident] .next/BUILD_ID missing — run `next build` first (or `npm run test:resident`).');
    process.exit(2);
  }

  const env = { ...process.env, PORT: String(config.port), HIGGSFIELD_API_KEY: '', HIGGSFIELD_API_SECRET: '' };
  log(`starting: next start -p ${config.port} (Higgsfield keys unset → photo gen mocked)`);
  // detached:true → the child leads its own process group so we can signal the
  // whole tree (npx + next-server grandchild) on teardown and never orphan it.
  const server = spawn('npx', ['next', 'start', '-p', String(config.port)], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const serverLog = fs.createWriteStream(path.join(runDir, 'server.log'));
  server.stdout.pipe(serverLog); server.stderr.pipe(serverLog);

  let browser;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    try { if (browser) browser.close(); } catch {}
    // Kill the server's process group (negative pid) so the next-server GRANDCHILD
    // dies too — the fix for the orphaned-server / corrupted-.next class. Because
    // the child was spawned `detached`, its pid IS its group leader and is distinct
    // from OUR group, so signalling -server.pid never kills this runner.
    try { process.kill(-server.pid, 'SIGKILL'); } catch {}
    try { server.kill('SIGKILL'); } catch {}
    // NOTE: we do NOT `lsof -ti:PORT | kill` here — this runner holds CLIENT
    // sockets to the port (the cloud-verify fetches), so that would kill US
    // (the SIGKILL/137 self-destruct bug). The process-group kill above is enough.
  };
  // On a signal we clean up then exit; the plain `exit` listener is a last-resort
  // reaper (synchronous only). We deliberately do NOT process.kill our own group.
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    await waitForServer(config.baseUrl + '/', 90000);
    log('server up at', config.baseUrl);

    // ── 2. VERIFY BASELINE — cloud session IDS before the run ───────────────
    const before = await cloudSessionIds(config.baseUrl);
    const beforeSet = new Set([...before.active, ...before.archived]);
    notes.push(`Cloud sessions before run: ${before.configured ? `${before.active.length} active + ${before.archived.length} archived` : 'cloud unconfigured (nothing to pollute)'}.`);
    log('cloud baseline:', before.configured ? `${before.active.length}+${before.archived.length}` : 'unconfigured');

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

    // ── 6. VERIFY — cloud session IDS after the run (no NEW ids may appear) ──
    const after = await cloudSessionIds(config.baseUrl);
    const afterSet = new Set([...after.active, ...after.archived]);
    // A leak = an id present AFTER that was absent BEFORE. (The archived top-N
    // membership can shift for unrelated reasons; only genuinely NEW ids matter.)
    const newIds = [...afterSet].filter(id => !beforeSet.has(id));
    notes.push(`Cloud sessions after run: ${after.configured ? `${after.active.length} active + ${after.archived.length} archived` : 'cloud unconfigured'} → ${newIds.length === 0 ? 'ZERO new session ids (verified clean — the tester wrote nothing to your account).' : `${newIds.length} NEW SESSION ID(S) appeared — investigate: ${newIds.join(', ')}`}`);
    notes.push(`Higgsfield (photo-credit) calls intercepted: ${run.higgsfieldCalls} (must be 0).`);
    notes.push(`Cloud write attempts intercepted + discarded: ${run.cloudWriteAttempts}.`);
    run.recordInfo({ verify: { beforeCount: beforeSet.size, afterCount: afterSet.size, newSessionIds: newIds, higgsfieldCalls: run.higgsfieldCalls, cloudWriteAttempts: run.cloudWriteAttempts } });

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
