# Feed Grammar — analysis of the client's Higgsfield grid reference (2026-07-04)

Source: client-generated Higgsfield feed grid (12 tiles, 4 rows × 3 cols), declared
"the style we want to achieve." Reference images: generated/grid-reference.png (the feed grid), plus generated/white-orchid-teachers-day.png and generated/white-orchid-afterschool-post.png (single-post references from the same Higgsfield brand run).
These notes drive calibration r3 ("feed grammar" package). Numbers are estimates from inspection.

## 1. The headline insight: the FEED is the composition
The magic is the sequence, not any single tile. Rhythm across the grid:
- Row 1: dark brand card · full-bleed photo · ivory statement
- Row 2: photo · WISTERIA manifesto · photo (dark wall)
- Row 3: dark statement · photo (interior) · ivory enrolment CTA
- Row 4: photo (dark, quote) · CELADON stat tile · dark closing card
Pattern: photos and solid fields alternate (checkerboard feel); no two adjacent solids share
a palette; dark ≈ 5/12, ivory ≈ 2/12, pastel 2/12, photos 5/12. Implication: the AI rotation
ring must sequence palettes/types like this (photo → solid alternation, no adjacent-palette
repeats), and the calibration board should render AS a feed with this rhythm.

## 2. Logo restraint (biggest single delta vs our engine)
The logo lockup appears ONLY on the two brand-card tiles (openers/closers). Statement,
manifesto, stat, and photo tiles carry NO logo — at most a url line. Our engine stamps the
lockup on every tile → clutter + monotony. Fix: per-archetype/variant `logoUse:
none | mark | lockup | url-only`; default for most archetypes = none or url-only.

**Logo legibility on photos — never fabricate a backing (client ruling, 2026-07-06).**
The logo renders ONLY as an official LOGO_VARIANTS asset, verbatim: no scrim, backing
plate, rounded card, wash, or shadow (the WP-U/A2 remediation is removed). Legibility
tools are only (a) choosing the best-contrast OFFICIAL variant for the spot (ivory vs
green ink; mark vs badge vs lockup — the variant-swap still runs) and (b) position. If the
best official variant still fails the worst-case contrast bar, render it anyway and raise a
ledger `logo-legibility` finding (advisor dot on the logo) with actions Move-to-a-clearer-
spot / Edit-it-myself / Keep-it-this-way — we limit options, never invent wrong ones.

## 3. Tile grammar observed (archetype adjustments + additions)
- BRAND CARD (new): dark field, horizontal mark+wordmark lockup, italic serif tagline below.
  Open/close of a campaign sequence. Left-aligned, mid-tile.
- STATEMENT TILE (= calmer label_headline): eyebrow caps (tracked, small) top-left; ONE serif
  statement 2–3 lines at ~4–6× caption scale (NOT 8–10× poster scale), left-aligned,
  margins ~12–15%; nothing else. Ivory or deep green (ivory ink flips).
- MANIFESTO ON PASTEL (validated): wisteria field, eyebrow, italic serif stack of 3 short
  parallel lines ("Real ownership. / Real decisions. / Real consequences.").
- STAT TILE (new): celadon field, eyebrow, giant serif stat ("1 : 6") mid-tile, light sans
  caption below ("one guide, six children — a room that stays quiet").
- ENROLMENT/CTA CARD (new): ivory; eyebrow; serif hero with roman+italic mix
  ("Now *enrolling*"); structured details block (bold small line + light lines); TANGERINE
  PILL ("LIMITED PLACES"). The pill = the accent use.
