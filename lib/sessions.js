import { persistedDesignToLegacyView } from './design-persistence.mjs';

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

// ── (A1) HARNESS MODE — persistence kill-switch ──────────────────────────────
// The dev harnesses (__woFormatFitGuard, __woArchStress, __woLegacyDupGuard,
// __woReadyCheck sweeps, the calibration/feed boards) render TEST designs into
// live React state and swap "sessions" to exercise the engine. The debounced
// session autosave then persisted those test designs — and because sessions sync
// to a SHARED Supabase brand, the client's Posts/History filled with guard-test
// junk. Any harness wraps its run in withHarnessMode(); while the flag is set,
// saveSession()/localSaveSession()/cloudSaveSession() no-op, so nothing a harness
// touches is ever written locally OR to the cloud.
let HARNESS_MODE = false;
export function isHarnessMode() { return HARNESS_MODE; }
export function setHarnessMode(on) { HARNESS_MODE = !!on; }
// Run `fn` (sync or async) with persistence suspended, always restoring the flag.
export async function withHarnessMode(fn) {
  const prev = HARNESS_MODE;
  HARNESS_MODE = true;
  try { return await fn(); }
  finally { HARNESS_MODE = prev; }
}

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
  if (HARNESS_MODE) return;   // (A1) never persist a harness/test design
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
    const img = rec?.state?.document?.media?.source ?? rec?.state?.imageSrc;
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
  if (HARNESS_MODE) return { configured: true, harnessSuppressed: true };   // (A1) never sync a test design
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
        // (Hearts, ratified item 10) liked + exported ride the same way — the API
        // drops them on an un-migrated DB; local persistence always works.
        liked: rec.liked === true, exportedAt: rec.exportedAt ?? null,
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
  if (HARNESS_MODE) return { configured: false, harnessSuppressed: true };   // (A1) suspend all persistence during a harness run
  localSaveSession(rec);
  setCurrentSessionId(rec.id);
  return cloudSaveSession(rec);
}

export function resolveSessionConflict(local,cloud) {
  if(!local)return cloud||null;if(!cloud)return local;
  const localRevision=local.state?.metadata?.revision||0,cloudRevision=cloud.state?.metadata?.revision||0;
  if(localRevision!==cloudRevision)return localRevision>cloudRevision?local:cloud;
  const localTime=Number(local.updatedAt||local.updated_at?Date.parse(local.updated_at)||local.updatedAt:0)||0;
  const cloudTime=Number(cloud.updatedAt||cloud.updated_at?Date.parse(cloud.updated_at)||cloud.updatedAt:0)||0;
  if(localTime!==cloudTime)return localTime>cloudTime?local:cloud;
  const left=JSON.stringify(local.state||{}),right=JSON.stringify(cloud.state||{});
  return left>=right?local:cloud;
}

