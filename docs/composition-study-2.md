# Composition study #2 — moodboard vs hearts (aspirational vs revealed taste)

**Date:** 2026-07-10 · **Sources:** the 10 moodboard inspiration images (now synced to `brand_moodboard`) read alongside the 12 liked designs from study #1 (docs/composition-study-1.md).

Study #1 read only the hearts and concluded "text and photo each get their own territory." The moodboard **overturns the spirit of that conclusion**: the inspiration you save is dominated by designs where type and photograph are *deliberately interwoven*. The hearts show what you accept from the generator today; the moodboard shows where you want it to go.

## What's on the moodboard (composition census)

| # | Composition device |
|---|---|
| 1 (Toyto cubes) | Oversized display type **woven around the subject** — words wrap the child, bleed off edges, sit in the photo's quiet zones |
| 2 (Luo) | Giant wordmark **overlaid dead-center** on a blurred, receded photo |
| 3 (Klub) | **Collage**: photo + floating graphic shapes (semicircle, gold dot) + message in a **rounded pill card** |
| 4 (Back to school) | **Product collage**: framed centre photo, objects scattered around, playful multi-colour **arched lettering** top & bottom |
| 5 (What truly matters) | Clean editorial **diagonal**: big headline top-right, subject bottom-left, small supporting text mid-right |
| 6 (Early learning) | Words **scattered across the photo** at multiple scales + confetti shapes — full type-photo weave |
| 7 (Red hillside) | Bold **colour-block frame** with the photo revealed through an **organic ellipse cutout** |
| 8 (This work matters) | Quote **centred on a big organic blob**, blob and text working together (not colliding) |
| 9 (Play is Communication) | Mixed registers (**script + serif**) centred over a calm top-down photo, thin colour border |
| 10 (Adventurous kids) | Photos **masked inside flower silhouettes**, scattered; italic serif message in the clear centre |

## Aspirational vs revealed — the synthesis

**Where they agree** (keep from study #1):
- Warm, calm palettes; generous breathing room; serif-led editorial type (moods 5, 8, 9, 10 are cousins of the liked quote_margin/manifesto designs).
- **Seam-safe, collision-free text is still non-negotiable** — every moodboard overlay places type in *quiet* photo zones or on its own card/shape. Study #1's C2 (no seam-straddling) and C3 (shapes are obstacles) survive unchanged; mood 8 is exactly like-12's blob **done right** — text centred ON the shape rather than clipped by it.

**Where the moodboard goes further** (this is the new signal):
1. **Type-photo weave** — the strongest recurring device (moods 1, 2, 6, 9): large display type overlapping the photo *confidently*, sized to the format, wrapped around the subject, never timidly boxed. Study #1's "separation prior" (C1) was over-corrected: the problem with like-4 wasn't overlay per se, it was *timid, mid-zone, busy-background* overlay. Revised C1: **overlay is welcome when the type is big, the placement is quiet-zone-aware, and the photo recedes** (blur/grade/duotone) — otherwise separate.
2. **Shape-masked photos** (moods 7, 10) — photos revealed through organic cutouts (ellipse, flower). The generator already has frame-mode (clip photo into an SVG silhouette) and the brand shape library — this is a *rotation weight* issue, not a missing feature: these archetypes/variants should appear in the default rotation, not only via manual + Add.
3. **Collage energy** (moods 3, 4) — floating brand shapes + a message in a pill/card over the photo. Halfway between full separation and full weave; the pill gives text its own field *while* overlapping the photo. A "message pill" variant is cheap and very on-signal.
4. **Scale courage** — every moodboard headline is dramatically larger relative to the canvas than the generator's current output. Display type on moods 1, 2, 6 spans 70–100% of the canvas width.

## Revised recommendation stack (supersedes study #1's C1; C2–C6 stand)

- **R1 · Quiet-zone type-weave archetype.** New archetype (or documentary variant): 1–3 word display headline at ≥12% of canvas height, placed by the existing busyness/face-avoidance map into the photo's quiet zones, allowed to bleed off one edge. Photo gets a receding treatment (warmGrade + slight lift or blur) when contrast demands it — the born-clean way to do what moods 1/6 do.
- **R2 · Promote shape-masked photo layouts into rotation.** Wire frame-mode + the brand shape library (orchid petal, blobs) into 1–2 rotation variants (mood 7/10 pattern: shape-cutout photo + serif line in clear space).
- **R3 · Message-pill variant.** Rounded pill/card carrying the message, overlapping the photo's lower third (mood 3 pattern) — text keeps its own field, composition gains overlap energy.
- **R4 · Blob-behind-text, not blob-vs-text.** Extend C3: when a decor shape and a text block are both present, *compose* them (text centred on shape with padding, mood 8) instead of merely avoiding collision.
- **R5 · Headline scale floor.** Raise the minimum display size on photo-led archetypes toward the moodboard's 70–100%-width presence; let the reflow engine shrink only when the quiet zone can't hold it.
- **R2–R5 all reuse existing machinery** (frame mode, shapes, busyness map, reflow); R1 is the only genuinely new layout logic.

## Data notes
- Moodboard sync: the `brand_moodboard` table now exists; the 10 desktop items were backfilled to the cloud on 2026-07-10. If more were uploaded on the phone, opening Posts → Moodboard there once will sync them too (backfill ships in `458361f`).
- Re-run this comparison as the moodboard grows — 10 images is a strong signal but a small set.
