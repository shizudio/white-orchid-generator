# Design Layer Contract — one system for composition rules

Status: **RATIFIED DIRECTION; phased implementation**  
Owner: product design + design engine  
Ratified: 2026-07-21  
Current implementation checkpoint: **DLC-5 / DLC-6 — readiness enforcement and renderer cleanup underway**

This is the canonical contract for what a design layer is, which layer owns each
responsibility, how layers negotiate space, and how violations are prevented, repaired,
surfaced and approved. It consolidates the cross-layer rules previously spread across the
format, copy-fit, element-placement, advice-ledger, UX and refactor specifications.

The specialized specifications remain evidence and implementation detail. When one of
them conflicts with this contract on cross-layer ownership or collision behavior, this
contract wins. `refactor-prd.md` remains authoritative for document/command/render/
persistence architecture.

## 1. Product law

> Layout coordinates the composition. Layers express meaning. Rules protect intent.
> AI proposes; the deterministic engine validates and commits.

A valid design is not merely drawable. It must be:

- technically inside its export and platform bounds;
- readable and accessible;
- compliant with the active brand-profile version;
- faithful to required campaign meaning;
- free of unresolved structural collisions;
- explicit about owner overrides and approvals;
- reproducible from its design document.

## 2. Canonical layer taxonomy

```text
Design
├── Format contract
│   ├── export bounds
│   ├── platform occlusion zones
│   └── editorial margins
├── Layout
│   ├── spatial zones and relationships
│   ├── structural image frames/masks
│   ├── structural content panels
│   └── structural overlays
├── Background surface
├── Media
│   ├── source and provenance
│   ├── crop/transform
│   └── protected subject/text-safe regions
├── Content
│   └── semantic copy roles
├── Typography
│   └── visual treatment of content roles
├── Brand marks
│   ├── primary/secondary marks
│   └── partner/legal marks
├── Decoration
│   ├── decorative shapes
│   ├── icons
│   └── dividers/line art
└── System furniture
    └── indexes, page numbers and generated utility marks
```

Layout is not another painted object. It owns zones, relationships and structural layer
instances. Background, media, content, typography, marks and decoration are paintable
layers that must satisfy the layout contract.

## 3. Shape model — asset, role and rendering are separate

A shape asset has no inherent design-layer ownership. Each placed instance declares:

```js
{
  uid: "shape-instance-id",
  assetId: "approved-asset-id",
  role: "image-frame",
  renderMode: "frame",
  owner: "layout",
  structural: true,
  mediaHost: true,
  master: {},
  byDim: {},
  userTouched: false
}
```

### 3.1 Shape roles

| Role | Structural | Purpose | Default owner |
|---|---:|---|---|
| `image-frame` | yes | Defines the visible image silhouette/window | layout |
| `image-mask` | yes | Masks media with a non-rectangular path | layout |
| `content-panel` | yes | Reserves a stable surface for content | layout |
| `structural-overlay` | yes | Divides or binds major composition regions | layout |
| `decorative-overlay` | no | Optional visual character | user/system |
| `icon` | no | Small semantic or decorative symbol | content/user |
| `divider` | no | Separates related content groups | layout/content |

### 3.2 Rendering modes

Rendering mode describes paint, not meaning: `frame`, `fill` (legacy value `overlay`),
`outline`, and `line-art` (legacy value `lineart`). Changing mode does not silently change
the instance's semantic role. An invalid role/mode combination is rejected or requires an
explicit role transition.

### 3.3 Media-host rule

The media-bearing frame is referenced explicitly by `composition.mediaHostShapeId`.
Creation order is never product intent. During migration only, if that reference is absent,
the last existing legacy frame is selected to preserve the old “newest frame wins” visual.
The migration persists the explicit relationship; new behavior never depends on array order.

Only one shape may host the primary media in the current single-media document. Other
frame-looking shapes render according to their declared role/mode; they never silently turn
into field silhouettes merely because a newer frame was added.

### 3.4 Removal and layout changes

- Removing decoration has no structural consequence.
- Removing a structural shape triggers a layout re-solve and previews the dependent result.
- Removing the media-host frame requires one explicit consequence: select another compatible
  host, move media to the layout's rectangular media zone, remove media, or cancel.
- Layout swaps replace untouched layout-owned structural instances.
- A user-touched structural instance is pinned; the new layout must adapt or present a
  conflict decision. It may not silently create a competing frame.

