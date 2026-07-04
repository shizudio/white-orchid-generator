/* ─────────────────────────────────────────────────────────────────────────
   DESIGN EXTRACTION (generation-first pipeline, Commit 2)

   Input : { imageDataUrl (a downscaled ~768px PNG of a Higgsfield full-design
             generation), brief (the user's original request) }
   Output: a strict-schema mapping of that image into OUR element grammar, so the
           client can RECONSTRUCT it as fully-editable native state (our fonts,
           our logos, our real copy — which fixes Higgsfield's garbled text).

   This is the vision half of the pipeline: Higgsfield composes the post, gpt-5
   vision MEASURES its composition (positions as fractional boxes, palette,
   nearest archetype, the photo region to crop), and Generator.reconstructDesign
   rebuilds it through applyDesignPatch + materialized role geometry. The
   harmonizer/reflow/audit then snap any extraction misread back to safe — which
   is what makes reading an AI-generated image viable at all.

   MODEL (client ruling): the STRONGEST vision model the account has, resolved
   dynamically from GET /v1/models in preference order gpt-5 → gpt-5-mini →
   gpt-4.1 → gpt-4o (floor). OPENAI_EXTRACT_MODEL overrides. Composition
   measurement accuracy matters most here and the per-call cost is still cents.
   ───────────────────────────────────────────────────────────────────────── */

import { PATCH_OPTIONS } from '@/lib/design-patch';

export const runtime = 'nodejs';
export const maxDuration = 60; // a strong vision model reading a full design can take 15–40s

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 6; // heavier than chat; lighter cap than a public endpoint
const requestLog = new Map();

function isRateLimited(request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter(time => now - time < WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > MAX_REQUESTS;
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

// ── STRONGEST-VISION-MODEL RESOLUTION (client ruling) ────────────────────────
// Query /v1/models once and pick the strongest available in the preference order.
// Cached in-process for an hour so we don't pay the round-trip every extraction.
// OPENAI_EXTRACT_MODEL short-circuits the probe. Floor is gpt-4o (always assumed
// available; used even if the probe fails so extraction never hard-blocks).
const EXTRACT_MODEL_PREFERENCE = ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'];
const EXTRACT_MODEL_FLOOR = 'gpt-4o';
let _modelCache = { value: null, at: 0 };
const MODEL_CACHE_TTL = 60 * 60 * 1000;

async function resolveExtractModel(apiKey) {
  const override = process.env.OPENAI_EXTRACT_MODEL;
  if (override && override.trim()) return override.trim();
  const now = Date.now();
  if (_modelCache.value && now - _modelCache.at < MODEL_CACHE_TTL) return _modelCache.value;
  let available = new Set();
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json().catch(() => ({}));
    if (Array.isArray(json?.data)) available = new Set(json.data.map(m => m.id));
  } catch {
    // Probe failed → fall through to the floor (extraction must still work).
  }
  const chosen = EXTRACT_MODEL_PREFERENCE.find(id => available.has(id)) || EXTRACT_MODEL_FLOOR;
  _modelCache = { value: chosen, at: now };
  return chosen;
}

// ── EXTRACTION SCHEMA — the Higgsfield design mapped into our element grammar ──
// Every text element carries a fractional position box (x,y,w,h of the canvas)
// so reconstruction can place it. Copy is extracted separately (copyExtracted)
// because the rendered text is garbled — the model reads INTENT, not glyphs, and
// we render our own real copy. archetypeHint is the nearest of our 17 archetypes
// so reconstruction can seed materialized geometry the reflow engine trusts.
const FRAC = { type: 'number', minimum: 0, maximum: 1 };
const posBox = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y', 'w', 'h'],
  properties: { x: FRAC, y: FRAC, w: FRAC, h: FRAC },
};
const nullablePosBox = { anyOf: [posBox, { type: 'null' }] };
const nullableStr = (maxLength) => ({ type: ['string', 'null'], maxLength });

