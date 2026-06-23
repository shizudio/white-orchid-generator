import { getAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const requestLog = new Map();

const OPTIONS = {
  postType: ['photo_logo', 'quote', 'event', 'text_post', 'texture_text'],
  dimensionId: ['ig_square', 'ig_portrait', 'story', 'twitter', 'facebook', 'banner'],
  bgColor: ['burnham', 'whiteSmoke', 'wisteria', 'celadon', 'jet'],
  logoId: ['p1-green', 'p1-ivory', 'p2-green', 'p2-ivory', 'p3-green', 'p3-ivory', 'p3f-green', 'p4', 'p-central', 'p-circle', 'p-bg', 's1-green', 's1-ivory', 's2-green'],
  logoPosition: ['top-left', 'top-center', 'top-right', 'mid-left', 'mid-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'],
  logoSize: ['s', 'm', 'l', 'xl'],
};

const planSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['postType', 'dimensionId', 'headline', 'subtext', 'attribution', 'dateText', 'bgColor', 'logoId', 'logoPosition', 'logoSize', 'imageDirection', 'midjourneyPrompt', 'rationale'],
  properties: {
    postType: { type: 'string', enum: OPTIONS.postType },
    dimensionId: { type: 'string', enum: OPTIONS.dimensionId },
    headline: { type: 'string', maxLength: 100 },
    subtext: { type: 'string', maxLength: 140 },
    attribution: { type: 'string', maxLength: 100 },
    dateText: { type: 'string', maxLength: 60 },
    bgColor: { type: 'string', enum: OPTIONS.bgColor },
    logoId: { type: 'string', enum: OPTIONS.logoId },
    logoPosition: { type: 'string', enum: OPTIONS.logoPosition },
    logoSize: { type: 'string', enum: OPTIONS.logoSize },
    imageDirection: { type: 'string', maxLength: 240 },
    midjourneyPrompt: { type: 'string', maxLength: 800 },
    rationale: { type: 'string', maxLength: 240 },
  },
};

function allowed(value, key) {
  return OPTIONS[key].includes(value);
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') return false;
  return allowed(plan.postType, 'postType')
    && allowed(plan.dimensionId, 'dimensionId')
    && allowed(plan.bgColor, 'bgColor')
    && allowed(plan.logoId, 'logoId')
    && allowed(plan.logoPosition, 'logoPosition')
    && allowed(plan.logoSize, 'logoSize')
    && ['headline', 'subtext', 'attribution', 'dateText', 'imageDirection', 'midjourneyPrompt', 'rationale']
      .every(key => typeof plan[key] === 'string');
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

export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'Too many suggestions. Please wait a minute and try again.' }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'AI Art Director is not configured yet. Add OPENAI_API_KEY to the server environment.' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const goal = String(body.goal || '').trim().slice(0, 600);
  const audience = String(body.audience || '').trim().slice(0, 160);
  const channel = String(body.channel || 'Instagram').trim().slice(0, 80);
  if (goal.length < 8) {
    return Response.json({ error: 'Tell the Art Director a little more about the post.' }, { status: 400 });
  }

  let brandKit = null;
  try {
    const supabase = getAdminClient();
    const result = await supabase.from('brand_kit').select('*').eq('id', BRAND_ID).single();
    brandKit = result.data || null;
  } catch {
    // The built-in palette remains a safe fallback when Brand Kit is unavailable.
  }

  const brandContext = {
    name: brandKit?.name || 'The White Orchid',
    tone: brandKit?.tone || 'warm, thoughtful, premium, clear and human',
    colors: (brandKit?.colors || []).map(({ label, hex }) => ({ label, hex })),
    guardrails: brandKit?.guardrails || [],
  };

  const systemPrompt = `You are the AI Art Director for The White Orchid, a Singaporean education brand for students aged 10 and above. Create one practical starting composition for the existing editor.

Choose only from the exact IDs allowed by the supplied JSON schema. The user will edit the result, so prioritize a clear, useful starting point over novelty.

Template rules:
- photo_logo: visual-first post with no required copy fields.
- quote: headline is the quote; attribution names the source. Never invent a quotation or source.
- event: headline is the event title; dateText contains only a date explicitly supplied by the user; subtext is a short detail or CTA.
- text_post: subtext is the intro line, headline is the main message, attribution is supporting copy.
- texture_text: headline is a very short overlay on a photo.
- Use an ivory logo on dark or photo-heavy compositions and a green logo on light backgrounds.
- Keep copy concise enough for the selected template. Do not invent dates, statistics, testimonials, offers, or factual claims.
- If the request lacks a date, return an empty dateText.
- imageDirection is a short suggestion, not an image URL. Visuals should feel credible for Singapore and feature students aged 10 or above when people are relevant. Respect privacy and consent; do not request identifiable children unless the user explicitly calls for that and has suitable consent.
- midjourneyPrompt is a polished, copy-ready visual prompt that matches imageDirection and the selected composition. Always reflect a contemporary Singaporean education context and students aged 10 or above where people are shown, with authentic multicultural representation and no stereotypes. Describe subject, setting, mood, light, framing, palette, and photographic or illustrative style. Do not include text, logos, named living artists, or identifiable real people. It must end exactly with: --p m7465332324297605130
- rationale should explain the main template/layout choice in one concise sentence under 180 characters.

Brand context: ${JSON.stringify(brandContext)}`;

  const userPrompt = `Post goal and reason: ${goal}\nAudience: ${audience || 'Not specified'}\nPreferred channel: ${channel}\nCreate the best editable starting composition.`;

  let openAIResponse;
  try {
    openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ART_DIRECTOR_MODEL || 'gpt-5.4-mini',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          { role: 'user', content: [{ type: 'input_text', text: userPrompt }] },
        ],
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'creative_plan',
            strict: true,
            schema: planSchema,
          },
        },
      }),
    });
  } catch {
    return Response.json({ error: 'The AI service could not be reached. Please try again.' }, { status: 502 });
  }

  const result = await openAIResponse.json().catch(() => ({}));
  if (!openAIResponse.ok) {
    console.error('OpenAI creative plan error:', result?.error?.message || openAIResponse.statusText);
    return Response.json({ error: 'The Art Director could not create a suggestion. Please try again.' }, { status: 502 });
  }

  try {
    const plan = JSON.parse(getOutputText(result));
    if (!validatePlan(plan)) throw new Error('Invalid creative plan');
    return Response.json({ plan });
  } catch {
    return Response.json({ error: 'The suggestion was incomplete. Please regenerate it.' }, { status: 502 });
  }
}