## 4. Layer ownership

Every mutable property has exactly one canonical owner.

| Concern | Owner |
|---|---|
| Export dimensions/platform zones | format contract |
| Spatial zones/relationships | layout |
| Copy meaning/requiredness/authorship | content |
| Font, scale, leading, alignment and ink | typography |
| Source, focal regions, crop and treatment | media |
| Logo asset, variant, placement and clear space | brand mark |
| Shape role, structural relationship and zone | layout or decoration |
| Painted background/tint surfaces | background |
| Issue lifecycle, acknowledgement and approval | advice ledger/policy |

The renderer may resolve values, but it never becomes their writable owner. The inspector,
AI, templates and persistence may not keep parallel writable copies.

## 5. Constraint vocabulary

Every rule declares:

```js
{
  id: "logo.no-text-overlap",
  layers: ["brand-mark", "content"],
  kind: "collision",
  severity: "blocking",
  enforcement: "prevent-or-repair",
  overridePermission: "brand-manager",
  remedies: ["move-logo", "switch-logo", "switch-layout"],
  source: "brand-profile-or-system"
}
```

### 5.1 Severity

- `blocking`: cannot be approved/exported without an authorized exception.
- `warning`: valid but materially risky; requires acknowledgement.
- `advisory`: optional art-direction improvement.

### 5.2 Enforcement

- `prevent`: reject the command and explain why.
- `auto-repair`: repair only system-owned free variables and record the command.
- `prevent-or-repair`: repair safely; otherwise reject with executable alternatives.
- `warn`: preserve the result and raise a measured finding.
- `require-approval`: preserve but block final approval/export until authorized.

### 5.3 Sources

Rules come from `system`, `platform`, or a versioned `brand-profile`. Brand rules record
their source, scope and profile version. No customer-specific rule lives only in prompts or
renderer literals.

## 6. Global composition order

The solver resolves in this order:

1. Format bounds and platform occlusion zones.
2. Explicit approved locks and required legal elements.
3. Layout structural zones and structural shapes.
4. Required content roles and their relationships.
5. Required brand marks and clear space.
6. Media crop around protected subjects and required negative space.
7. Supporting content.
8. Decoration and system furniture.
9. Full deterministic validation.

If a later step invalidates an earlier one, the engine backtracks to another layout or
candidate. It does not merely stack one layer above the other.

## 7. Collision matrix

`A` = allowed, `R` = resolve before commit, `B` = blocking, `Y` = lower-priority layer
yields.

| From / against | Required content | Supporting content | Logo/legal mark | Protected subject | Structural shape | Decoration |
|---|---:|---:|---:|---:|---:|---:|
| Required content | R | R | B | R | R | Y |
| Supporting content | R | R | B | R | R | Y |
| Logo/legal mark | B | B | R | B | R | Y |
| Protected subject | R | R | B | — | R | Y |
| Structural shape | R | R | R | R | R | Y |
| Decoration | Y | Y | Y | Y | Y | A |

“Resolve” means use declared remedies: alternative anchor, crop, approved variant, size
within floor/ceiling, content panel, structural role change, layout switch, removal of an
optional element, or a user decision. Z-order is not a collision remedy.

## 8. Z-order bands

Array order may order peers inside a band; it never moves an item across semantic bands.

```text
0   background
10  media
20  structural media frames/masks
30  structural panels and underlays
40  content and typography
50  brand/legal marks
60  structural overlays
70  decoration/icons/dividers
80  editor chrome (never exported)
```

An explicit brand profile may move a structural overlay below content, but decoration may
never cover required content or marks merely because it was added later.

## 9. Format contract

Export bounds, platform occlusion and editorial margins are separate concepts.

- Nothing may leave export bounds.
- System output is born inside platform occlusion constraints.
- User-pinned violations remain visible but block readiness with executable remedies.
- Editorial margins are strong layout preferences, not falsely described as cropping.
- Master semantic edits cascade. Per-format geometric exceptions remain local and visible.
- Every format is solved and validated; a clean active format does not hide a broken sibling.

## 10. Layout contract

Each layout declares:

- supported media model and required structural roles;
- named content, media and mark zones;
- required/optional roles and capacity;
- relational anchors and reading order;
- whitespace/density budget;
- protected seams and surface boundaries;
- compatible formats and transformation strategies;
- fallback layouts for common capacity failures.

