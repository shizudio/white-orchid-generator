# Mobile-first design audit — White Orchid Content Studio

**Date:** 2026-07-08 · **Device profile:** iPhone-class, 375 × 812 CSS px, DPR 2
**Method:** live measurement of the running studio (`/generate`) at mobile viewport, not eyeballing.
**Scope:** the create/studio screen (the daily-use surface). Landing + gallery noted at the end.

The product's north star is "non-technical preschool staff make a beautiful post in a minute, mostly on their phone." So mobile is not a secondary skin — it's the primary surface. Judged against that, the studio today is **desktop-shaped and shrunk**, not mobile-first. The measurements below show where.

---

## The one number that matters

**The design preview — the entire point of the app — occupies 38% of the screen width (142 px of 375), with 176 px of empty ivory stacked above it.**

| What | Measured | Should be (mobile-first) |
|---|---|---|
| Canvas width | 142 px (**38% of screen**) | ~343 px (fill, minus 16 px gutters) |
| Canvas height (IG Portrait) | 178 px | ~430 px |
| Empty space above canvas (nav → canvas) | **176 px** | ~12–16 px |
| Page scroll at rest | **94 px** (scrolls with nothing to do) | 0 |

On a phone, the user opens the studio and the thing they came to see is a thumbnail floating in a sea of beige. Everything else flows from fixing this.

---

## P0 — Breaks the core experience

### P0.1 · The canvas collapses to a thumbnail
The `--generator-preview-height: clamp(240px, calc(100vh − 380px), 720px)` sizing (correct for desktop, where the frame hugs the canvas and reserves 380 px of chrome) does not translate to mobile. At 812 px tall it should resolve to ~432 px, but the canvas renders at **178 px** — the `maxHeight:100%` / `flex:0 1 auto` on the shell is being clamped by a height-limited parent, so width (derived from height) collapses with it.
**Fix direction:** on mobile (`max-width: 768px`), stop deriving canvas size from a reserved-chrome height. Let the **canvas fill the column width** (`width: 100%`, up to the screen minus 16 px gutters) and derive *height* from the aspect ratio. The canvas becomes the hero; chrome flows below it.

### P0.2 · 176 px of dead space above the preview + a 94 px phantom scroll
The vertical centering that gives desktop its calm balance leaves a huge void at the top on mobile, *and* pushes total height past the viewport so the page scrolls even though nothing is below the fold worth scrolling to. Once P0.1 makes the canvas fill width (taller), pin it near the top (small top margin, not centered) and the void + the phantom scroll both disappear.

**P0.1 + P0.2 are one fix:** a mobile layout where the canvas fills the width at the top of the content area. This single change reclaims ~2.5× the preview area.

---

## P1 — Accessibility & reachability

### P1.1 · Tap targets are below the minimum (WCAG 2.5.5 / Apple HIG = 44×44)
| Control | Height | Verdict |
|---|---|---|
| Like / Refresh / Undo pills | **28–29 px** | ✗ fail |
| Redo (icon-only) | 28 px | ✗ fail (and tiny width) |
| Export CTA | 34 px | ✗ marginal |
| Quick chips (+ Add caption, etc.) | 32 px | ✗ fail |
| Chat input | 41 px | ✗ marginal |
| Top-nav items | 44 px | ✓ ok |

For the exact audience least likely to have precise touch aim (busy staff, one-handed, on the move), the primary editing controls are all under the 44 px floor. **Fix:** bump the below-canvas pills and quick chips to ≥44 px tall on mobile (they have the horizontal room; it's only vertical padding).

### P1.2 · The format strip is effectively invisible on mobile (9 px tall)
`.generator-format-strip` is present but renders at **9 px** — the 6-format switcher that works on desktop is collapsed to a sliver. Format is shown read-only as "IG PORTRAIT" text in the sub-nav, so **a phone user can't change format** through the normal control. **Fix:** give the strip a real mobile treatment — a horizontally-scrollable row of format chips (thumbnail + label, ≥44 px) below the canvas, or fold format into the sub-nav "IG PORTRAIT" as a tappable dropdown.

---

## P2 — Hierarchy & polish

### P2.1 · Chat competes with the canvas for the fold
Below the small canvas, the "One honest note…" advisor message + quick-action chips fill the visible area — so at first glance the phone screen reads as *a chat app with a thumbnail*, not *a design tool*. Once the canvas is hero (P0), keep the advisor as a **collapsible bottom sheet / single dot** that expands on tap, rather than an always-open panel pushing the canvas up.

### P2.2 · Secondary controls are cramped
The logo mark (28 px) and "History ⌄" (28 px, 55 px wide) are small. Fine as secondary, but History deserves a 44 px tap area since it's how users recover past work.

### P2.3 · Sub-nav "Posts / Templates / IG PORTRAIT" is a three-way overload
On mobile these three do different jobs (feed vs starter gallery vs current-format label) but share one undifferentiated row. Worth separating the format label (state) from the Posts/Templates tabs (navigation).

---

## Landing & gallery (spot-check — in good shape)
The AI-first landing (`What do you want to create today?`) is genuinely mobile-first: large prompt field, tappable suggestion chips, a clear "Skip to the studio →". No changes needed. The Templates gallery wasn't deep-audited this pass.

---

## Recommended sequence
1. **P0.1 + P0.2 together** — mobile canvas fills width, pinned near top. Biggest win; everything else is easier afterward. *(One focused change to the preview-frame/shell sizing behind a `max-width:768px` query.)*
2. **P1.1** — 44 px tap targets on the control pills + quick chips.
3. **P1.2** — a real mobile format switcher.
4. **P2** — advisor-as-sheet, then the sub-nav split.

P0 is the difference between "a desktop tool that technically loads on a phone" and "a phone tool." I'd do P0 + P1.1 as the first shippable mobile pass.
