# The White Orchid — Visual Language Research

> **DRAFT.** This is a research-grounded pattern taxonomy synthesized from public design
> knowledge of premium editorial/lifestyle brands (Aesop, Kinfolk, Cereal Magazine, The
> Gentlewoman, Aman, Le Labo, Liewood, Konges Sløjd) plus general typographic/editorial
> design literature. It has **not yet been validated against the client's own curated
> reference set** (their saved posts, moodboards, competitor screenshots). Treat every
> number below as a defensible starting hypothesis, not a locked spec — expect the client
> reference pass to shift ratios by ±20-30% and to demote/promote archetypes based on what
> actually recurs in their taste.

---

## 1. Archetype library

14 named composition archetypes. Each spec block gives canvas-fraction geometry so it can
be encoded directly as generator layout rules. "Hero" = the single dominant visual/type
element; "support" = secondary text block. Scale ratio is support size ÷ hero size.

### 1.1 Oversized Single Word + Micro Caption
Ne giant word (or two) fills most of the frame; a tiny caption line does all the
informational work below or beside it. Confidence expressed through scale contrast, not decoration.
- **Spec:** hero text block occupies 60-80% of canvas width, hero font-size = 18-28% of canvas height, vertically centered or lower-third anchored (y = 55-70%). Support caption at 3-4% of canvas height, positioned 8-12% canvas-height below hero, left-aligned to hero's left edge.
- **Whitespace:** 45-60% of canvas is empty.
- **Content types:** quote, announcement, manifesto line.
- **Exemplar:** Aesop packaging copy treatment; Le Labo apothecary labels; Cereal Magazine pull-quotes.

### 1.2 Asymmetric Editorial Split
Canvas divided unevenly (not 50/50) between an image block and a text/color block, with the seam deliberately off-center. Reads as "designed," never as a slide template.
- **Spec:** split at 38/62 or 42/58 (never 50/50), seam can be vertical or horizontal. Image block gets the larger share 60-65% of the time. Text sits in the smaller block, inset 8-10% margin, aligned to the seam edge (not centered in its block).
- **Whitespace:** 20-30% within the text block.
- **Content types:** photo-moment, event, hiring.
- **Exemplar:** Kinfolk interior spreads (photo top-right / text block bottom-left, asymmetric, never centered).

### 1.3 Full-Bleed Photo + Whisper Caption
Photo fills 100% of canvas edge-to-edge; a single small caption sits in a low-contrast zone (shadow gradient or matte color patch) so it doesn't compete with the image.
- **Spec:** photo = 100% bleed. Caption block occupies ≤15% of canvas height, anchored to bottom 10-15% or top 8-12%, caption font-size = 2.5-3.5% of canvas height, tracked +4-8%. A soft gradient scrim (10-25% black or ink-color, 15-20% canvas height tall) sits behind caption only, not full-canvas.
- **Whitespace:** N/A (photo-dominant); "quiet zone" for caption is the whitespace equivalent.
- **Content types:** photo-moment, event.
- **Exemplar:** Aman Instagram grid; Aesop store/interior imagery.

### 1.4 Big Number / Date Poster
A date, count, or single numeral rendered at poster scale becomes the entire hero; everything else is secondary.
- **Spec:** numeral hero = 35-55% of canvas height, centered horizontally or set on a 1/3 vertical anchor (x = 33% or 66%), never dead-center both axes. Supporting label (month/event name) at 4-6% of canvas height directly below/above, scale ratio ≈ 1:8 to 1:10 vs hero.
- **Whitespace:** 50-65%.
- **Content types:** event, announcement (enrollment deadline, open house date).
- **Exemplar:** Cereal Magazine issue-number treatments; editorial "save the date" posters.

### 1.5 Type Specimen
The post behaves like a type foundry specimen sheet — one word/phrase repeated at 2-3 different scales/weights to demonstrate rhythm, or a short word ladder descending in size.
- **Spec:** 2-3 stacked lines, each successive line 55-70% the size of the line above (geometric decay), left-aligned to a single vertical axis at 8-12% margin from edge. Total block height = 40-60% of canvas.
- **Whitespace:** 35-45%.
- **Content types:** announcement, manifesto, hiring ("WE ARE / HIRING / TEACHERS").
- **Exemplar:** Kinfolk 10th-anniversary Schick Toikka type suite; The Gentlewoman masthead treatments.

