# Visual Language Research — Editorial Composition Patterns

> **DRAFT** — this is a research-grounded draft pattern taxonomy, compiled from public design
> literature and observed practice at premium editorial/lifestyle/hospitality/kids brands. It is
> NOT yet validated against The White Orchid's own curated client reference set. Treat every
> archetype and number below as a **starting hypothesis to be merged, pruned, and re-weighted**
> once the client reference analysis lands — do not hard-code these as final production values
> without that reconciliation pass. Sources are cited inline by brand/publication/study name
> (no URLs, per research convention established in `format-design-spec.md`).

Notation matches `format-design-spec.md`: all positions/sizes are **fractions of canvas W/H**
unless marked px. "Hero" = the single dominant focal element (photo, word, or number). "Scale
ratio vs hero" = supporting text em-height ÷ hero em-height (or hero-element height, for
photo heroes).

---

## 1 Archetype library

### 1.1 Oversized single word + micro caption
One or two words set at poster scale dominate the canvas; a tiny caption or brand mark
anchors the bottom. The word *is* the image — no photo needed.
- **Hero:** text block, x,y,w,h ≈ `.08,.30,.84,.40`, occupying **55–70%** of canvas width at
  cap-height, 1 line (rarely 2).
- **Supporting:** micro-caption at `.08,.86,.84,.06`, scale ratio **0.06–0.10×** vs hero.
- **Whitespace:** **45–60%** of canvas empty (pure bg color, no texture).
- **Grid:** single-axis left or center alignment; no competing elements.
- **Suits:** announcement, brand statement, single-word campaign ("QUIET", "GROWTH").
- **Exemplar:** Cereal Magazine section-breaker spreads; Swiss poster tradition (Müller-Brockmann)
  — oversized typography as sole compositional device (Big Human 2026, Poster House Swiss Grid).

### 1.2 Asymmetric editorial split
Canvas divided unevenly (not 50/50) between a photo block and a text block, echoing Kinfolk's
signature "photo top-right, text bottom-left" imbalance.
- **Hero (photo):** `.34,.00,.66,.62` or mirrored — occupies **55–66%** of one axis, never 50%.
- **Supporting (text):** opposite corner, `.00,.62,.60,.38`, scale ratio **0.12–0.18×** vs hero
  photo's bounding height.
- **Whitespace:** **20–30%**, concentrated as a single deliberate gap between the two blocks
  (not scattered).
- **Grid:** two-zone asymmetric — never a centered 50/50 split.
- **Suits:** photo moment, quote-with-image, seasonal feature.
- **Exemplar:** Kinfolk (post-2021 redesign) — "Kinfolk rarely centers anything... photo top
  right, text block bottom left... creates active white space" (Visual Journal Craft 2026,
  theend.com.au).

### 1.3 Full-bleed photo + whisper caption
Photo fills 100% of canvas; a single short line of type sits quietly in a corner or lower
third, barely announcing itself.
- **Hero:** photo, full-bleed `0,0,1,1`.
- **Supporting:** caption text zone `.08,.86,.60,.08` or `.08,.06,.60,.08`, scale ratio
  **0.03–0.06×** vs canvas height (genuinely small — this is the "whisper").
- **Whitespace:** 0% literal (photo fills frame) but **≥85%** of the photo itself must be
  visually quiet/uncluttered near the text zone for the whisper to read.
- **Grid:** single anchor point, off-center (rule-of-thirds corner), never centered.
- **Suits:** photo moment, seasonal/atmosphere post, brand mood.
- **Exemplar:** Aesop — "clean lines... muted color palette," store/product imagery with
  minimal or no overlay text (Medium/Yiqian Feng 2026); Aman Resorts photography-led social
  presence (Colville-Walker, Construct/BP&O 2026).

### 1.4 Big number / date poster
A single large numeral or date dominates; all other info (event name, location) is reduced to
small supporting labels stacked below or beside it.
- **Hero:** numeral/date, `.10,.18,.80,.50`, occupying **50–65%** of canvas height, set in
  display serif or condensed sans.
