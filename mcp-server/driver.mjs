// ── White Orchid MCP — the Playwright app-driver ─────────────────────────────
// Drives the REAL studio headlessly, the way a human would: landing prompt →
// generated design → studio; chat refinements through the app's own send
// pipeline; exports through the app's own export buttons (which record export
// history server-side). It deliberately re-implements NOTHING of the
// generation pipeline — the whole constitution (brand enforcement, born-clean,
// honesty, style DNA, readiness) lives in the app's client code and runs
// untouched here. The session the app autosaves is the user's real session:
// unlike the resident tester, cloud writes are NOT blocked — landing in the
// user's Posts is the point.
//
// Lifecycle: ONE browser launch per tool call (robust; ~1–2s overhead beats a
// shared instance's crash/idle bookkeeping), but with a PERSISTENT profile dir
// (mcp-server/.profile) so localStorage survives between calls — the MCP acts
// as one consistent "device". That keeps the refine/export round-trip working
// even when cloud sessions are unconfigured/unreachable (the app's localStorage
// mirror is the graceful-degradation contract), and matches how a human's own
// browser behaves. Every path closes the browser in a finally; a dead/crashed
// browser surfaces as a stage-named DriverError, never a hang — all waits run
// against a hard per-call deadline. Tool calls are serialized by MCP clients;
// a locked profile (two servers on one profile dir) fails honestly at launch.
//
// Selector contract (read from the app, mirrors scripts/resident-tester/
// journeys.js — the proven driving pattern):
//   landing:  textarea[aria-label="Describe the post you want to create"],
//             button[aria-label="Send"]
//   studio:   canvas[aria-label="Interactive post preview"],
//             textarea[aria-label^="Message Orchid"], .ad-input-row button[aria-label="Send"],
//             .ad-msg--assistant .ad-bubble, .ad-changed
//   formats:  .generator-format-strip button[aria-pressed] (labels in tools.mjs)
//   export:   .wo-export-cta → .wo-export-pop, .wo-export-one, readiness rows
//             (buttons with aria-expanded inside the pop)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FORMAT_IDS, FORMAT_LABELS, DEFAULT_FORMAT, baseUrl, studioUrlFor } from './tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = process.env.WO_MCP_OUT_DIR || path.join(HERE, 'out');

// Generous but bounded (README documents both): generation legitimately runs
// 30–90s when a photo is involved, so it gets the longer default budget.
export const TOOL_TIMEOUT_MS = Math.max(10_000, Number(process.env.WO_MCP_TIMEOUT_MS) || 120_000);
export const GENERATE_TIMEOUT_MS = Math.max(TOOL_TIMEOUT_MS, Number(process.env.WO_MCP_GENERATE_TIMEOUT_MS) || 180_000);

const settle = (ms) => new Promise(r => setTimeout(r, ms));

// ── Stage machine ────────────────────────────────────────────────────────────
// Tracks which pipeline stage the driver is in so a timeout/crash names WHERE
// it stalled (the harness's stage-tracking pattern). Pure; unit-tested.

export class DriverError extends Error {
  constructor(message, stage) {
    super(stage ? `[stage: ${stage}] ${message}` : message);
    this.name = 'DriverError';
    this.stage = stage || null;
  }
}

export function createStages(deadlineMs, log) {
  const startedAt = Date.now();
  const history = [];
  let current = 'start';
  return {
    get current() { return current; },
    get history() { return history.slice(); },
    set(name) {
      current = name;
      history.push({ stage: name, atMs: Date.now() - startedAt });
      try { log?.(name); } catch { /* logging must never break the drive */ }
    },
    // Remaining budget for the next wait; throws (stage-named) once spent.
    remaining(min = 250) {
      const left = deadlineMs - Date.now();
      if (left <= 0) throw new DriverError(`tool call timed out (${Math.round((Date.now() - startedAt) / 1000)}s elapsed)`, current);
      return Math.max(min, left);
    },
    fail(err) {
      if (err instanceof DriverError) return err;
      return new DriverError(String(err?.message || err), current);
    },
  };
}

