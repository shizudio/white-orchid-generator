/* ─────────────────────────────────────────────────────────────────────────
   BRAND STYLE DNA — the pure contract for docs/brand-style-dna-spec.md
   (RATIFIED 2026-08-03: "i wonder how to create images with the same white
   orchid brand style").

   One short prose block describing HOW the brand's photos look (lighting,
   palette temperature, composition, texture — never WHO or WHAT is in them),
   stored as DATA on the brand row (zero-brand-facts law: no style prose
   constants live in code). This module is pure and dependency-free so every
   consumer (the brand PATCH ladder, the distill route, design-generate's
   prompt assembly, the QC criterion) is unit-testable with mocks.

   CONTRACT (absent = invisible): every function treats "no style DNA" —
   null block, missing column, un-migrated DB — as the pre-feature product.
   composeSceneWithStyle returns the INPUT STRING ITSELF when there is no
   style, so behavior without style DNA is byte-identical to before.
   ───────────────────────────────────────────────────────────────────────── */

// The delimiter under which the style block joins an outgoing scene prompt.
// Composes with — never replaces — the scene; the photographer-brief scaffold
// (grade/camera/closing) in lib/higgsfield.js still wraps the result.
export const STYLE_DELIMITER = 'VISUAL STYLE (always):';

// Anchor budget for the distill pass: the UI offers 3–8; the route accepts
// 1–8 and answers an honest 400 above 8 (never a silent slice on a paid route).
export const MAX_ANCHOR_IMAGES = 8;
export const MIN_ANCHOR_IMAGES_UI = 3;

const MAX_STYLE_TEXT_CHARS = 2000;

// ── Storage shape ────────────────────────────────────────────────────────────

/**
 * Normalize whatever the brand row carries into a style-DNA block or null.
 * Reads the dedicated column first, then the pre-migration fallback key
 * (photo_brief.styleDna — see the write ladder below). Null-safe on any input.
 * @returns {{text:string, distilledFrom:string[], updatedAt:string|null, authorship:'owner'|'ai'}|null}
 */
export function normalizeStyleDna(row) {
  const raw = row?.style_dna ?? row?.photo_brief?.styleDna ?? null;
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, MAX_STYLE_TEXT_CHARS) : '';
  if (!text) return null;
  return {
    text,
    distilledFrom: Array.isArray(raw.distilledFrom)
      ? raw.distilledFrom.filter((id) => typeof id === 'string' && id).slice(0, MAX_ANCHOR_IMAGES)
      : [],
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    authorship: raw.authorship === 'ai' ? 'ai' : 'owner',
  };
}

/**
 * Sanitize a client-supplied block for writing. Server-authoritative:
 * updatedAt is stamped HERE, never trusted from the client. Empty/blank
 * text → null (a clear). Unknown keys are dropped.
 */
export function sanitizeStyleDnaBlock(input, now = new Date()) {
  if (input == null) return null;
  const text = typeof input.text === 'string' ? input.text.trim().slice(0, MAX_STYLE_TEXT_CHARS) : '';
  if (!text) return null;
  return {
    text,
    distilledFrom: Array.isArray(input.distilledFrom)
      ? input.distilledFrom.filter((id) => typeof id === 'string' && id).slice(0, MAX_ANCHOR_IMAGES)
      : [],
    updatedAt: now.toISOString(),
    authorship: input.authorship === 'ai' ? 'ai' : 'owner',
  };
}

// 42703 / PGRST204 = the style_dna column has not been migrated in yet — the
// write falls back to photo_brief.styleDna (same missing-column ladder as
// /api/images' session_id). Checked BEFORE any broad missing-config match.
export function isMissingColumnError(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42703' || err?.code === 'PGRST204'
    || /column .* does not exist|could not find the '.+' column/i.test(msg);
}

/**
 * Write the style-DNA block to the brand row through an attempt ladder:
 *   1. the dedicated style_dna column
 *   2. missing column (un-migrated DB) → fold into photo_brief.styleDna so the
 *      owner's save persists TODAY; the 2026-08-03 migration promotes it.
 * `block` should already be sanitized (sanitizeStyleDnaBlock); null clears.
 * Never throws. Returns { data, via } or { error }.
 */
