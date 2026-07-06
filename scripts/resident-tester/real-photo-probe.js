// ── Resident Tester — REAL-PHOTO PROBE ───────────────────────────────────────
// A distinct nightly phase that pays for a HARD-CAPPED handful of GENUINE
// Higgsfield generations, so the client can see real, freshly generated images in
// the report (the rest of the nightly stays fully mocked). The client asked for
// "real image generation in the loop"; this is that loop, fenced off from the free
// mocked run so it can never spend more than `config.realPhotos` (≤3) generations.
//
// WHAT IT DOES (given a running server started WITH the real keys):
//   1. Landing generation with a PHOTO-LED brief → the studio calls Higgsfield,
//      QCs the result, warm-grades it, composes the post, hands off to the editor.
//   2. One "Refresh photo" in the editor → a second real generation on the same
//      scene (reuses the Try-another plumbing: fetchScenePhoto + applyGeneratedImage).
//   Each real generation is COUNTED; the phase stops the instant the cap is hit.
//
// ORACLES on the results: the photo is actually PRESENT and REAL (a base64 photo
// off /api/design-generate, not a Library fallback), born-clean, no console/server
// errors, honesty clean. The generated design screenshot is SAVED into the run dir.
//
// SAFETY: the caller owns the server lifecycle and the credit budget. This module
// refuses to fire a generation once `run.realGenerations >= config.realPhotos`, and
// the runner also caps `config.realPhotos` at 3. Belt AND suspenders.

const O = require('./oracles');
const config = require('./config');

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// Photo-led briefs — worded so the landing plan attaches a scenePrompt (i.e. the
// design is PHOTO-first, forcing the Higgsfield path rather than a solid field).
const PHOTO_BRIEFS = [
  'A warm welcome-back post with a big photo of children painting at easels in a bright sunlit classroom',
  'An open house invite with a full-bleed photo of toddlers playing outdoors in a leafy garden',
  'A thank-you-to-parents post with a soft photo of kids reading together on a cosy rug',
];

// Detect whether a completed generation is a REAL Higgsfield photo vs a Library
// fallback. Best-effort, layered:
//   • network truth (strongest): we saw a /api/design-generate GET return
//     { status:'done', imageDataUrl } during this generation → real.
//   • DOM truth (fallback): the applied canvas background is a base64 PNG data URL
//     (the generate route only ever returns image/png; Library photos are jpeg
//     assets or hosted URLs) → real. If neither holds we report best-effort.
function photoIsReal(netSawDone, appliedSrc) {
  if (netSawDone) return { real: true, how: 'network: /api/design-generate returned a done photo' };
  if (typeof appliedSrc === 'string' && /^data:image\/png;base64,/.test(appliedSrc)) {
    return { real: true, how: 'applied background is a PNG data URL (generate-route shape)' };
  }
  return { real: false, how: 'no generate-route photo observed — likely Library fallback' };
}

// Read the applied background image source off the running app (best-effort). The
// editor keeps the current media in state; we surface it via a tiny page probe.
async function appliedImageSrc(page) {
  return page.evaluate(() => {
    try {
      // The editor exposes render truth; the raw image element/src is the surest
      // signal of what's actually painted. Probe a few likely holders.
      const cv = document.querySelector('canvas[aria-label="Interactive post preview"]');
      // The app stashes the last-applied source on a debug hook when present.
      if (window.__woAppliedImageSrc) return window.__woAppliedImageSrc();
      // Fallback: any <img> the editor mounted for the current media.
      const img = document.querySelector('img[data-wo-media], .wo-media img, .generator-media img');
      if (img && img.src) return img.src;
      return cv ? '(canvas-only; src not exposed)' : null;
    } catch { return null; }
  });
}

