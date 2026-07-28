import { getAdminClient } from '@/lib/supabase';
import { PATCH_JSON_SCHEMA, PATCH_FIELD_GUIDE, PATCH_OPTIONS } from '@/lib/design-patch';
import { generatePhoto, higgsfieldConfigured } from '@/lib/higgsfield';
import { getLikePreferences, weightedPick, likeCountFor, emptyPreferences } from '@/lib/preferences';
import { DEFAULT_BRAND_NAME, DEFAULT_ASSISTANT_NAME, DEFAULT_TONE, DEFAULT_VOICE_RULES, DEFAULT_PHOTO_BRIEF } from '@/lib/brand-defaults';
import { loadRotation, saveRotation, rotationClient } from '@/lib/rotation-state';
import { detectBandRemoval, reconcileEditorLayoutClaim, detectAddElement, detectPolishRequest, addElementClassRefusal, detectLayoutVariety } from '@/lib/assistant-intents';
import { LAYOUT_VARIETY_RINGS, NO_LAYOUT_SWITCH_REPLY } from '@/lib/layout-switch-verification.mjs';

export const runtime = 'nodejs';
// Image generation (gpt-image-1, medium quality) can take 10–30s; the default
// Vercel route timeout would cut it off. 60s gives the second OpenAI call room.
export const maxDuration = 60;

