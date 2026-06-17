# The White Orchid — Design System

A premium student-care brand in Singapore: **a school led by children**. The White Orchid believes in the extraordinary potential of every child and gives them real ownership to lead, make decisions, and shape their own journey.

This system codifies how the brand looks and feels in product and marketing surfaces.

---

## Source materials provided

The starting point was a set of brand assets (no codebase, no Figma URL, no PDF brand-guideline file was reachable in this project — see **Caveats** at the bottom).

| Asset                          | What it gave us                                      |
|--------------------------------|------------------------------------------------------|
| `Primary Logo - Central Green.png/svg` | Wordmark + circle motif, hero brand mark            |
| `Primary Logo 3 — Flat Green / Ivory`  | Outline / flat treatments, both colorways            |
| `two_primary_logo_circle.svg/png`      | Circle-locked petal motif (used as avatar / favicon) |
| `two_primary_logo_bg_green.png`        | Petal motif on the deep-green field                  |
| `Primary Logo Motif.svg`, `Logo Outline.svg`, `Flat Vector.svg` | Petal-only motif treatments |
| `The White Orchid Pattern1.svg`, `Pattern2.svg` | Decorative repeating petal patterns (mint on ivory) |
| `Shape 1/2/3.svg`              | Organic blob shapes used as background ornaments     |
| Fonts: `Aboreto`, `Romie` (Reg/Italic), `Syne`, `Fira Sans` | Type system (display, editorial serif, secondary display, body) |

> The user mentioned `The White Orchid Brand Guideline_Light.pdf` in the upload list, **but it was not present on disk** when this system was built. Color and type decisions below were therefore inferred from the artwork + fonts that were present. **Please re-upload the PDF so the guidelines can be reconciled.**

---

## Brand essence

> *"A school led by children."*

The voice is **warm, considered, slightly editorial** — closer to a boutique hospitality brand or a slow-living magazine than a typical school website. It treats children with dignity (never cute, never patronising) and treats parents as thoughtful collaborators.

Three motifs do most of the visual work:

1. **The orchid petal mark.** A 5-petal stylised orchid, layered translucent, that reads abstract from a distance and figurative up close.
2. **Forest green + ivory.** A near-mono palette: deep `#264F49` against soft `#F6F8E9`, with sage and mint as supporting tones.
3. **Soft organic shapes.** Hand-drawn blobs (`Shape 1/2/3.svg`) and a tessellating mint petal pattern that float behind content as quiet ornament.

---

## Index

```
README.md                 ← you are here
SKILL.md                  ← Agent Skills entrypoint
colors_and_type.css       ← canonical CSS variables (color, type, space, radii, shadow)

fonts/                    ← all webfont files
assets/                   ← logos, patterns, shapes (PNG + SVG)
preview/                  ← Design-System-tab cards (one HTML per card)
ui_kits/
  marketing-website/      ← high-fidelity marketing site recreation
    index.html            ← clickable tour: Home → About → Programmes → Visit
    *.jsx                 ← components (Header, Hero, ProgrammeCard, …)
    README.md
```

---

## Content fundamentals

How copy is written for The White Orchid.

### Voice
- **Quietly confident, child-first.** Speak about children as capable people. Avoid baby-talk, exclamation marks, and sing-song rhymes.
- **Editorial cadence.** Short, deliberate sentences. Frequent line breaks. Comfortable with white space — both visual and verbal.
- **First-person plural for the school, second-person singular for the family.** "We believe…" / "Your child will…"
- **Italics carry weight.** Use Romie italic for one phrase per page — a quiet emphasis, never a shout.

### Casing
- Wordmark and the highest-level display (eyebrows, micro-labels): **ALL CAPS, wide-tracked** (Aboreto, +180 letter-spacing).
- Headings: **sentence case** in Romie serif. Never Title Case Like This.
- Body: sentence case. Buttons: sentence case. Navigation: sentence case.
- Acronyms keep their case (CCA, MOE).

### Tone examples (in-brand)
> *A school led by children.*
> Real ownership. Real decisions. Real consequences.

> Drop in for a morning. Stay for tea. See what your child sees.

> We are small on purpose. Forty children, two gardens, one quiet hum of curiosity.

### Anti-patterns (out of brand)
- ❌ "Unlock your child's potential with our world-class curriculum!" — too marketing-loud.
- ❌ "Hey there, busy parent! 👋" — chummy / emoji-led.
- ❌ "Best preschool in Singapore" — superlative.
- ❌ "FUN, SAFE & TRUSTED" — block caps + ampersand stack.

### Punctuation & emoji
- **Em-dash welcome.** Used freely for a beat. ("Drop in — stay for tea.")
- **No emoji** in marketing or product copy. The brand owns its motifs; emoji compete with them.
- **No exclamation marks** in headlines or sub-heads. Acceptable in a single in-the-flow callout, never two in a row.
- Curly quotes ("…", '…') always. Straight quotes are a typesetting tell.
- Numbers under 10 are spelled out in body copy ("forty children"), digits in stats ("1:6 ratio").

