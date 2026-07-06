// ── Resident Tester — harness ────────────────────────────────────────────────
// Cross-cutting run infrastructure: the defect-event recorder, the budget/clock
// guard, and the hardened browser context (cloud-write + Higgsfield blocking,
// synthetic marker, console capture). Nothing here touches app code — the tester
// is a standalone surface that only READS the running app.

const fs = require('fs');
const path = require('path');
const config = require('./config');

// ── Run state ────────────────────────────────────────────────────────────────
class Run {
  constructor(runDir) {
    this.runDir = runDir;
    this.shotDir = path.join(runDir, 'screenshots');
    fs.mkdirSync(this.shotDir, { recursive: true });
    this.eventsPath = path.join(runDir, 'events.jsonl');
    this.startedAt = Date.now();
    this.llmCalls = 0;         // counted from network (assistant + landing plan)
    this.higgsfieldCalls = 0;  // must stay 0
    this.cloudWriteAttempts = 0;
    this.events = [];
    this.journeys = [];        // { name, ok, steps: [{ label, ok, detail }] }
    this.fuzz = [];            // { utterance, kind, oracles: [...], defects: n }
    this.shotSeq = 0;
  }

  elapsedMs() { return Date.now() - this.startedAt; }
  estCostUsd() { return this.llmCalls * config.budget.usdPerLlmCall; }

  // True when either hard cap is reached; the runner trims/stops on this.
  overBudget() {
    return this.elapsedMs() >= config.budget.wallClockMs
        || this.estCostUsd() >= config.budget.estCostUsd;
  }

  // Record a structured defect event (one oracle violation). Appended to the
  // JSONL immediately so a crash still leaves a partial record.
  recordDefect({ journey, utterance, oracle, expected, observed, screenshot, console: cons, severity }) {
    const evt = {
      ts: new Date().toISOString(),
      type: 'defect',
      journey: journey || null,
      utterance: utterance || null,
      oracle,
      expected: expected || null,
      observed: observed || null,
      screenshot: screenshot ? path.relative(this.runDir, screenshot) : null,
      console: (cons || []).slice(0, 8),
      severity: severity || 'medium',
    };
    this.events.push(evt);
    fs.appendFileSync(this.eventsPath, JSON.stringify(evt) + '\n');
    return evt;
  }

  recordInfo(obj) {
    const evt = { ts: new Date().toISOString(), type: 'info', ...obj };
    fs.appendFileSync(this.eventsPath, JSON.stringify(evt) + '\n');
  }

  // Save a screenshot; returns its absolute path (or null on failure).
  async shot(page, label) {
    const safe = String(label).replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 50);
    const file = path.join(this.shotDir, `${String(++this.shotSeq).padStart(3, '0')}-${safe}.png`);
    try { await page.screenshot({ path: file, fullPage: false }); return file; }
    catch { return null; }
  }

  defects() { return this.events.filter(e => e.type === 'defect'); }
}

// ── Hardened browser context ─────────────────────────────────────────────────
// Blocks every route that would spend money or pollute cloud data, tags synthetic
// traffic, and counts LLM + Higgsfield + cloud-write attempts. Returns helpers the
// runner uses; the caller owns the browser lifecycle.
async function fortifyContext(context, run) {
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // 1. Block Higgsfield outright — zero credits, ever. (Belt: the server is also
    //    launched with the Higgsfield keys UNSET so the route degrades to Library.)
    if (config.blockedHosts.some(h => url.includes(h))) {
      run.higgsfieldCalls++;
      run.recordInfo({ note: 'BLOCKED higgsfield call (should never happen)', url });
      return route.abort();
    }

    // 2. Block cloud WRITES (sessions/feedback POST) so synthetic junk never reaches
    //    the client's Supabase brand. We COUNT the attempt then fulfil a fake OK so
    //    the app's fire-and-forget logic is undisturbed.
    for (const w of config.blockedApiWrites) {
      if (url.includes(w.path) && w.methods.includes(method)) {
        run.cloudWriteAttempts++;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ configured: false, blockedByTester: true }),
        });
      }
    }

    // 3. Count LLM calls (assistant chat + landing plan both hit /api/assistant).
    if (url.includes('/api/assistant') && method === 'POST') run.llmCalls++;

    return route.continue();
  });

  // Tag every page: a localStorage marker the app's harness mode can honor if it
  // chooses, plus a query the runner appends. This is defence-in-depth; the route
  // blocks above are the real guarantee.
  await context.addInitScript((marker) => {
    try { window.localStorage.setItem('wo-synthetic', marker); } catch (e) {}
    window.__WO_RESIDENT_TESTER__ = marker;
  }, config.syntheticMarker);
}

// Attach console-error capture to a page; returns { drain } to pull+clear errors.
function captureConsole(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // Filter noise that isn't an app defect: favicon 404s, ResizeObserver loops,
      // and the expected "cloud unconfigured" chatter from our own write-blocks.
      if (/favicon|ResizeObserver|blockedByTester|Failed to load resource.*(sessions|feedback)/i.test(t)) return;
      errors.push(t);
    }
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + (err.message || String(err))));
  return {
    drain() { const out = errors.slice(); errors.length = 0; return out; },
    peek() { return errors.slice(); },
  };
}

module.exports = { Run, fortifyContext, captureConsole };
