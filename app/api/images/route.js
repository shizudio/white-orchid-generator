import { getAdminClient } from '@/lib/supabase';
import {
  normalizeSourceType,
  legacySourceType,
  isCheckViolation,
  presentImageRow,
} from '@/lib/media-taxonomy.mjs';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Graceful-degradation contract (operating-manual.md §4): any env/table problem
// degrades to { configured:false } (HTTP 200) — NEVER a 500. This route was a
// known violator (getAdminClient() unwrapped → 500 on missing Supabase env);
// this is its Phase-0 fix. The GET success shape stays a bare array (its
// consumers — app/library, components/LibraryPicker — read it directly and now
// guard on Array.isArray), so only the unconfigured path carries the flag.
//
// (Media organization — client ruling 2026-07-29) source_type speaks the new
// generated|uploaded vocabulary at every boundary: POST accepts legacy values
// from stale clients (mapped, never 400), writes fall back to the legacy value
// when the DB's OLD CHECK constraint has not been migrated yet (23514 → retry),
// and GET maps legacy stored values to the new vocabulary so the UI only ever
// sees generated|uploaded. See lib/media-taxonomy.mjs + the migration file
// lib/migrations/2026-07-29-media-organization.sql.
function unconfigured(extra = {}) {
  return Response.json({ configured: false, ...extra });
}
function isMissingConfig(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || /not set|not configured|does not exist|schema cache/i.test(msg);
}
// 42703 / PGRST204 = the session_id column has not been migrated in yet —
// retry the write without it rather than failing the upload (same pattern as
// /api/sessions' isMissingColumn ladder). Checked BEFORE isMissingConfig,
// whose /schema cache/ match would swallow PGRST204.
function isMissingColumn(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42703' || err?.code === 'PGRST204'
    || /column .* does not exist|could not find the '.+' column/i.test(msg);
}

export async function GET() {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  try {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Present every row in the NEW vocabulary regardless of stored vintage.
    const rows = (data || []).map(presentImageRow);

    // Generate signed URLs server-side (admin client has storage access)
    if (rows.length) {
      const paths = rows.map(img => img.storage_path);
      const { data: signed } = await supabase.storage
        .from('images')
        .createSignedUrls(paths, 60 * 60); // 1 hour
      if (signed) {
        const urlMap = {};
        signed.forEach(s => { urlMap[s.path] = s.signedUrl; });
        return Response.json(rows.map(img => ({ ...img, url: urlMap[img.storage_path] || null })));
      }
    }

    return Response.json(rows);
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  const formData = await request.formData();

  const file = formData.get('file');
  const rawSourceType = formData.get('source_type');   // generated | uploaded (legacy midjourney_render/real_photo mapped)
  const consentStatus = formData.get('consent_status') || 'na'; // na | cleared | pending | blocked
  // (Activity lineage) The design session this image entered the library from.
  const sessionId = String(formData.get('session_id') || '').slice(0, 80) || null;
  // (Generated images) the scene prompt that produced the photo, when available.
  const scene = String(formData.get('scene') || '').slice(0, 500) || null;

  const sourceType = normalizeSourceType(rawSourceType);
  if (!file || !sourceType) {
    return Response.json({ error: 'file and source_type (generated | uploaded) are required' }, { status: 400 });
  }

  // Consent stays orthogonal to the taxonomy. The one legacy contract kept: a
  // stale client explicitly tagging 'real_photo' must still supply a consent
  // status (that was the old gate and silently dropping it would weaken it).
  if (rawSourceType === 'real_photo' && consentStatus === 'na') {
    return Response.json({ error: 'Real photos require a consent status' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.name.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  const storagePath = `uploads/${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  try {
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      if (isMissingConfig(uploadError)) return unconfigured();
      return Response.json({ error: uploadError.message }, { status: 500 });
    }

    const baseRow = {
      storage_path: storagePath,
      thumb_path: null, // Phase 3: add sharp for server-side thumb generation
      filename: file.name,
      source_type: sourceType,
      consent_status: consentStatus,
      metadata: {
        size: buffer.length,
        type: file.type,
        ext,
        ...(scene ? { scene } : {}),
      },
    };

    const insert = (row) => supabase.from('images').insert(row).select().single();

    // Attempt ladder (each rung keeps the upload alive on an un-migrated DB):
    //   1. new vocabulary + session_id
    //   2. missing session_id column → retry without it
    //   3. old CHECK constraint (23514) → retry with the legacy equivalent value
    //      ('generated'→'midjourney_render', 'uploaded'→'real_photo') so uploads
    //      never break mid-migration. GET maps it back to the new vocabulary.
    let row = sessionId ? { ...baseRow, session_id: sessionId } : baseRow;
    let { data, error: dbError } = await insert(row);
    if (dbError && sessionId && isMissingColumn(dbError)) {
      row = baseRow;
      ({ data, error: dbError } = await insert(row));
    }
    if (dbError && isCheckViolation(dbError)) {
      const legacyRow = { ...row, source_type: legacySourceType(sourceType) };
      ({ data, error: dbError } = await insert(legacyRow));
      if (dbError && legacyRow.session_id && isMissingColumn(dbError)) {
        const { session_id, ...noSession } = legacyRow; // eslint-disable-line no-unused-vars
        ({ data, error: dbError } = await insert(noSession));
      }
    }

    if (dbError) {
      // Clean up storage if DB insert fails
      await supabase.storage.from('images').remove([storagePath]);
      if (isMissingConfig(dbError)) return unconfigured();
      return Response.json({ error: dbError.message }, { status: 500 });
    }

    // Return image with signed URL for immediate use
    const { data: urlData } = await supabase.storage
      .from('images')
      .createSignedUrl(storagePath, 60 * 60); // 1 hour

    // Even the legacy-fallback write answers in the new vocabulary.
    return Response.json({ ...presentImageRow(data), url: urlData?.signedUrl }, { status: 201 });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// DELETE /api/images?id=… — permanently remove one image: the storage object
// AND the row (client ruling: "i should also be able to easily delete them").
// A storage-removal failure still deletes the row but reports it honestly
// (storageRemoved:false) — a row pointing at a dead object is worse than an
// orphaned object. Same graceful-degradation contract as GET/POST.
export async function DELETE(request) {
  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  try {
    // Look up the storage path before deleting the row.
    const { data: row, error: readError } = await supabase
      .from('images')
      .select('id, storage_path, thumb_path')
      .eq('id', id)
      .maybeSingle();
    if (readError) {
      if (isMissingConfig(readError)) return unconfigured();
      return Response.json({ error: readError.message }, { status: 500 });
    }
    if (!row) return Response.json({ configured: true, deleted: false });

    // Storage first (best-effort — reported, never blocking the row delete).
    let storageRemoved = false;
    try {
      const paths = [row.storage_path, row.thumb_path].filter(Boolean);
      const { error: rmError } = await supabase.storage.from('images').remove(paths);
      storageRemoved = !rmError;
    } catch { storageRemoved = false; }

    const { error: delError } = await supabase.from('images').delete().eq('id', id);
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
