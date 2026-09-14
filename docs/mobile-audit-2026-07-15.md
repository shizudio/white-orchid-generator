# Mobile UI/UX Audit — iOS-focused (2026-07-15)

Status: **evidence/report class** (history, never law). Do not commit as part of a code change.
Tree audited: `be1add4`. Method: production-like build in an isolated dist
(`WO_DIST_DIR=.next-mobile-audit`, `NEXT_PUBLIC_WO_TEST_HOOKS=1`), served with photo
keys unset (`HIGGSFIELD_*` + `OPENAI_API_KEY` empty), driven live with the Chrome
MCP tools at **375×812** (primary), **430×932** and **390-class** spot-checks.
Money law honored: an in-page fetch guard intercepted **5** `POST /api/sessions`
autosave attempts (autosave IS live on this build — Supabase is configured here), and
**zero** image/credit calls were attempted. No cloud rows written, no credits spent.

Note on the emulator: the MCP browser reports `innerWidth` ~407 for a "375" viewport
while rendering screenshots at true 375 CSS px. Width-sensitive clipping is therefore
reported from the **375-rendered screenshots** and corroborated by absolute DOM px
(content laid out to a ~391px right edge). Breakpoint-driven CSS (`≤640/760/767`) applies
identically across the whole phone class, so this offset does not change which rules fire.

Keyboard behavior on iOS Safari (dynamic toolbar, real on-screen keyboard,
`visualViewport`) **cannot** be fully reproduced in desktop emulation; those items are
marked **code-inferred** and reasoned from the source, distinct from **observed-live**.

---

## Executive summary — the 5 worst frictions

1. **The inspector drawer buries the element you're editing.** Opening any inspector
   slides up a `position:fixed; bottom:0` sheet that occupies **66% of the viewport**
   (measured 585px of 881px); on a portrait canvas only **40% (171px of 429px)** of the
   canvas peeks above it and the peek is dimmed by a 0.42 backdrop. Tapping the "18 JULY"
   title selected it and then **hid it behind the sheet** — you cannot see the edit you
   just made. This is the client's headline complaint, reproduced exactly.

2. **The sheet is a fixed 72vh regardless of content.** The Photo inspector needs ~30vh
   of controls but claims 66vh — the bottom third is empty white space that hides the
   canvas for no reason. The drawer's size is the disease; the occlusion is the symptom.

3. **Every text input is 14px → iOS auto-zooms the page on focus.** The chat composer
   (`textarea`, 14px measured) and every Text-inspector content field
   (`ContentFieldsPanel.jsx` `fontSize:14`) are below iOS's 16px zoom threshold. In a
   chat-first product for non-technical staff, the primary action zooms the layout on
   every tap-to-type, then they must pinch back out.

4. **No `viewport-fit=cover` → all safe-area handling is dead on iOS.** `app/layout.jsx`
   exports no `viewport`, so Next ships only `width=device-width, initial-scale=1`. The
   four `env(safe-area-inset-*)` rules in `globals.css` resolve to 0, AND the inspector
   sheet has `padding-bottom:0` outright — so its bottom row (SIZE pills, colour swatches)
   sits under the home indicator, and the fixed bottom bars collide with Safari's
   collapsing toolbar.

5. **Undo is unreachable exactly when you're editing.** The only Undo control lives in the
   below-canvas control row (measured `top:575`), which the open drawer (`top:297`) fully
   covers. There is no floating undo on mobile — a direct violation of the ratified §2.7
   amendment ("a small always-available undo affordance floating near the canvas").

---

## The drawer problem — precise current behavior + redesign options

### Current behavior (measured live, 375-class portrait)

