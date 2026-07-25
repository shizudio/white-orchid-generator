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
| Overlay (shape) | Drag hint | Mode (Frame/Fill/Outline/Line Art) + its colour/weight/opacity sub-controls; or Accessory colour + quick size | Size / Rotate / Opacity sliders · layout reset header |

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

### 2.9 Free shapes (2026-07-10, client-ratified)

Client ruling (verbatim intent): *"I can add any type of shape once on the preview,
move them freely around, rotate them freely; more than 1 shape can exist together at
any point in time; I can delete a shape anytime. While I have a shape I should be able
to change the background colour … or change the colour of the shape. Shapes can be used
as: frame (photo mask), overlay on top (adjustable opacity), or outline (adjustable
thickness). I can upload more shapes in the brand page."*

The shape system is a **user-driven manual tool** (autonomous generations are untouched —
born-clean). It lives in the **Shapes inspector** (the `Shape`→`Shapes` chip), which is
its home and is shown whenever a design exists:

- **Many instances.** A UI add drops a NEW overlay layer every tap (nudged off the last
  so it doesn't hide), so the same shape can coexist any number of times. Each instance
  is its own `uid` with the on-image transform editor (drag / rotate / resize / snap) and
  its own delete (canvas + inspector row). z-order = add order (latest on top). The AI
  grammar keeps one-instance-per-asset so an auto pass never stacks duplicate decor.
- **Three modes + colour, per instance.** `frame` (photo clipped into the silhouette),
  `fill` (solid brand-tinted silhouette on top — brand-palette colour incl. "as-is" +
  opacity 0–1), `outline` (stroke ring — brand colour + thickness). `lineart` is kept as
  a fourth, upload-oriented mode. Recolour uses brand tokens only (read from the kit; zero
  inline brand facts). Fill/outline tint the SVG through the offscreen `source-in` pipeline.
- **Background stays independent.** The Background chip keeps editing the field colour
  while shapes exist — shape colour and field colour are separate controls.
- **The Shapes panel** stacks: the archetype's own **Layout shape** variant picker (part
  of the layout, above) → the **list of every free shape layer** (thumb + mode badge +
  per-instance delete, tap to edit inline) → **＋ Add shape** opening the shape tray
  (built-in petals/shapes + uploaded officials).
- **Uploads.** New shape art enters ONLY via the Brand kit page's *Shapes & decorative
  assets* uploader (official brand assets, `/api/brand-assets`); uploaded shapes appear in
  the tray + add-list for everyone. Cloud-unconfigured degrades to the built-ins.

Every shape action rides the one patch pipeline (`applyPatch` → `overlayUpdate` /
`addOverlay` / `removeOverlay`), so undo/redo and honesty hold by construction. No new
patch enums: modes reuse `overlayMode`; the fill colour rides `overlayUpdate.style`
(a client-only key). Autonomous text collision-free vs every shape layer still holds
(decor shapes remain reflow obstacles/compose-partners).

#### 2.9.1 Layout shapes are user-editable (2026-07-15, client ruling — OVERRULES the read-only layout shape)

The client (design director) overruled the earlier design where the archetype's own
**layout shape** (the `photoFrame` mask/cutout — `shapeMask` / `petalMask`, and the
`card` frame) was read-only: selecting its "Layout shape" row in the Shapes inspector
opened only the variant picker and gave no transform controls, and the shape could not
be moved/resized/rotated on the preview.

Ruling: **a layout shape gets the same editing affordances as a free shape.** Size and
rotation are editable on canvas (the transform gizmo) and via the inspector panel
controls, exactly like an overlay layer.

- **Selection.** Selecting the layout-shape row — or clicking the shape on the canvas —
  opens the shape-editing UI (size / rotation), not just the variant jump.
- **Pinned overrides (law 5, re-solve-around-pins).** The archetype may PROPOSE the
  layout shape's geometry, but once the owner touches it their transform is pinned as an
  override on the design document (the `photoFrame` box/rotation override, cascaded
  per-format like the media crop pins). It survives re-solves and layout operations where
  the shape persists; a layout SWAP that replaces the shape clears it (like the role-offset
  clear on swap). Autonomous generations never emit an override — born-clean holds.
- **Matched field colour stays intact.** The variant's paired field colour still applies;
  editing geometry does not disturb the shape↔field colour pairing.
- **Helper copy.** The "No free shapes yet — the shape above is part of the layout"
  language is retired in favour of copy that says the layout shape itself is editable.

Implementation note (mirror surface — trap M6): the `photoFrame` transform override is a
new document field and rides the patch pipeline, so it must land in `DesignDocumentV1`,
the `lib/design-patch.js` enums, and `buildGenes` together (run `auto_mirror-touchlist`),
and the mask render must read the override. This is the largest surface of the three
2026-07-15 client fixes and is tracked as a follow-up build; the ruling above is the law
it must satisfy.

