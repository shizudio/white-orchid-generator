# Design Layer Contract — one system for composition rules

Status: **RATIFIED DIRECTION; phased implementation**  
Owner: product design + design engine  
Ratified: 2026-07-21  
Current implementation checkpoint: **DLC-2 / DLC-3 — constraint and structural-layout migration underway**

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
- [ ] **DLC-3 — Structural layout:** layout capability/zone schema; structural shapes use
  explicit media host; retire newest-frame and array-order semantics.
  - Started: the Shapes inspector groups structural and decorative roles, identifies the
    active photo frame, and changes photo ownership through one atomic typed command.
  - Complete: editorial and non-editorial runtime painters now use the explicit host;
    inactive frame shapes paint as colour silhouettes; text snapping follows the host;
    structural deletion surfaces its consequence before applying.
  - The newest-frame rule remains only in the one-time legacy migration adapter, where it
    preserves old saved output. Runtime rendering is order-independent.
  - Remaining: add layout capability/zone relationships and migrate structural collision
    handling out of renderer-local branches.
- [ ] **DLC-4 — Layer contracts:** migrate content/typography, media, logo, surfaces and
  decoration to shared rules; remove duplicated local constants.
- [ ] **DLC-5 — Policy/readiness:** separate technical/accessibility/brand/channel/
  approval states; permissioned exceptions; no blocking issue with only “Keep it.”
- [ ] **DLC-6 — Renderer/API cleanup:** extract remaining rule and renderer branches from
  `Generator.jsx`; assistant emits semantic commands; adapters own compatibility.
- [ ] **DLC-7 — Release gate:** multi-format fixtures, migration round trips, cross-layer
  collision matrix, mobile/direct manipulation, resident journeys and visual diffs.

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
