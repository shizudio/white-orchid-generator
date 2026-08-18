// Pure intent + honesty-coordination contracts for the Art Director route
// (app/api/assistant/route.js). These live in lib/ (not inline in the route) so
// they are unit-testable in isolation and match the "pure contracts live in lib/"
// house rule. No I/O, no side effects — inputs in, decision out.

// ── FULL-BLEED PHOTO ARCHETYPES ──────────────────────────────────────────────
// On these the photo fills the WHOLE frame, so the only "band" is the legibility
// scrim behind text (backdropMode) — never a solid side PANEL (that belongs to the
// split layouts editorial_split / portrait_credential, removed via an archetype
// switch by the existing full-image belt). Verified against the ARCHETYPES table
// (components/Generator.jsx): of every archetype, only documentary, full_bleed_duotone
// and message_pill carry `fullBleed:true`. message_pill routes its hero ink through
// its OWN dedicated pill-card legibility system (`mat.special!=="messagePill"` gates
// it out of the ambient full-bleed ink/band resolution) — it neither needs nor is
// reachable through this belt. A legacy (no archetypeId) design that HAS a photo runs
// the same shared drawBackdrop/band system as the full-bleed archetypes, so it counts
// too.
const FULL_BLEED_PHOTO_ARCHETYPES = new Set(['documentary', 'full_bleed_duotone']);
function isFullBleedPhotoDesign(designState) {
  if (FULL_BLEED_PHOTO_ARCHETYPES.has(designState.archetypeId)) return true;
  const legacy = designState.archetypeId == null || designState.archetypeId === 'none';
  return legacy && !!designState.hasImage;
}

// A removal verb + a word naming the legibility SCRIM. Disambiguated from the split
// layout's coloured side panel: "solid" / "panel" / "column" / "slab" are NOT scrim
// words (those stay with the full-image belt); band/scrim/strip/backdrop/backing/
// shading ARE. "text band" / "band behind the words" is the strongest scrim signal.
const BAND_REMOVE_VERB = /\b(remove|removing|hide|hiding|get(ting)?\s+rid\s+of|drop|dropping|lose|losing|take\s*off|taking\s*off|no\s+more|without|kill|delete|clear|turn\s+off)\b/i;
const BAND_WORD = /\b(band|scrim|strip|backdrop|backing|shading|shade)\b/i;
// The scrim sits BEHIND / UNDER the text — the clearest signal it's the legibility
// band and not the split panel. Also matches the "<text-role> band/scrim/…" compound
// ("text band", "title strip"), which likewise names the scrim.
const BEHIND_TEXT = /\b(behind|under(neath)?|beneath|below)\b[^.!?]{0,20}\b(text|words?|title|copy|type|headline|caption|writing|letters?)\b|\b(text|words?|title|copy|type|headline|caption)\s+(band|scrim|strip|bar|box|backdrop|backing)\b/i;

// ── BAND-FREE ARCHETYPE TARGETS (client ruling 2026-07-16) ───────────────────────
// "Remove the band" auto-promotes to a layout that's guaranteed legible WITHOUT a
// band, rather than merely turning the band off. Every archetype OTHER than the
// three fullBleed:true ones bounds its photo to a card/split/mask region, and the
// reflow engine ("shrink-or-lift, never crosses in") de-collides every text role from
// that region by construction — so text there sits on the flat panel colour and
// drawBackdrop's analyzeQuietRegion always resolves "skip" (no band, ever, regardless
// of content). That makes band-freedom an architectural fact, not a content-dependent
// guess.
//
// Live-verified 2026-07-16 (isolated dist, harness mode, Higgsfield keys unset,
// window.__woArchStress sweep, all 6 formats):
//  - editorial_split / portrait_credential / shape_cutout: ZERO structural offenders
//    (no box-overlap/crop/seam-straddle) even at an extreme headline+subtext load.
//  - floated_card: a REAL box-overlap + seam-straddle on the Story format once a
//    subtext line is present — excluded from this belt's targets (never silently
//    picked; still reachable via "Try another layout").
// Additionally (2.5 born-clean commit, already shipped): editorial_split and
// portrait_credential are known to DROP a support/subtext line outright when paired
// with a substantial headline on some formats (HEADLINE_LED_LONG_CAPTION_DROPS in
// this route) — shape_cutout is NOT in that set, so it is preferred whenever the
// design carries more than a bare headline.
const BAND_FREE_HEADLINE_ONLY = ['editorial_split', 'shape_cutout', 'portrait_credential'];
const BAND_FREE_WITH_SECONDARY_COPY = ['shape_cutout', 'editorial_split', 'portrait_credential'];

