/* ─────────────────────────────────────────────────────────────────────────
   ACTIVITY CATEGORIZER (client ruling 2026-08-03: "detect what is the activity
   within the images and help categorize")

   POST — finds Library rows with no metadata.activity, sends each image to
   OpenAI vision (gpt-4o-mini, detail:"low", tiny max_tokens) for a short
   generic activity label, and writes metadata.activity = { label, raw, model,
   labeledAt } per row. Batched (≤10/request); the response carries
   remaining/done so the client loops. Already-labeled rows (model or owner)
   are never re-labeled — idempotent, and owner labels are pinned forever.

   THIS SPENDS CREDITS → admin-key gated exactly like the other credit-spending
   routes (lib/admin-auth: x-wo-admin-key, fail-closed 503) + rate-limited as
   defence-in-depth behind the gate (same pattern as brand-library).

   Graceful degradation: no OPENAI_API_KEY or no Supabase env → 200
   { configured:false }, never a 500. One image failing vision/save is skipped
   (named in `skipped`) — never aborts the batch. Batch/idempotency/shape logic
   lives in lib/activity-vision.mjs (pure, unit-tested with mocked I/O).
   ───────────────────────────────────────────────────────────────────────── */

import { getAdminClient } from '@/lib/supabase';
import { requireAdminKey } from '@/lib/admin-auth';
import {
  ACTIVITY_VISION_PROMPT,
  VISION_MODEL,
  clampBatchLimit,
  runCategorizeBatch,
} from '@/lib/activity-vision.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Same in-memory limiter pattern as brand-library (keyed by client IP, 60s
// window). Each request is ≤10 vision calls, so 20/min bounds the burn at
// ~200 low-detail mini-model calls/min (cents) — defence-in-depth BEHIND the
// admin-key gate, loose enough that the Library's batch loop never trips it.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
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
  return Response.json({ configured: false, ...extra });
}
function isMissingConfig(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || /not set|not configured|does not exist|schema cache/i.test(msg);
}

export async function POST(request) {
  // Credit-spending endpoint — the gate comes FIRST (fail-closed 503 when
  // WO_ADMIN_KEY is unset, 403 on a wrong/absent header).
  const denied = requireAdminKey(request);
  if (denied) return denied;
  if (isRateLimited(request)) {
    return Response.json({ error: 'Categorizing too fast — please wait a moment.' }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return unconfigured({ reason: 'OPENAI_API_KEY is not set' });

  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  let body = {};
  try { body = await request.json(); } catch { /* empty body → defaults */ }
  const limit = clampBatchLimit(body?.limit);

  try {
    // Oldest-first so repeated runs walk the library deterministically.
    const { data: rows, error } = await supabase
      .from('images')
      .select('id, storage_path, filename, metadata')
      .order('created_at', { ascending: true });
    if (error) {
      if (isMissingConfig(error)) return unconfigured();
      return Response.json({ error: error.message }, { status: 500 });
    }

    // One vision call per image: signed URL (private bucket) → gpt-4o-mini at
    // detail:"low" with a tiny completion budget. Throws propagate into the
    // engine's per-image skip — never out of the batch.
    const labelImage = async (row) => {
      const { data: signed, error: signErr } = await supabase.storage
        .from('images')
        .createSignedUrl(row.storage_path, 300);
      if (signErr || !signed?.signedUrl) {
        throw new Error(signErr?.message || 'could not sign the image URL');
      }
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: VISION_MODEL,
          max_tokens: 12,
          temperature: 0.2,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: ACTIVITY_VISION_PROMPT },
              { type: 'image_url', image_url: { url: signed.signedUrl, detail: 'low' } },
            ],
          }],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || `vision request failed (${res.status})`);
      return json?.choices?.[0]?.message?.content || '';
    };

    const saveActivity = async (row, activity) => {
      const metadata = { ...(row.metadata || {}), activity };
      const { error: upErr } = await supabase.from('images').update({ metadata }).eq('id', row.id);
      if (upErr) throw new Error(upErr.message);
    };

    const result = await runCategorizeBatch({ rows, limit, labelImage, saveActivity });
    return Response.json({ configured: true, ...result });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
