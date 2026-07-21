/* ─────────────────────────────────────────────────────────────────────────
   FEED-PHOTO (dev utility, WP-P P4)

   Generates ONE on-brand editorial photo and returns its base64 DIRECTLY (no
   Supabase write) so the calibration FEED board (window.__woFeedBoard in
   components/Generator.jsx) can place real Higgsfield photos per tile without
   touching the Library. Provider: Higgsfield first (lib/higgsfield.generatePhoto,
   which now bakes in the §6 photography brief — bright/airy/luminous, ~10yo Asian
   children, still-life category), gpt-image-1 fallback so the board fills even
   when Higgsfield has no credits.

   Request:  POST { scene, negativeSpace?, dimensionId? }
   Response: { ok, provider, imageB64 } | { ok:false, error }
   ───────────────────────────────────────────────────────────────────────── */

import { generatePhoto } from '@/lib/higgsfield';
import { requireAdminKey } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Rate limit — same in-memory pattern as templates/design-audit/assistant. This
// route spends real credits, so the bound is tight; it's defence-in-depth BEHIND
// the admin-key gate. Keyed by client IP, 60s window.
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

// gpt-image-1 fallback — mirrors the assistant/brand-library routes, with the same
// §6 brief language so the fallback stays on-brand. Never throws.
async function openaiFallback(scene, negativeSpace) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { imageB64: null };
  const parts = [
    'Editorial photography for a calm, premium preschool / early-education brand.',
    'Bright, airy, luminous natural window light; high-key, softly exposed; whites, ivory and living greens with potted plants.',
    'When children appear, cast approximately ten-year-old Asian children (a teacher may appear beside them); unposed and natural. Object / still-life scenes are equally welcome, styled with the same bright airy light.',
    'Authentic, unposed, documentary feel; shallow depth of field; no harsh flash.',
    'Absolutely NO text, letters, words, captions, logos, watermarks, or signage anywhere in the image.',
  ];
  if (negativeSpace) parts.push(`Composition: ${negativeSpace}`);
  parts.push(`Scene: ${scene}`);
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: parts.join(' '), n: 1, size: '1024x1024', quality: 'medium' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { console.error('feed-photo gpt-image-1 error:', json?.error?.message || res.statusText); return { imageB64: null }; }
    return { imageB64: json?.data?.[0]?.b64_json || null };
  } catch {
    return { imageB64: null };
  }
}

export async function POST(request) {
  // Credit-spending endpoint — admin-key gated + rate-limited (Phase-0 hardening).
  const denied = requireAdminKey(request);
  if (denied) return denied;
  if (isRateLimited(request)) {
    return Response.json({ ok: false, error: 'Generating too fast — please wait a moment.' }, { status: 429 });
  }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  const scene = String(body?.scene || '').trim();
  if (!scene) return Response.json({ ok: false, error: 'scene required' }, { status: 400 });
  const negativeSpace = body?.negativeSpace ? String(body.negativeSpace) : undefined;
  const dimensionId = body?.dimensionId || 'ig_square';

  let provider = 'higgsfield';
  let { imageB64 } = await generatePhoto({ scene, dimensionId, negativeSpace });
  if (!imageB64) { provider = 'openai'; ({ imageB64 } = await openaiFallback(scene, negativeSpace)); }
  if (!imageB64) return Response.json({ ok: false, error: 'Both providers declined.' }, { status: 502 });

  return Response.json({ ok: true, provider, imageB64 });
}