Archetypes become layout proposals/capabilities, not permission lists. Any secondary content
role may exist when the layout solver can place it cleanly. Required content that cannot fit
forces a layout change or explicit user decision; it is never silently lost.

## 11. Content contract

Every content role records semantic purpose, requiredness, priority, authorship and allowed
adaptations.

- Owner-authored copy is never silently rewritten.
- AI-authored copy is fitted before commit and the stored value equals the painted value.
- Required/legal content is never dropped.
- Optional content may be omitted only through the declared adaptation order and is named in
  readiness.
- Copy is complete or absent; no render-time truncation or hidden rewrite.
- Content meaning is independent of typography and position.
- On-canvas copy and publishing caption are separate, linked entities.

Default adaptation order: roomier layout/variant → available lines → approved type treatment
within floors → verified AI rewrite when authorized → omit optional role → ask user.

## 12. Typography contract

Each brand profile defines role tokens with approved font assets/weights, size range,
line-height range, line length, case, tracking, role gaps and contrast surfaces.

- Primary hierarchy remains visually dominant.
- Minimum sizes are role-, font- and format-aware.
- Role gaps are relational and cannot collapse below their minimum.
- Type never crosses export bounds or a protected surface seam.
- Thin registers do not sit raw over busy media even when color contrast technically passes.
- An explicit inaccessible treatment is preserved as a pin but requires repair or authorized
  exception before approval/export.

## 13. Media contract

- Source, provider/model, rights/consent and generation provenance are retained.
- Crop state has a master and visible per-format overrides.
- Protected subjects/products/faces and text-safe negative-space regions are first-class
  geometry with confidence and optional user corrections.
- User crop pins win; conflicting composition requires another layer/layout remedy.
- Automatic crops never cut a high-priority protected region when a feasible crop exists.
- Generated media is evaluated against the brand's imagery rules, not only its prompt.

## 14. Brand-mark contract

Logo requirement is a campaign/brand/channel policy, not an archetype side effect.

Each asset declares usage class, approved surfaces, minimum rendered size, intrinsic clear
space, variants, compatible formats and removal policy.

- Required marks may not be removed by an unauthorized actor.
- Marks never overlap content or protected subjects.
- The engine chooses an approved variant and placement; it never fabricates an unapproved
  backing.
- Partner/legal marks participate in a declared lockup or mark group.
- User pins remain, but unresolved blocking collisions prevent approval/export.

## 15. Background and surface contract

The composed surface is explicit:

```text
canvas field -> media -> media treatment -> structural panel
-> local legibility treatment -> content -> structural overlay -> decoration
```

- Background, media tint, structural panels and emergency text backdrops are distinct.
- Contrast is measured on the final surface beneath each role.
- A band is last-resort legibility treatment, not a generic layout feature.
- Shape/band exclusion is geometric: disable a band only when it would intersect or visually
  compete with a structural shape, not merely because any shape exists.
- Automatic color resolution records requested color, resolved color, measured result and
  whether the value is pinned.

## 16. Decoration contract

Decoration is optional and always yields to meaning, marks, protected subjects and
structural composition.

- Approved assets/colors only.
- Per-format density, occupied-area and accent-color budgets.
- Minimum clearance from content and marks.
- No decoration in protected subject regions.
- System decoration is dropped before content, logo, crop or typography is degraded.
- User-pinned decoration may remain visible, but a blocking overlap requires repair or an
  authorized exception.

## 17. Pins, overrides and permissions

A pin means “do not silently change this,” not “this design is automatically valid.”

- Automatic systems solve around pins.
- If no valid solution exists, the command/result is preserved as a draft and readiness
  explains the exact conflict with executable remedies.
- `blocking` rules require repair or an actor with the rule's override permission.
- Overrides record actor, reason, rule ID, affected geometry, format and profile version.
- Regeneration changes only its declared scope and never clears unrelated pins.

Until roles/auth ship, the current single-user product preserves pins and treats overrides
as acknowledged drafts; it must not mislabel unresolved blocking findings as fully approved.

## 18. Validation lifecycle

```text
intent/gesture
-> typed command proposal
-> schema + authorization
-> preflight constraint evaluation
-> safe repair of unpinned free variables
-> atomic command commit
-> render result
-> post-render measured validation
-> one advice ledger
-> readiness/approval/export decision
```

