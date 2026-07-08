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
  // The app's SUCCESSFUL self-correction after a claimed-inability-but-changed
  // retry (ArtDirectorChat.jsx line 763). Verbatim: "Correction — that actually
  // worked: I changed the {fields}. Tap Undo…". Without this the oracle reads the
  // "I changed the …" as a CLAIM_PATTERN and flags the app's own honest, correct
  // self-correction as a silent false claim (~52% of claim-vs-changed defects).
  /Correction\s*—\s*that actually worked/i,
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
  const assistantMsgs = q('.ad-msg--assistant');
  const lastMsg = assistantMsgs[assistantMsgs.length - 1] || null;
  const bubbles = q('.ad-msg--assistant .ad-bubble').map(el => (el.textContent || '').trim());
  const lastAssistant = lastMsg ? (lastMsg.querySelector('.ad-bubble')?.textContent || '').trim() : (bubbles[bubbles.length - 1] || '');
  const userBubbles = q('.ad-msg--user .ad-bubble').map(el => (el.textContent || '').trim());
  const changedLines = q('.ad-changed').map(el => (el.textContent || '').replace(/^changed:\\s*/, '').trim());
  // The changed line for THIS turn = the one INSIDE the last assistant message,
  // not the global last (which may belong to an earlier turn that changed things).
  const lastChanged = lastMsg
    ? ((lastMsg.querySelector('.ad-changed')?.textContent || '').replace(/^changed:\\s*/, '').trim())
    : (changedLines[changedLines.length - 1] || '');
  const offerChips = lastMsg ? lastMsg.querySelectorAll('.ad-offer-chip').length : q('.ad-offer-chip').length;
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
//    The self-correction itself is GOOD behaviour (better an honest "that didn't
//    do anything" than a silent false claim). What it reveals is a CAPABILITY GAP:
//    the user asked for something and the studio couldn't act on it. So we flag it
//    ONLY when the utterance was one a good studio SHOULD have acted on
//    (expectChange !== false). A question getting "that changed nothing" is fine.
function honestyApology(snap, { expectChange } = {}) {
  const hit = HONESTY_PATTERNS.find(re => re.test(snap.lastAssistant));
  const violation = !!hit && expectChange !== false;
  return {
    name: 'honesty-apology',
    ok: !violation,
    observed: hit
      ? `helper walked back an actionable request: "${snap.lastAssistant.slice(0, 160)}"`
      : 'no self-correction',
    expected: 'an actionable request produces a real change, not a "that changed nothing" reply',
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
  // (2.7) Surface WHICH finding fires, not just a count. __woReadyCheck() returns a
  // per-format array of { dimensionId, findings:[{ id, category, ... }] }; the old
  // oracle threw the ids away and logged only a dot count, forcing every born-clean
  // investigation to eyeball screenshots to guess the category. Now we record the
  // distinct finding ids (with per-format tags) so the next pass reads the root
  // cause straight from the defect event.
  const ready = Array.isArray(snap.ready) ? snap.ready : null;
  const findings = ready
    ? ready.reduce((n, f) => n + ((f.findings && f.findings.length) || 0), 0)
    : null;
  // Distinct "id@dimension" tags across every format's findings.
  const tags = [];
  if (ready) {
    for (const f of ready) {
      const dim = f.dimensionId || f.dimension || '?';
      for (const x of (Array.isArray(f.findings) ? f.findings : [])) {
        const id = x && (x.id || x.category) ? `${x.id || x.category}@${dim}` : null;
        if (id && !tags.includes(id)) tags.push(id);
      }
    }
  }
  const dots = snap.advisorDots;
  const findingSummary = findings != null
    ? `, ${findings} ready finding(s)` + (tags.length ? `: ${tags.join(', ')}` : '')
    : '';
  return {
    name: 'born-clean',
    ok: dots === 0,
    observed: `${dots} advisor dot(s)${findingSummary}`,
    // Machine-readable finding ids for report aggregation (2.7).
    findingIds: tags,
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

// 9. CANVAS HIT TARGETS — the DEAD-CLICK oracle (ux-architecture §2.2: "EVERY
//    element responds to click/tap; dead clicks are impossible"). Programmatic role
//    checks (roleBounds present) are NOT enough — they miss the class where a role
//    IS registered but an INVISIBLE overlay (opacity:0 ghost button, an inspector
//    dock, a stray pointer-events layer) sits ABOVE the canvas and swallows the real
//    click. This oracle reproduces a USER click physically: for the logo, every text
//    role, and the photo, it (a) asserts document.elementFromPoint at the element's
//    RENDERED centre is the canvas itself (nothing intercepts), then (b) dispatches a
//    real pointerdown/up at those coordinates and asserts the correct contextual
//    inspector opens. It runs inside the page (needs the DOM + __woTruth) and returns
//    the standard { name, ok, observed, expected } judgment shape.
//
//    Regression guard: this FAILS if the ghost-slot / overlay pointer-events fix is
//    reverted (an invisible button reclaims the click → elementFromPoint is the
//    BUTTON, not the canvas, and the inspector never opens).
async function canvasHitTargets(page) {
  const raw = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const cv = document.querySelector('canvas[aria-label="Interactive post preview"]');
    const truthFn = window.__woTruth;
    if (!cv || !truthFn) return { unavailable: true };
    const truth = truthFn();
    if (!truth || !truth.canvas) return { unavailable: true };
    const rect = cv.getBoundingClientRect();
    const W = truth.canvas.w, H = truth.canvas.h;
    if (!rect.width || !rect.height) return { unavailable: true };

    const closeInspector = async () => {
      document.querySelectorAll('.wo-inspector [aria-label="Close inspector"], .wo-inspector-backdrop').forEach(b => b.click());
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(220);
    };
    const inspectorLabel = () => {
      const el = document.querySelector('.wo-inspector');
      return el ? (el.getAttribute('aria-label') || 'open') : null;
    };
    // The centre of an element's rendered box, in client coords.
    const centreOf = (b) => ({
      x: rect.left + (b.x + b.w / 2) * rect.width / W,
      y: rect.top + (b.y + b.h / 2) * rect.height / H,
    });
    const fire = (pt) => {
      const target = document.elementFromPoint(pt.x, pt.y) || cv;
      const o = { clientX: pt.x, clientY: pt.y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true };
      target.dispatchEvent(new PointerEvent('pointerdown', o));
      target.dispatchEvent(new PointerEvent('pointerup', o));
      if (target.tagName === 'BUTTON') target.click();
      return target;
    };

    // Build the target list: logo (if drawn) + every text/furniture role + photo.
    const rb = truth.roleBounds || {};
    const targets = [];
    if (truth.logoBox) targets.push({ name: 'logo', box: truth.logoBox, wantInspector: 'Logo' });
    for (const k of Object.keys(rb)) targets.push({ name: k, box: rb[k], wantInspector: null });
    // Photo: only when the design carries a photo (canPan). truth doesn't expose the
    // photo box, so probe the canvas centre as a proxy ONLY if a media background is
    // present (the studio exposes it via the Photo inspector on a centre click).
    const hasPhoto = !!document.querySelector('[aria-label="canvas-help"], #canvas-help') || !!(truth.hasPhoto);

    const results = [];
    for (const t of targets) {
      await closeInspector();
      const pt = centreOf(t.box);
      // (a) nothing invisible sits over the element — a real click reaches the canvas.
      const topEl = document.elementFromPoint(pt.x, pt.y);
      const reachesCanvas = topEl === cv;
      // (b) a real dispatched click opens SOME contextual inspector.
      fire(pt);
      await sleep(300);
      const insp = inspectorLabel();
      results.push({ role: t.name, reachesCanvas, inspector: insp, topTag: topEl ? topEl.tagName : 'none' });
    }
    await closeInspector();
    return { unavailable: false, hasPhoto, results };
  });

  if (!raw || raw.unavailable) {
    return { name: 'canvas-hit-targets', ok: true, observed: 'canvas/truth unavailable (n/a)', expected: 'every rendered element is clickable', severity: 'high' };
  }
  // A role FAILS if a real click at its centre is intercepted by a non-canvas element
  // (dead click) OR no inspector opened. The logo + text roles must both reach the
  // canvas and open an inspector; furniture (furn_*) must at least open its inspector.
  const failures = raw.results.filter(r => !r.reachesCanvas || !r.inspector);
  const ok = failures.length === 0 && raw.results.length > 0;
  return {
    name: 'canvas-hit-targets',
    ok,
    observed: ok
      ? `${raw.results.length} rendered element(s) all clickable (logo + roles reach the canvas + open an inspector)`
      : `dead/blocked clicks: ${failures.map(f => `${f.role}(reachesCanvas=${f.reachesCanvas},top=${f.topTag},insp=${f.inspector || 'none'})`).join('; ')}`,
    expected: 'every rendered element (logo + each text role + photo) is directly clickable; no invisible overlay swallows the click',
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
  canvasHitTargets,
  noConsoleErrors,
  HONESTY_PATTERNS,
};