| Property | Value | Source |
|---|---|---|
| Sheet element | `.wo-inspector-dock` → `ContextualInspector.jsx` | code |
| Position | `position:fixed; left/right/bottom:0; top:auto` | `globals.css:1879` |
| Height | **585px = 66% of viewport** (CSS: `height:72vh; max-height:72vh`) | measured |
| z-index | 362 (backdrop 361) | `globals.css:1893` |
| Canvas visible above sheet | **171px of 429px = 40%**; 60% (258px) occluded | measured |
| Selected element | ends up **behind the sheet** (title "JULY" fully hidden) | observed-live |
| Backdrop | `rgba(37,45,40,0.42)` — dims the 40% peek too | `globals.css:1900` |
| Live-update | **Works** (tapping Size S changed heading m→s, drawSeq 38→44) — but the change is behind the sheet | observed-live |
| Dismiss | backdrop tap ✓, close ✕ ✓; **no swipe-down**, no drag handle | observed + code |
| Scroll trap | No — inner `.wo-inspector-body` scrolls (scrollH 582 > client 441)… | measured |
| …but | `overscroll-behavior:auto` → over-scroll **chains to the page** behind on iOS | measured |
| Safe area | `padding-bottom:0` → bottom controls under the home indicator | measured |
| Empty space | Photo inspector fills ~30vh of a 66vh sheet — bottom third is dead | observed-live |

The mechanism is sound (all inspector edits ride the patch pipeline and the single canvas
redraws — verified). The failure is purely **spatial**: the drawer's fixed 72vh height
covers the canvas hero and, worse, the specific element under edit, so the live update is
invisible.

### Redesign options