- **Supporting:** 2–3 label lines beneath, `.10,.70,.80,.22`, scale ratio **0.08–0.14×** vs
  hero numeral — headline should be "at least 3× the size of your body text" as an absolute
  floor, poster-scale work pushes 6–10×+ (GraphMake 2026, Venngage 2026).
- **Whitespace:** **35–50%**.
- **Grid:** centered or left-aligned single column; numeral is the sole grid anchor.
- **Suits:** event, date-driven announcement (open house, enrollment deadline, term start).
- **Exemplar:** Swiss/International Typographic Style event posters (Müller-Brockmann tradition);
  contemporary editorial date-typography treatments (Pinterest/date-typography-design corpus,
  Venngage event poster guidance 2026).

### 1.5 Type specimen (scale-stacked headline system)
Multiple weights/sizes of the same word or phrase stack to create a self-contained
typographic composition — the "poster IS the type test."
- **Hero:** largest instance, `.05,.10,.90,.35`, at **90–100%** width.
- **Supporting:** 2–3 descending-scale repeats of related text, each subsequent tier at
  roughly **0.5–0.7×** the tier above (geometric scale-down, not linear).
- **Whitespace:** **30–45%**, distributed as gaps *between* type tiers rather than framing
  margins.
- **Grid:** single-column vertical stack, left-aligned baseline grid.
- **Suits:** brand statement, philosophy/manifesto excerpt, typographic identity moment.
- **Exemplar:** classic type-specimen poster tradition — "one or two oversized letters/words
  fill the page with surrounding text shaped around it" (Kreafolk 2026, AIGA teaching resource).

### 1.6 Framed object on field
A single photographed object (not a person) — a toy, a leaf, a craft piece — sits small and
centered (or off-center) on a large flat field of brand color, like a museum specimen.
- **Hero:** object photo, small — **18–32%** of canvas width, centered at `.34,.30,.32,.32`
  or off-center at a rule-of-thirds point.
- **Supporting:** caption/label below or beside, scale ratio **0.05–0.09×** vs canvas height.
- **Whitespace:** **60–75%** — the highest whitespace ratio of any archetype; the field itself
  is the statement.
- **Grid:** single focal point, often placed at a rule-of-thirds intersection rather than dead
  center to avoid a "sticker on a card" feel.
- **Suits:** product/material moment, craft highlight, single-item photo moment.
- **Exemplar:** Aesop product photography on flat brand-color fields; Liewood and Konges Sløjd
  product-on-field Instagram tiles — "pure shapes, delicate prints, muted colours" styled as
  isolated objects (Liewood brand materials, House of Henmar 2026).

### 1.7 Text-only manifesto
No photo; a short paragraph (not a single word) of brand voice, set in body-adjacent scale but
with generous line-height and margin, reading like a printed page excerpt.
- **Hero:** text block, `.14,.20,.72,.55`, width capped at **~60–72%** of canvas (never
  full-bleed — a manifesto needs a "page" feel, not a billboard feel).
- **Supporting:** small attribution/signature line below, scale ratio **0.10–0.15×** vs body
  text.
- **Whitespace:** **40–55%**, concentrated as uniform margins on all 4 sides.
- **Grid:** single centered or left-aligned column, generous leading (**1.3–1.5×** — body
  text, unlike display, wants MORE leading, not less).
- **Suits:** brand statement, philosophy, values/mission post.
- **Exemplar:** Le Labo's "Le Journal" tongue-in-cheek editorial voice (Bondfire Inc. 2026);
  The Gentlewoman's clean grid-based body copy treatment (Fonts In Use, no. 30).

### 1.8 Quote with generous margin
Attributed quote, centered, set at a moderate (not poster-huge) scale, surrounded by
disproportionate empty space — the quote earns its room rather than filling the frame.
- **Hero:** quote text, `.14,.32,.72,.32`, max **3–5 lines**, scale ratio to canvas height
  ~**0.06–0.10×** per line.
- **Supporting:** attribution line directly below quote, scale ratio **0.35–0.45×** vs quote
  text (noticeably smaller, not equal).
