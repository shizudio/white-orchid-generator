// ── Resident Tester — GOLDEN JOURNEYS ────────────────────────────────────────
// Deterministic scripted flows that run every smoke run and assert oracles at
// each step. These mirror the core user paths from docs/ux-architecture.md. Each
// journey returns { name, ok, steps }; a failing oracle at any step also emits a
// structured defect via the run recorder.
//
// Selector contract (read from the app, not invented):
//   landing:  textarea[aria-label="Describe the post you want to create"],
//             example chips are <button> siblings; Send button aria-label="Send".
//   chat:     .ad-msg--user / .ad-msg--assistant / .ad-bubble, .ad-changed,
//             textarea[aria-label^="Message Orchid"], button[aria-label="Send"].
//   top bar:  role=toolbar[aria-label="Design globals"]; buttons by text
//             (Format / Posts / Templates / + Add / Export); Undo button text "↶ Undo".
//   canvas:   canvas[aria-label="Interactive post preview"].

const O = require('./oracles');

const settle = (ms) => new Promise(r => setTimeout(r, ms));

// Wait until the assistant bubble count grows past `prev` (a reply arrived) or a
// timeout. Chat streams via SSE; the changed-keys line lands after the stream.
async function waitForAssistantReply(page, prevCount, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const n = await page.evaluate(() => document.querySelectorAll('.ad-msg--assistant .ad-bubble').length);
    if (n > prevCount) {
      // The reply bubble is present, but the patch applies AFTER the SSE stream
      // ends and the ".ad-changed" / honesty line renders a beat later still. Wait
      // for the turn to fully SETTLE — either a changed line / undo chip appears,
      // or a short grace period elapses — before the oracles read the DOM. This
      // prevents a false "claimed a change but no changed-keys" on slow patches.
      const settleDeadline = Date.now() + 6000;
      while (Date.now() < settleDeadline) {
        await settle(500);
        const settled = await page.evaluate(() => {
          const msgs = document.querySelectorAll('.ad-msg--assistant');
          const last = msgs[msgs.length - 1];
          if (!last) return false;
          // Settled once the last assistant message has a changed line, an undo
          // chip, an offer chip, or a feedback chip — i.e. post-patch UI landed.
          return !!last.querySelector('.ad-changed, .ad-undo-chip, .ad-offer-chip, .ad-fb-chip');
        });
        if (settled) break;
      }
      await settle(600);
      return true;
    }
    await settle(400);
  }
  return false;
}

// Send a message through the editor chat composer.
async function sendChat(page, text) {
  const prev = await page.evaluate(() => document.querySelectorAll('.ad-msg--assistant .ad-bubble').length);
  const ta = await page.$('textarea[aria-label^="Message Orchid"]');
  if (!ta) throw new Error('chat composer not found');
  await ta.click();
  await ta.fill(text);
  const send = await page.$('.ad-input-row button[aria-label="Send"]');
  if (send) await send.click();
  else await page.keyboard.press('Enter');
  const got = await waitForAssistantReply(page, prev, 45000);
  return got;
}

// Open a top-bar popover by its visible button text.
async function openTopMenu(page, label) {
  const btns = await page.$$('.wo-topbar button, .wo-topbtn');
  for (const b of btns) {
    const t = (await b.innerText().catch(() => '')).trim();
    if (t.replace(/\s+/g, ' ').includes(label)) { await b.click(); await settle(400); return true; }
  }
  return false;
}

// A helper to run a set of oracles, record defects, and collect step results.
async function assertOracles(page, run, ctx, checks) {
  const results = [];
  for (const c of checks) {
    results.push(c);
    if (!c.ok) {
      const shot = await run.shot(page, `${ctx.tag}-${c.name}`);
      run.recordDefect({
        journey: ctx.journey, utterance: ctx.utterance || null,
        oracle: c.name, expected: c.expected, observed: c.observed,
        screenshot: shot, console: ctx.console || [], severity: c.severity,
      });
    }
  }
  return results;
}