// Brand-style wrapper for gpt-image-1 (P4). We prepend our aesthetic + palette and
// a hard "no text/logos/watermarks" instruction, then append the model's concise
// scene description. Keeps every generated background on-brand and text-free so the
// studio's own type/logo lockup stays the only copy on the canvas.
function brandImagePrompt(scene, photoBrief = DEFAULT_PHOTO_BRIEF) {
  return [
    photoBrief.castingBrief,
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

async function generateBrandImage(apiKey, scene, dimensionId, photoBrief = DEFAULT_PHOTO_BRIEF) {
  const payload = {
    model: 'gpt-image-1',
    prompt: brandImagePrompt(scene, photoBrief),
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

// ── ARCHETYPE PHOTO NEGATIVE-SPACE DIRECTIVES ────────────────────────────────
// Each editorial archetype (ARCHETYPES in components/Generator.jsx) places its
// hero text / logo in a known region, so a generated photo should keep the
// COMPLEMENTARY region calm — an even, low-detail area the studio's own type +
// logo lockup can sit over. These one-line directives are derived from each
// archetype's photo/hero geometry and passed to Higgsfield as its negativeSpace
// hint (falls back to a neutral directive when the archetype is unknown/absent).
const ARCHETYPE_PHOTO_DIRECTIVES = {
  // photo fills the right ~40%; text block sits left → keep the RIGHT side calm.
  editorial_split: 'keep the right side an even, low-detail area with soft light for a text block.',
  // full-bleed photo under a whisper caption low-left → keep the LOWER portion calm.
  full_bleed_duotone: 'keep the lower third calm, soft and uncluttered for a small caption.',
  // near-full-bleed candid, only a thin metadata line → gentle, unbusy edges.
  documentary: 'a single clean candid moment; keep the bottom edge calm for a thin caption line.',
  // portrait fills the right ~48%; name/credential sits left → keep the LEFT calm.
  portrait_credential: 'a single subject toward the right; keep the left side an even, calm background.',
  // photo revealed through the petal window on the right → subject sits RIGHT.
  petal_window: 'compose the main subject slightly right of centre with calm negative space around it.',
  // (R2) photo revealed through a large centred organic cutout → subject centred.
  shape_cutout: 'compose the main subject centred with calm, even negative space around it.',
  // (R3) message pill overlaps the lower third → subject upper half, calm lower third.
  message_pill: 'compose the main subject in the upper half; keep the lower third calm and even for a message card.',
  // text-forward layouts (hero text over/near a supporting photo) → calm TOP.
  serif_word: 'keep the upper third calm negative space for a large headline.',
  big_number: 'keep the centre and upper area calm for a large date or number.',
  quote_margin: 'generous calm margins around a quiet central area for a quote.',
  manifesto: 'a calm, even field with generous quiet space for a short paragraph.',
  label_headline: 'keep the middle band calm for an eyebrow label and headline.',
  motif_field: 'a soft, even pastel-leaning field with calm central negative space.',
  floated_card: 'a calm, evenly lit scene suitable behind a small floated photo card.',
};
const DEFAULT_PHOTO_DIRECTIVE = 'keep the upper third calm negative space for a headline and logo.';

function photoDirectiveForArchetype(archetypeId) {
  return ARCHETYPE_PHOTO_DIRECTIVES[archetypeId] || DEFAULT_PHOTO_DIRECTIVE;
}

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const WINDOW_MS = 60_000;

// (Commit 3) LANDING PHOTO ATTACH — for photo-led archetypes, pull a suitable image
// from the Supabase Library so the landing design isn't text-only-plain by default.
// Uses the admin client directly (no HTTP self-call): query the `images` table,
// prefer brand-library batch entries (metadata.batch === 'brand-library'), pick a
// random one, and return a fresh SIGNED URL for the client to apply as the background.
// GRACEFUL: any failure (empty Library, storage unconfigured, no rows) returns null,
// so the landing flow proceeds text-only exactly as before. Which archetypes benefit:
const PHOTO_ATTACH_ARCHETYPES = new Set([
  'editorial_split', 'floated_card', 'documentary', 'full_bleed_duotone',
  'shape_cutout',   // (R2) the cutout needs a photo to reveal
  'message_pill',   // (R3) the pill overlaps a full-bleed photo
]);
async function pickLandingPhoto(archetypeId, dimensionId) {
  if (!PHOTO_ATTACH_ARCHETYPES.has(archetypeId)) return null;
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('images')
      .select('storage_path, metadata, source_type')
      .order('created_at', { ascending: false })
      .limit(60);
    if (error || !Array.isArray(data) || !data.length) return null;
    // Prefer curated brand-library entries; fall back to any Library image.
    const branded = data.filter(r => (r.metadata && r.metadata.batch) === 'brand-library');
    const pool = branded.length ? branded : data;
    if (!pool.length) return null;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    if (!chosen?.storage_path) return null;
    const { data: signed, error: sErr } = await supabase.storage
      .from('images')
      .createSignedUrl(chosen.storage_path, 60 * 60); // 1h — the client applies it immediately
    if (sErr || !signed?.signedUrl) return null;
    return signed.signedUrl;
  } catch {
    return null; // Library unavailable → text-only landing, unchanged behaviour
  }
}
const MAX_REQUESTS = 20; // conversational — allow a few more turns/minute than the one-shot planner
const requestLog = new Map();

// ── DETERMINISTIC OVERLAY GATE (P1) ──────────────────────────────────────────
// The model kept reaching for the orchid-petal frame (and other overlays) even on
// plain informational posts, despite the prompt telling it not to. Prompt-level
// discouragement is not reliable, so we gate overlays SERVER-SIDE: a patch may only
// carry addOverlay when the user EXPLICITLY asks for a shape/frame treatment.
// STRICT on purpose: the first version also matched everyday event words
// ("invite", "celebration", "party"), so "An open house invite for 18 July"
// slipped through and users kept getting the petal frame on plain event posts.
// Only words that name the visual treatment itself pass now; the overlay is
// stripped silently otherwise — the reply text is left untouched so the
// assistant never announces a frame it didn't add.
const DECOR_INTENT = /\b(frame[sd]?|framing|petal\w*|orchid\w*|shape[sd]?|decorat\w*|ornament\w*|flourish\w*|cut-?out|silhouette\w*|overlay\w*)\b/i;

function wantsDecoration(text) {
  return DECOR_INTENT.test(String(text || ''));
}

// (Photo-first) Belt-and-braces guard: strip brand/design/text words from a
// model-written scenePrompt so the photographer brief never nudges the diffusion
// model to render type or a poster. The lib prompt builder adds the grade, camera
// and "no text" rules; this only removes words that shouldn't be in a photo brief.
const SCENE_BANNED = /\b(the white orchid|white orchid|instagram|poster|headline|caption|subtitle|tagline|logo|wordmark|text|typography|type|font|layout|design|graphic|banner|title|copy|cta|button|pill)\b/gi;
function sanitizeScenePrompt(s) {
  return String(s || '')
    .replace(SCENE_BANNED, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim()
    .slice(0, 600);
}

// ── PHOTO-FIRST LANDING DEFAULTS ─────────────────────────────────────────────
// Client ruling (2026-07-04): a solid-field tile reads great INSIDE a feed but
// plain as a STANDALONE first answer. So landing briefs default to PHOTO-LED
// compositions; solid-field archetypes stay reachable through the "Try another"
// rotation, but are never the first answer UNLESS the brief is explicitly
// text-only (quote / manifesto / mission / values wording).
const TEXT_ONLY_INTENT = /\b(quote|quotation|saying|proverb|manifesto|mission|our values|values post|belief|motto|mantra|affirmation|text[- ]?only|no photo|without (a )?photo)\b/i;
function wantsTextOnly(text) {
  return TEXT_ONLY_INTENT.test(String(text || ''));
}
// Preferred photo-led archetypes per intent (order matters — first cap-clear wins).
// petal_window is excluded (decor-gated signature tile).
const PHOTO_LED_BY_INTENT = {
  event:       ['editorial_split', 'full_bleed_duotone', 'floated_card', 'shape_cutout', 'message_pill', 'documentary', 'portrait_credential'],
  text_post:   ['editorial_split', 'floated_card', 'shape_cutout', 'message_pill', 'portrait_credential', 'documentary', 'full_bleed_duotone'],
  photo_logo:  ['documentary', 'shape_cutout', 'full_bleed_duotone', 'floated_card', 'message_pill', 'editorial_split', 'portrait_credential'],
  texture_text:['full_bleed_duotone', 'documentary', 'shape_cutout', 'floated_card', 'message_pill', 'editorial_split', 'portrait_credential'],
  quote:       ['portrait_credential', 'message_pill', 'floated_card', 'editorial_split', 'shape_cutout', 'documentary', 'full_bleed_duotone'],
};
// Deterministic photo-led pick: first cap-clear preference for this intent; if the
// caps have saturated the whole photo-led pool (a run of photo-first landings),
// fall back to the LEAST-RECENTLY-USED photo-led archetype rather than a solid.
function pickPhotoLedArchetype(intent) {
  const prefs = PHOTO_LED_BY_INTENT[intent] || PHOTO_LED_BY_INTENT.text_post;
  for (const id of prefs) if (!exceedsCap(id)) return id;
  const counts = prefs.map(id => ({ id, n: RECENT_PICKS.filter(x => x === id).length }));
  counts.sort((a, b) => a.n - b.n);
  return counts[0].id;
}
// Server-side fallback photographer briefs, per intent — used when the model
// omitted scenePrompt for a photo-led plan so the photo pipeline ALWAYS fires
// (lib/higgsfield adds the grade / camera / no-text scaffold). Single-sourced
// from lib/brand-defaults.js DEFAULT_PHOTO_BRIEF.defaultScenes (P1 item e).
const DEFAULT_SCENES = DEFAULT_PHOTO_BRIEF.defaultScenes;
function fallbackScene(intent) {
  return DEFAULT_SCENES[intent] || DEFAULT_SCENES.text_post;
}

// ── EDITOR LAYOUT-INTENT GATE (Commit 1) ─────────────────────────────────────
// In the editor, an archetype (layout) change should happen ONLY when the user
// asks for a layout/style change. The model sometimes swaps the archetype on a
// plain copy/colour tweak; this matches the vocabulary of a genuine layout request
// so we can strip an unsolicited archetype swap server-side (keeping the layout put).
const LAYOUT_INTENT = /\b(layout|poster|compos\w*|archetype|redesign|re-?design|template|big number|big date|date card|quote card|manifesto|photo card|floated card|documentary|full[- ]?bleed|duotone|portrait|credential|different look|another look|different style|switch (it|the) (up|layout)|make it a|turn (it|this) into)\b/i;
// ── FULL-IMAGE / PANEL-REMOVAL INTENT (WP-W0 specimen fix) ───────────────────
// The client's exact failing asks: "i want full image post" (AI fiddled with
// headline/backdrop, claimed a layout switch) and "remove the green solid" (the
// split layout's solid side PANEL — not a backdrop/overlay — so only an
// archetypeId change can remove it). Both are LAYOUT requests: they must pass
// the layout gate AND deterministically land on a photo-dominant archetype.
const FULL_IMAGE_INTENT = new RegExp([
  'full[- ]?(image|photo|picture|bleed)',
  'whole (image|photo|picture|post|frame)',
  '(photo|image|picture)[^.!?]{0,24}(fills?|filling|covers?|covering)',
  'fill (the )?(whole |entire |full )?(frame|post|canvas|screen)',
  'edge[- ]to[- ]edge',
  '(remove|get rid of|delete|drop|lose|no more|without) (the |that |this )?(green |colou?red |color |solid |big )*(solid|panel|block|band|column|slab)',
  'green (solid|panel|block|band|column|slab)',
].map(s => `\\b(${s})\\b`).join('|'), 'i');
function wantsFullImage(text) {
  return FULL_IMAGE_INTENT.test(String(text || ''));
}
function wantsLayoutChange(text) {
  const t = String(text || '');
  return LAYOUT_INTENT.test(t) || wantsFullImage(t);
}

// ── EDITOR SIMPLE-REQUEST DETERMINISTIC BELTS (defect-class #1) ───────────────
// Every nightly run flagged the same failure: a plain, legitimate chat request
// ("the headline shud say Open House not open day", "change the colour to mauve",
// "make it warmer") produced an EMPTY patch, so the client's honesty pipeline
// fired "Honestly — that didn't change anything visible". The model (gpt-4o-mini)
// is unreliable at mapping colloquial, typo-laden asks to the right patch field.
// These belts guarantee the correct field lands for the highest-frequency simple
// patterns — the same "user is the boss, make it Just Work" discipline as the
// existing full-image / logo-placement / shape-swap belts below. When a belt
// injects a change it ALSO rewrites `reply` to honestly narrate exactly what
// changed, so the reply and the render agree (no false claim, no apology).

// COLOUR VOCABULARY → nearest brand bg token. Values are BG_OPTIONS ids (the full
// palette; Generator validates against BG_ID_SET). Order matters: multi-word keys
// first so "dusty pink" wins over "pink". "warm"/"cool" handled by the mood belt.
const COLOUR_WORD_TO_TOKEN = [
  [/\bdusty\s*pink\b|\bblush\b|\brose\b|\bpink\b/i, 'dustyPink'],
  [/\bmauve\b|\blilac\b|\bplum\b|\bwisteria\b|\bpurple\b|\bviolet\b/i, 'wisteria'],
  [/\bterracotta\b|\bterra\s*cotta\b|\brust\b|\bclay\b|\bbrick\b|\bwarm\s*orange\b/i, 'terracotta'],
  [/\bbutter\b|\bcream\b|\bpale\s*yellow\b|\bbuttery\b|\bprimrose\b/i, 'butter'],
  // Warm neutrals (the client's live "beige" ask fell through to the model path,
  // whose schema can't express the visible field on a materialized design).
  [/\bbeige\b|\btaupe\b|\bsand\b|\bsandy\b|\btan\b|\boat(?:meal)?\b|\becru\b/i, 'butter'],
  [/\bsky\b|\bpowder\s*blue\b|\bbaby\s*blue\b|\bpale\s*blue\b|\bblue\b/i, 'sky'],
  [/\bsage\b|\bmint\b|\bsoft\s*green\b|\bpale\s*green\b/i, 'sage'],
  [/\bceladon\b/i, 'celadon'],
  [/\bforest\b|\bdeep\s*green\b|\bburnham\b|\bemerald\b|\bdark\s*green\b/i, 'burnham'],
  [/\bivory\b|\bwhite\s*smoke\b|\boff[- ]?white\b|\bcream\s*white\b/i, 'whiteSmoke'],
  [/\bjet\b|\bcharcoal\b|\bnear[- ]?black\b|\bblack\b|\bink\b/i, 'jet'],
];
// A colour ask: the user is talking about background/colour, not a photo or copy.
const COLOUR_ASK_INTENT = /\b(colou?r|background|bg|backdrop|field|palette|make it|change|swap|turn it|more of a|vibe)\b/i;
function detectColourToken(text) {
  const t = String(text || '');
  for (const [re, token] of COLOUR_WORD_TO_TOKEN) if (re.test(t)) return token;
  return null;
}

// MOOD / AESTHETIC RECIPES → a defined, visible patch. Each mood maps a bundle of
// fields so an ambiguous "make it warmer / softer / cuter" resolves to a real,
// coherent change rather than nothing. Fields chosen to (a) always differ from a
// typical starting design so SOMETHING lands, and (b) read as the named mood.
//   photoTreatment values: warmGrade | cleanGrain | duotone | filmGrain …
//   bgColor values: the curated pastels above.
// The belt applies the recipe, then prunes any field already at that value so the
// remainder is guaranteed to be a real diff (picking an alternate when needed).
const MOOD_RECIPES = {
  warmer:  { bgColor: 'butter',     bgAlt: 'terracotta', photoTreatment: 'warmGrade', narrate: 'warmed it up — a soft butter field and a warm photo grade' },
  softer:  { bgColor: 'dustyPink',  bgAlt: 'lilac',      photoTreatment: 'cleanGrain', narrate: 'softened it — a gentle blush field and a calmer, cleaner photo tone' },
  cuter:   { bgColor: 'dustyPink',  bgAlt: 'butter',     photoTreatment: 'cleanGrain', narrate: 'made it sweeter — a soft blush field and a friendlier photo tone' },
  fun:     { bgColor: 'butter',     bgAlt: 'sky',        photoTreatment: 'filmGrain', narrate: 'made it more playful — a brighter field and a livelier photo tone' },
  pop:     { bgColor: 'terracotta', bgAlt: 'wisteria',   photoTreatment: 'filmGrain', narrate: 'gave it more pop — a bolder field and a punchier photo tone' },
  bolder:  { bgColor: 'burnham',    bgAlt: 'terracotta', photoTreatment: 'duotone',   narrate: 'made it bolder — a deeper field and a stronger photo treatment' },
  cooler:  { bgColor: 'sky',        bgAlt: 'sage',       photoTreatment: 'cleanGrain', narrate: 'cooled it down — a soft sky field and a calmer photo tone' },
  calmer:  { bgColor: 'sage',       bgAlt: 'celadon',    photoTreatment: 'cleanGrain', narrate: 'made it calmer — a muted green field and a quieter photo tone' },
};
// Map the user's mood word to a recipe key.
function detectMood(text) {
  const t = String(text || '').toLowerCase();
  if (/\bwarm(er|th)?\b|\bcos(y|ier)\b|\bcozy\b|\binviting\b/.test(t)) return 'warmer';
  if (/\bsoft(er)?\b|\bgentl\w*\b|\bcalm(er)?\b|\bmuted\b/.test(t)) return /\bcalm/.test(t) ? 'calmer' : 'softer';
  if (/\bcut(e|er|sy)\b|\bsweet(er)?\b|\bador\w*\b/.test(t)) return 'cuter';
  if (/\bfun(ner|nier)?\b|\bplayful\b|\blively\b|\bfor the kids\b|\bmore fun\b/.test(t)) return 'fun';
  if (/\bpop\b|\bboring\b|\bbland\b|\bplain\b|\bdull\b|\bexciting\b|\bmore interesting\b/.test(t)) return 'pop';
  if (/\bbold(er)?\b|\bstrong(er)?\b|\bpunch\w*\b|\bstriking\b/.test(t)) return 'bolder';
  if (/\bcool(er)?\b|\bfresh(er)?\b/.test(t)) return 'cooler';
  return null;
}

// TEXT SUBSTITUTION — "the headline should say X not Y", "change the title to X",
// "it should say X". Extracts the intended NEW copy so a plain wording fix lands
// on the right role instead of dead-ending. Returns { role, value } or null.
//   role ∈ headline | subtext (best-effort from the noun the user named).
function detectTextSubstitution(text) {
  const t = String(text || '').trim();
  // DATE FIRST — "change the date to friday the 18th", "the date should be 18 July".
  // A date the user explicitly supplied maps to dateText (never invented).
  if (/\bdate\b/i.test(t) && /\b(chang\w*|updat\w*|set|move|make|should be|shift|to)\b/i.test(t)) {
    let dm = t.match(/\bdate\s+(?:should\s+be|to|is|:)\s+(.+)$/i) || t.match(/\b(?:chang\w*|updat\w*|set|move|shift)\s+(?:the\s+)?date\s+(?:to|into)\s+(.+)$/i);
    if (dm) {
      let dv = dm[1].replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '').trim();
      // Tidy "friday the 18th" → "Friday the 18th" (title-case leading words).
      if (dv && dv.length >= 2 && dv.length <= 60) {
        dv = dv.replace(/\b(mon|tues|wed(nes)?|thurs?|fri|satur|sun)day\b/gi, s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
        return { role: 'dateText', value: dv };
      }
    }
  }
  // Which role did they name? Default to headline (the most common "say X" target).
  const role = /\b(subtext|caption|small text|subtitle|detail|note|line)\b/i.test(t) ? 'subtext'
    : /\b(headline|title|heading|big text|main (text|words|line)|the top)\b/i.test(t) ? 'headline'
    : /\bhead(line|er)?\b/i.test(t) ? 'headline'
    : null;
  if (!role) return null;
  // Patterns that carry the NEW value:
  //   "… should say Open House not open day"  → "Open House"
  //   "… say 'Open House'"                     → "Open House"
  //   "change the headline to Open House"      → "Open House"
  //   "the headline shud say Open House"       → "Open House"
  let value = null;
  let m = t.match(/\b(?:says?|shou?ld\s+say|shud\s+say|read|reads?)\s+(.+?)(?:\s+(?:not|instead of|rather than|and not)\s+.+)?$/i);
  if (m) value = m[1];
  if (!value) { m = t.match(/\b(?:chang\w*|updat\w*|set|edit|rename|make)\s+(?:the\s+)?(?:headline|title|heading|subtext|caption|subtitle)\s+(?:to|into|so it says|say)\s+(.+)$/i); if (m) value = m[1]; }
  if (!value) return null;
  value = value.replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '').trim();
  // Guard: a value that's just a design word or empty isn't a real substitution.
  if (!value || value.length < 2 || value.length > 100) return null;
  return { role, value };
}

// ADD CONTACT / NAME — "add my name miss tan at the bottom", "put our phone number
// at the bottom 9123 4567". These map to a supporting copy role (attribution for a
// name/sign-off, subtext for a contact detail) but the model kept walking them back.
// Returns { role, value } or null. NEVER invents facts — it only lifts the literal
// name/number the user typed.
function detectContactAdd(text) {
  const t = String(text || '').trim();
  const addIntent = /\b(add|put|include|show|write|place|stick)\b/i.test(t)
    && /\b(name|phone|number|contact|email|handle|call|whatsapp|hp|mobile|tel)\b/i.test(t);
  if (!addIntent) return null;
  // Phone / contact number: pull the digit run the user supplied (SG-style spacing ok).
  const phone = t.match(/(\+?\d[\d\s-]{5,}\d)/);
  if (phone && /\b(phone|number|contact|call|whatsapp|hp|mobile|tel)\b/i.test(t)) {
    const digits = phone[1].trim();
    return { role: 'subtext', value: `Call us: ${digits}` };
  }
  // Name / sign-off: "add my name miss tan" → attribution "Miss Tan". Lift the words
  // AFTER "name" (or after "my name is"), title-cased, no invented content.
  let m = t.match(/\bname\s+(?:is\s+)?(?:for\s+)?(.+?)(?:\s+(?:at|on|to|in|near)\s+the\s+\w+.*)?$/i);
  if (m) {
    let name = m[1].replace(/\b(at|on|to)\s+the\s+(bottom|top|side|corner|footer).*$/i, '').trim();
    name = name.replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '').trim();
    // Title-case a short human name; guard against empty / over-long lifts.
    if (name && name.length >= 2 && name.length <= 60) {
      const cased = name.replace(/\b\w/g, c => c.toUpperCase());
      return { role: 'attribution', value: cased };
    }
  }
  return null;
}

// TYPOGRAPHY — "make the title/headline bigger/smaller". Bumps the relevant font
// role one step in FONT_SIZE_STEPS. Returns { role, dir } or null.
const FONT_STEPS = ['xs', 's', 'm', 'l', 'xl'];
function detectFontResize(text) {
  const t = String(text || '').toLowerCase();
  const bigger = /\b(bigger|larger|grow|increase|blow up|more prominent|stand out more|too small)\b/.test(t);
  const smaller = /\b(smaller|tinier|shrink|reduce|less prominent|too big|too large)\b/.test(t);
  if (!bigger && !smaller) return null;
  if (!/\b(title|headline|heading|text|font|words|copy|type|subtext|caption|subtitle)\b/.test(t)) return null;
  const role = /\b(subtext|caption|subtitle|detail)\b/.test(t) ? 'content'
    : /\b(title|headline|heading|big text|main)\b/.test(t) ? 'heading'
    : 'heading'; // "make the text bigger" → the hero heading by default
  return { role, dir: bigger ? 'up' : 'down' };
}
function bumpStep(cur, dir) {
  const i = FONT_STEPS.indexOf(cur);
  const base = i < 0 ? FONT_STEPS.indexOf('m') : i;
  const next = dir === 'up' ? Math.min(FONT_STEPS.length - 1, base + 1) : Math.max(0, base - 1);
  return FONT_STEPS[next];
}

// ── ADD TEXT ELEMENT (Text Elements slice 4 — spec §5) ───────────────────────
// The CLOSED, brand-governed element-class enum (10th mirrored surface). MIRRORS
// lib/text-elements.mjs ELEMENT_CLASSES, lib/design-patch.js PATCH_OPTIONS.elementClass
// and Generator.jsx ELEMENT_CLASS_IDS — run mirror-check.sh after any edit. The pure
// belt detection lives in lib/assistant-intents.js (detectAddElement) so it is unit-tested.
const ELEMENT_CLASSES = ['heading', 'subheading', 'body', 'caption', 'cta'];
// Plain labels a preschool teacher reads at a glance (never "CTA"/"eyebrow").
const ELEMENT_CLASS_LABEL = { heading: 'heading', subheading: 'subheading', body: 'text', caption: 'caption', cta: 'button' };
// (Font Ruling B) The sanctioned register vocabulary (eleventh mirrored surface). MIRRORS
// lib/typography-config.mjs SANCTIONED_REGISTERS, lib/text-elements.mjs ELEMENT_REGISTERS and
// lib/design-patch.js PATCH_OPTIONS.register — run mirror-check.sh after any edit. A register
// only pins when sanctioned for the element's class (editElements[].register in the patch).
const ELEMENT_REGISTERS = ['serif', 'heavySans', 'body', 'eyebrow', 'badge'];

// PHOTO CHANGE / REPLACE (2.2) — "change the photo to X", "different picture",
// "swap the image for Y", "the picture doesnt fit our vibe". This was the last-open
// slice of the honesty cluster: the model claimed a photo change with an EMPTY patch
// (5× "change the photo to children painting" in the nightly corpus), reproducing the
// specimen §0 false claim. We route it to the REAL photo pipeline (patch.imagePrompt)
// and narrate in PRESENT tense — generation is deferred/async (and mocked in the
// tester), so a past-tense "I've changed the photo" would be false the instant the
// image hasn't landed. NEVER matches a LAYOUT "fill the whole thing" ask (that has no
// change-verb near "photo" and no vibe-mismatch word, so it stays with wantsFullImage).
// Returns { scene } — scene is the named subject, or null when the user asked for a
// different photo without naming one (then we give an honest, actionable reply, never
// a fabricated scene).
const PHOTO_CHANGE_INTENT = /\b(chang\w*|swap\w*|switch\w*|replac\w*|different|new|another|updat\w*|redo|regenerat\w*)\b[^.!?]{0,32}\b(photo|picture|image|pic|bg photo|background photo)\b|\b(photo|picture|image|pic)\b[^.!?]{0,32}\b(doesn'?t|does not|isn'?t|is not|not|wrong|off|fit|fits|match\w*|vibe|feel|suit\w*)\b/i;
function detectPhotoChange(text) {
  const t = String(text || '').trim();
  if (!PHOTO_CHANGE_INTENT.test(t)) return null;
  // Extract a named subject after "to/of/into/showing/with/featuring": "change the
  // photo to children painting" → "children painting". Null when they only signalled
  // dissatisfaction ("different picture", "the picture doesnt fit our vibe").
  let scene = null;
  let m = t.match(/\b(?:photo|picture|image|pic)\b[^.!?]*?\b(?:to|of|into|for|showing|with|that shows?|featuring)\s+(.+)$/i)
       || t.match(/\b(?:to|of|into|for|showing|featuring)\s+(.+)$/i);
  if (m) {
    scene = m[1].replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '').trim();
    // Guard against lifting a design/layout word or an over-long tail.
    if (scene.length < 2 || scene.length > 160 || /^(the )?(whole|full|entire|frame|post|canvas|screen)\b/i.test(scene)) scene = null;
  }
  return { scene };
}

// (2.5 born-clean) Fit generated LANDING copy to a conservative per-role budget so
// the system's OWN over-long copy doesn't shrink the caption below its thumbnail
// legibility floor (thumb-legibility dot) or drop to fit (copy-dropped dot) — the
// dominant born-clean advisor dots on live landing generations. Trim on a sentence
// boundary within budget when possible, else the last whole word (no ellipsis — a
// fresh design reads cleanest without one). Editor turns are untouched: a user's own
// copy is verbatim, never trimmed. NOTE: these budgets are conservative and format-
// agnostic; the EXACT per-format/per-archetype floor is render geometry (Generator
// .jsx) — a follow-up pins the precise budget from the born-clean finding ids (2.7).
const LANDING_COPY_MAX = { headline: 48, subtext: 120, attribution: 64, dateText: 48 };
function fitCopy(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  const window = t.slice(0, max + 1);
  const sent = window.match(/^[\s\S]*[.!?](\s|$)/); // a sentence end within budget
  if (sent && sent[0].trim().length >= max * 0.5) return sent[0].trim();
  let cut = t.slice(0, max).replace(/\s+\S*$/, '').trim(); // last whole word
  // (2026-07-15 stump class, mirrors 81ebe5e's client guard) A whole-word cut can
  // still land on a DANGLING FUNCTION WORD ("…a week of creativity and") — a stump
  // at any length. Back off trailing function words + their separators so authored
  // landing copy always ends on a content word (born-clean: never author what the
  // copy-stump advisor finding would flag).
  const DANGLES = /\b(?:and|or|but|nor|yet|so|for|of|to|in|on|at|by|as|with|from|into|the|a|an|our|your|their|its|his|her|is|are|was|were|be|been)\s*$/i;
  let guard = 0;
  while (guard++ < 24 && DANGLES.test(cut)) {
    const next = cut.replace(DANGLES, '').replace(/[\s,;:–—-]+$/, '').trim();
    if (!next || next === cut) break;
    cut = next;
  }
  return cut || t.slice(0, max).trim();
}

// ── LANDING ARCHETYPE SELECTION (Commit 1) ───────────────────────────────────
// The landing handoff must now pick an EDITORIAL ARCHETYPE (docs/visual-language-
// spec.md §2) for every plan, chosen by the user's intent. This compact catalog
// mirrors ARCHETYPES in components/Generator.jsx (kept in sync by hand — the data
// model lives in a client component and isn't importable here). Each carries:
//   id            the archetype id (a valid PATCH_OPTIONS.archetypeId value)
//   desc          one line the model reasons from
//   suits         which post intents it fits (used for silent cap-override fallback)
//   klass         "light" | "dark" — feeds the 25–30% dark-share cap (spec §3)
//   cap           max fraction of a landing run this archetype may occupy (spec
//                 frequency caps: petal_window ≤1-in-8 ≈0.12, motif_field ≈0.14…)
//   palette       the palette-class hint surfaced in the rotation nudge
const LANDING_ARCHETYPES = [
  { id:'serif_word',        desc:'oversized serif hero word/phrase on a solid field — announcements, brand statements', suits:['text_post','quote','announcement'], klass:'light', cap:0.18, palette:'ivory field, burnham ink, one coral accent' },
  { id:'editorial_split',   desc:'photo block + solid text block, seam off-center — dated events, hiring, photo moments', suits:['event','photo_logo','text_post'], klass:'light', cap:0.14, palette:'ivory text block beside a warm-graded (near-raw) photo' },
  { id:'big_number',        desc:'a date or number at poster scale is the hero — open house, term start, deadlines', suits:['event'], klass:'light', cap:0.12, palette:'ivory field, big burnham numeral' },
  { id:'full_bleed_duotone',desc:'photo full-bleed under a green duotone + one whisper caption — mood / seasonal photo moments', suits:['photo_logo','texture_text'], klass:'dark', cap:0.12, palette:'deep-green duotone photo, ivory whisper line' },
  { id:'floated_card',      desc:'a small framed photo card floated on a solid field — friendly announcements, photo moments, events', suits:['photo_logo','event','texture_text'], klass:'light', cap:0.20, palette:'ivory field, one rounded photo card, coral accent' },
  { id:'quote_margin',      desc:'an attributed quote with generous margin — quotes, testimonials, values', suits:['quote'], klass:'dark', cap:0.14, palette:'deep-green field, ivory quote' },
  { id:'manifesto',         desc:'a short text-only paragraph, page-feel not billboard — mission, values, manifestos', suits:['text_post','quote'], klass:'light', cap:0.12, palette:'ivory field, serif body, one emphasis word' },
  { id:'documentary',       desc:'a single clean candid photo, minimal overlay — behind-the-scenes, photo moments', suits:['photo_logo','texture_text'], klass:'dark', cap:0.10, palette:'near-full-color candid, thin brand border' },
  { id:'label_headline',    desc:'a small all-caps eyebrow above a large serif headline — hiring, events, announcements', suits:['event','text_post','photo_logo'], klass:'light', cap:0.14, palette:'ivory field, tracked eyebrow + serif headline' },
  { id:'portrait_credential',desc:'a portrait beside a name/title/credential — staff spotlight, new-teacher, testimonial', suits:['photo_logo','event','quote'], klass:'light', cap:0.10, palette:'ivory field, portrait photo + credential stack' },
  { id:'motif_field',       desc:'a solid pastel field warmed by a few flat botanical/geometric motifs — playful values, enrollment', suits:['text_post','quote','event'], klass:'light', cap:0.14, palette:'soft pastel field, 2–3 flat motifs' },
  { id:'petal_window',      desc:'a photo revealed through the orchid/petal mask on a solid field — SIGNATURE, only when the user names the petal/orchid/shape', suits:['photo_logo','texture_text','quote'], klass:'light', cap:0.12, palette:'ivory field, one orchid-mask photo window' },
  // (R2 · composition-study-2 moods 7/10) shape-masked photo variant in the DEFAULT
  // rotation — unlike petal_window it is NOT decor-gated: a bold colour-block canvas
  // with the photo revealed through a large organic brand-shape cutout + one serif line.
  { id:'shape_cutout',      desc:'a bold colour-block canvas with the photo revealed through a large organic shape cutout, one serif line below — photo moments, announcements, brand warmth', suits:['photo_logo','texture_text','quote'], klass:'dark', cap:0.12, palette:'deep-green/sage/ivory colour block, one organic photo cutout, serif line' },
  // (R3 · composition-study-2 mood 3) message on a rounded pill card overlapping a
  // full-bleed photo's lower third — text keeps its own field, composition gains overlap.
  { id:'message_pill',      desc:'a full-bleed warm photo with the message on a rounded brand-colour pill card overlapping the lower third — quotes, warm announcements, community notes', suits:['quote','text_post','event'], klass:'light', cap:0.10, palette:'warm full-bleed photo, one ivory/green/butter message pill' },
  // ── FEED-GRAMMAR CARDS (feed-grammar §2) — brand-sequence tiles. brand/closing carry
  // the lockup (rare, ≤1-in-8); stat/cta/schedule carry no logo. Accent = the pill only.
  { id:'brand_card',        desc:'campaign opener: flower mark + THE WHITE ORCHID wordmark + italic tagline on a dark or butter field — brand statement, sequence opener', suits:['text_post'], klass:'dark', cap:0.08, palette:'deep-green or butter field, mark+wordmark lockup, italic tagline' },
  { id:'stat_tile',         desc:'a giant serif number/ratio ("1 : 6", "40") with an eyebrow + light caption on a celadon field — ratios, class size, numbers', suits:['event','text_post'], klass:'light', cap:0.08, palette:'celadon field, giant serif stat, light caption' },
  { id:'cta_card',          desc:'enrolment CTA: eyebrow + serif hero ("Now enrolling") + details block + tangerine pill — enrolment, sign-ups, deadlines', suits:['event','text_post'], klass:'light', cap:0.08, palette:'ivory field, serif hero, details, tangerine LIMITED PLACES pill' },
  { id:'closing_card',      desc:'campaign closer: centred mark + serif hero ("Come and see for yourself") + tangerine pill CTA + url on a dark field — the only centred archetype, sequence closer', suits:['text_post'], klass:'dark', cap:0.08, palette:'deep-green field, centred mark, serif hero, tangerine BOOK A VISIT pill' },
  { id:'schedule_tile',     desc:'a daily schedule: eyebrow ("A DAY HERE") + serif time rows + light activity lines separated by hairline rules on an ivory field — timetables, a day in the life', suits:['event','text_post'], klass:'light', cap:0.06, palette:'ivory field, serif times + light activities, hairline rules' },
];
const LANDING_ARCH_BY_ID = Object.fromEntries(LANDING_ARCHETYPES.map(a => [a.id, a]));
// (WP-P P3 / feed-grammar §1) FEED RHYTHM — photo-led vs solid-field tiles must
// ALTERNATE across the grid (the reference's checkerboard). Classify each archetype.
const PHOTO_LED = new Set([
  'editorial_split', 'full_bleed_duotone', 'floated_card', 'documentary',
  'portrait_credential', 'petal_window', 'shape_cutout', 'message_pill',
]);
const isPhotoLed = (id) => PHOTO_LED.has(id);
// petal_window is doubly gated: the DECOR intent gate (below) AND its ≤1-in-8 cap.
// It is never suggested in the rotation and never a cap-override fallback target.
// petal_window + the logo-bearing bookends (brand/closing) are never silent-fallback
// targets: they're signature/rare tiles the model must pick deliberately, not a filler.
const NON_FALLBACK = new Set(['petal_window', 'brand_card', 'closing_card']);
const CAP_SELECTABLE = LANDING_ARCHETYPES.filter(a => !NON_FALLBACK.has(a.id));

// Recent landing picks (last ~12) — a small in-memory ring so frequency caps are
// enforced DETERMINISTICALLY server-side. Stateless clients can't be trusted to
// vary; this shared ring across requests keeps petal ≤1-in-8, motif per spec, and
// the combined dark share at 25–30%. Bounded so it never grows unboundedly.
// (G1) DURABILITY: this ring is the in-memory CACHE + FALLBACK; its authoritative
// copy lives in Supabase `brand_rotation` (per brand_id). The landing finalize path
// hydrates it from cloud at the top of the turn and persists it after the pick, so
// rhythm/anti-repeat survives deploys and is shared across serverless instances
// (lib/rotation-state.js). No behaviour change to the cap/rhythm math — same
// thresholds, same functions; only the state is now durable.
const RECENT_PICKS = [];
const RECENT_MAX = 12;
function recordPick(id) {
  RECENT_PICKS.push(id);
  if (RECENT_PICKS.length > RECENT_MAX) RECENT_PICKS.shift();
}

// ── MEASURED PALETTE ROTATION (spec §3) ──────────────────────────────────────
// Mirror of the client ARCHETYPES[].variants palette classes (bg + class per index)
// — the server can't import the client component, so this table must stay in sync
// with Generator.jsx. Each entry: { bg, kind } where kind ∈ {ivory,pastel,dark}.
// Only the CLASS matters here (the client resolves exact ink/accent from the index).
const LANDING_VARIANTS = {
  serif_word:        [{bg:'whiteSmoke',kind:'ivory'},{bg:'butter',kind:'pastel'},{bg:'dustyPink',kind:'pastel'},{bg:'burnham',kind:'dark'}],
  editorial_split:   [{bg:'whiteSmoke',kind:'ivory'},{bg:'sage',kind:'pastel'},{bg:'burnham',kind:'dark'}],
  big_number:        [{bg:'whiteSmoke',kind:'ivory'},{bg:'sky',kind:'pastel'},{bg:'burnham',kind:'dark'}],
  full_bleed_duotone:[{bg:'burnham',kind:'dark'}],
  floated_card:      [{bg:'whiteSmoke',kind:'ivory'},{bg:'dustyPink',kind:'pastel'},{bg:'sky',kind:'pastel'},{bg:'sage',kind:'pastel'}],
  quote_margin:      [{bg:'burnham',kind:'dark'}],
  manifesto:         [{bg:'whiteSmoke',kind:'ivory'},{bg:'lilac',kind:'pastel'},{bg:'butter',kind:'pastel'}],
  documentary:       [{bg:'burnham',kind:'dark'},{bg:'whiteSmoke',kind:'ivory'}],
  label_headline:    [{bg:'whiteSmoke',kind:'ivory'},{bg:'sage',kind:'pastel'},{bg:'dustyPink',kind:'pastel'},{bg:'burnham',kind:'dark'}],
  portrait_credential:[{bg:'whiteSmoke',kind:'ivory'}], // no variants array client-side → base only
  motif_field:       [{bg:'whiteSmoke',kind:'ivory'},{bg:'butter',kind:'pastel'},{bg:'lilac',kind:'pastel'},{bg:'sky',kind:'pastel'}],
  petal_window:      [{bg:'whiteSmoke',kind:'ivory'},{bg:'terracotta',kind:'pastel'},{bg:'burnham',kind:'dark'}],
  shape_cutout:      [{bg:'burnham',kind:'dark'},{bg:'sage',kind:'pastel'},{bg:'whiteSmoke',kind:'ivory'},{bg:'dustyPink',kind:'pastel'}],
  message_pill:      [{bg:'whiteSmoke',kind:'ivory'},{bg:'burnham',kind:'dark'},{bg:'butter',kind:'pastel'},{bg:'celadon',kind:'pastel'}],
  brand_card:        [{bg:'burnham',kind:'dark'},{bg:'butter',kind:'pastel'}],
  stat_tile:         [{bg:'celadon',kind:'pastel'},{bg:'sage',kind:'pastel'}],
  cta_card:          [{bg:'whiteSmoke',kind:'ivory'}],
  closing_card:      [{bg:'burnham',kind:'dark'}],
  schedule_tile:     [{bg:'whiteSmoke',kind:'ivory'}],
};
// Recent variant KINDS chosen (parallel to RECENT_PICKS) so pastel-share (~1-in-3 of
// light picks) and dark-share (25–30%) are enforced deterministically across requests.
const RECENT_VKINDS = [];
function recordVKind(kind) {
  RECENT_VKINDS.push(kind);
  if (RECENT_VKINDS.length > RECENT_MAX) RECENT_VKINDS.shift();
}
// (P3 FEED RHYTHM) Track the last chosen bg id so two adjacent solid tiles never share
// the exact same field colour (feed-grammar §1: "no two adjacent solids share a palette").
let LAST_BG = null;
// Deterministically choose a sanctioned variant index for `id`, given the recent
// kind history. Rules (spec §3): dark share 25–30% (never 3 dark in a row); of the
// LIGHT picks, ~1-in-3 should be pastel. Falls back to base index 0.
// (item 11) Within a kind bucket, LIKED variants win the tie — the palette
// quotas + the no-adjacent-repeat rule stay supreme (rhythm before preference).
function pickVariant(id, prefs = emptyPreferences()) {
  const vs = LANDING_VARIANTS[id];
  if (!vs || vs.length <= 1) { recordVKind(vs?.[0]?.kind || 'ivory'); return 0; }
  const n = RECENT_VKINDS.length;
  const darkTail2 = RECENT_VKINDS.slice(-2).every(k => k === 'dark') && RECENT_VKINDS.length >= 2;
  const darkShare = n ? RECENT_VKINDS.filter(k => k === 'dark').length / n : 0;
  const lightCount = RECENT_VKINDS.filter(k => k !== 'dark').length;
  const pastelCount = RECENT_VKINDS.filter(k => k === 'pastel').length;
  const pastelShareOfLight = lightCount ? pastelCount / lightCount : 0;
  const wantDark = vs.some(v => v.kind === 'dark') && !darkTail2 && darkShare < 0.27;
  const wantPastel = vs.some(v => v.kind === 'pastel') && pastelShareOfLight < 0.34;
  // Priority: fill the dark quota when under target, else the pastel quota, else ivory.
  const order = wantDark ? ['dark','pastel','ivory'] : wantPastel ? ['pastel','ivory','dark'] : ['ivory','pastel','dark'];
  let idx = 0;
  for (const kind of order) {
    // (P3) no-adjacent-repeat: skip a candidate whose bg equals the last tile's bg,
    // preferring another variant of the same kind when one exists.
    const cands = vs.map((v, i) => ({ v, i }))
      .filter(o => o.v.kind === kind)
      // (item 11) like-weighted tie-break inside the kind bucket.
      .sort((a, b) => likeCountFor(prefs, 'archVariant', `${id}#${b.i}`) - likeCountFor(prefs, 'archVariant', `${id}#${a.i}`));
    const nonRepeat = cands.find(o => o.v.bg !== LAST_BG);
    const chosen = nonRepeat || cands[0];
    if (chosen) { idx = chosen.i; break; }
  }
  recordVKind(vs[idx].kind);
  LAST_BG = vs[idx].bg;
  return idx;
}
// Would adding `id` to the recent ring exceed its per-archetype cap OR the combined
// dark-class share cap (spec §3: 25–30% dark, hard "never 3+ dark in a row")?
function exceedsCap(id) {
  const arch = LANDING_ARCH_BY_ID[id];
  if (!arch) return false;
  const window = [...RECENT_PICKS, id];
  const n = window.length;
  // Per-archetype cap: its share of the window must not exceed cap (with a small
  // floor so early requests aren't blocked by a tiny denominator).
  const own = window.filter(x => x === id).length;
  if (n >= 4 && own / n > arch.cap + 1e-6) return true;
  // Dark-class share cap: 30% ceiling, and never 3 dark in a row.
  if (arch.klass === 'dark') {
    const darkTail = RECENT_PICKS.slice(-2).every(x => LANDING_ARCH_BY_ID[x]?.klass === 'dark');
    if (RECENT_PICKS.length >= 2 && darkTail) return true; // this would be the 3rd dark in a row
    const darkShare = window.filter(x => LANDING_ARCH_BY_ID[x]?.klass === 'dark').length / n;
    if (n >= 4 && darkShare > 0.32) return true;
  }
  return false;
}
// Deterministically resolve the FINAL archetype for a landing plan, honouring caps.
// `picked` is the model's choice; `intent` is a suits[] tag guessed from the user's
// message. If the pick busts a cap, silently override to the next suited archetype
// that doesn't (preferring one matching the same intent), then the first that fits.
function resolveLandingArchetype(picked, intent, prefs = emptyPreferences()) {
  const valid = picked && LANDING_ARCH_BY_ID[picked] ? picked : null;
  // petal_window is only allowed when explicitly named (handled by the caller's
  // DECOR gate); if it reached here it's already been vetted, so respect its cap too.
  if (valid && !exceedsCap(valid)) return valid;
  // (P3 FEED RHYTHM) Prefer a fallback whose photo-led/solid class ALTERNATES off the
  // last pick, so the resulting grid keeps the reference's checkerboard rather than
  // clustering photos or solids. Applied as a soft sort key over the cap-clear pool.
  const lastId = RECENT_PICKS[RECENT_PICKS.length - 1];
  const wantPhotoLed = lastId ? !isPhotoLed(lastId) : false; // alternate off the last led-class
  const rank = (a) => (isPhotoLed(a.id) === wantPhotoLed ? 0 : 1); // 0 = preferred alternation
  // (item 11) Within the SAME rhythm rank, the owner's liked archetypes win —
  // rhythm + caps stay supreme, preference only breaks the tie.
  const cmp = (x, y) => (rank(x) - rank(y))
    || (likeCountFor(prefs, 'archetypeId', y.id) - likeCountFor(prefs, 'archetypeId', x.id));
  // Override: prefer a same-intent, cap-clear archetype; else any cap-clear one — with
  // alternation (then likes) as the tie-breaker within each group.
  const bySuit = CAP_SELECTABLE.filter(a => a.id !== picked && (!intent || a.suits.includes(intent)) && !exceedsCap(a.id)).sort(cmp);
  const any = CAP_SELECTABLE.filter(a => a.id !== picked && !exceedsCap(a.id)).sort(cmp);
  return (bySuit[0] || any[0] || CAP_SELECTABLE[0]).id;
}
// Guess a coarse intent tag from the user's landing message, to route the cap
// override toward a sensible fallback. Mirrors the model's own routing hints.
function guessIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(quote|saying|proverb|“|"|said)\b/.test(t)) return 'quote';
  if (/\b(hiring|hire|join our team|vacancy|role|educator|teacher wanted|apply)\b/.test(t)) return 'text_post';
  if (/\b(open house|term|enrol|enroll|sports day|date|deadline|\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/.test(t)) return 'event';
  if (/\b(photo|picture|image|moment|snapshot|candid)\b/.test(t)) return 'photo_logo';
  return 'text_post';
}
// Suggested archetype + palette-class hint for THIS request. Samples the
// cap-clear, non-petal set so successive requests diverge.
// (Photo-first) For a non-text-only brief the nudge rotates over the PHOTO-LED pool
// only, so the soft suggestion never steers a landing plan back to a solid tile.
// (item 11) PREFERENCE-WEIGHTED: sampling weights = 1 + like-count per archetype
// gene, with a DIVERSITY FLOOR (no archetype may take >40% of the probability
// mass). Rhythm stays supreme — the pool is cap/rhythm-filtered BEFORE weighting.
function pickLandingArchetypeHint(textOnly, prefs = emptyPreferences()) {
  const base = textOnly ? CAP_SELECTABLE : CAP_SELECTABLE.filter(a => PHOTO_LED.has(a.id));
  const pool = base.filter(a => !exceedsCap(a.id));
  const list = pool.length ? pool : (base.length ? base : CAP_SELECTABLE);
  const id = weightedPick(list.map(a => a.id), prefs, 'archetypeId', { maxShare: 0.4 }) || list[0].id;
  const a = LANDING_ARCH_BY_ID[id] || list[0];
  return `${a.id} (${a.desc}) — palette: ${a.palette}`;
}
// Compact catalog block for the system prompt (id · desc · suits · class).
function landingArchetypeCatalog() {
  return LANDING_ARCHETYPES
    .map(a => `- ${a.id} [${a.klass}] — ${a.desc}. Suits: ${a.suits.join(', ')}.`)
    .join('\n');
}

// ── CAPTION WRITER (context:"caption") ───────────────────────────────────────
// A second, self-contained mode on this route: given the current design state +
// the platform implied by dimensionId, write a ready-to-post caption, a short
// hashtag set, and an accessibility alt-text. Strict json_schema so the client
// never has to parse prose. Hashtags are stored WITHOUT the leading '#' and the
// client renders them with it (single source of truth — no double-# bugs).
const CAPTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    altText: { type: 'string' },
  },
  required: ['caption', 'hashtags', 'altText'],
};