Every finding contains rule ID, affected layers/elements, format, measured geometry,
severity, source, proposed remedies and override policy. “Keep it this way” is not the sole
action for a blocking issue.

Readiness has distinct states:

- technically valid;
- accessible;
- brand compliant;
- channel compliant;
- approved.

## 19. Command contract

Commands express semantic intent rather than renderer mechanics.

Examples:

```js
{ type: "shape/set-media-host", uid }
{ type: "content/set-requiredness", role: "cta", required: true }
{ type: "layout/switch", layoutId, preservePins: true }
{ type: "finding/apply-remedy", findingId, remedyId }
```

UI, AI and automated fixes use the same command families. One user action plus its safe
harmonizer amendments is one undo transaction.

## 20. Migration and compatibility

The migration is a strangler, not a visual rewrite.

- Existing shape `mode` remains readable while `renderMode` is introduced.
- Legacy `overlay` maps to `fill`; legacy `lineart` maps to `line-art` at the contract
  boundary while old renderer adapters remain temporarily.
- Layout-origin frame layers infer `role:image-frame`, `owner:layout`, `structural:true`.
- User/motif overlays infer `role:decorative-overlay` unless explicitly reclassified.
- `composition.mediaHostShapeId` is seeded from the last legacy frame to preserve current
  output, then becomes explicit truth.
- Compatibility aliases have named deletion checkpoints and tests.

## 21. Implementation checkpoints

- [x] **DLC-0 — Contract:** canonical taxonomy, ownership, collision matrix, loophole
  rulings and migration strategy.
- [x] **DLC-1 — Executable foundation:** machine-readable layer/rule registry; additive
  shape role/ownership normalization; explicit media-host migration; pure tests.
- [ ] **DLC-2 — Constraint engine:** shared preflight/post-render constraint result;
  enforcement/severity/remedy schema; advice ledger consumes rule IDs.
  - Started: existing local/AI findings now receive a stable contract `ruleId` plus
    policy severity, enforcement and remedy metadata during canonical normalization.
  - Shared preflight is now executable: layout relationships produce rule-backed
    violations, evaluated/deferred relationship lists and a clear/warning/blocked status.
    The result travels separately on the render model/result while legacy post-render
    checks migrate, preventing duplicate user-facing advice.
- [ ] **DLC-3 — Structural layout:** layout capability/zone schema; structural shapes use
  explicit media host; retire newest-frame and array-order semantics.
  - Started: the Shapes inspector groups structural and decorative roles, identifies the
    active photo frame, and changes photo ownership through one atomic typed command.
  - Complete: editorial and non-editorial runtime painters now use the explicit host;
    inactive frame shapes paint as colour silhouettes; text snapping follows the host;
    structural deletion surfaces its consequence before applying.
  - The newest-frame rule remains only in the one-time legacy migration adapter, where it
    preserves old saved output. Runtime rendering is order-independent.
  - Complete foundation: `lib/layout-contract.mjs` derives normalized, format-specific
    content, media, structural and mark zones plus containment, reading-order and clearance
    relationships. The render model exposes this immutable intent without persisting a
    second writable geometry copy.
  - Platform occlusion bands are now protected format-owned zones with explicit content/
    mark avoidance relationships.
  - Protected media subjects are now first-class media-owned zones. Actual focal geometry
    is projected through the rendered crop; content and marks receive distinct canonical
    collision rules, and logo remedies reuse the measured evidence.
  - Structural shapes now declare surface boundaries. Post-render seam-straddling evidence
    comes from the shared constraint result instead of a renderer-local counter.
  - Measured subject and structural-boundary conflicts now produce versioned
    `finding/apply-remedy` commands. Commands carry their rule, target, evidence and
    execution patch; they require explicit approval and run through the existing undo
    pipeline. They are never exposed to the silent harmonizer as automatic fixes.
  - Non-structural shapes are now decoration zones that yield to content, marks and
    protected subjects. Post-render validation samples the placed asset's actual alpha,
    avoiding bounding-box false positives for hollow outlines and line art. Conflicts
    offer explicit move, remove and direct-edit actions anchored to the exact shape.
  - Complete: protected-subject conflicts now offer crop reframing as an explicit,
    undoable alternative to moving content or marks. Crop commands retain the active
    format/window evidence and never run without approval.
  - Structural evidence assembly, focal projection and decoration relationship tests now
    live outside the renderer. Photo-seam and decoration compose-or-avoid decisions have
    also moved into `editorial-obstacle-solver.mjs`: the renderer supplies measured boxes
    but no longer owns those collision rules. Headline fit, width-fill intent, orphan
    repair and complete-or-absent shrinking now live in
    `editorial-typography-solver.mjs`, with Canvas used only as a measurement adapter.
    The same solver now owns headline-to-support rhythm, readable body floors, eyebrow
    yielding and safe-bottom clamping. `editorial-layout-solver.mjs` composes these rules
    behind one paint-ready result; `Generator.jsx` now supplies Canvas measurement
    adapters instead of owning the legacy reflow candidate generator. Remaining: move
    painter-specific placement branches behind the layout solver boundary.
  - Archetype format cascading, variant selection and materialization are now pure policy
    in `archetype-layout-policy.mjs`. The renderer consumes materialized intent and no
    longer translates special archetype names into structural frame policy itself.
  - Format/platform safe-margin merging, normalized role clamping and intentional photo
    bleed now live in `format-placement-policy.mjs`. Missing-role synthesis and focal-aware
    message-pill placement are pure layout decisions in `editorial-placement-policy.mjs`,
    keeping those special cases out of Canvas paint code.
  - Schedule-row parsing/rhythm is now a paint-ready placement plan, and the caption's
    complete-or-absent decision is centralized in `editorial-support-policy.mjs`. The
    message-pill, unified photo backdrop and final caption draw now consult the same line
    survival contract instead of maintaining three subtly different calculations.
