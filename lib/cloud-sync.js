// ── Cloud sync for the shared team library ──────────────────────────────────
// Thin fetch wrappers over /api/templates and /api/drafts. Every call is
// null-safe and no-ops (returns { configured:false }) when the API says the
// backend isn't set up (no env) or the tables don't exist yet. Callers never
// need try/catch — a rejected fetch is caught here and reported as unconfigured.

const PHOTO_DATAURL_CAP = 200 * 1024;  // ~200KB — larger photos stay device-only
const STATE_CAP = 300 * 1024;          // must match the API's STATE_MAX_BYTES

// A template is cloud-eligible only if its serialized state is small enough AND
// it doesn't embed a multi-MB photo dataURL. Big photos → local-only.
export function isTemplateSyncEligible(tpl) {
  try {
    const img = tpl?.state?.imageSrc;
    if (typeof img === 'string' && img.startsWith('data:') && img.length > PHOTO_DATAURL_CAP) return false;
    const bytes = new Blob([JSON.stringify(tpl?.state ?? {})]).size;
    return bytes <= STATE_CAP;
  } catch { return false; }
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

export async function fetchTemplates() {
  try {
    const res = await fetch('/api/templates', { cache: 'no-store' });
    const j = await safeJson(res);
    if (!j || j.configured === false) return { configured: false, templates: [] };
    return { configured: true, templates: Array.isArray(j.templates) ? j.templates : [] };
  } catch { return { configured: false, templates: [] }; }
}

// Upsert a template. Returns { configured, tooLarge?, template? }.
export async function pushTemplate({ id, name, thumb, state }) {
  try {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, thumb, state }),
    });
    const j = await safeJson(res);
    if (res.status === 413) return { configured: true, tooLarge: true };
    if (!res.ok || !j || j.configured === false) return { configured: false };
    return { configured: true, template: j.template };
  } catch { return { configured: false }; }
}

export async function deleteTemplate(id) {
  try {
    const res = await fetch(`/api/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const j = await safeJson(res);
    if (!res.ok || !j || j.configured === false) return { configured: false };
    return { configured: true };
  } catch { return { configured: false }; }
}

export async function fetchDraft(id = 'current') {
  try {
    const res = await fetch(`/api/drafts?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const j = await safeJson(res);
    if (!j || j.configured === false) return { configured: false, draft: null };
    return { configured: true, draft: j.draft || null };
  } catch { return { configured: false, draft: null }; }
}

export async function pushDraft({ id = 'current', state, deviceLabel }) {
  try {
    const res = await fetch('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, state, device_label: deviceLabel }),
    });
    const j = await safeJson(res);
    if (!res.ok || !j || j.configured === false) return { configured: false };
    return { configured: true, draft: j.draft };
  } catch { return { configured: false }; }
}

// Merge cloud templates with local ones: id-based union, cloud wins on same id.
// UUIDs (cloud) and "dt_*" (local-only) never collide. Returns { merged, localOnlyIds }.
export function mergeTemplates(localList, cloudList) {
  const byId = new Map();
  for (const t of localList || []) byId.set(t.id, { ...t });
  const localOnlyIds = new Set(byId.keys());
  for (const c of cloudList || []) {
    byId.set(c.id, { id: c.id, name: c.name, thumb: c.thumb, state: c.state, createdAt: c.created_at ? Date.parse(c.created_at) : Date.now(), synced: true });
    localOnlyIds.delete(c.id);
  }
  // Sort newest-first by createdAt (cloud rows keyed off created_at).
  const merged = [...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { merged, localOnlyIds };
}
