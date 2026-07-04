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

// ── SOUL PAYLOAD — verified against the live validator (2026-07-04) ────────────
// Re-probed the public platform API directly (2 x 422 probes). The validator is
// decisive and OVERRIDES the client's "public surface" ruling:
//   • { params:{…} } wrapper is REQUIRED (flat {model,quality,aspect_ratio,prompt}
//     → 422 "params Field required"). The client's flat/aspect_ratio shape is wrong.
//   • width_and_height (enum) is REQUIRED; aspect_ratio is NOT a field
//     (422 "width_and_height Field required" even when aspect_ratio is supplied).
//   • quality ∈ '720p' | '1080p' ONLY — quality:"2k" → 422 "should be '720p' or
//     '1080p'". The client's "2k" cannot be honored; we cap at the top tier 1080p.
//   • soul_id, seed, enhance_prompt, model are accepted (validator raised NO error
//     on them) — so soul_id is the supported consistency mechanism, seed is honored,
//     enhance_prompt:false is accepted.
//   • style_id is DROPPED: it is MCP-internal, not on the public surface, and our
//     key 400s "style not found" on it — so no style field, no graceful retry.
// soul_id / seed are OPTIONAL and come from env (a trained Soul identity locks the
// brand look; unset seed = random per gen).
const SOUL_QUALITY = '1080p'; // top accepted tier (validator caps here; client's "2k" is rejected)
const SOUL_ID = process.env.HIGGSFIELD_SOUL_ID || null; // trained Soul identity (locked brand look), optional
const SOUL_SEED = process.env.HIGGSFIELD_SEED;          // optional fixed seed; unset = random per gen

// Map the active canvas format to a valid Soul width_and_height enum. Wide formats
// → landscape; everything else → portrait 1536x2048 (the client's Soul v2 default;
// square/story crop cleanly from it).
function soulSizeForDimension(dimensionId) {
  const wide = ['twitter', 'facebook', 'banner'];
  return wide.includes(dimensionId) ? '2048x1152' : '1536x2048';
}

// Build the { params } body for a Soul job: brand prompt + size + quality, plus the
// optional trained soul_id (locked brand look) and seed (fixed if env-set, else a
// random per-gen seed). No style_id — it is MCP-internal and 400s on our key.
function soulParams({ prompt, dimensionId }) {
  const params = {
    prompt,
    width_and_height: soulSizeForDimension(dimensionId),
    quality: SOUL_QUALITY,
    batch_size: 1,
    enhance_prompt: false,           // we supply the full brand prompt; validator accepts this field
    seed: SOUL_SEED != null && SOUL_SEED !== ''
      ? Number(SOUL_SEED)
      : Math.floor(Math.random() * 1_000_000), // random per gen; validator caps at 1e6
  };
  if (SOUL_ID) params.soul_id = SOUL_ID; // trained Soul identity → consistency mechanism
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
const PHOTO_CLOSING = 'No text, no letters, no words, no logos, no UI, no poster, no frame, no layout, no captions, no border. A single full-frame edge-to-edge photograph.';

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

/* ── WAVE-OF-4 CONCURRENCY (WP-U #6) ─────────────────────────────────────────
   The Higgsfield account allows 4 concurrent jobs. Every submit in this process
   (batch library builds, feed boards, landing, chat) passes through this simple
   FIFO slot queue so a burst never exceeds the account cap. For the start/poll
   split the slot is held only across the SUBMIT (completion is tracked by the
   remote job-set, and requests are stateless on Vercel); for runSoulJob the slot
   is held for the job's whole lifetime, which is what bounds batch loops. */
const MAX_CONCURRENT_JOBS = 4;
let _activeJobs = 0;
const _jobWaiters = [];
async function acquireJobSlot() {
  if (_activeJobs < MAX_CONCURRENT_JOBS) { _activeJobs++; return; }
  await new Promise((r) => _jobWaiters.push(r));
  _activeJobs++;
}
function releaseJobSlot() {
  _activeJobs = Math.max(0, _activeJobs - 1);
  const next = _jobWaiters.shift();
  if (next) next();
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

// ── Submit a Soul job-set ───────────────────────────────────────────────────
// POSTs the { params } body (verified shape: width_and_height enum + quality
// 1080p + optional soul_id/seed). Returns the job-set id or null. No style_id, so
// no retry dance — the payload is what the validator accepts on the first call.
async function submitSoulJob(headers, { prompt, dimensionId }) {
  let res, json;
  try {
    res = await fetch(`${BASE}/v1/text2image/soul`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ params: soulParams({ prompt, dimensionId }) }),
    });
    json = await res.json().catch(() => ({}));
  } catch (err) {
    console.error('Higgsfield submit threw:', err?.message || err);
    return null;
  }
  if (res.ok && json?.id) return json.id;
  console.error('Higgsfield submit error:', res.status, json?.detail || res.statusText);
  return null;
}

