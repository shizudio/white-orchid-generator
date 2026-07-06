// ── Resident Tester — ORACLES ────────────────────────────────────────────────
// An oracle is a cheap, deterministic check that runs AFTER an action and returns
// { ok, observed, expected? } — a violation becomes a structured defect event.
// All DOM/state reads happen inside the page (page.evaluate); this module is the
// Node-side wrapper that phrases the check and normalises the result.
//
// The oracle vocabulary is derived directly from the app's own contracts:
//   • honesty apology  — the "Honestly —" / "Actually — checking the canvas"
//     self-correction lines in components/ArtDirectorChat.jsx (WP-W0). Their
//     presence means the AI CLAIMED something the render contradicted.
//   • claim-vs-changed — the ".ad-changed" line lists the keys that ACTUALLY
//     changed; an assistant turn that narrates a change with NO changed-keys and
//     no honesty line is a silent false claim.
//   • born-clean       — a freshly generated/edited design should carry ZERO
//     deterministic advisor dots (.wo-advisor-dot-hit) unless it genuinely has a
//     readability problem; __woReadyCheck / __woBornCleanGuard are the oracle.
//   • layout invariants— scrollWidth<=innerWidth (no horizontal overflow), the
//     format strip's Y stays stable across a format switch, and the <canvas>
//     backing store matches the logical design dims (__woTruth).
//   • offer-without-execution — a reply that ENDS with an offer must carry a
//     tappable pendingOffer chip (.ad-offer-chip); an offer with no chip is the
//     WP-W1 specimen defect.

// The honesty self-correction phrases the studio emits (verbatim from
// ArtDirectorChat.jsx). Their appearance in an assistant bubble is the signal.
const HONESTY_PATTERNS = [
  /Honestly\s*—/i,
  /Actually\s*—\s*checking the canvas/i,
  /that didn't change anything visible/i,
  /the layout didn't change just now/i,
  /I couldn't (do that|apply that)/i,
];

