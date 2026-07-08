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
    this.higgsfieldCalls = 0;  // blocked-call counter for the MOCKED phases (must stay 0)
    this.realGenerations = 0;  // real Higgsfield generations spent in the probe (≤ cap)
    this.cloudWriteAttempts = 0;
    this.events = [];
    this.journeys = [];        // { name, ok, steps: [{ label, ok, detail }] }
    this.fuzz = [];            // { utterance, kind, oracles: [...], defects: n }
    this.realPhotoProbe = null;// [ { label, real, oracles, screenshot } ] if the probe ran
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

  // Save a screenshot the client will WANT to see (a generated design), not just a
  // defect capture. Same store, but the caller keeps the path to show in the report.
  async shotNamed(page, label) { return this.shot(page, label); }

  defects() { return this.events.filter(e => e.type === 'defect'); }
}

// ── Hardened browser context ─────────────────────────────────────────────────
// Blocks every route that would spend money or pollute cloud data, tags synthetic
// traffic, and counts LLM + Higgsfield + cloud-write attempts. Returns helpers the
// runner uses; the caller owns the browser lifecycle.
async function fortifyContext(context, run, opts = {}) {
  // In the REAL-PHOTO PROBE we DELIBERATELY allow Higgsfield through (that's the
  // whole point — a genuine, billed generation). Everywhere else it's hard-blocked.
  // Cloud-write blocking stays on in BOTH modes: the probe still must never write a
  // synthetic session to the client's account.
  const allowHiggsfield = !!opts.allowHiggsfield;
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // 1. Block Higgsfield outright — zero credits, ever — UNLESS this is the probe.
    //    (Belt: the mocked server is also launched with the keys UNSET so the route
    //    degrades to Library; the probe server is launched WITH the keys.)
    if (!allowHiggsfield && config.blockedHosts.some(h => url.includes(h))) {
      run.higgsfieldCalls++;
      run.recordInfo({ note: 'BLOCKED higgsfield call (should never happen)', url });
      return route.abort();
    }

    // 1b. (2.2) MOCK gpt-image-1 (OpenAI images) during the MOCKED phase. The
    //     assistant's new photo-change belt routes "change the photo to X" to the real
    //     generation pipeline; Higgsfield is already unset here, but the gpt-image-1
    //     FALLBACK would still bill OpenAI. Return an imageless 200 so generation
    //     degrades to the route's honest "couldn't generate" reply and the tester's
    //     zero-credit guarantee holds. The chat endpoint (/v1/responses) is untouched.
    //     The real-photo probe (allowHiggsfield) is exempt so it can spend deliberately.
    if (!allowHiggsfield && /api\.openai\.com\/v1\/images/i.test(url)) {
      run.recordInfo({ note: 'MOCKED gpt-image-1 photo gen (imageless 200 → honest refusal, zero credits)', url });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{}] }) });
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
  // (2.6) Capture the FAILING REQUEST URL for network-level failures. A bare console
  // "Failed to load resource: net::ERR_CONNECTION_REFUSED" carries NO url, so a past
  // pass couldn't tell a transient teardown/startup race from a genuinely broken
  // route. requestfailed fires for connection-level failures (refused/aborted/reset)
  // and hands us req.url() + the error text — we attach both so the oracle can
  // classify. Requests WE deliberately block (Higgsfield host aborts) are by-design,
  // never defects, so they're skipped here.
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (config.blockedHosts.some(h => url.includes(h))) return; // intentional abort
    if (/favicon/i.test(url)) return;
    const errTxt = (req.failure() && req.failure().errorText) || 'request failed';
    errors.push(`net ${errTxt} @ ${url}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // Filter noise that isn't an app defect: favicon 404s, ResizeObserver loops,
      // and the expected "cloud unconfigured" chatter from our own write-blocks.
      if (/favicon|ResizeObserver|blockedByTester|Failed to load resource.*(sessions|feedback)/i.test(t)) return;
      // (2.6) A network-level failure (net::ERR_*) is captured WITH its url by the
      // requestfailed listener above — drop the url-less console duplicate so the same
      // failure isn't counted twice AND the url-bearing record is the one kept. (HTTP
      // error responses — "responded with a status of 500" — are NOT requestfailures,
      // so they fall through and are still captured here.)
      if (/Failed to load resource:\s*net::ERR_/i.test(t)) return;
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
