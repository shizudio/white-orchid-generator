// ── MOODBOARD GENES — the aspirational taste vocabulary (P1) ──────────────────
// docs/moodboard-templates-spec.md §2 + docs/composition-study-2.md.
//
// Every moodboard inspiration image gets ONE cheap vision call at upload time
// that extracts the shared gene vocabulary + the study-2 composition taxonomy:
//   { paletteClass, compositionDevice, photoTreatment, typeRegister, densityClass }
// stored on the brand_moodboard.genes column. This module OWNS the prompt, the
// vocabulary, and the parsing/normalisation — the API route and the nightly
// backfill both call classifyMoodboardImage() and never re-implement any of it.
//
// CONTRACTS
//  • Cheap model, one call per image (OPENAI_CLASSIFIER_MODEL || 'gpt-4o-mini' —
//    the same env-model pattern as OPENAI_ART_DIRECTOR_MODEL / OPENAI_AUDIT_MODEL,
//    a vision-capable cheap model). NEVER batches; the caller decides cadence/cap.
//  • Graceful: no API key, a network/parse failure, or an off-vocabulary answer
//    all resolve to `null` (the item stores genes:null and the upload/backfill is
//    NEVER blocked). Nothing throws out of this module.
//  • Only real assets (law 3): the expressibility map below points each device at
//    REAL archetype ids so the proposal engine can only ever compose brand elements.

import { PATCH_OPTIONS } from '@/lib/design-patch';

// ── The gene vocabulary (closed sets) ────────────────────────────────────────
// compositionDevice is verbatim from the spec §2 / study-2 taxonomy.
export const COMPOSITION_DEVICES = [
  'type-weave', 'shape-mask', 'collage', 'pill-card', 'split', 'caption-band', 'type-only', 'full-bleed',
];
// paletteClass — a small class set that maps cleanly onto real brand bg tokens
// (PALETTE_CLASS_TO_BG) so a proposal can pick a REAL palette token.
export const PALETTE_CLASSES = ['warm-neutral', 'deep-green', 'pastel', 'muted-earth', 'mono-dark', 'bright-accent'];
// typeRegister — the lettering register the inspiration leans on.
export const TYPE_REGISTERS = ['serif', 'script', 'sans', 'mixed', 'display'];
// densityClass — how full the composition is.
export const DENSITY_CLASSES = ['minimal', 'balanced', 'busy'];
// photoTreatment REUSES the brand PHOTO_TREATMENTS token space (mirrored via
// design-patch) so a moodboard treatment count merges into the SAME
// counts.photoTreatment bucket the hearts feed (spec §3 "same gene counts").
export const PHOTO_TREATMENTS = PATCH_OPTIONS.photoTreatment; // ['none','warmGrade','duotone',…]

export const MB_GENE_KEYS = ['paletteClass', 'compositionDevice', 'photoTreatment', 'typeRegister', 'densityClass'];

// ── Expressibility: composition device → the REAL archetypes that already realise
// it with brand elements (docs/composition-study-2.md R1–R5). An empty list would
// mean "not yet expressible" (the proposal engine skips such a cluster — a proposal
// never fabricates a layout). Every id here is in PATCH_OPTIONS.archetypeId.
export const DEVICE_TO_ARCHETYPES = {
  'type-weave':   ['documentary', 'full_bleed_duotone'],
  'shape-mask':   ['petal_window', 'shape_cutout'],
  'collage':      ['message_pill'],
  'pill-card':    ['message_pill'],
  'split':        ['editorial_split'],
  'caption-band': ['full_bleed_duotone', 'documentary'],
  'type-only':    ['manifesto', 'quote_margin', 'serif_word'],
  'full-bleed':   ['documentary', 'full_bleed_duotone'],
};

// paletteClass → the nearest REAL bg token (PATCH_OPTIONS.bgColor).
export const PALETTE_CLASS_TO_BG = {
  'warm-neutral': 'whiteSmoke',
  'deep-green':   'burnham',
  'pastel':       'wisteria',
  'muted-earth':  'terracotta',
  'mono-dark':    'jet',
  'bright-accent':'butter',
};