export function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Summarize the readiness rows parsed from the export popover DOM into the
// per-format pass/blocked shape the tools return. Pure; unit-tested.
export function readinessSummary(rows) {
  const formats = {};
  let blocked = 0;
  for (const row of rows || []) {
    const ready = /^ready/i.test(row.status || '');
    if (!ready) blocked++;
    formats[row.id || row.label] = { label: row.label, status: row.status || 'unknown', ready };
  }
  return { known: (rows || []).length > 0, blockedCount: blocked, formats };
}

// Map a visible format-strip/readiness label back to its dimension id. Pure.
export function formatIdForLabel(label) {
  const t = String(label || '').trim().toLowerCase();
  for (const id of FORMAT_IDS) {
    if (t.startsWith(FORMAT_LABELS[id].toLowerCase())) return id;
  }
  return null;
}

// ── Browser plumbing ─────────────────────────────────────────────────────────

export const PROFILE_DIR = process.env.WO_MCP_PROFILE_DIR || path.join(HERE, '.profile');

async function launchContext() {
  // Playwright is resolved from the repo's own node_modules (mcp-server/ lives
  // inside the repo, so Node's upward resolution finds the root install — no
  // second browser download). Dynamic import keeps unit tests browser-free.
  // Persistent context = stable localStorage identity across tool calls.
  const { chromium } = await import('playwright');
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
}

function captureConsoleErrors(page) {
  const errors = [];
  page.on('pageerror', err => errors.push('pageerror: ' + (err?.message || String(err))));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    // Same noise filter as the resident harness: favicon 404s, ResizeObserver
    // loops, and graceful-degradation chatter are not app defects.
    if (/favicon|ResizeObserver|Failed to load resource/i.test(t)) return;
    errors.push(t);
  });
  return errors;
}

// One browser per tool call; the finally guarantees teardown even on a crash.
async function withPage(stages, fn) {
  stages.set('launch-browser');
  let context = null;
  try {
    context = await launchContext();
    const page = context.pages()[0] || await context.newPage();
    const consoleErrors = captureConsoleErrors(page);
    return await fn(page, consoleErrors);
  } catch (err) {
    throw stages.fail(err);
  } finally {
    try { await context?.close(); } catch { /* already dead — that's fine */ }
  }
}

// ── Page helpers ─────────────────────────────────────────────────────────────

async function captureCanvasPng(page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('canvas[aria-label="Interactive post preview"]');
    return canvas ? canvas.toDataURL('image/png') : null;
  });
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('could not read the live canvas (no interactive preview found)');
  }
  return dataUrl.slice('data:image/png;base64,'.length);
}

async function currentSessionId(page) {
  return page.evaluate(() => {
    try { return localStorage.getItem('wo-current-session'); } catch { return null; }
  });
}

// Wait until the assistant REPLY bubble count grows past `prev`, then let the
// turn SETTLE (patch + changed line land after the SSE stream). CRITICAL: the
// chat's typing indicator is ALSO an `.ad-bubble` (`ad-bubble ad-typing`), so
// the count must exclude typing dots and empty streaming shells — counting
// them reads "reply arrived" the instant the request STARTS and tears the
// browser down mid-stream. Exported for the mocked-page unit test.
export async function waitForAssistantReply(page, prevCount, { timeoutMs = 90_000, pollMs = 400, settleMs = 6_000, settleFn = settle } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const n = await page.evaluate(() =>
      [...document.querySelectorAll('.ad-msg--assistant .ad-bubble')]
        .filter(b => !b.classList.contains('ad-typing') && (b.textContent || '').trim().length > 0)
        .length);
    if (n > prevCount) {
      const settleDeadline = Date.now() + settleMs;
      while (Date.now() < settleDeadline) {
        await settleFn(Math.min(500, pollMs));
        const settled = await page.evaluate(() => {
          const msgs = document.querySelectorAll('.ad-msg--assistant');
          const last = msgs[msgs.length - 1];
          if (!last) return false;
          return !!last.querySelector('.ad-changed, .ad-undo-chip, .ad-offer-chip, .ad-fb-chip');
        });
        if (settled) break;
      }
      await settleFn(600);
      return true;
    }
    await settleFn(pollMs);
  }
  return false;
}