// ── Network watcher: count real generations + notice a completed photo ─────────
// Attaches to the page's responses. Returns { installed teardown, snapshot }.
function watchGenerations(page, run) {
  const state = { starts: 0, dones: 0, failures: 0, sawDoneSinceReset: false, lastError: null };
  const onResp = async (resp) => {
    const url = resp.url();
    if (!url.includes('/api/design-generate')) return;
    const method = resp.request().method();
    try {
      const json = await resp.json().catch(() => null);
      if (!json) return;
      if (method === 'POST') {
        // A POST that returns a jobId IS a submitted (billable) generation.
        if (json.jobId) { state.starts++; run.realGenerations++; run.recordInfo({ note: 'REAL Higgsfield generation submitted', jobId: json.jobId, total: run.realGenerations }); }
        else if (json.unconfigured) state.lastError = 'unconfigured (keys not seen by server)';
        else if (json.failed) { state.failures++; state.lastError = 'failed (quota / upstream)'; }
      } else if (method === 'GET') {
        if (json.status === 'done' && json.imageDataUrl) { state.dones++; state.sawDoneSinceReset = true; }
        else if (json.status === 'failed' || json.status === 'qc_failed') { state.failures++; state.lastError = json.status; }
      }
    } catch { /* non-JSON — ignore */ }
  };
  page.on('response', onResp);
  return {
    reset() { state.sawDoneSinceReset = false; },
    snapshot() { return { ...state }; },
    teardown() { page.off('response', onResp); },
  };
}

// ── The probe ────────────────────────────────────────────────────────────────
// `page` is a hardened context page EXCEPT that Higgsfield is NOT route-blocked
// (the caller builds a probe-mode context). `serverLog` is the server.log path so
// we can scan it for server-side errors after the generations.
async function runRealPhotoProbe(page, run, cons, baseUrl, serverLog) {
  const cap = config.realPhotos;
  const results = { attempted: 0, cap, generations: [], degraded: null, screenshots: [] };
  if (cap <= 0) { results.degraded = 'real-photo probe skipped (cap is 0 — this run is fully mocked)'; return results; }

  const watch = watchGenerations(page, run);

  try {
    // ── Generation #1: landing generation with a photo-led brief ─────────────
    if (run.realGenerations < cap) {
      watch.reset();
      const brief = PHOTO_BRIEFS[0];
      await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
      await settle(1200);
      let submitted = false;
      try {
        const ta = await page.$('textarea[aria-label="Describe the post you want to create"]');
        if (ta) {
          await ta.click(); await ta.fill(brief);
          const send = await page.$('button[aria-label="Send"]');
          if (send) await send.click(); else await page.keyboard.press('Enter');
          submitted = true;
        }
      } catch (e) { results.degraded = 'landing submit failed: ' + e.message; }

      if (submitted) {
        // The photo phase runs ~20–45s; wait generously for the studio to mount.
        await page.waitForURL('**/generate', { timeout: 120000 }).catch(() => {});
        await page.waitForSelector('canvas[aria-label="Interactive post preview"]', { timeout: 60000 }).catch(() => {});
        await settle(3000); // let the generated photo apply + harmonizer settle

        const net = watch.snapshot();
        const applied = await appliedImageSrc(page);
        const real = photoIsReal(net.sawDoneSinceReset, applied);
        const snap = await O.probe(page);
        const shot = await run.shotNamed(page, 'real-photo-01-landing');
        if (shot) results.screenshots.push(shot);
        const consErrs = cons.drain();

        const checks = [
          O.bornClean(snap),
          O.noHorizontalOverflow(snap),
          O.canvasBufferMatchesDims(snap),
          O.honestyApology(snap, { expectChange: true }),
          O.noConsoleErrors(consErrs),
        ];
        recordProbeGeneration(run, results, {
          label: 'landing generation (photo-led brief)', brief, real, net,
          checks, screenshot: shot, consoleErrors: consErrs,
        });
      }
    }

    // ── Generation #2: "Refresh photo" in the editor (same scene) ────────────
    if (run.realGenerations < cap) {
      watch.reset();
      let refreshed = false;
      try {
        // Ensure we're in the editor with a photo-bearing design.
        await page.waitForSelector('canvas[aria-label="Interactive post preview"]', { timeout: 15000 }).catch(() => {});
        const btn = await page.$('button[aria-label="Refresh photo"]');
        if (btn) {
          const disabled = await btn.evaluate((el) => el.disabled).catch(() => false);
          if (!disabled) { await btn.click(); refreshed = true; }
        }
      } catch (e) { results.degraded = (results.degraded ? results.degraded + '; ' : '') + 'refresh click failed: ' + e.message; }

      if (refreshed) {
        // Refresh genuinely runs ~20s; poll for the generation to resolve.
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline) {
          await settle(2000);
          const n = watch.snapshot();
          if (n.sawDoneSinceReset || n.failures > 0) break;
        }
        await settle(2500);
        const net = watch.snapshot();
        const applied = await appliedImageSrc(page);
        const real = photoIsReal(net.sawDoneSinceReset, applied);
        const snap = await O.probe(page);
        const shot = await run.shotNamed(page, 'real-photo-02-refresh');
        if (shot) results.screenshots.push(shot);
        const consErrs = cons.drain();

        const checks = [
          O.bornClean(snap),
          O.noHorizontalOverflow(snap),
          O.canvasBufferMatchesDims(snap),
          O.honestyApology(snap, { expectChange: true }),
          O.noConsoleErrors(consErrs),
        ];
        recordProbeGeneration(run, results, {
          label: 'refresh photo (same scene)', brief: PHOTO_BRIEFS[0], real, net,
          checks, screenshot: shot, consoleErrors: consErrs,
        });
      } else if (!results.degraded) {
        results.degraded = 'Refresh photo control not available (design was not photo-bearing).';
      }
    }
  } finally {
    watch.teardown();
  }

  // ── Server-side error scan (best-effort) — the probe is where real upstream
  //    failures (auth, quota, 5xx) surface, so we quote the server log tail.
  try {
    const fs = require('fs');
    const raw = fs.readFileSync(serverLog, 'utf8').split('\n');
    const errLines = raw.filter((l) => /error|exception|higgsfield|401|403|429|5\d\d/i.test(l)).slice(-8);
    results.serverErrors = errLines;
  } catch { results.serverErrors = []; }

  // If we spent nothing AND saw no design at all, say so clearly (quota/keys).
  if (results.generations.length === 0 && !results.degraded) {
    results.degraded = 'No real generation completed — the API may be out of quota or the keys were not picked up.';
  }
  return results;
}

