import { getAdminClient } from '@/lib/supabase';
import { PATCH_JSON_SCHEMA, PATCH_FIELD_GUIDE, PATCH_OPTIONS } from '@/lib/design-patch';
import { generatePhoto, higgsfieldConfigured } from '@/lib/higgsfield';
import { getLikePreferences, weightedPick, likeCountFor, emptyPreferences } from '@/lib/preferences';

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

// (Commit 3) LANDING PHOTO ATTACH — for photo-led archetypes, pull a suitable image
// from the Supabase Library so the landing design isn't text-only-plain by default.
// Uses the admin client directly (no HTTP self-call): query the `images` table,
// prefer brand-library batch entries (metadata.batch === 'brand-library'), pick a
// random one, and return a fresh SIGNED URL for the client to apply as the background.
// GRACEFUL: any failure (empty Library, storage unconfigured, no rows) returns null,
// so the landing flow proceeds text-only exactly as before. Which archetypes benefit:
const PHOTO_ATTACH_ARCHETYPES = new Set([
  'editorial_split', 'floated_card', 'documentary', 'full_bleed_duotone',
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
  event:       ['editorial_split', 'full_bleed_duotone', 'floated_card', 'documentary', 'portrait_credential'],
  text_post:   ['editorial_split', 'floated_card', 'portrait_credential', 'documentary', 'full_bleed_duotone'],
  photo_logo:  ['documentary', 'full_bleed_duotone', 'floated_card', 'editorial_split', 'portrait_credential'],
  texture_text:['full_bleed_duotone', 'documentary', 'floated_card', 'editorial_split', 'portrait_credential'],
  quote:       ['portrait_credential', 'floated_card', 'editorial_split', 'documentary', 'full_bleed_duotone'],
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
// (lib/higgsfield adds the grade / camera / no-text scaffold).
const DEFAULT_SCENES = {
  event:       'an average ten-year-old Asian child arranging fresh flowers on a welcome table beside an open classroom door, bright soft morning daylight',
  text_post:   'an average ten-year-old Asian child reading at a pale oak table in a bright plant-filled classroom, absorbed and quietly happy, soft natural daylight',
  photo_logo:  'an average ten-year-old Asian child laughing mid-play in a sunlit garden, candid and unposed, bright airy daylight',
  texture_text:'a small still-life of eucalyptus stems in a ceramic jar on a pale linen cloth by a bright window, soft morning light',
  quote:       'an average ten-year-old Asian child watering a potted plant on a bright windowsill, gentle and calm, soft natural daylight',
};
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

  const systemPrompt = `You are the social copywriter for The White Orchid, a Singaporean preschool / early-education brand for young families. You write the post caption that a staff member will publish alongside a design they just made.

Brand voice: ${brandContext.tone}. Warm, plain-English, parent-facing, gently reassuring, never salesy, never corporate. NEVER use exclamation marks — calm sentence case throughout. Singapore preschool context (write for local parents; British/Singapore English is fine).

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
- CHOOSE the postType, bgColor and dimensionId that best fit the REQUEST'S INTENT, and vary them meaningfully between requests. Not everything is an Instagram square on the same background. Let the archetype's palette guide the bgColor (an archetype seeds its own field colour, so you can leave bgColor null to accept it, or set one that suits).
  - A quote / saying → "quote" type. A hiring / announcement / reminder → "text_post" or "event". A dated happening → "event". A photo-led moment → "photo_logo" or "texture_text".
- OVERLAYS / FRAMES: NEVER add an overlay (addOverlay) unless the user explicitly names the treatment — "frame", "petal", "orchid shape", "cut-out", "overlay". An invite, open house, celebration or festive post is NOT a reason to add one. Default is always NO overlay.
- AESTHETIC: default to CLEAN and HIGH-CONTRAST. Generous breathing room: short copy, no more fields filled than the request needs. One focal idea per design.

PHOTO (scenePrompt) — REQUIRED for every plan except an explicitly text-only brief. When the chosen archetype is PHOTO-LED (editorial_split, floated_card, documentary, full_bleed_duotone, portrait_credential, texture_text / photo_logo post types), write patch.scenePrompt: a PHOTOGRAPHER'S brief for the background photo. Follow this template EXACTLY and keep it to 1–2 sentences:
  • ONE scene, ONE subject with a concrete action, a setting, and lighting.
  • The subject is an average ~10-year-old Asian child (or a small still-life of plants/objects) in a bright, calm early-education setting.
  • Example shape (do NOT copy verbatim — fit it to the request): "an average ten-year-old Asian child painting with watercolours at a pale oak table, absorbed and quietly happy, bright soft natural daylight".
  • HARD RULE: scenePrompt must contain NO brand name, NO tagline, NO copy, and NO design/layout words (never "poster", "text", "headline", "logo", "caption", "Instagram", "White Orchid"). It describes only a real photograph. The studio adds the grade, camera and "no text" rules itself.
  • Leave scenePrompt NULL for text-only archetypes (serif_word, manifesto, quote_margin, motif_field, stat_tile, brand_card, closing_card, schedule_tile) — those are solid-field designs with no photo.`
    : `This is an ongoing edit inside the studio. Change ONLY the fields the user asked about — send a minimal patch. Leave everything else untouched (omit it from the patch).

ARCHETYPE (layout): only set patch.archetypeId when the user asks for a LAYOUT or STYLE change — "make it a poster", "try a different layout", "make it a quote card", "use the split layout", "turn this into a big date". In that case pick a DIFFERENT suited archetype than the current one. For a plain copy/colour/logo tweak, leave archetypeId null (do not change the layout). Available archetype ids: ${LANDING_ARCHETYPES.map(a => a.id).join(', ')}.

LAYOUT INTENT MAPPINGS (learned from real client sessions — follow these EXACTLY):
- "full image post" / "I want the photo to fill the whole post" / "full bleed" / "edge to edge" → set patch.archetypeId = "documentary" (one clean photo filling the whole frame). Use "full_bleed_duotone" instead ONLY when they ask for the tinted / green / duotone / moody look. Do NOT touch headline or backdropMode for this ask.
- "remove the green solid" / "remove the panel / the green block / the coloured band" on a split layout (editorial_split, portrait_credential): that solid side panel IS the layout itself — no backdrop, overlay or logo field can remove it. The ONLY correct patch is a layout switch: set patch.archetypeId = "documentary" (or "full_bleed_duotone" for the tinted look) so the photo fills the frame. NEVER answer this with backdropMode / removeOverlays / logo changes.
- Never say you changed or switched the layout unless patch.archetypeId is actually set to a NEW value in THIS patch. If you cannot express what was asked, say so plainly ("I can't do that yet") and offer the nearest thing you CAN do.
- If the user asks to ADD an element the current layout cannot show, say which layout can show it and offer to switch — never claim an add that will not render.
- NEVER OFFER WHAT YOU CAN'T EXECUTE. Do NOT end a reply with an open offer you can't carry out on your own — no "Want me to switch the layout?", "Shall I…?", "Would you like me to…?". You emit ONE patch per turn; you cannot act on a later "yes" yourself. Either DO the thing now (set the patch and describe it) or, when you genuinely can't, state the concrete action the USER can take in their own words ("Tap the ‘Try another layout’ chip", "Tap the element on the canvas to edit it"). The studio wires its OWN one-tap offers where a deterministic action exists; your job is to never dangle an offer with nothing behind it.
- "move the logo to the centre / middle" → logoPosition "center" (the true middle of the canvas), NOT "bottom-center". Only say "bottom" when the user says bottom.
- The logo CAN always be placed at any 9-grid position on ANY layout via logoPosition — never claim a layout can't hold the logo, and never offer a layout switch for a logo move.
- "change the shape" / "a different petal" / "swap this shape" (a petal/shape overlay is already placed — see designState.overlays): set removeOverlays true AND addOverlay with a DIFFERENT petal asset than the one placed (orchid-petal, shape-1, shape-2, shape-3), keeping the same mode. This IS supported — never claim you can't swap a shape.
- CONSISTENCY RULE: if you set ANY patch field, your reply must describe that change. NEVER say "I can't do that" while also emitting a patch — if something truly isn't possible, leave every patch field null and say so.

VOCABULARY-FREE ADDING (WP-V §3.3): the user is not a designer — they describe elements by what they LOOK like, not by design terms. Map their words to the right field, and it must Just Work:
- "small text at the bottom / under the title / a little caption / a note that says …" → subtext
- "small label at the top / little caps text / the tiny heading above" → microLabel
- "a button / a tag / a badge / one of those pill things" → pillText
- "the date / when it is" → dateText (only a date the user actually supplied)
- "the big text / the title / the main words" → headline
TEACH THE TERM BACK: when you add or change a mapped element, your reply gently names it once so the user learns the word — e.g. "Added that as a caption — the small text under your headline. Tap it anytime to edit." or "That's the eyebrow — the little label up top. Done." Keep it warm, one sentence, never lecture.
REMOVING: "get rid of the small text / label / button" → set that field to "" (empty string removes it explicitly).`;

  const systemPrompt = `You are the Art Director for The White Orchid, a Singaporean education brand for students aged 10 and above. You help a non-designer build on-brand social posts by editing their design directly through a structured patch.

Brand voice: ${brandContext.tone}. Warm, plain-English, never salesy.
COPY TONE (applies to EVERY copy field you write — headline, subtext, attribution, reply):
- NEVER use an exclamation mark. Not one. Calm confidence, not excitement.
- Never salesy or promotional ("Join us for a day of discovery and learning!" is exactly wrong). No urgency phrases, no hype adjectives, no "don't miss".
- Sentence case, not Title Case ("Come and see for yourself", not "Join Us For Our Open House").
- Short, quiet, editorial. An invitation reads like a note from a calm teacher, not a flyer.
- Avoid brochure clichés: "Join us for…", "a day of discovery and learning", "fun-filled", "exciting". Prefer plain, concrete lines ("Come and see for yourself", "Doors open at nine").
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
    // Measured palette rotation (spec §3): pick a sanctioned variant index for this
    // archetype, enforcing pastel-share (~1-in-3 of light) + dark-share (25–30%)
    // deterministically. The client materializes this exact variant.
    // (item 11) Liked variants win ties inside the palette quotas.
    patch.archVariant = pickVariant(finalArchetype, likePrefs);
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
  if (context !== 'landing') {
    const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content || '';
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
    if ((patch.photoTreatment != null || patch.photoFrameType != null)
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
    const SHAPE_RING = ['orchid-petal', 'shape-1', 'shape-2', 'shape-3'];
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
    if (wantsFullImage(lastUserText)) {
      const tinted = /\b(duotone|tint\w*|wash(ed)?|moody|darker|green look)\b/i.test(lastUserText);
      const target = tinted ? 'full_bleed_duotone' : 'documentary';
      const pick = patch.archetypeId;
      if (pick !== 'documentary' && pick !== 'full_bleed_duotone' && designState.archetypeId !== target) {
        patch.archetypeId = target;
        // Any backdrop fiddling the model emitted alongside is superseded by the
        // layout switch — drop it so the patch reads as ONE decisive change.
        if (patch.backdropMode != null) patch.backdropMode = null;
      }
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
      // FALLBACK: gpt-image-1.
      imageProvider = 'openai';
      ({ imageB64 } = await generateBrandImage(apiKey, imagePrompt, designState.dimensionId));
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
  return { status: 200, payload: { reply, patch, imageB64: null, imageUrl: landingPhotoUrl, scenePrompt: landingScenePrompt } };
  } // end finalizeBody
}
