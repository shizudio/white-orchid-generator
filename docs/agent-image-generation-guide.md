# The White Orchid — Image Generation Runbook v2 (HTML rendering)

How the ChatGPT-5 agent produces the bright/airy, on-brand photography **and** finished
branded social posts. v2 replaces the Pillow compositor with an **HTML/CSS + headless
screenshot** layer (perfect text, exact brand colors, LLM-friendly). The Higgsfield
photo half is unchanged from v1.

Referenced files (in this repo):
- `tools/post-template.html` — the parametrized 1080×1350 post template
- `tools/render.mjs` — fills the template from a JSON spec and screenshots it to PNG
- `the-white-orchid-design-system/project/` — colors, fonts, logos (source of truth)

---

## 0. Mental model — three roles, three tools

> **Higgsfield makes a clean photo. ChatGPT composes (a spec). HTML renders exact pixels.**

| Role | Tool | Output |
|---|---|---|
| **Photo** | Higgsfield `soul_2` | bare photograph, no text |
| **Art direction / composition** | ChatGPT-5 (you) | a JSON **spec** (copy, which photo, pill, etc.) |
| **Render (exact pixels)** | `post-template.html` + `render.mjs` | final PNG, real hex + fonts + logo |

Two hard rules, unchanged and non-negotiable:

1. **Never put brand names, taglines, copy, "post", "flyer", "website", or any
   words-you-want-shown into the Higgsfield prompt.** That makes Soul render a gibberish
   webpage. The model only ever sees a photographic scene.
2. **Never let the model decide brand colors.** Exact colors come from CSS tokens at
   render time. The photo only has to be "in the palette family."

Pipeline: `Higgsfield → clean photo` → `ChatGPT → spec.json` → `render.mjs → post.png`.

---

## PART A — Generating the photograph (Higgsfield API) — unchanged

### A.1 Fixed parameters
```json
{ "model": "soul_2", "quality": "2k", "aspect_ratio": "3:4" }
```
- `soul_2` (Soul 2.0; backend id `text2image_soul_v2`). `quality: "2k"` (~1080p).
- `aspect_ratio: "3:4"` — there is **no 4:5**; 3:4 is the portrait option.
- **Do NOT send** `style_id` (returns 400 "style not found" — MCP-internal only),
  `width`, `height`, `enhance_prompt`.
- **seed:** not in the public surface (`quality` + `soul_id` only). Try it for
  reproducibility; if ignored, fine — the *look* is prompt-driven.

### A.2 Job flow
Submit → poll job id until `status == "completed"` → read result URL (`results.rawUrl`)
→ download PNG. Account cap: **4 concurrent jobs**; batch in waves of 4.

### A.3 The prompt template (the consistency lever)
One fixed style block; change only the subject line.
```python
STYLE = (
  "Bright, airy natural daylight, luminous and evenly lit, clean and fresh, "
  "minimal grain. Gentle warm editorial color, palette of forest green, ivory "
  "and warm terracotta, natural warm Asian skin tones. Medium format, crisp, "
  "generous negative space. A single full-frame edge-to-edge photograph — "
  "no text, no letters, no logos, no border, no poster, no frame, no captions, no UI."
)
def prompt(subject): return f"Bright, airy editorial photograph of {subject}. {STYLE}"
```
Subject lines: one concrete scene, **always state age + ethnicity** ("average
ten-year-old Asian child"). Warm props reinforce the palette (pale oak, terracotta
pots, monstera, ivory walls, wooden blocks, dried flowers).

### A.4 Known Soul quirks + mitigations
| Quirk | Looks like | Fix |
|---|---|---|
| Garbled text baked in | fake letters on walls/space | keep `no text, no logos`; if present, re-roll (v2 wants clean photos) |
| Poster/magazine layout | photo shrunk into a framed page + gibberish + fake status bar | add `single full-frame edge-to-edge photograph, no border, no poster, no frame`; common on tabletop/still-life; if it persists, **crop the clean inner rectangle** before use |
| Kids render younger | ~5yo instead of 10 | re-roll; keep "average ten-year-old" explicit |

**QC every photo before it enters the render step. In v2, only feed the renderer clean,
text-free photos** — so the HTML scrim can stay a simple contrast gradient.

---

## PART B — Brand source of truth — unchanged

### B.1 Color tokens (`the-white-orchid-design-system/project/colors_and_type.css`)
| Token | Hex | CSS var |
|---|---|---|
| Burnham (primary green) | `#254E48` | `--tw-burnham` |
| Burnham dark | `#1B3B36` | `--tw-burnham-dk` |
| White Smoke (ivory) | `#F5F6E7` | `--tw-smoke` |
| Warm ivory | `#EFF1DC` | `--tw-smoke-warm` |
| Celadon | `#B4D6C0` | `--tw-celadon` |
| Wisteria | `#DEC5D8` | `--tw-wisteria` |
| Sand | `#E8D9B8` | `--tw-sand` |
| Tangerine (CTA only) | `#F6644E` | `--tw-tangerine` |
| Jet (text) | `#282B28` | `--tw-jet` |

Green + ivory carry ~90%; wisteria/celadon/sand/tangerine are accents. **In HTML, just
`@import` `colors_and_type.css` and use the `--tw-*` vars — never hardcode.**