async function sendChat(page, text, stages) {
  const counts = () => page.evaluate(() => ({
    // Real reply bubbles only — the typing indicator is also an .ad-bubble.
    assistant: [...document.querySelectorAll('.ad-msg--assistant .ad-bubble')]
      .filter(b => !b.classList.contains('ad-typing') && (b.textContent || '').trim().length > 0)
      .length,
    user: document.querySelectorAll('.ad-msg--user').length,
  }));
  const before = await counts();
  const ta = await page.$('textarea[aria-label^="Message Orchid"]');
  if (!ta) throw new Error('chat composer not found in the studio');
  await ta.click();
  await ta.fill(text);
  // Belt against a restore-triggered composer remount swallowing the fill:
  // verify the text is still there a beat later, refill once if not.
  await settle(300);
  const held = await page.evaluate(() => document.querySelector('textarea[aria-label^="Message Orchid"]')?.value || '');
  if (held !== text) {
    const ta2 = await page.$('textarea[aria-label^="Message Orchid"]');
    await ta2?.click();
    await ta2?.fill(text);
  }
  const send = await page.$('.ad-input-row button[aria-label="Send"]');
  if (send) await send.click();
  else await page.keyboard.press('Enter');
  // The user bubble appearing proves the send actually left the composer.
  const sentDeadline = Date.now() + Math.min(8_000, stages.remaining());
  let sent = false;
  while (Date.now() < sentDeadline) {
    if ((await counts()).user > before.user) { sent = true; break; }
    await settle(300);
  }
  if (!sent) throw new Error('the chat message never left the composer (send did not register)');
  const got = await waitForAssistantReply(page, before.assistant, { timeoutMs: Math.min(90_000, stages.remaining()) });
  if (!got) throw new Error('no assistant reply arrived (the chat call may have failed server-side)');
  return readLastAssistantTurn(page);
}

async function readLastAssistantTurn(page) {
  return page.evaluate(() => {
    // Last assistant message with a REAL reply bubble (typing dots are also
    // `.ad-bubble`, so filter them and empty streaming shells out).
    const msgs = [...document.querySelectorAll('.ad-msg--assistant')].filter(m => {
      const b = m.querySelector('.ad-bubble');
      return b && !b.classList.contains('ad-typing') && (b.textContent || '').trim().length > 0;
    });
    const last = msgs[msgs.length - 1];
    if (!last) return { reply: '', changed: null };
    return {
      reply: (last.querySelector('.ad-bubble')?.textContent || '').trim(),
      changed: (last.querySelector('.ad-changed')?.textContent || '').trim() || null,
    };
  });
}

async function switchFormat(page, formatId) {
  const label = FORMAT_LABELS[formatId];
  const clicked = await page.evaluate((wanted) => {
    const w = wanted.toLowerCase();
    const btns = document.querySelectorAll('.generator-format-strip button[aria-pressed]');
    for (const b of btns) {
      // Match on the title attribute first (`"IG Portrait · 1080 × 1350px…"` —
      // always label-first); textContent leads with the ratio sub ("4:5IG
      // Portrait") until the preview thumbnails render, so it is includes-only.
      const title = (b.getAttribute('title') || '').toLowerCase();
      const text = (b.textContent || '').toLowerCase();
      if (title.startsWith(w) || text.includes(w)) {
        if (b.getAttribute('aria-pressed') === 'true') return 'already';
        b.click();
        return 'clicked';
      }
    }
    return 'missing';
  }, label);
  if (clicked === 'missing') throw new Error(`format "${label}" not found in the format strip`);
  if (clicked === 'clicked') await settle(1400); // repaint + fit-heal settle
  return clicked;
}

