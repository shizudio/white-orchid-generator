// ── Moodboard — external inspiration images (Feed folder, ratified) ───────────
// The Moodboard folder in the Posts gallery holds EXTERNAL reference images the
// owner uploads for taste (NOT designs the studio made). Same graceful-degradation
// contract as lib/sessions + /api/brand-assets: cloud (brand_moodboard table) when
// configured, ALWAYS mirrored to localStorage so it works with Supabase absent.
//
// TASTE STUDY: every added item is ALSO logged through the capture pipe
// (kind:'moodboard') so the learning pass can read the owner's taste from BOTH
// their favourites (the like events, kind:'like') AND their moodboard inspiration.
// This module only makes the data available + tagged; it builds no learning logic.
// See lib/preferences.js for the note on reading both signals.

import { logFeedback, newTurnId } from '@/lib/sessions';

const LS_MOODBOARD = 'wo-moodboard';   // [{ id, image, note, ts }] — full local store
const ITEM_CAP = 80;

function lsGet() {
  try { const raw = localStorage.getItem(LS_MOODBOARD); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function lsSet(v) { try { localStorage.setItem(LS_MOODBOARD, JSON.stringify(v)); } catch { /* quota — ignore */ } }
async function safeJson(res) { try { return await res.json(); } catch { return null; } }

export function newMoodboardId() {
  return 'mb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Local store (source of truth for offline / unconfigured) ─────────────────
export function localListMoodboard() {
  return (lsGet() || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
function localAddMoodboard(item) {
  const list = lsGet() || [];
  list.unshift(item);
  while (list.length > ITEM_CAP) list.pop();
  lsSet(list);
}
function localRemoveMoodboard(id) {
  lsSet((lsGet() || []).filter(i => i.id !== id));
}

// ── Cloud wrappers (no-op gracefully when unconfigured) ──────────────────────
export async function cloudListMoodboard() {
  try {
    const res = await fetch('/api/moodboard', { cache: 'no-store' });
    const j = await safeJson(res);
    if (!j || j.configured === false) return { configured: false, items: [] };
    return { configured: true, items: Array.isArray(j.items) ? j.items : [] };
  } catch { return { configured: false, items: [] }; }
}
async function cloudAddMoodboard(item) {
  try {
    const res = await fetch('/api/moodboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (res.status === 413) return { configured: true, tooLarge: true };
    const j = await safeJson(res);
    if (!res.ok || !j || j.configured === false) return { configured: false };
    return { configured: true, item: j.item };
  } catch { return { configured: false }; }
}
async function cloudRemoveMoodboard(id) {
  try {
    const res = await fetch(`/api/moodboard?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const j = await safeJson(res);
    if (!res.ok || !j || j.configured === false) return { configured: false };
    return { configured: true, deleted: !!j.deleted };
  } catch { return { configured: false }; }
}

// Merge cloud over local by id, newest first (cloud wins; a local-only item still
// shows, exactly like mergeSessionTiles for sessions).
export function mergeMoodboard(localList, cloudList) {
  const byId = new Map();
  for (const i of localList || []) byId.set(i.id, i);
  for (const c of cloudList || []) {
    byId.set(c.id, {
      id: c.id, image: c.image, note: c.note || '',
      ts: Number.isFinite(c.ts) ? c.ts : (c.created_at ? Date.parse(c.created_at) : 0),
    });
  }
  return [...byId.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

// List — local always; merged with the cloud when configured.
// BACKFILL: items added while the cloud was absent (e.g. before the
// brand_moodboard table existed) live only in this device's localStorage.
// When the cloud IS configured, push any local-only items up so inspiration
// finally syncs across devices — fire-and-forget, retried on each listing
// until they land, never blocks the folder from opening.
export async function listMoodboard() {
  const local = localListMoodboard();
  const { configured, items } = await cloudListMoodboard();
  if (!configured) return { configured: false, items: local };
  const cloudIds = new Set((items || []).map(i => i.id));
  for (const it of local) {
    if (it?.id && it.image && !cloudIds.has(it.id)) {
      cloudAddMoodboard(it); // graceful — resolves {configured:false} on failure
    }
  }
  return { configured: true, items: mergeMoodboard(local, items) };
}

// Add one inspiration item: local always + cloud (graceful) + capture pipe.
// `image` is a small JPEG dataURL thumbnail; `note` optional. The thumb is NOT
// put in the capture verdict (kept small) — only the fact + note are logged.
export async function addMoodboardItem({ image, note } = {}) {
  const item = { id: newMoodboardId(), image, note: (note || '').slice(0, 280), ts: Date.now() };
  localAddMoodboard(item);
  const ts = new Date().toISOString();
  logFeedback({
    turn_id: newTurnId(),
    session_id: null,
    user_message: '[moodboard] add inspiration',
    kind: 'moodboard',
    ts,
    verdict: { kind: 'moodboard', note: item.note, itemId: item.id, ts },
  });
  const cloud = await cloudAddMoodboard(item);
  return { item, cloud };
}

// Remove one item: local always + cloud (fire-and-forget, graceful).
export async function removeMoodboardItem(id) {
  if (!id) return;
  localRemoveMoodboard(id);
  cloudRemoveMoodboard(id);
}