// Record one probe generation: attach its oracle results, flag violations as
// defects, and note whether the photo came through the REAL pipeline.
function recordProbeGeneration(run, results, { label, brief, real, net, checks, screenshot, consoleErrors }) {
  results.attempted++;
  const violations = checks.filter((c) => !c.ok);
  for (const c of violations) {
    run.recordDefect({
      journey: 'real-photo-probe', utterance: label, oracle: c.name,
      expected: c.expected, observed: c.observed, screenshot,
      console: consoleErrors, severity: c.severity,
    });
  }
  // A Library fallback in the PROBE (where we're paying for a real photo) is itself
  // worth flagging — the client asked to SEE real generations, and a fallback means
  // the real pipeline didn't deliver one.
  if (!real.real) {
    run.recordDefect({
      journey: 'real-photo-probe', utterance: label, oracle: 'real-photo-present',
      expected: 'the probe produces a genuine Higgsfield photo (not a Library fallback)',
      observed: real.how, screenshot, console: consoleErrors, severity: 'medium',
    });
  }
  const rec = {
    label, brief, real: real.real, realHow: real.how,
    generationsSubmitted: net.starts, completed: net.dones, failures: net.failures,
    lastError: net.lastError, defects: violations.length,
    oracles: checks.map((c) => ({ name: c.name, ok: c.ok, observed: c.ok ? undefined : c.observed })),
    screenshot,
  };
  results.generations.push(rec);
  run.realPhotoProbe = run.realPhotoProbe || [];
  run.realPhotoProbe.push(rec);
}

module.exports = { runRealPhotoProbe, PHOTO_BRIEFS };
