# Format Design Spec

White Orchid Content Studio — per-format composition engine spec. All values are fractions of canvas width (W) / height (H) unless marked px. Baseline for font-scale multipliers is `ig_square` (1080×1080).

Formats:
| id | px | ratio | orientation |
|---|---|---|---|
| ig_square | 1080×1080 | 1:1 | square |
| ig_portrait | 1080×1350 | 4:5 | tall |
| story | 1080×1920 | 9:16 | tall |
| twitter | 1600×900 | 16:9 | wide |
| facebook | 1200×630 | 1.91:1 | wide |
| banner | 1500×500 | 3:1 | very wide |

---

## 1. Per-format composition table

### 1.0 Platform safe-zone baselines (source-grounded)

- **Story / Reels (1080×1920):** Instagram's own organic-Story UI (username, timestamp, close button) occupies roughly the **top 155px**, with a safer top buffer commonly recommended at **250px (≈0.130 H)**. The reply bar / sticker tray occupies the **bottom ~155–250px organic, up to 340px (≈0.177 H) for ads with a CTA button**. Reels adds right-edge engagement buttons (like/comment/share), consuming the **right ~120px (≈0.111 W)**, and tighter bottom UI (captions + controls) up to **320px (≈0.167 H)** (SellerPic 2026, Outfy 2026, Kreatli 2026, FirstPier 2026). We standardize on the conservative union of Story+Reels since one asset serves both surfaces:
  - top unsafe: **0.15 H** (≈288px)
  - bottom unsafe: **0.20 H** (≈384px, covers ad CTA + Reels captions/buttons)
  - right unsafe (Reels engagement rail): **0.12 W** (≈130px)
  - left unsafe: **0.035 W** (≈38px, matches the ~35px side buffer convention)
- **Feed formats (ig_square, ig_portrait):** no OS chrome overlay risk (feed image is fully visible), but Instagram truncates captions and the feed UI still frames the image; use a **generic editorial margin of 0.06 W/H** on all sides as breathing room, not a platform-mandated safe zone.
- **Twitter/X (1600×900 card, native ratio 16:9):** platform recommends **key info/text at ≥24px effective size** and clear of "the outer edges" — no official numeric safe-zone box is published for post images (unlike Cards which get UI-cropped in some clients). We apply a **0.05 W/H** edge margin plus keep text off the extreme edges where link-preview cards sometimes clip corners.
- **Facebook (1200×630 link/post image):** the historic **20%-text rule is officially retired** (Meta stopped enforcing/scoring it), but "less than 20% text performs better" remains Meta's own stated guidance (SocialNewsDesk 2025, AdWeek). We keep text blocks visually light and apply a **0.06 W/H** margin; no hard UI overlay on the image itself for link posts.
- **Banner (1500×500 web/email):** no platform UI overlay (self-hosted), but email clients and responsive reflow crop unpredictably at extreme edges — apply **0.05 W / 0.08 H** margin (H tighter because banner is short).

### 1.1 photo_logo (photo + logo + optional short caption)

| Format | Safe margin T/B/L/R | Text zone anchor | Text zone x,y,w,h | Align | Font scale | Max lines | Logo pos (9-grid) | Logo size (frac of min(W,H)) | Wide layout rule |
|---|---|---|---|---|---|---|---|---|---|
| ig_square | .06/.06/.06/.06 | lower-third | .06,.66,.88,.28 | left | 1.00× | 2 | bottom-right | 0.14 | n/a |
| ig_portrait | .06/.06/.06/.06 | lower-third | .06,.70,.88,.24 | left | 0.95× | 2 | bottom-right | 0.12 | n/a |
| story | .035/.20/.035/.12 | lower-third (above UI) | .035,.62,.845,.18 | left | 1.10× | 2 | bottom-left (above UI) | 0.13 | n/a |
| twitter | .05/.05/.05/.05 | left-half | .05,.28,.42,.44 | left | 0.70× | 2 | bottom-right | 0.10 | **side-by-side**: text left 55%, subject right 45% |
| facebook | .06/.06/.06/.06 | left-half | .06,.30,.40,.40 | left | 0.65× | 2 | bottom-right | 0.10 | **side-by-side**: text left 55%, subject right 45% |
| banner | .05/.08/.05/.05 | left-half | .05,.20,.42,.60 | left | 0.50× | 1 | right-center | 0.16 (of H, the constraining dim) | **side-by-side mandatory**, text 42–48% left, subject/photo right |