// Merge cloud tiles over local ones for the Posts list: cloud wins on id, but a
// local-only session (never synced) still shows. Newest-first.
export function mergeSessionTiles(localList, cloudList) {
  const byId = new Map();
  for (const s of localList || []) byId.set(s.id, {
    id: s.id, title: s.title, thumb: s.thumb, updatedAt: s.updatedAt || 0, local: true,
    // (Hearts / Feed gallery) liked + exported ride the tile so the gallery can
    // fill hearts + mark exported posts without fetching full sessions.
    liked: s.liked === true, exportedAt: s.exportedAt || null,
  });
  for (const c of cloudList || []) {
    const prev = byId.get(c.id);
    byId.set(c.id, {
      id: c.id, title: c.title, thumb: c.thumb,
      updatedAt: c.updated_at ? Date.parse(c.updated_at) : (prev?.updatedAt || 0),
      synced: true,
      // Un-migrated cloud rows carry no liked/exported columns — keep the local
      // mirror's values rather than clobbering them with undefined.
      liked: c.liked != null ? c.liked === true : prev?.liked === true,
      exportedAt: c.exported_at ? Date.parse(c.exported_at) : (prev?.exportedAt || null),
    });
  }
  // (A1) Never surface a guard-test design in Posts/History, even if a stale row
  // survives before the async purge lands.
  return [...byId.values()]
    .filter(t => !looksLikeGuardTile(t))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

// ── (A1) GUARD-POLLUTION PURGE ───────────────────────────────────────────────
// The format-fit guard used to render a test design ("FORMAT FIT GUARD" headline
// / "automated invariant check" subtext) and the debounced autosave persisted it —
// locally AND to the shared cloud brand, so the client's Posts/History filled with
// guard junk. HARNESS_MODE now prevents new pollution; this purges the EXISTING
// rows. A session is guard junk if its title/headline/subtext matches the guard's
// unmistakable fingerprint. Kept deliberately tight so a real user design can never
// match by accident.
const GUARD_FINGERPRINT = /format\s*fit\s*guard|automated invariant check/i;
// Exported so the editor's SYNC first-paint format resolution (Generator.jsx)
// can refuse to seed the canvas from a guard-test design before the async
// purge has had a chance to drop its pointer.
export function looksLikeGuardSession(rec) {
  if (!rec || typeof rec !== 'object') return false;
  const state=persistedDesignToLegacyView(rec.state||{});
  const bits = [rec.title,state.headline,state.subtext,state.attribution]
    .filter(v => typeof v === 'string');
  return bits.some(v => GUARD_FINGERPRINT.test(v));
}
// A cloud LIST tile carries no state; match on its title only (the guard's title
// derived from the headline/subtext, so the fingerprint still catches it).
function looksLikeGuardTile(tile) {
  return !!tile && typeof tile.title === 'string' && GUARD_FINGERPRINT.test(tile.title);
}

export async function cloudDeleteSession(id) {
  if (!id) return { configured: false };
  try {
    const res = await fetch(`/api/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const j = await safeJson(res);
    if (!res.ok || !j || j.configured === false) return { configured: false };
    return { configured: true, deleted: !!j.deleted };
  } catch { return { configured: false }; }
}

// One-time purge (idempotent, runs on studio load). Removes guard-fingerprinted
// sessions from localStorage AND, when a cloud row is visible, deletes it too.
// Marks a localStorage flag so it only sweeps the cloud once per device version;
// the local sweep is cheap and always runs (catches any freshly-restored junk).
const LS_PURGE_DONE = 'wo-guard-purge-v1';
export async function purgeGuardSessions() {
  if (typeof window === 'undefined') return { removedLocal: 0, removedCloud: 0 };
  let removedLocal = 0;
  // Local sweep — always.
  try {
    const map = lsGet(LS_SESSIONS, {}) || {};
    let dirty = false;
    for (const [id, rec] of Object.entries(map)) {
      if (looksLikeGuardSession(rec)) { delete map[id]; removedLocal++; dirty = true; }
    }
    if (dirty) lsSet(LS_SESSIONS, map);
    // If the current session pointer names a purged design, drop it.
    const cur = getCurrentSessionId();
    if (cur && !map[cur]) { try { localStorage.removeItem(LS_CURRENT); } catch { /* ignore */ } }
  } catch { /* ignore */ }
  // Cloud sweep — once per device (the shared brand only needs purging once, but
  // re-running is safe: a delete of an absent id is a no-op).
  let removedCloud = 0;
  let alreadyDone = false;
  try { alreadyDone = localStorage.getItem(LS_PURGE_DONE) === '1'; } catch { /* ignore */ }
  if (!alreadyDone) {
    try {
      // Sweep active AND archived tiles (auto-archive may have hidden older junk).
      const [active, archived] = await Promise.all([
        cloudListSessions(), cloudListSessions({ archived: true }),
      ]);
      if (active.configured || archived.configured) {
        const junk = [...(active.sessions || []), ...(archived.sessions || [])].filter(looksLikeGuardTile);
        for (const t of junk) { const r = await cloudDeleteSession(t.id); if (r.deleted) removedCloud++; }
        try { localStorage.setItem(LS_PURGE_DONE, '1'); } catch { /* ignore */ }
      }
    } catch { /* cloud unavailable — local sweep still ran */ }
  }
  return { removedLocal, removedCloud };
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

// ── Hearts + design genes (ratified item 10) ─────────────────────────────────
// A like stores the design's GENES — the compact style fingerprint the studio
// learns from (preference-weighted rotation, house-style exemplars). Built from
// a session's saved state (currentTemplateState shape); sceneCategory comes
// from the live genBrief when the caller has one (it isn't persisted).

// Coarse scene category from a Higgsfield photographer brief, if any.
export function classifySceneCategory(scene) {
  const s = String(scene || '').toLowerCase();
  if (!s) return null;
  if (/\b(child|children|kid|student|teacher|girl|boy|portrait|face|people|educator)\b/.test(s)) return 'people';
  if (/\b(plant|leaf|flower|table|object|still|tea|book|toy|garden|room|classroom|interior)\b/.test(s)) return 'still-life';
  return 'scene';
}

export function buildGenes(state, { sceneCategory } = {}) {
  const st=persistedDesignToLegacyView(state&&typeof state==='object'?state:{});
  return {
    archetypeId: st.archetypeId ?? null,
    archVariant: Number.isInteger(st.archVariant) ? st.archVariant : 0,
    bgColor: st.bgColor ?? null,
    photoTreatment: st.photoTreatment ?? null,
    heroRegister: st.heroRegister ?? null,
    postType: st.postType ?? null,
    dimensionId: st.dimensionId ?? null,
    sceneCategory: sceneCategory ?? null,
  };
}

// Flip a session's liked flag. Local always; cloud via the normal session
// upsert (graceful — un-migrated DBs keep hearts device-local). Loads the
// cloud record when the session was never mirrored locally. Returns the
// updated record (or null when the session can't be found anywhere).
export async function setSessionLiked(id, liked) {
  if (!id) return null;
  let rec = localGetSession(id);
  if (!rec) {
    const { session } = await cloudGetSession(id);
    if (session) rec = {
      id: session.id, title: session.title, thumb: session.thumb,
      state: session.state, conversation: session.conversation || [],
      groupId: session.group_id ?? null, groupTitle: session.group_title, groupOrder: session.group_order,
      liked: session.liked === true,
      exportedAt: session.exported_at ? Date.parse(session.exported_at) : null,
    };
  }
  if (!rec) return null;
  const next = { ...rec, liked: liked === true, updatedAt: Date.now() };
  localSaveSession(next);
  cloudSaveSession(next); // fire-and-forget; graceful when unconfigured/un-migrated
  return next;
}

// Log a heart toggle through the capture pipe. The gene payload rides in the
// verdict jsonb (the server-side aggregate + learning pass read it there) and
// top-level in the local ring buffer (__woFeedbackDump).
export function logLike({ liked, genes, thumb, sessionId }) {
  const ts = new Date().toISOString();
  logFeedback({
    turn_id: newTurnId(),
    session_id: sessionId || null,
    user_message: liked ? '[heart] like' : '[heart] unlike',
    kind: liked ? 'like' : 'unlike',
    genes,
    ts,
    verdict: {
      kind: liked ? 'like' : 'unlike',
      genes,
      thumb: liked && typeof thumb === 'string' && thumb.length <= 40 * 1024 ? thumb : null,
      sessionId: sessionId || null,
      ts,
    },
  });
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
// (item 8, security) Gated: a production window carries NO dev hooks.
// __woFeedbackDump is a tester ORACLE, so it also survives the resident
// tester's isolated build (NEXT_PUBLIC_WO_TEST_HOOKS=1 at build time); the
// clear + groups drivers are dev-only. Both env reads are inlined at build
// time, so real deploys drop these branches as dead code.
export function installFeedbackDump() {
  if (typeof window === 'undefined') return;
  const dev = process.env.NODE_ENV !== 'production';
  const testHooks = dev || process.env.NEXT_PUBLIC_WO_TEST_HOOKS === '1';
  if (testHooks) {
    window.__woFeedbackDump = () => feedbackDump();
  }
  if (dev) {
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
}
