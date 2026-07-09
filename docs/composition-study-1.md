# Composition study #1 — what the hearts say

**Date:** 2026-07-09 · **Source:** the 14 like events in `ai_feedback_events` (12 unique designs, thumbnails + genes) pulled from the live feedback store.
**Moodboard:** empty (0 uploads) — this study rests on likes alone. It should be re-run once inspiration images exist; see "Next data" at the end.

## What was liked (genes roll-up)

| Dimension | Distribution across 12 likes |
|---|---|
| Background | whiteSmoke ×6 · burnham ×4 · wisteria ×1 |
| Post type | photo_logo ×5 · quote ×4 · text_post ×2 · texture_text ×1 |
| Archetype | quote_margin ×3 · documentary ×2 · manifesto, editorial_split, full_bleed_duotone, portrait_credential, label_headline ×1 · (null ×2 = plain full-bleed) |
| Hero register | serif in **every** design that has text |
| Photo treatment | warmGrade ×7 · none ×4 · duotoneStrong ×1 |

## The compositional signature (reading the images, not just the genes)

Looking at the 12 thumbnails as a set, the liked designs share one governing idea: **text and photograph each get their own territory.** The strongest likes fall into four compositions:

1. **Caption-band documentary** (like-1, like-10): photo owns the top ~⅔; the message sits in a dedicated band/scrim at the bottom. Calm, editorial.
2. **Full-bleed photo, no message** (like-2, like-6): the photograph *is* the post — at most a small logo or an ivory frame. Zero text competition.
3. **Type-only with generous margins** (like-3, 5, 8, 11): left-aligned serif, ragged right, attribution small, ≥30% of the canvas left empty. The whitespace is the design.
4. **Split** (like-7): text column and photo column side by side, neither on top of the other.

And, just as informative, the **two weakest compositions were still liked but visibly flawed**:
- **like-4 (portrait_credential):** headline laid straight over a busy photo mid-zone — legibility suffers. It's the only overlay-on-photo composition in the set, and it's the worst-reading one.
- **like-12 (label_headline):** the big organic blob clips the headline — the shape and the text collided.
- **like-1's** tracked-out headline straddles the photo/background seam, splitting each glyph across two backgrounds.

## How to optimize composition — 6 concrete changes

**C1 · Separation prior (the big one).** When a design carries both a photo and a message, prefer archetypes/variants where text lives in its own field — caption band, margin column, or split — over text-over-photo overlays. Concretely: raise rotation weights for `documentary` (band variant), `quote_margin`, `editorial_split`; lower the starting weight of overlay-style `portrait_credential` unless the photo has a quiet zone big enough for the text block (the harmonizer can already measure busyness — use it as a *pre-placement* gate, not just a post-hoc dot).

**C2 · Seam-safe text.** No text block should straddle the photo/background boundary (like-1's flaw). Add a reflow rule: a text role must sit ≥ x px fully inside one field or fully in the band — never across the seam. Cheap to check at layout time (compare role bbox against the photo rect).

**C3 · Shapes are obstacles.** Decor/organic shapes must join the reflow engine's avoid-list so a blob can never clip a headline (like-12). The collision engine already de-collides text roles against each other and furniture — extend the obstacle set to overlay shapes.

**C4 · Lower-third reserve on photo-led archetypes.** The liked documentary crops keep faces/action in the upper ⅔ and the message in the lower ⅓. Bias the photo crop (face/action-avoidance already exists) to place subjects high when a caption band is planned, so the band never covers the subject.

**C5 · Whitespace floor for type-only posts.** Every liked type-only design leaves ≥ ~30% of the canvas empty and sets the block off-center (upper-left gravity, ragged right). Encode: type-only archetypes target ≤ 55% ink coverage, left-aligned serif as the default hero register (serif was 12/12 — make sans opt-in, not rotational).

**C6 · "Photo-first, minimal" is a legitimate outcome.** Two of twelve likes have no message at all. The generator currently always seeds copy; add a low-weight rotation variant that is just full-bleed warmGrade photo + small logo (or ivory frame), so the taste system can learn whether the client keeps choosing it.

Palette/treatment side-notes (not composition, but the genes are loud): whiteSmoke and burnham are the two liked worlds (10/12) with warmGrade the near-universal photo treatment — the rotation's diversity floor (40%) should explore *within* composition more than within palette.

## Next data
- **Moodboard is empty.** Once inspiration images are uploaded (`brand_moodboard`), re-run this study to compare *aspirational* composition (what she saves) against *revealed* taste (what she hearts) — differences there are the interesting signal.
- 3 seed likes are still pending (celebrate-art-week, petal-frame, photo-moment) — tapping ♥ on those will sharpen the archetype distribution.