Reasoning on font scale: angular size at typical display width governs legibility, not raw px. Square/portrait posts render ~350–470px wide in-feed on mobile; Story fills the full ~390–430px device width edge-to-edge and is viewed closer/full-screen, hence the **1.10× boost**. Wide formats (twitter/facebook) are frequently displayed as link-preview thumbnails at **400–600px wide** — the same headline at square-scale would be genuinely tiny relative to the 1600px canvas, so headline type is scaled *up* relative to naive W-proportional scaling but still nets **0.65–0.70×** of the square's absolute px because the canvas height (900/630) is much shorter than 1080, capping how tall type can be before wrapping. Banner is the extreme case: 500px tall total, so headline em-height is capped hard — **0.50×**, 1 line max.

### 1.2 quote (quote text + attribution)

| Format | Safe margin T/B/L/R | Text zone anchor | Text zone x,y,w,h | Align | Font scale | Max lines | Logo pos | Logo size | Wide layout rule |
|---|---|---|---|---|---|---|---|---|---|
| ig_square | .10/.10/.10/.10 | center | .10,.28,.80,.44 | center | 1.00× | 5 | bottom-center | 0.10 | n/a |
| ig_portrait | .10/.10/.10/.10 | center-upper | .10,.24,.80,.42 | center | 0.95× | 6 | bottom-center | 0.09 | n/a |
| story | .06/.22/.06/.06 | center | .06,.30,.88,.40 | center | 1.05× | 6 | bottom-center (above UI) | 0.10 | n/a |
| twitter | .07/.07/.07/.07 | center | .10,.18,.80,.64 | center | 0.75× | 4 | bottom-right | 0.08 | stacked (quotes read poorly split) |
| facebook | .08/.08/.08/.08 | center | .10,.16,.80,.68 | center | 0.72× | 4 | bottom-right | 0.08 | stacked |
| banner | .06/.10/.08/.08 | center | .10,.15,.80,.70 | center | 0.55× | 2 | right-center | 0.14 | stacked (banner too short for split quote) |

Quotes are the one type that stays **centered/stacked even in wide formats** — splitting a quote across a left/right composition breaks reading flow and forces awkward line-wrap; a big attribution/subject photo doesn't help comprehension the way a face does in photo_logo.

### 1.3 event (title + big date + details)

| Format | Safe margin T/B/L/R | Text zone anchor | Text zone x,y,w,h | Align | Font scale (title / date / details) | Max lines | Logo pos | Logo size | Wide layout rule |
|---|---|---|---|---|---|---|---|---|---|
| ig_square | .07/.07/.07/.07 | center-lower | .07,.44,.86,.48 | center | 1.00 / 1.00 / 1.00× | title 2, details 3 | top-center | 0.12 | n/a |
| ig_portrait | .07/.07/.07/.07 | center-lower | .07,.48,.86,.44 | center | 0.95 / 0.95 / 0.90× | title 2, details 3 | top-center | 0.11 | n/a |
| story | .06/.22/.06/.06 | lower-half | .06,.46,.88,.30 | center | 1.05 / 1.10 / 1.00× | title 2, details 2 | top-center (below UI) | 0.12 | n/a |
| twitter | .05/.05/.05/.05 | left-half | .05,.15,.44,.70 | left | 0.60 / 0.75 / 0.55× | title 2, details 2 | bottom-right | 0.09 | **side-by-side**: text left 48%, date badge stacked within it |
| facebook | .06/.06/.06/.06 | left-half | .06,.14,.42,.72 | left | 0.55 / 0.70 / 0.50× | title 1, details 2 | bottom-right | 0.09 | side-by-side, text left 45% |
| banner | .05/.08/.05/.05 | left-half | .05,.14,.44,.72 | left | 0.40 / 0.55 / 0.35× | title 1, details 1 | right-center | 0.15 | side-by-side mandatory; date badge sized largest element |

Event is the densest type (3 text tiers). The **date is always the largest scale-relative element** (people scan for "when" first) — date font scale is set ~10–15% above title scale at every format. Banner drops details to 1 line and title to 1 line per §6 priority rules below — this row already reflects post-drop state; §6 governs the decision logic.

### 1.4 text_post (intro + headline + subtext)