- CLOSING CARD (new): dark; small centered mark; serif with italic mix ("Come and *see for
  yourself*"); tangerine pill CTA; url. The ONLY centered composition — works as a bookend.
- PHOTO TILES: full-bleed, warm-graded near-raw (NOT heavy green duotone); single caps
  micro-label bottom-left in white ("IN BLOOM", "AT PLAY", "THE STUDIO"). Sometimes nothing else.

## 4. Rules extracted (numbers)
- Accent = CTA ONLY: tangerine appears exactly twice in 12 tiles, both as pill buttons.
  Never as decorative ink. (Adjust r2's accent-emphasis-word: emphasis-in-accent should be
  rare/optional; pill is the canonical accent.)
- Photo treatment: warm grade (slight lift, warm cast), duotone only when text must sit ON
  the photo; label-only photos stay near-raw. Softens spec §4 defaults for feed photos.
- Eyebrows everywhere on solid tiles: caps, ~+0.10em tracking, small, always top region,
  same position discipline across tiles (system consistency).
- Serif statements: leading ~1.15–1.25, sentence case with period. Italic-mix on ~1/3.
- Captions/details: light sans (r2's Fira 300 confirmed correct).
- The two garbled-text photo tiles are AI text artifacts — reaffirms: text is ALWAYS native.

## 5. Implementation queue (calibration r3 / WP-P)
1. `logoUse` per archetype/variant; default restraint.
2. New archetypes: brand_card, stat_tile, cta_card, closing_card; retune label_headline scale
   to statement-tile calm (4–6×); manifesto pastel variant is already close.
3. Photo grading: warm-grade treatment as default for label-only photo tiles.
4. Pill/badge furniture = the canonical accent (r2 adds the pill; scope accent-emphasis down).
5. Feed-rhythm sequencing in the AI rotation ring (photo/solid alternation, no adjacent
   palette repeats) + calibration board rendered as a FEED (this grid's rhythm).
6. Optional (later): a "Feed planner" surface — compose N posts as a campaign with enforced rhythm.

## 6. Grid reference #2 addenda (2026-07-04, second client grid in generated/)
Client brief with it: "bright, airy, luminous, and all ~10-year-old Asian children."
- PHOTOGRAPHY DIRECTIVE (applies to ALL Higgsfield generation): window light, bright/airy/
  luminous, plants and whites; subjects are ~10-year-old ASIAN children (matches the brand's
  actual student age); teachers appear ("BESIDE THEM" tile). Also OBJECT/STILL-LIFE photography
  is in-grammar ("TEA AT FOUR": fruit plate + gingham cloth). Update lib/higgsfield.js
  brandImagePrompt: casting + light + occasional still-life category.
- NEW: SCHEDULE TILE archetype — eyebrow ("A DAY HERE"), rows of serif time + light sans
  activity separated by hairline rules (2.30 School pick-up / 3.30 Free play / ...). Structured
  list content; ivory field. Maps well to event/timetable content.
- NEW: NO-TEXT PHOTO TILES — portrait tiles with zero or label-only text are legitimate feed
  members (bottom-left smiling portrait had NOTHING).
- Brand card LIGHT variant: butter field, deep-green solid-tone mark, wordmark + italic tagline.
- Stat tile variant: "40 / children. Two gardens. / One quiet hum." — poetic multi-line caption.
- Rhythm confirmed brighter overall: butter/photo/dark // photo/wisteria/photo //
  celadon/photo/ivory // photo/dark/photo.

## 7. Client type & colour rulings (2026-07-04, verbal)
- MORE WHITESPACE: err even airier than current numbers; emptiness is on-brand.
- NO HUGE TITLES: retire poster-scale 8-10x heroes for feed tiles — statements sit calm
  (~3-5x caption), like both reference grids. Billboard scale only where a format demands it.
- THINNER FONTS THROUGHOUT: hero serif at regular/light optical weight (no bold, no heavy
  shadows); sans registers lean light (300-500); avoid 700+ except tiny tracked micro-labels.
- INK DISCIPLINE: max 1-2 font colours per poster; if 2, they occupy DIFFERENT hierarchy
  levels (e.g. deep-green hero + muted eyebrow), never two colours at the same level.
  Kills accent-coloured emphasis words entirely — accent lives ONLY in the pill/CTA.

## 8. ARCHITECTURE TRUTH — how the reference grids were actually made (2026-07-04)
The client's reference grids were NOT full-design diffusion generations. Higgsfield (Soul v2)
produced ONLY bare photographs from photographer-brief prompts containing ZERO brand/design/
text words; ALL composition (logo, Romie/Syne type, colour panels, pills) was composited in
code afterward. Implications, permanent:
- Diffusion models here are PHOTOGRAPHERS, never DESIGNERS. Asking Soul for "a post/design/
  layout" yields garbled text-wall mockups (verified twice). Never build a design-pass or
  layout-extraction pipeline against Soul output.
- Photo prompt template (client's, verbatim structure): lead with "photograph"; ONE subject +
  concrete action; setting; lighting; warm grade "forest green, ivory and warm terracotta,
  natural warm Asian skin tones"; camera (medium format/35mm, generous negative space);
  ALWAYS end "No text, no letters, no words, no logos, no UI, no poster, no frame, no layout,
  no captions. A single full-frame photograph." enhance_prompt: false. VERIFIED Soul
  payload (live validator, 2026-07-04 — overrides the "public surface" ruling): POST
  /v1/text2image/soul with a REQUIRED {params:{…}} wrapper; params = { prompt,
  width_and_height:<enum>, quality:'720p'|'1080p' (we use 1080p; "2k" is rejected),
  batch_size:1, enhance_prompt:false, seed, soul_id? }. NO style_id / aspect_ratio /
  flat width+height — the validator 422s on those (aspect_ratio isn't a field;
  width_and_height is required). soul_id (trained Soul identity) is the consistency
  mechanism, set via env HIGGSFIELD_SOUL_ID; seed via HIGGSFIELD_SEED (unset = random).
- Division of labour, final: Higgsfield shoots → OUR archetype engine composes → user edits.