// dimensionId → platform + its caption conventions. The active format tells us
// where the post is going, so we tailor length + hashtag habits accordingly.
function platformForDimension(dimensionId) {
  switch (dimensionId) {
    case 'twitter':
      return {
        key: 'x',
        label: 'X (Twitter)',
        rules: 'X / Twitter: the WHOLE post (caption + hashtags together) MUST be 280 characters or fewer — count them. One clear thought, warm and human. 1–3 hashtags at most, folded naturally at the end.',
      };
    case 'facebook':
      return {
        key: 'facebook',
        label: 'Facebook',
        rules: 'Facebook: conversational and friendly, 1–3 short sentences. 0–3 hashtags, only if they add something. No wall of tags.',
      };
    case 'banner':
      return {
        key: 'generic',
        label: 'website / banner',
        rules: 'Website / banner (generic): ONE clean, welcoming sentence. NO hashtags at all — return an empty hashtags array.',
      };
    default:
      // ig_square / ig_portrait / story
      return {
        key: 'instagram',
        label: 'Instagram',
        rules: 'Instagram: 1–3 short, warm paragraphs. Put a blank line before the hashtags. 4–8 relevant hashtags on the final line.',
      };
  }
}

// Copy fields may carry *emphasis* markers (the engine's italic notation) — strip
// them so the caption writer never echoes literal asterisks into a post caption.
function stripEmphasisMarkers(s) {
  return String(s || '').replace(/\*([^*]+)\*/g, '$1');
}

