# Element-placement spec — from slots to anchors + constraints

**Status: RATIFIED 2026-07-13** ("The element-placement spec looks good, let's execute"). Written from the client's direction: *"I am sure all layouts can show these elements — it's just a matter of size and composition. How do I allow maximum freedom to put items in, with consistent restraints of where elements can land cleanly?"* Owner (once ratified) of: the universal element contract, the placement solver, and the density governor. Companion rulings already ratified elsewhere: copy-fit (docs/copy-fit-spec.md), register escalation ("the system should give me the most accessible font in the brand").

## The change in one sentence

An archetype stops being a closed list of slots and becomes an **art-directed starting composition plus placement priors**; every secondary element gains a universal contract — *it may be added to any design, and the engine finds where it lands cleanly* — governed by one shared constraint system instead of per-archetype whitelists.

## Why (the defect class this kills)

Today an element not declared by the archetype cannot exist: "Not shown in this layout: the date." This single architectural fact is behind the dead-role drops, the dishonest "Added a date line" claims, and the distinction between layouts that "support" dates and ones that don't — a distinction the client correctly rejects. The logo already works the proposed way (it is an element with a solver, placeable on any design); this spec generalizes that pattern.

## 1 · The universal element contract

Element classes covered: **date line, eyebrow, caption/support, badge, pill, small text, decor shapes** (logo already conforms; the hero and photo remain archetype-owned — they ARE the composition). Each class declares once, globally:
- its **size range** (min = the legibility floor for its role; preferred; max)
- its **surface needs** (requires quiet zone? may sit on photo? needs a band fallback?)
- its **relational preferences** ("below hero", "above caption", "corner", "edge-aligned")
- its **register** (brand face + sanctioned weights; the register-escalation ladder applies)

Archetypes keep their authored `elements{}` — now interpreted as **priors** (the art-directed preferred placement for that element on that composition), not permissions. An archetype with no date prior still accepts a date; the solver just starts from generic anchors.

## 2 · The placement solver (generalized from the logo's)

When an element is added (by the owner or by the AI):
1. **Candidate anchors**, in priority order: the archetype's prior for this class → relational anchors derived from existing elements ("under hero", "above support", "opposite the logo") → the generic 9-grid + edge anchors.
2. **Hard restraints filter** (all existing machinery, unified):
   - platform safe zones + canvas margins
   - no collision with any placed element (the reflow obstacle set — text, logo, shapes, pill)
   - focal/face avoidance for photo-overlapping candidates
   - contrast ≥ floor against the ACTUAL final surface, with the sanctioned remedies in ladder order: ink-pole flip → heavier sanctioned weight → the brand's most robust face → size up (within range) → band (last resort). **Optical weight is part of the legibility test** — thin registers are never permitted raw over photo texture even at passing colour contrast (client ruling 2026-07-13).
   - size floor: the element shrinks only to its class floor, never below
3. **Soft scores rank survivors**: alignment with the archetype's grid (gridAnchor, existing column edges) · breathing room (distance to nearest element vs the whitespace floor) · relational proximity (a date prefers its headline) · archetype-prior bonus.
4. **Best clean candidate wins.** The element is placed at solver size — possibly small (a date on a dense layout lands as a quiet corner line, not a hero).
5. **No candidate passes** (rare — a full banner): the assistant answers honestly with EXECUTABLE remedies only — the one-tap layout-switch offer (`pendingOffer` mechanism), or "remove X to make room" — never a bare claim, never a format switch (formats are preconditions; ratified in copy-fit).

## 3 · Freedom after placement (the owner's half)

Every placed element is draggable/resizable via the existing transform editor, with **live snap guides to the same anchor grid** — freedom inside visible rails. An owner placement is a pin (law 5): never auto-moved; hard-restraint violations surface as advisor dots with executable fixes, never silent corrections. Explicit size steps ALWAYS change the drawn size within the class floor (the size-precedence invariant — closes the S/M/L no-op class).

## 4 · The density governor