// Conservative per-role character ceilings a target must clear before this belt will
// silently switch to it — headroom confirmed by the live sweep above (zero structural
// offenders well past these lengths). Beyond this, "does it fit" can't be confidently
// answered without a real render, so the belt declines rather than risk a silent drop.
const BAND_FREE_CAPACITY = { headline: 80, subtext: 100, attribution: 70, dateText: 40 };
function fitsBandFreeCapacity(designState) {
  const within = (v, max) => !v || String(v).length <= max;
  return within(designState.headline, BAND_FREE_CAPACITY.headline)
    && within(designState.subtext, BAND_FREE_CAPACITY.subtext)
    && within(designState.attribution, BAND_FREE_CAPACITY.attribution)
    && within(designState.dateText, BAND_FREE_CAPACITY.dateText);
}
function hasSecondaryCopy(designState) {
  return !!(String(designState.subtext || '').trim() || String(designState.attribution || '').trim());
}
// Pick the first band-free candidate that (a) differs from the current archetype and
// (b) the current copy fits the conservative ceiling above. Returns null when no
// candidate qualifies (e.g. the copy is too long for any of them) — the caller must
// fall back to the honest tradeoff reply, never a fabricated or overflowing switch.
function pickBandFreeArchetype(designState) {
  if (!fitsBandFreeCapacity(designState)) return null;
  const order = hasSecondaryCopy(designState) ? BAND_FREE_WITH_SECONDARY_COPY : BAND_FREE_HEADLINE_ONLY;
  return order.find(id => id !== designState.archetypeId) || null;
}

// Detect a legibility-band removal ask. Returns:
//   null                                    — not a band-removal ask
//   { present: false }                      — recognised, but no band is active here
//                                              (already backdropMode:'none', or the
//                                              current archetype is already band-free)
//   { present: true, targetArchetype: id }  — a band-free layout was found that fits
//                                              the current copy — switch to it
//   { present: true, targetArchetype: null }— a band is active but NO band-free layout
//                                              fits the copy — honest tradeoff, never a
//                                              forced/overflowing switch
// Fires only when the scrim is the plausible referent: the user names it "behind the
// text" (compound or phrase), OR the current design is a full-bleed photo (where the
// only band IS the scrim). An ambiguous "remove the band" on an already band-free
// layout (e.g. editorial_split) returns { present:false } — nothing to remove there.
export function detectBandRemoval(text, designState = {}) {
  const t = String(text || '');
  if (!BAND_REMOVE_VERB.test(t)) return null;
  const behindText = BEHIND_TEXT.test(t);
  if (!BAND_WORD.test(t) && !behindText) return null;
  const fullBleed = isFullBleedPhotoDesign(designState);
  if (!behindText && !fullBleed) return null;
  const mode = designState.backdropMode || 'auto';
  if (!fullBleed || mode === 'none') return { present: false };
  return { present: true, targetArchetype: pickBandFreeArchetype(designState) };
}

// ── LAYOUT VARIETY ASK (the "Try another layout" chip + typed variants) ───────
// One detector shared by the route's deterministic variety belt AND the client
// (ArtDirectorChat), which — task #59, M2 — solver-verifies the rotation candidate
// BEFORE the ask reaches the belt and sends the verdict along
// (designState.verifiedLayoutCandidate: id | null). The belt never has to guess
// whether a client pre-verified: key present = verified pick or an honest "none
// fits"; key absent = legacy blind-ring fallback (older client).
const LAYOUT_VARIETY_INTENT = /\b(another|different|next|new|again|fresh)\b[^.!?]{0,28}\b(layout|look|style|composition|template)\b|\b(layout|look|style)\b[^.!?]{0,20}\b(another|different|again)\b/i;
export function detectLayoutVariety(text) {
  return LAYOUT_VARIETY_INTENT.test(String(text || ''));
}

// ── (Honesty coordination) REPLY↔PATCH LAYOUT-CLAIM RECONCILE ─────────────────
// A model reply that CLAIMS a layout / photo-fill switch must be backed by an
// archetype change in the FINAL (gated) patch. When it is not — the editor
// layout-guard stripped an unsolicited swap, or the model only tweaked copy — the
// claim is false. Shown as-is it streams as a first bubble the client's render-truth
// check then contradicts with a second (a lie followed by a retraction, M4). This
// returns an HONEST replacement reply, computed from the real patch BEFORE the bubble
// renders, or null when the reply is already consistent with the patch. It touches
// ONLY the false-layout-claim class; a genuine switch (archetype changed) is left be.
const LAYOUT_CLAIM_WORDS = /\b(layout|full[- ]?(image|bleed)|composition|new look|fills?\s+the\s+(whole\s+|entire\s+)?(frame|post|canvas|screen))\b/i;
const LAYOUT_CLAIM_VERB = /\b(switched|changed|redesigned|turned it into|made it (a|into)|now (a|uses|on|fills|shows|filling))\b/i;
const LAYOUT_CLAIM_NEGATED = /\b(can'?t|cannot|couldn'?t|unable|not (able|possible)|would you like|want me to|shall i|do you want)\b/i;