// ── TONE SCRUB (brand voice, spec §0) ────────────────────────────────────────
// The brand never exclaims. Prompt rules reduce it, but the model still slips
// ("Join Us for Our Open House!") — so exclamation marks are scrubbed
// deterministically from every model-written copy field: sentence-ending "!"
// becomes ".", mid-sentence "!" is dropped. Idempotent, whitespace-tidy.
function toneScrub(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/!+(\s|$)/g, '.$1')  // end-of-clause bangs → a calm period
    .replace(/!+/g, '')            // any leftovers (mid-word decorations) vanish
    .replace(/\.{2,}/g, '.')       // "!." pile-ups collapse
    .replace(/\s+([.,])/g, '$1');
}
// Fields the scrub applies to — every user-visible copy surface in a patch.
const TONE_FIELDS = ['headline', 'subtext', 'attribution', 'dateText'];
function toneScrubPatch(patch) {
  if (!patch || typeof patch !== 'object') return patch;
  for (const f of TONE_FIELDS) if (typeof patch[f] === 'string') patch[f] = toneScrub(patch[f]);
  return patch;
}

function captionSourceFacts(d) {
  const facts = [];
  if (d.headline) facts.push(`Headline: ${stripEmphasisMarkers(d.headline)}`);
  if (d.subtext) facts.push(`Subtext: ${stripEmphasisMarkers(d.subtext)}`);
  if (d.attribution) facts.push(`Attribution/quote source: ${stripEmphasisMarkers(d.attribution)}`);
  if (d.dateText) facts.push(`Date on the design: ${stripEmphasisMarkers(d.dateText)}`);
  facts.push(`Post type: ${d.postType || 'text_post'}`);
  facts.push(`Has a photo/video: ${d.hasImage ? 'yes' : 'no'}`);
  return facts.join('\n');
}

async function handleCaption({ apiKey, designState, brandContext, model, rewriteNudge }) {
  const platform = platformForDimension(designState.dimensionId);
  const hasCopy = !!(designState.headline || designState.subtext || designState.attribution || designState.dateText);

  const systemPrompt = `You are the social copywriter for ${brandContext.name}, a Singaporean preschool / early-education brand for young families. You write the post caption that a staff member will publish alongside a design they just made.

Brand voice: ${brandContext.tone}. Warm, plain-English, parent-facing, gently reassuring, never salesy, never corporate. NEVER use exclamation marks — calm sentence case throughout. Singapore preschool context (write for local parents; British/Singapore English is fine).

Write for this platform — follow its conventions exactly:
${platform.rules}

Use the design's ACTUAL copy as your source of facts. NEVER invent dates, prices, claims, offers, statistics, testimonials, or event details that are not present below. If a date appears in the design, you may mention it; if none is given, do not make one up.
${designState.copyBudget ? `\nThe on-canvas copy slots hold about: headline ${designState.copyBudget.headline}, caption ${designState.copyBudget.subtext}, attribution ${designState.copyBudget.attribution} characters. Any copy you echo onto the design itself must fit within these; the off-post caption you write here follows the platform length rules above.\n` : ''}
${hasCopy
  ? 'This design has copy — build the caption around it faithfully.'
  : 'This design has NO copy (photo-led). Write sparingly from the post type and the fact that there is an image — a warm, simple line or two. Do not invent specifics.'}

Design facts:
${captionSourceFacts(designState)}
${rewriteNudge ? `\nThis is a REWRITE — produce a genuinely different angle/wording from a typical first draft (fresh opening, different rhythm). Keep the same facts.` : ''}

Return JSON matching the schema: { caption, hashtags, altText }.
- caption: the post text, ready to paste. Respect the platform length rules above (for X, the caption PLUS hashtags together must be ≤ 280 characters).
- hashtags: an array of tags WITHOUT the leading '#'. Lowercase or CamelCase, no spaces, relevant to a Singapore preschool. Follow the platform's count guidance (empty array for website/banner).
- altText: ONE plain sentence describing the image for a screen-reader user (accessibility). If there is no photo, describe the design (e.g. "A text-based announcement card in the brand's colours.").

Brand context: ${JSON.stringify(brandContext)}`;

  const isReasoning = /^(o\d|gpt-5)/i.test(model);
  const payload = {
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
      { role: 'user', content: [{ type: 'input_text', text: rewriteNudge ? 'Write a fresh caption for this design.' : 'Write the caption for this design.' }] },
    ],
    text: { format: { type: 'json_schema', name: 'social_caption', strict: true, schema: CAPTION_JSON_SCHEMA } },
  };
  if (isReasoning) payload.reasoning = { effort: 'low' };

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return Response.json({ error: "I couldn't reach the AI service. Please try again in a moment." }, { status: 502 });
  }
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = result?.error?.message || res.statusText;
    console.error('OpenAI caption error:', reason);
    return Response.json({ error: 'I ran into a problem writing that. Please try again.', detail: reason }, { status: 502 });
  }
  let parsed;
  try { parsed = JSON.parse(getOutputText(result)); } catch { parsed = null; }
  let caption = typeof parsed?.caption === 'string' ? toneScrub(parsed.caption.trim()) : '';
  let hashtags = Array.isArray(parsed?.hashtags)
    ? parsed.hashtags.map(t => String(t || '').replace(/^#+/, '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const altText = typeof parsed?.altText === 'string' ? parsed.altText.trim() : '';
  if (!caption) {
    return Response.json({ error: 'That came back empty. Please try again.' }, { status: 502 });
  }

  // Hard guard for X: enforce the 280-char ceiling server-side (caption + tags).
  // The model is told, but we never want to hand staff an over-limit post. Trim
  // hashtags first, then the caption tail, keeping whole words.
  if (platform.key === 'x') {
    const withTags = () => (hashtags.length ? `${caption}\n\n${hashtags.map(t => `#${t}`).join(' ')}` : caption);
    while (withTags().length > 280 && hashtags.length) hashtags.pop();
    if (withTags().length > 280) {
      const budget = 280 - (hashtags.length ? hashtags.map(t => `#${t}`).join(' ').length + 2 : 0);
      caption = caption.slice(0, Math.max(0, budget - 1)).replace(/\s+\S*$/, '').trim() + '…';
    }
  }

  return Response.json({ caption, hashtags, altText, platform: platform.key, platformLabel: platform.label });
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

// (B1) The design_patch schema streams `reply` FIRST (it's the first required
// property and OpenAI emits strict-schema keys in order), so as the JSON grows we
// can pull the reply string out progressively and render it token-by-token — the
// patch is only parsed/applied once the whole object is complete (atomic). This
// tolerant extractor reads the value of the top-level "reply" key from a partial
// JSON string, handling escapes; returns '' until the key's opening quote arrives.
function extractPartialReply(partial) {
  const keyIdx = partial.indexOf('"reply"');
  if (keyIdx < 0) return '';
  // Find the colon, then the opening quote of the value.
  let i = partial.indexOf(':', keyIdx + 7);
  if (i < 0) return '';
  i++;
  while (i < partial.length && /\s/.test(partial[i])) i++;
  if (partial[i] !== '"') return '';
  i++; // past opening quote
  let out = '';
  while (i < partial.length) {
    const ch = partial[i];
    if (ch === '\\') {
      const next = partial[i + 1];
      if (next === undefined) break; // escape split across chunks — stop here, resume next chunk
      if (next === 'n') out += '\n';
      else if (next === 't') out += '\t';
      else if (next === 'r') out += '\r';
      else if (next === '"') out += '"';
      else if (next === '\\') out += '\\';
      else if (next === '/') out += '/';
      else if (next === 'u') { out += partial.slice(i, i + 6) && ''; /* unicode: emit on final parse */ }
      else out += next;
      i += 2;
      continue;
    }
    if (ch === '"') break; // closing quote — reply value complete
    out += ch;
    i++;
  }
  return out;
}

// (B1) Call the OpenAI Responses API with streaming. Parses the SSE event stream,
// invokes onReplyDelta(newReplyText) as the `reply` field grows, and resolves with
// { ok, text, status, reason }. `text` is the full accumulated output JSON (parsed
// by the caller exactly like the non-streaming path). Never throws — network errors
// resolve { ok:false }.
async function streamOpenAI(apiKey, payload, onReplyDelta) {
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, stream: true }),
    });
  } catch {
    return { ok: false, text: '', status: 502, reason: 'network' };
  }
  if (!res.ok || !res.body) {
    let reason = res.statusText;
    try { const j = await res.json(); reason = j?.error?.message || reason; } catch { /* ignore */ }
    return { ok: false, text: '', status: res.status || 502, reason };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', full = '', lastReply = '';
  const pump = (raw) => {
    buffer += raw;
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const evt of events) {
      const dataLine = evt.split('\n').find(l => l.startsWith('data:'));
      if (!dataLine) continue;
      const data = dataLine.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let json; try { json = JSON.parse(data); } catch { continue; }
      // Responses API streaming: text deltas arrive as response.output_text.delta.
      if (json.type === 'response.output_text.delta' && typeof json.delta === 'string') {
        full += json.delta;
        const reply = extractPartialReply(full);
        if (reply && reply.length > lastReply.length) {
          const added = reply.slice(lastReply.length);
          lastReply = reply;
          try { onReplyDelta(added, reply); } catch { /* ignore */ }
        }
      } else if (json.type === 'response.output_text.done' && typeof json.text === 'string') {
        full = json.text; // authoritative final text
      } else if (json.type === 'response.completed' && json.response) {
        const t = getOutputText(json.response);
        if (t) full = t;
      }
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pump(decoder.decode(value, { stream: true }));
    }
  } catch {
    return { ok: false, text: full, status: 502, reason: 'stream-interrupted' };
  }
  return { ok: true, text: full, status: 200 };
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
    postType, archetypeId, dimensionId, bgColor, textColorId, backdropMode,
    headline, subtext, attribution, dateText,
    selectedLogoId, logoPosition, logoSize, fontSizes,
  } = raw;
  const overlays = Array.isArray(raw.overlayLayers)
    ? raw.overlayLayers.map(l => ({ assetId: l.assetId, mode: l.mode || 'frame' }))
    : [];
  return {
    postType, archetypeId: archetypeId ?? null, dimensionId, bgColor, textColorId, backdropMode,
    headline, subtext, attribution, dateText,
    // (WP-V) eyebrow + pill presence so the model can add/edit/remove them.
    microLabel: raw.microLabel ?? null, pillText: raw.pillText ?? null,
    logoId: selectedLogoId, logoPosition, logoSize,
    fontSizes: fontSizes || undefined,
    overlays,
    hasImage: !!raw.hasImage,
    // On a materialized archetype the VISIBLE solid field is the override (or the
    // palette variant), NOT bgColor. When the client sends fieldColorOverride the
    // colour/mood belts compare against IT so a repeat colour ask doesn't no-op
    // (setting fieldColor to a value it already has). Optional / may be absent.
    fieldColor: (typeof raw.fieldColorOverride === 'string' && raw.fieldColorOverride) ? raw.fieldColorOverride : null,
    // (copy-fit Tier 1) The client's measured per-role character budget for the ACTIVE
    // archetype × format, so the copy-writing prompts below can inject it and generated
    // copy fits the slot by construction. Absent on the landing flow (no design yet).
    copyBudget: (raw.copyBudget && typeof raw.copyBudget === 'object') ? raw.copyBudget : null,
    // (Amendment 2026-07-27 ruling 2 — class-exclusive adds) The element classes already
    // IN USE on the design (filled legacy-role projections + added elements — one system),
    // so the add-element belt and the model prompt can refuse a duplicate class honestly
    // instead of silently no-oping in the reducer (M2). Sanitized to the closed enum.
    elementClasses: Array.isArray(raw.elementClasses)
      ? raw.elementClasses.filter(c => ELEMENT_CLASSES.includes(c))
      : [],
    // (task #59 — solver-verified layout switch) The client's pre-verified rotation
    // verdict for a variety ask. PRESENCE carries meaning (id = verified pick; null =
    // "checked, none fits" → the belt answers honestly; absent = legacy client → the
    // blind-ring fallback), so the key is forwarded only when the client sent it.
    ...(Object.prototype.hasOwnProperty.call(raw, 'verifiedLayoutCandidate')
      ? { verifiedLayoutCandidate: typeof raw.verifiedLayoutCandidate === 'string' ? raw.verifiedLayoutCandidate : null }
      : {}),
  };
}