- **Whitespace:** **50–65%**.
- **Grid:** centered single column, generous top/bottom margin (**≥15% H each**).
- **Suits:** quote, testimonial, values statement.
- **Exemplar:** Kinfolk generous-margin quote spreads — "margins are huge... this isn't wasted
  space, it's a frame... signals the content deserves a grand stage" (Visual Journal Craft
  2026).

### 1.9 Documentary photo moment (candid, uncaptioned or barely captioned)
A single candid, unstaged-feeling photo with minimal or no text overlay — the photo's honesty
is the message.
- **Hero:** photo, full-bleed or **92–96%** bleed with a thin brand-color border/frame.
- **Supporting:** none, or a single line of metadata-style text (date, location) at
  **0.03–0.05×** scale in a corner.
- **Whitespace:** 0–8% (thin border only, if any).
- **Grid:** no grid — the photo's internal composition (rule-of-thirds subject placement) does
  the work.
- **Suits:** photo moment, behind-the-scenes, activity/classroom documentation.
- **Exemplar:** Le Labo's "disruptive... lo-fi... gritty" raw photography approach that
  deliberately avoids polish (Motion/Le Labo case study 2026); Reggio Emilia pedagogical
  documentation aesthetic — "children's own artwork and project documentation displayed
  beautifully" (Reggio practice literature).

### 1.10 Two-tier hierarchy card (label + headline)
A small all-caps eyebrow label sits above a large headline — the classic editorial
"kicker + headline" pattern, adapted to square format.
- **Hero:** headline, `.10,.36,.80,.30`, **1–3 lines**.
- **Supporting:** eyebrow label directly above headline, `.10,.28,.80,.06`, scale ratio
  **0.10–0.15×** vs headline, all-caps, letterspaced **+0.08–0.12em** (see §2).
- **Whitespace:** **35–50%**.
- **Grid:** single left or center column; label and headline share the same left edge
  (alignment discipline is the "designed" tell).
- **Suits:** announcement, event, hiring/opportunity post.
- **Exemplar:** The Gentlewoman's "Parts One, Two..." section-opener labeling convention
  (Fonts In Use); Cereal Magazine's small-caps hierarchy system (Studio Faculty 2026).

### 1.11 Side-by-side portrait + credential block
A subject photo occupies one vertical half; a name/title/quote block occupies the other —
adapted from magazine profile spreads (maps directly to `photo_logo` wide-format rule already
in `format-design-spec.md` §1.1).
- **Hero:** photo, **45–55%** of one axis (never past 55% — leaves room for the text block
  to breathe, not feel like an afterthought).
- **Supporting:** name/title stack, scale ratio **0.15–0.22×** vs photo height, left-aligned
  within its half.
- **Whitespace:** **15–25%**, as a gutter between the two halves.
- **Grid:** strict two-column split, vertical center gutter **4–8% W**.
- **Suits:** hiring (staff spotlight), announcement (new teacher/director), testimonial.
- **Exemplar:** The Gentlewoman profile-page convention; Cereal Magazine's 8-column grid used
  to produce clean 40/60 or 45/55 photo/text splits (Studio Faculty 2026).

### 1.12 Seasonal/textural pattern field (no photo, no dominant word)
A tone-on-tone pattern, texture, or gradient wash (paper grain, fabric weave, botanical
line-art) fills most of the frame with a small brand mark or single short line — used for
in-between feed posts that maintain rhythm without new photography.
- **Hero:** the texture/pattern itself, full-bleed.
- **Supporting:** small mark/word, **≤12%** of canvas width, placed at a rule-of-thirds point,
  never centered.
- **Whitespace:** N/A (textural fill) but must read as **low-contrast/quiet** — texture
  variance kept low so it doesn't compete visually (see quiet-region heuristic in
  `format-design-spec.md` §3: cell variance target < 0.015).
- **Grid:** single off-center anchor.
- **Suits:** feed-rhythm filler, seasonal transition, textile/material highlight.
- **Exemplar:** Konges Sløjd's "iconic prints — Vichy checks, polka dots, Fair Isle" used as
  standalone pattern-forward tiles (House of Henmar 2026); Aman's "earthy... tactile material
  texture" applied as a design language beyond photography (Construct/BP&O 2026).

