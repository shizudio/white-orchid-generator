/* ─────────────────────────────────────────────────────────────────────────
   HIGGSFIELD PHOTO PROVIDER — the PRIMARY editorial-photo generator for the
   studio (gpt-image-1 stays as the fallback in app/api/assistant/route.js).

   Higgsfield's platform API is an ASYNC job-set model. The surface below was
   confirmed empirically against https://platform.higgsfield.ai (July 2026):

     POST /v1/text2image/soul
       headers: hf-api-key, hf-secret, Content-Type: application/json
       body:    { "params": { prompt, width_and_height, quality, batch_size?, seed? } }
       → 200 { id: "<uuid>", ... }   (the job-set id)
       → 403 { detail: "Not enough credits" }   (authenticated, but no balance)
       → 422 { detail: [ … pydantic validation … ] }

     GET /v1/job-sets/{id}
       headers: hf-api-key, hf-secret
       → { id, status, jobs: [ { id, status, results: { raw:{url}, min:{url} } } ] }
       job.status ∈ queued | in_progress | completed | failed | nsfw | canceled

   Confirmed enums (from the 422 validator):
     width_and_height ∈ '1152x2048','2048x1152','2048x1536','1536x2048',
       '1344x2016','2016x1344','960x1696','1536x1536','1536x1152','1696x960',
       '1152x1536','1088x1632','1632x1088','1120x1680','1680x1120','2048x2048'
     quality ∈ '720p' | '1080p'
     batch_size ∈ 1 | 4
   Required: prompt, width_and_height, quality.  No model/style field required.

   CONTRACT: generatePhoto() NEVER throws. It returns one of:
     { imageB64 }                              — success (PNG-compatible base64)
     { imageB64: null, refused: true }         — timeout / job failure / http error
     { imageB64: null, refused: true, unconfigured: true }  — no API keys set
   so the route can transparently fall back to gpt-image-1.
   ───────────────────────────────────────────────────────────────────────── */

const BASE = 'https://platform.higgsfield.ai';

// Poll budget: the route's maxDuration is 60s. We keep our own generation under
// ~50s so a slow job degrades to the gpt-image-1 fallback rather than a 504.
const POLL_TIMEOUT_MS = 50_000;
const POLL_INTERVAL_MS = 2_500;

// ── SOUL v2 (client correction 2026-07-04) ────────────────────────────────────
// The client supplied the authoritative Soul v2 payload from Higgsfield's own MCP
// (backend model id `text2image_soul_v2`, style "General"):
//   { model:"text2image_soul_v2", style_id:"3db34ab5-…", style_strength:null,
//     width:1536, height:2048, quality:"2k", batch_size:1, enhance_prompt:false,
//     seed:<rand>, prompt }
// Probed empirically against the public platform API (July 2026): the only working
// generation route is POST /v1/text2image/soul, and it takes a { params:{…} }
// wrapper with the OLDER field names — width_and_height (enum), quality ∈
// 720p|1080p — but it DOES accept the v2 extras style_id / seed / enhance_prompt /
// style_strength (validator passes; it 400s only on an unknown style_id). No
// /v1/text2image/soul_v2 route exists, and quality:"2k"/flat width+height are
// rejected there. So Soul v2 here = the working Soul endpoint + the v2 style/seed
// extras, with width/height mapped to the nearest width_and_height enum. The exact
// client style_id may not resolve on every account, so we submit WITH it and retry
// once WITHOUT it on "style not found" (business-logic 400), never breaking gen.
const SOUL_STYLE_ID = '3db34ab5-3439-4317-9e03-08dc30852e69'; // "General" (client Soul v2 spec)
const SOUL_QUALITY = '1080p'; // nearest accepted tier to the client's "2k" (public API caps here)