// (copy-fit Tier 1) A human-readable budget block for the copy-writing prompts. Names
// the character ceiling of each on-canvas slot so the model writes within it; copy that
// still runs over is silently fitted (AI copy) or offered a one-tap tighten (owner copy).
function copyBudgetBlock(b){
  if(!b || typeof b !== 'object') return '';
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  return `FIT THE SLOT (character budgets for the CURRENT layout + format — write copy that fits by construction; copy longer than this is tightened to fit, so be concise):
- headline ≤ ${n(b.headline,48)} characters
- subtext / caption ≤ ${n(b.subtext,120)} characters
- attribution ≤ ${n(b.attribution,64)} characters
- eyebrow (microLabel) ≤ ${n(b.microLabel,28)} characters`;
}

export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'One moment — that was a lot of requests. Please wait a few seconds and try again.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const context = ['landing', 'caption'].includes(body.context) ? body.context : 'editor';
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

  // Caption mode works from the design state, not a conversation — skip the
  // "tell me what you want" guard that the chat contexts need.
  if (context !== 'caption' && !messages.length) {
    return Response.json({ error: 'Tell me a little about what you want to create.' }, { status: 400 });
  }

  // ── DESIGN POLISH BELT (docs/design-polish-spec.md) ─────────────────────────
  // A whole-design "polish / clean this up / make it better" ask routes to the
  // client's deterministic Polish pass — the SAME action as the Polish button —
  // and short-circuits BEFORE the model call and before the key gate: the pass
  // runs its deterministic stages client-side and makes its own single audited
  // AI call (money law: no wasted chat-model spend routing a deterministic
  // gesture), and stages 1–3 stay fully available with no OPENAI_API_KEY at all.
  // Present tense — the pass reports its own honest, changedPaths-backed summary
  // when it completes, so nothing is claimed here that hasn't happened yet.
  if (context === 'editor') {
    const polishAskText = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    if (detectPolishRequest(polishAskText)) {
      const polishReply = "Running a full polish pass now — I'll tighten contrast and readability, clear any clutter, rebalance the composition, then list exactly what changed. One tap of Undo restores everything.";
      const polishPayload = { reply: polishReply, patch: {}, imageB64: null, polish: true };
      if (body.stream === true) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const send = (obj) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* closed */ } };
            send({ type: 'reply_delta', text: polishReply });
            send({ type: 'done', ...polishPayload });
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
        });
      }
      return Response.json(polishPayload);
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI isn't set up yet. You can still use the studio — everything works without it." }, { status: 503 });
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
    name: brandKit?.name || DEFAULT_BRAND_NAME,
    assistantName: brandKit?.assistant_name || DEFAULT_ASSISTANT_NAME,
    tone: brandKit?.tone || DEFAULT_TONE,
    voiceRules: brandKit?.voice_rules || DEFAULT_VOICE_RULES,
    colors: (brandKit?.colors || []).map(({ label, hex }) => ({ label, hex })),
    guardrails: brandKit?.guardrails || [],
  };

  const model = process.env.OPENAI_ART_DIRECTOR_MODEL || 'gpt-4o-mini';

  // ── CAPTION MODE ── generate a post caption + hashtags + alt-text from the
  // current design and its platform, then return early (no design-patch path).
  if (context === 'caption') {
    return handleCaption({ apiKey, designState, brandContext, model, rewriteNudge: !!body.rewrite });
  }

  // (items 11 + 12) The owner's LIKE aggregate — weighted rotation + house-style
  // exemplars. Cached ~1h server-side; degrades to the empty aggregate on any
  // failure so nothing here can slow or break a turn.
  const likePrefs = await getLikePreferences();

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

  const landingUserText = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const landingTextOnly = wantsTextOnly(landingUserText);
  const landingArchetypeHint = pickLandingArchetypeHint(landingTextOnly, likePrefs);
  const contextRule = context === 'landing'
    ? `This is the FIRST message from a new user on the landing page. They have no design yet. Produce a COMPLETE, ready-to-edit starting composition: set an ARCHETYPE (archetypeId), postType, dimensionId, bgColor, a suitable logoId + logoPosition + logoSize, and any copy fields (headline/subtext/attribution/dateText) that the request clearly supports. Do not leave it minimal.

ARCHETYPE — REQUIRED. You MUST set patch.archetypeId to one of these editorial compositions, chosen by the request's INTENT:
${landingArchetypeCatalog()}
PHOTO-FIRST (default): a standalone post leads with PHOTOGRAPHY. Unless the request is explicitly TEXT-ONLY (a quote, saying, manifesto, mission or values wording), pick a PHOTO-LED archetype (editorial_split, full_bleed_duotone, floated_card, documentary, portrait_credential) and ALWAYS write patch.scenePrompt. Solid-field tiles (big_number, stat_tile, label_headline, serif_word, manifesto, motif_field, cta_card, schedule_tile, brand_card, closing_card) belong to feed sequences and later variations — never the first answer for an everyday brief.
Routing hints (choose the best fit, not always the same one):
- a quote / saying / proverb / mission / values / manifesto (TEXT-ONLY briefs) → quote_margin, serif_word, or manifesto
- a dated event (open house, term start, sports day, deadline) → editorial_split (photo beside a PROMINENT date) or full_bleed_duotone (date overlaid on the photo); also floated_card. Put the date in dateText — the engine renders it large.
- hiring / a role → editorial_split or portrait_credential
- a photo moment / behind-the-scenes → documentary, floated_card, or full_bleed_duotone
- an announcement / a welcome / general news → floated_card or editorial_split
- petal_window ONLY when the user explicitly names the petal / orchid / shape / frame — otherwise NEVER pick it.
SUGGESTED for THIS request (a soft nudge for variety — override only if intent clearly points elsewhere): ${landingArchetypeHint}.

VARIETY (important — the studio has felt repetitive):
- CHOOSE the postType, bgColor and dimensionId that best fit the REQUEST'S INTENT, and vary them meaningfully between requests. DEFAULT dimensionId to "ig_portrait" (Instagram's preferred 4:5 feed ratio) unless the request clearly points to another format (a website/email banner → "banner"; a Twitter/X post → "twitter"; a story/reel → "story"; a square is fine only when the brief itself calls for a square tile). Let the archetype's palette guide the bgColor (an archetype seeds its own field colour, so you can leave bgColor null to accept it, or set one that suits).
  - A quote / saying → "quote" type. A hiring / announcement / reminder → "text_post" or "event". A dated happening → "event". A photo-led moment → "photo_logo" or "texture_text".
- OVERLAYS / FRAMES: NEVER add an overlay (addOverlay) unless the user explicitly names the treatment — "frame", "petal", "orchid shape", "cut-out", "overlay". An invite, open house, celebration or festive post is NOT a reason to add one. Default is always NO overlay.
- AESTHETIC: default to CLEAN and HIGH-CONTRAST. Generous breathing room: short copy, no more fields filled than the request needs. One focal idea per design.
- COPY LENGTH (important — long copy renders tiny and becomes unreadable as a feed thumbnail): keep the headline to ~6 words or fewer, and any caption/subtext to ONE short line (~14 words / ~110 characters max). Do not write a paragraph. If the request implies more detail, pick the single most important line and leave the rest out.
- FIT THE SLOT (character budgets — write copy that fits by construction; anything longer is tightened to fit): headline ≤ ${LANDING_COPY_MAX.headline} characters, subtext / caption ≤ ${LANDING_COPY_MAX.subtext} characters, attribution ≤ ${LANDING_COPY_MAX.attribution} characters, dateText ≤ ${LANDING_COPY_MAX.dateText} characters.

PHOTO (scenePrompt) — REQUIRED for every plan except an explicitly text-only brief. When the chosen archetype is PHOTO-LED (editorial_split, floated_card, documentary, full_bleed_duotone, portrait_credential, texture_text / photo_logo post types), write patch.scenePrompt: a PHOTOGRAPHER'S brief for the background photo. Follow this template EXACTLY and keep it to 1–2 sentences:
  • ONE scene, ONE subject with a concrete action, a setting, and lighting.
  • The subject is an average ~10-year-old Asian child (or a small still-life of plants/objects) in a bright, calm early-education setting.
  • Example shape (do NOT copy verbatim — fit it to the request): "an average ten-year-old Asian child painting with watercolours at a pale oak table, absorbed and quietly happy, bright soft natural daylight".
  • HARD RULE: scenePrompt must contain NO brand name, NO tagline, NO copy, and NO design/layout words (never "poster", "text", "headline", "logo", "caption", "Instagram", "White Orchid"). It describes only a real photograph. The studio adds the grade, camera and "no text" rules itself.
  • Leave scenePrompt NULL for text-only archetypes (serif_word, manifesto, quote_margin, motif_field, stat_tile, brand_card, closing_card, schedule_tile) — those are solid-field designs with no photo.`
    : `This is an ongoing edit inside the studio. Change ONLY the fields the user asked about — send a minimal patch. Leave everything else untouched (omit it from the patch).
${designState.copyBudget ? `\n${copyBudgetBlock(designState.copyBudget)}\nWhenever you write or rewrite a copy field, keep it within this budget for the design's current layout + format.\n` : ''}
ARCHETYPE (layout): only set patch.archetypeId when the user asks for a LAYOUT or STYLE change — "make it a poster", "try a different layout", "make it a quote card", "use the split layout", "turn this into a big date". In that case pick a DIFFERENT suited archetype than the current one. For a plain copy/colour/logo tweak, leave archetypeId null (do not change the layout). Available archetype ids: ${LANDING_ARCHETYPES.map(a => a.id).join(', ')}.

LAYOUT INTENT MAPPINGS (learned from real client sessions — follow these EXACTLY):
- "full image post" / "I want the photo to fill the whole post" / "full bleed" / "edge to edge" → set patch.archetypeId = "documentary" (one clean photo filling the whole frame). Use "full_bleed_duotone" instead ONLY when they ask for the tinted / green / duotone / moody look. Do NOT touch headline or backdropMode for this ask.
- "remove the green solid" / "remove the panel / the green block / the coloured band" on a split layout (editorial_split, portrait_credential): that solid side panel IS the layout itself — no backdrop, overlay or logo field can remove it. The ONLY correct patch is a layout switch: set patch.archetypeId = "documentary" (or "full_bleed_duotone" for the tinted look) so the photo fills the frame. NEVER answer this with backdropMode / removeOverlays / logo changes.
- "change the photo to X" / "different picture of X" / "swap the image for X" / "the picture doesn't fit our vibe" → set patch.imagePrompt to a concise description of the scene (no brand name, no text-in-image). This GENERATES a new photo — it does not land instantly, so narrate in PRESENT/FUTURE tense ("Generating a new photo of X now…"), NEVER past tense ("I've changed the photo"), because the image arrives a moment later. If the user did NOT name what the new photo should show, do NOT invent a scene — ask them what they'd like it to show and mention they can tap the photo on the canvas to reframe it. This is distinct from "fill the whole thing" (a LAYOUT ask — see above).
- Never say you changed or switched the layout unless patch.archetypeId is actually set to a NEW value in THIS patch. If you cannot express what was asked, say so plainly ("I can't do that yet") and offer the nearest thing you CAN do.
- If the user asks to ADD an element the current layout cannot show, say which layout can show it and offer to switch — never claim an add that will not render.
- NEVER OFFER WHAT YOU CAN'T EXECUTE. Do NOT end a reply with an open offer you can't carry out on your own — no "Want me to switch the layout?", "Shall I…?", "Would you like me to…?". You emit ONE patch per turn; you cannot act on a later "yes" yourself. Either DO the thing now (set the patch and describe it) or, when you genuinely can't, state the concrete action the USER can take in their own words ("Tap the ‘Try another layout’ chip", "Tap the element on the canvas to edit it"). The studio wires its OWN one-tap offers where a deterministic action exists; your job is to never dangle an offer with nothing behind it.
- "move the logo to the centre / middle" → logoPosition "center" (the true middle of the canvas), NOT "bottom-center". Only say "bottom" when the user says bottom.
- The logo CAN always be placed at any 9-grid position on ANY layout via logoPosition — never claim a layout can't hold the logo, and never offer a layout switch for a logo move.
- "remove the logo" / "take the logo off" / "hide the logo" / "no logo" → hideLogo true. "add the logo back" / "put the logo back" / "bring back the logo" / "show the logo again" → hideLogo false. This is always supported on any design; never claim you can't remove or restore the logo.
- "change the shape" / "a different petal" / "swap this shape" (a petal/shape overlay is already placed — see designState.overlays): set removeOverlays true AND addOverlay with a DIFFERENT shape asset than the one placed (petal-brand — the brand petal, shape-1, shape-2, shape-3), keeping the same mode. This IS supported — never claim you can't swap a shape.
- CONSISTENCY RULE: if you set ANY patch field, your reply must describe that change. NEVER say "I can't do that" while also emitting a patch — if something truly isn't possible, leave every patch field null and say so.

