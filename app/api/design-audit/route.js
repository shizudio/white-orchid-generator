import { getAdminClient } from '@/lib/supabase';
import { buildAuditFixSchema, PATCH_OPTIONS, coerceFixToCategory } from '@/lib/design-patch';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5; // stricter than the assistant route — vision calls are heavier
const requestLog = new Map();

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

// Compact, blob-free view of the design so the model can reason without bloat.
function compactDesignState(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const {
    postType, dimensionId, bgColor, textColorId, backdropMode,
    headline, subtext, attribution, dateText,
    selectedLogoId, logoId, logoPosition, logoSize, fontSizes,
  } = raw;
  return {
    postType, dimensionId, bgColor, textColorId, backdropMode,
    headline, subtext, attribution, dateText,
    logoId: logoId || selectedLogoId, logoPosition, logoSize,
    // (no-op guard) coerceFixToCategory diffs a proposed hierarchy fix against
    // the CURRENT font-size steps — it was silently missing here, so that guard
    // (and the same-as-current check below) never had real data to compare against.
    fontSizes: fontSizes && typeof fontSizes === 'object' ? fontSizes : null,
    hasImage: !!raw.hasImage,
  };
}

// The audit's own strict output schema. Findings carry the copy-stripped patch
// sub-schema so any fix is mechanically applicable via applyDesignPatch, and can
// never rewrite user copy.
function buildAuditSchema() {
  const fix = buildAuditFixSchema();
  return {
    type: 'object',
    additionalProperties: false,
    required: ['passes', 'summary', 'findings'],
    properties: {
      passes: { type: 'boolean' },
      summary: { type: 'string', maxLength: 300 },
      findings: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['category', 'severity', 'message', 'element', 'fix'],
          properties: {
            category: { type: 'string', enum: ['hierarchy', 'brand', 'composition', 'polish'] },
            severity: { type: 'string', enum: ['fail', 'warn', 'info'] },
            message: { type: 'string', maxLength: 240 },
            // (One Advice Ledger, rule 5) The element the observation concerns, so the
            // finding can be anchored to a canvas dot + deduped/acked against the local
            // checker. "canvas" = a whole-composition note with no single element.
            element: { type: 'string', enum: ['headline', 'caption', 'logo', 'photo', 'background', 'canvas'] },
            fix: { anyOf: [fix, { type: 'null' }] },
          },
        },
      },
    },
  };
}

