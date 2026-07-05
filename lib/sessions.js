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
const LS_GROUPS = 'wo-groups';            // (WP-Y1a) { [groupId]: { title } } — the "set" registry
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
        // (WP-Y1a) group fields — null/undefined for a standalone post. The API
        // drops these on an un-migrated DB (missing-column retry), so sending them
        // is always safe; cloud group persistence turns on once schema.sql runs.
        groupId: rec.groupId ?? null, groupTitle: rec.groupTitle, groupOrder: rec.groupOrder,
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

// ── Groups / "sets" (WP-Y1a — campaign FOUNDATION, no UI) ────────────────────
// A group is a nullable "set" over sessions: a standalone post has groupId null
// and is untouched by any of this. A campaign (WP-P1, later) = N sessions sharing
// one groupId, ordered by groupOrder. These helpers are thin and local-first:
// the source of truth is the localStorage session store (each session carries its
// own groupId/groupTitle/groupOrder), plus a tiny groupId→{title} registry so a
// freshly-created empty group is nameable before any session joins it. Cloud
// parity is automatic — group fields ride on the normal saveSession() upsert and
// degrade gracefully (the API drops them on an un-migrated DB; see route.js).

function newGroupId() {
  return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function lsGetGroups() { return lsGet(LS_GROUPS, {}) || {}; }
function lsSetGroups(map) { lsSet(LS_GROUPS, map); }

// Create a new (empty) group and return its id. Title is stored in the registry
// so the group is nameable before any session is assigned to it.
export function createGroup(title) {
  const id = newGroupId();
  const groups = lsGetGroups();
  groups[id] = { title: typeof title === 'string' ? title : '' };
  lsSetGroups(groups);
  return id;
}

// All sessions in a group, ascending by groupOrder (nulls last), newest-first tie-break.
export function listSessionsInGroup(groupId) {
  if (!groupId) return [];
  return localGetAllSessions()
    .filter(s => s.groupId === groupId)
    .sort((a, b) => {
      const ao = a.groupOrder, bo = b.groupOrder;
      if (ao == null && bo == null) return (b.updatedAt || 0) - (a.updatedAt || 0);
      if (ao == null) return 1;
      if (bo == null) return -1;
      return ao - bo;
    });
}

// The next free ordering index in a group (max existing + 1, else 0).
export function nextGroupOrder(groupId) {
  const members = listSessionsInGroup(groupId);
  let max = -1;
  for (const s of members) if (Number.isInteger(s.groupOrder) && s.groupOrder > max) max = s.groupOrder;
  return max + 1;
}

// Assign a session to a group at a given order (order defaults to next free slot).
// Persists both locally (always) and to the cloud (graceful-degrade). Passing
// groupId null detaches the session back to standalone. Returns the cloud result.
export function assignSessionToGroup(sessionId, groupId, order) {
  const rec = localGetSession(sessionId);
  if (!rec) return Promise.resolve({ configured: false });
  const groupTitle = groupId ? (lsGetGroups()[groupId]?.title || rec.groupTitle || '') : null;
  const groupOrder = groupId
    ? (Number.isInteger(order) ? order : nextGroupOrder(groupId))
    : null;
  const next = { ...rec, groupId: groupId || null, groupTitle, groupOrder, updatedAt: Date.now() };
  return saveSession(next);
}

// All groups → their sessions, for verification (window.__woGroups). Includes
// registry groups that have no members yet (title known, members []).
export function listGroups() {
  const all = localGetAllSessions();
  const byGroup = new Map();
  const registry = lsGetGroups();
  for (const id of Object.keys(registry)) byGroup.set(id, { groupId: id, title: registry[id]?.title || '', sessions: [] });
  for (const s of all) {
    if (!s.groupId) continue;
    if (!byGroup.has(s.groupId)) byGroup.set(s.groupId, { groupId: s.groupId, title: s.groupTitle || registry[s.groupId]?.title || '', sessions: [] });
    byGroup.get(s.groupId).sessions.push({ id: s.id, title: s.title, groupOrder: s.groupOrder ?? null });
  }
  for (const g of byGroup.values()) {
    g.sessions.sort((a, b) => {
      if (a.groupOrder == null && b.groupOrder == null) return 0;
      if (a.groupOrder == null) return 1;
      if (b.groupOrder == null) return -1;
      return a.groupOrder - b.groupOrder;
    });
  }
  return [...byGroup.values()];
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
  // (WP-Y1a) Group data model verification (nothing user-facing). __woGroups()
  // returns current groups→sessions; the helpers let you drive the model from
  // the console: __woGroups.create(title), .assign(sessionId, groupId, order),
  // .list(groupId), .nextOrder(groupId).
  window.__woGroups = () => listGroups();
  window.__woGroups.create = (title) => createGroup(title);
  window.__woGroups.assign = (sessionId, groupId, order) => assignSessionToGroup(sessionId, groupId, order);
  window.__woGroups.list = (groupId) => listSessionsInGroup(groupId);
  window.__woGroups.nextOrder = (groupId) => nextGroupOrder(groupId);
}