### 1.13 Framed petal/brand-shape window (White-Orchid-specific hybrid)
A brand-shape mask (the orchid petal frame already in the engine) clips a photo inside it,
with text living entirely in the solid-bg region outside — directly maps to the
frame-aware composition rule in `format-design-spec.md` §7.
- **Hero:** framed photo, shape bounding box **45–70%** of canvas (per §7's existing
  scale·W sizing).
- **Supporting:** text block in the largest clear solid-bg strip outside the frame, scale
  ratio **0.10–0.18×** vs frame height, per §7's ≥16%H×≥45%W (horizontal) or
  ≥30%W×≥40%H (vertical) strip thresholds.
- **Whitespace:** **25–40%** (the solid-bg region carrying the text).
- **Grid:** shape-anchored, not grid-anchored — the petal boundary IS the grid line.
- **Suits:** photo moment, announcement, any type needing strong brand-shape recognition.
- **Exemplar:** this is a house archetype unique to White Orchid's petal-frame system; closest
  external analogue is die-cut/shaped-window editorial spreads (rare in the researched set —
  flag for validation against client references specifically, since no external brand in this
  research set uses a literal brand-shape photo mask).

---

## 2 Type scale rules

- **Display-to-body ratio:** classical type scales (Perfect Fourth 1.333×, Augmented Fourth
  1.414×, Perfect Fifth 1.500×) govern UI/web hierarchy; **poster/editorial work uses much
  larger jumps** — headline should be **at minimum 3×** body/caption size, and true
  poster-scale hero-to-micro-caption ratios in the archetypes above run **6–15×** (e.g. §1.1's
  hero-word-to-micro-caption ratio of 0.06–0.10× supporting = **10–17× the reverse**)
  (GraphMake 2026, Venngage 2026, cieden.com type-scale taxonomy).
- **Leading at display sizes:** tighten to **0.95–1.10 unitless** (95–110% of font size) for
  headline/display type — "as type gets larger, space between lines appears progressively
  larger, calling for less line spacing" (ofspace.co, 99designs 2026). All-caps display can go
  tighter still, even negative leading, since there are no descenders to protect.
- **Leading at body/manifesto sizes:** loosen to **1.20–1.50×** — the opposite direction from
  display; a manifesto block (§1.7) should read closer to 1.3–1.5× not tight poster leading.