// Map the active canvas format to a valid Soul width_and_height enum. Wide formats
// → landscape; everything else → portrait 1536x2048 (the client's Soul v2 default;
// square/story crop cleanly from it).
function soulSizeForDimension(dimensionId) {
  const wide = ['twitter', 'facebook', 'banner'];
  return wide.includes(dimensionId) ? '2048x1152' : '1536x2048';
}

// Build the { params } body for a Soul v2 job: brand prompt + size + the v2 style
// and a random seed. `withStyle=false` drops style_id for the graceful retry when
// the account rejects the client's style id.
function soulParams({ prompt, dimensionId, withStyle = true }) {
  const params = {
    prompt,
    width_and_height: soulSizeForDimension(dimensionId),
    quality: SOUL_QUALITY,
    batch_size: 1,
    enhance_prompt: false,           // (Soul v2 spec) we supply the full brand prompt
    seed: Math.floor(Math.random() * 1_000_000), // (Soul v2 spec) random per gen; validator caps at 1e6
  };
  // The client spec sends style_strength:null, but this validator requires a float
  // whenever a style_id is present — use a balanced default so the "General" style
  // guides without overpowering the brand prompt.
  if (withStyle) { params.style_id = SOUL_STYLE_ID; params.style_strength = 0.8; }
  return params;
}

/* ─────────────────────────────────────────────────────────────────────────
   PHOTOGRAPHER-BRIEF PROMPT (client architectural pivot 2026-07-04)

   The client's reference grids are NOT AI-composed designs — Higgsfield produced
   ONLY bare photographs (photographer briefs, zero brand/design/text words); all
   type, panels and composition were composited in CODE afterward (our engine's
   job). So this builder is a pure PHOTOGRAPHER'S brief: it must NEVER contain a
   brand name, tagline, copy, or any design/layout word — those make the diffusion
   model render text/posters (the "text wall" failure). It follows the client's
   verbatim template structure:
     lead with "photograph" · ONE scene, ONE subject with a concrete action ·
     setting · lighting · the fixed warm color-grade sentence · a camera line ·
     ALWAYS the fixed closing negative line.

   Client example (verbatim): "Bright, airy editorial photograph of an average
   ten-year-old Asian child painting with watercolours at a pale oak table, small
   jars of muted paint and a jar of water, absorbed and quietly happy. Bright soft
   natural daylight, luminous and evenly lit, clean and fresh, minimal grain.
   Gentle warm color, forest green, ivory and warm terracotta, natural warm Asian
   skin tones. Medium format, crisp, generous negative space. No text, no logos,
   no graphic overlays."
   ───────────────────────────────────────────────────────────────────────── */

// The fixed grade + closing lines every White Orchid photo carries (client spec).
const PHOTO_GRADE = 'Gentle warm color grade, palette of forest green, ivory and warm terracotta, natural warm Asian skin tones.';
const PHOTO_CLOSING = 'No text, no letters, no words, no logos, no UI, no poster, no frame, no layout, no captions. A single full-frame photograph.';

function brandPhotoPrompt(scene, negativeSpace) {
  // The camera line — Medium format is the default (client example); the optional
  // negativeSpace hint from the archetype folds into the "generous negative space"
  // clause so the composed type/logo has a calm region to sit over.
  const negNote = negativeSpace && String(negativeSpace).trim()
    ? `generous negative space (${String(negativeSpace).trim()})`
    : 'generous negative space';
  const camera = `Medium format, crisp, ${negNote}.`;
  // If the caller already wrote a full photographer brief (landing scenePrompt),
  // `scene` leads; we still guarantee the lighting/grade/camera/closing scaffold so
  // an under-specified scene is always on-brand. Lead with "photograph".
  const lead = /^\s*(a\s+)?(bright|photograph|editorial|medium format|close|wide)/i.test(scene)
    ? String(scene).trim()
    : `Bright, airy editorial photograph of ${String(scene).trim()}`;
  return [
    lead.replace(/\.?\s*$/, '.'),
    'Bright soft natural daylight, luminous and evenly lit, clean and fresh, minimal grain.',
    PHOTO_GRADE,
    camera,
    PHOTO_CLOSING,
  ].join(' ');
}