---

## Visual foundations

### Colors
The palette is intentionally narrow. Deep green and ivory carry 90% of any page. Sage / mint and warm earth tones are accents.

| Token              | Hex       | Role                                    |
|--------------------|-----------|-----------------------------------------|
| `--tw-green-700`   | `#264F49` | **Primary** — logo, headlines on ivory  |
| `--tw-green-900`   | `#18332F` | Pressed / deepest                       |
| `--tw-green-50`    | `#EDEFE1` | Soft petal highlight, on-deep accents   |
| `--tw-green-200`   | `#CCD6C9` | Sage petal, dividers on ivory           |
| `--tw-mint-400`    | `#B4D6C0` | Pattern fill, optimistic accent         |
| `--tw-ivory-100`   | `#F6F8E9` | **Page background**                     |
| `--tw-clay`        | `#C68B6B` | Warmth — sparingly                      |
| `--tw-sand`        | `#E8D9B8` | Subtle highlight                        |
| `--tw-berry`       | `#8C3A4A` | Serious / error                         |
| `--tw-sun`         | `#D9A93B` | Warning, sunshine                        |

Inverted sections: **deep green field with ivory text**. Always have one or two of these per long page — the brand rhythm comes from alternating the ivory-on-paper and ivory-on-green moods.

### Type
A four-family system, each with one job:

| Family       | Role                                                | Notes                              |
|--------------|-----------------------------------------------------|------------------------------------|
| **Aboreto**  | The wordmark. Display all-caps, wide tracking.      | One per screen, max two.           |
| **Romie**    | Editorial serif. Headings, hero, pull-quotes.       | Italic is a brand signature.       |
| **Fira Sans**| Body, UI, navigation, captions.                     | 300/400/500/600/700 in use.        |
| **Syne**     | Secondary display (smaller hits — section labels).  | Used sparingly to break up Romie.  |

Body sits at **17px / 1.45 line-height** on ivory. Hero headlines clamp from 48 → 104px in Romie. Eyebrows are Aboreto 12px, +0.18em tracking.

### Spacing
A 4px base scale (`--space-1` … `--space-32`). The brand reads quiet because layouts use **larger** vertical rhythm than typical web — minimum `--space-12` (48px) between major content blocks, often `--space-20` (80px) on marketing.

### Backgrounds
- **Default:** flat ivory. No gradients.
- **Inverted:** flat deep green, optionally with one of the petal motifs (`assets/pattern-1.svg` or `pattern-2.svg`) at 8–14% opacity, large scale.
- **Decorative:** one or two of the `Shape 1/2/3.svg` blobs floating in a section, low opacity (15–40%), large, slightly clipped by the section edge — never centered.
- **Imagery:** real photography, warm-tone, slightly desaturated, with negative space. Never stock-flat. (Photographs should be commissioned — placeholders welcome until then.)
- **No patterns layered on photography.** Patterns and photographs never share a section.

### Animation
- **Quiet.** 140–420ms, `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out) for almost everything.
- **Reveal-on-scroll:** subtle 12px upward fade-in, 420ms. No bounce, no parallax.
- **Hover:** opacity drop on links/buttons (to ~0.7) is the default. Color shifts on filled buttons (green → green-800).
- **No looping background animations.** No Lotties on marketing. No carousel auto-advance.

### Hover & press states
- **Text links:** `opacity: 0.65` on hover. The 1px underline is always present (the brand reads bookish, not webby).
- **Filled buttons (green):** background shifts `--tw-green-700` → `--tw-green-800` on hover, `--tw-green-900` on press.
- **Outline buttons:** background fills with `--tw-green-50` on hover; border deepens.
- **Cards:** translate up 2px on hover (`transform: translateY(-2px)`), shadow softens to `--shadow-md`.
- **Press:** `transform: translateY(1px)` plus the deeper bg. No scale-down.

### Borders & dividers
- 1px hairlines in `--line` (green @ 14% alpha). Always green-tinted, never neutral grey.
- On deep-green: 1px in `--line-on-deep` (ivory @ 20%).
- **Dividers are negative space first, hairlines second.** Default to whitespace.

### Shadows
Naturalistic, green-tinted (`rgba(38, 79, 73, 0.06–0.22)`). Four steps: `xs / sm / md / lg`. Avoid neon, avoid pure black.
- Cards default to `--shadow-sm`, hover to `--shadow-md`.
- Modals/menus use `--shadow-lg`.
- **No inset shadows for "depth."** Inset is reserved for hairline insets via `--shadow-inset`.

### Corners (radii)
- Pills (`--radius-pill`) for buttons, tags, inline labels.
- Soft (`--radius-md` 14 / `--radius-lg` 20) for cards.
- Generous (`--radius-2xl` 40) for hero/feature panels.
- Sharp 0 corners are reserved for full-bleed sections only.

### Cards
A White Orchid card is **ivory on ivory** (slightly raised, `#FFFFFF` on `#F6F8E9` page) with a 1px hairline `--line`, `--radius-lg` corners, and `--shadow-sm`. No headers, no chrome — title sits in body type. On a deep-green section, cards flip: `--tw-green-600` fill, `--line-on-deep` border, ivory text.