> **SUPERSEDED (2026-07-15, later same-day ruling) — see §2.9.2.** The "make the
> `photoFrame` layout shape editable-in-place" approach above is withdrawn. The client
> ruled the layout shape should not be a special editable object at all; it must become a
> genuine ordinary shape layer. The transform-override document field described here is NOT
> to be built.

#### 2.9.2 The layout shape is eliminated — it becomes a genuine shape layer (2026-07-15 client ruling, SUPERSEDES §2.9.1)

Client ruling (verbatim intent): *"layout shape is conflicting with add another shape, they
override each other. Ideally layout shape is just another added shape … eliminate this
layout [shape] completely, and replace it with a genuine normal shape layer instead."*

Today a "layout shape" is the archetype's `photoFrame` mask/cutout (`shapeMask` / `petalMask`
/ `card`), a first-class design field rendered by its own editorial branch and surfaced
read-only in the Shapes inspector. Free shapes already support a `frame` mode that clips the
photo. **Target: archetypes that use a shape emit it as a genuine `frame`-kind (or `fill`-kind
for a colour field) shape *layer* in the design document — no separate `photoFrame` render
path for new designs.** The emitted layer is selectable, fully transformable, panel-editable,
deletable, and z-ordered like any other shape. Pins law (law 5): a user-edited generated
shape is pinned and survives re-solves; a layout swap replaces *unedited* generated shapes but
a pinned one wins and the layout adapts. The variant's "matched field colour" pairing must
survive for the generated shape. Migration: a load-time adapter in `lib/design-persistence.mjs`
converts a legacy `photoFrame` into the equivalent shape layer exactly once (idempotent), so
old sessions render identically (round-trip fidelity invariant). Mirror surfaces (M6): any
shape-kind/enum change lands together in `components/Generator.jsx` constants,
`lib/design-patch.js` enums, and `buildGenes`. Born-clean holds (`__woBornCleanGuard` /
`__woArchStress` 0 new offenders; §6a `_bandOverShape` stays 0 on fresh shape designs), and the
6-format cascade must produce per-format geometry for the generated shape exactly as
`photoFrame` did.

**Root cause of the "override each other" conflict (verified in code, 2026-07-15).** The
entire editorial render branch — which draws the layout shape (`photoFrame`
`shapeMask`/`petalMask`/`card`), text roles, motifs, and the matched field colour — is gated
at `components/Generator.jsx:3901` on `if (mat.editorial && !hasFrame)`, where
`hasFrame = frameLayers.length > 0` is true whenever a free shape is in `frame` mode
(`overlayLayers.some(l => (l.mode||'frame')==='frame')`, Generator.jsx:3478 / :6257). Adding a
free frame shape flips `hasFrame` true, which **skips the whole editorial branch** and routes
rendering to a separate legacy frame pre-pass (Generator.jsx:3883-3887, `drawFrameLayer`) that
paints only the free shape's clipped photo on a plain field — the layout shape, materialized
text positions, motifs and paired field colour all disappear. The two systems are structurally
mutually exclusive (both want to clip the single `mediaObj`), which is precisely what the
client sees. Unifying emission + render (one shape path, no `!hasFrame` gate) kills this by
construction.

**Build status: LANDED 2026-07-15** (slices 1–2 `53afbbe`, slice 3 `20d3f33`, slice 4 with
this doc update). What shipped:

