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
const { runRealPhotoProbe } = require('./real-photo-probe');
const report = require('./report');

const REPO = path.resolve(__dirname, '../..');
// Isolated build dir so the tester never fights a running `next dev` over .next.
const DIST_DIR = process.env.WO_DIST_DIR || '.next-resident';
const notes = [];

// (2.9) Load .env.local into process.env for the RUNNER. Next.js auto-loads
// .env.local for `next start`, but this Node runner does NOT — so keys the runner
// itself needs (FEEDBACK_DEV_KEY, to pull real /feedback data for the report) were
// invisible even though they're set on disk. Zero-dependency parser (no dotenv):
// KEY=VALUE lines, `#` comments, optional surrounding quotes. Shell/CI env WINS —
// we only fill keys that aren't already set, so an explicit override is never
// clobbered. Silent no-op if the file is absent (CI without a local env file).
function loadEnvLocal() {
  const envPath = path.join(REPO, '.env.local');
  let raw;
  try { raw = fs.readFileSync(envPath, 'utf8'); } catch { return; }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue; // blank line or `# comment`
    const key = m[1];
    if (key in process.env && process.env[key] !== '') continue; // shell/CI override wins
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnvLocal();

function log(...a) { console.log('[resident]', ...a); }

// Launch the isolated production build. `mockPhotos:true` (default) unsets the
// Higgsfield keys so photo generation degrades to Library samples (ZERO credits);
// `mockPhotos:false` (the real-photo probe) passes the keys through, exactly as
// `next start` normally would, so genuine generations flow. Returns { server, kill }.
// The caller waits for the server and owns teardown ordering. Frees the port first
// (a lingering next-server grandchild from a prior phase would serve a stale build).
function launchServer(runDir, { mockPhotos }) {
  try { execSync(`lsof -ti:${config.port} | xargs kill -9`, { stdio: 'ignore' }); } catch {}
  const env = { ...process.env, WO_DIST_DIR: DIST_DIR, PORT: String(config.port) };
  if (mockPhotos) { env.HIGGSFIELD_API_KEY = ''; env.HIGGSFIELD_API_SECRET = ''; }
  log(`starting: next start -p ${config.port} (${mockPhotos ? 'Higgsfield keys unset → photo gen MOCKED' : 'Higgsfield keys LIVE → REAL photo probe'})`);
  // detached:true → the child leads its own process group so we can signal the whole
  // tree (npx + next-server grandchild) on teardown and never orphan it.
  const server = spawn('npx', ['next', 'start', '-p', String(config.port)], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const serverLogPath = path.join(runDir, mockPhotos ? 'server.log' : 'server-probe.log');
  const serverLog = fs.createWriteStream(serverLogPath, { flags: 'a' });
  server.stdout.pipe(serverLog); server.stderr.pipe(serverLog);
  const kill = () => {
    // Kill the server's process group (negative pid) so the next-server GRANDCHILD
    // dies too. We do NOT `lsof -ti:PORT | kill` — this runner holds client sockets
    // to the port, so that would SIGKILL us (the 137 self-destruct bug).
    try { process.kill(-server.pid, 'SIGKILL'); } catch {}
    try { server.kill('SIGKILL'); } catch {}
  };
  return { server, kill, serverLogPath };
}

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

// (WP-Z) Pull real HUMAN /feedback notes for the report's "Human feedback" section.
// Dev-gated: the API GET requires ?key=<FEEDBACK_DEV_KEY>. If the key is unset, or
// the store is unconfigured/unreachable, this resolves to null and the report
// section no-ops gracefully. Returns only user_feedback events (+ their addenda).
function fetchHumanFeedback(baseUrl) {
  return new Promise((resolve) => {
    const key = process.env.FEEDBACK_DEV_KEY;
    if (!key) return resolve(null); // not configured → the section is skipped
    http.get(`${baseUrl}/api/feedback?key=${encodeURIComponent(key)}&limit=200`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          if (!j || j.configured === false || !Array.isArray(j.events)) return resolve(null);
          resolve(j.events);
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  const startedAt = Date.now();
  const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = path.join(__dirname, 'runs', stamp);
  fs.mkdirSync(runDir, { recursive: true });
  const run = new Run(runDir);
  log('run dir:', runDir);

  const NIGHTLY = config.nightly;
  const probeOnly = process.argv.includes('--probe-only'); // verification/debug: skip the mocked phase
  log(`mode: ${NIGHTLY ? 'NIGHTLY' : 'SMOKE'}${probeOnly ? ' (probe-only)' : ''}  ·  real-photo cap: ${config.realPhotos}`);
  notes.push(`Run mode: ${NIGHTLY ? 'nightly deep sweep' : 'deploy smoke'}. Real-photo generations budgeted this run: ${config.realPhotos} (hard cap ${config.realPhotosHardCap}).`);

  // Guard: refuse to start against a build that is missing its BUILD_ID (a
  // half-written .next from an interrupted build serves MODULE_NOT_FOUND 500s and
  // would make every journey look broken). Fail loud instead of testing a ghost.
  if (!fs.existsSync(path.join(REPO, DIST_DIR, 'BUILD_ID'))) {
    console.error(`[resident] ${DIST_DIR}/BUILD_ID missing — build first: WO_DIST_DIR=${DIST_DIR} next build (or \`npm run test:resident\`).`);
    process.exit(2);
  }

  const { chromium } = require('playwright');
  let browser;
  let currentKill = null;
  let cleaned = false;
  let humanFeedback = null; // (WP-Z) real /feedback notes for the report (null → section skipped)
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    try { if (browser) browser.close(); } catch {}
    try { if (currentKill) currentKill(); } catch {}
  };
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  // ── PHASE A — MOCKED sweep (journeys + persona fuzzing) ───────────────────
  // Photos hard-mocked → zero credits. In NIGHTLY we run the full pool twice.
  if (!probeOnly) {
    const { kill } = launchServer(runDir, { mockPhotos: true });
    currentKill = kill;
    try {
      await waitForServer(config.baseUrl + '/', 90000);
      log('server up (mocked) at', config.baseUrl);

      // VERIFY BASELINE — cloud session IDS before the run.
      const before = await cloudSessionIds(config.baseUrl);
      const beforeSet = new Set([...before.active, ...before.archived]);
      notes.push(`Cloud sessions before run: ${before.configured ? `${before.active.length} active + ${before.archived.length} archived` : 'cloud unconfigured (nothing to pollute)'}.`);
      log('cloud baseline:', before.configured ? `${before.active.length}+${before.archived.length}` : 'unconfigured');

      // (WP-Z) Pull real human /feedback notes while the server is live (for the
      // report's "Human feedback" section). Graceful null when the key/store is
      // absent — the section then no-ops.
      humanFeedback = await fetchHumanFeedback(config.baseUrl);
      log('human feedback:', humanFeedback == null ? 'unavailable (skipping section)' : `${humanFeedback.length} event(s)`);

      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: 'WhiteOrchidResidentTester/1.0' });
      await fortifyContext(context, run); // Higgsfield BLOCKED here
      const page = await context.newPage();
      const cons = captureConsole(page);

      // Golden journeys (every run).
      log('running golden journeys…');
      await runJourneys(page, run, cons, config.baseUrl);
      log(`journeys done — ${run.defects().length} defect(s) so far; elapsed ${(run.elapsedMs() / 1000).toFixed(0)}s`);

      // Persona fuzzing. SMOKE: full pool once. NIGHTLY: full pool × nightlyPasses.
      const passes = NIGHTLY ? config.fuzz.nightlyPasses : 1;
      for (let pass = 1; pass <= passes; pass++) {
        if (run.overBudget()) { notes.push(`Fuzzing pass ${pass}+ skipped — reached the time/spend cap.`); break; }
        log(`running persona fuzzing (pass ${pass}/${passes})…`);
        // Trim target only if the clock is genuinely tight (leave 3 min headroom).
        const remainingMs = config.budget.wallClockMs - run.elapsedMs();
        const roomFor = Math.floor((remainingMs - 3 * 60000) / 20000); // ~20s/turn budget
        const target = Math.max(config.fuzz.minSamples, Math.min(config.fuzz.targetSamples, roomFor));
        notes.push(`Fuzzing pass ${pass}/${passes}: up to ${Number.isFinite(target) ? target : 'full pool'} utterances (full pool = ${require('./personas').length}).`);
        await runFuzz(page, run, cons, { targetSamples: target, minSamples: config.fuzz.minSamples });
      }
      log(`fuzz done — ${run.fuzz.length} utterances; ${run.defects().length} total defect(s)`);

      // VERIFY — cloud session IDS after the run (no NEW ids may appear).
      const after = await cloudSessionIds(config.baseUrl);
      const afterSet = new Set([...after.active, ...after.archived]);
      const newIds = [...afterSet].filter(id => !beforeSet.has(id));
      notes.push(`Cloud sessions after run: ${after.configured ? `${after.active.length} active + ${after.archived.length} archived` : 'cloud unconfigured'} → ${newIds.length === 0 ? 'ZERO new session ids (verified clean — the tester wrote nothing to your account).' : `${newIds.length} NEW SESSION ID(S) appeared — investigate: ${newIds.join(', ')}`}`);
      notes.push(`Higgsfield calls intercepted during the MOCKED phase: ${run.higgsfieldCalls} (must be 0).`);
      notes.push(`Cloud write attempts intercepted + discarded: ${run.cloudWriteAttempts}.`);
      run.recordInfo({ verify: { beforeCount: beforeSet.size, afterCount: afterSet.size, newSessionIds: newIds, higgsfieldCalls: run.higgsfieldCalls, cloudWriteAttempts: run.cloudWriteAttempts } });

      await context.close();
      await browser.close(); browser = null;
    } catch (e) {
      log('MOCKED PHASE ERROR:', e.message);
      notes.push('Mocked-phase error: ' + e.message);
      run.recordInfo({ error: e.message, stack: e.stack, phase: 'mocked' });
    } finally {
      if (currentKill) { currentKill(); currentKill = null; }
    }
  }

  // ── PHASE B — REAL-PHOTO PROBE (nightly only; hard-capped Higgsfield spend) ─
  // A SEPARATE server started WITH the real keys, so genuine generations flow. At
  // most config.realPhotos (≤3) generations. Everything else already ran mocked.
  if (config.realPhotos > 0) {
    log(`starting REAL-PHOTO PROBE (cap ${config.realPhotos})…`);
    const { kill, serverLogPath } = launchServer(runDir, { mockPhotos: false });
    currentKill = kill;
    try {
      await waitForServer(config.baseUrl + '/', 90000);
      log('server up (REAL keys) at', config.baseUrl);
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: 'WhiteOrchidResidentTester/1.0' });
      await fortifyContext(context, run, { allowHiggsfield: true }); // real photos allowed; cloud writes still blocked
      const page = await context.newPage();
      const cons = captureConsole(page);

      const probe = await runRealPhotoProbe(page, run, cons, config.baseUrl, serverLogPath);
      run.realPhotoProbeSummary = probe;
      if (probe.degraded) notes.push(`Real-photo probe note: ${probe.degraded}`);
      notes.push(`Real Higgsfield generations spent this run: ${run.realGenerations} (cap ${config.realPhotos}).`);
      log(`real-photo probe done — ${run.realGenerations} generation(s) spent, ${probe.generations.length} evaluated`);

      await context.close();
      await browser.close(); browser = null;
    } catch (e) {
      log('PROBE PHASE ERROR:', e.message);
      notes.push('Real-photo probe degraded (error): ' + e.message + ` — spent ${run.realGenerations} generation(s).`);
      run.recordInfo({ error: e.message, stack: e.stack, phase: 'probe' });
    } finally {
      if (currentKill) { currentKill(); currentKill = null; }
    }
  }

  cleanup();

  // ── Write the client-facing report ────────────────────────────────────────
  const md = report.generate(run, { notes, nightly: NIGHTLY, humanFeedback });
  const dateStr = new Date(run.startedAt).toISOString().slice(0, 10);
  const kind = NIGHTLY ? 'nightly' : 'smoke';
  const reportPath = path.join(REPO, 'docs', 'resident-tester', `${kind}-report-${dateStr}.md`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, md);
  fs.writeFileSync(path.join(runDir, 'report.md'), md);

  log('─'.repeat(60));
  log(`DONE — ${run.defects().length} defect(s), ${run.fuzz.length} utterances, ${run.realGenerations} real photo(s), ${(run.elapsedMs() / 60000).toFixed(1)} min, ~$${run.estCostUsd().toFixed(2)}`);
  log('report:', path.relative(REPO, reportPath));
  log('events:', path.relative(REPO, run.eventsPath));
  process.exit(0);
}

main().catch((e) => { console.error('[resident] FATAL', e); process.exit(1); });