### Capsules vs gradients
- **Capsules over gradients.** Pills carry meta info (programme age range, tour time, status). 28px high, Fira 12px Medium, +0.04em tracking, `--tw-green-50` bg + `--tw-green-700` text on ivory.
- **No protection gradients on photography.** If contrast fails, increase the photo darkening uniformly or move text into a card.

### Transparency & blur
- **Transparency:** used in two places only — pattern overlays on green (8–14%) and shape blobs in marketing sections (15–40%).
- **Backdrop blur:** never. (The brand wants paper, not glass.)

### Imagery treatment
Warm cast, soft contrast, rendered at body temperature. Lots of green, wood, terracotta, cotton. Avoid cool-toned, harsh, fluorescent, or blue-shifted photography. Never B&W. Never grainy filters. A faint film warmth is good; aggressive grading is not.

### Layout rules
- One **fixed top header** (max 72px tall on desktop, 56px mobile). It does **not** translucent-blur over the page; it sits on a solid ivory band with a hairline beneath.
- Footer is deep-green inverted, full-bleed, generous (240–320px tall on desktop).
- Marketing pages alternate **ivory section → green section → ivory section** to give the brand its rhythm.
- Max content width: `--container` (76rem ≈ 1216px). Long-form prose narrows to `--container-narrow` (48rem ≈ 768px).

---

## Iconography

The White Orchid does **not** ship an icon font. The brand's "icons" are the petal/orchid motif and the three blob shapes — they are illustrated vector art, not utility icons.

For UI affordance icons (chevrons, search, menu, pagination, tour-pin, calendar) the system uses **[Lucide](https://lucide.dev/)** — a thin-stroke (1.5px), rounded-cap line set that matches the editorial weight of Romie + Fira. Loaded from CDN:

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

Used at sizes **16 / 20 / 24 px**, never larger. Always inherit `currentColor` from the parent. The brand-mark motif is used for hero ornament and favicons; **utility icons live in chrome (header, buttons, menus) only.**

> **Substitution flag:** Lucide is a substitution. The brand artwork did not include a utility icon set, and no Figma file with components was provided. If the school has a custom icon family, please share it — Lucide will be swapped out 1:1.

### Emoji & unicode
- **No emoji** anywhere in product or marketing.
- **Special unicode glyphs sparingly.** Em-dash (—) yes. Bullet (•) yes, in lists. Arrow (→) yes, in CTAs. Avoid stars, hearts, crowns, etc.

### Asset inventory (`assets/`)
All logo / motif art is **PNG** (the vendor SVG exports were corrupt — flower rendered black — and have been removed).
- `logo-central-green.png` — primary vertical lockup (circle motif over wordmark)
- `logo-1-green.png` / `logo-1-ivory.png` — horizontal lockup, green & ivory
- `logo-2-green.png` / `logo-2-ivory.png` — stacked lockup, green & ivory
- `logo-3.png` / `logo-3-green.png` / `logo-flat-green.png` — motif treatments
- `logo-4.png` — wordmark-led lockup
- `logo-circle.png` — circle-locked motif (favicon / avatar)
- `logo-bg-green.png` / `logo-bg-none.png` — petal motif on green field / transparent
- `logo-motif.png` — solid ivory motif (use on Burnham)
- `orchid-flat-vector.png` — green-outline motif (use on light / quotes)
- `logo-outline.png` — faint ivory outline motif (watermark)
- `pattern-1.svg`, `pattern-2.svg` — repeating mint petal patterns
- `shape-1.svg`, `shape-2.svg`, `shape-3.svg` — organic blob ornaments

---

## Caveats & open questions

1. **Brand guideline PDF was missing.** It was listed in the upload manifest but not present on disk. Once re-uploaded, expect: (a) confirmed colour HEX values, (b) confirmed clear-space rules around the logo, (c) any official tone-of-voice phrasing.
2. **Lucide is a substitution** for the icon set — see Iconography.
3. **No real photography** is in the assets. The UI kit uses tasteful neutral placeholder fills (no AI-generated images, no stock-flat).
4. **No URLs / final IA** were provided. The marketing UI kit assumes a typical preschool IA: Home, About, Programmes, A Day Here, Visit, Stories.
5. **Figma is not connected.** Component fidelity is from the artwork only.