// Wait for the studio to be genuinely OPERABLE: chrome mounted (canvas, chat
// composer, format strip) AND the canvas pixel-stable across two consecutive
// frames — the restore/harmonizer/repaint pipeline has finished. A blind sleep
// is not enough: with the persistent profile the current-session id matches
// instantly, well before the async restore applies.
async function waitForStudioSettled(page, stages) {
  const chromeDeadline = Date.now() + Math.min(30_000, stages.remaining());
  while (Date.now() < chromeDeadline) {
    const s = await page.evaluate(() => ({
      canvas: !!document.querySelector('canvas[aria-label="Interactive post preview"]'),
      composer: !!document.querySelector('textarea[aria-label^="Message Orchid"]'),
      strip: document.querySelectorAll('.generator-format-strip button[aria-pressed]').length,
    }));
    if (s.canvas && s.composer && s.strip > 0) break;
    await settle(400);
  }
  let prev = null;
  const stableDeadline = Date.now() + Math.min(12_000, stages.remaining());
  while (Date.now() < stableDeadline) {
    let cur = null;
    try { cur = sha256Hex(await captureCanvasPng(page)); } catch { cur = null; }
    if (cur && cur === prev) return;
    prev = cur;
    await settle(700);
  }
}

// Open the export popover (idempotent) and wait for the readiness sweep to
// finish ("Checking every format…" → per-format rows). Returns parsed rows.
async function openExportAndReadReadiness(page, stages) {
  const open = await page.$('.wo-export-pop');
  if (!open) {
    const cta = await page.$('.wo-export-cta');
    if (!cta) throw new Error('Export button not found');
    await cta.click();
    await page.waitForSelector('.wo-export-pop', { timeout: Math.min(10_000, stages.remaining()) });
  }
  const deadline = Date.now() + Math.min(20_000, stages.remaining());
  let rows = [];
  while (Date.now() < deadline) {
    rows = await page.evaluate(() => {
      const pop = document.querySelector('.wo-export-pop');
      if (!pop) return [];
      return [...pop.querySelectorAll('button[aria-expanded]')].map(b => {
        const spans = b.querySelectorAll(':scope > span');
        return spans.length >= 3
          ? { label: (spans[1].textContent || '').trim(), status: (spans[2].textContent || '').trim() }
          : null;
      }).filter(Boolean);
    });
    if (rows.length) break;
    await settle(700);
  }
  return rows.map(r => ({ ...r, id: formatIdForLabel(r.label) }));
}

async function closeExport(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => document.querySelector('.wo-export-backdrop')?.click()).catch(() => {});
  await settle(300);
}

// Open a stored session via the ?session= boot param (the app's own openSession
// flow). Verified by the current-session pointer landing on the requested id.
async function openStudioSession(page, base, sessionId, stages) {
  stages.set('open-session');
  await page.goto(studioUrlFor(base, sessionId), { waitUntil: 'domcontentloaded', timeout: stages.remaining() });
  await page.waitForSelector('canvas[aria-label="Interactive post preview"]', { timeout: Math.min(45_000, stages.remaining()) });
  const deadline = Date.now() + Math.min(30_000, stages.remaining());
  while (Date.now() < deadline) {
    if ((await currentSessionId(page)) === sessionId) {
      // The id pointer alone is not proof of a finished restore (with the
      // persistent profile it can match before React applies the record) —
      // wait until the studio chrome is mounted and the canvas is stable.
      await waitForStudioSettled(page, stages);
      return;
    }
    await settle(500);
  }
  // Honest failure: distinguish "session doesn't exist" from "restore stalled".
  let exists = false;
  try {
    const res = await fetch(`${base}/api/sessions?id=${encodeURIComponent(sessionId)}`);
    const json = await res.json().catch(() => ({}));
    exists = !!json?.session;
  } catch { /* the API being unreachable is itself the honest message below */ }
  throw new Error(exists
    ? `session ${sessionId} exists but did not finish restoring in time`
    : `session ${sessionId} was not found — neither in the cloud sessions list nor in the MCP browser profile (it may be device-local to a different browser, or the cloud may be unreachable)`);
}