- [ ] **DLC-4 — Layer contracts:** migrate content/typography, media, logo, surfaces and
  decoration to shared rules; remove duplicated local constants.
  - Started: `lib/content-typography-contract.mjs` derives authored semantic roles,
    requiredness, readable-size floors and editorial role gaps from the canonical design
    document. Post-render measurements evaluate that same contract and feed one advisor
    path for content loss, type size and spacing.
  - Decoration paint collision geometry is now a pure alpha-aware policy module; browser
    canvas decoding remains a thin adapter. Hollow outlines no longer collide through
    their transparent centres.
  - Media and brand-mark intent now share a versioned capability. It declares which
    media windows require cover crop, the resolved logo asset/pins/placement, the 3:1
    official-mark contrast floor and intrinsic clear space. Measured under-coverage,
    low contrast and edge proximity feed the same advisor/readiness voice.
  - Background and composed-surface intent now share a versioned capability. It records
    the canonical paint stack plus requested, resolved, measured and pinned color/
    treatment evidence. Duplicate local treatments and explicitly requested bands that
    conflict with structural shapes use stable rules and actionable readiness findings;
    typography remains the sole owner of contrast scoring, avoiding duplicate warnings.
    A pinned text color is resolved before automatic surface choices and a contract
    assertion blocks any future renderer path that silently paints a different ink.
  - Decoration now has a separate versioned capability; structural shapes never enter
    its budgets. It validates approved assets, per-format instance density, alpha-aware
    painted area and explicit accent-color count. Cross-layer overlap remains solely in
    the layout constraint engine. System-owned decoration is the first removable target;
    owner-pinned decoration receives an edit path and is never silently deleted or
    recolored.
- [ ] **DLC-5 — Policy/readiness:** separate technical/accessibility/brand/channel/
  approval states; permissioned exceptions; no blocking issue with only “Keep it.”
  - Started: `lib/readiness-policy.mjs` classifies canonical findings into technical,
    accessibility, brand, channel and approval states. Every blocker records whether a
    patch, typed command, policy remedy or direct-edit path actually exists, making
    “blocker with only Keep it” a testable release failure rather than a UI accident.
  - Acknowledgement and approval are now distinct policy states. Reviewing a blocker
    hides repeated prompts but leaves the format blocked and explicitly labelled
    “Approval required”; it can no longer receive a ready checkmark. Acknowledgements
    match the exact issue/property fingerprint, so a changed problem resurfaces.
  - AI and deterministic warnings remain visible review notes but no longer make a
    format fail readiness. Checklist merges always recompute readiness from blocking
    severity instead of treating any issue row as a blocker.
  - Export now consumes this policy state as its single authorization source. The
    current format can export when its own blocking policy clears; exporting the set
    requires every format to clear. A blocked attempt selects the affected format for
    repair, and an acknowledged blocker stays blocked until explicitly approved.