SIMPLE EDITS — ALWAYS RESOLVE TO A REAL PATCH (never a "that changed nothing" reply). The user is a fluent PROMPTER, not a designer; these everyday asks must Just Work. Follow these few-shots EXACTLY:
- TEXT SUBSTITUTION — "the headline shud say Open House not open day" / "change the title to Open House" / "it should say Welcome Week" → set patch.headline = "Open House" (the NEW text; drop the "not …" part). "the caption should say pickup is at 2:30" → patch.subtext. Reply names it: "Updated the headline to 'Open House'."
- COLOUR WORDS — map any colour the user names to the NEAREST bgColor token and SET IT (never refuse): mauve/lilac/plum/purple → wisteria (or lilac); "that mauve one" → wisteria; blush/rose/pink → dustyPink; cream/butter/pale yellow → butter; blue/sky/powder → sky; sage/mint/soft green → sage or celadon; terracotta/rust/clay → terracotta; ivory/white → whiteSmoke; forest/deep green → burnham; black/charcoal → jet. "make the background wisteria" → bgColor="wisteria". "more of a terracotta vibe" → bgColor="terracotta". Reply: "Changed the background to mauve."
- MOOD / FEEL asks map to a DEFINED recipe (a real visible change, then say what you did):
    • "make it warmer" / "cosier" → a warm field (butter or terracotta) + warmGrade photo treatment. Reply: "Warmed it up — a soft butter field and a warm photo grade."
    • "softer" / "gentler" → a soft field (dustyPink or lilac) + cleanGrain treatment.
    • "make it cuter / sweeter" → dustyPink field + a friendlier tone.
    • "make it pop / it looks boring / make it more interesting" → a bolder field (terracotta or wisteria) + a punchier treatment.
    • "make it more fun for the kids" → a brighter field (butter/sky) + a livelier treatment.
    • "cooler / fresher" → sky or sage field.
  Pick a token that DIFFERS from the current background so something actually changes, and describe the change plainly.
- SIZE — "make the title bigger" → fontSizes.heading one step up (e.g. m → l). "make the title smaller" → one step down. "make the caption bigger" → fontSizes.content up. Reply: "Made the title bigger."
NEVER answer any of the above with "I can't do that" or a bare apology — there is always a nearest brand token / recipe. Set the field, then honestly narrate exactly what you changed.

VOCABULARY-FREE ADDING (WP-V §3.3): the user is not a designer — they describe elements by what they LOOK like, not by design terms. Map their words to the right field, and it must Just Work:
- "small text at the bottom / under the title / a little caption / a note that says …" → subtext
- "small label at the top / little caps text / the tiny heading above" → microLabel
- "a button / a tag / a badge / one of those pill things" → pillText
- "the date / when it is" → dateText (only a date the user actually supplied)
- "the big text / the title / the main words" → headline
TEACH THE TERM BACK: when you add or change a mapped element, your reply gently names it once so the user learns the word — e.g. "Added that as a caption — the small text under your headline. Tap it anytime to edit." or "That's the eyebrow — the little label up top. Done." Keep it warm, one sentence, never lecture.
ADDING A NEW, EXTRA ELEMENT (spec §5): when the user wants an ADDITIONAL piece of text beyond the built-in roles — "add a caption saying …", "add a heading/subheading/body line saying …", "add a button/CTA saying …", "put another line that says …" — use patch.addTextElement { class, text }. Choose the class by what they describe: a headline-style line → heading; a supporting line → subheading; a paragraph/details → body; a small edge/eyebrow/date-like line → caption; a button/tag/CTA/pill → cta. An ask with no dedicated brand class ("add a quote") maps to the CLOSEST class, body, and you say so honestly. ONE OF EACH CLASS, MAXIMUM (client ruling 2026-07-27): a design carries at most one heading, one subheading, one body, one caption and one button — the design state's elementClasses lists the classes already in use. When the asked class is already in use, do NOT set addTextElement (the editor refuses it); instead reply honestly and redirect: for body, encourage another PARAGRAPH inside the one Body ("Your design already has a Body — add another paragraph inside it instead, in the Text panel"); for other classes, point at editing the existing one. Space is never the reason to refuse — class uniqueness is the only bound. The layout engine places an allowed add; if a format has no room it is kept and named in that format's readiness — so describe the add in present tense and don't claim an exact position you can't see.
REMOVING: "get rid of the small text / label / button" → set that field to "" (empty string removes it explicitly).`;

  const systemPrompt = `You are the Art Director for ${brandContext.name}, a Singaporean education brand for students aged 10 and above. You help a non-designer build on-brand social posts by editing their design directly through a structured patch.