export async function writeStyleDna(supabase, brandId, block) {
  const stamp = { updated_at: new Date().toISOString() };
  try {
    const first = await supabase
      .from('brand_kit')
      .update({ style_dna: block, ...stamp })
      .eq('id', brandId)
      .select()
      .single();
    if (!first.error) return { data: first.data, via: 'column' };
    if (!isMissingColumnError(first.error)) return { error: first.error };

    // Rung 2 — read-merge-write the existing photo_brief jsonb (single-owner
    // admin surface; the read-modify-write window is acceptable there).
    const read = await supabase
      .from('brand_kit')
      .select('photo_brief')
      .eq('id', brandId)
      .single();
    if (read.error) return { error: read.error };
    const photoBrief = { ...(read.data?.photo_brief || {}) };
    if (block == null) delete photoBrief.styleDna;
    else photoBrief.styleDna = block;
    const second = await supabase
      .from('brand_kit')
      .update({ photo_brief: photoBrief, ...stamp })
      .eq('id', brandId)
      .select()
      .single();
    if (second.error) return { error: second.error };
    return { data: second.data, via: 'photo_brief' };
  } catch (err) {
    return { error: err };
  }
}

// ── Prompt assembly (the design-generate choke point) ───────────────────────

/**
 * Compose the outgoing scene with the brand's style block.
 * ABSENT = INVISIBLE: with no style DNA this returns the input string ITSELF
 * (same reference — asserted byte-identical in tests), so generation without
 * style DNA is exactly today's behavior.
 */
export function composeSceneWithStyle(scene, styleDna) {
  const text = typeof styleDna?.text === 'string' ? styleDna.text.trim() : '';
  if (!text) return scene;
  return `${scene}\n\n${STYLE_DELIMITER} ${text}`;
}

// ── QC criterion (extends lib/higgsfield.js qcPhoto) ────────────────────────

// The base instruction is VERBATIM the pre-style-DNA QC prompt — without a
// styleText the returned string must be byte-identical to what qcPhoto sent
// before this feature existed.
const QC_BASE =
  'Quality-check this AI-generated background photo. Answer STRICT JSON only: '
  + '{"text_or_letters": boolean, "poster_or_layout": boolean}. '
  + 'text_or_letters = any rendered text, letters, words, logos or captions visible. '
  + 'poster_or_layout = it looks like a poster, framed/bordered layout, collage or graphic design rather than a single full-frame edge-to-edge photograph.';

/**
 * Build the vision-QC instruction. With a styleText, exactly ONE criterion is
 * added: a broad lighting/palette/texture match against the style block —
 * broad on purpose, so QC rejects only clear contradictions, not near-misses.
 */
export function buildQcPrompt(styleText = null) {
  const text = typeof styleText === 'string' ? styleText.trim() : '';
  if (!text) return QC_BASE;
  return (
    'Quality-check this AI-generated background photo. Answer STRICT JSON only: '
    + '{"text_or_letters": boolean, "poster_or_layout": boolean, "off_brand_style": boolean}. '
    + 'text_or_letters = any rendered text, letters, words, logos or captions visible. '
    + 'poster_or_layout = it looks like a poster, framed/bordered layout, collage or graphic design rather than a single full-frame edge-to-edge photograph. '
    + 'off_brand_style = the photo CLEARLY contradicts this required visual style in its lighting, palette or texture (judge broadly — mark true only for a clear mismatch, not a near-miss): '
    + `"${text}"`
  );
}

// ── Distill engine (pure; the route provides ids→URLs and the admin gate) ───

/** Vision prompt for ONE anchor image: style attributes only, never identity. */
export function buildPerImagePrompt() {
  return (
    'Describe the photographic STYLE of this image for an art director. Answer STRICT JSON only: '
    + '{"lighting": string, "palette": string, "composition": string, "texture": string, "subject_treatment": string}. '
    + 'lighting = quality/direction/warmth of light. '
    + 'palette = color temperature and dominant tone families (describe tones, not brand names). '
    + 'composition = framing habits, negative space, depth of field. '
    + 'texture = grain, crispness, softness. '
    + 'subject_treatment = HOW subjects are rendered (candid/posed, distance, focus) — '
    + 'NEVER who or what is in the photo: no identities, no names, no ages, no descriptions of people, objects or places. '
    + 'Each value ONE short sentence.'
  );
}

const NOTE_KEYS = ['lighting', 'palette', 'composition', 'texture', 'subject_treatment'];