### 1.6 Framed Object on Field
A single object (leaf, toy, book, small hand-held item) shot small and centered-ish within a large flat color field, evoking a museum specimen card.
- **Spec:** object occupies 12-22% of canvas area, positioned on a 1/3 or 2/3 grid intersection (not dead center), flat color field fills remainder. Optional micro-label at 2-3% canvas height near an edge (8% margin).
- **Whitespace:** 70-85%.
- **Content types:** announcement, photo-moment (single artifact from classroom).
- **Exemplar:** Aesop product-on-field photography; Liewood flat-lay product shots.

### 1.7 Text-Only Manifesto
Pure typographic statement, no photo. Sets tone/values. Multiple lines of a short paragraph, editorial rag, generous leading.
- **Spec:** text block = 50-70% canvas width, margin ≥12% each side, vertically centered or upper-third anchored (y = 30-40%). Body/manifesto size = 4-6% canvas height, leading 1.3-1.4×. One word or phrase within the block may be set at 2-3× the surrounding size as an emphasis anchor.
- **Whitespace:** 40-55%.
- **Content types:** quote, manifesto, announcement.
- **Exemplar:** The Gentlewoman pull-quote pages; Cereal Magazine editorial openers.

### 1.8 Caption-as-Headline (Inverted Hierarchy)
The "caption" — normally small — is promoted to hero scale, while the photo is demoted to a small supporting thumbnail. Subverts expected hierarchy for editorial surprise.
- **Spec:** text hero = 20-30% of canvas height, anchored top or bottom third. Photo support shrinks to 15-25% of canvas width, tucked into a corner or edge (never centered), scale ratio support:hero ≈ 1:3 by area.
- **Whitespace:** 30-40%.
- **Content types:** quote, announcement.
- **Exemplar:** Cereal Magazine "reversed" spreads; independent zine editorial layouts.

### 1.9 Grid-of-Fragments
Canvas divided into 3-5 unequal rectangular cells (not a uniform grid) — a photo, a color swatch, a word, a texture — assembled like a mood-board fragment.
- **Spec:** 3-5 cells, no two cells the same size, largest cell ≥40% of canvas area, smallest ≥8%. Gutter between cells = 1.5-2.5% of canvas width. At least one cell is pure color (no image/text) to act as a rest point.
- **Whitespace:** measured per-cell; overall composition whitespace 15-25% (lowest of all archetypes — used sparingly, max 1 in 8 posts).
- **Content types:** event recap, hiring, announcement bundles.
- **Exemplar:** Kinfolk mood-board editorial pages; Cereal Magazine "notebook" spreads.

### 1.10 Edge-Hugging Label
All content pushed to one edge or corner, leaving a dramatic majority of the canvas as pure field. The opposite of centered-safe design.
- **Spec:** all text/logo elements confined to one 25% × 100% (or 100% × 25%) edge strip. Remaining 75% is untouched color or photo field. Alignment strictly to the outer edge (flush, 6-8% margin only).
- **Whitespace:** 60-75%.
- **Content types:** announcement, quote, event teaser.
- **Exemplar:** Aman print collateral; Le Labo shelf-talkers.

### 1.11 Overlapping Layered Type
Two text elements (e.g., a large word and a smaller phrase) overlap or interlock rather than stacking cleanly — controlled collision, not clutter.
- **Spec:** hero word at 25-35% canvas height; second element overlaps hero's bounding box by 10-20% of hero's height, set at 15-20% of hero's scale, placed in a corner of the hero letterforms (not centered on top). Requires high value contrast (ink vs bg) to stay legible.
- **Whitespace:** 40-50%.
- **Content types:** announcement, event.
- **Exemplar:** Contemporary editorial type posters (Pentagram-style layered title cards).

### 1.12 Portrait-in-Environment (Documentary Crop)
A candid, slightly-off-center photo of a child/classroom moment, cropped tight with generous negative space on one side for text — feels observed, not staged.
- **Spec:** subject placed on a 1/3 vertical line (x = 33% or 67%), crop leaves 35-45% of canvas as clean negative space on the opposite side for optional caption. Caption, if present, ≤5% canvas height, aligned to the negative-space side.
- **Whitespace:** 30-45% (within the negative-space zone).
- **Content types:** photo-moment, event.
- **Exemplar:** Kinfolk documentary-style family photography; Cereal Magazine travel photo-essays.

### 1.13 Monogram / Mark-as-Hero
The school's mark, initial, or a single glyph becomes the entire visual — minimal, confident, almost a wordless flex.
- **Spec:** mark occupies 15-30% of canvas area, centered on a 1/3 grid intersection or true center (this is the one archetype where dead-center is acceptable, used ≤1 in 10 posts to avoid overuse), surrounded by ≥60% flat field.
- **Whitespace:** 65-80%.
- **Content types:** announcement, brand/identity moment (rare use).
- **Exemplar:** Aman's minimal logo mark on matte fields; Aesop's restrained wordmark use.