// Whether a device can be composed from brand elements today.
export function isDeviceExpressible(device) {
  return Array.isArray(DEVICE_TO_ARCHETYPES[device]) && DEVICE_TO_ARCHETYPES[device].length > 0;
}

// ── Normalisation — coerce a raw model answer into the strict vocabulary ──────
// Unknown / missing values become null (the mirror-trap discipline: an off-vocab
// value is silently dropped, never stored). Returns a genes object, or null when
// nothing usable survives (so the caller can store genes:null honestly).
function pick(value, allowed) {
  const v = typeof value === 'string' ? value.trim() : '';
  return allowed.includes(v) ? v : null;
}
export function normalizeGenes(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const genes = {
    paletteClass:     pick(raw.paletteClass, PALETTE_CLASSES),
    compositionDevice: pick(raw.compositionDevice, COMPOSITION_DEVICES),
    photoTreatment:   pick(raw.photoTreatment, PHOTO_TREATMENTS),
    typeRegister:     pick(raw.typeRegister, TYPE_REGISTERS),
    densityClass:     pick(raw.densityClass, DENSITY_CLASSES),
  };
  // If the model gave us nothing usable, be honest and store null rather than a
  // hollow all-null object (the backfill treats null as "still needs classifying").
  const anyReal = MB_GENE_KEYS.some(k => genes[k] != null);
  return anyReal ? genes : null;
}

// ── The prompt ───────────────────────────────────────────────────────────────
const CLASSIFY_PROMPT =
  'You are a design taxonomist. Classify this INSPIRATION image (a moodboard reference, ' +
  'not something to critique) into a strict gene set. Answer STRICT JSON only, exactly these keys:\n' +
  '{"paletteClass": one of ["warm-neutral","deep-green","pastel","muted-earth","mono-dark","bright-accent"],\n' +
  ' "compositionDevice": one of ["type-weave","shape-mask","collage","pill-card","split","caption-band","type-only","full-bleed"],\n' +
  ' "photoTreatment": one of ["none","warmGrade","duotone","duotoneLift","filmGrain","duotoneStrong","cleanGrain"],\n' +
  ' "typeRegister": one of ["serif","script","sans","mixed","display"],\n' +
  ' "densityClass": one of ["minimal","balanced","busy"]}\n' +
  'Definitions — compositionDevice: type-weave = large type overlapping/wrapping the photo; ' +
  'shape-mask = photo revealed through an organic/geometric cutout; collage = photo plus floating ' +
  'graphic shapes; pill-card = the message on a rounded card/pill over the photo; split = photo beside ' +
  'a solid text panel; caption-band = full photo with a small caption strip; type-only = no photo, ' +
  'text carries it; full-bleed = one photo fills the frame, minimal overlay. ' +
  'photoTreatment: warmGrade = warm near-raw; duotone/duotoneStrong = green tint; none = no photo. ' +
  'Choose the single closest value for each; never invent a value outside the lists.';

// ── The one vision call ──────────────────────────────────────────────────────
// imageDataUrl: a `data:image/…;base64,…` thumbnail (what brand_moodboard.image
// stores). Returns a normalised genes object, or null on ANY problem (no key,
// bad image, network/parse failure, off-vocab answer). Never throws.
export async function classifyMoodboardImage(imageDataUrl) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || typeof imageDataUrl !== 'string' || !/^data:image\//.test(imageDataUrl)) return null;
  const model = process.env.OPENAI_CLASSIFIER_MODEL || 'gpt-4o-mini';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 120,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: CLASSIFY_PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
          ],
        }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const rawText = json?.choices?.[0]?.message?.content;
    if (!rawText) return null;
    let parsed;
    try { parsed = JSON.parse(rawText); } catch { return null; }
    return normalizeGenes(parsed);
  } catch {
    return null;
  }
}