// The archetype hint is the nearest of our editorial archetypes (design-patch
// PATCH_OPTIONS.archetypeId, minus the "none" sentinel) plus the feed-grammar
// cards the landing catalog adds. Kept as a flat enum the model must choose from.
const ARCHETYPE_HINTS = [
  ...PATCH_OPTIONS.archetypeId.filter(id => id !== 'none'),
  'brand_card', 'stat_tile', 'cta_card', 'closing_card', 'schedule_tile',
];

function buildExtractSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'postTypeGuess', 'archetypeHint', 'palette', 'elements', 'copyExtracted',
    ],
    properties: {
      postTypeGuess: { type: 'string', enum: PATCH_OPTIONS.postType },
      archetypeHint: { type: 'string', enum: ARCHETYPE_HINTS },
      palette: {
        type: 'object',
        additionalProperties: false,
        required: ['bg', 'ink', 'accentPresent'],
        properties: {
          // Nearest brand background/ink tokens so reconstruction maps to a real
          // BG_OPTIONS / TEXT_COLOR_OPTIONS id (not an arbitrary hex).
          bg: { type: 'string', enum: PATCH_OPTIONS.bgColor },
          ink: { type: 'string', enum: ['whiteSmoke', 'burnham', 'jet', 'wisteria'] },
          accentPresent: { type: 'boolean' }, // is a tangerine pill/accent visible?
        },
      },
      elements: {
        type: 'object',
        additionalProperties: false,
        required: ['eyebrow', 'hero', 'caption', 'pill', 'scheduleRows', 'photoRegion', 'logoSlot'],
        properties: {
          eyebrow: {
            anyOf: [{
              type: 'object', additionalProperties: false,
              required: ['text', 'pos'],
              properties: { text: nullableStr(60), pos: posBox },
            }, { type: 'null' }],
          },
          hero: {
            anyOf: [{
              type: 'object', additionalProperties: false,
              required: ['text', 'posBox', 'scaleHint', 'register', 'italicWord'],
              properties: {
                text: nullableStr(160),
                posBox,
                scaleHint: { type: 'number', minimum: 0.05, maximum: 0.6 }, // hero cap-height ÷ canvas H
                register: { type: 'string', enum: ['serif', 'sans'] },
                italicWord: nullableStr(40), // the one emphasis word italicised, if any
              },
            }, { type: 'null' }],
          },
          caption: {
            anyOf: [{
              type: 'object', additionalProperties: false,
              required: ['text', 'posBox'],
              properties: { text: nullableStr(240), posBox },
            }, { type: 'null' }],
          },
          pill: {
            anyOf: [{
              type: 'object', additionalProperties: false,
              required: ['text', 'pos'],
              properties: { text: nullableStr(40), pos: posBox },
            }, { type: 'null' }],
          },
          scheduleRows: {
            type: 'array', maxItems: 8,
            items: {
              type: 'object', additionalProperties: false,
              required: ['time', 'activity'],
              properties: { time: nullableStr(20), activity: nullableStr(60) },
            },
          },
          photoRegion: {
            anyOf: [{
              type: 'object', additionalProperties: false,
              required: ['box'],
              properties: { box: posBox },
            }, { type: 'null' }],
          },
          logoSlot: {
            anyOf: [{
              type: 'object', additionalProperties: false,
              required: ['pos', 'class'],
              properties: {
                pos: { type: 'string', enum: PATCH_OPTIONS.logoPosition },
                class: { type: 'string', enum: ['mark', 'lockup'] },
              },
            }, { type: 'null' }],
          },
        },
      },
      // The real, clean copy the design INTENDS (read past the garbled glyphs; use
      // the brief to disambiguate). Reconstruction renders THIS as native text.
      copyExtracted: {
        type: 'object',
        additionalProperties: false,
        required: ['headline', 'subtext', 'attribution', 'dateText'],
        properties: {
          headline: nullableStr(120),
          subtext: nullableStr(160),
          attribution: nullableStr(100),
          dateText: nullableStr(60),
        },
      },
    },
  };
}