### 1.14 Marginalia Caption
Main content (photo or color field) fills the canvas; a short caption runs vertically or in a thin strip along one margin, like a printer's slug line or a museum wall label.
- **Spec:** caption strip = 6-10% of canvas width (if vertical) or height (if horizontal), running the full length of one edge, text rotated 90° if vertical, size 2-3% of canvas height, tracked +6-10%.
- **Whitespace:** treated as part of the 6-10% strip; main field can be full photo or full color.
- **Content types:** photo-moment, quote, hiring.
- **Exemplar:** Cereal Magazine folio/running-header treatment; museum label conventions referenced by Aesop retail signage.

---

## 2. Type scale rules

1. **Display : body ratio.** Use poster-scale jumps, not classical web ratios. Hero/display type should be **6-15×** the size of the smallest body/caption text on the same canvas (classical scales like 1.25-1.618 are too conservative for single-message social posters and read as "safe/corporate" at this format).
2. **Display leading.** At display sizes (≥15% of canvas height), set line-height to **0.90-1.05×** font size — tight, poster-like. Never use body-text leading (1.4-1.6×) on hero type; it reads as a text box, not a poster.
3. **Body/support leading.** For any multi-line support or caption text, use **1.3-1.4×** leading — enough to breathe, not magazine-body-copy loose (1.5-1.6× is too slack for short captions).
4. **All-caps micro-labels.** Any label set in all-caps (eyebrows, taxonomy tags, dates) must carry **+5% to +12% letter-spacing** (0.05em-0.12em). Below 8pt-equivalent scale, push to the top of that range (+10-12%); above 24pt-equivalent, the low end (+5-6%) suffices.
5. **Sentence/mixed-case tracking.** Default to 0% (0em) tracking for mixed-case display and body text; only apply the all-caps rule above to true uppercase runs.
6. **Serif-display + sans-micro pairing.** Display/hero text uses the serif (Romie/Cormorant); all micro-labels, captions, eyebrows, and UI-adjacent text (dates, tags) use the sans (Syne for emphasis micro-labels, Fira Sans for body/caption). Never mix: a hero should not be sans, and a caption should not be the display serif — this pairing is the single most load-bearing "editorial vs. template" signal.
7. **Hero word count ceiling.** Display/hero text blocks should carry **1-6 words** (archetypes 1.1, 1.4, 1.6, 1.10, 1.13) or **1-2 short sentences ≤14 words** (archetypes 1.3, 1.7, 1.12). Beyond that, demote to body scale — long hero text is a template-smell signal (see §6).
8. **Minimum readable floor.** No text below **1.8%** of canvas height (equivalent to ~14px on a 1080px-tall canvas) even for marginalia/whisper captions — legibility floor, not a design choice.

---

## 3. Space & grid rules

1. **Whitespace budget by archetype.** Target ranges (empty/negative space as % of canvas area): edge-hugging and framed-object archetypes 60-85%; single-word and manifesto archetypes 40-60%; split and documentary-crop archetypes 20-45%; grid-of-fragments (used sparingly) 15-25%. **No archetype should ever drop below 15%** — that floor is the anti-"filled-every-corner" guardrail.
2. **Margin system.** Base margin = **8% of the shorter canvas dimension** on all four edges as the default safe zone for a 1:1 or 4:5 post. Tighten to **6%** for edge-hugging archetypes (1.10, 1.14); widen to **12%** for manifesto/quote archetypes (1.1, 1.7) where generous margin communicates restraint.
3. **Anchor grid.** Use a **thirds grid** (3×3, lines at 33.3%/66.6% both axes) as the default placement lattice — hero elements land on a third-intersection, not the exact center, in **at least 70% of generated posts**. True center placement is reserved for the Monogram archetype (1.13) and capped at ≤10% of total feed output.
4. **Off-center bias.** When an archetype allows a free x/y placement (e.g., 1.6, 1.12), bias the random placement generator so the **center 20% of the canvas (40-60% x, 40-60% y) is excluded** as a hero-anchor zone — this single rule kills most "centered-everything" template smell.
5. **Split ratios.** Any two-zone split composition must use an uneven ratio: **38:62, 35:65, or 42:58** — never 50:50, never round numbers like 40:60 that read as a slide template.
6. **Gutter/gap sizing.** Between distinct visual blocks (grid-of-fragments, split archetypes), gutter = **1.5-2.5%** of canvas width — enough to read as intentional separation, not so wide it fragments the composition.
7. **Vertical rhythm for stacked text.** When hero + support + micro-label all stack, use unequal gaps that decrease with size: hero-to-support gap ≈ **8-12%** of canvas height, support-to-micro gap ≈ **3-5%** — mimics print kerning-by-eye rather than uniform CSS-style spacing.