Brand voice: ${brandContext.tone}.
${brandContext.voiceRules}
${likePrefs.exemplars.length ? `
HOUSE STYLE — learned from designs the owner LIKED (lean toward these whenever the request leaves room; an explicit ask always wins):
${likePrefs.exemplars.map(e => `- ${e}`).join('\n')}
` : ''}You reply with JSON matching the provided schema: { reply, patch }.
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

  // (B1) STREAMING vs one-shot. The client sets body.stream to render the reply
  // token-by-token (perceived speed). finalize() does ALL the post-processing on the
  // parsed { reply, patch } and returns a plain { status, payload } — shared by both
  // paths so the streaming reply and the one-shot JSON always agree. The patch is only
  // ever applied client-side AFTER the stream completes (finalize runs on the FULL
  // text), so streaming never applies a half-parsed patch.
  const wantsStream = body.stream === true && context !== 'caption';

  // finalize(parsed) → { status, payload }. Returns the final response object the
  // client consumes (both the streamed `done` event and the one-shot body).
  async function finalize(parsed) {
    // (Tone) scrub exclamation marks from every model-written copy surface —
    // the brand never exclaims (spec §0 voice; deterministic belt over the prompt).
    const reply = typeof parsed?.reply === 'string' ? toneScrub(parsed.reply) : '';
    const patch = toneScrubPatch(parsed?.patch && typeof parsed.patch === 'object' ? parsed.patch : {});
    if (!reply) {
      return { status: 502, payload: { error: "That response came back incomplete. Please try again." } };
    }
    return await finalizeBody(reply, patch);
  }

  // Fetch the model output as a single string, streaming reply deltas to `onDelta`
  // when requested. Returns { ok, text, status, reason }.
  async function getModelText(onDelta) {
    if (onDelta) return streamOpenAI(apiKey, payload, onDelta);
    let openAIResponse;
    try {
      openAIResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      return { ok: false, text: '', status: 502, reason: 'network' };
    }
    const result = await openAIResponse.json().catch(() => ({}));
    if (!openAIResponse.ok) {
      return { ok: false, text: '', status: 502, reason: result?.error?.message || openAIResponse.statusText };
    }
    return { ok: true, text: getOutputText(result) || '', status: 200 };
  }

  // ── STREAMING PATH ──────────────────────────────────────────────────────────
  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* closed */ } };
        try {
          send({ type: 'status', stage: 'thinking' });
          const r = await getModelText((added) => send({ type: 'reply_delta', text: added }));
          if (!r.ok) {
            console.error('OpenAI assistant stream error:', r.reason);
            send({ type: 'error', error: "I ran into a problem just now. Please try again.", status: r.status });
            controller.close(); return;
          }
          let parsed;
          try { parsed = JSON.parse(r.text); } catch { parsed = null; }
          if (!parsed) { send({ type: 'error', error: "That response came back incomplete. Please try again." }); controller.close(); return; }
          send({ type: 'status', stage: 'applying' });
          const { status, payload: out } = await finalize(parsed);
          if (out.error) send({ type: 'error', error: out.error, status });
          else send({ type: 'done', ...out });
        } catch (e) {
          send({ type: 'error', error: "I ran into a problem just now. Please try again." });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
    });
  }

  // ── ONE-SHOT PATH (fallback / non-streaming clients) ─────────────────────────
  const r = await getModelText(null);
  if (!r.ok) {
    console.error('OpenAI assistant error:', r.reason);
    return Response.json({ error: "I ran into a problem just now. Please try again.", detail: r.reason }, { status: r.status });
  }
  let parsed;
  try { parsed = JSON.parse(r.text); } catch { parsed = null; }
  if (!parsed) return Response.json({ error: "That response came back incomplete. Please try again." }, { status: 502 });
  const fin = await finalize(parsed);
  return Response.json(fin.payload, { status: fin.status });

  // finalizeBody(reply, patch) → { status, payload }: the full patch-gate +
  // image-gen pipeline, shared by streaming and one-shot. Hoisted (function decl)
  // so it's usable above despite appearing after the returns.
  async function finalizeBody(reply, patch) {

  // (Commit 3) Landing photo attach URL — set inside the landing block below, returned
  // separately from the patch so the client applies it as the background image.
  let landingPhotoUrl = null;
  // (Photo-first) A photographer brief for the post's photo, returned so the client
  // starts a Higgsfield photo job (the photo it composes the design over). Null for
  // text-only landing designs and every editor turn.
  let landingScenePrompt = null;

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

  // A landing request is a NEW design, but the editor restores previously placed
  // overlay layers from localStorage — so yesterday's petal frame kept leaking
  // into every fresh AI design regardless of the gate above. Force a clean
  // slate: applyDesignPatch removes before it adds, so an explicit decoration
  // request still lands its overlay on the cleared canvas.
  if (context === 'landing') {
    patch.removeOverlays = true;

    // ── DURABLE ROTATION HYDRATION (G1) ──────────────────────────────────────
    // The frequency-cap + anti-repeat ring is correctly GLOBAL PER BRAND but was
    // module-level memory only, so it reset on every deploy and diverged across
    // serverless instances (docs/asset-pipeline.md Part V). Hydrate it from the
    // durable `brand_rotation` row BEFORE any cap/rhythm math reads it, so
    // exceedsCap / resolveLandingArchetype / pickVariant see the shared history.
    // Single, time-boxed read (≤~150ms budget, falls back to the in-memory ring on
    // timeout/any failure) — never a latency cliff, never a throw. Adopt the cloud
    // snapshot IN PLACE into the const ring arrays (mutate, never reassign); LAST_BG
    // is a module `let` reassigned via closure.
    const rotationDb = rotationClient(); // null when Supabase env is absent → memory-only
    if (rotationDb) {
      const loaded = await loadRotation(rotationDb, BRAND_ID, {
        recentPicks: RECENT_PICKS, recentVKinds: RECENT_VKINDS, lastBg: LAST_BG,
      });
      if (loaded.recentPicks !== RECENT_PICKS) {
        RECENT_PICKS.splice(0, RECENT_PICKS.length, ...loaded.recentPicks.slice(-RECENT_MAX));
      }
      if (loaded.recentVKinds !== RECENT_VKINDS) {
        RECENT_VKINDS.splice(0, RECENT_VKINDS.length, ...loaded.recentVKinds.slice(-RECENT_MAX));
      }
      LAST_BG = loaded.lastBg;
    }

    // (2.5 born-clean) Cap the model's generated copy so it doesn't floor/drop the
    // caption at render — the source of the ~1 advisor dot on live landing designs.
    for (const [f, max] of Object.entries(LANDING_COPY_MAX)) {
      if (typeof patch[f] === 'string' && patch[f].trim()) {
        const fitted = fitCopy(patch[f], max);
        if (fitted !== patch[f]) patch[f] = fitted;
      }
    }

    // ── DETERMINISTIC ARCHETYPE + FREQUENCY CAPS (Commit 1) ──────────────────
    // Every landing plan must carry an archetype. Resolve the model's pick against
    // the server-side recent-picks ring so petal_window stays ≤1-in-8, motif_field
    // per spec, and the dark-class share sits at 25–30% (never 3 dark in a row).
    // petal_window survives ONLY if the user explicitly named the treatment (the
    // same DECOR intent that gates overlays); otherwise it's overridden silently.
    const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const intent = guessIntent(lastUserText);
    const textOnly = wantsTextOnly(lastUserText);
    let picked = LANDING_ARCH_BY_ID[patch.archetypeId] ? patch.archetypeId : null;
    if (picked === 'petal_window' && !wantsDecoration(lastUserText)) picked = null; // petal only when named
    if (!picked) picked = resolveLandingArchetype(null, intent, likePrefs); // model omitted / invalid → pick suited
    let finalArchetype = resolveLandingArchetype(picked, intent, likePrefs);
    // ── PHOTO-FIRST DEFAULT ── unless the brief is explicitly text-only, the FIRST
    // answer is a photo-led composition (solid-field tiles live in the "Try another"
    // rotation instead — great in a feed, plain standalone). Deterministic, cap-aware.
    if (!textOnly && !PHOTO_LED.has(finalArchetype)) {
      finalArchetype = pickPhotoLedArchetype(intent);
    }
    // Variety: never serve the SAME photo-led archetype twice in a row — successive
    // briefs should read as distinct compositions, not the same split re-skinned.
    if (!textOnly && PHOTO_LED.has(finalArchetype) &&
        RECENT_PICKS[RECENT_PICKS.length - 1] === finalArchetype) {
      const prefs = (PHOTO_LED_BY_INTENT[intent] || PHOTO_LED_BY_INTENT.text_post)
        .filter(id => id !== finalArchetype);
      const alt = prefs.find(id => !exceedsCap(id)) || prefs[0];
      if (alt) finalArchetype = alt;
    }
    patch.archetypeId = finalArchetype;
    recordPick(finalArchetype);
    // (2.5 follow-up — born-clean render geometry) The HEADLINE-LED poster archetypes
    // that lead every everyday brief cannot carry a long secondary DETAIL line at a
    // legible size: their support slot is a NARROW side column ≈0.40–0.44 of canvas
    // width, and once the big serif hero renders (measured 105–175px), the reflow in
    // Generator.renderScene compresses the support box (editorial_split story: h
    // 0.14→0.043 ≈83px; floated_card portrait: →86px). A model subtext (measured 26–41
    // chars) then wraps past what the compressed box holds at the readable-min font and
    // is DROPPED WHOLE (complete-or-absent) — the source of the live landing born-clean
    // dot (copy-dropped), and of thumb-legibility on the short/wide formats. A length cap
    // can't rescue it: the fitted-line floor means the copy would have to be ≤~16 chars to
    // survive, which is not a detail line — so a contextual subtext essentially never fits
    // here and drops every time (invisible AND a dot). Clear it: renderScene's supportText
    // then falls back to the SHORT attribution/signature line (`ccSubtext || ccAttribution`,
    // Generator.jsx ~5554), which does fit — so the design shows a clean legible support
    // line instead of a dropped one, and copy-dropped + thumb-legibility clear across every
    // format for these archetypes, with zero render-geometry change. The full detail line
    // is not lost relative to today (it was already being dropped); the member can still
    // add it via chat on a format/spot where it fits.
    const HEADLINE_LED_LONG_CAPTION_DROPS = new Set([
      // (Item 5) documentary drops even a SHORT caption by geometry — its whisper-hero
      // + post-hero nudge starve the support box — so a landing subtext on documentary
      // leaks a copy-dropped dot on shot one. Clearing the subtext here lets renderScene
      // fall back to the short attribution line, which fits, keeping shot one born-clean.
      'editorial_split', 'floated_card', 'portrait_credential', 'full_bleed_duotone', 'documentary',
    ]);
    if (HEADLINE_LED_LONG_CAPTION_DROPS.has(finalArchetype) && typeof patch.subtext === 'string' && patch.subtext.trim()) {
      patch.subtext = '';
    }
    // Measured palette rotation (spec §3): pick a sanctioned variant index for this
    // archetype, enforcing pastel-share (~1-in-3 of light) + dark-share (25–30%)
    // deterministically. The client materializes this exact variant.
    // (item 11) Liked variants win ties inside the palette quotas.
    patch.archVariant = pickVariant(finalArchetype, likePrefs);
    // (G1) Persist the updated ring durably. recordPick + pickVariant have now
    // mutated RECENT_PICKS / RECENT_VKINDS / LAST_BG; write them to `brand_rotation`
    // so the next turn on ANY instance (incl. after a deploy) reads this history.
    // Fire-and-forget (not awaited beyond kickoff, never throws) — the cloud write
    // adds no latency to the landing response; last-write-wins (lib/rotation-state.js).
    if (rotationDb) {
      saveRotation(rotationDb, BRAND_ID, {
        recentPicks: RECENT_PICKS, recentVKinds: RECENT_VKINDS, lastBg: LAST_BG,
      });
    }
    // (Photo-first) Is the resolved archetype photo-led? Only those want a generated
    // background photo (scenePrompt); text-only archetypes stay solid-field.
    const archIsPhotoLed = PHOTO_ATTACH_ARCHETYPES.has(finalArchetype) || PHOTO_LED.has(finalArchetype);
    if (archIsPhotoLed && (!patch.postType || !['photo_logo', 'texture_text'].includes(patch.postType))) {
      patch.postType = 'photo_logo';
    }
    // Keep the model's scenePrompt only for photo-led archetypes; sanitise it of any
    // brand/design words that would make the diffusion model render text (belt-and-
    // braces over the prompt rule). Returned separately so the client starts a
    // Higgsfield PHOTO job for it (photo-first pipeline); it is NOT an applied field.
    if (archIsPhotoLed && typeof patch.scenePrompt === 'string' && patch.scenePrompt.trim()) {
      landingScenePrompt = sanitizeScenePrompt(patch.scenePrompt);
    }
    // (Photo-first) EVERY photo-led landing plan must carry a photographer brief so
    // the Soul photo pipeline actually fires — the model occasionally omits it, and
    // a photo-led archetype without a fresh photo was the client's "basic" default.
    if (archIsPhotoLed && !landingScenePrompt) {
      landingScenePrompt = fallbackScene(intent);
    }
    // LIBRARY FALLBACK — when Higgsfield is NOT configured (no scene generation path)
    // OR the model gave no scene, attach a Library image so a photo-led design isn't
    // text-only-plain. Graceful: null when the Library is empty/unconfigured.
    if (archIsPhotoLed && (!landingScenePrompt || !higgsfieldConfigured())) {
      landingPhotoUrl = await pickLandingPhoto(finalArchetype, designState.dimensionId);
    }
  } else if (patch && patch.archetypeId != null && patch.archetypeId !== 'none') {
    // ── EDITOR LAYOUT-CHANGE GUARD (Commit 1) ────────────────────────────────
    const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    if (!wantsLayoutChange(lastUserText)) {
      // No layout/style intent in the user's words → keep the layout put (strip the
      // unsolicited archetype swap the model sometimes adds to a plain copy tweak).
      delete patch.archetypeId;
    } else if (LANDING_ARCH_BY_ID[patch.archetypeId]) {
      // A genuine layout request: if the model echoed the CURRENT archetype, flip to
      // a different suited one so the user visibly gets a new layout.
      const cur = designState.archetypeId;
      if (patch.archetypeId === cur) {
        const intent = guessIntent(designState.postType || '');
        const alt = CAP_SELECTABLE.find(a => a.id !== cur && a.suits.includes(intent))
          || CAP_SELECTABLE.find(a => a.id !== cur);
        if (alt) patch.archetypeId = alt.id;
      }
      // petal_window still requires an explicit naming, even under a layout request.
      if (patch.archetypeId === 'petal_window' && !wantsDecoration(lastUserText)) patch.archetypeId = null;
    }
  }

  // ── FULL-IMAGE / PANEL-REMOVAL DETERMINISTIC MAPPING (WP-W0 specimen fix) ──
  // "i want full image post" / "remove the green solid" MUST land as a layout
  // switch to a photo-dominant archetype. The prompt now carries few-shot
  // mappings, but this deterministic belt guarantees the patch carries the
  // right archetype even when the model reaches for backdrop/logo fields again.
  // (A1) When a plain "change / swap / different photo" ask (no named subject) lands
  // on a photo-bearing design, the RIGHT action is the SAME deterministic re-roll the
  // toolbar's Refresh-photo button runs — not an empty patch that trips the no-op
  // apology. The belt sets this; the client runs onChangePhoto (refreshPhoto) on it.
  let refreshPhotoSignal = false;
  if (context !== 'landing') {
    const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    // ── SIMPLE-REQUEST BELTS (defect-class #1) ────────────────────────────────
    // Track whether a belt authored a definitive change so we can OVERRIDE the
    // model's reply with an honest, specific narration (keeping reply ⇄ render in
    // sync — the client's honesty pipeline then sees a truthful claim + real
    // change and never emits the "that didn't change anything" apology).
    let beltReply = null;
    // True when the mood belt deliberately set a photo treatment — exempts it from
    // the "unsolicited photo-treatment" strip below (the mood ask IS the request).
    let moodSetTreatment = false;
    // Is the current design a materialized archetype? Then the VISIBLE solid field
    // is driven by the palette variant, not bgColor — so a colour change must also
    // set fieldColor (a client-only key applyDesignPatch honours) to be visible.
    const onArchetype = !!(designState.archetypeId && designState.archetypeId !== 'none');
    // The colour currently VISIBLE: on a materialized archetype that's the field
    // override (when the client sends it), else bgColor. Belts compare against this
    // so a repeat colour/mood ask lands a token that actually differs (no no-op).
    const currentField = onArchetype ? (designState.fieldColor || designState.bgColor || null) : (designState.bgColor || null);
    const setField = (token) => {
      patch.bgColor = token;                 // legacy / non-materialized path
      if (onArchetype) patch.fieldColor = token; // render-truth on materialized designs
    };
    // All selectable bg tokens — used to pick a guaranteed-different alternate when a
    // requested colour already matches the current field.
    const ALL_BG = ['whiteSmoke', 'wisteria', 'celadon', 'burnham', 'jet', 'dustyPink', 'butter', 'sky', 'sage', 'terracotta', 'lilac'];
    const differentFrom = (token, avoid, fallbacks = []) => {
      if (token !== avoid) return token;
      for (const f of fallbacks) if (f !== avoid) return f;
      return ALL_BG.find(b => b !== avoid) || token;
    };

    // Did the band belt handle this turn? Gates the full-image belt below so a
    // scrim-removal ask ("remove the text band") is never ALSO read as a panel
    // removal (which would swap the archetype and re-narrate a layout switch).
    let bandHandled = false;

    // 0. BAND / SCRIM REMOVAL — "remove the text band", "get rid of the strip
    //    behind the words", "hide the scrim". (Client ruling 2026-07-16) The correct
    //    remedy is a REAL layout switch to an archetype that's band-free BY
    //    CONSTRUCTION (its photo is bounded to a card/split/mask, so the reflow engine
    //    guarantees text never sits on raw photo — no band mechanism ever engages
    //    there, whatever the content), not a config toggle — so the changed-field tag
    //    and the client's render-truth check both reflect an ACTUAL archetype change.
    //    When no band-free layout fits the current copy (never silently drop
    //    content), fall back to the honest tradeoff: band off, name why, offer the
    //    real remedies. Exactly one reply either way — never a fabricated claim
    //    followed by a contradiction (M4 honesty).
    {
      const bd = detectBandRemoval(lastUserText, designState);
      if (bd) {
        bandHandled = true;
        const LAYOUT_NICE = {
          editorial_split: 'a photo-and-text split — your words move onto a solid panel beside the photo',
          shape_cutout: 'a shape-cutout layout — the photo shows through a brand shape, with your words on the solid canvas below it',
          portrait_credential: 'a portrait layout — your words sit on a solid panel beside the photo',
        };
        if (bd.present && bd.targetArchetype) {
          patch.archetypeId = bd.targetArchetype;
          beltReply = `Switched to ${LAYOUT_NICE[bd.targetArchetype] || 'a layout without a band'} — legible without needing a band behind the text. Tap Undo to go back.`;
          // Only the layout changes — strip any copy/backdrop field the model
          // hallucinated alongside (the specimen falsely tagged "changed: headline").
          for (const f of ['headline', 'subtext', 'attribution', 'dateText', 'microLabel', 'pillText', 'backdropMode']) {
            if (f in patch) delete patch[f];
          }
        } else if (bd.present) {
          // No band-free layout fits this copy — never force a switch that would
          // overflow or silently drop content. Honest tradeoff instead (a real,
          // named change: the band drops to shadow-only).
          patch.backdropMode = 'none';
          beltReply = 'Your copy is a bit long for a band-free layout to hold it legibly, so I can’t switch away from the band without risking it becoming unreadable. I’ve dropped the band to shadow-only for now. Tap the “Try another layout” chip, or shorten the copy and ask again.';
          for (const f of ['headline', 'subtext', 'attribution', 'dateText', 'microLabel', 'pillText', 'archetypeId']) {
            if (f in patch) delete patch[f];
          }
        } else {
          // Already shadow-only, or already on a band-free layout — no band to
          // remove. Honest, and "already" suppresses the client's no-op apology.
          beltReply = 'There is no band to remove here — the text already sits without one. If it still reads hard, tap the “Try another layout” chip for a design with a solid text area, or shorten the copy.';
          for (const f of ['headline', 'subtext', 'attribution', 'dateText', 'microLabel', 'pillText', 'archetypeId', 'backdropMode']) {
            if (f in patch) delete patch[f];
          }
        }
      }
    }

    // 0.5 ADD TEXT ELEMENT (spec §5) — "add a caption/heading/body/button saying X".
    //    Births a NEW brand-governed element via patch.addTextElement (the SAME
    //    content/add-element command the UI picker dispatches; the solver places it).
    //    Runs BEFORE text substitution so "add a caption saying X" is an ADD, not an
    //    overwrite of the existing caption. The reply is honest present-tense: an
    //    element was added to the document; if a format can't seat it cleanly it is
    //    kept in storage and named in that format's readiness (complete-or-absent) —
    //    never a fabricated "it's at the bottom-right" claim the render can't back.
    //    An unrecognized-class ask ("add a quote") maps to the closest class (body)
    //    and the reply names the substitution honestly.
    if (!beltReply) {
      const ae = detectAddElement(lastUserText);
      if (ae && ELEMENT_CLASSES.includes(ae.class)) {
        // (Amendment 2026-07-27 ruling 2 — CLASS-EXCLUSIVE ADDS) One of each class,
        // maximum. When the class is already in use (designState.elementClasses —
        // filled role projections + added elements, one system) the belt REFUSES
        // honestly and redirects, mirroring the reducer's own bound — never a
        // narrated add the reducer would silently refuse (M2). Ruling 3 makes the
        // Body refusal encourage another paragraph INSIDE the one Body instead.
        const refusal = addElementClassRefusal(designState, ae.class);
        if (refusal) {
          beltReply = refusal;
          // The live model may have authored its own addTextElement for the same ask —
          // strip it so the refused turn cannot half-apply (the reducer would refuse it
          // anyway; stripping keeps the reply and the patch telling one story).
          if ('addTextElement' in patch) patch.addTextElement = null;
        } else {
          patch.addTextElement = { class: ae.class, text: ae.text };
          const label = ELEMENT_CLASS_LABEL[ae.class] || 'text element';
          beltReply = ae.substituted
            ? `Added that as a ${label} element — the closest brand text style — saying “${ae.text}”. It'll appear on the canvas; tap it to move or edit. If a format has no room I'll keep it and flag it.`
            : `Added a ${label} saying “${ae.text}”. It'll appear on the canvas; tap it to move or edit. If a format has no room I'll keep it and flag it.`;
        }
      }
    }

    // 1. TEXT SUBSTITUTION — "the headline shud say Open House not open day".
    //    A plain wording fix must land on the named copy role. Runs first so it
    //    isn't shadowed by the colour/mood belts on a mixed utterance.
    if (!beltReply) {
      const sub = detectTextSubstitution(lastUserText);
      if (sub && designState[sub.role] !== sub.value) {
        patch[sub.role] = sub.value;
        const roleLabel = { headline: 'headline', subtext: 'text', dateText: 'date' }[sub.role] || 'text';
        beltReply = `Updated the ${roleLabel} to “${sub.value}”. Tap it on the canvas anytime to edit.`;
      }
    }

    // 1b. ADD CONTACT / NAME — "add my name miss tan", "put our phone number …".
    //     Lands a name on attribution / a contact detail on subtext (never invents).
    if (!beltReply) {
      const add = detectContactAdd(lastUserText);
      if (add && designState[add.role] !== add.value) {
        patch[add.role] = add.value;
        const roleLabel = add.role === 'attribution' ? 'sign-off line' : 'small line at the bottom';
        beltReply = `Added “${add.value}” as the ${roleLabel}. Tap it on the canvas to edit.`;
      }
    }

    // 1c. PHOTO CHANGE (2.2) — "change the photo to X" / "different picture" / "the
    //     picture doesnt fit our vibe". Route to the real photo-generation pipeline
    //     (patch.imagePrompt, picked up below) and narrate in PRESENT tense so a
    //     deferred/mocked generation never reads as a false past-tense claim.
    if (!beltReply) {
      const pc = detectPhotoChange(lastUserText);
      if (pc) {
        if (pc.scene) {
          // A named subject → generate it. Present tense: honest whether the image
          // lands now (sync), later (async), or is declined in a sandbox (the image
          // block then returns its own honest "couldn't generate" reply, overriding).
          patch.imagePrompt = sanitizeScenePrompt(pc.scene);
          beltReply = `Generating a new photo of ${pc.scene} now — it'll appear on the canvas in a moment. Tap Undo if it's not what you pictured.`;
        } else if (designState.hasImage) {
          // No subject named ("different picture", "doesn't fit our vibe") on a design
          // that HAS a photo → re-roll it via the SAME action as the toolbar's Refresh
          // photo button (fetchScenePhoto on the stored brief, else a Library rotation).
          // The client runs it; present tense, because the swap is async (and mocked in
          // the tester) — a past-tense "I changed the photo" would be false until it lands.
          refreshPhotoSignal = true;
          beltReply = `Swapping in a different photo now — it'll refresh on the canvas in a moment. Tap Undo if you preferred the last one.`;
        } else {
          // No subject named AND no photo to swap: we never invent facts/scenes, so give
          // an HONEST, actionable reply — never the generic "that didn't change anything".
          beltReply = `Tell me what you'd like the photo to show — say something like “a bright classroom with children reading” — and I'll generate it. You can also add one from the photo panel.`;
        }
      }
    }

    // 2. COLOUR VOCABULARY — map a colour word to the nearest brand token.
    //    Only when the user is clearly talking about colour/background (not a photo
    //    or a copy edit that merely mentions a colour name inside quoted text).
    if (!beltReply) {
      const rawToken = detectColourToken(lastUserText);
      const photoAsk = /\bphoto|picture|image\b/i.test(lastUserText);
      if (rawToken && !photoAsk && COLOUR_ASK_INTENT.test(lastUserText)) {
        // If the exact colour is already showing, nudge to a near neighbour so the
        // ask still produces a real, visible change instead of a silent no-op.
        const NEIGHBOURS = { wisteria: ['lilac', 'dustyPink'], lilac: ['wisteria', 'dustyPink'], terracotta: ['dustyPink', 'butter'], dustyPink: ['lilac', 'terracotta'], butter: ['sky', 'terracotta'], sky: ['sage', 'lilac'], sage: ['celadon', 'sky'], celadon: ['sage', 'sky'], burnham: ['jet', 'sage'], jet: ['burnham'], whiteSmoke: ['butter', 'sky'] };
        const token = differentFrom(rawToken, currentField, NEIGHBOURS[rawToken] || []);
        setField(token);
        const nice = { dustyPink: 'dusty pink', whiteSmoke: 'ivory' }[token] || token;
        beltReply = `Changed the background to ${nice}. Tap the Background swatch to try another.`;
      }
    }

    // 3. MOOD / AESTHETIC RECIPE — "make it warmer / softer / cuter / pop more".
    //    Resolves an ambiguous mood ask to a defined, coherent, visible change.
    if (!beltReply) {
      const mood = detectMood(lastUserText);
      // Don't fire on a photo/copy/layout ask that merely contains a mood word.
      const otherIntent = /\bphoto|picture|image|logo|headline|title|layout|bigger|smaller\b/i.test(lastUserText);
      if (mood && MOOD_RECIPES[mood] && !otherIntent) {
        const r = MOOD_RECIPES[mood];
        // Pick a bg token that actually differs from the CURRENT visible field so a
        // repeated mood ask still lands a real change (r.bgAlt is the fallback).
        const token = differentFrom(r.bgColor, currentField, [r.bgAlt]);
        setField(token);
        // Also nudge the photo treatment when it would change something (a photo
        // exists and the treatment differs) — belt-and-braces on the mood.
        if (designState.hasImage && r.photoTreatment) { patch.photoTreatment = r.photoTreatment; moodSetTreatment = true; }
        // narrate starts with a past-tense verb ("warmed it up …") — capitalise it
        // into a clean sentence (avoids the "I've gave …" agreement slip).
        beltReply = `${r.narrate.charAt(0).toUpperCase()}${r.narrate.slice(1)}. Tap Undo if it's not the feel you wanted.`;
      }
    }

    // 4. TYPOGRAPHY — "make the title bigger / smaller". Bumps the named font role
    //    one step. Uses the current fontSizes when known, else a sensible baseline.
    if (!beltReply) {
      const fr = detectFontResize(lastUserText);
      if (fr) {
        const cur = (designState.fontSizes && designState.fontSizes[fr.role]) || 'm';
        const next = bumpStep(cur, fr.dir);
        if (next !== cur) {
          patch.fontSizes = { ...(patch.fontSizes && typeof patch.fontSizes === 'object' ? patch.fontSizes : {}), [fr.role]: next };
          const what = fr.role === 'heading' ? 'title' : 'text';
          beltReply = `Made the ${what} ${fr.dir === 'up' ? 'bigger' : 'smaller'}. Tap it on the canvas to fine-tune the size.`;
        }
      }
    }

    // A belt authored a definitive change → the reply MUST describe THAT change,
    // not whatever the model narrated (which may have been a refusal). Overriding
    // here keeps the claim honest and prevents the no-op apology downstream.
    if (beltReply) reply = beltReply;

    // Strip UNSOLICITED logo-placement echoes (the model mirrors designState
    // fields into the patch): a placement field PINS the logo client-side
    // (userLogoTouched), which overrides the archetype's logo restraint — only
    // allowed when the user actually talked about the logo/mark. logoId stays
    // (legit contrast swaps on colour changes).
    if ((patch.logoPosition != null || patch.logoSize != null)
        && !/\b(logo|mark|lock-?up|wordmark|emblem|brand)\b/i.test(lastUserText)) {
      patch.logoPosition = null;
      patch.logoSize = null;
    }
    // Strip an UNSOLICITED photo-treatment/frame tweak (the model reaches for
    // these on unrelated asks — e.g. re-toning the photo during a logo move).
    if ((patch.photoTreatment != null || patch.photoFrameType != null) && !moodSetTreatment
        && !/\b(photo|image|picture|tone|tint\w*|duotone|grain|wash|frame|mask|petal|full[- ]?bleed)\b/i.test(lastUserText)) {
      patch.photoTreatment = null;
      patch.photoFrameType = null;
    }
    // DETERMINISTIC LOGO-PLACEMENT MAPPING (WP-W0 specimen B): the model narrated
    // "moved to the center" while patching top-left. When the user names a slot
    // in their own words, the patch carries THAT slot — the user is the boss.
    if (/\b(logo|mark|lock-?up|wordmark|emblem)\b/i.test(lastUserText)
        && /\b(move|put|place|position|drop|stick|cent(er|re)|middle|corner|top|bottom|left|right)\b/i.test(lastUserText)) {
      const t = lastUserText.toLowerCase();
      const top = /\btop\b|\bupper\b/.test(t), bottom = /\bbottom\b|\blower\b/.test(t);
      const left = /\bleft\b/.test(t), right = /\bright\b/.test(t);
      const centre = /\bcent(er|re)\b|\bmiddle\b/.test(t);
      const slot = top && left ? 'top-left' : top && right ? 'top-right'
        : bottom && left ? 'bottom-left' : bottom && right ? 'bottom-right'
        : top ? 'top-center' : bottom ? 'bottom-center'
        : left ? 'mid-left' : right ? 'mid-right'
        : centre ? 'center' : null;
      if (slot && patch.logoPosition !== slot) patch.logoPosition = slot;
    }
    // DETERMINISTIC SHAPE SWAP (WP-W0 specimen 5): "change another shape" /
    // "different petal" on a design with a placed brand shape swaps it for the
    // next variant in the ring (or the model's own different pick). The model
    // claimed "I can't do that yet" while emitting an overlay patch — this belt
    // guarantees the swap lands regardless.
    const SHAPE_RING = ['shape-1', 'shape-2', 'shape-3']; // orchid-petal retired 2026-07-23 (off-brand)
    const SHAPE_SWAP_INTENT = /\b(chang\w*|swap\w*|switch\w*|different|another|next|new)\b[^.!?]{0,24}\b(shape|petal|orchid)\b|\b(shape|petal)\b[^.!?]{0,16}\b(chang\w*|swap\w*|switch\w*)\b/i;
    if (SHAPE_SWAP_INTENT.test(lastUserText) && Array.isArray(designState.overlays)) {
      const cur = designState.overlays.find(o => SHAPE_RING.includes(o.assetId));
      if (cur) {
        const modelPick = patch.addOverlay && SHAPE_RING.includes(patch.addOverlay.assetId) && patch.addOverlay.assetId !== cur.assetId
          ? patch.addOverlay.assetId
          : SHAPE_RING[(SHAPE_RING.indexOf(cur.assetId) + 1) % SHAPE_RING.length];
        patch.addOverlay = { assetId: modelPick, mode: cur.mode || 'frame' };
        patch.removeOverlays = true;   // applyDesignPatch removes before it adds
      }
    }
    if (!bandHandled && wantsFullImage(lastUserText)) {
      const tinted = /\b(duotone|tint\w*|wash(ed)?|moody|darker|green look)\b/i.test(lastUserText);
      const target = tinted ? 'full_bleed_duotone' : 'documentary';
      const pick = patch.archetypeId;
      const alreadyFull = pick === 'documentary' || pick === 'full_bleed_duotone'
        || designState.archetypeId === 'documentary' || designState.archetypeId === 'full_bleed_duotone';
      if (!alreadyFull && designState.archetypeId !== target) {
        patch.archetypeId = target;
        // Any backdrop fiddling the model emitted alongside is superseded by the
        // layout switch — drop it so the patch reads as ONE decisive change.
        if (patch.backdropMode != null) patch.backdropMode = null;
        // (2.2) OVERRIDE the reply so it narrates the LAYOUT switch, not whatever the
        // model claimed (the specimen "I've made the headline larger" on a "fill the
        // whole thing" ask). This is a real, applied change → an honest past-tense line.
        reply = tinted
          ? 'Switched to a full-frame photo layout with the green duotone wash — the photo now fills the whole post, no solid panel. Tap Undo to go back.'
          : 'Switched to a full-frame photo layout — the photo now fills the whole post, no solid panel. Tap Undo to go back.';
      } else {
        // Already a full-frame photo layout: there is no layout to switch. Be honest
        // and actionable instead of letting the model claim an unrelated change (the
        // §0 specimen mismatch — it once reported a headline-size change here).
        reply = 'The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the canvas to pan and zoom.';
      }
    }
    // ── DETERMINISTIC LAYOUT VARIETY (client feedback 2026-07-10; task #59) ────
    // "Try another layout" kept returning the SAME archetype: the prose rule
    // ("pick a DIFFERENT suited archetype") left the pick to the model, which
    // favoured documentary and repeated its own narration verbatim. Belt: when
    // the ask is a variety ask, advance through a suited ring — but the pick is
    // SOLVER-VERIFIED first wherever the client could verify it (task #59, M2):
    // ArtDirectorChat evaluates ring candidates offscreen against the design's
    // ACTUAL content and sends designState.verifiedLayoutCandidate — an id (the
    // first candidate that visibly differs AND places every required role and
    // element), or null ("checked, none fits" → answer honestly, switch nothing).
    // Key ABSENT = an older/unverifying client → the legacy blind-ring fallback.
    if (detectLayoutVariety(lastUserText) && !wantsFullImage(lastUserText)) {
      const ring = designState.hasImage ? [...LAYOUT_VARIETY_RINGS.photo] : [...LAYOUT_VARIETY_RINGS.text];
      const cur = designState.archetypeId;
      const hasVerdict = Object.prototype.hasOwnProperty.call(designState, 'verifiedLayoutCandidate');
      const verified = hasVerdict ? designState.verifiedLayoutCandidate : undefined;
      if (hasVerdict && verified === null) {
        // Solver-verified: NO candidate fits this content. Complete-or-absent for
        // offers — an honest refusal, never a blind switch that would no-op or shed
        // content (M2). No archetype patch leaves this belt.
        if ('archetypeId' in patch) delete patch.archetypeId;
        reply = NO_LAYOUT_SWITCH_REPLY;
      } else {
        // The ring is AUTHORITATIVE on a pure variety ask: the model's own pick
        // tends to bounce between the same two favourites (documentary ↔ split),
        // which reads as "keeps showing the same ones". A verified client pick wins;
        // otherwise next-after-current guarantees the full cycle visits every
        // suited composition.
        patch.archetypeId = (typeof verified === 'string' && verified !== cur && ring.includes(verified))
          ? verified
          : ring[(ring.indexOf(cur) + 1) % ring.length]; // indexOf −1 + 1 → ring[0]
        const LAYOUT_NICE = {
          documentary: 'a full-photo documentary layout', editorial_split: 'a photo-and-text split',
          shape_cutout: 'a shape-cutout layout — the photo shows through a brand shape',
          message_pill: 'a message-pill layout — your words on a rounded card over the photo',
          full_bleed_duotone: 'a full-bleed duotone', floated_card: 'a floated card over the photo',
          portrait_credential: 'a portrait layout with your words beside the photo',
          manifesto: 'a manifesto layout', quote_margin: 'a quote-in-the-margin layout',
          label_headline: 'a label-and-headline layout', serif_word: 'an oversized serif layout',
          big_number: 'a big-number layout', motif_field: 'a motif-field layout',
        };
        // A real, applied change → narrate THIS switch (honesty law), and make the
        // repeat affordance explicit so the next ask reads as expected behaviour.
        reply = `Switched to ${LAYOUT_NICE[patch.archetypeId] || 'a different layout'} — your words are unchanged. Ask again and I'll show you the next one.`;
      }
    }

    // ── (Honesty coordination) REPLY↔PATCH LAYOUT-CLAIM RECONCILE ──────────────
    // The general root fix for the two-bubble contradiction: when NO belt owned the
    // turn (beltReply/bandHandled unset) and the deterministic belts above did not
    // switch the layout, but the MODEL's reply still claims a layout / photo-fill
    // switch, that claim is unbacked by the final gated patch. Rewrite it HERE — from
    // the real patch, before the single authoritative reply reaches the client — so a
    // false "Changed the layout…" is never shown, transiently or otherwise (M4). The
    // deterministic full-image / layout-variety belts above (which DO set archetypeId)
    // are unaffected: reconcile sees the archetype change and returns null.
    if (!beltReply && !bandHandled) {
      const honest = reconcileEditorLayoutClaim(reply, patch, designState);
      if (honest) reply = honest;
    }
  }

  // ── In-chat image generation (P4) ──
  // The model sets patch.imagePrompt ONLY when the user asked to create an image.
  // Make a second call to gpt-image-1 (medium) with the brand-style wrapper; return
  // the b64 image alongside the reply/patch. imagePrompt is a side-effect trigger,
  // not a design field, so strip it from the patch before it reaches the client's
  // applyDesignPatch (which would ignore it anyway — it's not in PATCH_CHANGE_KEYS).
  // (A1 money-safety) When the subject-less photo-change belt fired (refreshPhotoSignal),
  // the ask is a FREE re-roll — the client runs the deterministic Refresh-photo action.
  // A model may STILL have set imagePrompt on the same "change photo" utterance; honoring
  // it would fire a paid gpt-image/Higgsfield generation, breaking the belt's "$0, photo
  // generation is never invoked" guarantee. Force it null on the refresh path so the
  // paid block below can never run — only an explicitly NAMED scene (refreshPhotoSignal
  // stays false) generates.
  const imagePrompt = (!refreshPhotoSignal && typeof patch.imagePrompt === 'string' && patch.imagePrompt.trim()) ? patch.imagePrompt.trim() : null;
  if ('imagePrompt' in patch) delete patch.imagePrompt;
  // scenePrompt is a photo-first side-effect trigger (returned separately, above),
  // never an applied design field — strip it before the patch reaches the client.
  if ('scenePrompt' in patch) delete patch.scenePrompt;

  if (imagePrompt) {
    // Derive a negative-space directive from the design's archetype (the patch's
    // new archetype if the model just set one, else the current design's). This
    // steers the photo to keep a calm region for the studio's own type/logo lockup.
    const activeArchetype = (typeof patch.archetypeId === 'string' && patch.archetypeId !== 'none')
      ? patch.archetypeId
      : designState.archetypeId;
    const negativeSpace = photoDirectiveForArchetype(activeArchetype);

    // PRIMARY: Higgsfield editorial-photo provider. It never throws — on refusal,
    // timeout, or missing keys it returns { refused / unconfigured }, and we fall
    // back to gpt-image-1 (the existing OpenAI path) transparently.
    let imageProvider = 'higgsfield';
    let { imageB64 } = await generatePhoto({
      scene: imagePrompt,
      dimensionId: designState.dimensionId,
      negativeSpace,
    });

    if (!imageB64) {
      // FALLBACK: gpt-image-1. brandKit.photo_brief overrides the casting brief
      // when the owner has customised it; otherwise DEFAULT_PHOTO_BRIEF (P1 item e).
      imageProvider = 'openai';
      const photoBrief = (brandKit?.photo_brief && typeof brandKit.photo_brief === 'object') ? brandKit.photo_brief : DEFAULT_PHOTO_BRIEF;
      ({ imageB64 } = await generateBrandImage(apiKey, imagePrompt, designState.dimensionId, photoBrief));
    }

    if (imageB64) {
      return { status: 200, payload: { reply, patch, imageB64, imageProvider } };
    }
    // Both providers declined — never a 500. Keep any design patch the model also
    // produced, but explain the image couldn't be made and suggest a tweak.
    return { status: 200, payload: {
      reply: "I couldn't generate that one — it may have been outside what I can create. Try describing a simple, everyday scene (for example “children reading together in a bright classroom”), or upload a photo instead.",
      patch,
      imageB64: null,
      imageRefused: true,
    } };
  }

  // (Photo-first) Return the landing photo URL (Library fallback) AND the scenePrompt
  // (photographer brief) so the client can start a Higgsfield photo job for photo-led
  // designs. Both null for text-only archetypes / editor turns.
  return { status: 200, payload: { reply, patch, imageB64: null, imageUrl: landingPhotoUrl, scenePrompt: landingScenePrompt, refreshPhoto: refreshPhotoSignal } };
  } // end finalizeBody
}