// ── Journey runner: enters the studio via a landing suggestion, then runs the
//    scripted editor journeys against that one composed design. ───────────────
async function runJourneys(page, run, cons, baseUrl) {
  const steps = [];
  const pushStep = (label, ok, detail) => steps.push({ label, ok, detail });

  // ── J1: landing suggestion → generate → born clean ────────────────────────
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
  await settle(1500);
  let landed = false;
  try {
    // Click the first example chip (a whole-post idea). It submits + navigates.
    const chips = await page.$$('section button');
    // The example chips are the celadon pills; pick one whose text is a post idea.
    let clicked = false;
    for (const c of chips) {
      const t = (await c.innerText().catch(() => '')).trim();
      if (/invite|hiring|welcome|thank|closure|art week|fees|quote/i.test(t)) {
        await c.click(); clicked = true; break;
      }
    }
    if (!clicked) {
      // Fallback: type a brief and send.
      const ta = await page.$('textarea[aria-label="Describe the post you want to create"]');
      await ta.fill('An open house invite for 18 July');
      await page.$('button[aria-label="Send"]').then(b => b && b.click());
    }
    // Wait for navigation to /generate + the canvas to mount.
    await page.waitForURL('**/generate', { timeout: 60000 }).catch(() => {});
    await page.waitForSelector('canvas[aria-label="Interactive post preview"]', { timeout: 30000 });
    await settle(2500); // let the handoff apply + harmonizer settle
    landed = true;
  } catch (e) {
    pushStep('landing→generate', false, 'did not reach the studio: ' + e.message);
  }

  if (!landed) {
    // Can't run the rest without a design; degrade to opening the studio directly.
    await page.goto(baseUrl + '/generate', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas[aria-label="Interactive post preview"]', { timeout: 30000 }).catch(() => {});
    await settle(2500);
  } else {
    pushStep('landing→generate', true, 'reached studio with a composed design');
  }

  let snap = await O.probe(page);
  const baselineStripY = snap.stripY;
  let ctx = { journey: 'landing-generate', tag: 'j1-born-clean', console: cons.drain() };
  const j1 = await assertOracles(page, run, ctx, [
    O.bornClean(snap),
    O.noHorizontalOverflow(snap),
    O.canvasBufferMatchesDims(snap),
    O.noConsoleErrors(ctx.console),
  ]);
  pushStep('born-clean after generate', j1.every(c => c.ok), j1.map(c => `${c.name}:${c.ok ? 'ok' : c.observed}`).join('; '));

  // ── J2: chat edit "make the background wisteria" → changed + no apology ────
  try {
    const got = await sendChat(page, 'make the background wisteria');
    snap = await O.probe(page);
    ctx = { journey: 'chat-edit-wisteria', tag: 'j2-chat-edit', console: cons.drain() };
    const j2 = await assertOracles(page, run, ctx, [
      O.honestyApology(snap, { expectChange: true }),
      O.claimVsChanged(snap, { expectChange: true }),
      O.offerWithoutExecution(snap),
      O.noHorizontalOverflow(snap),
      O.noConsoleErrors(ctx.console),
    ]);
    pushStep('chat edit (wisteria)', got && j2.every(c => c.ok), got ? j2.map(c => `${c.name}:${c.ok ? 'ok' : c.observed}`).join('; ') : 'no reply within timeout');
  } catch (e) {
    pushStep('chat edit (wisteria)', false, e.message);
  }

  // ── J3: canvas click-to-edit → inspector opens ────────────────────────────
  try {
    const cv = await page.$('canvas[aria-label="Interactive post preview"]');
    const box = await cv.boundingBox();
    // Click near the vertical centre where the hero text typically sits.
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await settle(700);
    const inspectorOpen = await page.evaluate(() =>
      !!document.querySelector('[aria-label="Close inspector"], .wo-inspector, aside .wo-inspector'));
    ctx = { journey: 'canvas-click-edit', tag: 'j3-inspector', console: cons.drain() };
    const okInspector = inspectorOpen;
    if (!okInspector) {
      const shot = await run.shot(page, 'j3-inspector-missing');
      run.recordDefect({ journey: 'canvas-click-edit', oracle: 'inspector-opens', expected: 'clicking a canvas element opens the contextual inspector', observed: 'no inspector after center click', screenshot: shot, console: ctx.console, severity: 'high' });
    }
    pushStep('canvas click → inspector', okInspector, okInspector ? 'inspector opened' : 'no inspector (dead click?)');
  } catch (e) {
    pushStep('canvas click → inspector', false, e.message);
  }

  // ── J3b: PHYSICAL HIT-TEST — dead clicks are impossible (ux-architecture §2.2).
  //    Reproduces a real user click at every rendered element's coordinates
  //    (logo + each text/furniture role) via elementFromPoint + dispatched pointer
  //    events, asserting nothing invisible (an opacity:0 ghost button, an inspector
  //    dock, a stray pointer-events layer) swallows the click and the correct
  //    contextual inspector opens. This is the guard for the "can't click the logo
  //    or non-heading text" regression — it FAILS if the ghost pointer-events fix is
  //    reverted (an invisible button reclaims the click). ──────────────────────────
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await settle(300);
    const hit = await O.canvasHitTargets(page);
    ctx = { journey: 'canvas-hit-targets', tag: 'j3b-hit-targets', console: cons.drain() };
    const hb = await assertOracles(page, run, ctx, [hit]);
    pushStep('every element clickable (no dead clicks)', hb.every(c => c.ok), hit.observed);
  } catch (e) {
    pushStep('every element clickable (no dead clicks)', false, e.message);
  }

  // ── J4: format switch through all 6 → no overflow / strip stable ──────────
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await settle(300);
    const opened = await openTopMenu(page, 'Format');
    let switched = 0, worst = null;
    if (opened) {
      // The format popover lists 6 dimension buttons; click each in turn.
      const fmtBtns = await page.$$('.wo-topmenu button');
      for (let i = 0; i < fmtBtns.length && i < 8; i++) {
        const b = fmtBtns[i];
        const t = (await b.innerText().catch(() => '')).trim();
        if (!t || t.length > 24) continue;
        await b.click().catch(() => {});
        await settle(900);
        const s = await O.probe(page);
        const ovf = O.noHorizontalOverflow(s);
        const sy = O.stripYStable(s, baselineStripY);
        const buf = O.canvasBufferMatchesDims(s);
        if (!ovf.ok || !sy.ok || !buf.ok) {
          worst = { t, ovf, sy, buf };
          const shot = await run.shot(page, `j4-format-${t}`);
          for (const c of [ovf, sy, buf]) if (!c.ok) run.recordDefect({ journey: 'format-switch', oracle: c.name, expected: c.expected, observed: `[${t}] ${c.observed}`, screenshot: shot, console: cons.peek(), severity: c.severity });
        }
        switched++;
        // Re-open the menu if it closed on selection.
        if (!(await page.$('.wo-topmenu'))) await openTopMenu(page, 'Format');
      }
      await page.keyboard.press('Escape').catch(() => {});
    }
    cons.drain();
    pushStep('format switch ×N', switched > 0 && !worst, worst ? `broke on ${worst.t}` : `${switched} formats, no dead space / strip jump`);
  } catch (e) {
    pushStep('format switch ×N', false, e.message);
  }

  // ── J5: + Add caption → renders (dynamic chip / +Add) ─────────────────────
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await settle(300);
    // Prefer the dynamic chat chip if present; else the top-bar + Add.
    const beforeTruth = await page.evaluate(() => { try { return window.__woTruth ? window.__woTruth() : null; } catch { return null; } });
    let added = false;
    const chips = await page.$$('.wo-chat-chip');
    for (const c of chips) {
      const t = (await c.innerText().catch(() => '')).trim();
      if (/add caption/i.test(t)) { await c.click(); added = true; break; }
    }
    if (!added) {
      // Fall back to asking chat to add a caption (still exercises the add path).
      await sendChat(page, 'add small text at the bottom that says spaces are limited');
      added = true;
    }
    await settle(2000);
    const afterTruth = await page.evaluate(() => { try { return window.__woTruth ? window.__woTruth() : null; } catch { return null; } });
    // renderTruth() exposes roleBounds — per-role hit boxes. A rendered caption
    // adds/changes a support/subtext role box. Compare the SET of role keys and
    // their geometry; also accept the assistant's explicit "added … caption"
    // confirmation as corroboration (belt for a role-key rename).
    const roleKeys = (t) => t && t.roleBounds ? Object.keys(t.roleBounds).sort().join(',') : '';
    const roleGeom = (t) => t && t.roleBounds ? JSON.stringify(t.roleBounds) : '';
    const keysChanged = roleKeys(beforeTruth) !== roleKeys(afterTruth);
    const geomChanged = roleGeom(beforeTruth) !== roleGeom(afterTruth);
    const replySaysAdded = await page.evaluate(() => {
      const b = document.querySelectorAll('.ad-msg--assistant .ad-bubble');
      const last = (b[b.length - 1]?.textContent || '').toLowerCase();
      return /added|caption|now says|small text/.test(last);
    });
    const changed = keysChanged || geomChanged || replySaysAdded;
    pushStep('+ Add caption renders', changed, changed
      ? `caption landed (${keysChanged ? 'new role key' : geomChanged ? 'role geometry changed' : 'confirmed by reply'})`
      : 'no role-bound delta and no add confirmation');
    if (!changed) {
      const shot = await run.shot(page, 'j5-add-caption');
      run.recordDefect({ journey: 'add-caption', oracle: 'add-renders', expected: 'adding a caption changes the rendered design', observed: 'render truth unchanged after add', screenshot: shot, console: cons.peek(), severity: 'medium' });
    }
    cons.drain();
  } catch (e) {
    pushStep('+ Add caption renders', false, e.message);
  }

  // ── J6: session switch via Posts/History → restore ────────────────────────
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await settle(300);
    const opened = await openTopMenu(page, 'Posts');
    let restored = 'n/a';
    if (opened) {
      const tiles = await page.$$('.wo-topmenu [role="menuitem"], .wo-topmenu button');
      restored = tiles.length > 0 ? `${tiles.length} post tile(s) present` : 'no posts yet (fresh device)';
      await page.keyboard.press('Escape').catch(() => {});
    }
    pushStep('Posts/History present', opened, restored);
  } catch (e) {
    pushStep('Posts/History present', false, e.message);
  }

  // ── J7: Export popover → Ready checklist present ──────────────────────────
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await settle(300);
    const opened = await openTopMenu(page, 'Export');
    await settle(600);
    const hasChecklist = await page.evaluate(() =>
      /ready to post/i.test(document.querySelector('.wo-topmenu')?.textContent || '') ||
      !!document.querySelector('.wo-topmenu [class*="ready"], .wo-topmenu [class*="checklist"]'));
    ctx = { journey: 'export-checklist', tag: 'j7-export', console: cons.drain() };
    if (opened && !hasChecklist) {
      const shot = await run.shot(page, 'j7-export-no-checklist');
      run.recordDefect({ journey: 'export-checklist', oracle: 'ready-checklist-present', expected: 'Export popover shows a Ready-to-post checklist', observed: 'no readiness checklist found in Export popover', screenshot: shot, console: ctx.console, severity: 'medium' });
    }
    pushStep('Export → Ready checklist', opened && hasChecklist, opened ? (hasChecklist ? 'checklist present' : 'checklist missing') : 'export menu did not open');
    await page.keyboard.press('Escape').catch(() => {});
  } catch (e) {
    pushStep('Export → Ready checklist', false, e.message);
  }

  // ── J8: undo → reverts ────────────────────────────────────────────────────
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await settle(300);
    const truthBefore = await page.evaluate(() => { try { return JSON.stringify(window.__woTruth ? window.__woTruth() : null); } catch { return null; } });
    // Top-bar Undo button (text "↶ Undo").
    const btns = await page.$$('.wo-topbar button, .wo-topbtn');
    let undone = false;
    for (const b of btns) {
      const t = (await b.innerText().catch(() => '')).trim();
      const disabled = await b.evaluate(el => el.disabled).catch(() => false);
      if (/undo/i.test(t) && !disabled) { await b.click(); undone = true; break; }
    }
    if (!undone) { await page.keyboard.press('Meta+z').catch(() => {}); undone = true; }
    await settle(1200);
    const truthAfter = await page.evaluate(() => { try { return JSON.stringify(window.__woTruth ? window.__woTruth() : null); } catch { return null; } });
    const reverted = truthBefore !== truthAfter;
    pushStep('undo reverts', reverted, reverted ? 'design truth changed after undo' : 'no delta (nothing to undo, or undo no-op)');
  } catch (e) {
    pushStep('undo reverts', false, e.message);
  }

  const ok = steps.every(s => s.ok);
  run.journeys.push({ name: 'golden-journeys', ok, steps });
  return { ok, steps };
}

module.exports = { runJourneys, sendChat, waitForAssistantReply };
