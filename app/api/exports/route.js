import { getAdminClient } from '@/lib/supabase';
import {
  buildExportRow,
  legacyExportRow,
  isMissingColumn,
  presentExportRow,
  normalizeExportFormat,
} from '@/lib/export-history.mjs';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ── EXPORT HISTORY (client ruling 2026-07-29) ────────────────────────────────
// Records the REAL exported PNG/JPEG so "for history, i should be easily going
// back to the session" works from the actual artifact, not a reconstruction.
// Objects live in the private 'images' bucket under exports/… (no new bucket).
//
// Graceful degradation (operating-manual.md §4): any env/table problem returns
// { configured:false } (HTTP 200) — never a 500. On a NOT-YET-MIGRATED exports
// table (old scaffold columns, new ones absent → 42703/PGRST204) POST retries
// with the legacy packing (real fields ride metadata jsonb; the migration file
// lib/migrations/2026-07-29-media-organization.sql promotes them to columns)
// and GET presents both vintages identically — the client never knows which.

const FILE_MAX_BYTES = 8 * 1024 * 1024; // an exported poster PNG; generous

function unconfigured(extra = {}) {
  return Response.json({ configured: false, exports: [], ...extra });
}
function isMissingConfig(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || /not set|not configured|does not exist|schema cache/i.test(msg);
}

async function withSignedUrls(supabase, rows) {
  const presented = rows.map(presentExportRow);
  if (!presented.length) return presented;
  const paths = presented.map(r => r.storage_path);
  const { data: signed } = await supabase.storage
    .from('images')
    .createSignedUrls(paths, 60 * 60); // 1 hour
  const urlMap = {};
  (signed || []).forEach(s => { urlMap[s.path] = s.signedUrl; });
  return presented.map(r => ({ ...r, url: urlMap[r.storage_path] || null }));
}

// GET /api/exports → { configured:true, exports:[…newest first, signed urls] }
export async function GET() {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  try {
    const { data, error } = await supabase
      .from('exports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ configured: true, exports: await withSignedUrls(supabase, data || []) });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// POST /api/exports — multipart: file + session_id + dimension_id + format +
// headline. Stores the object under exports/…, inserts the row, returns it
// with a signed URL.
export async function POST(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  let formData;
  try { formData = await request.formData(); } catch { return Response.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = formData.get('file');
  const format = normalizeExportFormat(formData.get('format')) || 'png';
  const sessionId = String(formData.get('session_id') || '').slice(0, 80) || null;
  const dimensionId = String(formData.get('dimension_id') || '').slice(0, 40) || null;
  const headline = String(formData.get('headline') || '').slice(0, 200) || null;

  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'file is required' }, { status: 400 });
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > FILE_MAX_BYTES) {
    return Response.json({ error: 'Export file too large to record.' }, { status: 413 });
  }
  const buffer = Buffer.from(bytes);
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const storagePath = `exports/${Date.now()}-${(dimensionId || 'design').replace(/[^a-zA-Z0-9._-]/g, '_')}.${ext}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(storagePath, buffer, {
        contentType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
        upsert: false,
      });
    if (uploadError) {
      if (isMissingConfig(uploadError)) return unconfigured();
      return Response.json({ error: uploadError.message }, { status: 500 });
    }

    const row = buildExportRow({
      sessionId,
      dimensionId,
      format,
      headline,
      storagePath,
      metadata: { size: buffer.length },
    });
    const insert = (r) => supabase.from('exports').insert(r).select().single();
    let { data, error: dbError } = await insert(row);
    // Un-migrated table (new columns absent) → legacy packing: real fields ride
    // metadata, old NOT NULL scaffold columns get honest fillers. The migration
    // promotes these rows into the real columns later.
    if (dbError && isMissingColumn(dbError)) {
      ({ data, error: dbError } = await insert(legacyExportRow(row)));
    }
    if (dbError) {
      await supabase.storage.from('images').remove([storagePath]);
      if (isMissingConfig(dbError)) return unconfigured();
      return Response.json({ error: dbError.message }, { status: 500 });
    }

    const { data: urlData } = await supabase.storage
      .from('images')
      .createSignedUrl(storagePath, 60 * 60);
    return Response.json(
      { configured: true, export: { ...presentExportRow(data), url: urlData?.signedUrl || null } },
      { status: 201 },
    );
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// DELETE /api/exports?id=… — remove the storage object AND the row. A storage
// failure still deletes the row but reports storageRemoved:false (same honest
// contract as /api/images DELETE).
export async function DELETE(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  try {
    const { data: row, error: readError } = await supabase
      .from('exports')
      .select('id, storage_path')
      .eq('id', id)
      .maybeSingle();
    if (readError) {
      if (isMissingConfig(readError)) return unconfigured();
      return Response.json({ error: readError.message }, { status: 500 });
    }
    if (!row) return Response.json({ configured: true, deleted: false });

    let storageRemoved = false;
    try {
      const { error: rmError } = await supabase.storage.from('images').remove([row.storage_path]);
      storageRemoved = !rmError;
    } catch { storageRemoved = false; }

    const { error: delError } = await supabase.from('exports').delete().eq('id', id);
    if (delError) {
      if (isMissingConfig(delError)) return unconfigured();
      return Response.json({ error: delError.message }, { status: 500 });
    }
    return Response.json({ configured: true, deleted: true, storageRemoved });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
