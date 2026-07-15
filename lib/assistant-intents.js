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
