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

import { startPhotoJob, pollPhotoJob, higgsfieldConfigured, qcPhoto } from '@/lib/higgsfield';
import { PATCH_OPTIONS } from '@/lib/design-patch';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

  const { jobId, unconfigured } = await startPhotoJob({ scene, dimensionId, negativeSpace });
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
  const skipQc = searchParams.get('qc') === '0';
  if (!skipQc) {
    const qc = await qcPhoto(poll.imageB64);
    if (!qc.pass) {
      return Response.json({ status: 'qc_failed', textOrLetters: !!qc.textOrLetters, posterOrLayout: !!qc.posterOrLayout });
    }
  }
  return Response.json({ status: 'done', imageDataUrl: `data:image/png;base64,${poll.imageB64}` });
}