| Format | Safe margin T/B/L/R | Text zone anchor | Text zone x,y,w,h | Align | Font scale (intro/headline/subtext) | Max lines | Logo pos | Logo size | Wide layout rule |
|---|---|---|---|---|---|---|---|---|---|
| ig_square | .08/.08/.08/.08 | center | .08,.22,.84,.56 | left | 1.00 / 1.00 / 1.00× | headline 3 | bottom-right | 0.10 | n/a |
| ig_portrait | .08/.08/.08/.08 | center | .08,.20,.84,.58 | left | 0.95 / 0.95 / 0.95× | headline 4 | bottom-right | 0.09 | n/a |
| story | .06/.22/.06/.06 | center | .06,.28,.88,.42 | left | 1.00 / 1.10 / 1.00× | headline 4 | bottom-center (above UI) | 0.10 | n/a |
| twitter | .05/.05/.05/.05 | full-width band | .06,.30,.88,.44 | left | 0.55 / 0.65 / 0.50× | headline 2 | bottom-right | 0.08 | stacked (text is the whole point; no photo subject to trade for) |
| facebook | .06/.06/.06/.06 | full-width band | .06,.28,.88,.46 | left | 0.50 / 0.60 / 0.45× | headline 2 | bottom-right | 0.08 | stacked |
| banner | .05/.08/.05/.05 | full-width band | .05,.22,.90,.56 | left | 0.35 / 0.45 / 0.30× | headline 1 | right-center | 0.13 | stacked; if a photo exists treat it as background, not a side subject |

text_post has no dedicated photo subject to composite against, so wide formats **stay stacked/full-width** rather than forcing an artificial side-by-side split — the "side-by-side for wide formats" rule only applies when there's a real photographic subject (photo_logo, event with hero photo) that benefits from dedicated frame space.

### 1.5 texture_text (short all-caps overlay text on photo)