// ── Tool implementations ─────────────────────────────────────────────────────

export async function generatePost({ brief, format = DEFAULT_FORMAT }, log) {
  const base = baseUrl();
  const stages = createStages(Date.now() + GENERATE_TIMEOUT_MS, log);
  return withPage(stages, async (page, consoleErrors) => {
    const notes = [];

    // Instrument the pipeline's honesty signals from the network (read-only):
    // did the plan want a photo, and did photo generation come back unconfigured?
    let plan = null;
    let photoUnconfigured = false;
    let cloudSave = null; // { configured } from the app's own autosave POST
    page.on('response', async (res) => {
      try {
        const url = res.url();
        const method = res.request().method();
        if (method === 'POST' && url.includes('/api/assistant') && !plan) {
          plan = await res.json().catch(() => null);
        } else if (method === 'POST' && url.includes('/api/design-generate')) {
          const j = await res.json().catch(() => ({}));
          if (j?.unconfigured) photoUnconfigured = true;
        } else if (method === 'POST' && url.includes('/api/sessions')) {
          cloudSave = await res.json().catch(() => null);
        }
      } catch { /* observation only — never disturb the app */ }
    });

    stages.set('open-landing');
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: stages.remaining() });
    const ta = await page.waitForSelector('textarea[aria-label="Describe the post you want to create"]', { timeout: Math.min(30_000, stages.remaining()) });
    await ta.fill(brief);
    stages.set('landing-plan');
    await page.click('button[aria-label="Send"]');

    // The landing page runs plan → (photo-source choice, task #69) →
    // (photo start/poll, up to ~75s) → navigates.
    // (#69) PHOTO-LED plans pause at the inline photo-source chooser, whose
    // default is "Let AI decide" — accept it with the same one tap a human
    // makes ([data-wo-photo-source="ai"] is the chooser's driver contract),
    // then wait for the studio navigation. Text-only plans navigate straight
    // through — the poll simply falls through to waitForURL.
    stages.set('generation');
    {
      const chooserDeadline = Date.now() + Math.min(45_000, stages.remaining());
      while (Date.now() < chooserDeadline && !page.url().includes('/generate')) {
        const aiDefault = await page.$('[data-wo-photo-source="ai"]').catch(() => null);
        if (aiDefault) { await aiDefault.click().catch(() => {}); break; }
        await settle(300);
      }
    }
    await page.waitForURL('**/generate*', { timeout: stages.remaining() });
    stages.set('studio-render');
    await page.waitForSelector('canvas[aria-label="Interactive post preview"]', { timeout: Math.min(45_000, stages.remaining()) });
    await settle(2000); // handoff apply + harmonizer kick-off (journeys.js pattern)
    await waitForStudioSettled(page, stages); // chrome mounted + canvas pixel-stable

    if (plan?.scenePrompt && photoUnconfigured) {
      notes.push('Photo generation is not configured on this server — the design degraded gracefully to a solid-field/Library background (complete and on-brand, just photo-less).');
    }
    if (plan && !plan.scenePrompt) {
      notes.push('The plan resolved text-only (no photo requested) — solid-field design.');
    }

    if (format && format !== DEFAULT_FORMAT) {
      stages.set('format-switch');
      await switchFormat(page, format);
    }

    // The session lands in Posts via the app's own debounced autosave (~2.5s):
    // localStorage first (the MCP's persistent profile), then the cloud POST.
    stages.set('autosave');
    let sessionId = null;
    {
      const idDeadline = Date.now() + Math.min(15_000, stages.remaining());
      while (Date.now() < idDeadline && !sessionId) {
        sessionId = await currentSessionId(page);
        if (!sessionId) await settle(600);
      }
      if (!sessionId) throw new Error('the studio never assigned a session id');
      // Give the debounced cloud write a beat to land (observation only).
      const saveDeadline = Date.now() + Math.min(9_000, stages.remaining());
      while (!cloudSave && Date.now() < saveDeadline) await settle(700);
    }
    if (cloudSave?.configured === true) {
      // Saved to the shared cloud — visible in Posts on every device.
    } else if (cloudSave) {
      notes.push('Cloud sessions are unavailable on this server (unconfigured or unreachable) — the post saved to the MCP browser profile only. wo_refine_post/wo_export_post still work (same profile), but the session will not appear in the studio on other devices.');
    } else {
      notes.push('The autosave cloud write was not observed within the wait budget — the post is saved in the MCP browser profile; cloud sync state unknown.');
    }

    stages.set('readiness');
    const rows = await openExportAndReadReadiness(page, stages);
    await closeExport(page);

    stages.set('capture');
    const png = await captureCanvasPng(page);
    if (consoleErrors.length) notes.push(`Console errors in the driven page (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ')}`);

    const chat = await readLastAssistantTurn(page);
    return {
      png,
      sessionId,
      studioUrl: studioUrlFor(base, sessionId),
      format,
      readiness: readinessSummary(rows),
      reply: chat.reply || plan?.reply || '',
      notes,
    };
  });
}

