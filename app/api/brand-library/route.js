/* ─────────────────────────────────────────────────────────────────────────
   BRAND LIBRARY BUILDER (admin / dev utility)

   Generates ONE archetype-primed brand photo per request and saves it straight
   to the Supabase Library (the same `images` table + storage the studio's own
   uploads use). The client (window.__woBuildLibrary in components/Generator.jsx)
   calls this SEQUENTIALLY — index 0, 1, 2 … — with a small delay between jobs,
   so we respect Higgsfield's rate limits and the run is resumable/cancellable.

   Provider: Higgsfield first (lib/higgsfield.generatePhoto), gpt-image-1 fallback
   (mirrors the assistant route), so the library fills even when Higgsfield has
   no credits. Returns { ok, provider, index, total, prompt } per job.
   ───────────────────────────────────────────────────────────────────────── */

import { getAdminClient } from '@/lib/supabase';
import { generatePhoto } from '@/lib/higgsfield';
import { requireAdminKey } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Rate limit — same in-memory pattern as templates/design-audit/assistant. This
// route spends real credits, so the bound is tighter than the cheap-write routes;
// it's defence-in-depth BEHIND the admin-key gate (a leaked key still can't burn
// the account). Keyed by client IP, 60s window.
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

// A diverse, brand-primed prompt set: five moods × a negative-space directive
// each, primed toward the archetype most likely to carry that kind of photo. The
// mix intentionally spans outdoor play, quiet focus, hands/materials macro,
// classroom light, and nature walk so a batch fills the library with variety.
const LIBRARY_PROMPTS = [
  { scene: 'young children playing together outdoors on a grassy field, warm late-afternoon sun, joyful and candid',
    negativeSpace: 'keep the upper third calm negative space for a headline and logo.' },
  { scene: 'a child quietly focused on a wooden puzzle at a low table, soft window light, calm and absorbed',
    negativeSpace: 'keep the right side an even, low-detail area with soft light for a text block.' },
  { scene: 'close-up macro of small hands shaping soft clay on a wooden tray, gentle natural light, tactile',
    negativeSpace: 'keep the lower third calm, soft and uncluttered for a small caption.' },
  { scene: 'a bright airy classroom corner with a reading nook, morning light across a wooden shelf, no people',
    negativeSpace: 'keep the middle band calm for an eyebrow label and headline.' },
  { scene: 'children on a gentle nature walk among trees and dappled light, exploring leaves, documentary feel',
    negativeSpace: 'a single clean candid moment; keep the bottom edge calm for a thin caption line.' },
  { scene: 'a small group painting at an easel outdoors, colourful and relaxed, soft overcast light',
    negativeSpace: 'keep the left side an even, calm background for a name and credential.' },
  { scene: 'macro of wooden building blocks and natural materials arranged on a table, warm soft focus, no people',
    negativeSpace: 'a soft, even field with calm central negative space.' },
  { scene: 'sunlight streaming through classroom windows onto an empty circle-time rug, quiet and warm, no people',
    negativeSpace: 'keep the centre and upper area calm for a large date or number.' },
];

// dimensionId for the batch — square reads well as a library background source.
const BATCH_DIMENSION = 'ig_square';

// gpt-image-1 fallback (mirrors app/api/assistant/route.js), so the library still
// fills when Higgsfield is out of credits. Never throws.
function brandImagePrompt(scene, negativeSpace) {
  const parts = [
    'Editorial photography for a calm, premium preschool / early-education brand.',
    'Warm natural light, soft focus, gentle earthy palette (deep forest green, ivory, soft mauve, muted celadon).',
    'Authentic, unposed, documentary feel; shallow depth of field; no harsh flash.',
    'Absolutely NO text, letters, words, captions, logos, watermarks, or signage anywhere in the image.',
  ];
  if (negativeSpace) parts.push(`Composition: ${negativeSpace}`);
  parts.push(`Scene: ${scene}`);
  return parts.join(' ');
}

async function openaiFallback(scene, negativeSpace) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { imageB64: null };
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: brandImagePrompt(scene, negativeSpace),
        n: 1,
        size: '1024x1024',
        quality: 'medium',
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { console.error('brand-library gpt-image-1 error:', json?.error?.message || res.statusText); return { imageB64: null }; }
    return { imageB64: json?.data?.[0]?.b64_json || null };
  } catch {
    return { imageB64: null };
  }
}

export async function GET() {
  // Expose the plan so the client hook knows how many jobs there are.
  return Response.json({ total: LIBRARY_PROMPTS.length, prompts: LIBRARY_PROMPTS.map(p => p.scene) });
}

export async function POST(request) {
  // Credit-spending endpoint — admin-key gated + rate-limited (Phase-0 hardening).
  const denied = requireAdminKey(request);
  if (denied) return denied;
  if (isRateLimited(request)) {
    return Response.json({ error: 'Generating too fast — please wait a moment.' }, { status: 429 });
  }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  const index = Number.isInteger(body?.index) ? body.index : 0;
  const plan = LIBRARY_PROMPTS[index];
  if (!plan) return Response.json({ error: 'Index out of range.', total: LIBRARY_PROMPTS.length }, { status: 400 });

  // PRIMARY: Higgsfield.
  let provider = 'higgsfield';
  let { imageB64 } = await generatePhoto({ scene: plan.scene, dimensionId: BATCH_DIMENSION, negativeSpace: plan.negativeSpace });
  // FALLBACK: gpt-image-1.
  if (!imageB64) { provider = 'openai'; ({ imageB64 } = await openaiFallback(plan.scene, plan.negativeSpace)); }
  if (!imageB64) {
    return Response.json({ ok: false, index, total: LIBRARY_PROMPTS.length, error: 'Both providers declined this prompt.' }, { status: 502 });
  }

  // Save to the Supabase Library (same table + bucket as studio uploads).
  try {
    const supabase = getAdminClient();
    const buffer = Buffer.from(imageB64, 'base64');
    const storagePath = `uploads/${Date.now()}-brand-library-${index}.png`;
    const { error: upErr } = await supabase.storage.from('images').upload(storagePath, buffer, { contentType: 'image/png', upsert: false });
    if (upErr) return Response.json({ ok: false, index, error: upErr.message }, { status: 500 });
    const { error: dbErr } = await supabase.from('images').insert({
      storage_path: storagePath,
      thumb_path: null,
      filename: `brand-library-${index}.png`,
      source_type: 'midjourney_render', // AI render → no consent gate
      consent_status: 'na',
      metadata: { size: buffer.length, type: 'image/png', ext: 'png', batch: 'brand-library', provider, scene: plan.scene },
    });
    if (dbErr) { await supabase.storage.from('images').remove([storagePath]); return Response.json({ ok: false, index, error: dbErr.message }, { status: 500 }); }
  } catch (err) {
    return Response.json({ ok: false, index, error: err?.message || 'save failed' }, { status: 500 });
  }

  return Response.json({ ok: true, index, total: LIBRARY_PROMPTS.length, provider, scene: plan.scene });
}