// Narration verbs that CLAIM a change occurred (used to catch silent false claims:
// the reply says it did something but nothing changed and it didn't self-correct).
const CLAIM_PATTERNS = [
  /\bI['’]ve (changed|switched|updated|made|added|removed|set|moved|swapped)\b/i,
  /\b(changed|switched|updated|added|removed|moved|swapped) (it|the|your)\b/i,
  /\bdone\b/i, /\bhere you go\b/i, /\ball set\b/i,
];

// A serialisable browser-side probe: returns the raw signals the Node oracles judge.
// Kept as a string so it can be page.evaluate()'d without bundling.
const PROBE = `(() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const bubbles = q('.ad-msg--assistant .ad-bubble').map(el => (el.textContent || '').trim());
  const lastAssistant = bubbles[bubbles.length - 1] || '';
  const userBubbles = q('.ad-msg--user .ad-bubble').map(el => (el.textContent || '').trim());
  const changedLines = q('.ad-changed').map(el => (el.textContent || '').replace(/^changed:\\s*/, '').trim());
  const lastChanged = changedLines[changedLines.length - 1] || '';
  const offerChips = q('.ad-offer-chip').length;
  const advisorDots = q('.wo-advisor-dot-hit').length;

  // Layout invariants.
  const scrollW = document.documentElement.scrollWidth;
  const innerW = window.innerWidth;

  // Format strip vertical position (stable across format switches).
  const strip = document.querySelector('.generator-format-strip');
  const stripY = strip ? Math.round(strip.getBoundingClientRect().top) : null;

  // Canvas backing store vs logical design dims (via __woTruth if exposed).
  let truth = null, canvasBuf = null;
  try { truth = window.__woTruth ? window.__woTruth() : null; } catch (e) {}
  const cv = document.querySelector('canvas[aria-label="Interactive post preview"]');
  if (cv) canvasBuf = { w: cv.width, h: cv.height };

  // Deterministic readiness (born-clean) — findings the local checker would flag.
  let ready = null;
  try { ready = window.__woReadyCheck ? window.__woReadyCheck() : null; } catch (e) {}

  return {
    lastAssistant, bubbleCount: bubbles.length, userBubbles,
    lastChanged, changedLineCount: changedLines.length,
    offerChips, advisorDots, scrollW, innerW, stripY,
    truth, canvasBuf, ready,
  };
})()`;

// Run the browser probe and return the raw signal snapshot.
async function probe(page) {
  return page.evaluate(PROBE);
}

// ── Individual oracle judgments (pure functions over a probe snapshot) ────────

// 1. HONESTY APOLOGY — did the assistant self-correct (i.e. claim ≠ render)?
function honestyApology(snap) {
  const hit = HONESTY_PATTERNS.find(re => re.test(snap.lastAssistant));
  return {
    name: 'honesty-apology',
    ok: !hit,
    observed: hit ? snap.lastAssistant.slice(0, 200) : 'no self-correction',
    expected: 'assistant does not need to walk back a false claim',
    severity: 'high',
  };
}

// 2. CLAIM-VS-CHANGED — a reply that narrates a change must show changed keys
//    (or honestly say it couldn't). A confident claim + empty changed line +
//    no honesty phrase = a silent false claim (the trust-critical failure).
function claimVsChanged(snap, { expectChange } = {}) {
  const claims = CLAIM_PATTERNS.some(re => re.test(snap.lastAssistant));
  const honest = HONESTY_PATTERNS.some(re => re.test(snap.lastAssistant));
  const hasChangedKeys = !!snap.lastChanged;
  // Only a violation when the reply asserts a change, nothing changed, and it did
  // NOT self-correct. (An honest "I couldn't" reply is fine.)
  const violation = claims && !hasChangedKeys && !honest && expectChange !== false;
  return {
    name: 'claim-vs-changed',
    ok: !violation,
    observed: violation
      ? `claimed a change ("${snap.lastAssistant.slice(0, 120)}") but changed-keys line is empty`
      : (hasChangedKeys ? `changed: ${snap.lastChanged}` : 'no change claimed'),
    expected: 'a narrated change is backed by real changed keys',
    severity: 'high',
  };
}

// 3. BORN-CLEAN — a system-produced design should carry no deterministic advisor
//    dots. A dot means the local readiness checker found a genuine problem the
//    engine shipped (e.g. illegible text). Some dots are legitimate; we surface
//    the COUNT and flag any non-zero on a freshly composed design as low-sev
//    (the report ranks by frequency).
function bornClean(snap) {
  const findings = snap.ready && Array.isArray(snap.ready)
    ? snap.ready.reduce((n, f) => n + ((f.findings && f.findings.length) || 0), 0)
    : null;
  const dots = snap.advisorDots;
  return {
    name: 'born-clean',
    ok: dots === 0,
    observed: `${dots} advisor dot(s)` + (findings != null ? `, ${findings} ready finding(s)` : ''),
    expected: 'zero deterministic findings on a system-produced design',
    severity: 'medium',
  };
}

// 4. NO HORIZONTAL OVERFLOW — the page must never scroll sideways (dead strip /
//    layout blowout). A small fudge accounts for sub-pixel rounding.
function noHorizontalOverflow(snap) {
  const overflow = snap.scrollW - snap.innerW;
  return {
    name: 'no-horizontal-overflow',
    ok: overflow <= 2,
    observed: `scrollWidth ${snap.scrollW} vs innerWidth ${snap.innerW} (Δ${overflow})`,
    expected: 'scrollWidth <= innerWidth',
    severity: 'high',
  };
}

// 5. STRIP Y STABLE — the format strip's top must not jump when switching format
//    (the "strip jump / dead space" regression). Compared against a baseline.
function stripYStable(snap, baselineY, tolerance = 4) {
  if (snap.stripY == null || baselineY == null) {
    return { name: 'strip-y-stable', ok: true, observed: 'strip not present (n/a)', expected: 'strip Y stable', severity: 'medium' };
  }
  const drift = Math.abs(snap.stripY - baselineY);
  return {
    name: 'strip-y-stable',
    ok: drift <= tolerance,
    observed: `strip top ${snap.stripY} vs baseline ${baselineY} (drift ${drift}px)`,
    expected: `strip Y within ${tolerance}px of baseline across format switches`,
    severity: 'medium',
  };
}

// 6. CANVAS BUFFER MATCHES DIMS — the <canvas> backing store must equal the design's
//    logical dims (via __woTruth). A mismatch is the buffer/state-desync class.
function canvasBufferMatchesDims(snap, tolerance = 2) {
  const t = snap.truth, buf = snap.canvasBuf;
  if (!t || !buf || t.w == null || t.h == null) {
    return { name: 'canvas-buffer-matches-dims', ok: true, observed: 'truth/buffer unavailable (n/a)', expected: 'buffer === state dims', severity: 'medium' };
  }
  const dw = Math.abs(buf.w - t.w), dh = Math.abs(buf.h - t.h);
  const ok = dw <= tolerance && dh <= tolerance;
  return {
    name: 'canvas-buffer-matches-dims',
    ok,
    observed: `buffer ${buf.w}×${buf.h} vs truth ${t.w}×${t.h}`,
    expected: 'canvas backing store matches logical design dims',
    severity: 'high',
  };
}

// 7. OFFER-WITHOUT-EXECUTION — if the last reply ENDS with an offer ("want me to
//    switch…?"), a tappable pendingOffer chip must exist. An offer with no chip is
//    the WP-W1 dead-end specimen.
const OFFER_TAIL = /(want me to|would you like me to|shall i|should i|do you want me to)\b[^.?!]*\??\s*$/i;
function offerWithoutExecution(snap) {
  const offers = OFFER_TAIL.test(snap.lastAssistant);
  const violation = offers && snap.offerChips === 0;
  return {
    name: 'offer-without-execution',
    ok: !violation,
    observed: violation
      ? `reply ends with an offer but no tappable chip: "${snap.lastAssistant.slice(-100)}"`
      : (offers ? 'offer with a tappable chip' : 'no trailing offer'),
    expected: 'every offer carries a one-tap execution chip',
    severity: 'high',
  };
}

// 8. CONSOLE-ERRORS — surfaced from a collected console-error list (Node side).
function noConsoleErrors(errors) {
  return {
    name: 'no-console-errors',
    ok: errors.length === 0,
    observed: errors.length ? errors.slice(0, 5).join(' | ') : 'clean',
    expected: 'no console errors during the action',
    severity: 'medium',
  };
}

module.exports = {
  probe,
  honestyApology,
  claimVsChanged,
  bornClean,
  noHorizontalOverflow,
  stripYStable,
  canvasBufferMatchesDims,
  offerWithoutExecution,
  noConsoleErrors,
  HONESTY_PATTERNS,
};