---

## 4. Photo treatment recipes

Exact HTML canvas implementation values. All treatments are two-layer: base photo + a color/tone layer composited on top.

1. **Brand duotone wash (primary recipe).** Draw photo at full opacity. Overlay a rectangle filled with deep green `#254E48` using `globalCompositeOperation = 'color'` at `globalAlpha = 0.35-0.45`. This preserves photographic luminosity/detail while pulling the entire hue toward brand green — the signature "premium editorial" look, not a flat filter.
2. **Ivory highlight lift.** After the duotone wash, optionally overlay `#F5F6E7` using `globalCompositeOperation = 'soft-light'` at `globalAlpha = 0.12-0.18` to lift shadows and add the warm "paper" glow characteristic of the brand's ivory field. Use on 40-50% of full-color-treated photos; skip on the rest to preserve variety.
3. **Tangerine accent tint (sparing).** For a single accent moment (not full-photo), overlay tangerine using `globalCompositeOperation = 'multiply'` at `globalAlpha = 0.08-0.12`, restricted to a masked sub-region (never the full frame) — e.g., only within the caption scrim zone. Cap usage to ≤1 in 6 photo posts to avoid the accent becoming wallpaper.
4. **Pastel wash (wisteria/celadon).** Overlay wisteria or celadon at `globalCompositeOperation = 'screen'`, `globalAlpha = 0.15-0.22` — screen mode lightens rather than muddies, appropriate for softer/quieter posts (naptime, gentle moments). Do not combine with the tangerine accent in the same image.
5. **Desaturation range.** Before any color overlay, reduce photo saturation by **15-30%** via a saturation matrix (not full grayscale) for 60% of photos — full color is preserved (0% desaturation) for high-energy photo-moment posts (art, play, outdoor); heavier desaturation (25-30%) reserved for quiet/contemplative posts (reading, rest).
6. **Full duotone (high-contrast option, used sparingly).** For archetype 1.3 (full-bleed) hero images only, an optional true duotone: convert to grayscale first (`globalCompositeOperation = 'saturation'` with a 0%-saturation source, or a luminosity matrix), then map shadows to `#254E48` and highlights to `#F5F6E7` via two gradient-color overlay passes (`multiply` for shadow pass at `alpha 0.5-0.6`, `screen` for highlight pass at `alpha 0.3-0.4`). Reserve for ≤1 in 8 posts — it's the strongest, most stylized treatment and loses impact with overuse.
7. **Grain overlay.** Composite a pre-rendered noise texture using `globalCompositeOperation = 'overlay'` at `globalAlpha = 0.04-0.08` (i.e., intensity 4-8 on a 0-100 scale) across all photo-treated posts — subtle film grain unifies the feed's texture and hides gradient-banding from the duotone passes. Never exceed `0.10` alpha; above that it reads as a dirty-lens gimmick, not editorial texture.
8. **When to keep full color, untreated.** Skip all overlays (desaturation 0%, no wash) for close-up detail/texture shots (fabric, food, craft materials) where color accuracy is the point — target **~20% of photo posts** as full-color "palate cleansers" in the feed rhythm.

---

## 5. Colour discipline rules