function authHeaders() {
  const key = process.env.HIGGSFIELD_API_KEY;
  const secret = process.env.HIGGSFIELD_API_SECRET;
  if (!key || !secret) return null;
  return {
    'hf-api-key': key,
    'hf-secret': secret,
    'Content-Type': 'application/json',
  };
}

// True when Higgsfield creds are present (so a route can choose the generation-first
// pipeline vs the instant archetype fallback WITHOUT spending a probe request).
export function higgsfieldConfigured() {
  return !!authHeaders();
}

// Pull the first usable image URL out of a completed job-set. Higgsfield returns
// both a downscaled `min` and a full `raw` URL per job; prefer raw.
function firstImageUrl(jobSet) {
  for (const job of jobSet?.jobs || []) {
    const url = job?.results?.raw?.url || job?.results?.min?.url || null;
    if (url) return url;
  }
  return null;
}

// ── Submit a Soul v2 job-set (with graceful style-id retry) ─────────────────
// POSTs the { params } body; on a business-logic 400 about the Soul style (the
// account rejecting the client's style_id) it retries ONCE without style_id so a
// gen never breaks on a style mismatch. Returns the job-set id or null.
async function submitSoulJob(headers, { prompt, dimensionId }) {
  for (const withStyle of [true, false]) {
    let res, json;
    try {
      res = await fetch(`${BASE}/v1/text2image/soul`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ params: soulParams({ prompt, dimensionId, withStyle }) }),
      });
      json = await res.json().catch(() => ({}));
    } catch (err) {
      console.error('Higgsfield submit threw:', err?.message || err);
      return null;
    }
    if (res.ok && json?.id) return json.id;
    const detail = String(json?.detail || '');
    // Retry without the style only for the "style not found" business error.
    if (withStyle && res.status === 400 && /style/i.test(detail)) {
      console.warn('Higgsfield: Soul style_id rejected, retrying without style.');
      continue;
    }
    console.error('Higgsfield submit error:', res.status, json?.detail || res.statusText);
    return null;
  }
  return null;
}

// ── Shared Soul job runner ────────────────────────────────────────────────
// Submit one text2image/soul job-set and poll it to a terminal state within the
// time budget, then download the first usable image as base64. Both the photo
// provider (generatePhoto) and the photo start/poll split (startPhotoJob) share
// this so the async job-set lifecycle lives in one place. NEVER throws — returns
// { imageB64 } on success or { imageB64:null, refused:true } on any failure.
async function runSoulJob(headers, { prompt, dimensionId }, { timeoutMs = POLL_TIMEOUT_MS } = {}) {
  // ── 1. Submit the job-set (Soul v2, with style-id retry) ────────────────
  const jobSetId = await submitSoulJob(headers, { prompt, dimensionId });
  if (!jobSetId) return { imageB64: null, refused: true };

  // ── 2. Poll the job-set until terminal or the time budget runs out ──────
  const deadline = Date.now() + timeoutMs;
  let imageUrl = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let jobSet;
    try {
      const res = await fetch(`${BASE}/v1/job-sets/${jobSetId}`, { headers });
      if (!res.ok) continue; // transient — keep polling within the budget
      jobSet = await res.json().catch(() => null);
    } catch {
      continue;
    }
    const jobs = jobSet?.jobs || [];
    if (!jobs.length) continue;
    const terminal = jobs.every((j) =>
      ['completed', 'failed', 'nsfw', 'canceled'].includes(j.status)
    );
    if (!terminal) continue;
    imageUrl = firstImageUrl(jobSet);
    // Any terminal state (failed / nsfw / no url) → graceful fallback.
    break;
  }
  if (!imageUrl) {
    console.error('Higgsfield: timed out or no image after polling');
    return { imageB64: null, refused: true };
  }

  // ── 3. Download the result and return base64 ────────────────────────────
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return { imageB64: null, refused: true };
    const buf = Buffer.from(await imgRes.arrayBuffer());
    return { imageB64: buf.toString('base64') };
  } catch (err) {
    console.error('Higgsfield download threw:', err?.message || err);
    return { imageB64: null, refused: true };
  }
}

