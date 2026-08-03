/* ─────────────────────────────────────────────────────────────────────────
   DESIGN GENERATE — photo start-job / poll (photo-first landing)

   The landing "Design with AI" path, when Higgsfield is configured, generates a
   bare on-brand PHOTOGRAPH (photographer brief — no text/design words) that our
   ENGINE then composes the post over (archetype + materializer). One Higgsfield
   photo takes ~20–40s — too long to hold one Vercel request open — so this route
   splits into a start + poll pair the client drives:

     POST /api/design-generate  { scene, dimensionId, negativeSpace? }
       → { jobId }                          (Higgsfield job-set id; submitted, not awaited)
       → { unconfigured:true } | { failed:true }   (client falls back to Library/solid-field)

     GET  /api/design-generate?jobId=…
       → { status:'pending' }               (still generating — poll again)
       → { status:'done', imageDataUrl }    (the photo — apply as the background)
       → { status:'failed' }                (client falls back silently)

   Each call stays well under 60s: POST returns immediately after submit; GET does
   ONE job-set poll. The Higgsfield job-set id IS the jobId (no server job store →
   Vercel-stateless-safe).
   ───────────────────────────────────────────────────────────────────────── */

import { startPhotoJob, pollPhotoJob, higgsfieldConfigured, qcPhoto, previewPhotoPrompt } from '@/lib/higgsfield';
import { PATCH_OPTIONS } from '@/lib/design-patch';
import { getAdminClient } from '@/lib/supabase';
import { normalizeStyleDna, composeSceneWithStyle } from '@/lib/style-dna.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

// (Brand Style DNA — docs/brand-style-dna-spec.md §4) This route is the single
// choke point every generated-photo path passes through (landing, refresh,
// chat generate), so the style block joins the pipeline HERE and only here.
// Null-safe by contract: ANY Supabase problem (no env, no table, un-migrated
// column) reads as "no style DNA" and the pipeline proceeds byte-identical to
// the pre-feature behavior — this lookup can never fail a generation.
const BRAND_ID = '00000000-0000-0000-0000-000000000001';
async function currentStyleDna() {
  try {
    const supabase = getAdminClient();
    const { data } = await supabase.from('brand_kit').select('*').eq('id', BRAND_ID).single();
    return normalizeStyleDna(data); // reads style_dna, then the photo_brief.styleDna fallback
  } catch {
    return null;
  }
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40; // polling is chatty — allow several polls/min per client
const requestLog = new Map();

function isRateLimited(request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter(time => now - time < WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > MAX_REQUESTS;
}

function safeDimension(id) {
  return PATCH_OPTIONS.dimensionId.includes(id) ? id : 'ig_square';
}

// ── POST: submit a photo job, return its id ──────────────────────────────────
export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'One moment — please wait a few seconds and try again.' }, { status: 429 });
  }
  if (!higgsfieldConfigured()) {
    // The client uses this signal to take the Library/solid-field fallback instead.
    return Response.json({ unconfigured: true }, { status: 200 });
  }
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  const scene = typeof body.scene === 'string' ? body.scene.trim().slice(0, 600) : '';
  if (!scene) return Response.json({ error: 'A photo scene is required.' }, { status: 400 });
  const dimensionId = safeDimension(body.dimensionId);
  const negativeSpace = typeof body.negativeSpace === 'string' ? body.negativeSpace.slice(0, 200) : '';

  // (Style DNA) Compose the brand's style block under its delimiter — with no
  // block, composeSceneWithStyle returns `scene` itself (byte-identical path).
  const outgoingScene = composeSceneWithStyle(scene, await currentStyleDna());

  // (Style DNA spec §4 — verification) Dev-only dry-run: return the assembled
  // scene + final photographer-brief prompt WITHOUT submitting a Higgsfield
  // job (money law — proves prompt assembly live at $0). Never in production.
  if (body.__woDryRun === true && process.env.NODE_ENV !== 'production') {
    return Response.json({
      dryRun: true,
      scene: outgoingScene,
      prompt: previewPhotoPrompt({ scene: outgoingScene, negativeSpace }),
    });
  }

  const { jobId, unconfigured } = await startPhotoJob({ scene: outgoingScene, dimensionId, negativeSpace });
  if (unconfigured) return Response.json({ unconfigured: true }, { status: 200 });
  if (!jobId) return Response.json({ failed: true }, { status: 200 }); // out of credits / upstream error → fall back
  return Response.json({ jobId, dimensionId });
}

// ── GET: poll a job; on completion, return the photo as a data URL ──────────
export async function GET(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'One moment — please wait a few seconds and try again.' }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  if (!jobId) return Response.json({ error: 'A jobId is required.' }, { status: 400 });

  const poll = await pollPhotoJob(jobId);
  if (poll.status === 'pending') return Response.json({ status: 'pending' });
  if (poll.status !== 'done' || !poll.imageB64) {
    return Response.json({ status: 'failed' }); // failed / nsfw / no image → client falls back
  }
  // (WP-U #4) PHOTO QC on completed Higgsfield generations ONLY (Library photos
  // never pass through this route): rendered text/letters or a poster/framed
  // layout makes the background unusable → tell the client so it can re-roll
  // once with a fresh seed (max 2 attempts), then fall back to Library/samples.
  // qc=0 skips (e.g. the final attempt keeps whatever it got). Degrades open.
  // (Style DNA) When the brand carries a style block, the SAME QC call gains
  // ONE extra criterion (broad lighting/palette/texture match). An off-brand
  // verdict re-rolls through the EXISTING machinery — attempt caps unchanged,
  // and qc=0 (the final attempt) still skips QC so the user gets a photo over
  // nothing. Without a block the QC prompt is byte-identical to before.
  const skipQc = searchParams.get('qc') === '0';
  if (!skipQc) {
    const styleDna = await currentStyleDna();
    const qc = await qcPhoto(poll.imageB64, { styleText: styleDna?.text || null });
    if (!qc.pass) {
      return Response.json({
        status: 'qc_failed',
        textOrLetters: !!qc.textOrLetters,
        posterOrLayout: !!qc.posterOrLayout,
        offBrandStyle: !!qc.offBrandStyle,
      });
    }
  }
  return Response.json({ status: 'done', imageDataUrl: `data:image/png;base64,${poll.imageB64}` });
}