export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'One moment — audits are rate-limited. Please wait a few seconds and try again.' }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Graceful path: the client still shows local findings and notes the AI pass is off.
    return Response.json({ error: "The AI polish pass isn't set up. Your local design checks still ran." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  if (!imageDataUrl.startsWith('data:image/')) {
    return Response.json({ error: 'A rendered preview image is required for the audit.' }, { status: 400 });
  }
  const designState = compactDesignState(body.designState);
  const dimensionId = PATCH_OPTIONS.dimensionId.includes(body.dimensionId) ? body.dimensionId : (designState.dimensionId || 'ig_square');
  const localFindings = Array.isArray(body.localFindings)
    ? body.localFindings.slice(0, 8).map(s => String(s || '').slice(0, 240)).filter(Boolean)
    : [];
  // (One Advice Ledger, rule 5) The audit is told what's already KNOWN (open local
  // findings, above) and what's DECIDED (the user's "keep it this way" acks) so it
  // reports only genuinely NEW observations and never re-litigates a settled choice.
  const ackedNotes = Array.isArray(body.ackedNotes)
    ? body.ackedNotes.slice(0, 12).map(s => String(s || '').slice(0, 240)).filter(Boolean)
    : [];

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

  // Rubric distilled from docs/format-design-spec.md — the SUBJECTIVE dimensions
  // only. The deterministic side (WCAG contrast, font floors, safe zones, §6
  // drops, logo collision) is already handled locally and passed in as
  // localFindings; the model must NOT repeat those.
  const rubric = [
    'Judge only what a rules engine cannot measure — subjective, holistic quality:',
    '- hierarchy: is the reading order clear? Does the most important element (headline / date / subject) dominate, or do elements compete?',
    '- brand: does the palette stay on-brand (Burnham green, ivory, wisteria, celadon, tangerine accent, jet)? Any colour drift, off-tone mood, or logo variant that fights the background? Does the tone feel warm/premium/clear, not salesy?',
    '- composition: is the layout balanced? Awkward negative space, crowding, the subject/text fighting for the same area, or the photo crop cutting the subject badly?',
    '- polish: overall finish — awkward crop/overlap artifacts, mismatched treatments, anything that reads as unfinished or "off".',
    '',
    'FIX DISCIPLINE (each category may ONLY propose these fix fields — anything else is discarded, so aim correctly):',
    '- hierarchy: fontSizes (adjust AT MOST TWO roles, and move them in OPPOSITE directions or change a SINGLE role — never shrink/grow ALL roles the same way, that fixes nothing), logoSize, logoPosition.',
    '- brand: bgColor, textColorId, logoId.',
    '- composition: NO mechanical fix — set fix to null and let the message advise. The schema has no spacing/layout controls, so any "fix" would be a no-op.',
    '- polish: backdropMode, logoSize.',
    'A fix must be a REAL change from the current design. If the only honest fix would repeat the current state, set fix to null (advice only).',
  ].join('\n');

  const enumsForFixes = [
    `bgColor: ${PATCH_OPTIONS.bgColor.join(', ')}`,
    `textColorId: ${PATCH_OPTIONS.textColorId.join(', ')}`,
    `logoId: ${PATCH_OPTIONS.logoId.join(', ')}`,
    `logoPosition: ${PATCH_OPTIONS.logoPosition.join(', ')}`,
    `logoSize: ${PATCH_OPTIONS.logoSize.join(', ')}`,
    `backdropMode: ${PATCH_OPTIONS.backdropMode.join(', ')}`,
    `overlay assetId: ${PATCH_OPTIONS.overlayAssetId.join(', ')}`,
    `overlay mode: ${PATCH_OPTIONS.overlayMode.join(', ')}`,
  ].join('\n');

  const systemPrompt = `You are a senior art director reviewing a finished social post for The White Orchid, a Singaporean education brand. You are given the rendered image plus a compact description of the design.

Brand voice: ${brandContext.tone}.
Brand palette: ${JSON.stringify(brandContext.colors.length ? brandContext.colors : [{ label: 'Burnham', hex: '#254E48' }, { label: 'Ivory', hex: '#F5F6E7' }, { label: 'Wisteria', hex: '#DEC5D8' }, { label: 'Celadon', hex: '#B4D6C0' }, { label: 'Tangerine', hex: '#F6644E' }, { label: 'Jet', hex: '#282B28' }])}.

${rubric}

The following issues were ALREADY caught by a deterministic checker. Do NOT repeat them — assume they are handled:
${localFindings.length ? localFindings.map(f => `- ${f}`).join('\n') : '- (none)'}

The user has already reviewed and DELIBERATELY KEPT these — do NOT flag them again, in any words; they are settled decisions, not problems:
${ackedNotes.length ? ackedNotes.map(f => `- ${f}`).join('\n') : '- (none)'}

You reply with JSON matching the provided schema: { passes, summary, findings }.
- passes: true when the design is broadly good (only minor/no issues).
- summary: 1-2 warm, plain-English sentences on overall quality.
- findings: at MOST 5, only genuine subjective issues that are NEW (not in the two lists above). Each has a category (hierarchy|brand|composition|polish), severity (fail|warn|info), a plain-English message, an element, and a fix.
- element: which part of the design the observation is about — one of headline, caption, logo, photo, background, canvas. Use "canvas" only for a whole-composition note with no single element. This lets us point at the exact spot.
- fix: a MINIMAL design patch (only the fields to change) drawn ONLY from the allowed non-copy options below, or null when no mechanical tweak applies. NEVER propose copy changes — you cannot rewrite text. NEVER invent ids.

Allowed fix fields + values:
${enumsForFixes}

Be honest but generous — a clean, on-brand design should pass with few or no findings. Do not manufacture problems.

Current design (compact): ${JSON.stringify({ ...designState, dimensionId })}`;

  // The audit is a low-frequency, high-value vision pass (rate-limited to 5/min and
  // only run when the user opens the panel), so it uses the stronger gpt-4o for
  // sharper, more trustworthy findings. The conversational chat route stays on the
  // cheap gpt-4o-mini — it fires far more often and doesn't need vision judgement.
  // Cost note: gpt-4o vision is ~10-20x a gpt-4o-mini call, but at ≤5 audits/min
  // and one image per call this is a few cents per session — well worth the quality.
  // OPENAI_AUDIT_MODEL still overrides (e.g. to pin gpt-4o-mini for cost, or a newer
  // model as it ships).
  const model = process.env.OPENAI_AUDIT_MODEL || 'gpt-4o';
  const isReasoning = /^(o\d|gpt-5)/i.test(model);
  const payload = {
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Audit this rendered post. Return only genuine subjective issues a rules engine cannot catch.' },
          { type: 'input_image', image_url: imageDataUrl },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'design_audit',
        strict: true,
        schema: buildAuditSchema(),
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
    return Response.json({ error: "I couldn't reach the AI service. Your local checks still ran." }, { status: 502 });
  }

  const result = await openAIResponse.json().catch(() => ({}));
  if (!openAIResponse.ok) {
    const reason = result?.error?.message || openAIResponse.statusText;
    console.error('OpenAI design-audit error:', reason);
    return Response.json({ error: 'The AI polish pass ran into a problem. Your local checks still ran.', detail: reason }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(getOutputText(result));
    const passes = typeof parsed?.passes === 'boolean' ? parsed.passes : true;
    const summary = typeof parsed?.summary === 'string' ? parsed.summary : '';
    // Enforce the category→field coherence map (P2). For each finding, keep only the
    // fix fields its category allows; composition is always advice-only; an incoherent
    // uniform hierarchy resize is stripped. If nothing survives, fix becomes null.
    const ELEMENTS = ['headline', 'caption', 'logo', 'photo', 'background', 'canvas'];
    const findings = (Array.isArray(parsed?.findings) ? parsed.findings.slice(0, 5) : []).map(f => ({
      ...f,
      element: ELEMENTS.includes(f?.element) ? f.element : 'canvas',
      fix: coerceFixToCategory(f?.category, f?.fix, designState),
    }));
    return Response.json({ passes, summary, findings });
  } catch {
    return Response.json({ error: 'That response came back incomplete. Your local checks still ran.' }, { status: 502 });
  }
}