/**
 * Generate one on-brand editorial photo via Higgsfield.
 * @param {{scene:string, dimensionId?:string, negativeSpace?:string}} args
 * @returns {Promise<{imageB64:string}|{imageB64:null, refused:true, unconfigured?:boolean}>}
 */
export async function generatePhoto({ scene, dimensionId, negativeSpace } = {}) {
  const headers = authHeaders();
  if (!headers) return { imageB64: null, refused: true, unconfigured: true };
  if (!scene || !String(scene).trim()) return { imageB64: null, refused: true };

  return runSoulJob(headers, {
    prompt: brandPhotoPrompt(String(scene).trim(), negativeSpace),
    dimensionId,
  });
}

/* ── START-JOB / POLL SPLIT (Vercel-60s-safe) ──────────────────────────────────
   The photo-first landing flow can't hold one request open for the full ~20–40s
   photo generation on Vercel, so app/api/design-generate submits a Soul v2 photo
   job and returns its id, then polls with GET requests. These two helpers expose
   the submit + single-poll steps of runSoulJob without its internal wait loop.
   Both NEVER throw — they return refusal shapes the route degrades on. The photo
   the landing generates becomes the background our ENGINE composes the post over
   (archetype + materializer), so there is no design-pass generation any more. */

/**
 * Submit a PHOTO job (photographer brief) WITHOUT waiting. Returns the job-set id.
 * @param {{scene:string, dimensionId?:string, negativeSpace?:string}} args
 * @returns {Promise<{jobId:string}|{jobId:null, refused:true, unconfigured?:boolean}>}
 */
export async function startPhotoJob({ scene, dimensionId, negativeSpace } = {}) {
  const headers = authHeaders();
  if (!headers) return { jobId: null, refused: true, unconfigured: true };
  if (!scene || !String(scene).trim()) return { jobId: null, refused: true };
  const jobId = await submitSoulJob(headers, {
    prompt: brandPhotoPrompt(String(scene).trim(), negativeSpace),
    dimensionId,
  });
  if (!jobId) return { jobId: null, refused: true };
  return { jobId };
}

/**
 * Poll a job-set ONCE. Returns { status: 'pending' } while running, or
 * { status: 'done', imageB64 } / { status: 'failed' } when terminal. Never throws.
 * @param {string} jobId  the job-set id from startPhotoJob
 */
export async function pollPhotoJob(jobId) {
  const headers = authHeaders();
  if (!headers) return { status: 'failed', unconfigured: true };
  if (!jobId) return { status: 'failed' };
  let jobSet;
  try {
    const res = await fetch(`${BASE}/v1/job-sets/${jobId}`, { headers });
    if (!res.ok) return { status: 'pending' }; // transient — caller polls again
    jobSet = await res.json().catch(() => null);
  } catch {
    return { status: 'pending' };
  }
  const jobs = jobSet?.jobs || [];
  if (!jobs.length) return { status: 'pending' };
  const terminal = jobs.every((j) =>
    ['completed', 'failed', 'nsfw', 'canceled'].includes(j.status)
  );
  if (!terminal) return { status: 'pending' };
  const imageUrl = firstImageUrl(jobSet);
  if (!imageUrl) return { status: 'failed' }; // failed / nsfw / no url → graceful
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return { status: 'failed' };
    const buf = Buffer.from(await imgRes.arrayBuffer());
    return { status: 'done', imageB64: buf.toString('base64') };
  } catch (err) {
    console.error('Higgsfield design download threw:', err?.message || err);
    return { status: 'failed' };
  }
}
