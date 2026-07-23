// Italic-phrase marker convention (text-elements / feed-grammar §2 brand rule).
//
// Storage convention: the FIRST *phrase* in a headline renders italic (the
// one-italic-phrase brand rule; see parseHeroTokens in Generator.jsx). In a
// plain text input those asterisks read as literal noise ("Now *Enrolling*"),
// so the inspector shows CLEAN text and re-derives the markers on edit — the
// markers stay only in storage, where the canvas painter consumes them.
//
// The mapping is round-trip safe: showing then re-storing an untouched value is
// idempotent (no duplicated/dropped markers), an edit that keeps the italic
// phrase preserves the italics, and an edit that removes the phrase honestly
// drops the italics rather than resurrecting a stale marker.

const MARKER_PAIR = /\*([^*]+)\*/;
const MARKER_PAIR_G = /\*([^*]+)\*/g;

/** Clean text for display — strips every paired *marker*, keeps the words. */
export function stripItalicMarkers(stored) {
  return String(stored || "").replace(MARKER_PAIR_G, "$1");
}

/** The first italicized phrase (the one that renders italic), or null. */
export function italicPhrase(stored) {
  const match = MARKER_PAIR.exec(String(stored || ""));
  return match ? match[1] : null;
}

/**
 * Map an edited CLEAN field value back to a stored value with markers.
 * `prevStored` is the previous stored value (may carry markers); `edited` is the
 * new clean text the user typed. Preserves the previous italic phrase when it
 * still occurs verbatim; otherwise stores clean text (honest italic drop).
 */
export function applyEditedText(prevStored, edited) {
  // A clean field can never legitimately hold raw markers; strip any the user
  // pasted so we never double-wrap on the next round trip.
  const clean = stripItalicMarkers(edited);
  const phrase = italicPhrase(prevStored);
  if (!phrase) return clean;
  const index = clean.indexOf(phrase);
  if (index < 0) return clean;
  return clean.slice(0, index) + "*" + phrase + "*" + clean.slice(index + phrase.length);
}