- [ ] **DLC-6 — Renderer/API cleanup:** extract remaining rule and renderer branches from
  `Generator.jsx`; assistant emits semantic commands; adapters own compatibility.
  - Started: semantic logo anchors, sizes, platform-safe placement and photographic
    surface-contrast scoring now live in pure policy modules. `Generator.jsx` supplies
    decoded pixels and paints the chosen result; it no longer owns those decisions.
  - Post-render composition now runs through one pure orchestrator that evaluates every
    layer contract and attaches normalized audit evidence. Shared photo geometry and
    decoration alpha sampling sit behind explicit canvas adapters, so painting and
    validation no longer maintain competing implementations.
  - Direct assistant changes now compile into ordered `DesignDocument` commands before
    they reach editor state. Post type is applied before layout materialization; explicit
    content, palette, treatment and type-size overrides apply afterward. Asset lookup,
    geometry, pinning and generation side effects remain named compatibility operations
    until they can be represented losslessly as semantic commands.
  - Format placement inheritance is now a pure policy: role drags inherit from master
    until a format override exists, while logo defaults remain format-native unless the
    active format has an explicit placement. Canvas rendering and inspector summaries
    consume the same resolution result.
  - Composite logo changes now compile into atomic command groups that preserve the
    distinction between system defaults, master pins and per-format user overrides.
    Photo frames compile to media commands, and shape clear/add workflows operate on one
    evolving collection so a replacement cannot resurrect stale layers. Inspector
    selection is declared as an effect of the workflow rather than embedded in policy.
  - Organic structural seams are evaluated against decoded shape paint, not their
    transparent bounding rectangles. Stress/calibration renders also derive contracts
    from their temporary archetype document instead of leaking live structural state.
    Media-source workflows now separate serialisable source commands from video/decode
    effects, with cancellation preventing a stale decode from restoring removed media.
  - Archetype materialization is now a pure composite workflow instead of a setter
    cluster. It resets only system-owned palette, responsive typography, media crop,
    motif and furniture state; user-added shapes survive, while an edited layout frame
    acts as a pin and suppresses a competing frame from the incoming archetype.
  - Undo/redo restores one canonical document atomically, then performs only declared
    view/decode effects. Photo reframing likewise pins and updates its transform in one
    workflow after the undo boundary; direct gestures can no longer leave an invisible
    crop pin behind, and frame cover floors are stored in the document render truth.
  - Complete-design templates now resolve to one final replacement document before
    entering editor state. Current templates retain saved ownership pins exactly;
    legacy templates reuse archetype materialization, so user shapes cannot be dropped
    by a competing motif migration. Format, export, selection, decode and acknowledgement
    changes are explicit effects rather than a second template-specific setter cascade.
    A user-triggered template switch captures one undo snapshot after confirmation;
    session/bootstrap restores still apply without polluting user history.
  - Single-shape update, media-host promotion and deletion now share one ownership-aware
    workflow; generated layout pins and per-format touched state land atomically with
    geometry/style changes. Furniture edits validate brand tokens centrally. Text-box
    and individual-role drags compile directly to responsive typography commands, and
    client opacity/field-color edits now use the semantic patch compiler.
  - Patch history now commits only after at least one validated mutation lands. Invalid,
    rejected, or echoed no-op AI patches no longer create dead Undo entries or erase Redo.
  - Shape and typography resets now enter through the same semantic patch boundary as
    drag, resize and inspector edits. Reset is authoritative when a contradictory update
    is supplied; format shape resets clear both geometry and touched ownership metadata,
    and every successful reset participates in the normal Undo/harmonization lifecycle.
  - Whole-format reset now uses one shared definition of an owner-authored override and
    one atomic command across typography, media, logo and shapes. Generated responsive
    shape geometry does not falsely advertise an override; a genuine reset clears both
    local shape geometry and its ownership marker and a no-op reset creates no history.
  - Composite workflow reporting now trusts reducer results instead of planner intent.
    Equivalent typography, media, logo, shape and furniture commands return no changed
    paths, so manual and AI summaries, Undo/Redo, and harmonization all share the same
    semantic definition of a real mutation.
  - Legacy and cross-device shape collections now enter through an explicit import
    workflow: bootstrap restoration stays history-neutral, while a user-triggered draft
    load is undoable. Development verification hooks use the same patch vocabulary.
  - Typography reset, media-kind selection, landing image handoff, first-shot correction,
    and automatic logo accessibility now all use semantic patches. Generated image and
    layout state share one undo boundary; system-owned accessibility changes remain
    unpinned, selection-preserving, and history-neutral.
  - The document controller's flat writable setter facade has been deleted. Production,
    import and verification callers now enter through patches/workflows; raw command
    dispatch remains only inside the controller and the central patch executors, plus
    pipeline-owned authorship and explicit-pin metadata commands.
  - Command/effect execution now lives outside `Generator.jsx` behind one stable
    orchestration hook and a pure executor. Effects still run when a document command is
    a no-op (for example, re-decoding a restored source), stale media decodes are
    cancelled, and synchronous or asynchronous decode failures resolve safely to an
    empty decoded asset instead of becoming unhandled runtime errors.
  - Transient workflow effects now have one named vocabulary and executable payload
    schemas. Composite planners cannot invent parallel selection/decode/view mutations;
    the executor filters malformed or unknown effects, reports them during development,
    and continues applying valid document commands without crashing the editor.
  - New Undo/Redo entries now store one detached canonical `DesignDocument` plus only
    the active format and logo-tab view context. The previous duplicated flat snapshot
    fields are no longer a competing history model; legacy flat snapshots remain a
    read-only migration input for old sessions. The New post action now constructs a
    canonical blank document directly instead of writing and immediately re-reading a
    legacy flat payload.
  - Incoming patch normalization and AI copy fitting now run in a pure preparation
    module before command planning. Retired values are migrated without mutating the
    caller, owner/UI copy stays verbatim, and incomplete or dangling-word trims are
    rejected by a tested complete-or-absent rule instead of inline component branches.
  - Compiled direct commands and composite workflow groups now share the same applied-
    field law: planner intent is never enough; a field is reported only when the
    canonical reducer returns a changed path. Invalid entries remain safe no-ops.
  - UI patch interaction classification is now pure policy beside patch preparation.
    Continuous geometry edits bypass discrete canvas animation, while the manual
    harmonizer receives one deduplicated set of touched layer owners for its restraint.
  - The ordered logo, shape, typography, format-reset, photo, media and furniture
    workflow plan now lives in one pure orchestration module. `Generator.jsx` supplies
    current render context once and executes the returned groups; it no longer owns a
    parallel sequence of per-layer planner branches.
  - Archetype re-materialization and format switching are now resolved as explicit,
    tested patch transitions. Variant changes and patch-authored copy context are
    decided outside the component before the transition is performed.
  - Patch completion policy now derives selection cleanup, silent-harmonizer arming,
    copy authorship and history eligibility from reducer-confirmed applied fields in one
    pure step. The component performs those declared outcomes without re-deciding them.
  - Command-path collection now has a guaranteed cleanup boundary. A planner, decoder,
    or reducer exception cannot leak the failed patch's collector into later edits or
    corrupt nested verification reporting.
  - Archetype-to-layer materialization now lives in a pure module. Responsive structural
    frames, motif layers, typography geometry, photo treatment and sanctioned palette
    output are independently testable; random IDs and canvas geometry are injected.
  - Inspector render-truth verification now lives in a dedicated hook with a testable
    pixel-signature adapter. Deferred paint comparison, dead-control notes and feedback
    capture no longer expand the central patch pipeline component.
  - Undo/Redo traversal and snapshot restoration now live behind one history hook and a
    pure stack-step planner. React state updates perform the plan; no updater contains
    restoration side effects, and both directions use the same bounded semantics.
  - Rapid manual edits now use a dedicated burst controller. The first validated edit
    captures one canonical history entry, subsequent drag/typing updates merge touched
    layer ownership, Redo clears once, and delayed harmonization receives one tick.
  - Copy-authorship stamps and explicit palette pins now enter through named workflows.
    `Generator.jsx` has no direct `dispatchDesignCommand` calls; every document mutation
    reaches the reducer through the central semantic/workflow executors.
