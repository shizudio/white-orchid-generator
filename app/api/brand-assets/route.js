import { getAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ── OFFICIAL DECORATIVE ASSETS (Declutter item 7, ratified 2026-07-06) ────────
// The free-form SVG/PNG decoration uploader left the editor (born-clean law:
// no arbitrary art through a back door). Decorative marks are now OFFICIAL
// brand assets: the owner uploads them on the Brand kit admin page and they
// appear in + Add → Shapes/Decoration for everyone.
//
// STORAGE: the existing PUBLIC `logos` bucket (the brand-asset bucket) under a
// `brand-assets/` prefix — no schema migration needed, public URLs render with
// permissive CORS (imgFrom sets crossOrigin so exports stay untainted), and a
// delete is a plain object removal. Metadata (kind + aspect ratio) is encoded
// in the object name: brand-assets/<ts>__<kind>__<ratio*1000>__<name>.<ext>
//
// Degradation contract (same as /api/sessions): any env/bucket problem returns
// { configured:false } (never a 500) so the editor simply shows the built-ins.

const PREFIX = 'brand-assets';
const BUCKET = 'logos';
const FILE_MAX = 300 * 1024; // decorative marks are small
const NAME_MAX = 48;
const LIST_CAP = 60;

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;
const requestLog = new Map();
function isRateLimited(request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > MAX_REQUESTS;
}

function unconfigured(extra = {}) {
  return Response.json({ configured: false, assets: [], ...extra });
}

const KINDS = new Set(['frame', 'strip', 'corner', 'center', 'accessory']);
const EXT_TYPES = { svg: 'image/svg+xml', png: 'image/png' };

// brand-assets/<ts>__<kind>__<ratio*1000>__<name>.<ext> → { id, name, kind, ratio }
function parseObjectName(name) {
  const m = /^(\d+)__([a-z]+)__(\d+)__(.+)\.(svg|png)$/.exec(name);
  if (!m) return null;
  return {
    ts: Number(m[1]),
    kind: KINDS.has(m[2]) ? m[2] : 'center',
    ratio: Math.max(0.05, Number(m[3]) / 1000 || 1),
    name: m[4].replace(/_/g, ' '),
    ext: m[5],
  };
}

// GET /api/brand-assets → { configured, assets:[{ id, name, src, kind, ratio }] }
export async function GET() {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(PREFIX, { limit: LIST_CAP, sortBy: { column: 'name', order: 'desc' } });
    if (error) return unconfigured();
    const assets = [];
    for (const obj of data || []) {
      const meta = parseObjectName(obj.name);
      if (!meta) continue;
      const path = `${PREFIX}/${obj.name}`;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (!pub?.publicUrl) continue;
      assets.push({ id: path, name: meta.name, src: pub.publicUrl, kind: meta.kind, ratio: meta.ratio });
    }
    return Response.json({ configured: true, assets });
  } catch {
    return unconfigured();
  }
}

// POST /api/brand-assets — owner upload from the Brand kit admin page.
// Body: { name, dataUrl (data:image/svg+xml|png;base64,… ≤300KB), kind, ratio }.
export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'Too many uploads — please wait a moment.' }, { status: 429 });
  }
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const m = /^data:image\/(svg\+xml|png);base64,(.+)$/.exec(String(body?.dataUrl || ''));
  if (!m) return Response.json({ error: 'dataUrl must be an SVG or PNG data URL.' }, { status: 400 });
  const ext = m[1] === 'png' ? 'png' : 'svg';
  let buffer;
  try { buffer = Buffer.from(m[2], 'base64'); } catch { return Response.json({ error: 'Invalid image data.' }, { status: 400 }); }
  if (!buffer.length) return Response.json({ error: 'Empty image data.' }, { status: 400 });
  if (buffer.length > FILE_MAX) {
    return Response.json({ error: 'That file is too large for a decorative asset (keep it under ~300KB).', tooLarge: true }, { status: 413 });
  }

  const kind = KINDS.has(body?.kind) ? body.kind : 'center';
  const ratio = Number.isFinite(body?.ratio) && body.ratio > 0 ? body.ratio : 1;
  const safeName = String(body?.name || 'Decoration').trim().slice(0, NAME_MAX)
    .replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '_') || 'Decoration';
  const objectName = `${Date.now()}__${kind}__${Math.round(ratio * 1000)}__${safeName}.${ext}`;
  const path = `${PREFIX}/${objectName}`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: EXT_TYPES[ext], upsert: false });
    if (error) return unconfigured({ error: error.message });
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return Response.json({
      configured: true,
      asset: { id: path, name: safeName.replace(/_/g, ' '), src: pub?.publicUrl || null, kind, ratio },
    }, { status: 201 });
  } catch {
    return unconfigured();
  }
}

// DELETE /api/brand-assets?id=<path> — remove one official asset. Designs that
// already placed it keep rendering (the placed layer holds its own image).
export async function DELETE(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id.startsWith(`${PREFIX}/`) || id.includes('..')) {
    return Response.json({ error: 'id must be a brand-assets path' }, { status: 400 });
  }
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([id]);
    if (error) return unconfigured();
    return Response.json({ configured: true, deleted: true });
  } catch {
    return unconfigured();
  }
}