1. **One background + one ink, always.** Every generated post uses exactly **one background color** and **one primary ink/text color** at full commitment. A third color, if used, is an **accent only** — confined to ≤15% of canvas area (a label, an underline, a small shape), never a second competing background.
2. **Accent frequency cap.** The tangerine accent (or any saturated accent) appears in **no more than 1 in 3 consecutive posts** — enough to feel like a signature, not so often it becomes background noise.
3. **Dark/light feed rhythm.** Across any run of 6 posts, target roughly **60-70% ivory/light-background** posts to **30-40% deep-green/dark-background** posts — mirrors an editorial magazine's page rhythm (mostly light, punctuated by dark "statement" spreads). Never publish 3+ dark posts consecutively — it reads heavy on a feed grid.
4. **Pastel discipline (avoiding kindergarten cliché).** Wisteria and celadon are used as **large flat fields or duotone washes**, never as small multi-color confetti accents. A pastel post uses **one pastel + ivory or ink**, not two-or-more pastels together — multi-pastel combinations are the single fastest route to a "children's clip-art" read rather than "premium school."
5. **Saturation ceiling on pastels.** Keep pastel fields at their defined brand values without adding lighter tints on top (no "pastel of a pastel") — flattening further desaturates them into indistinct off-white, which reads as a rendering error rather than a choice.
6. **Ink contrast floor.** Text ink vs. background must meet **WCAG AA (4.5:1 for body text, 3:1 for large/display text ≥24px-equivalent)** at minimum — brand-safe pastel-on-pastel combinations that fail this are excluded from the generator's valid palette pairs entirely, not just discouraged.
7. **No gradients as background fill.** Flat color fields only for backgrounds. Gradients are permitted **only** as the caption scrim in full-bleed photo archetypes (§1.3) at ≤25% max opacity — never as a decorative background treatment. This is a direct anti-pattern guard (see §6.5).
8. **Color-to-content mapping.** Establish fixed associations so the feed feels intentional rather than randomized: deep green = announcements/formal, ivory = everyday moments/photo-moments, wisteria = quiet/rest content, celadon = nature/outdoor content, tangerine = single-CTA moments (enrollment, hiring, events). Reuse these mappings consistently across ≥80% of posts in a given content category.

---

## 6. Anti-pattern checklist

Each item is measurable — a generated post should be checked against all of these before publishing.

1. **Centered-everything.** FAIL if the hero element's bounding-box center falls within the middle **20%×20%** of the canvas (40-60% x, 40-60% y) AND the archetype is not Monogram (1.13). Check: compute hero centroid, compare to exclusion zone.
2. **Medium-sized-everything.** FAIL if the largest and smallest text elements on a canvas differ by **less than 4×** in size — indicates no real hierarchy, everything reads as one flat "medium" size. Display:body ratio must hit the 6-15× target from §2.1.
3. **Filled-every-corner.** FAIL if all four canvas quadrants (each 50%×50% corner region) contain a non-background element — at least **one quadrant must be ≥90% empty field**. Editorial compositions leave a corner or edge deliberately quiet.
4. **Decoration-as-filler.** FAIL if any shape, icon, line, or ornament exists on the canvas that is not load-bearing for hierarchy, wayfinding, or brand mark — i.e., if removing the element changes nothing about legibility or meaning, it shouldn't be there. Check: every non-text, non-photo element must map to a specific function (divider, accent underline, brand mark).
5. **Generic gradients.** FAIL if any background uses a multi-stop color gradient, or any gradient exceeds 25% opacity, or a gradient is used outside the caption-scrim context defined in §5.7.
6. **Whitespace floor breach.** FAIL if total empty/negative space on canvas is **below 15%** regardless of archetype (see §3.1) — a cluttered post is always wrong for this brand, no exceptions.
7. **Split ratio roundness.** FAIL if a two-zone composition splits at exactly 50:50, 40:60, or any multiple of 10 — must use the deliberately uneven ratios from §3.5 (38:62, 35:65, 42:58).
8. **Pairing violation.** FAIL if hero/display text is rendered in the sans family, or if a micro-label/caption is rendered in the display serif (see §2.6).
9. **Tracking omission.** FAIL if any all-caps text run has letter-spacing below +5% (0.05em) — reads as default/unstyled rather than typeset.
10. **Multi-pastel clash.** FAIL if two or more pastel colors (wisteria + celadon, or either + a third light hue) appear as adjacent fields in the same post — see §5.4.
11. **Accent overuse.** FAIL if the tangerine or any single accent color appears in more than 1 of any 3 consecutive feed posts (see §5.2).
12. **Dark-post clustering.** FAIL if 3 or more consecutive feed posts all use deep-green (dark) backgrounds — breaks the light/dark rhythm in §5.3.
13. **Contrast failure.** FAIL if computed contrast ratio between ink and background is below 4.5:1 (body) / 3:1 (display) — hard accessibility + legibility gate, see §5.6.
14. **Hero word-count overflow.** FAIL if a display/hero text block exceeds the word ceilings in §2.7 (6 words for label-style heroes, 14 words for sentence-style heroes) — long hero text signals the layout defaulted to "put everything in the big box" rather than choosing an archetype.
15. **Uniform grid smell.** FAIL if a grid-of-fragments composition (1.9) has any two cells within 5% of the same area — must show clear size hierarchy between fragments, not a uniform tile grid.
16. **Grain overuse.** FAIL if grain-overlay alpha exceeds 0.10, or if grain is applied to a flat-color (non-photo) background — grain belongs to photographic treatment only (§4.7).
