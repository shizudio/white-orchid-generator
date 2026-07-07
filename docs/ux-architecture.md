# UX Architecture — One Canvas, Two Inputs, Zero Duplicates

Status: RATIFIED by client (Shina), 2026-07-04. This is the contract for WP-V (the
editor restructure). WP-T + WP-U ship to staging on the CURRENT layout first; WP-V
begins only after that is verified live.

## 0. The problem this replaces

The editor grew three parallel control surfaces — left tool panel, AI chat overlay,
right elements-bubbles rail — with no rule for which surface owns which action.
Observed pain (client's own usage):

1. No predictable home for an action: some edits panel-only, some AI-only
   (change image / change caption), and the panel sometimes LOOKS like it should
   do a thing but can't.
2. Direct manipulation is broken trust: clicking the logo/caption on the preview
   does nothing. Every dead click teaches "the canvas is just a picture."
3. The bubbles rail duplicates the panel → two stale-able views of one state.
4. The chat overlay covers the exact canvas region being edited.
5. Panel overload → user defaults to chat for everything (~70–80% of actions),
   even tweaks where chat is slower.

Target users are non-technical preschool staff who are fluent at PROMPTING, not
at design tools. The architecture is therefore chat-first.

## 1. The law

> **Say it to change WHAT IT IS. Touch it to change HOW IT LOOKS.
> One inspector shows WHAT'S SELECTED. Nothing else exists.**

- Semantic / creative intent → chat ("change the photo to kids gardening",
  "make the caption warmer", "try another layout").
- Geometric / cosmetic tweaks → direct manipulation on canvas (drag, resize,
  inline text edit) + the contextual inspector.
- There is no third surface.

## 2. The four surfaces (total, final)

### 2.1 Chat — the primary rail
- Docked LEFT column on desktop; canvas sits beside it, never under it.
  On mobile: chat docks UNDER the canvas.
- The chat must never overlap/cover the canvas in any state.
- 3–4 quick-action chips above the composer for the top asks:
  `Change photo · Rewrite caption · Try another layout · New post`.
  Chips are DYNAMIC: if the design lacks a caption, a chip reads `+ Add caption`.
- The landing (generate) flow and the editor are one continuous conversation.

### 2.2 Canvas — fully direct-manipulable
- EVERY element responds to click/tap: select → inline text edit where text,
  drag/resize handles, contextual toolbar. Dead clicks are impossible.
  (Foundation: WP-U item 1, universal click-to-edit.)
- Empty regions where the layout engine knows an element COULD go render a
  faint dashed ghost slot on hover/tap: "＋ add text here" (see §3).

### 2.3 Contextual inspector — selection-only
- NOTHING is shown until an element is selected; then a slim inspector
  (right side, or floating near selection) shows ONLY that element's
  properties: colour options, size, variant, delete.
- Includes a small layer list (the only surviving job of the bubbles rail)
  for selecting occluded elements — visible only when relevant.
- The big static left tool panel is DELETED. No fallback drawer. (Client chose
  the radical option deliberately: staff will never browse; a drawer is
  clutter returning through the back door.)

### 2.4 Top bar — globals only
- Format, post type, templates, export, undo. Slim, one row. Nothing per-element.

### 2.5 Deleted outright
- The right bubbles/elements rail (duplicate of panel state).
- The floating chat overlay.
- The static multi-section tool panel.

### 2.6 Appendix — old-panel capability mapping (WP-V Stage 2 migration audit)

Every capability of the deleted left tool panel + bubbles rail, and its new
home. Nothing silently lost. (Grepped section-by-section before deletion.)

| Old panel capability | New home |
|---|---|
| Templates gallery (starter cards) | Top bar → **Templates** popover |
| "Your templates" (cloud/local, sync badges, delete) | Top bar → Templates popover |
| Newer-draft-from-another-device banner (load/dismiss) | Top bar → Templates popover (badge dot on the button while pending) |
| Save current design as template | Top bar → Templates popover → "Save current design" |
| Archetypes grid (12 layouts + none, variant cycling) | Top bar → Templates popover → "Layouts" section; also chat ("try another layout") |
| Format grid (6 dimensions) + drop-hint note | Top bar → **Format** popover (+ live format strip under the canvas) |
| Post type chips | Top bar → **Post type** popover |
| Media: sample photos / Library / Upload | Photo inspector (select the photo); ghost slot "＋ add a photo" when no media (see §2.8) |
| Video: upload / play / restart / save / saved list | Photo inspector → Video tab |
| Midjourney launcher | Photo inspector |
| Photo quick transforms (center/50/75/fill/0°) | Photo inspector |
| Content fields (headline/subtext/attribution/date/eyebrow/pill) | Text inspector (click any text on canvas); chat; ghost slots |
| Typography (font-size steps, scale/width/leading, align, 9-grid) | Text inspector |
| Text backdrop (auto/band/none) + text colour | Text inspector |
| Logo variants (primary/secondary), 9-grid placement, size | Logo inspector (click the logo) |
| Overlays / accessories gallery + upload | Background / Overlay inspector "More options" fold → Shapes/Decoration (see §2.8); chat `addOverlay`; per-layer editing in the overlay inspector |
| Overlay layer controls (mode/colours/size/rotate/opacity) | Overlay inspector (click the shape) |
| Background swatches + opacity | Background inspector (click empty canvas) |
| Export format PNG/JPG + Download + Download all formats | Top bar → **Export** popover |
| AI audit | Top bar → Export popover |
| Caption writer | Top bar → Export popover |
| Brand guardrails tooltip | Top bar → Export popover |
| Recent exports history (+ clear) | Top bar → Export popover |
| Elements rail / mobile strip (selection) | Canvas click (primary) + inspector "Elements" layer list (occlusion fallback) |
| AI-change undo (chat chips) | Top bar → **Undo** (uniform for UI + AI edits) + chat chips |

### 2.7 Amendments (2026-07-05, client-ratified)

- **Undo, properly visible.** A small always-available undo affordance floating
  near the canvas (top-bar Undo alone is too far from the eye). Keyboard:
  Cmd+Z / Cmd+Shift+Z (redo). Both documented in the Guide.
- **Shapes are first-class.** The petal shapes are a signature brand element and
  must NOT live under generic "Decoration": standalone **Shapes** section beside
  Logo in the + Add gallery, petal variants as visual tiles.
- **Sessions: one session = one post.** "New post" starts a session; sessions
  auto-save continuously with their conversation attached (doubling as drafts
  AND as the self-improvement capture layer — see docs/self-improvement-loop.md).
  A "Posts" list (top bar) shows recent sessions as thumbnails; latest ~10
  visible, older auto-archived (searchable, never deleted). NO blocking
  clean-up prompts — storage is KBs/session; caps solve tidiness, not storage.
- **Save-as-template is a moment, not a button.** Keep the Templates-popover
  path; add a one-line post-export nudge ("Want to reuse this design? Save it
  as a template.") — the moment of proven success. No persistent button.

### 2.8 THEME 1 — "Decide more for me" (2026-07-07, client-ratified)

Client ruling (verbatim intent): *"Further simplify — still too much liberty in
the panel. The + Add item is redundant."* Staff should see, per element, ONLY
its content + 2–3 CURATED choices (the ones the brand allows anyway); everything
else moves behind ONE quiet "More options" fold (closed by default, airy §7
styling, open-state remembered per session in-memory only). Adding happens where
staff already look — ghost slots + chat chips — so the top-bar **+ Add** is
retired. Less liberty = the brand system doing its job. NOTHING is deleted: the
fold and the ghost/chip paths preserve every prior capability.

**Curated primary controls (visible by default) per element:**

| Element | Content shown | Curated choices (visible) | Under "More options" fold |
|---|---|---|---|
| Text | The copy field(s) for the post type + render-truth "not shown in this layout" note | Size (S/M/L, drives the primary role) · Text colour (curated pair grid) | Editorial auto-fit + reset · Font size by category (XS–XL, all roles) · Scale / Width / Leading sliders · Align (L/C/R) · 9-grid position · Text backdrop (Auto/Band/None) |
| Background | The selected-swatch label + render-truth note | Brand swatches ONLY | Opacity slider (+ PNG-alpha note) · Shapes (petal marks) · Decoration (accessory shapes) |
| Photo | Help line ("select the preview to resize…") | Library · Upload | Image/Video toggle · Sample photos strip · Midjourney launcher · Quick position (Center/50/75/Fill/0°) |
| Logo | Overlap hint (when relevant) | Variant grid (primary/secondary tabs) · Remove / Add-back logo | 9-grid placement · Size steps (position is drag-first on the preview) |
| Overlay (shape) | Drag hint | Mode (Frame/Outline/Line Art/On top) + its colour/weight sub-controls; or Accessory colour + quick size | Size / Rotate / Opacity sliders · layout reset header |

The fold is a single `<MoreFold id=…>` per panel; `foldOpen` is an in-memory
React state map (no localStorage), so a fold the user opened stays open across
element hops within the session and resets calm on reload.

**Retired top-bar "+ Add" — capability mapping (nothing becomes unreachable):**

| Old + Add capability | New home |
|---|---|
| Add caption / "small text under the title" | Canvas ghost slot "＋ add text here" + chat chip "+ Add caption" |
| Add date | Canvas ghost slot "＋ add a date" + chat chip "+ Add date" |
| Add "little label up top" (eyebrow) | Canvas ghost slot "＋ add a little label" + chat ("add a small label at the top…") |
| Add Button (pill) | Editable pill field in the Text inspector when the archetype carries a badge; chat ("add a button that says…") |
| Add Logo | Canvas ghost slot "＋ add logo" (also clears a hidden-logo pin) + Logo inspector "Add logo back" |
| Add Photo | Canvas ghost slot "＋ add a photo" (opens Library) + Photo inspector Library/Upload |
| Shapes (petal marks) | Background / Overlay inspector "More options" fold → Shapes; chat ("add a petal / add a shape" → assistant `addOverlay` grammar, DECOR_INTENT-gated) |
| Decoration (accessory shapes) | Background / Overlay inspector "More options" fold → Decoration; chat (`addOverlay`) |

## 3. The "add what doesn't exist" problem (vocabulary-free)

A selection-only inspector can't add absent elements, and staff don't know the
word "caption". Three layers, none requiring vocabulary:

1. **Visual `+ Add` menu.** One persistent `+` in the top bar. Opens a gallery
   of THUMBNAILS (a tile with small text under the headline; a date line; a
   pill button; a logo) with plain-language labels: "Small text under the
   title", "Date", "Button", "Logo". Recognition over recall.
2. **Ghost slots.** Layout engine already knows where a missing role would go;
   empty region shows dashed "＋ add text here" on hover/tap. (Users already
   instinctively click the canvas — make empty space clickable too.)
3. **Forgiving chat + passive teaching.** "add small text at the bottom that
   says pickup is at 3pm" must Just Work (model maps vague language → role).
   The AI's confirmation teaches the term back: "Added that as a caption — the
   small text under your headline. Tap it anytime to edit."

## 4. Parity by architecture, not discipline

The AI already edits designs through the patch schema (lib/design-patch.js).
RULE: the inspector and all canvas interactions emit THE SAME PATCHES the AI
emits. One patch pipeline → by construction, anything the AI can do the UI can
do and vice versa. The "caption uneditable from panel" class of bug becomes
structurally impossible. This is the load-bearing engineering decision of WP-V;
do not implement inspector controls as direct state mutations.

## 5. Sequencing

- **Phase 1 (in WP-U, current layout):** universal click-to-edit on canvas;
  chat repositioned so it never overlaps the canvas.
- **SHIP GATE:** WP-T + WP-U verified on localhost → staging → client verify.
- **Phase 2 (WP-V):** delete bubbles rail; panel → contextual inspector;
  globals → top bar; all UI edits routed through the patch pipeline.
- **Phase 3 (WP-V or WP-W):** chat promoted to primary left rail with dynamic
  quick-action chips; `+ Add` gallery; ghost slots; landing+editor unified
  into one conversation.

## 6. Non-goals

- No fallback tool drawer.
- No re-introduction of any always-visible per-element controls.
- Mobile parity is required but mobile-specific redesign beyond "chat under
  canvas" is out of scope for WP-V.
