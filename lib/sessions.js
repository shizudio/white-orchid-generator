// ── Sessions + feedback capture — client store (WP-W) ────────────────────────
// One session = one post (design + conversation), auto-saved. Cloud when the
// backend is configured; ALWAYS mirrored to localStorage so the studio works
// with Supabase absent. The feedback capture layer (self-improvement-loop §1)
// posts fire-and-forget to /api/feedback and keeps a localStorage ring-buffer
// fallback; window.__woFeedbackDump() exposes it for the learning pass.
//
// Every network call is null-safe and returns { configured } — callers never
// need try/catch (a rejected fetch is caught here and reported unconfigured).

const LS_SESSIONS = 'wo-sessions';        // { [id]: sessionRecord } — full local store
const LS_CURRENT = 'wo-current-session';  // the active session id (continues across reloads)
const LS_FEEDBACK = 'wo-feedback-buffer'; // ring buffer of capture events (fallback + always-on dump)
const FEEDBACK_CAP = 500;
const PHOTO_DATAURL_CAP = 300 * 1024;     // sessions carrying a huge photo dataURL stay local-only in cloud

function safeParse(raw, fallback) { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function lsGet(k, fallback) { try { return safeParse(localStorage.getItem(k), fallback); } catch { return fallback; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota — ignore */ } }
async function safeJson(res) { try { return await res.json(); } catch { return null; } }

export function newSessionId() {
  return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
export function newTurnId() {
  return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Local session store (source of truth for offline / unconfigured) ─────────
export function localGetAllSessions() {
  const map = lsGet(LS_SESSIONS, {}) || {};
  return Object.values(map).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export function localGetSession(id) {
  const map = lsGet(LS_SESSIONS, {}) || {};
  return map[id] || null;
}
export function localSaveSession(rec) {
  if (!rec?.id) return;
  const map = lsGet(LS_SESSIONS, {}) || {};
  map[rec.id] = { ...map[rec.id], ...rec, updatedAt: rec.updatedAt || Date.now() };
  lsSet(LS_SESSIONS, map);
}
export function getCurrentSessionId() { try { return localStorage.getItem(LS_CURRENT) || null; } catch { return null; } }
export function setCurrentSessionId(id) { try { if (id) localStorage.setItem(LS_CURRENT, id); } catch { /* ignore */ } }

// A session is cloud-eligible only if it doesn't embed a multi-MB photo dataURL
// (those stay device-only; the design still works, just not cross-device).
function sessionCloudEligible(rec) {
  try {
    const img = rec?.state?.imageSrc;
    if (typeof img === 'string' && img.startsWith('data:') && img.length > PHOTO_DATAURL_CAP) return false;
    return true;
  } catch { return true; }
}

// ── Cloud wrappers (no-op gracefully when unconfigured) ──────────────────────
export async function cloudListSessions({ archived = false } = {}) {
  try {
    const res = await fetch(`/api/sessions${archived ? '?archived=1' : ''}`, { cache: 'no-store' });
    const j = await safeJson(res);
    if (!j || j.configured === false) return { configured: false, sessions: [] };
    return { configured: true, sessions: Array.isArray(j.sessions) ? j.sessions : [] };
  } catch { return { configured: false, sessions: [] }; }
}
export async function cloudGetSession(id) {
  try {
    const res = await fetch(`/api/sessions?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const j = await safeJson(res);
    if (!j || j.configured === false) return { configured: false, session: null };
    return { configured: true, session: j.session || null };
  } catch { return { configured: false, session: null }; }
}
export async function cloudSaveSession(rec) {
  if (!sessionCloudEligible(rec)) return { configured: true, localOnly: true };
  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: rec.id, title: rec.title, thumb: rec.thumb,
        state: rec.state, conversation: rec.conversation,
      }),
    });
    if (res.status === 413) return { configured: true, tooLarge: true };
    const j = await safeJson(res);
    if (!res.ok || !j || j.configured === false) return { configured: false };
    return { configured: true, session: j.session };
  } catch { return { configured: false }; }
}

// Save a session BOTH locally (always) and to the cloud (when eligible). This is
// the one call the editor's debounced autosave makes.
export async function saveSession(rec) {
  localSaveSession(rec);
  setCurrentSessionId(rec.id);
  return cloudSaveSession(rec);
}

// Merge cloud tiles over local ones for the Posts list: cloud wins on id, but a
// local-only session (never synced) still shows. Newest-first.
export function mergeSessionTiles(localList, cloudList) {
  const byId = new Map();
  for (const s of localList || []) byId.set(s.id, {
    id: s.id, title: s.title, thumb: s.thumb, updatedAt: s.updatedAt || 0, local: true,
  });
  for (const c of cloudList || []) byId.set(c.id, {
    id: c.id, title: c.title, thumb: c.thumb,
    updatedAt: c.updated_at ? Date.parse(c.updated_at) : (byId.get(c.id)?.updatedAt || 0),
    synced: true,
  });
  return [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

// ── Feedback capture (self-improvement-loop §1) ──────────────────────────────
// Ring-buffer every event locally (always — this is what __woFeedbackDump reads),
// then fire-and-forget to the cloud. Enrichment re-logs the same turn_id.
function bufferPush(event) {
  const buf = lsGet(LS_FEEDBACK, []) || [];
  const i = event.turn_id ? buf.findIndex(e => e.turn_id === event.turn_id) : -1;
  if (i >= 0) buf[i] = { ...buf[i], ...event, _t: Date.now() };
  else buf.push({ ...event, _t: Date.now() });
  while (buf.length > FEEDBACK_CAP) buf.shift();
  lsSet(LS_FEEDBACK, buf);
}

export function logFeedback(event) {
  if (!event || typeof event !== 'object') return;
  bufferPush(event);
  // Fire-and-forget — never await, never surface errors to the UX.
  try {
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(event),
    }).catch(() => {});
  } catch { /* ignore */ }
}

// Enrich an already-logged turn from the user's NEXT action (undo → rejection,
// re-ask → failure, "try another layout" → layout rejection, export → success).
export function enrichVerdict(turnId, verdictPatch) {
  if (!turnId) return;
  const buf = lsGet(LS_FEEDBACK, []) || [];
  const existing = buf.find(e => e.turn_id === turnId);
  const merged = { ...(existing?.verdict || {}), ...verdictPatch };
  logFeedback({ turn_id: turnId, session_id: existing?.session_id, verdict: merged });
}

export function feedbackDump() { return lsGet(LS_FEEDBACK, []) || []; }
export function clearFeedbackBuffer() { lsSet(LS_FEEDBACK, []); }

// Expose the dump for the learning pass (nothing user-facing).
export function installFeedbackDump() {
  if (typeof window === 'undefined') return;
  window.__woFeedbackDump = () => feedbackDump();
  window.__woFeedbackClear = () => clearFeedbackBuffer();
}
