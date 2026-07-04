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

// Map the active canvas format to a valid Soul size. Wide formats → landscape,
// everything else → square (portrait/story crop cleanly from a square, matching
// the gpt-image-1 sizing choice in the route).
function soulSizeForDimension(dimensionId) {
  const wide = ['twitter', 'facebook', 'banner'];
  return wide.includes(dimensionId) ? '2048x1152' : '1536x1536';
}

// Brand-style wrapper mirroring brandImagePrompt() in app/api/assistant/route.js
// (editorial preschool photography, warm light, earthy palette, no text). An
// optional negativeSpace directive keeps a calm region for the studio's own
// type/logo lockup (derived per-archetype in the route).
function brandPhotoPrompt(scene, negativeSpace) {
  const parts = [
    'Editorial photography for a calm, premium preschool / early-education brand.',
    // (feed-grammar §6, 2026-07-04 client brief) BRIGHT · AIRY · LUMINOUS: soft bright
    // window light, high-key exposure, whites and living greens with potted plants.
    'Bright, airy, luminous natural window light; high-key, softly exposed; whites, ivory and living greens with potted plants; gentle earthy accents (deep forest green, soft mauve, muted celadon).',
    // Casting matches the brand's actual students: ~10-year-old Asian children (a
    // teacher may appear beside them). Still-life / object scenes are in-grammar too.
    'When children appear, cast approximately ten-year-old Asian children (a teacher may appear beside them); unposed and natural. Object / still-life scenes (a plate of fruit, a gingham cloth, wooden blocks on a table, plants on a sunlit sill) are equally welcome, styled with the same bright airy light.',
    'Authentic, unposed, documentary feel; shallow depth of field; no harsh flash.',
    'Absolutely NO text, letters, words, captions, logos, watermarks, or signage anywhere in the image.',
  ];
  if (negativeSpace && String(negativeSpace).trim()) {
    parts.push(`Composition: ${String(negativeSpace).trim()}`);
  }
  parts.push(`Scene: ${scene}`);
  return parts.join(' ');
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

// ── Shared Soul job runner ────────────────────────────────────────────────
// Submit one text2image/soul job-set and poll it to a terminal state within the
// time budget, then download the first usable image as base64. Both the photo
// provider (generatePhoto) and the full-design generator (generateDesign) share
// this so the async job-set lifecycle lives in one place. NEVER throws — returns
// { imageB64 } on success or { imageB64:null, refused:true } on any failure.
async function runSoulJob(headers, params, { timeoutMs = POLL_TIMEOUT_MS } = {}) {
  // ── 1. Submit the job-set ──────────────────────────────────────────────
  let jobSetId;
  try {
    const res = await fetch(`${BASE}/v1/text2image/soul`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ params }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Higgsfield submit error:', res.status, json?.detail || res.statusText);
      return { imageB64: null, refused: true };
    }
    jobSetId = json?.id;
    if (!jobSetId) {
      console.error('Higgsfield submit: no job-set id in response');
      return { imageB64: null, refused: true };
    }
  } catch (err) {
    console.error('Higgsfield submit threw:', err?.message || err);
    return { imageB64: null, refused: true };
  }

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
    width_and_height: soulSizeForDimension(dimensionId),
    quality: '720p',
    batch_size: 1,
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   FULL-DESIGN GENERATION (generation-first pipeline)

   The client ruled that Higgsfield should compose the WHOLE Instagram post —
   photography, type, layout, palette — because its composition quality far
   exceeds the archetype composer's. We then EXTRACT that composition into our
   native element grammar (app/api/design-extract) and RECONSTRUCT it as a
   fully-editable design (our own fonts/logos/text — which fixes Higgsfield's
   garbled-text weakness). So the design PNG below is a REFERENCE the vision
   model reads, not the shipped artwork.

   There is NO image2image / edit endpoint on the platform (probed July 2026:
   /v1/{image2image,img2img,edit,image-to-image}/soul all 404 "Model not
   found"). The pipeline is therefore SINGLE-SHOT text2image with the full brand
   brief in the prompt. If Higgsfield ever ships an edit endpoint, a "Try
   another"/refine pass could seed from the prior PNG; today it re-generates.
   ───────────────────────────────────────────────────────────────────────── */

// The full brand brief — deep-green/ivory/tangerine-pill system, Romie-style
// serif statements, calm scale, generous whitespace, bright airy luminous
// photography of ~10yo Asian children (feed-grammar §6 / visual-language-spec).
// Higgsfield renders a COMPLETE post from this + the user's brief verbatim.
function brandDesignPrompt(brief) {
  const parts = [
    'A single, full-bleed SOCIAL MEDIA GRAPHIC that FILLS THE ENTIRE SQUARE FRAME edge to edge — the finished artwork itself, as it would appear printed on the canvas.',
    'CRITICAL: this is the flat graphic ONLY. Do NOT draw any phone, browser window, app interface, Instagram UI, like/comment/share icons, buttons, scrollbars, device frame, mockup, or drop shadow around it. No screenshot of an app. Just the poster/graphic, bleeding to all four edges.',
    'It is a promotional post for The White Orchid, a calm, premium Singaporean early-education brand — text, layout, colour and photography composed together like an in-house art director made it.',
    'BRAND SYSTEM. Palette: deep forest green (#254E48), warm ivory (#F5F6E7), with a single soft tangerine pill/lozenge (#F6644E) as the ONLY accent (used as a small CTA button, never decorative), plus optional muted pastels (wisteria mauve, celadon green, butter yellow). One background + one ink + at most one accent.',
    'TYPOGRAPHY. An oversized editorial SERIF display statement (Romie / Cormorant feel), sentence case, calm not billboard, occasionally italicising ONE emphasis word; small light sans captions and details; tiny tracked ALL-CAPS micro-labels / eyebrows. Clear hierarchy — the serif statement dominates.',
    'COMPOSITION. Generous whitespace (40–60% empty), calm restrained scale, hero anchored off-centre (top-left or upper area, never dead-centre). Editorial, quiet, confident — like Kinfolk or Aesop warmed for children. NO clutter, NO gradients.',
    'PHOTOGRAPHY (if the design includes a photo). Bright, airy, luminous natural window light; high-key; whites, ivory and living greens with potted plants. When children appear, cast approximately ten-year-old ASIAN children (a teacher may appear beside them), unposed and natural. Still-life / object scenes are equally welcome.',
    `THE POST TO DESIGN (compose the graphic around this brief): ${brief}`,
    'Again: the OUTPUT IS THE GRAPHIC FILLING THE WHOLE FRAME — no app chrome, no device, no surrounding UI.',
  ];
  return parts.join(' ');
}

/**
 * Generate a COMPLETE Instagram-post design via Higgsfield (generation-first).
 * Single-shot text2image with the full brand brief; the returned PNG is the
 * reference the extraction route reads. Square 1080-class output regardless of
 * the target dimension — square crops cleanly and gives the vision model the
 * fullest composition to read (the reconstruction re-flows into the real dim).
 *
 * @param {{brief:string, dimensionId?:string}} args
 * @returns {Promise<{imageB64:string}|{imageB64:null, refused:true, unconfigured?:boolean}>}
 */
export async function generateDesign({ brief, dimensionId } = {}) {
  const headers = authHeaders();
  if (!headers) return { imageB64: null, refused: true, unconfigured: true };
  if (!brief || !String(brief).trim()) return { imageB64: null, refused: true };

  // Wide formats read best as landscape; everything else composes as a square
  // (the reconstruction re-flows the extracted grammar into the actual crop).
  const wide = ['twitter', 'facebook', 'banner'];
  const size = wide.includes(dimensionId) ? '2048x1152' : '1536x1536';

  return runSoulJob(headers, {
    prompt: brandDesignPrompt(String(brief).trim()),
    width_and_height: size,
    quality: '1080p', // full design → the sharper tier so the vision pass reads type/layout well
    batch_size: 1,
  });
}