export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'One moment — extraction is rate-limited. Please wait a few seconds and try again.' }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Design extraction is not configured (no OpenAI key).' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  if (!imageDataUrl.startsWith('data:image/')) {
    return Response.json({ error: 'A generated design image is required for extraction.' }, { status: 400 });
  }
  const brief = typeof body.brief === 'string' ? body.brief.slice(0, 500) : '';

  const model = await resolveExtractModel(apiKey);
  const isReasoning = /^(o\d|gpt-5)/i.test(model);

  const systemPrompt = `You are a design analyst for The White Orchid, a calm premium Singaporean early-education brand. You are shown a COMPLETE social-post design (an AI-generated reference). Your job is to MEASURE its composition and map it into a structured element grammar so it can be rebuilt with clean native type.

IMPORTANT — read INTENT, not glyphs. The rendered text in the image is garbled AI text; do NOT transcribe the nonsense letters. Instead, infer what each text block is FOR (a headline, an eyebrow, a caption, a pill CTA, a date) from its size, weight, position and the brief, and put the CLEAN intended copy into copyExtracted. Use the user's brief to fill real copy where the image only implies it.

The brief that produced this design: "${brief || '(none given)'}"

Measure and return JSON matching the schema:
- postTypeGuess: the nearest post family (photo_logo | quote | event | text_post | texture_text).
- archetypeHint: the nearest editorial archetype from the enum (choose the single closest composition).
- palette.bg / palette.ink: the nearest brand tokens (bg ∈ burnham/whiteSmoke/wisteria/celadon/jet; ink ∈ whiteSmoke/burnham/jet/wisteria). accentPresent: true only if a tangerine pill/lozenge or coral accent is actually visible.
- elements: each present text block with a FRACTIONAL position box {x,y,w,h} (fractions of the canvas, 0..1, x/y = top-left of the block). Include only blocks that exist; set a block to null if absent.
  - eyebrow: the small tracked caps micro-label, if any.
  - hero: the dominant statement. scaleHint = its cap-height ÷ canvas height (a big serif hero is ~0.14–0.34; a giant number ~0.35–0.5). register = serif or sans. italicWord = the single emphasised word if one is clearly italic, else null.
  - caption: the small supporting/detail text block.
  - pill: a filled tangerine CTA lozenge (text = its label), if present.
  - scheduleRows: only for schedule-style designs — rows of {time, activity}. Empty array otherwise.
  - photoRegion.box: the bounding box of the main PHOTO if the design contains real photography (so it can be cropped as the design's photo asset). null for text-only designs. Do NOT report a solid colour field or a motif as a photo.
  - logoSlot: where a brand mark/lockup sits, if any (pos = nearest 9-grid anchor; class = mark or lockup).
- copyExtracted: the clean, real copy the design intends — headline, subtext, attribution, dateText. Only include a dateText if the brief or design clearly implies a specific date. Never invent facts beyond the brief.

Be faithful to what you SEE for geometry, and faithful to the BRIEF for copy.`;

  const payload = {
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Measure this generated design and map it into the element grammar.' },
          { type: 'input_image', image_url: imageDataUrl },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'design_extraction',
        strict: true,
        schema: buildExtractSchema(),
      },
    },
  };
  if (isReasoning) payload.reasoning = { effort: 'low' };

  let openAIResponse;
  try {
    openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return Response.json({ error: "I couldn't reach the AI service to read the design." }, { status: 502 });
  }

  const result = await openAIResponse.json().catch(() => ({}));
  if (!openAIResponse.ok) {
    const reason = result?.error?.message || openAIResponse.statusText;
    console.error('OpenAI design-extract error:', reason);
    return Response.json({ error: 'The design reader ran into a problem.', detail: reason }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(getOutputText(result));
    return Response.json({ extraction: parsed, model });
  } catch {
    return Response.json({ error: 'That extraction came back incomplete.' }, { status: 502 });
  }
}
