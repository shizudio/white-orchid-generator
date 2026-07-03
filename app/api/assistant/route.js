import { getAdminClient } from '@/lib/supabase';
import { PATCH_JSON_SCHEMA, PATCH_FIELD_GUIDE, PATCH_OPTIONS } from '@/lib/design-patch';
import { generatePhoto } from '@/lib/higgsfield';

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

// ── EDITOR LAYOUT-INTENT GATE (Commit 1) ─────────────────────────────────────
// In the editor, an archetype (layout) change should happen ONLY when the user
// asks for a layout/style change. The model sometimes swaps the archetype on a
// plain copy/colour tweak; this matches the vocabulary of a genuine layout request
// so we can strip an unsolicited archetype swap server-side (keeping the layout put).
const LAYOUT_INTENT = /\b(layout|poster|compos\w*|archetype|redesign|re-?design|template|big number|big date|date card|quote card|manifesto|photo card|floated card|documentary|full[- ]?bleed|duotone|portrait|credential|different look|another look|different style|switch (it|the) (up|layout)|make it a|turn (it|this) into)\b/i;
function wantsLayoutChange(text) {
  return LAYOUT_INTENT.test(String(text || ''));
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
  { id:'editorial_split',   desc:'photo block + solid text block, seam off-center — dated events, hiring, photo moments', suits:['event','photo_logo','text_post'], klass:'light', cap:0.14, palette:'ivory text block beside a duotone photo' },
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
  'portrait_credential', 'petal_window',
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
function pickVariant(id) {
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
    const cands = vs.map((v, i) => ({ v, i })).filter(o => o.v.kind === kind);
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
function resolveLandingArchetype(picked, intent) {
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
  // Override: prefer a same-intent, cap-clear archetype; else any cap-clear one — with
  // alternation as the tie-breaker within each group.
  const bySuit = CAP_SELECTABLE.filter(a => a.id !== picked && (!intent || a.suits.includes(intent)) && !exceedsCap(a.id)).sort((x, y) => rank(x) - rank(y));
  const any = CAP_SELECTABLE.filter(a => a.id !== picked && !exceedsCap(a.id)).sort((x, y) => rank(x) - rank(y));
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
// Suggested archetype + palette-class hint for THIS request. Rotates over the
// cap-clear, non-petal set (minute bucket + jitter) so successive requests diverge.
function pickLandingArchetypeHint() {
  const pool = CAP_SELECTABLE.filter(a => !exceedsCap(a.id));
  const list = pool.length ? pool : CAP_SELECTABLE;
  const idx = (Math.floor(Date.now() / 60_000) + Math.floor(Math.random() * list.length)) % list.length;
  const a = list[idx];
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

function captionSourceFacts(d) {
  const facts = [];
  if (d.headline) facts.push(`Headline: ${d.headline}`);
  if (d.subtext) facts.push(`Subtext: ${d.subtext}`);
  if (d.attribution) facts.push(`Attribution/quote source: ${d.attribution}`);
  if (d.dateText) facts.push(`Date on the design: ${d.dateText}`);
  facts.push(`Post type: ${d.postType || 'text_post'}`);
  facts.push(`Has a photo/video: ${d.hasImage ? 'yes' : 'no'}`);
  return facts.join('\n');
}

async function handleCaption({ apiKey, designState, brandContext, model, rewriteNudge }) {
  const platform = platformForDimension(designState.dimensionId);
  const hasCopy = !!(designState.headline || designState.subtext || designState.attribution || designState.dateText);

  const systemPrompt = `You are the social copywriter for The White Orchid, a Singaporean preschool / early-education brand for young families. You write the post caption that a staff member will publish alongside a design they just made.

Brand voice: ${brandContext.tone}. Warm, plain-English, parent-facing, gently reassuring, never salesy, never corporate. Singapore preschool context (write for local parents; British/Singapore English is fine).

Write for this platform — follow its conventions exactly:
${platform.rules}

Use the design's ACTUAL copy as your source of facts. NEVER invent dates, prices, claims, offers, statistics, testimonials, or event details that are not present below. If a date appears in the design, you may mention it; if none is given, do not make one up.
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
  let caption = typeof parsed?.caption === 'string' ? parsed.caption.trim() : '';
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

  const model = process.env.OPENAI_ART_DIRECTOR_MODEL || 'gpt-4o-mini';

  // ── CAPTION MODE ── generate a post caption + hashtags + alt-text from the
  // current design and its platform, then return early (no design-patch path).
  if (context === 'caption') {
    return handleCaption({ apiKey, designState, brandContext, model, rewriteNudge: !!body.rewrite });
  }

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

  const landingArchetypeHint = pickLandingArchetypeHint();
  const contextRule = context === 'landing'
    ? `This is the FIRST message from a new user on the landing page. They have no design yet. Produce a COMPLETE, ready-to-edit starting composition: set an ARCHETYPE (archetypeId), postType, dimensionId, bgColor, a suitable logoId + logoPosition + logoSize, and any copy fields (headline/subtext/attribution/dateText) that the request clearly supports. Do not leave it minimal.

ARCHETYPE — REQUIRED. You MUST set patch.archetypeId to one of these editorial compositions, chosen by the request's INTENT:
${landingArchetypeCatalog()}
Routing hints (choose the best fit, not always the same one):
- a quote / saying / proverb → quote_margin or serif_word
- a dated event (open house, term start, sports day, deadline) → big_number or editorial_split
- hiring / a role → label_headline or portrait_credential
- a photo moment → documentary, floated_card, or full_bleed_duotone
- an announcement / brand statement → serif_word or motif_field
- values / mission / manifesto copy → manifesto
- petal_window ONLY when the user explicitly names the petal / orchid / shape / frame — otherwise NEVER pick it.
SUGGESTED for THIS request (a soft nudge for variety — override only if intent clearly points elsewhere): ${landingArchetypeHint}.

VARIETY (important — the studio has felt repetitive):
- CHOOSE the postType, bgColor and dimensionId that best fit the REQUEST'S INTENT, and vary them meaningfully between requests. Not everything is an Instagram square on the same background. Let the archetype's palette guide the bgColor (an archetype seeds its own field colour, so you can leave bgColor null to accept it, or set one that suits).
  - A quote / saying → "quote" type. A hiring / announcement / reminder → "text_post" or "event". A dated happening → "event". A photo-led moment → "photo_logo" or "texture_text".
- OVERLAYS / FRAMES: NEVER add an overlay (addOverlay) unless the user explicitly names the treatment — "frame", "petal", "orchid shape", "cut-out", "overlay". An invite, open house, celebration or festive post is NOT a reason to add one. Default is always NO overlay.
- AESTHETIC: default to CLEAN and HIGH-CONTRAST. Generous breathing room: short copy, no more fields filled than the request needs. One focal idea per design.`
    : `This is an ongoing edit inside the studio. Change ONLY the fields the user asked about — send a minimal patch. Leave everything else untouched (omit it from the patch).

ARCHETYPE (layout): only set patch.archetypeId when the user asks for a LAYOUT or STYLE change — "make it a poster", "try a different layout", "make it a quote card", "use the split layout", "turn this into a big date". In that case pick a DIFFERENT suited archetype than the current one. For a plain copy/colour/logo tweak, leave archetypeId null (do not change the layout). Available archetype ids: ${LANDING_ARCHETYPES.map(a => a.id).join(', ')}.`;

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

  // A landing request is a NEW design, but the editor restores previously placed
  // overlay layers from localStorage — so yesterday's petal frame kept leaking
  // into every fresh AI design regardless of the gate above. Force a clean
  // slate: applyDesignPatch removes before it adds, so an explicit decoration
  // request still lands its overlay on the cleared canvas.
  if (context === 'landing') {
    patch.removeOverlays = true;

    // ── DETERMINISTIC ARCHETYPE + FREQUENCY CAPS (Commit 1) ──────────────────
    // Every landing plan must carry an archetype. Resolve the model's pick against
    // the server-side recent-picks ring so petal_window stays ≤1-in-8, motif_field
    // per spec, and the dark-class share sits at 25–30% (never 3 dark in a row).
    // petal_window survives ONLY if the user explicitly named the treatment (the
    // same DECOR intent that gates overlays); otherwise it's overridden silently.
    const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const intent = guessIntent(lastUserText);
    let picked = LANDING_ARCH_BY_ID[patch.archetypeId] ? patch.archetypeId : null;
    if (picked === 'petal_window' && !wantsDecoration(lastUserText)) picked = null; // petal only when named
    if (!picked) picked = resolveLandingArchetype(null, intent); // model omitted / invalid → pick suited
    const finalArchetype = resolveLandingArchetype(picked, intent);
    patch.archetypeId = finalArchetype;
    recordPick(finalArchetype);
    // Measured palette rotation (spec §3): pick a sanctioned variant index for this
    // archetype, enforcing pastel-share (~1-in-3 of light) + dark-share (25–30%)
    // deterministically. The client materializes this exact variant.
    patch.archVariant = pickVariant(finalArchetype);
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

  // ── In-chat image generation (P4) ──
  // The model sets patch.imagePrompt ONLY when the user asked to create an image.
  // Make a second call to gpt-image-1 (medium) with the brand-style wrapper; return
  // the b64 image alongside the reply/patch. imagePrompt is a side-effect trigger,
  // not a design field, so strip it from the patch before it reaches the client's
  // applyDesignPatch (which would ignore it anyway — it's not in PATCH_CHANGE_KEYS).
  const imagePrompt = typeof patch.imagePrompt === 'string' && patch.imagePrompt.trim() ? patch.imagePrompt.trim() : null;
  if ('imagePrompt' in patch) delete patch.imagePrompt;

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
      // FALLBACK: gpt-image-1.
      imageProvider = 'openai';
      ({ imageB64 } = await generateBrandImage(apiKey, imagePrompt, designState.dimensionId));
    }

    if (imageB64) {
      return Response.json({ reply, patch, imageB64, imageProvider });
    }
    // Both providers declined — never a 500. Keep any design patch the model also
    // produced, but explain the image couldn't be made and suggest a tweak.
    return Response.json({
      reply: "I couldn't generate that one — it may have been outside what I can create. Try describing a simple, everyday scene (for example “children reading together in a bright classroom”), or upload a photo instead.",
      patch,
      imageB64: null,
      imageRefused: true,
    });
  }

  return Response.json({ reply, patch, imageB64: null });
}