- [ ] **DLC-7 — Release gate:** multi-format fixtures, migration round trips, cross-layer
  collision matrix, mobile/direct manipulation, resident journeys and visual diffs.
  - Started: six-format semantic contract fixtures and pure mobile half-sheet viewport
    tests now guard platform safe areas, content/typography, media/logo, surface and
    decoration validation, selection visibility and undo-control placement.
  - The executable cross-layer collision matrix now proves that each competing pair
    resolves to exactly one canonical rule owner (format, layout, media, logo,
    structure, or decoration), preventing duplicate or contradictory advice.

## 22. Definition of done

The consolidation is complete when:

- every active design rule has one stable ID and machine-readable owner;
- every layer/property has one canonical writable source;
- structural and decorative shapes cannot be confused;
- media-host behavior is explicit and order-independent;
- preflight prevents known system-created conflicts;
- post-render findings cite measured rule evidence;
- blocking issues always have repair/edit/approval paths;
- all formats validate under the same contract;
- old sessions/templates render identically after migration;
- `Generator.jsx`, audits and assistant routes consume shared contracts rather than
  redefining product policy.

## 23. Regression guards

The contract must never silently break the system it consolidates. Four checkers plus
one render baseline form the **contract guard battery**. Every DLC checkpoint (DLC-2
through DLC-7) is *not done* until the full battery is green **and** the render
fingerprint is unchanged (or its baseline was deliberately, visually re-approved).