// `_prepare(page)` is a TEST SEAM (resident-tester pattern): verification runs
// route-intercept the assistant call with a canned reply so the full drive is
// exercisable at $0 AI spend. Never set in production use.
export async function refinePost({ sessionId, instruction, _prepare }, log) {
  const base = baseUrl();
  const stages = createStages(Date.now() + TOOL_TIMEOUT_MS, log);
  return withPage(stages, async (page, consoleErrors) => {
    if (typeof _prepare === 'function') await _prepare(page);
    const notes = [];
    let cloudSave = null;
    let lastSessionPostAt = 0;
    page.on('response', async (res) => {
      try {
        if (res.request().method() === 'POST' && res.url().includes('/api/sessions')) {
          cloudSave = await res.json().catch(() => null);
          lastSessionPostAt = Date.now();
        }
      } catch { /* observation only */ }
    });

    await openStudioSession(page, base, sessionId, stages);

    stages.set('capture-before');
    const before = await captureCanvasPng(page);

    stages.set('chat-refine');
    const turn = await sendChat(page, instruction, stages);

    stages.set('applied-render');
    await settle(1500);
    const after = await captureCanvasPng(page);
    const pixelChanged = sha256Hex(before) !== sha256Hex(after);

    // Let the debounced autosave persist the REFINED state before teardown.
    // CRITICAL: an /api/sessions POST fires ~2.5s after the chat message itself
    // (the conversation save) — accepting that one as proof would tear the
    // browser down before the post-apply save and silently lose the refinement
    // (the M5 clobber class). Only a save observed AFTER the applied render
    // counts; the debounce is 2.5s, so the 15s window is generous.
    const appliedAt = Date.now();
    stages.set('autosave');
    const saveDeadline = Date.now() + Math.min(15_000, stages.remaining());
    while (lastSessionPostAt < appliedAt && Date.now() < saveDeadline) await settle(600);
    if (lastSessionPostAt < appliedAt) {
      notes.push('The refined state\'s save was not observed before teardown — the refinement may not have persisted.');
    } else if (cloudSave && cloudSave.configured !== true) {
      notes.push('Cloud sessions unavailable — the refinement saved to the MCP browser profile only.');
    }
    await settle(400); // let the synchronous localStorage write settle out fully

    if (!pixelChanged) notes.push('The canvas pixels did not change — read the assistant\'s reply: the app\'s honesty pipeline only narrates changes it really made, so this was likely a clarification/refusal turn.');
    if (consoleErrors.length) notes.push(`Console errors in the driven page (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ')}`);

    return {
      png: after,
      sessionId,
      studioUrl: studioUrlFor(base, sessionId),
      reply: turn.reply,
      changed: turn.changed,
      pixelChanged,
      notes,
    };
  });
}