export function reconcileEditorLayoutClaim(reply, patch = {}, designState = {}) {
  const r = String(reply || '');
  if (!LAYOUT_CLAIM_WORDS.test(r) || !LAYOUT_CLAIM_VERB.test(r) || LAYOUT_CLAIM_NEGATED.test(r)) return null;
  const switchesLayout = typeof patch.archetypeId === 'string' && patch.archetypeId
    && patch.archetypeId !== 'none' && patch.archetypeId !== designState.archetypeId;
  if (switchesLayout) return null; // the claim is backed by a real archetype change
  // False layout claim → one honest, actionable line (no fabricated success). The
  // "couldn't" keeps the client's own honesty check from firing a second correction.
  return "I couldn't switch the layout for that just now. Tap the “Try another layout” chip, or name a layout — full image, split, or quote card — and I'll switch to it.";
}

// ── DESIGN POLISH (docs/design-polish-spec.md — the one-tap "make it better") ──
// The chat half of the Polish gesture. A whole-design improvement ask — "polish",
// "clean this up", "improve my design", "make it better" — routes to the client's
// deterministic Polish pass (the same action as the Polish button), NEVER to the
// patch model: the pass runs stages 1–3 locally and makes its own single audited
// AI call, so the route short-circuits before any model spend. STRICT on purpose:
// an ask that names a SPECIFIC element/aspect ("make the title better", "clean up
// the caption", "improve the photo") is a targeted edit, not a whole-design pass —
// those stay with the model + the targeted belts.
const POLISH_ASK = new RegExp([
  '(polish|spruce|smarten)( (it|this|things))?( up)?',
  'clean (it|this|things|the (design|post|canvas))? ?up',
  'tidy (it|this|things)? ?up',
  'make (it|this|the (design|post)|my (design|post)) better',
  'improve (my|the|this) (design|post|composition)',
  'improve (it|this)$',
  'one[- ]?(tap|click) improve\\w*',
  'de-?clutter',
].map(s => `\\b(${s})\\b`).join('|'), 'i');
// Element words that make the ask TARGETED (not a whole-design pass).
const POLISH_TARGETED = /\b(title|headline|heading|caption|subtext|subtitle|photo|picture|image|logo|background|colou?r|font|date|button|pill|eyebrow|label|shape|text)\b/i;

export function detectPolishRequest(text) {
  const t = String(text || '').trim();
  if (!t || !POLISH_ASK.test(t)) return false;
  if (POLISH_TARGETED.test(t)) return false;
  return true;
}

// ── ADD TEXT ELEMENT (Text Elements slice 4 — spec §5) ───────────────────────
// The deterministic belt for "add a caption/heading/subheading/body/button saying X".
// Pure so it is unit-testable; the route (app/api/assistant/route.js) wires it to
// patch.addTextElement (the SAME content/add-element command the UI picker dispatches).
// Class-appropriate starter when the user names a class but supplies no words.
export const ELEMENT_STARTER = { heading: 'New heading', subheading: 'New subheading', body: 'New text', caption: 'New caption', cta: 'Learn more' };

// Map the user's noun to a sanctioned class. Order matters: sub-heading before heading,
// cta nouns first (a "button/tag/badge/CTA" is a cta, never a body). An UNRECOGNIZED
// content noun ("quote", "note", "message", "line") maps to the CLOSEST class, body —
// named honestly in the reply (never a refusal). Returns { class, substituted } or null.
export function classifyElementNoun(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(button|cta|call[-\s]?to[-\s]?action|pill|badge|tag)\b/.test(t)) return { class: 'cta', substituted: false };
  if (/\b(sub[-\s]?heading|sub[-\s]?title|subtitle|subhead)\b/.test(t)) return { class: 'subheading', substituted: false };
  if (/\b(heading|header|headline|title)\b/.test(t)) return { class: 'heading', substituted: false };
  if (/\b(caption|eyebrow|footnote|tagline|small\s+(?:text|label|line|caption)|little\s+(?:caps|label|line))\b/.test(t)) return { class: 'caption', substituted: false };
  if (/\b(body|paragraph|body\s+(?:text|copy)|description|details?|blurb)\b/.test(t)) return { class: 'body', substituted: false };
  // An unrecognized content noun the brand has no dedicated class for → closest = body.
  if (/\b(quote|note|message|line|sentence|words?|text|element|copy)\b/.test(t)) return { class: 'body', substituted: true };
  return null;
}