// ── Shared Soul job runner ────────────────────────────────────────────────
// Submit one text2image/soul job-set and poll it to a terminal state within the
// time budget, then download the first usable image as base64. Both the photo
// provider (generatePhoto) and the photo start/poll split (startPhotoJob) share
// this so the async job-set lifecycle lives in one place. NEVER throws — returns
// { imageB64 } on success or { imageB64:null, refused:true } on any failure.
async function runSoulJob(headers, { prompt, dimensionId }, { timeoutMs = POLL_TIMEOUT_MS } = {}) {
  // (WP-U #6) hold a wave-of-4 slot for the whole job so batch loops never
  // exceed the account's 4-concurrent-jobs cap.
  await acquireJobSlot();
  try {
    return await _runSoulJobInner(headers, { prompt, dimensionId }, { timeoutMs });
  } finally {
    releaseJobSlot();
  }
}
async function _runSoulJobInner(headers, { prompt, dimensionId }, { timeoutMs = POLL_TIMEOUT_MS } = {}) {
  // ── 1. Submit the job-set ───────────────────────────────────────────────
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
  // (WP-U #6) slot held across the submit only — the start/poll split is
  // stateless per request, so the submit burst is what we can and do bound.
  await acquireJobSlot();
  let jobId;
  try {
    jobId = await submitSoulJob(headers, {
      prompt: brandPhotoPrompt(String(scene).trim(), negativeSpace),
      dimensionId,
    });
  } finally {
    releaseJobSlot();
  }
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

/* ── PHOTO QC (WP-U #4) ─────────────────────────────────────────────────────
   Cheap vision check on a COMPLETED Higgsfield generation (never on Library
   photos): does the image contain rendered text/letters, or read as a poster/
   framed layout instead of a full-frame photograph? The two classic Soul
   failure modes that make a background unusable. Uses the same OpenAI audit
   model the design-audit route uses (gpt-4o by default). NEVER throws and
   degrades OPEN: any API problem returns pass:true so the pipeline is never
   blocked by the QC itself. The caller re-rolls once on a fail (max 2
   attempts), then falls back to Library/samples as before. */
export async function qcPhoto(imageB64) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !imageB64) return { pass: true, skipped: true };
  const model = process.env.OPENAI_AUDIT_MODEL || 'gpt-4o';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 60,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Quality-check this AI-generated background photo. Answer STRICT JSON only: {"text_or_letters": boolean, "poster_or_layout": boolean}. text_or_letters = any rendered text, letters, words, logos or captions visible. poster_or_layout = it looks like a poster, framed/bordered layout, collage or graphic design rather than a single full-frame edge-to-edge photograph.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}`, detail: 'low' } },
          ],
        }],
      }),
    });
    if (!res.ok) return { pass: true, skipped: true };
    const json = await res.json().catch(() => null);
    const raw = json?.choices?.[0]?.message?.content || '{}';
    const verdict = JSON.parse(raw);
    const fail = !!(verdict.text_or_letters || verdict.poster_or_layout);
    return { pass: !fail, textOrLetters: !!verdict.text_or_letters, posterOrLayout: !!verdict.poster_or_layout };
  } catch (err) {
    console.error('Photo QC threw (degrading open):', err?.message || err);
    return { pass: true, skipped: true };
  }
}
