import { getAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Generate signed URLs server-side (admin client has storage access)
  if (data?.length) {
    const paths = data.map(img => img.storage_path);
    const { data: signed } = await supabase.storage
      .from('images')
      .createSignedUrls(paths, 60 * 60); // 1 hour
    if (signed) {
      const urlMap = {};
      signed.forEach(s => { urlMap[s.path] = s.signedUrl; });
      return Response.json(data.map(img => ({ ...img, url: urlMap[img.storage_path] || null })));
    }
  }

  return Response.json(data);
}

export async function POST(request) {
  const supabase = getAdminClient();
  const formData = await request.formData();

  const file = formData.get('file');
  const sourceType = formData.get('source_type');   // midjourney_render | real_photo
  const consentStatus = formData.get('consent_status') || 'na'; // na | cleared | pending | blocked

  if (!file || !sourceType) {
    return Response.json({ error: 'file and source_type are required' }, { status: 400 });
  }

  // Validate consent: real photos must have an explicit consent status
  if (sourceType === 'real_photo' && consentStatus === 'na') {
    return Response.json({ error: 'Real photos require a consent status' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.name.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  const storagePath = `uploads/${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  // Generate thumbnail (compress to ~200px wide via canvas is client-side;
  // server-side we store path and let client handle thumb display)
  const thumbPath = null; // Phase 3: add sharp for server-side thumb generation

  // Save metadata to DB
  const { data, error: dbError } = await supabase
    .from('images')
    .insert({
      storage_path: storagePath,
      thumb_path: thumbPath,
      filename: file.name,
      source_type: sourceType,
      consent_status: sourceType === 'real_photo' ? consentStatus : 'na',
      metadata: {
        size: buffer.length,
        type: file.type,
        ext,
      },
    })
    .select()
    .single();

  if (dbError) {
    // Clean up storage if DB insert fails
    await supabase.storage.from('images').remove([storagePath]);
    return Response.json({ error: dbError.message }, { status: 500 });
  }

  // Return image with signed URL for immediate use
  const { data: urlData } = await supabase.storage
    .from('images')
    .createSignedUrl(storagePath, 60 * 60); // 1 hour

  return Response.json({ ...data, url: urlData?.signedUrl }, { status: 201 });
}