// Detect an ADD-A-NEW-ELEMENT ask and lift the words to show. The route runs this BEFORE
// the text-substitution belt so "add a caption saying X" births a NEW element rather than
// overwriting the existing caption. Returns { class, text, substituted } or null.
export function detectAddElement(text) {
  const t = String(text || '').trim();
  const addIntent = /\b(add|put|include|insert|place|create|drop\s+in|stick\s+in|need|want)\b/i.test(t);
  if (!addIntent) return null;
  // A name/phone/contact ask is the contact belt's job, not an element add.
  if (/\b(name|phone|number|contact|email|handle|whatsapp|mobile|tel)\b/i.test(t)) return null;
  const noun = classifyElementNoun(t);
  if (!noun) return null;
  // Lift the words after "saying / that says / says / reads / to say / :" or quotes.
  let value = null;
  let m = t.match(/\b(?:saying|that\s+says?|says?|reads?|to\s+say|which\s+says?)\s+(.+)$/i)
       || t.match(/[:“"']\s*([^“”"']{2,})["'”]?\s*$/);
  if (m) value = m[1];
  if (value) {
    value = value.replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '').trim();
    if (value.length < 2 || value.length > 240) value = null;
  }
  // No explicit words but a named class → seed the brand starter (matches the UI picker).
  if (!value) value = ELEMENT_STARTER[noun.class];
  return { class: noun.class, text: value, substituted: noun.substituted };
}

// ── CLASS-EXCLUSIVE ADD REFUSAL (Amendment 2026-07-27 ruling 2) ──────────────
// One Heading / Subheading / Body / Caption / Button maximum per design. The bound
// itself lives in the content/add-element reducer (lib/design-document.mjs) — this
// helper is the CHAT-VOICE half: given the compact designState (which carries
// `elementClasses`, the classes already in use — projections + adds, one system)
// and a detected add, it decides whether the belt must refuse and with which
// honest, redirecting reply. Ruling 3 makes the Body refusal ENCOURAGE internal
// sectioning ("add another paragraph inside it") rather than a dead end. Returns
// the reply string, or null when the add may proceed. Pure and unit-testable —
// this is the no-model interception path's honesty guarantee (M2: a refused add
// surfaces in the reply, never a silent no-op).
const CLASS_EXCLUSIVE_CHAT_REPLY = {
  heading: 'Your design already has a heading — every design carries one of each text type at most. Tap the heading on the canvas (or open the Text panel) to edit its words instead.',
  subheading: 'Your design already has a subheading — every design carries one of each text type at most. Tap it on the canvas (or open the Text panel) to edit its words instead.',
  body: 'Your design already has a Body — add another paragraph inside it instead: open the Text panel and press Enter in the Body box to start a new paragraph. You can also flow the paragraphs side by side from the Body options.',
  caption: 'Your design already has a caption — every design carries one of each text type at most. Tap it on the canvas (or open the Text panel) to edit its words instead.',
  cta: 'Your design already has a button — every design carries one of each text type at most. Tap it on the canvas (or open the Text panel) to change its words instead.',
};
export function addElementClassRefusal(designState, elementClass) {
  const inUse = Array.isArray(designState?.elementClasses) ? designState.elementClasses : [];
  if (!inUse.includes(elementClass)) return null;
  return CLASS_EXCLUSIVE_CHAT_REPLY[elementClass] || CLASS_EXCLUSIVE_CHAT_REPLY.body;
}