/** Parse one per-image vision answer. Bad JSON / wrong shape → null (skipped). */
export function parsePerImageNotes(raw) {
  let obj;
  try { obj = JSON.parse(String(raw)); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const notes = {};
  for (const key of NOTE_KEYS) {
    if (typeof obj[key] === 'string' && obj[key].trim()) notes[key] = obj[key].trim().slice(0, 300);
  }
  return Object.keys(notes).length ? notes : null;
}

/**
 * The ONE synthesis prompt that writes the final block from the per-image
 * notes. Forbids (spec §3.5): any brand/proper name (bannedNames comes from
 * the brand ROW at runtime — zero brand facts in code); all text-in-image /
 * poster / logo / typography language (the scenePrompt laws — those words make
 * diffusion models render text walls); and subject-content prescriptions
 * (style ≠ content — the block must compose with ANY scene).
 */
export function buildSynthesisPrompt(perImageNotes, { bannedNames = [] } = {}) {
  const names = (Array.isArray(bannedNames) ? bannedNames : [])
    .filter((n) => typeof n === 'string' && n.trim());
  const nameRule = names.length
    ? `Never mention these names or any proper noun: ${names.map((n) => `"${n.trim()}"`).join(', ')}. `
    : 'Never mention any brand name or proper noun. ';
  const notesJson = JSON.stringify(perImageNotes || []);
  return (
    'You are distilling a brand\'s photographic style from per-image style notes into ONE reusable style block. '
    + 'Answer STRICT JSON only: {"draft": string}. The draft is 60-120 words of plain prose describing HOW every photo should look: '
    + 'lighting, palette temperature, composition habits, texture/grain, depth of field, subject treatment, mood. '
    + 'HARD RULES for the draft: '
    + nameRule
    + 'Never use words about text, letters, words, typography, logos, posters, frames, borders, captions, graphic overlays, layouts or design — the block is appended to photography prompts and such words cause rendered-text failures. '
    + 'Never prescribe WHO or WHAT is in the photo — no people, ages, activities, objects, props, settings or scene content; the block must compose with ANY scene. '
    + 'Present tense, declarative sentences, no headings, no lists. '
    + `Per-image notes: ${notesJson}`
  );
}

/** Parse the synthesis answer. Bad JSON / empty → null. */
export function parseSynthesisDraft(raw) {
  let obj;
  try { obj = JSON.parse(String(raw)); } catch { return null; }
  const draft = typeof obj?.draft === 'string' ? obj.draft.trim().slice(0, MAX_STYLE_TEXT_CHARS) : '';
  return draft || null;
}

/**
 * Validate a raw imageIds payload for the distill route.
 * Returns { ids } (deduped strings) or { error } (honest 400 text).
 * Over-cap is an ERROR, not a silent slice — this gates a paid pass.
 */
export function sanitizeAnchorIds(raw) {
  if (!Array.isArray(raw)) return { error: 'imageIds must be an array of image ids.' };
  const ids = [...new Set(raw.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];
  if (!ids.length) return { error: 'At least one image id is required.' };
  if (ids.length > MAX_ANCHOR_IMAGES) {
    return { error: `Pick at most ${MAX_ANCHOR_IMAGES} anchor images (got ${ids.length}).` };
  }
  return { ids };
}

/**
 * Run the distill pass: one small vision call per anchor image, then ONE
 * synthesis call. Pure — the caller supplies resolved { id, url } images, the
 * OpenAI key/model and (in tests) a mock fetch. NEVER throws.
 * @returns {Promise<{draft:string, perImageNotes:Array<{id:string, notes:object|null, skipped?:true}>}|{failed:true, reason:string}>}
 */
export async function distillStyle({ images, apiKey, model = 'gpt-4o-mini', bannedNames = [], fetchImpl = fetch }) {
  const chat = async (content, maxTokens) => {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.choices?.[0]?.message?.content ?? null;
  };

  // Per-image style notes — detail:"low" + small max_tokens keeps each call cents-cheap.
  const perImageNotes = [];
  for (const img of images || []) {
    let notes = null;
    try {
      const raw = await chat([
        { type: 'text', text: buildPerImagePrompt() },
        { type: 'image_url', image_url: { url: img.url, detail: 'low' } },
      ], 250);
      notes = raw == null ? null : parsePerImageNotes(raw);
    } catch { notes = null; }
    perImageNotes.push(notes ? { id: img.id, notes } : { id: img.id, notes: null, skipped: true });
  }

  const usable = perImageNotes.filter((n) => n.notes);
  if (!usable.length) return { failed: true, reason: 'None of the chosen photos could be read.' };

  let draft = null;
  try {
    const raw = await chat(buildSynthesisPrompt(usable.map((n) => n.notes), { bannedNames }), 400);
    draft = raw == null ? null : parseSynthesisDraft(raw);
  } catch { draft = null; }
  if (!draft) return { failed: true, reason: 'The style synthesis did not return a usable draft.' };

  return { draft, perImageNotes };
}
