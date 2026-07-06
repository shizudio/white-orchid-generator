// ── Resident Tester — PERSONA FUZZING ────────────────────────────────────────
// Sample realistic preschool-staff utterances, send each through the REAL editor
// chat (the same /api/assistant path a client uses), and run the oracle battery
// after every turn. Budget-capped: trims the sample to fit the wall-clock / spend
// caps. Each utterance's result is recorded for the report; every oracle violation
// becomes a structured defect event.

const O = require('./oracles');
const { sendChat } = require('./journeys');
const personas = require('./personas');

// Deterministic-ish sample: shuffle with a fixed-ish seed derived from the pool so
// runs are varied but reproducible enough to compare. (A smoke run wants coverage,
// not strict determinism, so plain Math.random shuffle is fine.)
function sample(arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy.slice(0, Math.min(n, copy.length));
}

async function runFuzz(page, run, cons, { targetSamples, minSamples }) {
  const pool = sample(personas, targetSamples);
  const results = [];

  for (const p of pool) {
    // Stop early if either hard cap is reached; keep whatever we have.
    if (run.overBudget()) { run.recordInfo({ note: 'fuzz halted — over budget', elapsedMs: run.elapsedMs(), estCostUsd: run.estCostUsd() }); break; }

    let got = false, err = null;
    try { got = await sendChat(page, p.text); }
    catch (e) { err = e.message; }

    const snap = await O.probe(page);
    const consoleErrors = cons.drain();

    const checks = [
      O.honestyApology(snap),
      O.claimVsChanged(snap, { expectChange: p.expectChange }),
      O.offerWithoutExecution(snap),
      O.noHorizontalOverflow(snap),
      O.canvasBufferMatchesDims(snap),
      O.bornClean(snap),
      O.noConsoleErrors(consoleErrors),
    ];

    const violations = checks.filter(c => !c.ok);
    let shot = null;
    if (violations.length || !got) shot = await run.shot(page, `fuzz-${p.kind}-${p.text}`);
    for (const c of violations) {
      run.recordDefect({
        journey: 'persona-fuzz', utterance: p.text, oracle: c.name,
        expected: c.expected, observed: c.observed, screenshot: shot,
        console: consoleErrors, severity: c.severity,
      });
    }

    const rec = {
      utterance: p.text, kind: p.kind, expectChange: p.expectChange,
      replied: got, reply: (snap.lastAssistant || '').slice(0, 220),
      changed: snap.lastChanged || '', defects: violations.length,
      oracles: checks.map(c => ({ name: c.name, ok: c.ok, observed: c.ok ? undefined : c.observed })),
      error: err,
    };
    results.push(rec);
    run.fuzz.push(rec);
  }

  if (results.length < minSamples) {
    run.recordInfo({ note: `fuzz produced only ${results.length} samples (< min ${minSamples})` });
  }
  return results;
}

module.exports = { runFuzz };
