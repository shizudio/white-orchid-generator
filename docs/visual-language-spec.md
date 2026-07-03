# Visual Language Spec — FINAL

White Orchid Content Studio — the target-taste composition spec that drives the generative
layout engine. Supersedes `visual-language-research.md` (draft A) and
`visual-language-research-b.md` (draft B) where they conflict. Notation matches
`format-design-spec.md`: all positions/sizes are **fractions of canvas W/H** unless marked px.
"Hero" = the single dominant element (word, number, or photo). "Scale ratio" = support
em-height ÷ hero em-height. Every rule is numeric so it can be asserted at render time.

## 0. Sources & method

Derived from **two reference sets**: (A) 7 client-admired luxury-fashion/editorial grids
(Bloom's/Basilare/travel-editorial/Mono-agency/Aesop/Garden-Flowers/New-Bloom) and (B) **~32
childcare/kids-brand references** the client added later (Kids Klub, Baby Prodigy, Toyto, The
Practice Space, Little Sparks, Tiny Haven, Treehouse, Children's-Hospital, plus editorial kids
photography). Set A shows the pure *aesthetic ambition*; set B shows the *domain translation*
— how that discipline reads in an actual kids/education context. Read directly, cross-cut for
shared properties, then reconciled against drafts A+B and the ~18-image "Boring" set of current
output. **References win all conflicts.**

**The two-source synthesis (the brand).** The editorial *spine* comes from set A; the *warmth*
comes from set B; the brand is their disciplined marriage. Set A = desaturated, serif-only,
one warm accent, muted. Set B = lighter, ivory-dominant, a curated pastel palette, near-full-
color grainy photography, occasional bold-sans hero, and a small rationed vocabulary of playful
devices (stickers, organic shape-masked photo windows, arc-script banners). Playfulness stays
*premium* by one rule: **never stack more than one warmth device per post, and never at the
cost of hierarchy or whitespace.** Where B moves a number, it moves it toward lighter/warmer.

**The taste in one paragraph.** The target is *quiet editorial confidence, warmed for
children*: an oversized **serif** display word or short phrase (Romie/Cormorant), often mixing
roman + italic to italicize one emphasis word, set 8–12× larger than a small sans caption so
hierarchy reads instantly. A **heavy rounded/grotesque sans hero** is a permitted *secondary*
register (set B uses it for warmth — "Freedom to explore", "Early Learning"), never the muddy
mid-weight sans-caps of the Boring set. The hero anchors **off-center — top-left or filling the
upper canvas, never a centered mid-canvas column** — over one of three photo treatments: a
**luminance-preserving duotone** (deep-green wash keeping contrast, not a flat veil), a **small
framed/arch photo card floated on a solid field**, or **near-full-color film-grain photography**
(set B's default). Roughly one post in four carries **no photo** — a solid ivory, deep-green, or
soft-pastel field. Whitespace runs 40–60%; a **single** accent (softened tangerine/coral, the
green, or one curated pastel) is the only color beyond bg+ink — *except* an optional playful
multicolor logotype, which is exempt. Hairline rules, an underline, a numeral label, one
sticker/star flourish, an organic shape-masked photo window, or type overlapping the photo edge
are the "designed, not templated" tells. It should feel like *Kinfolk / Cereal / Aesop* crossed
with *Bobo Choses / Kids Klub* — never like a slide with a caption box.

---

## 1. The 5 systematic failures of current output

Ordered by severity. Each is the gap between the Boring set and the reference-derived rules,
with the numeric fix.

1. **Hero is set in mid-weight SANS caps, not serif or heavy display sans.** ~10/13 Boring posts
   render the headline in flat medium sans (WELCOME BACK TO SCHOOL, EARLY CHILDHOOD EDUCATORS,
   MONDAY 14 JULY, NOW ENROLLING). Set A makes the serif (Romie/Cormorant) the hero. **Fix
   (rev: childcare set):** hero MUST be either (a) the **display serif** (default), or (b) a
   **heavy rounded/grotesque display sans** at ≥700 weight used as a deliberate poster hero
   (set B: "Freedom to explore", "The World of Early Learning"). BANNED: mid-weight (400–600)
   sans as hero, and thin sans-caps as hero. Assert `hero.font ∈ {display-serif, display-sans-
   heavy}` AND `hero.weight ≥ 700` when sans. The heavy-sans hero is capped at **~1-in-3 posts**
   so the serif stays the dominant voice.

2. **Flat uniform veil over the full photo (single alpha ~0.45–0.55) reads muddy.** Every
   photo Boring post drops one flat rectangle of bg color over the entire image at ~50% —
   killing the photo's contrast into a lavender/olive haze (monday-14-july, welcome-back,
   welcome-alice). References never do this: they use a **luminance-preserving duotone**
   (`color`/`multiply` that keeps photo contrast) OR **float a small framed photo card** on a
   solid field. **Fix:** ban the full-canvas flat overlay ≥0.30 alpha; replace with §3 duotone
   recipes (`color` 0.35–0.45 or `multiply` shadow pass) or the floated-card treatment.

3. **Flat hierarchy — hero:support ratio only ~2.0–2.5×.** Eyebrow, hero and caption sit at
   near-equal weights ("medium-everything"). References average **~9×** hero-to-caption (range
   7–12×). **Fix:** enforce ≥6× between the largest and smallest text tier on the canvas
   (target 8–10×); no two text tiers within 15% of the same size.

4. **Centered mid-canvas column + one monotonous archetype for every post type.** Text is a
   left-aligned block floating in the vertical middle, and quote/event/hiring/announcement all
   look identical (photo + veil + stack). References anchor the hero **top-left or filling the
   upper 60%**, exclude the canvas center, and vary the archetype by post type. **Fix:** hero
   centroid must sit outside the center 20%×20% zone (0.40–0.60 both axes); ≥70% of posts
   anchor on a thirds line; route post types to distinct archetypes per §2.

5. **One stock photo everywhere, no solid-field or floated-card rhythm, plus render bugs.**
   The same blurry running-kids image backs nearly every post; there are zero
   no-photo/solid-color posts, and the screenshots show real defects — **ghost eyebrow text at
   ~5% alpha** (illegible "JUNE PARENT WORKSHOP"), **logo colliding with the headline**, and
   **overlapping text** (OPEN HOUSE over the 18), plus a **muddy gray-purple gradient
   background** (WE'RE HIRING) that violates the no-gradient rule. **Fix:** target ~1-in-4
   no-photo solid-field posts and ~1-in-5 floated-card posts (§3); assert min text alpha
   ≥0.85, no element bounding-box overlap between logo/hero/eyebrow, no gradient bg fills.

---

## 2. Archetype library — FINAL

12 archetypes. Merged from drafts A+B, pruned to those the references validate or research
strongly supports, renumbered, with numbers tuned to both reference sets. Each tagged
**VALIDATED** (seen in ≥2 refs), **RESEARCH** (plausible, not in refs), or
**VALIDATED-BY-RULING** (client-mandated + grounded in principles). Positions are `x,y,w,h`
fractions. §2.11–2.12 are new from the childcare set / client ruling.

### 2.1 Oversized Serif Word — **VALIDATED** (Bloom's, travel, New-Bloom, Mono)
One or two serif words at poster scale *are* the image; a micro caption does the info work.
- **Hero:** serif display, `.06,.14,.88,.42`, cap-height **28–45% of canvas H**, ≤3 lines.
  Mix roman + italic to italicize the emphasis word (§3 type).
- **Eyebrow (optional):** small line above, `.06,.08,.60,.05`, scale ratio **0.09–0.12×**.
- **Caption:** below hero, `.06,.60,.70,.08`, scale ratio **0.08–0.11×** (i.e. 9–12× jump).
- **Whitespace:** 45–60%. **Anchor:** top-left or upper-fill, hero left edge = eyebrow left edge.
- **Palette:** 1 bg (ivory or green) + 1 ink; accent ≤1 (a coral word, an underline).
- **Photo:** none, OR one small framed card floated in a lower corner (≤22% W).
- **Logo:** small, bottom corner opposite the caption, ≤0.10 min(W,H).
- **Suits:** announcement, quote, brand statement. **Exemplar:** Bloom's "guia" / "leve:".

### 2.2 Asymmetric Editorial Split — **VALIDATED** (Aesop, open-house banner)
Canvas divided unevenly between a photo block and a solid text block; seam off-center.
- **Split:** **58/42 to 62/38**, never 50/50. Photo takes the larger share ~60% of the time.
- **Text block:** solid brand field, inset 8–10% margin, text aligned to the **seam edge**.
- **Hero:** serif, scale ratio to canvas H ~0.14×. **Caption/details:** 0.06–0.08×.
- **Whitespace:** 20–30% inside the text block. **Gutter:** 0 (hard seam) or 1.5–2.5% W.
- **Photo treatment:** duotone (§3) or lightly-treated; hairline rule may divide info tiers.
- **Suits:** event, hiring, photo-moment, announcement. **Exemplar:** Aesop body-balm split.

### 2.3 Big Number / Date — **VALIDATED** (New-Bloom "73%", Garden "01./02.", open-house "18")
A numeral/date at poster scale is the hero; everything else is a small label.
- **Hero numeral:** serif, **35–52% of canvas H**, on a thirds x-anchor (`x≈.33` or `.67`),
  never dead-center both axes.
- **Labels:** month/context lines directly above/below, scale ratio **0.08–0.13×** (8–12×).
- **Whitespace:** 45–60%. **Anchor:** thirds. **Palette:** 1 bg + 1 ink + ≤1 accent.
- **Photo:** none or duotone behind (kept quiet under the numeral). **Logo:** opposite corner.
- **Suits:** event, enrollment deadline, term start. **Exemplar:** New-Bloom "73%".

### 2.4 Full-Bleed Duotone + Whisper Caption — **VALIDATED** (New-Bloom field, travel)
Photo fills the frame under a strong duotone; one small line sits in a quiet corner.
- **Hero:** photo full-bleed `0,0,1,1`, duotone-treated (§3.1 primary).
- **Caption:** ≤15% H, in a lower/upper third quiet zone, scale ratio to H **0.03–0.05×**,
  tracked +4–8% if caps; place over the photo's calmest region only.
- **Whitespace:** N/A; ≥60% of the photo near the text must read visually quiet.
- **Anchor:** rule-of-thirds corner, never centered. **Palette:** photo + 1 ink (ivory or white).
- **Suits:** photo-moment, mood, seasonal. **Exemplar:** New-Bloom woman-in-field.

### 2.5 Floated Photo Card on Solid Field — **VALIDATED, NEW** (travel polaroids, Garden grid, New-Bloom envelope)
A small framed photo (thin border, optional 2–4° rotation) floats on a large solid brand
field with text beside/above it. Neither draft named this; the refs use it heavily. **Replaces
draft A's "framed object".** A *rectangular* photo on a field; distinct from §2.12's petal
window (a shaped mask).
- **Card:** photo **28–48% of canvas W**, thin border (2–4px ivory/ink) OR (rev: childcare set)
  a **rounded-corner / single-arch card** (corner radius 6–14% of card W; one-sided arch top ok
  — "Freedom to explore", "Feeling secure"), optional rotation ±2–4°, off-center (thirds).
- **Hero text:** serif OR heavy-sans beside/above the card, scale ratio to card height
  **0.20–0.35×**.
- **Whitespace:** 40–60% (the solid field). **Palette:** 1 bg + 1 ink + ≤1 accent (bg may be a
  curated pastel per §3 colour).
- **Suits:** photo-moment, announcement, event, catalog/multi-item, carousel-page. **Exemplar:**
  travel "in lesvos" bottle card; childcare "Feeling secure" arch card.

### 2.6 Quote with Generous Margin — **VALIDATED** (Basilare script tiles, play-is-highest done right)
Attributed quote at moderate scale surrounded by disproportionate space.
- **Hero quote:** serif, `.10,.28,.80,.40`, **3–5 lines**, scale ratio to H **0.06–0.09×**/line.
  Handwritten-script variant allowed for short quotes (Basilare tiles).
- **Attribution:** directly below, scale ratio **0.30–0.40×** vs quote (noticeably smaller).
- **Whitespace:** 50–65%. **Anchor:** upper-third or left, not vertically dead-center.
- **Palette:** solid bg strongly preferred (ivory or green) over photo; if photo, duotone only.
- **Suits:** quote, testimonial, values. **Exemplar:** Basilare navy script tiles.

### 2.7 Text-Only Manifesto — **VALIDATED (light)** (Aesop copy, travel recipe list)
Short paragraph, no photo, generous leading, page-feel not billboard.
- **Hero block:** serif or serif+sans mix, **50–70% canvas W**, margin ≥12% each side,
  upper-third or centered-column anchor, leading **1.3–1.4×**.
- **Emphasis:** one word/phrase at 2–3× surrounding size as an anchor.
- **Carousel-page variant (rev: childcare set):** on multi-slide editorial pages ("What truly
  matters for children" series), hero:body may relax to **4–6×** (page-feel, not billboard);
  standalone posts keep the §3 8–10× floor.
- **Whitespace:** 40–55% (uniform margins). **Palette:** 1 solid bg (ivory or a curated pastel)
  + 1 ink. **Suits:** manifesto, values, quote, carousel-page. **Exemplar:** travel "slow summer
  afternoon" recipe; childcare "This work matters. Yes, it's hard — mindfully hard."

### 2.8 Documentary Photo Moment — **VALIDATED** (New-Bloom running field, refs' candid shots)
A single candid photo, minimal/no overlay; the photo's honesty is the message.
- **Hero:** photo full-bleed or 94–96% bleed with a thin brand border.
- **Support:** none, or one metadata line at 0.03–0.05× in a corner.
- **Treatment:** light duotone or clean full-color if already art-directed; the photo's internal
  thirds composition does the work. **Whitespace:** 0–8%.
- **Suits:** photo-moment, behind-the-scenes. **Exemplar:** New-Bloom field runner.
- **NOTE:** unlike current output, the photo must be *art-directed / clean*, not a busy blurred
  stock frame; reserve for the best single image, not as a default.

### 2.9 Two-Tier Label + Headline — **RESEARCH** (adjacent in Bloom's/Basilare eyebrows)
Small all-caps tracked eyebrow above a large serif headline sharing the same left edge.
- **Hero:** serif headline `.08,.34,.84,.30`, 1–3 lines. **Eyebrow:** `.08,.28,.84,.05`,
  scale ratio **0.10–0.14×**, all-caps, tracked +0.06–0.10em, same left edge as hero.
- **Whitespace:** 35–50%. **Anchor:** left column. **Palette:** 1 bg + 1 ink + ≤1 accent.
- **Suits:** announcement, event, hiring. **Exemplar:** research-supported (Gentlewoman kicker).

### 2.10 Side-by-Side Portrait + Credential — **RESEARCH** (maps to `photo_logo` wide rule)
Subject photo one vertical block, name/title/quote the other — for wide formats.
- **Photo:** 45–55% of one axis. **Text stack:** scale ratio **0.15–0.22×** vs photo height,
  left-aligned in its half. **Gutter:** 4–8% W. **Whitespace:** 15–25%.
- **Suits:** hiring (staff spotlight), new-teacher announcement, testimonial. **Exemplar:**
  research-supported; closest ref is Aesop's split (2.2).

### 2.11 Motif-Warmed Solid Field — **VALIDATED, NEW** (Little Sparks, Tiny Haven, "For adventurous kids", Kids Klub stickers)
The childcare-warmth archetype: a solid ivory/pastel field carries the hero, warmed by a small,
rationed set of flat botanical/geometric motifs or sticker flourishes. No photo, or photos
shape-masked as accents (§2.12). This is set B's signature; set A never used it.
- **Hero:** serif or heavy-sans, off-center, cap-height **20–34% of canvas H**, ≤3 lines.
- **Motifs:** **2–5 flat shapes only** (abstract petal/leaf/blob, 5-point star, sparkle, one
  hand-drawn arrow), each ≤10% of min(W,H), in **≤2 pastel hues + optional ink silhouette**,
  scattered to the margins/corners — never crowding the hero, never behind text at <0.85 legibility.
- **Whitespace:** 45–65% (motifs count as field, not fill). **Palette:** 1 bg + 1 ink + ≤1
  pastel motif-family (the motif set is the "accent"; do not also add a tangerine accent).
- **Suits:** brand statement, enrollment, values, playful announcement. **Exemplar:** "Little
  Sparks" lilac/blue/yellow botanicals; "For adventurous kids" black flower silhouettes.
- **Guardrail:** motifs are the *single* warmth device here — no floated card + stickers + arc-
  script stacked. One device per post (§0).

### 2.12 Petal / Organic-Shape Photo Window — **VALIDATED-BY-RULING** (client ruling §5.1; grounded by childcare shape-masks)
Client ruling: *keep, rebuilt to editorial standard* — a photo revealed through an orchid/
petal/organic-blob mask on a generous solid field. Set B **does** shape-mask photos (flower-
window "For adventurous kids"; terracotta die-cut ellipse-in-square children-in-field), so the
mask is validated as a device; the rebuild below imposes editorial discipline the Boring petal
posts lacked.
- **Mask:** ONE petal/orchid/organic shape (or a solid field with a single shape *cut out* to
  reveal the photo — the die-cut inversion). Mask area **22–42% of canvas** (a *window*, not the
  whole frame). Smooth curves only; no scalloped clip-art edges.
- **Anchoring:** mask centroid **off-center on a thirds intersection**; never dead-center
  (avoid 0.40–0.60 both axes). Balanced by whitespace on the opposite diagonal.
- **Field:** solid ivory, deep-green, or ONE curated pastel/accent (the terracotta die-cut) —
  **50–65% solid field** around the window.
- **Photo inside mask:** **luminance-preserving duotone** (§3.1, `color` 0.35–0.45) so the
  window reads as brand, not a raw snapshot; near-full-color allowed only if the field is neutral
  ivory and the image is already art-directed.
- **Hero:** display serif (default) or heavy-sans, **8–10× the caption**, set beside/above the
  window sharing an edge with it; **one emphasis word may cross the mask edge ≤15% of hero H**
  (§5.3 ruling, duotone masks only).
- **Accent:** exactly one (a coral word, an underline, or the field colour itself). No second
  shape, no sticker swarm — the window *is* the moment.
- **Whitespace:** 45–60%. **Suits:** photo-moment, brand statement, hero announcement, seasonal.
- **Guardrail:** at most **~1-in-8 posts** (a signature move, not a default); one window per post;
  never mask a busy full-color photo without duotone.

**DROPPED from the drafts** (RESEARCH-only, absent from refs, low priority): overlapping-layered-
type, monogram-as-hero, edge-hugging-label, caption-as-headline (inverted), marginalia-caption,
grid-of-fragments (the refs *are* grids, but each *tile* is one archetype — do not generate a
single post as a fragment grid). The petal-as-solid-logo-mark remains valid as a brand mark in
any archetype's logo slot; **the petal-as-photo-window is now a first-class archetype (§2.12),
reversing draft A's demotion per the client ruling.**

---

## 3. Global rules

### Type scale
- **Hero:caption ratio: 8–10×** (floor 6×, matching the refs' ~9× median; drafts said 6–15×).
- **Display leading: 0.95–1.05×** for hero serif (tight, poster-like).
- **Body/caption leading: 1.30–1.40×.**
- **All-caps micro-labels: +0.06 to +0.10em tracking** (tighter for larger labels).
- **Mixed roman+italic within one headline** is encouraged: italicize the single emphasis word
  (refs do this pervasively — new rule neither draft captured).
- **Pairing (load-bearing):** hero = display serif (Romie/Cormorant) by default, OR a heavy
  rounded/grotesque display sans (≥700) as the secondary childcare register (≤1-in-3 posts,
  rev: childcare set); eyebrows/captions/dates = sans (Syne for emphasis labels, Fira Sans for
  body). Never a *mid-weight* sans hero; never a serif caption.
- **Hero word ceiling:** 1–6 words (label-style) or ≤14 words (sentence-style).
- **Min text: ≥1.8% canvas H; min text alpha ≥0.85** (kills the ghost-eyebrow bug).

### Space & grid
- **Whitespace by archetype:** floated-card/big-number/quote 45–65%; oversized-word/manifesto
  40–60%; split/documentary 15–30%. **Hard floor 20%** for any solid-field post (photo-bleed
  posts exempt but must keep a quiet text zone).
- **Margins:** 8% of the shorter dimension default; 12% for manifesto/quote; 6% for splits.
- **Thirds anchor:** hero lands on a thirds intersection in ≥70% of posts. Exclude the center
  20%×20% (0.40–0.60 both axes) as a hero-anchor zone; this applies to the §2.12 petal-window
  centroid too.
- **One warmth device per post (rev: childcare set):** at most ONE of {floated/arch card,
  sticker/motif set, arc-script banner, petal window, multicolor logotype} per composition. Two+
  stacked = "busy/craft-fair," fails the premium bar (§0).
- **Split ratios:** 58/42, 60/40, or 62/38 — never 50/50, never a round multiple of 10 that
  reads as a slide.
- **Hairline rules & underline** are permitted as tier dividers / emphasis (refs use both);
  cap non-brand neutral tones at ≤3 values.

### Photo treatment (exact canvas recipes)
Two-layer: base photo + composited tone. **The flat full-canvas veil is banned.**
1. **Brand duotone (primary).** Photo at full opacity; overlay `#254E48` with
   `globalCompositeOperation='color'`, `globalAlpha=0.35–0.45` — preserves luminance/contrast,
   pulls hue to green. This is the correct replacement for the muddy veil.
2. **Ivory lift (optional, ~40% of treated photos).** After (1), overlay `#F5F6E7`
   `soft-light` at `0.12–0.18` for the warm paper glow.
3. **Strong duotone (≤1-in-8 posts).** Grayscale first, then shadow pass `multiply` `#254E48`
   `0.50–0.60` + highlight pass `screen` `#F5F6E7` `0.30–0.40`. For 2.4 full-bleed heroes only.
4. **Pastel wash (quiet posts).** Wisteria/celadon `screen` `0.15–0.22` — lightens, never
   muddies. Do not combine with the tangerine accent.
5. **Desaturation:** reduce source saturation **25–40%** before overlays to unify variable-
   quality classroom photos (refs read as film-desaturated, not raw).
6. **Grain (optional):** `overlay` `0.04–0.08`, never >0.10, photo-only.
7. **Floated-card & full-color:** for 2.5 cards and already-art-directed detail shots, keep
   near-full color (0–15% desat) with a thin/rounded border — treatment is a consistency tool
   for *imperfect* inputs, not a universal mandate.
8. **Childcare full-color grain (rev: childcare set).** Set B's default is **near-full-color
   film-grain photography** (grain `overlay` 0.04–0.08, desat 0–15%), NOT heavy green duotone —
   warmer and more candid. Prefer this for kids/candid moments on ivory/pastel fields; reserve
   the strong green duotone for §2.4 heroes and the §2.12 petal window. Duotone remains the fix
   for *muddy/off-brand* source photos.

### Colour discipline
- **1 background + 1 ink + ≤1 accent** per post. Accent = **softened tangerine/coral**
  (rev §5.2: desaturate ~10% in compositions), the green itself, or **one curated pastel**
  (rev: childcare set — dusty pink, butter yellow, sky blue, sage, terracotta/clay, lilac; one
  family per post). Accent ≤15% of canvas area (a full-field pastel bg is the "background," not
  the accent). **Never 2 accents; never 2 saturated pastels adjacent.**
- **Playful multicolor logotype — EXEMPT (rev: childcare set).** A brand wordmark set in ≥3
  bright hues (Kids-Klub / "Back to school" style) is allowed and does NOT count against the
  1-accent rule, PROVIDED it is a discrete logotype/lockup, not the body hero, and appears ≤1
  per post. Everything else on the post still obeys 1-accent.
- **Dark/light rhythm (rev §5.4):** across any 6 posts, **70–75% ivory/light/pastel, 25–30%
  deep-green/dark**; never 3+ dark in a row. Solid **deep-green bg + ivory ink** is the
  statement register (~1-in-4 to 1-in-6), not a fallback; pastel solid fields absorb some of
  the former dark share.
- **~1-in-4 posts carry NO photo** (solid field) and **~1-in-5 use a floated card** — this is
  what the current output most conspicuously lacks.
- **No gradient backgrounds.** Gradients only as a ≤25% caption scrim in 2.4. (The WE'RE-HIRING
  gray-purple gradient is banned.)
- **Contrast floor:** WCAG AA — 4.5:1 body, 3:1 large/display. Hard gate.

---

## 4. Anti-pattern checklist — FINAL

Measurable render-time assertions, merged + deduplicated from both drafts, **ordered by how
often the Boring set violates each** (most-violated first).

1. **Weak-sans hero.** FAIL if hero is neither the display serif NOR a heavy display sans
   (≥700), or if a heavy-sans hero appears in >1-in-3 posts of a run (Boring: ~10/13 mid-weight
   sans-caps). §1.1 / §3.
2. **Flat photo veil.** FAIL if a single full-canvas color overlay ≥0.30 alpha sits over a
   photo (Boring: ~all photo posts). Use §3.1 duotone or a floated card instead.
3. **Flat hierarchy.** FAIL if largest:smallest text < 6× (target 8–10×), or any two text tiers
   within 15% of each other (Boring: ~all).
4. **Centered / center-zone hero.** FAIL if hero centroid is inside 0.40–0.60 on both axes, or
   the hero is a vertically-centered mid-canvas column (Boring: most). §3 thirds anchor.
5. **No solid-field / floated-card variety + same photo.** FAIL a *batch* if 0 no-photo posts
   and 0 floated-card posts across a 6-post run, or if one image repeats >2× (Boring: near-total).
6. **Whitespace floor breach.** FAIL if solid-field post whitespace < 20% (photo-bleed exempt).
7. **Contrast / ghost text.** FAIL if ink:bg < 4.5:1 (body) / 3:1 (display), or any text alpha
   < 0.85 (Boring: ghost eyebrow, washed welcome-alice).
8. **Element collision.** FAIL if logo/hero/eyebrow bounding boxes overlap (Boring screenshots:
   logo over headline, OPEN HOUSE over 18).
9. **Gradient background.** FAIL if any bg uses a multi-stop gradient, or a gradient outside the
   2.4 caption-scrim ≤25% context (Boring: WE'RE-HIRING).
10. **50/50 or round split.** FAIL if a two-zone split falls in 0.47–0.53, or at a round
    multiple of 10 (Boring: banner 50/50, now-enrolling 50/50). Use 58/42–62/38.
11. **All-caps without tracking.** FAIL if an all-caps run has letter-spacing < +0.06em.
12. **Un-disciplined petal window.** (rev §5.1) FAIL a §2.12 petal/organic photo window if:
    mask area >42% or <22% of canvas; mask centroid inside 0.40–0.60 both axes; a busy full-color
    photo sits inside without duotone; >1 window per post; or petal windows exceed ~1-in-8 of a
    run. The mask itself is now *permitted* (VALIDATED-BY-RULING); only these breaches fail.
13. **Multi-accent / multi-pastel clash.** FAIL if >1 accent color (the multicolor logotype and
    a §2.11 single pastel motif-family are exempt), or 2+ saturated pastels adjacent, or a
    tangerine accent added on top of a pastel motif-field.
14. **Dark-post clustering.** FAIL if 3+ consecutive dark-bg posts.
15. **Filled-every-corner.** FAIL if all four 10%×10% corners contain an element; ≥2 must be
    empty field.
16. **Decoration-as-filler.** FAIL if any non-text/non-photo element carries no function
    (divider, underline, accent, or brand mark).
17. **Hero word overflow.** FAIL if hero exceeds 6 words (label) / 14 words (sentence), or any
    single hero tier wraps to 4+ lines.
18. **Grain overuse.** FAIL if grain alpha > 0.10 or grain on a flat-color (non-photo) bg.
19. **Sticker/motif swarm.** (rev: childcare set) FAIL if >5 flat motifs/stickers on a post, if
    any motif family exceeds 2 pastel hues (+optional ink), or if a motif sits behind text at
    <0.85 legibility (§2.11).
20. **Warmth-device stacking.** FAIL if >1 of {floated/arch card, sticker/motif set, arc-script
    banner, petal window, multicolor logotype} appears in one post (§0 / §3 space).

---

## 5. Client rulings (resolved)

The draft's open questions are now decided. These are binding.

1. **Petal photo-frame — KEEP, rebuilt to editorial standard.** Not demoted. Rebuilt as
   archetype **§2.12 Petal / Organic-Shape Photo Window** (VALIDATED-BY-RULING): serif/heavy-sans
   hero, 8–10× hierarchy, 50–65% solid field, luminance-preserving duotone *inside* the mask,
   off-center thirds anchor, one accent, ~1-in-8 cap. Grounded by childcare shape-masks (flower-
   window "For adventurous kids"; terracotta die-cut ellipse) so it is not designed from
   principles alone. Anti-pattern #12 rewritten from "petal mask banned" to "un-disciplined petal
   window fails."

2. **Accent — tangerine kept, softened ~10%.** Codified in §3 colour discipline; the softened
   tangerine/coral or the green is the accent, plus the curated pastel family from set B.

3. **Feed darkness — 25–30% dark share.** Codified in §3 dark/light rhythm (70–75% light/pastel);
   pastel solid fields absorb part of the old dark share.

4. **Detail defaults — accepted:**
   - **Script flourish ≤1-in-6 posts, tertiary only** (never the hero). Applies to arc-script
     banners (childcare "Thriving kids, empowered parents") too.
   - **Type-over-photo-edge ≤15% of hero height, duotone photos only** (never a busy full-color
     photo; off in wide/story crops). See §2.12, §2.4.
   - **Floated-card rotation only on photo-moment posts** (±2–4°); off for event/hiring, which
     want composure. See §2.5.

**Standing note (photography direction).** The single biggest non-layout lever remains a varied,
art-directed image library. Set B confirms the fix: near-full-color film-grain candids on ivory/
pastel fields read premium *without* heavy duotone — but only if the source images are clean.
A broad, cohesive photo set (or lighter treatment on fewer, better images) is still a
prerequisite for §2.4 / §2.8 / §2.12 to land.