| Format | Safe margin T/B/L/R | Text zone anchor | Text zone x,y,w,h | Align | Font scale | Max lines | Logo pos | Logo size | Wide layout rule |
|---|---|---|---|---|---|---|---|---|---|
| ig_square | .08/.08/.08/.08 | center | .08,.38,.84,.24 | center | 1.00× | 2 | bottom-center | 0.09 | n/a |
| ig_portrait | .08/.08/.08/.08 | center | .08,.42,.84,.22 | center | 0.95× | 2 | bottom-center | 0.08 | n/a |
| story | .06/.22/.06/.06 | center | .06,.44,.88,.20 | center | 1.15× | 2 | bottom-center (above UI) | 0.09 | n/a |
| twitter | .05/.05/.05/.05 | center | .10,.36,.80,.28 | center | 0.65× | 1 | bottom-right | 0.07 | prefer **centered over full photo** (short punchy text doesn't need a side split) |
| facebook | .06/.06/.06/.06 | center | .10,.36,.80,.28 | center | 0.60× | 1 | bottom-right | 0.07 | centered over full photo |
| banner | .05/.08/.05/.05 | center | .12,.24,.76,.52 | center | 0.45× | 1 | right-center | 0.12 | centered, single word/short phrase only |

texture_text is short (1–4 words), all-caps, big — it's a graphic element more than a text block, so it stays **centered on the full photo at all widths**, never splits side-by-side.

---

## 2. Auto legibility ladder (gradient scrim removed)

> **Removed 2026-07-02 by user decision.** The full-bleed **gradient band / scrim**
> treatment was deleted entirely. It washed a dark veil across the whole canvas —
> darkening the solid celadon/brand background *outside* a petal frame AND stacking on
> top of the per-type photo tint — which the user called "the shadow effect I don't
> like." There is no longer any gradient/scrim code path. The Text-backdrop control is
> now **Auto / Band / None** (the old "gradient" option is gone; any stored or
> AI-supplied `"gradient"` value is coerced to `"auto"`).

**The Auto ladder** (in escalation order — stop at the first rung that meets the 4.5:1 floor):

1. **Colour-flip.** Flip the text colour to the higher-contrast pole for the resolved zone
   (`resolveZoneTextColor`: ivory vs Burnham against the zone mean).
2. **Smart placement / quiet-zone snapping.** The existing per-format placement and
   frame-aware snapping already move text onto quiet strips / the solid-bg region.
3. **Solid brand band.** If the floor still can't be met → the existing **band** treatment
   (§5): a clean editorial strip, Burnham behind light text / ivory behind dark text.

**Never** stack a treatment on a type tint. quote/event/text_post already tint the whole
photo; for those, Auto may only **deepen that same tint** (bounded, up to **+0.10 alpha**)
if contrast fails — no band on top. Only if the tint *at max* still fails does a band
**replace** the extra tint. **No treatment ever darkens the solid background outside a
frame shape.**

---

## 3. Quiet-region detection heuristic

Auto mode evaluates the photo under the intended text zone before deciding to render a scrim.

- **Grid:** downsample the text-zone region (plus a 10%-of-zone-size margin) into a **6×6 luminance/variance grid** (finer than 3×3 for better precision on preschool photos which often have varied but small-scale texture like foliage or fabric).
- **Per-cell stats:** mean luminance L (0–1, from `0.2126R + 0.7152G + 0.0722B` per pixel, normalized), and variance V of luminance within the cell.
- **Aggregate over the text-zone cells:** `zone_mean_L`, `zone_max_V` (worst-case cell variance — use max, not average, because a single busy patch under a word breaks legibility even if the rest is quiet).
- **Quiet-and-dark-enough for light text (skip scrim, use light text):**
  `zone_max_V < 0.015` AND `zone_mean_L < 0.35`
- **Quiet-and-light-enough for dark text (skip scrim, use dark text):**
  `zone_max_V < 0.015` AND `zone_mean_L > 0.70`
- **Variance threshold rationale:** 0.015 (on a 0–1 luminance scale, variance computed over ~16–36px cells at working resolution) corresponds empirically to "flat sky / wall / fabric" vs. "leaves / crowd / patterned floor" — busy natural textures typically produce cell variance ≥0.03.
- **Contrast ratio floor to go band-less:** **4.5:1**, computed WCAG-style between the resolved text color and the **zone_mean_L converted to an equivalent background luminance**, checked at both the darkest and lightest sampled cell within the zone (not just the mean) — if either extreme cell fails 4.5:1, escalate to the solid band (§5). We use the *stricter* AA normal-text floor (4.5:1) rather than the 3:1 large-text floor even for big headline type, because photographic backgrounds are non-uniform in ways flat UI backgrounds aren't — the extra margin absorbs micro-texture the 6×6 grid averages over. (The old "reduced scrim at 0.20 peak" fallback is gone with the gradient; the ladder now goes straight to the solid band, or — for tinted types — a bounded deepening of the existing tint per §2.)
- When scrim is skipped: apply the small **drop-shadow safety net** (§5) unconditionally — quiet regions still benefit from an edge shadow against fine-grain photo noise.

---

## 4. Smart crop / focal point spec

No ML — pure heuristic on a downsampled canvas grid.

### 4.1 Saliency scoring

1. Downsample source photo to a working grid, e.g. **40×40 cells** (independent of final export size).
2. Per cell compute three scores, each normalized 0–1:
   - **Skin-tone probability `S`:** convert cell average color to YCbCr. Cell flagged skin-probable if `Cb` in **[77,127]** and `Cr` in **[133,173]** (standard YCbCr skin-tone band, matches published thresholding ranges) AND luminance `Y` in **[40,250]** (excludes near-black/near-white false positives). `S = 1` if in-band, `0` if not, with a soft falloff: `S = max(0, 1 - (dist_from_band_center / band_half_width))` for near-misses within 15% of the band edges, so skin-adjacent tones (hair, warm fabric) contribute partial weight rather than a hard binary.
   - **Local contrast `C`:** standard deviation of luminance within a **3×3 cell neighborhood**, normalized by dividing by 0.25 and clamping to [0,1] (0.25 ≈ empirical max local stddev for high-detail regions). High-contrast regions (edges, faces, eyes) score higher — proxies for "subject" without object detection.
   - **Rule-of-thirds prior `T`:** static weight map favoring the four rule-of-thirds intersections and a horizontal band at **y ∈ [0.30, 0.45]** (typical face height in portrait-oriented photos): `T(x,y) = max over 4 intersections of exp(-dist²/(2*0.12²))`, plus `+0.15` flat bonus if `y` in [0.30, 0.45].
3. **Combined saliency per cell:** `Score = 0.5*S + 0.3*C + 0.2*T`. Skin weighted highest since these are preschool photos (children/faces are almost always the intended subject).
4. **Focal point (fx, fy):** the saliency-weighted centroid across all cells: `fx = Σ(Score_i * x_i) / Σ(Score_i)`, `fy = Σ(Score_i * y_i) / Σ(Score_i)`, both in **[0,1]** canvas-fraction coordinates.
5. **Subject bounding band:** the smallest **y-range** `[y_min, y_max]` containing ≥70% of total cumulative Score mass, expanded by 10% of its own height as padding. Used to avoid cropping through the middle of the subject vertically.
6. **Confidence:** `confidence = Σ(Score_i for i in top 15% of cells) / Σ(Score_i for all cells)`. High confidence (≥0.35) = saliency is concentrated (a clear subject); low confidence (<0.35) = diffuse/no clear subject (e.g. texture/pattern photo).

### 4.2 Per-format crop-window placement

Given source image dimensions and target aspect ratio, compute the cover-crop window (same aspect as target, as large as fits inside source), then position it so the focal point lands at a target rule-of-thirds x-position `target_fx`:

- **Square / portrait / story (centered text or no side-split):** `target_fx = 0.50` (center) unless a photo_logo/event side-by-side layout is active, in which case use the wide-format rule below even for portrait canvases with side text.
- **Wide formats with left-text layouts (twitter/facebook/banner, photo_logo & event):** text occupies left ~45–55%, so bias the subject right: `target_fx = 0.66` (right rule-of-thirds line, matches the spec prompt's own example).
- **Wide formats with right-text or logo-right layouts:** mirror, `target_fx = 0.34`.
- **Vertically:** `target_fy` = the vertical center of the subject bounding band from §4.1, clamped to **[0.30, 0.55]** (never let a subject centroid target fall below 55% down, which risks pushing heads toward the bottom safe-margin/scrim zone).

**Crop window formula** (source W_s × H_s, target aspect `a = target_w/target_h`):
```
if W_s / H_s > a:  // source wider than target -> crop width, keep full height
  crop_h = H_s
  crop_w = H_s * a
else:              // source taller than target -> crop height, keep full width
  crop_w = W_s
  crop_h = W_s / a

crop_x = clamp(fx * W_s - target_fx * crop_w, 0, W_s - crop_w)
crop_y = clamp(fy * H_s - target_fy * crop_h, 0, H_s - crop_h)
```
This places the focal point at exactly `(target_fx, target_fy)` within the crop window when unclamped; clamping at source edges is the natural fallback when the focal point is near a source boundary — clamped windows still contain as much of the subject as geometrically possible.

### 4.3 Low-confidence fallback

When `confidence < 0.35`:
- Discard the computed `(fx, fy)` and use a **center-weighted upper-third bias**: `fx = 0.50`, `fy = 0.38` (faces/subjects in typical preschool photography — activity shots, portraits — cluster in the upper half of the frame; 0.38 sits just above true center, matching the §4.1 rule-of-thirds horizontal band of [0.30, 0.45]).
- Still apply the wide-format `target_fx` bias (0.66 / 0.34) so text-avoidance holds even without a detected subject.

---

## 5. Backdrop modes

Three user-selectable modes (the old **gradient** mode was removed 2026-07-02 — see §2), applied to the text zone from §1.

1. **auto:** run the §2 Auto ladder — colour-flip → placement → solid band. Concretely: run the §3 quiet-region check with the colour-flipped text; if quiet-and-legible → no band, apply text in the resolved light/dark variant + the drop-shadow safety net only. Otherwise → the solid **band** below. For tinted types (quote/event/text_post) Auto instead deepens the existing tint (bounded +0.10 alpha) and only bands if the tint at max still fails.
2. **band:** solid rectangle behind the full text zone, **full canvas width** (edge-to-edge, not just zone width — reads as an intentional design block rather than a text-box):
   - Height: `text_h + 0.12*H` padding top/bottom.
   - Opacity: **0.92** (near-solid; "90% brand color" per spec intent — 0.92 chosen so a faint hint of photo texture survives at the band edges during the 1-frame anti-aliased boundary, avoiding a hard cutout look).
   - Color pairings (brand-consistent):
     - Burnham #244F49 band → ivory/white-smoke text (primary pairing; matches brand's dominant dark-on-light... here inverted to light-on-dark for the band).
     - Ivory/white-smoke band → Burnham #244F49 text (use when photo is already dark/moody, for maximum brightness contrast to the photo).
     - Tangerine accent band → Burnham #244F49 text only (never white-on-tangerine; tangerine is a mid-value hue that fails 4.5:1 against light text). Reserve tangerine band for short accent labels (e.g. event date badges), not full headline blocks.
3. **none:** no band — text sits directly on photo with only the drop-shadow safety net (below). Intended for already-quiet photos the user selects manually, or brand moments where the photo itself is deliberately kept clean.

**Drop-shadow safety net (applies whenever there's no band, i.e. `auto`-skip and `none` modes):**
- Offset: **x = 0, y = 0.15% of H** (≈1.6px at 1080H) — nearly centered, very slight downward bias.
- Blur radius: **0.9% of H** (≈9.7px at 1080H; scales per format using that format's own H so it stays proportional).
- Opacity: **0.35**.
- Color: pure black (`#000000`) regardless of light/dark text variant — shadow color doesn't need brand-tinting since its only job is edge-darkening, not area-tinting.

---

## 6. Priority of adaptations

Deterministic drop order when a format's text zone cannot fit all content at its specified font scale and max-line count (primarily hits: banner + event/text_post/quote, story + event). Evaluated top-to-bottom; stop as soon as content fits.

1. **Shrink type, in 5% decrements, down to a format-specific floor**, before dropping anything. Floors (as multiplier of the format's own already-scaled baseline from §1, i.e. this is a *second*, in-format shrink, not off the square baseline):
   - Title/headline floor: **0.85×** of that format's table value (below this, headline stops being the dominant visual element).
   - Date/secondary floor: **0.80×**.
   - Details/subtext/tertiary floor: **0.70×** (smallest text can shrink most since it's least critical to the message).
2. **Drop tertiary copy first** (details line in `event`, subtext line in `text_post`, caption in `photo_logo`) — the single piece of copy explicitly marked lowest-priority in each type's own hierarchy. Drop entirely (not truncate) rather than truncate mid-sentence, which reads as broken; a missing line is cleaner than a cut-off one.
3. **If still overflowing, drop secondary copy** (date badge shrinks to a compact inline token rather than a standalone block in `event`; intro line drops in `text_post`) — reduce to the minimum unit that still conveys meaning (e.g. "12 SEP" instead of "Saturday, 12 September 2026, 10:00 AM").
4. **Shrink logo to its minimum size floor**, not drop it entirely: **0.06 of min(W,H)**, down from the table's per-format value (§1's 0.07–0.16 range) — logo presence is a brand-consistency requirement across all exported assets and is dropped last, never entirely, to preserve brand attribution on every asset.
5. **If content still cannot fit after steps 1–4 (only possible on `banner` with `event` type, the tightest combination):** hint the user in the UI — flag the specific overflowing field(s) by name (e.g. "Details won't fit on Banner — shorten to ≤40 characters") rather than silently truncating mid-word. This is a UI/UX behavior, not a further automatic content drop — silent truncation of user-authored copy is treated as worse than surfacing the constraint.

This order is deterministic and re-run independently per format (a drop applied on `banner` does not affect `story`'s render) so each of the 6 exports is evaluated against its own §1 constraints.

---

## 7. Frame-aware text & logo composition

When a **frame overlay** is active (`overlayMode: "frame"` — e.g. the orchid petal), the overlay clips the photo INSIDE the shape and leaves solid brand background OUTSIDE it. Text and the logo must therefore never straddle the shape boundary (the failure mode: an ivory headline half on the photo and half on the ivory background, rendering the background half invisible).

**Text snapping rule (deterministic, per format):**
1. Compute the frame's axis-aligned bounding box for this dimension (widest frame layer: `scale·W` wide, `scale·W / ratio` tall, centred at `x·W, y·H`).
2. If the spec text zone overlaps that box, find the largest **clear solid-bg strip** outside it, respecting the safe margins: top / bottom strips for tall formats, left / right strips for wide formats.
3. **Prefer OUTSIDE.** If a strip clears the thresholds (horizontal: ≥16% H tall AND ≥45% W wide; vertical/side: ≥30% W wide AND ≥40% H tall), snap the whole text block into it and force the **high-contrast background colour** (Burnham text on an ivory bg, ivory text on a Burnham bg — decided from the bg luminance, the same pole `resolveZoneTextColor` would pick). No scrim is drawn — the text is on a flat brand panel.
4. **Otherwise INSIDE.** If no strip is big enough (e.g. the petal on a square nearly fills the canvas), clamp the block inside the shape so glyphs land on the photo, and run the normal §2/§3/§5 backdrop/scrim rules (worst-case min-cell contrast sampling) to guarantee legibility on the photo.

**Logo rule:** the auto placement additionally excludes a padded band around the frame's bounding box and prefers positions in the clear solid-bg region. Explicit user placements still win verbatim (§4). The existing text-exclusion still applies, so the logo never overlaps the text block even when both land on the background.
