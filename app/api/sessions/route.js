import { getAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

// One session = one post (ux-architecture §2.7). Design + conversation bound
// under one id, auto-saved (debounced). Same graceful-degradation contract as
// /api/drafts + /api/templates: any env/table problem returns { configured:false }
// (never a 500) so the client falls back to localStorage without breaking.

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const STATE_MAX_BYTES = 400 * 1024;   // design state JSON cap (photos stay device-only past this)
const CONV_MAX_BYTES = 200 * 1024;    // conversation JSON cap
const LIST_CAP = 10;                  // latest ~10 visible; older fetched on demand
const TITLE_MAX = 120;

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 80; // session autosave is debounced ≥2.5s client-side; generous
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
  return Response.json({ configured: false, sessions: [], session: null, ...extra });
}
function isMissingConfig(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || /not set|not configured|does not exist|schema cache/i.test(msg);
}
// (WP-Y1a) The group_* columns are added by a later idempotent migration
// (lib/schema.sql). Before it runs, writing/selecting them errors with 42703
// (undefined_column) or a "column … does not exist" PostgREST message. We detect
// that specifically so a cloud DB that has design_sessions but NOT the group
// columns still saves standalone sessions (we retry without the group fields).
function isMissingColumn(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42703' || /column .* does not exist|group_id|group_title|group_order/i.test(msg);
}

// GET /api/sessions            → list latest LIST_CAP unarchived (thumbnails, no heavy state)
// GET /api/sessions?archived=1 → list archived (fetch-on-demand "Show older")
// GET /api/sessions?id=…       → full single session (design state + conversation)
export async function GET(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  const archived = params.get('archived') === '1';

  // (WP-Y1a) Include the group_* columns when present. If the migration hasn't run
  // (42703), retry with the base column set so listing/opening standalone sessions
  // never breaks — the cloud simply omits group data until schema.sql is applied.
  const SINGLE_COLS = 'id, title, thumb, state, conversation, created_at, updated_at, archived';
  const LIST_COLS = 'id, title, thumb, created_at, updated_at, archived';
  const GROUP_COLS = ', group_id, group_title, group_order';

  try {
    if (id) {
      let { data, error } = await supabase
        .from('design_sessions')
        .select(SINGLE_COLS + GROUP_COLS)
        .eq('id', id)
        .eq('brand_id', BRAND_ID)
        .maybeSingle();
      if (error && isMissingColumn(error)) {
        ({ data, error } = await supabase
          .from('design_sessions').select(SINGLE_COLS)
          .eq('id', id).eq('brand_id', BRAND_ID).maybeSingle());
      }
      if (error) { if (isMissingConfig(error)) return unconfigured(); return Response.json({ error: error.message }, { status: 500 }); }
      return Response.json({ session: data || null, configured: true });
    }
    // List view — omit the heavy `state`/`conversation` blobs; just enough for tiles.
    const listQuery = (cols) => supabase
      .from('design_sessions')
      .select(cols)
      .eq('brand_id', BRAND_ID)
      .eq('archived', archived)
      .order('updated_at', { ascending: false })
      .limit(archived ? 50 : LIST_CAP);
    let { data, error } = await listQuery(LIST_COLS + GROUP_COLS);
    if (error && isMissingColumn(error)) ({ data, error } = await listQuery(LIST_COLS));
    if (error) { if (isMissingConfig(error)) return unconfigured(); return Response.json({ error: error.message }, { status: 500 }); }
    return Response.json({ sessions: data || [], configured: true });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// POST /api/sessions — upsert one session (auto-save). Also auto-archives rows
// beyond the latest LIST_CAP so the Posts list stays tidy (never deletes).
export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'Autosaving too fast — please wait a moment.' }, { status: 429 });
  }
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const id = typeof body?.id === 'string' && body.id ? body.id.slice(0, 80) : null;
  if (!id) return Response.json({ error: 'id (string) is required' }, { status: 400 });
  if (body?.state != null && typeof body.state !== 'object') {
    return Response.json({ error: 'state must be an object' }, { status: 400 });
  }
  const state = body?.state && typeof body.state === 'object' ? body.state : {};
  const conversation = Array.isArray(body?.conversation) ? body.conversation : [];

  const stateBytes = Buffer.byteLength(JSON.stringify(state), 'utf8');
  if (stateBytes > STATE_MAX_BYTES) {
    return Response.json({ error: 'Session too large to sync.', tooLarge: true }, { status: 413 });
  }
  const convBytes = Buffer.byteLength(JSON.stringify(conversation), 'utf8');
  const trimmedConversation = convBytes > CONV_MAX_BYTES ? conversation.slice(-60) : conversation;

  const row = {
    id,
    brand_id: BRAND_ID,
    title: typeof body?.title === 'string' ? body.title.slice(0, TITLE_MAX) : null,
    thumb: typeof body?.thumb === 'string' ? body.thumb : null,
    state,
    conversation: trimmedConversation,
    archived: false,
    updated_at: new Date().toISOString(),
  };
  // (WP-Y1a) Optional group fields — nullable, absent for a standalone post. Only
  // attached to the row when supplied so the un-migrated-DB retry below is clean.
  if (typeof body?.groupId === 'string' && body.groupId) row.group_id = body.groupId.slice(0, 80);
  else if (body?.groupId === null) row.group_id = null;
  if (typeof body?.groupTitle === 'string') row.group_title = body.groupTitle.slice(0, TITLE_MAX);
  if (Number.isInteger(body?.groupOrder)) row.group_order = body.groupOrder;

  try {
    let { data, error } = await supabase
      .from('design_sessions')
      .upsert(row)
      .select('id, title, thumb, created_at, updated_at, archived')
      .single();
    // If the group_* columns aren't in the DB yet, retry without them so the
    // standalone session still saves (cloud group persistence needs schema.sql).
    if (error && isMissingColumn(error)) {
      const { group_id, group_title, group_order, ...base } = row; // eslint-disable-line no-unused-vars
      ({ data, error } = await supabase
        .from('design_sessions')
        .upsert(base)
        .select('id, title, thumb, created_at, updated_at, archived')
        .single());
    }
    if (error) { if (isMissingConfig(error)) return unconfigured(); return Response.json({ error: error.message }, { status: 500 }); }

    // Auto-archive everything beyond the latest LIST_CAP unarchived rows. Fire-and-
    // forget: a failure here never fails the save (the user's work is already stored).
    (async () => {
      try {
        const { data: recent } = await supabase
          .from('design_sessions')
          .select('id')
          .eq('brand_id', BRAND_ID)
          .eq('archived', false)
          .order('updated_at', { ascending: false })
          .range(LIST_CAP, LIST_CAP + 200);
        const staleIds = (recent || []).map(r => r.id);
        if (staleIds.length) {
          await supabase.from('design_sessions').update({ archived: true }).in('id', staleIds);
        }
      } catch { /* tidiness only — never blocks */ }
    })();

    return Response.json({ session: data, configured: true }, { status: 201 });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