| Checker | File | Guards |
|---|---|---|
| A · Registry self-consistency | `scripts/tests/dlc-registry.test.mjs` | Rule-ID uniqueness/format, enum membership (severity/enforcement/source/layers), blocker→remedy, the §8 Z-band ladder, legacy alias round-trips, and §3.2 role/mode validity. |
| B · Migration fidelity & idempotency | `scripts/tests/dlc-migration.test.mjs` | Migrating twice == once (byte-identical), newest-frame media-host seeding (§3.3), pins survive normalization, no invalid role/mode combos, serialize→parse→migrate stability. The frozen reference for "old sessions render identically" (§20/§22). |
| C · Ledger invariants (DLC-2) | `scripts/tests/dlc-ledger.test.mjs` | Every mapped finding carries a resolving `ruleId`; policy severity/enforcement/remedies stay consistent with the registry; no blocking finding lacks remedies; `normalizeFinding`'s consumer field-set is stable (one voice); the DLC-2 coverage boundary is frozen (only known advisories may lack a `ruleId`). |
| D · Render fingerprint | baseline: `scripts/guards/render-fingerprint-baseline.json` | Hash-per-cell over every archetype × 6 formats **and** every legacy postType × 6 formats — the "old session" render paths. Proves the composition still paints identically pixel-for-pixel. |

Run A/B/C with `npm run test:contract` (they also ride `npm run test:unit`). The DLC-1
foundation test `scripts/tests/design-layer-contract.test.mjs` is part of the battery.

**Render-fingerprint driver (browser-only guard, sibling to `__woArchStress`).** The
renderer is Canvas 2D, so the fingerprint follows the repo's guard-oracle pattern: a
test-hook-gated `window.__woRenderFingerprint(opts?)` (in `hooks/useRenderVerificationBoards.js`,
stripped from production). To re-run and compare:

1. Build + serve the isolated test-hooks dist (keys unset, $0):
   `WO_DIST_DIR=.next-dlc-guard NEXT_PUBLIC_WO_TEST_HOOKS=1 npx next build && WO_DIST_DIR=.next-dlc-guard npx next start -p 3222`
2. Open the app, click **Skip to the studio** so the Generator mounts.
3. In the console: `const base = await (await fetch('/…/render-fingerprint-baseline.json')).json(); window.__woRenderFingerprint({ baseline: base })` — inspect `.pass` and `.diffs` (each diff names the offending `arch:<id>:<fmt>` / `legacy:<postType>:<fmt>` cell).

The fixture photo is a **fixed solid-colour stand-in** and all copy is fixed, so the only
variable is the renderer itself. Hashes are engine-specific (the committed baseline was
captured on `Chrome/148`); always compare within the same harness.

**The rule.** A fingerprint diff is *never* regenerated silently. A changed cell means
either a **bug in the DLC change** (fix the code until the cell matches) or a
**deliberate, visually-reviewed baseline bump** (inspect the affected archetype/format on
canvas, confirm the new output is intended, then overwrite the baseline in the same
commit that changes the render). The same discipline applies to checker B's newest-frame
assertion when DLC-3 retires array-order semantics: update the frozen reference on
purpose, never as a side effect.