- **Letterspacing for all-caps micro-labels:** **+0.05 to +0.12em (5–12%)**, with the tighter
  end for larger label sizes and the looser end for very small labels (footer-scale,
  eyebrow-scale) — smaller type needs proportionally MORE tracking to stay legible
  (Butterick's Practical Typography, Pimp My Type, Techstacker 2026).
- **Serif display + sans micro-caption pairing:** matches White Orchid's own stack
  (Romie/Cormorant display + Syne/Fira Sans body) and is a documented premium-editorial
  convention — Cereal Magazine pairs Garamond serif (headlines/body) with Gill Sans
  (captions/credits) at **8.5pt body / 6pt caption**, i.e. captions run **~70% of body
  size**, reinforcing that supporting type should be a distinct family AND distinctly smaller,
  not just a weight change (Studio Faculty 2026).
- **Font-count discipline:** cap at **2 typefaces per composition** (1 display + 1
  sans/micro), consistent across Cereal, Gentlewoman, and general poster-design guidance
  ("limit fonts to no more than two types" — urc.ucdavis.edu poster handout).
- **Legibility-distance floor (adapt for screen viewing distance, not print):** print poster
  guidance scales font size to viewing distance (30pt @ 6ft, 48pt @ 10ft) — the screen
  analogue is that Story/Reels (viewed full-screen, closer, in motion) justifies the existing
  **1.10× boost** already in `format-design-spec.md` §1.1, and this research corroborates that
  direction rather than contradicting it.

---

## 3 Space & grid rules

- **Whitespace-by-archetype range observed:** **20% (asymmetric split) to 75% (framed object
  on field)** — there is no single "correct" whitespace percentage; it is archetype-dependent,
  but **every archetype in §1 exceeds 20%**, and the median across all 13 is **~42%**. Treat
  <20% empty canvas as a hard warning sign of overcrowding for this brand tier.
- **Margin system — generous uniform margins over bleed-to-edge:** Kinfolk's redesign
  philosophy treats margin as "a frame... signals value by giving content room" (Visual
  Journal Craft 2026) — prefer **uniform margins of 8–14% W/H** on text-forward archetypes
  (manifesto, quote, type specimen) over the tighter 5–6% "generic editorial margin" already
  used for photo-forward formats in `format-design-spec.md` §1.0. Photo-forward/full-bleed
  archetypes (§1.3, §1.9) intentionally invert this and go to 0% margin — the split itself
  (generous-margin text vs. zero-margin photo) is the signal of intentional design, not a
  fixed universal margin number.
- **Asymmetric ratio for split compositions:** when dividing canvas between two content
  blocks, use **55/45 to 66/34** — never 50/50 (reads as a template/table, not a composition)
  and never past ~70/30 (reads as one element being an afterthought) (Digitalcreativedev/
  Medium 2026 asymmetric grid analysis; Kinfolk practice).
- **Rule-of-thirds anchoring:** place the single focal point of low-whitespace-need archetypes
  (framed object, documentary photo) at one of the **4 rule-of-thirds intersections** (≈0.33/
  0.67 on each axis), not canvas center — "headline sits along the upper third line, primary
  image anchors to a left or right intersection" (CareerFoundry 2026, ixdf.org).
- **Column discipline:** an **8-column grid** (Cereal Magazine's system) is a reasonable base
  module for generator layouts needing more than the current 2-zone (text-zone + logo)
  system — supports 1-col (full-width manifesto), 3-col (asymmetric split ~3:5), and 4-col
  (50/50, used sparingly) compositions without ad hoc math (Studio Faculty 2026).
- **Grey-tone/neutral discipline in grid systems:** Cereal Magazine's redesign also caps
  **3 grey tones** total for structural elements (rules, backgrounds, secondary text) —
  suggests White Orchid's engine should similarly cap non-brand neutral tones used for
  hairlines/dividers at **≤3** distinct values.

---

## 4 Photo treatment recipes

Canvas-implementable via `globalCompositeOperation` + `globalAlpha`. Numbers below are
starting points for the engine, sourced from documented duotone/tint practice — validate
visually against brand hex values (#254E48 deep green, tangerine accent) before locking in.

| Treatment | `globalCompositeOperation` | Opacity | Notes |
|---|---|---|---|
| **Classic duotone** (strong brand-color wash, shadows-to-highlights) | `multiply` | **0.60–0.80** | "Multiply combined with a saturated color at 60–80% opacity typically gives a classic duotone look" (blend-mode literature synthesis 2026). Use deep green #254E48 as the multiply color for a moody, editorial-strength tint. |
| **Light wash / lift** (brightens, lightens photo, airy feel) | `screen` | **0.15–0.35** | Screen mode inverts-multiplies-inverts, always lightens — good for ivory/pastel overlay washes on darker source photos. |
| **Restrained tint** (subtle brand-color hint, preserves photo detail/contrast) | `soft-light` | **0.30–0.45** | "For a light photo tint, start with Soft Light, Strength 30–45%, Base Saturation 100%, neutral Contrast" — softer than multiply/overlay, bases effect on luminance so it doesn't crush shadows (documented gradient-map/tint workflow 2026). |
| **Flat color-overlay tint** (uniform brand-color veil, not luminance-dependent) | `color` | **0.20–0.35** | Preserves luminance structure while fully replacing hue/saturation — useful when the goal is "every photo reads as the same brand color family" regardless of source photo's original palette. |
| **Existing per-type tint (already in engine)** | (current: solid overlay) | up to **+0.10 alpha bounded deepening** per `format-design-spec.md` §2 | Cross-reference: the Auto-ladder's tint-deepening step should stay within the 0.10 delta already specified — don't let new duotone recipes override that existing legibility contract. |

- **Desaturation range:** **25–40%** reduction from source saturation as the brand-consistency
  starting band — "pulling every image down to 25–40% desaturation suppresses the color
  differences that make photos clash" and correlates with luxury/sophistication perception
  vs. high-saturation reading as mass-market (consumer-psychology synthesis 2026, VSCO/Imagen
  AI tooling documentation). White Orchid photos (preschool activity shots, varied lighting)
  are good candidates for the higher end (**35–40%**) of this range to unify a naturally
  chaotic source set.
- **Full-color vs. treated:** premium brands reserve **full, untreated color** for genuinely
  strong/branded-already imagery (Aesop, Aman — photography that's already art-directed at
  the shoot) and apply **duotone/tint treatment** as the default for user-submitted or
  variable-quality source photos to enforce consistency — i.e. treatment is a *consistency
  tool for imperfect inputs*, not a universal aesthetic mandate. For White Orchid (parent/
  teacher-submitted classroom photos = variable quality), **default to treated (soft-light or
  color tint at 0.25–0.35)** rather than raw.
- **Film grain / texture overlay:** if used at all, **opacity 0.20–0.30**, never above
  ~0.40–0.45 even for a "heavier" look — "use the lowest visible setting... less is more...
  especially for commercial, branded, high-end client work" (grain-overlay tooling
  documentation 2026). Recommend this as an optional, low-priority polish layer, not a
  default — the White Orchid photo set (bright, warm, editorial) doesn't need vintage-film
  cues that could read as generically "curated Instagram filter" rather than brand-specific.

---

## 5 Colour discipline rules

- **Palette cap per single post:** **1 background + 1 ink (text) + optional 1 accent** — the
  "5-color feed palette, 2-3 colors per individual post" convention observed across
  brand-consistency guidance (deerdesigner.com, manypixels.co 2026) maps directly onto
  White Orchid's own bg/ink/accent brand system (ivory/celadon/wisteria backgrounds, deep
  green ink, tangerine accent). **Never use more than 1 accent color in a single composition**
  — tangerine appears once (a badge, a rule, a single word) or not at all, never as a second
  competing accent alongside e.g. wisteria in the same post.
- **Feed-level palette cap:** **4–6 total colors** across the full rotating set (1 dominant
  bg, 2–3 brand colors, 1–2 accents) is the practical sweet spot cited across brand-Instagram
  guidance — White Orchid's existing palette (ivory, celadon, wisteria, deep green, tangerine)
  sits right at this ceiling; **do not add new hues** to the generator's palette without
  retiring one.
- **Dark/light post rhythm:** premium feeds either commit fully to one register (Le Labo's
  black/white high-contrast; a "dark moody theme" for luxury/artistic accounts) or
  deliberately **alternate** dark-bg and light-bg posts for rhythm while keeping the same 2–3
  anchor hues (plannthat.com 2026, grid34sync.com). Recommend the generator support an
  explicit **dark-bg mode** (deep green #254E48 as background, ivory as ink) as a first-class
  alternate to the current ivory-dominant default — not just as a text-legibility fallback,
  but as an intentional ~1-in-4 to 1-in-6 feed-rhythm post.
- **Pastel-without-childish rule:** the preschool trap is avoided by (a) **never pairing 2+
  saturated pastels in the same composition** — pastel wisteria/celadon should each appear
  against a *neutral* (ivory) or *dark* (deep green) ground, not against each other; (b)
  **counterbalancing every pastel field with at least one dark/structured element** (deep
  green type, a thin rule, a serif headline) — "team pastels with strong, dark colors to
  counterbalance them... changes character from pretty and restful to dramatic and edgy"
  (livingetc.com 2026 synthesis); (c) **keep pastels desaturated, not saturated** — the
  primary-color kindergarten cliché specifically means high-chroma reds/yellows/blues, which
  White Orchid's palette already avoids by design, but the same discipline should extend to
  any new accent added later.
- **No gradient backgrounds as a default:** per the anti-pattern research (§6), avoid the
  generic gradient-background reflex — if a gradient/wash is used at all, it must be a
  **duotone photo treatment (§4)**, never a flat UI-style gradient behind text.

---

## 6 Anti-pattern checklist

Each item is a measurable/checkable condition the generator (or a human QA pass) can test
against a rendered composition.

1. **No more than 1 element within 5% of exact canvas center** (`|x-0.5| < 0.05 AND
   |y-0.5| < 0.05`) unless it is the sole focal element in the frame — centered-everything is
   the #1 flagged AI-slop/template tell (developersdigest.tech 2026).
2. **No two text blocks within 15% of the same font-scale value** — "medium-sized-everything"
   (flat hierarchy) reads as unstyled; every composition needs at least one **3×+ scale jump**
   between its largest and second-largest text element (per §2's display-to-body ratio floor).
3. **At least 20% of canvas must be empty/uncluttered background** — reject any composition
   where whitespace falls under the 20% floor established in §3 (measured as % of canvas not
   covered by photo detail, text glyphs, or graphic elements).
4. **No gradient fills behind text** unless it is a documented photo-duotone treatment from
   §4 — flat two-stop UI gradients (the "purple-to-blue" AI-slop signature, generalized to
   any hue pair) are banned outright; 27% of flagged AI-generated designs use exactly this
   tell (developersdigest.tech 2026 pattern audit).
5. **No decorative element that doesn't carry information** — every non-photo, non-text
   graphic element (rule, dot, shape) must either mark a hierarchy boundary (divider between
   sections) or be the brand mark itself; "decoration-as-filler" (a shape added purely because
   a corner looked empty) is banned — an empty corner is preferable to a meaningless one per
   §3's whitespace-is-a-feature principle.
6. **Maximum 2 typefaces per composition** (checkable: count distinct font-family values in
   render tree) — see §2.
7. **Maximum 1 accent color per composition, 4-6 total across the palette** — see §5
   (checkable: count distinct non-bg/non-ink hex values used).
8. **No filled corners rule:** at least 2 of the 4 canvas corners (each defined as the outer
   10% × 10% corner square) must be empty of any element (text, photo detail edge, graphic) —
   "filled-every-corner" is a template tell; premium editorial compositions leave visible
   negative-space corners (consistent with Kinfolk/Cereal margin philosophy in §3).
9. **No 50/50 splits** — any two-zone composition must use an asymmetric ratio between
   **55/45 and 70/30** (see §3); a checkable render-time assertion: zone-width ratio must not
   fall within `0.47–0.53` of canvas width.
10. **Icon-in-rounded-square avoidance:** no small icon inside a rounded-square/circle
    container used as a purely decorative bullet — flagged as "the universal AI feature-card
    template" (developersdigest.tech 2026); if an icon is needed, it should be a custom
    line-art brand mark, not a generic container shape.
11. **Dark-mode-by-default avoidance:** do not default new post types to a dark background
    without an explicit reason — permanent/reflexive dark mode is "the single most common AI
    tell" at ~34% of flagged designs (developersdigest.tech 2026); dark-bg posts should be an
    **intentional ~1-in-4 to 1-in-6 rhythm choice** (§5), not the generator's default state.
12. **All-caps without tracking ban:** any all-caps text block must carry
    **+0.05em to +0.12em** letterspacing (checkable: `letter-spacing` property present and
    within range) — untracked all-caps at small sizes is a readability and polish tell (§2).
13. **No more than 3 lines for any single text tier at poster/hero scale** — a hero text
    block wrapping to 4+ lines signals the type is undersized for its content and should
    either shrink the content (per `format-design-spec.md` §6 drop rules) or the composition
    should shift to a lower-density archetype (e.g. text_post/manifesto instead of
    oversized-word).
14. **Contrast floor still applies (cross-reference):** every anti-pattern fix must stay
    inside the existing 4.5:1 WCAG floor from `format-design-spec.md` §3 — an edgy asymmetric
    composition that fails legibility is not a win.