Maximum freedom needs one counterweight: a per-format **density budget** (max element count + minimum whitespace fraction, defaults from the archetype's `whitespace` value). Exceeding it never blocks — it raises one advisor dot naming the crowding pair ("the eyebrow is fighting the date") with executable relief (remove/merge/move offers). Autonomous generation must stay INSIDE the budget (born-clean); only the owner may exceed it.

## 5 · Honesty integration

A placement is claimed only after render truth confirms the element painted (the claim-vs-render invariant — belts included). "Not shown in this layout" ceases to exist as a message; its replacements are "placed — here" or the honest constraint explanation with one-tap remedies.

## 6 · What this deliberately does NOT change

- The hero + photo remain archetype-authored (the composition's identity).
- Brand registers stay closed (no user thickness control; the ladder escalates within brand).
- Born-clean, pins, one-voice, only-real-assets: all laws hold; the solver is layout-time machinery.
- The first-shot blocker gate still verifies every autonomous result end-to-end.

## 6a · The shape–band exclusion (RATIFIED 2026-07-13)

*"When we are using a shape, we don't use the text band by default — they are conflicting visually."* On any design with an active shape (an archetype mask/cutout, or free shapes intersecting a text zone), the **band rung of the legibility ladder is disabled by default**. The solver must resolve legibility through its other free variables — placement clear of the shape (the shape is a first-class obstacle for every text role, including the hero), ink flip, weight, robust face, size. A band may appear on a shape design only by the owner's explicit ask. A band must never clip, overlap, or slice a shape's silhouette.

Client reaffirmed 2026-07-23: the band remains a per-format free variable (band only where contrast demands); set-wide consistency was considered and declined.

## 7 · Knobs

| Knob | Default | Effect |
|---|---|---|
| Anchor priority order | prior → relational → grid | Where the solver looks first |
| Side/strip clearance | inherits reflow (18% w / 2% seam) | When a sideways dodge beats a vertical one |
| Legibility ladder order | ink → weight → face → size → band | The escalation sequence (ratified) |
| Density budget | per-format; whitespace floor from archetype | When the crowding dot raises |
| Class size floors | per element class from MIN_FONT_PX table | The shrink limit |
| Snap grid | the anchor set | What manual dragging snaps to |

## 7a · Legacy caption drag — the whole-class registration fix (2026-07-24)

Client: *"i have instances where i cannot move the caption."* ROOT CAUSE: the stacked
**legacy** postType painters (photo_logo / texture_text caption, quote credit, event
details, text_post subtext — rendered when `mat.editorial` is false, i.e. archetypeId
null / an old session) **draw** the caption but never published its box to
`renderTruth.roleBounds`. Absent from `sceneElements`, the pointer hit-test
(`resolveScenePointerTarget → hitTestScene`) found nothing at the caption's pixels and
fell through to photo/background — the caption was **visible but un-draggable**, breaking
the DLC invariant that *every text role is draggable wherever it is painted, with pins*.
(The editorial single-path already registers `support` whenever it is painted; only the
legacy fallback paths were affected.)

FIX (Generator.jsx, legacy render section): each painted legacy caption now (a) honours a
stored roleFree `support` offset via the SAME `roleOff("support")` the editorial path
uses, and (b) publishes its drawn box as the `support` role in `renderTruth.roleBounds`
(re-adding `hero`/`date` so the textBounds→hero fallback is not orphaned). Because text
roles carry equal z, `hitTestScene`'s smaller-area-first tie-break resolves a pointer
inside the caption to `support`, not the whole-block `hero`. One drag = one undo; a frozen
owner pin survives re-solve (law 5). The offset is `{0,0}` until the user drags, so default
renders are pixel-identical (render fingerprint self-baseline unchanged, legacy cells
0/144 diff). Pure invariant covered in `scripts/tests/render-result.test.mjs`.

## 7b · Shape-add defaults the base to a pure photo background (RATIFIED 2026-07-23)

Client ruling: *"when i am playing with other shape appearances, i want to default format
to always be pure photo background, the editorial style is not good."* Adding a shape
(fill / decorative / frame — any add via the tray or the AI) to a design on an
EDITORIAL/SPLIT layout auto-switches the base to a full-bleed photo layout as **ONE honest
undoable step**, narrated in the chat voice (*"Switched to full photo so your shape has
room."*).

- **Set that switches** — the editorial/split family: a non-fullBleed archetype whose photo
  is BOUNDED (a photo column, w<1 or h<1) or that floats a photo card — `editorial_split`,
  `portrait_credential`, `floated_card` (derived from geometry in `isEditorialSplitArchetype`,
  so a new panel/split archetype is covered automatically). Full-bleed
  (`documentary`/`full_bleed_duotone`/`message_pill`), photo-led-through-a-mask
  (`petal_window`/`shape_cutout`), and text-only fields never switch.
- **Target** — picked the copy-aware way the band-removal belt picks its band-free target
  (`pickFullBleedTargetForShapeAdd`): a caption keeps it legible on `message_pill`'s
  born-clean contrast pill; a headline-only design goes to `documentary`'s edge-to-edge
  warm photo + whisper. Copy is preserved by materializeArchetype; born-clean re-solves
  contrast over the photo.
- **PINS LAW (M3 / law 5)** — the switch is a SYSTEM free-variable move: it NEVER overrides
  a layout the user DELIBERATELY chose (an explicit UI layout pick, or switching back to
  editorial after an auto-switch). A pinned layout is OFFERED the switch in the chat voice
  instead of overridden. A fresh generation (systemFreeVariables) clears the pin. The
  auto-switch itself neither pins nor clears (`layoutUserPinnedRef`).
- **Frame composition** — a frame-shape add composes: the new full-bleed archetype hosts
  the photo per the media-host rule AND the base switches, in the same one-step patch.
- Wired in `applyDesignPatch` (interaction-time only; the fingerprint fixtures add no
  shapes, so default renders are pixel-identical). Live-verified both viewports across the
  editorial/full-bleed/photo-led/text-only set + the pinned-offer case.

## 7c · Layout switch clears added shapes (RATIFIED 2026-07-27)

Client ruling: *"when there is a shape and user wants to switch layout, you should delete
the shape and change layout."* **This SUPERSEDES the former pins-survive-layout-swap
behavior for added shapes** (the `planArchetypeMaterializationWorkflow` retention rule
that carried user-added shape layers across a swap; DLC §3.4 carries the pointer note).

- **Scope** — any LIVE layout/archetype switch: the "Try another layout" chip, the chat
  belt, a named layout ask, an AI patch's `archetypeId`, and the `"none"` (free-layout)
  sentinel. Template apply already re-skins (DOCUMENT_REPLACE — the template's shapes ARE
  the design) and session restore opens the stored document verbatim; both keep the
  default `clearAddedShapes:false`.
- **What clears** — ALL added shape layers (fill / decorative / frame; no `origin:"layout"`,
  not motifs), removed as part of the SAME atomic step (`clearAddedShapes:true` in
  `planArchetypeMaterializationWorkflow`). Layout-owned structural shapes follow the
  existing replace rules: an untouched layout instance is replaced by the incoming frame,
  a user-touched layout instance stays pinned and suppresses it (§3.4).
- **Media re-home** — if a removed added frame hosted the photo, the SHAPES_REPLACE
  reducer re-resolves `composition.mediaHostShapeId` (§3.4 machinery): the new layout's
  own frame takes the photo, else the host clears to `null` and the photo returns to the
  layout's rectangular media zone. `media.source` is never touched.
- **One undo** — the switch and the shape removal ride one patch snapshot: a single undo
  restores the added shapes AND the prior layout together.
- **Honesty (law 6)** — the reply narrates the removal deterministically ("Switched to
  {layout} — removed your added shapes so it reads clean. Tap Undo to bring them back
  with the old layout."), backed by really-changed document paths.
- Interaction-time only — the fingerprint fixtures add no shapes, so default renders are
  pixel-identical (0/144).

## 8 · Build phases (estimate: the largest single build since the archetype system)

- **P1 — the solver core**: extract the logo's candidate/filter/score loop into a shared `placeElement()`; date + eyebrow + badge adopt it (the three "Not shown" offenders). Archetype priors read from existing `elements{}`.
- **P2 — full class coverage + density governor**: pill, small text, shapes-as-elements; the crowding dot; AI "add X" flows route through the solver.
- **P3 — manual rails**: snap guides on drag, live budget display, per-element size steps wired through the precedence invariant.
- Each phase ships born-clean-gated and resident-tester-covered before the next begins.