- **Emission** — `buildMaterialized` emits the archetype's shapeMask/petalMask as an
  ordinary `frame`-mode layer (`origin:"layout"`, master + explicit per-format `byDim`
  baked from each format's own materialization). `photoFrame` is `{type:"none"}` on new
  designs.
- **One painter** — every frame-kind shape renders through one fitted-window painter in
  the editorial branch; a legacy `mat.photoFrame` synthesizes as the oldest job, so
  unconverted documents and override renders (guards/boards) paint byte-identically. The
  `!hasFrame` mutual exclusion is deleted — the conflict is dead by construction.
  **Photo-wins rule (orchestrator default, client may override): the NEWEST frame-kind
  shape takes the photo; older frame shapes render as colour-field silhouettes in their
  matched colour (never empty outlines).**
- **Pins law** — any edit to a generated shape pins it (`userTouched`); a layout swap
  replaces only unedited layout-origin layers, keeps user layers, and does not emit the
  new layout's shape over a pinned one.
- **Migration** — `migrateLegacyLayoutShape` (lib/design-persistence.mjs, composed in
  `readPersistedDesignPayload`) + the exact-geometry converter `convertLegacyLayoutShape`
  (Generator.jsx, injected at the one install point `applyDesignTemplate`): legacy
  sessions convert exactly once, idempotently (stable layer uid across reloads), master
  from the stored box, other formats per the R2 cascade rule.
- **Grammar retirement** — `photoFrameType` no longer accepts `petalMask` (a shape cutout
  is `addOverlay { assetId, mode:"frame" }`); the read-only "LAYOUT SHAPE" panel row and
  its helper copy are retired. The archetype **variant picker stays** — it is the
  shape ↔ field-colour pairing rotation surface, and the pairing survives emission.

**Deliberately retained:** the `media.frame` document field itself — `card` still uses it
(a card was never a "layout shape"), and it is the fidelity net for any unconverted legacy
payload (which renders identically via the synthesized job and converts on its next load
through the editor). Full field removal is possible only after the client's cloud sessions
have all been re-saved post-migration.

### 2.10 Selection and library convergence (2026-07-14)

- **One Shapes pill.** Individual shape instances are children of the Shapes inspector,
  never top-level element pills. Clicking a shape on the canvas selects that instance
  inside Shapes; the inspector list remains the fallback for occluded instances.
- **One Templates gallery.** Built-in, personal and team templates use the same card
  grid and interactions. Source is a small metadata label, not a separate section.
- **A template apply is a RE-SKIN (ruling upgraded 2026-07-25, supersedes `384b9bf`).**
  `384b9bf` preserved only OWNER-authored copy across a template swap and let the template
  replace AI-authored copy — the client still saw content switch. Upgraded ruling: ALL of
  the canvas's current content carries over (owner AND AI-authored headline, subtext,
  attribution, date, added elements); the template supplies ONLY the design system (layout,
  palette proposals, typography treatments, shapes/decor). It contributes zero copy. Content
  that can't fit the new layout goes through complete-or-absent + readiness, never silently
  swapped for the template's demo copy. Implemented in `mergeCurrentContent`
  (`lib/design-composite-workflows.mjs`, renamed from `mergeOwnerAuthoredContent`).
- **Role-specific text selection.** The canvas selection frame names and outlines the
  actual selected role (title, caption, date, label or button). Keyboard movement and
  direct manipulation target that same role.
- **Pointer-specific capture.** A selected element may capture a drag only when the
  pointer starts inside its own hit geometry. Selection state must never swallow the
  next click elsewhere on the canvas.

### 2.11 Mobile inspector — the half-sheet (2026-07-15, client-ratified)

The mobile inspector is NO LONGER a deferred non-goal (supersedes the §6 line
that scoped mobile work to "chat under canvas", and supersedes §2.3's
"right side, or floating near selection" shape note — that note is
desktop-scoped). Ruling: the client approved Option A of the 2026-07-15 mobile
audit ("approve the half-sheet"). The contract:

- **Content-height half-sheet with detents.** The inspector is a bottom sheet
  that hugs its content, capped at a **half detent (~45vh)** by default so the
  canvas band above it stays visible. A **drag handle** promotes it to a
  **tall detent (~78vh)** for the long Text inspector; dragging down from tall
  returns to half, and down from half **dismisses** (the expected iOS sheet
  gesture). The 44px ✕ close is retained. Safe-area bottom padding and
  overscroll containment apply.
- **Auto-scroll-to-selection.** On open, selection change, or detent change,
  the page scrolls so the SELECTED element's canvas region sits in the visible
  band above the sheet (the renderer's scene bounds drive the math). A recent
  explicit user scroll suppresses the auto-scroll — the system never fights a
  choice the user just made.
- **The canvas band is LIVE.** No dimming backdrop over the band; tapping a
  different element there re-selects it and the sheet content switches in
  place (no dismiss-then-reopen). Tapping the bare canvas keeps the canvas's
  own semantics (selects the background — background is an element). Tapping
  outside the canvas and sheet dismisses.
- **Floating undo.** While the sheet is open, a 44px undo/redo pair floats in
  the canvas band just above the sheet (safe-area aware, auto-flipped away
  from the selected element) — restoring §2.7's "always-available undo" on
  mobile. Same stacks as the strip buttons; one drag = one undo unchanged.

Desktop is untouched by all of this: ≥761px the inspector remains the in-flow
sticky column of §2.3 and the sheet/handle/floating-undo chrome does not
render. Open (deferred, needs its own ruling): keeping the canvas in view
during CHAT-driven edits (audit #9) — the one-long-scroll flow.

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
- ~~Mobile parity is required but mobile-specific redesign beyond "chat under
  canvas" is out of scope for WP-V.~~ **Superseded 2026-07-15:** the mobile
  inspector is now governed by the ratified half-sheet contract (§2.11). Still
  open: the chat-flow question (§2.11 last paragraph).
