import { getAdminClient } from '@/lib/supabase';
import { PATCH_JSON_SCHEMA, PATCH_FIELD_GUIDE, PATCH_OPTIONS } from '@/lib/design-patch';

export const runtime = 'nodejs';
// Image generation (gpt-image-1, medium quality) can take 10–30s; the default
// Vercel route timeout would cut it off. 60s gives the second OpenAI call room.
export const maxDuration = 60;

// Brand-style wrapper for gpt-image-1 (P4). We prepend our aesthetic + palette and
// a hard "no text/logos/watermarks" instruction, then append the model's concise
// scene description. Keeps every generated background on-brand and text-free so the
// studio's own type/logo lockup stays the only copy on the canvas.
function brandImagePrompt(scene) {
  return [
    'Editorial photography for a calm, premium preschool / early-education brand.',
    'Warm natural light, soft focus, gentle earthy palette (deep forest green, ivory, soft mauve, muted celadon).',
    'Authentic, unposed, documentary feel; shallow depth of field; no harsh flash.',
    'Absolutely NO text, letters, words, captions, logos, watermarks, or signage anywhere in the image.',
    `Scene: ${scene}`,
  ].join(' ');
}

// Map the current canvas format to a gpt-image-1 size: wide formats → landscape,
// everything else → square (portrait/story crop cleanly from a square background).
function imageSizeForDimension(dimensionId) {
  const wide = ['twitter', 'facebook', 'banner'];
  return wide.includes(dimensionId) ? '1536x1024' : '1024x1024';
}

async function generateBrandImage(apiKey, scene, dimensionId) {
  const payload = {
    model: 'gpt-image-1',
    prompt: brandImagePrompt(scene),
    n: 1,
    size: imageSizeForDimension(dimensionId),
    quality: 'medium',
  };
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { imageB64: null, refused: true };
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Moderation / refusal / any upstream error → graceful (never a 500 to the client).
    console.error('gpt-image-1 error:', json?.error?.message || res.statusText);
    return { imageB64: null, refused: true };
  }
  const b64 = json?.data?.[0]?.b64_json || null;
  return { imageB64: b64, refused: !b64 };
}

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20; // conversational — allow a few more turns/minute than the one-shot planner
const requestLog = new Map();

// ── DETERMINISTIC OVERLAY GATE (P1) ──────────────────────────────────────────
// The model kept reaching for the orchid-petal frame (and other overlays) even on
// plain informational posts, despite the prompt telling it not to. Prompt-level
// discouragement is not reliable, so we gate overlays SERVER-SIDE: a patch may only
// carry addOverlay when the user's own words signal decoration/celebration intent.
// This is intentionally generous on the "decorate" side (any of these words, in any
// form, anywhere in the message) but strips the overlay silently otherwise — the
// reply text is left untouched so the assistant never announces a frame it didn't add.
const DECOR_INTENT = /\b(frame|petal|orchid|shape|decorat\w*|celebrat\w*|festive|birthday|part(?:y|ies)|fancy|artistic|ornament\w*|flourish\w*|invit\w*|graduat\w*|anniversar\w*)\b/i;

function wantsDecoration(text) {
  return DECOR_INTENT.test(String(text || ''));
}

// ── LANDING VARIETY INJECTION (P1) ───────────────────────────────────────────
// The landing handoff felt repetitive (same square + same background). We rotate a
// SOFT style-direction hint into the system prompt per request. It's a suggestion the
// model may override when the user's intent is specific; it just breaks the model out
// of its single most-likely default. Stateless rotation keyed on the current minute
// keeps successive requests landing on different combos without any shared state.
const LANDING_DIRECTIONS = [
  'lean minimal: solid burnham background, "text_post" layout, no overlay, generous negative space',
  'warm photographic: a "photo_logo" or "texture_text" layout leading with imagery',
  'soft pastel: a wisteria or celadon background with a "quote" layout',
  'bold statement: jet background, large headline, "text_post" layout',
  'fresh & airy: whiteSmoke background, "quote" or "text_post" layout, green logo',
  'dated happening: an "event" layout (headline as the title, date only if given)',
  'premium calm: burnham background, "quote" layout, ivory logo, restrained composition',
  'friendly notice: celadon or whiteSmoke background, "text_post" layout, clear single message',
];

function pickLandingDirection() {
  // Cheap stateless rotation: minute bucket + a small random jitter so identical
  // prompts fired seconds apart still tend to diverge across runs.
  const idx = (Math.floor(Date.now() / 60_000) + Math.floor(Math.random() * LANDING_DIRECTIONS.length)) % LANDING_DIRECTIONS.length;
  return LANDING_DIRECTIONS[idx];
}

function getOutputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return null;
}

