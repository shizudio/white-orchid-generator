// Pure intent + honesty-coordination contracts for the Art Director route
// (app/api/assistant/route.js). These live in lib/ (not inline in the route) so
// they are unit-testable in isolation and match the "pure contracts live in lib/"
// house rule. No I/O, no side effects — inputs in, decision out.

// ── FULL-BLEED PHOTO ARCHETYPES ──────────────────────────────────────────────
// On these the photo fills the WHOLE frame, so the only "band" is the legibility
// scrim behind text (backdropMode) — never a solid side PANEL (that belongs to the
// split layouts editorial_split / portrait_credential, removed via an archetype
// switch by the existing full-image belt). Kept as a Set so the disambiguation is
// explicit and cheap.
const FULL_BLEED_PHOTO_ARCHETYPES = new Set(['documentary', 'full_bleed_duotone']);

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

// Detect a legibility-band removal ask. Returns { present } — where `present` is true
// when a band is CURRENTLY on (backdropMode !== 'none', i.e. there is something to
// remove) — or null when this is not a band-removal ask. Fires only when the scrim is
// the plausible referent: the user names it "behind the text" (compound or phrase), OR
// the current design is a full-bleed photo (where the only band IS the scrim). An
// ambiguous "remove the band" on a split layout returns null so the existing
// full-image belt handles it as the panel-removal it is.
export function detectBandRemoval(text, designState = {}) {
  const t = String(text || '');
  if (!BAND_REMOVE_VERB.test(t)) return null;
  const behindText = BEHIND_TEXT.test(t);
  if (!BAND_WORD.test(t) && !behindText) return null;
  const fullBleed = FULL_BLEED_PHOTO_ARCHETYPES.has(designState.archetypeId);
  if (!behindText && !fullBleed) return null;
  const mode = designState.backdropMode || 'auto';
  return { present: mode !== 'none' };
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