### B.2 Fonts — ⚠ the empty-file gotcha
Font files live in `.../project/uploads/`. **Un-hashed filenames are 0-byte Git-LFS
placeholders and will not load.** The template's `@font-face` points at the **hashed**
files that contain data:
| Role | File |
|---|---|
| Serif headlines / italic phrase | `Romie-Regular-cbb51006.otf`, `Romie-Italic-0f7e9948.otf` |
| Eyebrows / labels / pills / handle | `Syne-VariableFont_wght-6c537669.ttf` |
| Wordmark caps | `Aboreto-Regular.ttf` |

Fira Sans files are all empty — substitute **Syne** for body/UI. Type roles: **Romie** =
headline + the one italic phrase (brand signature); **Syne** = eyebrows (ALL CAPS,
wide-tracked), pills, handle; **Aboreto** = wordmark only.

### B.3 Logos
- `Primary Logo 2 - Ivory.png` — horizontal ivory lockup; use on green/dark scrims.
- Ivory logo is invisible on light panels — for those, use a green motif (crop the petal
  from `Primary Logo 1 - Ivory.png` and recolor, or use a green logo variant).

---

## PART C — Composition & rendering (HTML/CSS + screenshot)

### C.1 Why HTML
Text renders perfectly (real fonts, zero gibberish), colors are exact (real `--tw-*`
tokens), letter-spacing/gradients are one CSS line, and **ChatGPT-5 is far better at
emitting HTML/JSON than PIL geometry** — which is the whole point of letting the system
compose.

### C.2 The template
Use `tools/post-template.html` (1080×1350). It:
- `@import`s `colors_and_type.css` and declares `@font-face` for the hashed fonts,
- full-bleeds the photo, lays a deep-green **top scrim** (contrast) and **bottom scrim**,
- centers the ivory logo, a Syne eyebrow, a Romie headline (with one italic `<span>`),
  and a footer with a tangerine pill + handle,
- exposes `{{PLACEHOLDER}}` slots.

### C.3 ChatGPT's job = emit a spec, not pixels
Per post, output **only** a JSON spec. Example:
```json
{
  "photo": "photos/afternoon-blocks.png",
  "eyebrow": "AFTERSCHOOL CARE · SINGAPORE",
  "headline_line1": "Afternoons,",
  "headline_italic": "led by the child.",
  "pill": "NOW ENROLLING",
  "handle": "thewhiteorchid.sg"
}
```
`render.mjs` fills the template from this and screenshots it. Composition variety (which
photo, which copy, pill or no pill, which accent) is the agent's creative call — but it
always flows through the template so brand precision is guaranteed.

### C.4 Render to PNG
```bash
node tools/render.mjs spec.json out/post.png
```
`render.mjs` (Playwright) loads the filled template at a 1080×1350 viewport,
`deviceScaleFactor: 2`, waits for `document.fonts.ready`, and clips to the post. Output
is a crisp 2160×2700 PNG (downscale to 1080×1350 if you want the exact IG size).

### C.5 Copy voice guardrails (enforced in the spec)
- Sentence-case headline; **no exclamation, no emoji**; em-dash ok.
- **Exactly one italic phrase** (`headline_italic`) — the brand signature. Never two.
- Eyebrow ALL CAPS. Digits in stats ("1:6", "40 children").
- Tangerine pill only for a real CTA; drop the pill for tributes/quotes.
- Echo the master line where it fits: *"A school led by children."*

### C.6 Grids (12-tile feed preview)
Two options:
1. **Simplest:** render 12 individual posts, then montage into a 3×4 sheet (any image
   tool, or a second HTML page with a CSS grid of 12 `<img>`).
2. **Native:** a `grid.html` (1776×2910) with a CSS `grid-template-columns: repeat(3,1fr)`;
   each cell is either a photo tile (with a Syne eyebrow label + small bottom gradient) or
   a `--tw-*` color panel (eyebrow + Romie headline). **Checkerboard the colors** so no two
   same-color panels touch; include one hero tile (logo + tagline) and one CTA tile.

### C.7 Photo QC still applies
Only clean, text-free photos enter the render. Re-roll gibberish/poster renders, or crop
the clean inner rectangle out of a poster render before referencing it in a spec.

---

## PART D — End-to-end checklist per asset
1. Write a **photographic** subject line (age + ethnicity + one scene). No brand words.
2. Generate with `soul_2` / `2k` / `3:4` + `prompt(subject)`; poll → download PNG.
3. **QC the photo:** garbled? poster? wrong age? → re-roll or crop before using.
4. Emit a **JSON spec** (Part C.3) — the composition/copy decision.
5. `node tools/render.mjs spec.json out.png`.
6. Verify: colors = tokens, text crisp, one italic phrase, no emoji/!, logo legible.

**One sentence if nothing else survives: Higgsfield makes a warm photo in the palette;
ChatGPT emits a spec; HTML paints the exact-hex brand system on top. Keep every letter of
brand text out of the Higgsfield prompt.**

---

## Appendix — Pillow fallback (v1)
If a browser/Playwright isn't available, composite with Pillow instead: same tokens
(Part B.1), same hashed fonts (B.2). Draw photo → green scrim (sample the wall, opaque
through any text zone, fade before the face) → ivory logo → Syne eyebrow (manual
letter-spacing) → Romie headline (one italic line) → tangerine pill + handle. HTML is
preferred; use this only when headless rendering is unavailable.