export async function exportPost({ sessionId, formats = FORMAT_IDS }, log) {
  const base = baseUrl();
  const stages = createStages(Date.now() + TOOL_TIMEOUT_MS, log);
  return withPage(stages, async (page, consoleErrors) => {
    const notes = [];
    const historyRows = [];
    page.on('response', async (res) => {
      try {
        if (res.request().method() === 'POST' && res.url().includes('/api/exports')) {
          historyRows.push({ ok: res.ok(), json: await res.json().catch(() => null) });
        }
      } catch { /* observation only */ }
    });

    await openStudioSession(page, base, sessionId, stages);

    const dir = path.join(OUT_DIR, sessionId.replace(/[^a-z0-9_-]/gi, '-').slice(0, 60));
    fs.mkdirSync(dir, { recursive: true });

    const results = [];
    for (const formatId of formats) {
      stages.set(`export-${formatId}`);
      await switchFormat(page, formatId);
      const rows = await openExportAndReadReadiness(page, stages);
      const allowed = await page.evaluate(() => document.querySelector('.wo-export-one')?.getAttribute('data-export-allowed') === 'true');
      if (!allowed) {
        // Honesty over force: the app's readiness gate blocked this format —
        // report the blockers, never bypass the gate.
        const row = rows.find(r => r.id === formatId);
        results.push({ format: formatId, exported: false, blocked: true, status: row?.status || 'blocked' });
        await closeExport(page);
        continue;
      }
      // The real export click — this is what records export history (task #64
      // machinery) exactly like a human export.
      let file = null;
      let png = null;
      try {
        const downloadP = page.waitForEvent('download', { timeout: 15_000 });
        await page.click('.wo-export-one');
        const download = await downloadP;
        // The app's single-format filename carries no dimension id — prefix
        // with the format so a multi-format export never overwrites itself.
        file = path.join(dir, `${formatId}-${download.suggestedFilename() || 'white-orchid.png'}`);
        await download.saveAs(file);
        png = fs.readFileSync(file).toString('base64');
      } catch {
        // The click fired (history recorded) but the download event was missed —
        // fall back to reading the live canvas at this format (same pixels).
        png = await captureCanvasPng(page);
        file = path.join(dir, `white-orchid-${formatId}.png`);
        fs.writeFileSync(file, Buffer.from(png, 'base64'));
        notes.push(`${formatId}: download event not captured — file written from the live canvas instead (same rendered pixels).`);
      }
      results.push({ format: formatId, exported: true, blocked: false, file, png });
      await closeExport(page);
      await settle(600); // let the fire-and-forget history POST land
    }

    stages.set('export-history');
    await settle(2000);
    const recorded = historyRows.filter(r => r?.ok && r.json && r.json.configured !== false && !r.json.error).length;
    const failed = historyRows.length - recorded;
    if (failed > 0 || (historyRows.length === 0 && results.some(r => r.exported))) {
      notes.push('Export history rows did not (all) record — the cloud exports table is unconfigured or unreachable. The downloads themselves succeeded; history is a bonus by design.');
    }
    if (consoleErrors.length) notes.push(`Console errors in the driven page (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ')}`);

    return {
      sessionId,
      studioUrl: studioUrlFor(base, sessionId),
      outDir: dir,
      results,
      historyRowsRecorded: recorded,
      notes,
    };
  });
}

// No browser needed: a plain GET against the same origin the browser would use.
export async function listPosts({ limit = 10 } = {}) {
  const base = baseUrl();
  let res;
  try {
    res = await fetch(`${base}/api/sessions`);
  } catch (err) {
    throw new DriverError(`could not reach ${base} — is the studio server running? (${err?.message || err})`, 'sessions-fetch');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    const detail = json?.error ? ` — ${json.error}` : '';
    throw new DriverError(
      `GET /api/sessions answered ${res.status}${detail}. The cloud sessions list is unavailable (Supabase unreachable or misconfigured); sessions created by this MCP still live in its browser profile and remain usable via wo_refine_post/wo_export_post.`,
      'sessions-fetch',
    );
  }
  const { shapeSessionList } = await import('./tools.mjs');
  return {
    configured: json.configured !== false,
    base,
    sessions: shapeSessionList(json, limit),
  };
}