**Option A — Content-height half-sheet with detents + auto-scroll-to-selection (RECOMMENDED).**
Default the sheet to `height:auto` capped at a low detent (~40–45vh) so short inspectors
(Photo, Background, Logo) reclaim the wasted lower third and reveal the canvas. On open,
**scroll/pan the canvas so the selected element lands in the visible band above the sheet**
(the layout engine already knows every role's box — `__woRoleBounds`). A drag handle
promotes the sheet to a taller detent for the long Text inspector. Add `viewport-fit=cover`
+ `env(safe-area-inset-bottom)` padding + `overscroll-behavior:contain`.
- *Tradeoff:* needs a resizable-sheet component + a scroll-into-view calc per selection.
- *Why it wins:* keeps the **single hero canvas** as the one source of truth (no second
  surface — honors the one-canvas contract), keeps the edited element visible, and the
  `72vh → content-height` change alone fixes the empty-space and most of the occlusion.

**Option B — Auto-scale/pan the canvas into the band above the sheet.**
On open, shrink+letterbox the whole canvas render into the top ~35vh so the entire design
stays visible above the sheet with the selected element highlighted.
- *Tradeoff:* the canvas becomes small (~35vh) for all edits; simplest to implement (one
  transform, no per-element math). *Con:* a tiny canvas for detail work.

**Option C — Floating live mini-preview.**
A small pinned thumbnail of the selected element's region floats above the sheet during
editing, mirroring the canvas live.
- *Tradeoff:* cheap; always shows the edit. *Con:* introduces a transient second surface
  — mild tension with "nothing else exists" (though it is a preview, not a control).

**Recommendation: Option A**, with Option B's auto-scale as the fallback for the tallest
inspectors where even the low detent can't clear the element. Option A is the only one that
respects the ratified one-canvas UX while directly killing both the occlusion and the
fixed-height empty-space defects.

---

## Ranked findings

| # | Sev | Screen / flow | What happens | Why it hurts | Proposed fix | Effort | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | major | Inspector (any element) | Drawer is `fixed;bottom:0;height:72vh` (585px = 66% vp); covers 60% of canvas incl. the **selected** element | Client's headline complaint: you can't see the effect of your edit; the element under edit is hidden | Option A half-sheet + auto-scroll selection into view (`globals.css:1879`, `ContextualInspector.jsx`) | L | observed-live |
| 2 | major | Inspector | Fixed 72vh **regardless of content**; Photo inspector fills ~30vh, bottom third empty | Hides the canvas for no reason; the height is the root cause of #1 | `height:auto` + detent cap; drag-to-expand | M | observed-live |
| 3 | major | Chat composer + Text inspector | All text inputs `font-size:14px` (<16px) | iOS auto-zooms page on every tap-to-type; primary action in a chat-first app | Bump editable inputs to ≥16px on mobile (`ArtDirectorChat` composer; `ContentFieldsPanel.jsx:6,15`) | S | live + code |
| 4 | major | Whole app (iOS chrome) | No `viewport-fit=cover`; `app/layout.jsx` exports no `viewport` | All 4 `env(safe-area-inset-*)` rules resolve to 0; notch/home-indicator overlap; fixed bars under Safari toolbar | Add Next `export const viewport = { viewportFit:'cover', width:'device-width', initialScale:1 }` | S | live (meta) + code |
| 5 | major | Editing while drawer open | Only Undo is in the below-canvas row (`top:575`), behind the sheet (`top:297`); no floating undo on mobile | Can't undo without first closing the drawer; **violates ratified §2.7** | Floating undo affordance near the canvas / inside the sheet header | M | observed-live |
| 6 | major | Inspector sheet | `padding-bottom:0` (no safe-area); SIZE pills + colour swatches at the very bottom edge | On notched iPhones the bottom controls sit under the home indicator | `padding-bottom:calc(16px + env(safe-area-inset-bottom))` on `.wo-inspector-dock` (mirror `globals.css:1359`) | S | measured |
| 7 | major | Inspector (≤391px devices) | Content fields, element chips, close ✕ all laid to a ~391px right edge | On iPhone SE / 12·13 mini (375) the fields, "Logo" chip and ✕ clip off-screen (seen in 375 render) | Constrain inspector content to `100%`/`max-width:100vw`; box-sizing audit | M | observed-live (375 shot) + measured |
| 8 | major | Hero canvas gestures | `touch-action:none` on the canvas wrapper + no pinch handler (`useCanvasGestures` is single-pointer handle-drag) | A scroll gesture starting on the big hero canvas won't scroll the page; photo can't be pinch-zoomed (handle-drag only) | Scope `touch-action` to selected/active state; add optional pinch for photo zoom | M | code-inferred + live (scroll timed out over canvas) |
| 9 | major | Overall mobile flow | One long scroll: canvas → controls → chat. Chat-driven edits (the **primary** interaction) run with the canvas scrolled off-screen above | Same "can't see the effect" problem as the drawer, for the main input path | Sticky mini-canvas or split so the canvas stays in view while chatting | L | observed-live |
| 10 | minor | Close button | `width:30;height:30` ✕ (`ContextualInspector.jsx:10`) at far right | Below 44px tap floor; hard to hit; clips on ≤392px | 44px min; move off the extreme edge | S | code + measured |
| 11 | minor | Inspector | `overscroll-behavior:auto` on `.wo-inspector-body` | Over-scrolling the sheet chains/rubber-bands the page behind it on iOS | `overscroll-behavior:contain` | S | measured |
| 12 | minor | Inspector | SIZE S/M/L pills `height:32px` | Below 44px tap floor | 44px min-height on mobile | S | measured |
| 13 | minor | Inspector | Backdrop `rgba(...,0.42)` dims the 40% canvas peek | The little canvas you CAN see is darkened, worsening edit visibility | Lower backdrop opacity or clip backdrop to below the canvas band | S | observed-live |
| 14 | minor | Top nav | Nav needs ~405px (`scrollWidth 405 > clientWidth 375`); right items ("How it works ↗", "?") clip | Guide/help entry points partly off-screen on ≤~400px | Collapse nav to a menu below ~400px | S | measured + observed |
| 15 | minor | Templates popover | Right-column template cards + REMOVE clipped at the right edge | Half the template grid runs off-screen on mobile | Single-column grid on mobile, or horizontal snap-scroll | S | observed-live |
| 16 | minor | Landing | Suggestion chips `height:33px` | Below 44px tap floor (the landing input is fine at 16px) | 44px min-height | S | measured |
| 17 | minor | Export sheet | Primary tangerine CTA is "Download **all 6** formats"; "Just this one" is de-emphasized | The common single-post case is the secondary button (cross-viewport, but hits mobile) | Swap emphasis or make it context-aware | S | observed-live |
| 18 | minor | Inspector dismiss | No swipe-down / drag-handle dismiss; only tiny ✕ + backdrop | Misses the expected iOS bottom-sheet gesture | Add drag-to-dismiss on a handle | M | code-inferred |
| 19 | minor | Canvas selection | Switching elements takes 2 taps — backdrop intercepts the first canvas tap (dismiss), then re-tap to select | Extra step for a frequent action | Let a canvas tap through the backdrop re-select in one gesture | M | observed-live |
| 20 | trivial | Code hygiene | `globals.css:1471-1472` comment claims the mobile canvas is a "sticky-preview cap `min(27vh,178px)`"; the live model is a **static full-width hero** (`globals.css:1027-1045`) | Stale comment misleads the next engineer working the mobile layout | Update the comment | S | code |

Informational: **no dark-mode / system-theme response** anywhere (no `prefers-color-scheme`,
no `data-theme`) — the app is light-only. Not a defect, but there is no iOS dark-mode
adaptation to audit. The floating chat launcher/overlay (`.ad-launcher`/`.ad-panel`) is
**correctly not rendered on mobile** (docked `.wo-chat-col` under the canvas is used), so the
pre-ratification floating overlay is not a live mobile concern.

Positive checks (no defect found): format switching portrait→story→facebook updated **both**
the canvas buffer and CSS aspect ratio coherently (1080×1350 → 1080×1920, AR 0.563) — the
signature **stale-draw (M1) does not reproduce** on mobile format switches; inspector edits
**do** live-update the canvas via the patch pipeline (drawSeq increments); readiness dots +
advisor ledger surface per-format fit issues correctly.

---

## Ratified-contract violations vs items needing a NEW client ruling

**Violates the ratified `ux-architecture.md`:**
- **Finding #5 — Undo unreachable while editing.** §2.7 (2026-07-05, client-ratified)
  mandates "a small always-available undo affordance floating near the canvas." On mobile
  there is none; the sole Undo is occluded by the open drawer. This is a straight
  regression against a ratified amendment.

**Needs a NEW ruling (the ratified design deliberately punted, it did not endorse this):**
- **The drawer covering the canvas (findings #1, #2, #9).** §6 Non-goals states: *"Mobile
  parity is required but mobile-specific redesign beyond 'chat under canvas' is out of scope
  for WP-V."* And §2.3's inspector shape ("right side, or floating near selection") is
  written for desktop. The bottom-sheet-that-covers-the-canvas was never ratified as good —
  the doc **deferred** the mobile inspector. §2.1's "the chat must never overlap/cover the
  canvas" rule was scoped to **chat**; the inspector-as-bottom-sheet covering the canvas is
  an unaddressed gap. The client should rule on the mobile inspector model (recommend
  Option A) — this is a decision to make, not a rule that was broken.
- **The one-long-scroll mobile flow (#9).** Same status: §2.1 ratified only "chat docks
  under the canvas" for mobile; whether the canvas must stay in view during chat editing is
  an open mobile-design question for the client.

---

## Screenshots (captured live this session)

MCP screenshots are returned inline, not persisted to disk; each key frame below was
captured live at the stated viewport during the audit and is described for the record:

- `landing-375` — prompt page ("What do you want to create today?"), composer + suggestion
  chips (chips 33px), nav right-item clip visible.
- `editor-default-375` — studio with default Photo+Logo portrait design; canvas hero, LIKE
  / REFRESH / UNDO / redo / EXPORT row, docked chat below.
- `photo-inspector-open-375` — **drawer over canvas**; 66% sheet, dimmed 40% canvas peek,
  clipped ✕ and Upload button, large empty lower third (findings #1, #2, #7, #10).
- `text-inspector-title-occluded-375` — selected "TITLE" frame with "JULY" hidden behind
  the sheet; content fields clipped right; SIZE pills at bottom edge (findings #1, #6, #7).
- `text-inspector-size-S-375` — after tapping Size S (heading m→s, live-updated) the change
  is behind the sheet; TEXT COLOUR swatches at the very bottom edge.
- `export-sheet-375` — Export bottom sheet; readiness list; "Download all 6" primary vs
  "Just this one" secondary (finding #17).
- `facebook-format-430` — multi-format switch to Facebook renders full caption; canvas
  buffer/AR coherent (no stale-draw).