/* ── CTA COPY BELONGS IN THE CTA-CLASS HOME (task #72) ───────────────────────
   Client repro (2026-08-18, brief "Term 4 enrolment reminder, register now at
   two.co"): the action line painted at NEARLY HEADLINE SIZE across three lines.
   Mechanism — the LANDING plan prompt only ever names the four reading-copy
   fields (headline / subtext / attribution / dateText), so the model had no CTA
   home to reach for and dropped "Register now at two.co" into subtext (or the
   attribution fallback). Both feed `supportText` (Generator.jsx ~4344), which
   paints at SUPPORT scale — `heroSize / heroToSupport` (lib/editorial-
   typography-solver.mjs ~279), i.e. 1/3–1/4 of the headline on the archetypes
   whose ratio is 3–4 — inside a narrow support column, hence the wrap.

   The law (docs/type-scale.md + lib/text-hierarchy.mjs): `cta` is BADGE scale
   and sits deliberately outside the reading ranking — "a pill is an opaque badge
   sized by its own chrome, not a voice in the type hierarchy". So CTA-intent
   copy must land in a CTA-class home: `pillText` (the legacy pill role, painted
   by the badge furniture at 0.022·h) or an added element of class `cta`
   (makeBadgeClass, base 0.024·h). Never in support/headline copy.

   Pure + unit-tested here; the route wires it into the LANDING branch only (an
   editor turn already carries the vocabulary-free "a button / a tag / a badge →
   pillText" mapping and the user's own words). Conservative by construction: it
   fires only on a SHORT line that either opens with a CTA imperative or is a
   bare URL, and never overwrites a CTA the model already placed itself. */

// The pill's own grammar bound (lib/design-patch.js pillText: nullableString(30)).
export const CTA_PILL_MAX = 30;

// Reading-copy fields a misrouted CTA line can land in. Order = fix order; the
// headline is deliberately NOT here (a brief whose whole point is the action gets
// to keep it as the hero — we never demote a title).
export const CTA_SOURCE_FIELDS = Object.freeze(['subtext', 'attribution']);

// A web address / handle. Anchored variants only, so "co-teacher" never matches.
const CTA_URL = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]*\.(?:com|co|sg|org|net|edu|io|me|app|shop|info|biz)(?:\.[a-z]{2})?(?:\/\S*)?\b/i;
// The action verbs a call to action opens with. Deliberately STRONG verbs only —
// "see", "start", "try" also open ordinary sentences, so they are left out.
const CTA_IMPERATIVE = /^(?:please\s+)?(?:register|sign\s?-?\s?up|signup|enrol|enroll|book|apply|call|visit|join|rsvp|reserve|download|subscribe|order|shop|donate|enquire|inquire|contact|whatsapp|message\s+us|email\s+us|learn\s+more|find\s+out\s+more|read\s+more|get\s+started|save\s+your\s+(?:spot|seat|place)|claim|scan|tap|click|swipe)\b/i;
// A CTA is a LINE, not a paragraph. Anything longer is real reading copy that
// merely mentions an action, and it stays where the model put it.
const CTA_MAX_WORDS = 10;

/** True when this copy line is a call to action (a short imperative, or a bare URL). */
export function isCtaCopy(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return false;
  if (t.split(' ').length > CTA_MAX_WORDS) return false;
  if (CTA_IMPERATIVE.test(t)) return true;
  // A line that is nothing but a web address is an action line too.
  const bare = t.replace(/[.,;:!?]+$/, '');
  return CTA_URL.test(bare) && !/\s/.test(bare);
}

/**
 * The CTA line a plan has misrouted into reading copy, or null.
 * Returns `{ field, text, home }` where home is 'pillText' (fits the pill's
 * 30-char grammar bound) or 'element' (longer — the added `cta` element, same
 * badge chrome, same badge scale, 240-char bound).
 */
export function detectMisroutedCtaCopy(patch) {
  const p = patch && typeof patch === 'object' ? patch : {};
  // Law 5 (never overwrite an explicit choice): a plan that already placed a CTA
  // of its own keeps it — we only rescue copy that had nowhere else to go.
  if (typeof p.pillText === 'string' && p.pillText.trim()) return null;
  if (p.addTextElement && p.addTextElement.class === 'cta'
      && String(p.addTextElement.text || '').trim()) return null;
  for (const field of CTA_SOURCE_FIELDS) {
    const text = String(typeof p[field] === 'string' ? p[field] : '').trim().replace(/\s+/g, ' ');
    if (!text || !isCtaCopy(text)) continue;
    return { field, text, home: text.length <= CTA_PILL_MAX ? 'pillText' : 'element' };
  }
  return null;
}

/**
 * MUTATES `patch`, moving a misrouted CTA line into its CTA-class home. Returns
 * the move (`{ field, text, home }`) so the caller can narrate it honestly, or
 * null when there was nothing to move. The source field is set to "" — the
 * ratified explicit-empty sentinel — so the copy is never painted twice.
 */
export function routeCtaCopyToCtaHome(patch) {
  const move = detectMisroutedCtaCopy(patch);
  if (!move) return null;
  patch[move.field] = '';
  if (move.home === 'pillText') patch.pillText = move.text;
  else patch.addTextElement = { class: 'cta', text: move.text };
  return move;
}