function isRateLimited(request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter(time => now - time < WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > MAX_REQUESTS;
}

// Compact, blob-free view of the current design so the model can reason about
// deltas without ballooning the prompt.
function compactDesignState(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const {
    postType, dimensionId, bgColor, textColorId, backdropMode,
    headline, subtext, attribution, dateText,
    selectedLogoId, logoPosition, logoSize, fontSizes,
  } = raw;
  const overlays = Array.isArray(raw.overlayLayers)
    ? raw.overlayLayers.map(l => ({ assetId: l.assetId, mode: l.mode || 'frame' }))
    : [];
  return {
    postType, dimensionId, bgColor, textColorId, backdropMode,
    headline, subtext, attribution, dateText,
    logoId: selectedLogoId, logoPosition, logoSize,
    fontSizes: fontSizes || undefined,
    overlays,
    hasImage: !!raw.hasImage,
  };
}

export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'One moment — that was a lot of requests. Please wait a few seconds and try again.' }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI isn't set up yet. You can still use the studio — everything works without it." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const context = body.context === 'landing' ? 'landing' : 'editor';
  const designState = compactDesignState(body.designState);
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  // Client-trims to ~10; guard again server-side and sanitise shape/length.
  const messages = rawMessages
    .slice(-10)
    .map(m => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m?.content || '').trim().slice(0, 1200),
    }))
    .filter(m => m.content.length > 0);

  if (!messages.length) {
    return Response.json({ error: 'Tell me a little about what you want to create.' }, { status: 400 });
  }

  let brandKit = null;
  try {
    const supabase = getAdminClient();
    const result = await supabase.from('brand_kit').select('*').eq('id', BRAND_ID).single();
    brandKit = result.data || null;
  } catch {
    // Built-in palette remains a safe fallback when Brand Kit is unavailable.
  }

  const brandContext = {
    name: brandKit?.name || 'The White Orchid',
    tone: brandKit?.tone || 'warm, thoughtful, premium, clear and human',
    colors: (brandKit?.colors || []).map(({ label, hex }) => ({ label, hex })),
    guardrails: brandKit?.guardrails || [],
  };

  const catalog = Object.entries(PATCH_FIELD_GUIDE)
    .map(([field, note]) => `- ${field}: ${note}`)
    .join('\n');

  const enums = [
    `postType: ${PATCH_OPTIONS.postType.join(', ')}`,
    `dimensionId: ${PATCH_OPTIONS.dimensionId.join(', ')}`,
    `bgColor: ${PATCH_OPTIONS.bgColor.join(', ')}`,
    `textColorId: ${PATCH_OPTIONS.textColorId.join(', ')}`,
    `logoId: ${PATCH_OPTIONS.logoId.join(', ')}`,
    `logoPosition: ${PATCH_OPTIONS.logoPosition.join(', ')}`,
    `logoSize: ${PATCH_OPTIONS.logoSize.join(', ')}`,
    `backdropMode: ${PATCH_OPTIONS.backdropMode.join(', ')}`,
    `overlay assetId: ${PATCH_OPTIONS.overlayAssetId.join(', ')}`,
    `overlay mode: ${PATCH_OPTIONS.overlayMode.join(', ')}`,
  ].join('\n');

  const landingDirection = pickLandingDirection();
  const contextRule = context === 'landing'
    ? `This is the FIRST message from a new user on the landing page. They have no design yet. Produce a COMPLETE, ready-to-edit starting composition: set postType, dimensionId, bgColor, a suitable logoId + logoPosition + logoSize, and any copy fields (headline/subtext/attribution/dateText) that the request clearly supports. Do not leave it minimal.

STYLE DIRECTION for THIS request (a soft suggestion — follow it unless the user's request clearly calls for something else): ${landingDirection}.

VARIETY (important — the studio has felt repetitive):
- CHOOSE the postType, bgColor and dimensionId that best fit the REQUEST'S INTENT, and vary them meaningfully between different requests. Not everything is an Instagram square on the same background.
  - A quote / saying → "quote" type. A hiring / announcement / reminder → "text_post" or "event". A dated happening (open house, sports day, term dates) → "event". A photo-led moment → "photo_logo" or "texture_text".
  - Pick a background that suits the mood: burnham (calm, premium), whiteSmoke (light, airy), wisteria (soft, warm), celadon (fresh), jet (bold). Do not default to the same one every time.
- OVERLAYS / FRAMES: only add an overlay (addOverlay) — and ESPECIALLY the orchid-petal frame — when the request implies decoration or celebration (an invite, an open day, a festive or photo-centric moment) OR the user explicitly asks for a frame/shape. For plain informational posts (a reminder, a notice, a hiring post, a quote) DO NOT add any overlay. Never reach for the orchid-petal frame as a default — most posts should have no overlay at all.`
    : `This is an ongoing edit inside the studio. Change ONLY the fields the user asked about — send a minimal patch. Leave everything else untouched (omit it from the patch).`;

  const systemPrompt = `You are the Art Director for The White Orchid, a Singaporean education brand for students aged 10 and above. You help a non-designer build on-brand social posts by editing their design directly through a structured patch.

Brand voice: ${brandContext.tone}. Warm, plain-English, never salesy.

You reply with JSON matching the provided schema: { reply, patch }.
- reply: under 2 sentences, warm and plain-English, describing what you changed (or, if you can't do something, saying so briefly and suggesting the nearest possible action).
- patch: only the fields you intend to change. Every value MUST be one of the allowed options below — never invent an id.

What each patch field does:
${catalog}

Allowed values:
${enums}

${contextRule}

Image generation:
- You CAN generate a photographic background image. When the user asks to create/generate/make an image or photo (e.g. "generate a photo of children painting outdoors"), set patch.imagePrompt to a concise visual description of the scene — no brand name, no text-in-image, no logos. The studio generates the image and places it as the background automatically. Also set postType to "photo_logo" or "texture_text" if it isn't already, so the new photo has a suitable layout. Leave imagePrompt null for every request that is NOT asking for a new image.

Rules:
- Never invent factual claims, quotations, sources, dates, statistics, offers, or testimonials. Only include a dateText if the user explicitly supplied a date.
- Use an ivory logo (…-ivory) on dark or photo-heavy backgrounds and a green logo (…-green) on light backgrounds.
- If the user asks for something the schema can't express (e.g. a brand-new colour, a custom font, uploading an image), keep the patch empty for that part and explain the nearest thing you CAN do.
- Keep copy concise enough for the chosen template.

Brand context: ${JSON.stringify(brandContext)}

Current design state (compact): ${JSON.stringify(designState)}`;

  const model = process.env.OPENAI_ART_DIRECTOR_MODEL || 'gpt-4o-mini';
  const isReasoning = /^(o\d|gpt-5)/i.test(model);
  const payload = {
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
      ...messages.map(m => ({
        role: m.role,
        content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content }],
      })),
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'design_patch',
        strict: true,
        schema: PATCH_JSON_SCHEMA,
      },
    },
  };
  if (isReasoning) payload.reasoning = { effort: 'low' };

  let openAIResponse;
  try {
    openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return Response.json({ error: "I couldn't reach the AI service. Please try again in a moment." }, { status: 502 });
  }

  const result = await openAIResponse.json().catch(() => ({}));
  if (!openAIResponse.ok) {
    const reason = result?.error?.message || openAIResponse.statusText;
    console.error('OpenAI assistant error:', reason);
    // Surface the upstream reason so misconfig (bad key / model / quota) is debuggable.
    return Response.json({ error: "I ran into a problem just now. Please try again.", detail: reason }, { status: 502 });
  }

  let parsed;
  try {
    parsed = JSON.parse(getOutputText(result));
  } catch {
    return Response.json({ error: "That response came back incomplete. Please try again." }, { status: 502 });
  }
  const reply = typeof parsed?.reply === 'string' ? parsed.reply : '';
  const patch = parsed?.patch && typeof parsed.patch === 'object' ? parsed.patch : {};
  if (!reply) {
    return Response.json({ error: "That response came back incomplete. Please try again." }, { status: 502 });
  }

  // ── HARD OVERLAY GATE (P1) ──────────────────────────────────────────────────
  // Strip patch.addOverlay unless the user's own words signal decoration intent.
  // Landing: the single message. Editor: the LAST user message (the current turn).
  // Silent — we leave `reply` alone so the assistant never claims a frame it lost.
  if (patch && patch.addOverlay) {
    const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    if (!wantsDecoration(lastUserText)) {
      delete patch.addOverlay;
    }
  }

  // ── In-chat image generation (P4) ──
  // The model sets patch.imagePrompt ONLY when the user asked to create an image.
  // Make a second call to gpt-image-1 (medium) with the brand-style wrapper; return
  // the b64 image alongside the reply/patch. imagePrompt is a side-effect trigger,
  // not a design field, so strip it from the patch before it reaches the client's
  // applyDesignPatch (which would ignore it anyway — it's not in PATCH_CHANGE_KEYS).
  const imagePrompt = typeof patch.imagePrompt === 'string' && patch.imagePrompt.trim() ? patch.imagePrompt.trim() : null;
  if ('imagePrompt' in patch) delete patch.imagePrompt;

  if (imagePrompt) {
    const { imageB64, refused } = await generateBrandImage(apiKey, imagePrompt, designState.dimensionId);
    if (imageB64) {
      return Response.json({ reply, patch, imageB64 });
    }
    // Graceful refusal / moderation / error — never a 500. Keep any design patch the
    // model also produced, but explain the image couldn't be made and suggest a tweak.
    return Response.json({
      reply: "I couldn't generate that one — it may have been outside what I can create. Try describing a simple, everyday scene (for example “children reading together in a bright classroom”), or upload a photo instead.",
      patch,
      imageB64: null,
      imageRefused: !!refused,
    });
  }

  return Response.json({ reply, patch, imageB64: null });
}
