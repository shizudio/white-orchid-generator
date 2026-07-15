# White Orchid Editor Refactor PRD

**Status:** Active  
**Started:** 2026-07-14  
**Migration style:** Incremental, behaviour-preserving vertical slices  
**Current checkpoint:** `Refactor complete — R8.5 resident release gate PASSED (2026-07-15)`  
**Last completed checkpoint:** `R8.5 - Resident release verification (paid smoke sweep — gate PASS, no NEW regressions)`

This document is the source of truth for the editor refactor. Every implementation
session must update the two checkpoint lines above and tick completed work below. If a
session ends early, resume at the first unchecked item under the current checkpoint.

## 1. Product problem

The Content Studio works, but its editor architecture permits multiple systems to own
the same decision. That is why an explicit colour can be overwritten by accessibility,
canvas text can differ from input text, a selected caption can show the title box, and
local audit advice can disagree with the rendered artwork.

The live editor is currently concentrated in `components/Generator.jsx`:

- approximately 13,350 lines;
- 128 React state declarations;
- 56 effects;
- 52 mutable refs;
- more than 500 direct state writes.

The refactor must reduce conflicting ownership without pausing product development or
replacing the working canvas renderer in one high-risk rewrite.

## 2. Goals

1. One serialisable design document is the authority for editable design data.
2. One selection object is the authority for the selected canvas element.
3. Every user and AI mutation is represented by a typed editor command.
4. Rendering is pure: design + format + assets in, pixels + measurements out.
5. Canvas hit-testing, selection chrome, inspector routing, and audit anchors consume the
   same scene-element geometry.
6. Local audit, AI audit, export readiness, and acknowledgements use one finding model.
7. Undo, persistence, templates, sessions, and cloud sync serialise the same document.
8. Every phase is independently shippable and retains current user behaviour.

## 3. Non-goals

- No visual redesign during the structural migration.
- No replacement of Canvas 2D with SVG, WebGL, or a third-party editor framework.
- No database migration until the canonical document schema has been proven locally.
- No deletion of legacy compatibility paths until saved designs have migration coverage.
- No new AI capability as part of the refactor.

## 4. Governing invariants

These are release blockers for every phase.

1. **User pins win.** Explicit colour, placement, logo, backdrop, photo, and shape choices
   cannot be silently overwritten.
2. **Stored copy equals painted copy.** The renderer never rewrites content.
3. **Complete or absent.** A role is never painted as a partial sentence.
4. **Every warning is observable.** An audit issue must point to measured render geometry.
5. **Every warning is actionable.** A blocking issue offers a working repair or direct edit.
6. **Every format remains valid.** Master changes cascade; deliberate format overrides stay
   local and visible.
7. **One action, one undo entry.** Drag bursts and harmoniser amendments remain atomic.
8. **Saved work round-trips.** Templates and sessions reopen without visual drift.
9. **No dead canvas clicks.** Every rendered element is selectable; occluded elements remain
   reachable from the inspector list.
10. **Build stays green.** `npm run build` must pass at every checkpoint.

## 5. Target architecture

```text
UI gesture / AI proposal
          |
          v
      EditorCommand
          |
          v
      designReducer  ---------> CommandResult
          |                         |
          v                         +--> truthful AI/UI confirmation
   Canonical DesignDocument
          |
          v
     resolveFormat
          |
          v
      renderScene (pure)
          |
          v
       RenderResult
       |- pixels
       |- sceneElements[]
       |- typography metrics
       |- contrast measurements
       `- canonical findings
          |
          +--> canvas + selection + inspector
          +--> every-format previews + export
          +--> advice ledger
          `--> persistence adapters
```

### 5.1 Canonical design document

The final document must be plain JSON and versioned.

```js
{
  schemaVersion: 1,
  content: { headline, subtext, attribution, dateText, microLabel, pillText },
  composition: { postType, archetypeId, archetypeVariant },
  palette: { background, field, text, backdrop, backgroundOpacity },
  typography: { roleSizes, masterLayout, formatLayouts },
  media: { source, kind, masterTransform, formatTransforms, formatPins },
  logo: { assetId, variantPinned, hidden, masterPlacement, formatPlacements },
  shapes: [{ id, assetId, mode, style, masterTransform, formatTransforms }],
  furniture: { overrides },
  authorship: { contentFields },
  pins: { properties },
  acknowledgements: []
}
```

Decoded image/video objects, canvas contexts, DOM nodes, selection, open panels, loading
state, and transient audit UI do not belong in this document.

### 5.2 Editor UI state

```js
{
  selection: null | { type: 'text'|'photo'|'logo'|'shape'|'furniture'|'background', id, role },
  inspectorOpen: boolean,
  topMenu: null | 'templates'|'export',
  drag: null | DragSession,
  folds: {},
  notices: []
}
```

### 5.3 Render result

```js
{
  dimensionId,
  sceneElements: [{ id, type, role, z, bounds, transform, interactive, painted }],
  textMetrics: {},
  contrast: {},
  droppedRoles: [],
  findings: []
}
```

## 6. Migration plan

### R0 - Baseline and safety net

- [x] **R0.1** Record architecture metrics and current systemic conflicts.
- [x] **R0.2** Preserve the UX-correctness baseline: colour pins, canonical AI copy,
  truthful crop detection, unified templates, nested shapes, and role-specific selection.
- [x] **R0.3** Confirm `npm run build` passes.
- [x] **R0.4** Add small pure-function regression tests for every helper extracted during
  subsequent phases. Tests grow with extraction; no attempt to test the monolith first.

### R1 - Canonical selection and scene identity

**Purpose:** Remove the first parallel-state cluster without changing design data.

- [x] **R1.1** Create a pure selection reducer and selectors.
- [x] **R1.2** Replace `photoSel`, `textSelected`, `logoSel`, `bgSel`, `selOverlay`,
  `inspectorEl`, and `textRole` as independent authorities with one selection object.
- [x] **R1.3** Preserve compatibility aliases temporarily where a one-pass migration would
  make the diff unsafe; aliases must be derived, never separately writable.
- [x] **R1.4** Give every selectable item a stable scene identity:
  `text:hero`, `text:support`, `logo:primary`, `shape:<uid>`, `furniture:<key>`, etc.
- [x] **R1.5** Route canvas clicks, keyboard selection, inspector list clicks, delete,
  and close through the selection controller.
- [x] **R1.6** Verify caption/title/date/label/button selection chrome and keyboard movement.

**Exit criteria:** impossible to represent two selected elements at once; the inspector and
canvas chrome are projections of the same selection value.

### R2 - Canonical document and command reducer

- [x] **R2.1** Define `DesignDocumentV1`, defaults, validation, and schema migration helpers.
- [x] **R2.2** Define typed command families: content, palette, typography, media, logo,
  shapes, furniture, format override, acknowledgement.
- [x] **R2.3** Migrate content + palette as the first reducer-backed vertical slice.
- [x] **R2.4** Migrate typography and per-format text roles.
- [x] **R2.5** Migrate media and photo transforms.
- [x] **R2.6** Migrate logo state and pins.
- [x] **R2.7** Migrate shapes and furniture.
- [x] **R2.8** Remove direct editable-state setters outside reducer initialisation/migration.
- [x] **R2.9** Generate AI confirmations from `CommandResult.changedPaths`.

**Exit criteria:** every editable change is a command; undo stores document transitions;
AI cannot truthfully claim an unapplied change.

### R3 - Generic format inheritance

- [x] **R3.1** Introduce a shared `{ master, byFormat }` resolver.
- [x] **R3.2** Migrate text layout overrides.
- [x] **R3.3** Migrate text-role offsets.
- [x] **R3.4** Migrate logo placement and free-position pins.
- [x] **R3.5** Migrate photo transforms and touched flags.
- [x] **R3.6** Migrate shape transforms.
- [x] **R3.7** Implement one `resetFormatToMaster(formatId)` command.

**Exit criteria:** all format-aware properties use the same inheritance algorithm.

### R4 - Pure renderer and scene graph

- [x] **R4.1** Extract renderer inputs from React closures into an explicit render model.
- [x] **R4.2** Return role, logo, photo, furniture, and shape bounds in `sceneElements`.
- [x] **R4.3** Remove render writes to `textBoundsRef`, `roleBoundsRef`, `logoBoxRef`,
  `auditRef`, `deadRolesRef`, and related shared diagnostic refs.
- [x] **R4.4** Make live preview, thumbnails, export, proposals, and tests call the same pure
  renderer without save-and-restore ref gymnastics.
- [x] **R4.5** Move expensive image-region analysis behind memoised asset analysis.
- [x] **R4.6** Use the scene graph for hit-testing and selection chrome.

**Exit criteria:** rendering the same document and format twice produces the same result and
cannot mutate editor state.

### R5 - One advice ledger

- [x] **R5.1** Define one finding type: id, category, severity, format, elementId, geometry,
  message, actions, sources, fingerprint.
- [x] **R5.2** Convert deterministic findings directly from `RenderResult`.
- [x] **R5.3** Normalise AI-audit findings into the same schema.
- [x] **R5.4** Deduplicate by category + element + geometry fingerprint.
- [x] **R5.5** Key acknowledgement expiry to the affected property fingerprint.
- [x] **R5.6** Remove parallel readiness/audit issue models.

**Exit criteria:** one issue produces one dot, one checklist row, and one acknowledgement.

### R6 - Persistence and template convergence

- [x] **R6.1** Persist only versioned `DesignDocument` plus session metadata.
- [x] **R6.2** Add migrations for current local templates, cloud templates, and sessions.
- [x] **R6.3** Introduce revision numbers and deterministic local/cloud conflict resolution.
- [x] **R6.4** Stop regenerating stable shape identities during ordinary restore.
- [x] **R6.5** Separate thumbnail blobs from document JSON.
- [x] **R6.6** Remove legacy storage keys after a measured compatibility window.

**Exit criteria:** local, cloud, template, and session reopen produce the same document hash.

### R7 - Component and performance decomposition

- [x] **R7.1** Extract `EditorCanvas` and pointer/keyboard controller.
- [x] **R7.2** Extract `ContextualInspector` and element panels.
- [x] **R7.3** Extract `TemplateLibrary`.
- [x] **R7.4** Extract `ExportPanel` and readiness UI.
- [x] **R7.5** Keep AI chat isolated from renderer implementation details.
- [x] **R7.6** Move six-format preview rendering to a scheduled worker or idle queue where
  browser support permits.
- [x] **R7.7** Measure and reduce interaction latency and redundant renders.
- [x] **R7.8** Split the remaining `Generator` orchestrator into reviewable hooks and
  product surfaces. Reviewable means no leaf product component exceeds 1,500 lines;
  orchestration hooks/modules must each have one named responsibility.

**Exit criteria:** no product component exceeds an agreed reviewable size; canvas interaction
stays responsive during preview and audit work.

### R8 - Cleanup and release

- [x] **R8.1** Remove compatibility aliases and dead direct setters.
- [x] **R8.2** Gate all development hooks from production.
- [x] **R8.3** Reconcile or archive superseded architecture documents.
- [x] **R8.4** Update the resident tester to current semantic surfaces.
- [x] **R8.5** Run the full resident test and compare against the pre-refactor baseline.
- [x] **R8.6** Stage rollout with saved-design migration telemetry and rollback support.

## 7. Test strategy

Each phase adds tests at the lowest stable layer available.

1. **Pure unit tests:** reducers, format inheritance, migration, audit fingerprints.
2. **Render characterisation tests:** same input yields the same scene elements and findings.
3. **Interaction tests:** canvas element selects the matching inspector role.
4. **Round-trip tests:** document → template/session JSON → document preserves identity.
5. **Resident journeys:** generate, edit, format switch, add caption, add shape, export, undo.

The full resident test can use paid AI requests. Do not run a paid sweep without explicit
approval; use mocked/deploy-smoke mode during ordinary checkpoints.

## 8. Refactor rules

- Extract behaviour before rewriting it.
- One vertical slice per commit.
- No mixed feature work inside refactor commits.
- Compatibility aliases must have a named deletion checkpoint.
- New code cannot import React into pure state, geometry, migration, or audit modules.
- New pure modules cannot read browser storage, environment variables, DOM, or canvas refs.
- Update this PRD after every completed checkpoint.

## 9. Resume protocol

When a session stops:

1. Read **Current checkpoint** at the top.
2. Find that item in Section 6.
3. Inspect `git status` and the latest diff before editing.
4. Run the smallest test associated with the checkpoint.
5. Continue at the first unchecked item.
6. Update **Last completed checkpoint** only after its exit criteria pass.

### 9.1 Verification log — 2026-07-14

- `npm run test:unit`: 6/6 selection reducer tests pass.
- `npm run build`: production compilation, lint/type validation, and all 24 static pages pass.
- `git diff --check`: passes.
- Browser interaction verification remains at R1.6 because the in-app browser connection
  could not be initialised in this session. No standalone or paid resident sweep was used.

### 9.2 Verification log — R2.1–R2.3

- `DesignDocumentV1` now owns content, authorship, palette, opacity, backdrop, and
  accessibility pins in the live editor.
- Legacy templates migrate from their flat state; new saves dual-write canonical nested
  content/palette plus temporary flat compatibility fields.
- Undo snapshots carry the canonical document; pre-V1 undo entries still restore through
  the migration adapter.
- Thirteen pure reducer/migration/selection tests pass and the production build passes.
- R1.6 remains an explicit interaction-QA debt; it does not reintroduce parallel state.

### 9.3 Verification log — R2.4

- `DesignDocumentV1.typography` now owns the hero register, role-size intent, master
  layouts, per-format layouts, and per-format/per-role free-placement offsets.
- Master drags, format-specific drags, role pin/unpin, editorial reset, font-size edits,
  template restore, session persistence, and undo all route through typed commands.
- Frozen solver bases (`bx`/`by`) are preserved across subsequent role movement.
- Resetting one format removes only that format's layout and role-offset overrides.
- The monolith is down from 128 to 102 `useState` declarations across R1–R2.4.
- Seventeen pure tests pass; the isolated production build compiles and validates all
  24 routes without disturbing the live development server.

### 9.4 Verification log — R2.5

- `DesignDocumentV1.media` now owns the serialisable source, kind, treatment, frame,
  master crop, per-format crops, and explicit format pins.
- Decoded `Image`/`Video` objects remain transient and outside the document.
- A new source resets stale transforms atomically; decoding/restoring an existing source
  no longer erases its saved crop (a pre-refactor systemic race).
- Format reset removes only that format's media transform and pin.
- The compatibility adapter stores embedded image data once, preventing the temporary
  nested/flat dual-write from causing `413` session-save failures.
- The monolith is down to 95 `useState` declarations. Twenty-one pure tests pass and the
  isolated production build validates all 24 routes.

### 9.5 Verification log — R2.6

- `DesignDocumentV1.logo` now owns asset choice, variant pin, visibility pin, placement
  pin, master anchor/size/free position, and per-format placements.
- Brand Marks tab selection remains transient UI state as intended.
- Master and per-format placement commands merge atomically so sequential position/size
  edits cannot overwrite each other through stale React closures.
- Twenty-three pure tests pass and the isolated production build validates all routes.

### 9.6 Progress log — R2.7a

- Shape/furniture schema migration and typed add/update/remove/set commands are complete.
- Existing shape IDs now survive undo and template restore; legacy layers without IDs get
  deterministic IDs instead of fresh random IDs on every reopen.
- Decoded overlay images and inspector selection remain transient.
- Twenty-five pure tests pass. Live `overlayLayers` and `furnitureOverrides` migration is
  the remaining half of R2.7 and must be followed by the isolated production build.

### 9.7 Verification log — R2.7b

- Live shape instances and furniture overrides are projections of `DesignDocumentV1`;
  their independent React state declarations are removed.
- Existing drag, resize, rotate, colour, delete, motif, template, undo, and format-reset
  writers now terminate in document commands through compatibility adapters.
- Twenty-five pure tests pass and the isolated production build validates all 24 routes.

### 9.8 Verification log — R2.8–R3.7

- Composition, high-frequency shape/furniture transforms, and format resets now use
  reducer commands; AI confirmations are derived from actual changed document paths.
- One shared inheritance resolver now governs text layouts/role offsets, logo placement,
  media crops/pins, and shape transforms.
- One format-reset command clears every local override while preserving master intent.
- Twenty-nine unit tests and the isolated production build pass.

### 9.9 Progress log — R4.1–R4.3

- `RenderModelV1` is the explicit React-to-renderer boundary: canonical document and
  decoded browser assets are separate inputs.
- `RenderResult` returns stable scene identities and measured geometry for text roles,
  furniture, photo, logo, and shapes.
- The painter no longer mutates selection/audit geometry refs. The live preview projects
  its returned result into temporary compatibility refs after the render completes.
- Format audits, readiness sweeps, proposal gates, and regression guards consume each
  render's returned audit signal; no caller saves/restores shared audit geometry.
- Thirty-three unit tests and the isolated production build pass.

### 9.10 Verification log — R4.4–R5.6

- Reusable focal/luminance/region analysis is cached once per decoded asset identity.
- Pointer hit-testing, snap geometry, layer-list identity, and selection chrome consume
  the renderer's stable scene elements (including rotated shapes and thin text roles).
- Local and AI findings share one canonical contract and one readiness-ledger state;
  matching concerns deduplicate by category + element + geometry.
- Acknowledgements include both geometry and affected-property fingerprints, with a
  compatibility read for legacy geometry-only acknowledgement keys.
- Forty pure tests pass; the isolated production build validates all 24 routes.
- Interactive browser verification remains explicit debt: the bundled browser runtime
  failed during initialisation (`Cannot redefine property: process`). The localhost
  process remains listening on port 3001, and no paid resident sweep was run.

### 9.11 Verification log — R6.1–R6.6

- New templates and sessions persist `{ persistenceVersion, document, metadata }`;
  thumbnails and conversations remain record metadata rather than document JSON.
- Legacy flat templates/sessions migrate through one reader; local templates rewrite
  to V1 on load and the obsolete shape-only work document is imported once then deleted.
- Shape identities survive every canonical round-trip; revisions resolve local/cloud
  conflicts before timestamps, with a deterministic payload tie-breaker.
- Forty-three pure tests pass; the isolated production build validates all routes.

### 9.12 Progress log — R7 component boundaries

- `EditorCanvas` now owns event wiring and interaction chrome; a pure input controller
  resolves stable renderer scene identities into text, furniture, logo, and shape targets.
- The inspector dock/element rail, template gallery, export controls, readiness rows,
  background, media, content-field, logo, furniture, shape-layer, and per-shape style/
  transform panels are memoized product components. R7.2 is complete.
- Six-format thumbnails run through a cancellable idle queue, yielding between formats;
  gesture duration is available as the development-only `wo-editor-gesture` performance
  measure. AI chat consumes design state and command callbacks, not canvas/renderer refs.
- R7.8 now has explicit orchestration boundaries for local template/asset migration and
  cloud reconciliation (`useDesignPersistence`), local-first session restore and conflict
  resolution (`useSessionBootstrap`), decoded canvas assets (`useCanvasAssetCache`),
  debounced canonical session saves (`useSessionAutosave`), the merged local/cloud Posts
  catalogue (`usePostLibrary`), Posts record mutations/restores (`usePostActions`),
  server-managed brand catalogues (`useBrandCatalogHydration`), responsive scale, and
  idle format previews. Landing-plan consumption and its born-clean first-shot gate now
  live in `useLandingHandoff`; document-wide history/dismissal listeners live in
  `useEditorGlobalEffects`. Session bootstrap communicates with the
  later-declared template/post actions through one post-commit action ref, avoiding a
  temporal-dead-zone dependency while preserving effect order.
  Accessibility recommendations and unpinned logo seeding live in
  `useAccessibilityDirector`; mutual overlay closing and Escape priority live in
  `useOverlayDiscipline`. Font/sample readiness is isolated in `useEditorBootstrap`,
  and gated resident/development console registration (including the credit-spending
  development-only library builder) lives in `useVerificationDrivers`. Deterministic
  live-audit caching, six-format sweeps, readiness calculation, design fingerprints,
  and stale-ledger pruning live in `useReadinessOrchestration` while consuming the
  existing renderer as a black box. Readiness-fix timing, issue geometry,
  acknowledgement/pinning, and advisor popover state live in `useAdvisorLedger`;
  executable finding remedies live separately in `useAdvisorFindingActions`. The live
  canvas draw/result publication and post-draw hint synchronization are isolated in
  `useLiveCanvasRender` while the legacy renderer remains behaviorally unchanged. The
  remaining direct-manipulation lifecycle now lives in `useCanvasGestures`: scene hit
  targets, text/furniture/logo/shape/photo drag state, soft snapping, resize/rotate, and
  gesture completion all emit the existing reducer/patch commands; shape drags retain
  their stable instance id for the full gesture. Production format-fit diagnosis and
  bounded event-driven healing live in `useFormatFitHealing`; state-mutating development
  walkthroughs live in `useEditorVerificationHarnesses`, and render-only calibration,
  feed, stress, born-clean, and legacy-duplicate boards live in
  `useRenderVerificationBoards`. Production recovery no longer shares an orchestration
  block with test drivers. Single/all-format downloads, retry/failure reporting,
  export-success learning signals, and the post-export template nudge live in
  `useExportOrchestration`. Complete-design template serialization, thumbnailing,
  migration-aware restore, local/cloud sync, edit-in-place, save-as-new, and reversible
  removal live in `useTemplateManagement`; an explicit guard ref breaks the intentional
  unsaved-work/apply cycle without a temporal-dead-zone dependency.
  Silent AI-patch repair and debounced manual-edit repair are separate hooks in
  `useDesignHarmonization`, sharing deterministic finding collection while preserving
  pin, acknowledgement, logo-geometry, conflict, and undo-amend rules. Audit capture
  lives in `useAuditCaptureImage`; the manual AI audit, merged-ledger write, learning
  events, and gated ledger drivers live in `useAiAuditLedger`. The audit now stamps the
  canonical string fingerprint directly, fixing a latent string-as-function runtime
  defect inherited from the earlier readiness extraction.
  External-inspiration load/upload/remove lives in `useMoodboardOrchestration`; the
  no-credit six-format landing re-solve lives in `useFirstShotGate`; proposal enum/render
  gating, thumbnails, source lookup, deferred intake, mock drivers, and explicit
  accept/decline/later behavior live in `useTemplateProposalReview`. Fresh-design and
  session reset lives in `useNewPostAction`; title derivation and the liked-design
  "more like this" gene handoff live in `useSessionProductActions`. Template replacement
  protection is isolated in `useTemplateApplyGuard`, while cross-device shape intake,
  per-format override detection, and whole-format reset live in
  `useFormatOverrideActions`. The renderer's post-type override is now initialized at
  the callback boundary instead of shadowing a later binding, removing the hot-reload
  temporal-dead-zone failure seen on `/generate`.
- The `Generator` product component is 1,500 lines (down from 9,700+ component lines at
  the start of R7.8) and the `ArtDirectorChat` component is 1,077 lines. The larger
  `Generator.jsx` file now
  contains module-level pure renderer, workflow hook, chrome-model, shell, and inspector
  boundaries; every product component and orchestration boundary is below 1,500 lines.
  Media generation, direct manipulation, canonical document projection, inspector
  routing, feed gallery, product workflow composition, and the complete JSX shell all
  have explicit contracts. The legacy renderer no longer lives inside the React root.
- Forty-nine pure tests pass; the isolated production build validates all 24 routes, and
  `/generate` returns HTTP 200 from the live port-3001 development server.

### 9.13 Progress log — R8 cleanup and staged persistence rollout

- Every verification driver is guarded by a build-time development or isolated-tester
  flag; ordinary production retains event-driven self-healing but exposes no driver.
- The superseded audit panel, duplicate selection chrome, old readiness implementation,
  and newly orphaned UI atoms were removed.
- Local template migration now records attempted/succeeded/failed counts, retains exact
  V0 rollback records, and supports an emergency `?designPersistenceRollback=1` reopen.
- R8.1 removed the flat writable selection compatibility setters and the controller's
  flat mutation return surface. Design mutations now leave
  `useDesignDocumentController` through a namespaced typed-command contract; selection
  mutations leave one namespaced reducer-command contract. Dead accent-wash/brightness/
  section helpers, a dead logo-pattern closure, stale renderer destructures, and the
  final unused module import were removed after Babel scope verification.
- `npm run test:unit` passes 49/49, `git diff --check` passes, the isolated R8 production
  build compiles and validates all 24 routes, and the port-3001 development server
  hot-reloads the cleanup without a compile error. A fresh direct HTTP probe could not
  be repeated after this slice because the execution approval service reached its usage
  limit; the same server returned HTTP 200 immediately before R8.1 and remained live.
- `docs/operating-manual.md` and `docs/asset-pipeline.md` now describe the canonical
  document/command architecture, focused hook/component boundaries, and unit + resident
  test layers instead of the superseded 10k-line-monolith/no-unit-test baseline.
- The remaining release gates are R1.6 interactive role-selection/keyboard verification
  and R8.5's resident sweep. The bundled browser connection still fails during bootstrap
  (`Cannot redefine property: process`). The resident smoke fully mocks photo generation
  but makes paid assistant requests (budgeted up to $3), so it still requires explicit
  user approval under the PRD's spend rule.
- The comparison baseline is `docs/resident-tester/smoke-report-2026-07-14.md`: 6/10
  everyday journeys passed, 31 requests ran, 13 requests raised flags, and 16 total
  flags clustered into five issue types. The four failed journeys were per-element
  canvas hit targets, the format strip (0 formats detected), Add-caption render truth,
  and opening Export/Ready. The run also recorded 10 born-clean/contrast cases, two
  claim-without-change cases, and two walk-back replies. The post-refactor sweep must
  compare these exact counters and defect categories, not merely report its own pass rate.

If work stops today, resume at: **R8.5 only. R1.6 is complete (see §9.14 and §9.15 —
photo, shape, and furniture-rule canvas selection are now verified after fixing a refactor
regression that dropped media props from the extracted inspector). Only with explicit
approval for paid assistant traffic, run `npm run test:resident`, compare the generated
journey/oracle results with the pre-refactor 2026-07-14 smoke baseline, and record every
regression or improvement here. Do not run the nightly probe or any real-photo generation.
The non-paid gate is currently 52/52 unit tests, clean diff whitespace, a successful
24-route production build, and a live port-3001 dev compile.**

### 9.14 Verification log — R1.6 interactive verification + release-blocker fixes (2026-07-15)

Interactive verification was run in a real browser against the live port-3001 dev tree
(hot-reload) and, for the crash + format-strip claims, against an isolated production
build (`WO_DIST_DIR=.next-gate next build`, served with `next start`). Harness mode was
held on; no photo generation and no paid assistant traffic were triggered.

**Crash on `/generate` — diagnosed dev-only; NOT a product/render-phase defect; not
patched (§7 stop-and-surface over a suppression hack).** The reported blank page +
`Warning: Cannot update a component (App) while rendering a different component (App)`
was reproduced on the first cold-compile / empty-storage load in dev. Decisive findings:
(1) the console warning's substituted args are `HotReload App App` — the *updated*
component is Next's dev-only `HotReload` (Fast Refresh) boundary, not App; a genuine
App-owned render-phase set would read "App while rendering App" and React would not
escalate. (2) The throw is caught by the dev `NotFoundErrorBoundary` which "recreates the
tree from scratch" and the studio then renders normally (canvas 1080×1350, buffer sized).
(3) The bug is an extremely tight race: adding any synchronous work to the top of App's
render made it vanish (a Fast Refresh/compile-overlap Heisenbug). (4) A scoped scan of
App's render body and every `hooks/*.js` body found no genuine render-phase setState
(the flagged sites are all inside `useEffect`/`useCallback`/callback args — confirmed by
reading). (5) **The isolated production build renders `/generate` cleanly across repeated
empty-storage hard reloads — zero console errors, canvas present.** Production has no
`HotReload`/Fast Refresh, so the artifact cannot occur there. Lesson recorded: the prior
session's "HTTP 200" was server-side only; HTTP 200 does not prove the client renders.
This log adds client-side render verification in BOTH dev and a production build.

**Fix — six-format preview strip rendered no thumbnails (client defect #2).** Root cause:
the editorial (`text_post`/quote/event copy) render branch computed
`renderTruth.deadRoles` with an unguarded read `!_roleB[role]`, but `_roleB` is `null` in
offscreen renders (`const _roleB = live ? {} : null;`). Every offscreen format-preview
render therefore threw `TypeError: Cannot read properties of null (reading 'hero')`,
swallowed per-format, so `onThumbnail` never fired for editorial designs while the
separate readiness path still reported "all 6 ready" (checkmarks, no images). photo_logo
designs use a different `deadRoles` path and were unaffected — which is why a warm sample
(photo_logo) showed 6 thumbnails but a landing text post showed 0. Fix: guard the read
(`_roleB ? …filter(!_roleB[role]) : []`) — live behaviour identical, offscreen yields the
same `[]` it effectively produced via the swallowed throw, without crashing. Second cause:
`useFormatPreviewQueue`'s effect depended on `renderScene`/`computeReadyAll`, both rebuilt
every render, so every unrelated re-render (post-generate harmonizer/first-shot storm)
cancelled the in-flight idle queue and restarted at dimension 0 — the first few formats
rendered and the rest never did (production stalled at 3/6, "Checking every format…").
Fix: read the render fns through a ref (M1) and key the effect on the stable
`designFingerprint` signature so only real design changes re-run it. Verified: text-post
landing handoff renders 6/6 thumbnails and regenerates on edit, in **dev AND the
production build**; no jank change to the idle/gesture behaviour.

**Fix — partial copy painted (client defect #1, invariants 2 + 3).** Repro: a landing
handoff with subtext `"We are so grateful for our community of families and educators"`
stored+painted the stump `"We are so"`. Stored-vs-painted trace: the copy-repair path in
`applyDesignPatch` ran `fitCopyClient(field, computeCopyBudgets(...).subtext)`; the
editorial_split support slot holds ~1 short line, so the budget (~9 chars) forced the
deterministic trim to a mid-phrase word-cut, and that stump was **stored** (so
stored===painted===stump — a copy-repair trim produced the fragment, not a render clip).
Fix at the application boundary: when the fit lands mid-phrase AND collapses below a
meaningful length (<4 words or <16 chars), keep the AUTHORED copy verbatim and let the
renderer's own complete-or-absent logic decide. Verified after fix: stored subtext is the
full authored sentence; the renderer drops the over-long role (`deadRoles:["support"]`,
painted = absent) into the advisor remedy flow. No stump is stored or painted.

**R1.6 element table (real canvas clicks / taps, live hit-testing, not the driver):**

| Element | Clicked at (design → CSS px) | Result |
|---|---|---|
| Title (hero) | roleBounds.hero centre | inspector opens, `hero` input focused |
| Caption (support) | roleBounds.support centre | inspector opens, `support` input focused |
| Date | roleBounds.date centre | inspector opens, `date` input focused |
| Eyebrow/label | roleBounds.eyebrow centre | inspector opens, `eyebrow` input focused |
| Pill/button | roleBounds.pill centre | inspector opens, `pill` input focused |
| Background | interior empty band | inspector head "BACKGROUND" |
| Logo | logoBox centre | inspector head "LOGO" |
| Photo | photo region | no inspector/chrome via click OR `__woSelectElement('photo')`; `photoBox` was null — appears to be an archetype photo treatment with no distinct selectable `mediaObject`. NOT verified (needs a design with a real uploaded/generated media object). |
| Shape / furniture rule | — | NOT verified (no shape/rule present in the test design; no exposed add-shape driver). |

- Keyboard movement: select hero, ArrowRight ×3 → hero.x +10.8px, support.x +0.0px (only
  the selected element moved). One `__woUndo` restored hero.x to the original (one undo
  entry per burst). ✓
- Mobile 375×812: tap-select hero → `hero` input focused; tap-select support → `support`
  input focused; inspector opens both times. ✓
- Panel stability (client defect #3): the inspector stayed open across ~15 consecutive
  selections/edits with no glitch-off whenever the dev crash did not fire; the glitch is a
  manifestation of the dev-only error-boundary remount, not a separate panel-close bug.
  **[CORRECTED 2026-07-15 — see §9.16.](this conclusion was wrong.)** There IS a genuine,
  separate panel-close bug that reproduces in a clean production build: the document
  click-outside-to-deselect handler failed to exclude the inspector's DOM subtree, so
  clicking a control *inside* the panel (one that does not itself re-select — e.g. a colour
  swatch, a size button, a text field) cleared the selection and unmounted the panel. The
  "~15 consecutive selections stayed open" reading here was a false negative: those were
  *selection/edit* actions that either land on the canvas or re-select via a rail chip
  (which immediately re-opens the panel), so they masked the defect. §9.16 documents the
  root cause, the production repro, and the fix.

**Non-paid release gate battery (final tree, with the two fixes above):**
- `npm run test:unit`: 49/49 pass.
- `git diff --check`: clean.
- Isolated production build (`WO_DIST_DIR=.next-gate next build`): exit 0, "Compiled
  successfully", 24/24 static pages, `/generate` route present.
- `/generate`: HTTP 200 AND renders (canvas 1080×1350, 6/6 format thumbnails, zero console
  errors) on both the port-3001 dev server and the isolated production build.

**Not verified / held:** R8.5 resident sweep (paid — held for explicit client approval);
photo, shape, and furniture-rule canvas-click selection (see table). No commit, push, or
`git checkout/reset/stash` was performed — the R0–R8 refactor plus these fixes remain
uncommitted in the working tree for the orchestrator to commit after gates pass.

### 9.15 Verification log — R1.6 photo canvas-selection regression fix (2026-07-15)

Interactive verification ran in a real browser against the live port-3001 dev tree
(hot-reload). Harness mode was held on; no photo generation and no paid assistant traffic
were triggered. This closes the last open R1.6 element from §9.14's table — the bare-photo
canvas hit target — using a design carrying a REAL media object (editorial_split, session
photo in the right-side panel). The other elements were re-confirmed by the orchestrator
this dispatch (all five text roles, background, logo, canvas-shape/rail-furniture,
keyboard-move + single undo, mobile taps); only Photo remained.

**Root cause — refactor regression, NOT the inherited hit-target weakness.** The renderer
already emits the `photo:primary` scene element with its painted bounds (§5.3), and the
design carried a real media object, so the "photoBox null in truth" note in §9.14 was that
session's medialess test design, not this defect. The real cause was one layer up: the R7.2
extraction of `InspectorWorkspace` into its own component hand-threads a `workspace` prop
object, and that object dropped `mediaObj`, `imageObj`, and `videoObj` (plus `heroRegister`
and `logoHidden`). Inside `InspectorWorkspace` these destructured to `undefined`, so
`hasMedia = !!mediaObj` was false even while a real photo was painted. `useInspectorModel`
therefore omitted the Photo element from `activeElements`, and its guard effect
(`if (!activeElements.some(e => e.key === inspectorElement)) closeInspector()`) closed the
inspector the instant a photo selection routed to it — matching "clicking the pure photo
area closes the inspector entirely." Fiber inspection confirmed the delivered `workspace`
object had no `mediaObj`/`imageObj`/`videoObj` keys while `logoObj` was present, which is
exactly why Logo passed and Photo did not. A parallel-ownership prop drop of the class the
refactor exists to eliminate — inherited pre-refactor behaviour read `mediaObj` from the
same scope and routed correctly.

**Fix (at the cause).**
- `components/Generator.jsx` — thread `heroRegister, imageObj, logoHidden, mediaObj,
  videoObj` into the `InspectorWorkspace` `workspace` prop (the primary fix; the media
  keys restore truthful photo routing, the other two repair latent inspector reads in the
  same dropped surface).
- `lib/editor-input-controller.mjs` — `resolveScenePointerTarget` now resolves a bare-photo
  click to `{ kind:"photo" }` from the painted photo bounds (tight, no minSize/padding),
  after text/furniture, logo, and shapes. This closes the invariant-9 / §5.5 gap so canvas
  hit-testing consumes the same scene-element geometry the renderer paints, instead of a
  parallel photo-window computation.
- `hooks/useCanvasGestures.js` — a scene-graph photo hit (or the geometric window test)
  selects the photo and starts the existing photomove drag; pan behaviour is unchanged.
- `scripts/tests/editor-input-controller.test.mjs` — pure tests for photo resolution,
  occluding-shape hit-order, and fall-through to background.

**Evidence (real canvas clicks / taps, live hit-testing).**

| Element | Result |
|---|---|
| Photo (bare, top-right of the right-panel photo) | inspector head "PHOTO", MediaInspectorPanel (Library / Upload), photo selection chrome drawn; the Photo chip now appears in the element rail |
| Photo via `__woSelectElement('photo')` | PHOTO panel opens (previously closed the inspector) |
| Shape moved over the photo (buffer centre 961×297) | shape-covered point → SHAPES; a bare-photo point below it → PHOTO (hit-order preserved) |
| Photo drag / pan | photomove shifted the painted photo (region checksum 33652071 → 34484255) and moved `media.formatTransforms.ig_portrait` cx 0.662 → 0.523 / cy 0.588 → 0.559, selection staying PHOTO — no drag/pan regression |
| Mobile 375×812 touch tap on the bare photo | PHOTO |
| Text / Logo / Background re-check | Title / Logo / Background still route (the collateral `heroRegister` / `logoHidden` props are now defined) |

**Non-paid release gate battery (final tree, with this fix):**
- `npm run test:unit`: 52/52 pass (49 prior + 3 new photo scene-element tests).
- `git diff --check`: clean.
- Isolated production build (`WO_DIST_DIR=.next-r16-gate next build`): exit 0, "Compiled
  successfully", 24/24 static pages, `/generate` route present.
- Port-3001 dev server hot-reloaded the change with a clean console (zero errors).

**Not verified / held:** R8.5 resident sweep (paid — held for explicit client approval).
No commit, push, or `git checkout/reset/stash` was performed — the R0–R8 refactor plus this
fix remain uncommitted in the working tree for the orchestrator to commit after gates pass.

### 9.16 Verification log — inspector panel closes on click-inside (client defect #3, real bug) (2026-07-15)

Client re-reported after §9.14/§9.15 landed: "when I click on right panel, right panel still
closes instead of editing elements." §9.14 had attributed the panel glitch to the dev-only
Fast Refresh error-boundary remount (§9.14 "Panel stability") and did not patch it. **That
conclusion was wrong** — this is a genuine, deterministic bug that reproduces in a clean
production build. §9.14's paragraph is corrected in place.

**Root cause — the click-outside-to-deselect handler does not exclude the inspector subtree
(`hooks/useEditorGlobalEffects.js:17-23`, pre-fix).** The document-level capture-phase
`pointerdown` listener deselects on any click that is not inside the canvas shell:
`if (shell && !shell.contains(event.target)) { clearSelection(); … }`. The contextual
inspector is a flex *sibling* of the canvas shell (`Generator.jsx` render tree, comment at
the `{inspectorWorkspace}` mount), **not** a descendant — so a `pointerdown` on any control
inside the panel satisfies `!shell.contains(target)` and fires `clearSelection()`
(`dispatchEditorSelection({type:"clear"})`). Since the canonical-document refactor unified
inspector-open state into the selection reducer —
`inspectorEl = selectionInspectorKey(editorSelection)` (`Generator.jsx:5878`) — clearing the
selection now sets `inspectorEl = null`, which unmounts the panel. Pre-refactor the same
handler cleared three *canvas-highlight* flags only (`setTextSelected(false)`,
`setPhotoSel(false)`, `setOverlayChromeVisible(false)` — see `0885cb9^:Generator.jsx:5195`)
and did not touch inspector-open state, so the identical missing-exclusion bug was latent
and harmless; the refactor's state unification is what made it fire.

**Why the earlier dev-only diagnosis missed it.** (1) §9.14 tested panel stability with
*selection/edit* actions, which either land on the canvas (inside the shell → no deselect)
or re-select through a rail chip (its `onClick` re-selects on the same gesture, immediately
re-opening the panel), both of which mask the defect. The controls that expose it are the
ones that mutate the *current* element without changing selection — a colour swatch, a
size button, a text field. (2) A real dev-only warning ("Cannot update a component (App)
while rendering a different component") was co-present and plausibly swallowed the symptom.
The two are unrelated: the panel-close is pure event-handler logic, independent of Fast
Refresh, and reproduces in production.

**Instrumented repro (live, harness mode on, `NEXT_PUBLIC_WO_TEST_HOOKS=1`).** A capture-phase
`pointerdown` probe recorded, for a click on a Background colour swatch:
`{ targetTag:"BUTTON", closestInspector:true, closestShell:false, inspectorInDoc:false }` —
i.e. the target is inside the inspector subtree, outside the canvas shell, and the panel was
already gone. In dev the unmount flushes synchronously during the discrete event (native
listener → non-batched reducer dispatch); in the production build it flushes on the next
tick (`openSameTick:true → openNextTick:false`) — same symptom, later flush.

| Build (isolated dist) | Action: click a colour swatch **inside** the open Background panel | Panel |
|---|---|---|
| Dev (port 3000, pre-fix) | probe shows `closestInspector:true / closestShell:false`, `inspectorInDoc:false` | **closes** (bug) |
| Prod `.next-panel-bug` (unfixed, port 3211) | `openBefore:true`, `openSameTick:true`, `openNextTick:**false**` | **closes** (bug reproduces in production — disproves §9.14) |
| Dev (port 3000, post-fix) | 15 consecutive interactions: 4 bg swatches, rail→Photo/Caption/Shapes/Logo/Background, text-input focus+type, SIZE S/L, colour swatch, MORE OPTIONS | **stays open**; a title text-edit rendered "QA PANEL TEST TITLE" to canvas (edit applies) |
| Prod `.next-panel-fix` (fixed, port 3211) | swatch → `openNextTick:true`; +3 more swatches + MORE OPTIONS | **stays open**; zero console errors |

**Fix (at the cause).**
- `lib/editor-input-controller.mjs` — new pure predicate `pointerClearsSelection({withinCanvasShell, withinInspector})`: a pointerdown deselects only when it is inside neither the canvas shell nor the inspector subtree. Placed alongside `resolveScenePointerTarget` (this file already owns "so canvas clicks, inspector selection … cannot drift apart").
- `hooks/useEditorGlobalEffects.js` — the document `pointerdown` handler now computes
  `withinInspector = target.closest(".wo-inspector")` and delegates the deselect decision to
  `pointerClearsSelection`. Canvas-internal clicks and the mobile bottom-sheet backdrop
  (`.wo-inspector-backdrop`, outside `.wo-inspector`, its own `onClick=closeInspector`) are
  unchanged; the rail chips live inside `.wo-inspector` so they are covered too.
- `scripts/tests/editor-input-controller.test.mjs` — 3 pure tests: inside-shell → no
  deselect; inside-inspector (outside shell) → no deselect (the regression guard); empty
  chrome/backdrop → deselect.

**Gate battery.**
- `npm run test:unit`: **55/55 pass** (52 prior + 3 new).
- Isolated production build with the fix (`WO_DIST_DIR=.next-panel-fix next build`): exit 0,
  "Compiled successfully".
- No layout/paint path touched (event-handler exclusion + pure predicate), so the born-clean
  battery does not apply.

**Not verified / held:** R8.5 resident sweep (paid — held). No push. The fix is committed
locally via `safe-commit.sh` with explicit pathspecs.

### 9.17 Verification log — the Shapes rail chip was dead (second layer under §9.16) (2026-07-15)

Client re-reported immediately after §9.16 landed: "the shape pill in the panel cannot be
clicked." Reproduced with a real pointer click on the **Shapes rail chip** inside the open
inspector: the whole panel closed instead of opening the Shapes home. All other pill-like
controls in the panel passed a `document.elementFromPoint` sweep (no overlay interception)
and worked.

**Not a 90ee24c regression — event-sequence proof.** A capture-phase probe on the real
click recorded: `pointerdown` on the chip with `insideInspector:true` and the panel still
in the DOM (so the §9.16 handler correctly skipped deselect and suppressed nothing), then
`pointerup` and `click` both delivered to the chip, and the panel closed only AFTER the
click. The close comes from the chip's own `onClick`, one layer deeper.

**Root cause — `lib/editor-selection.mjs` `selectionForElement` (the shape branch, pre-fix
`(kind === "overlay" || kind === "shape") && uid`).** The Shapes home chip fires
`selectElement("shape")` with NO layer uid (`ContextualInspector` `onSelect` →
`Generator.jsx` `selectElement` → `dispatchEditorSelection({type:"select-element",
kind:"shape"})`). `selectionForElement("shape", null)` matched no branch and returned
`null`, so the reducer stored a **null selection** → `inspectorEl =
selectionInspectorKey(null) = null` → the panel unmounted. Pre-refactor,
`selectElement("shape")` ended in `setInspectorEl("shape")` (see `0885cb9^:Generator.jsx`
~3675) — the Shapes home opened without any layer uid; the 0885cb9 selection unification
dropped that uid-less mapping. **Classification: pre-existing regression from 0885cb9**
(`git show 0885cb9:lib/editor-selection.mjs` and `90ee24c:` show the identical branch;
90ee24c never touched this file). It was fully masked until 90ee24c because the
click-outside bug closed the panel at `pointerdown` for every panel control — fixing the
first layer exposed the second. M2 Silent No-op class: the chip acted, changed nothing
visible, and reported nothing.

**Fix (at the cause).** `selectionForElement` now returns `{ type: "shape" }` (a valid
id-less shape selection — `normalizeEditorSelection` keeps it, `selectionInspectorKey` →
`"shape"` routes to the Shapes home) when kind is `"shape"` with no uid. A specific layer
uid still selects that layer; a bare `"overlay"` without uid stays a no-op as before.
Consumers checked: `selOverlay` → null (home, no layer selected), `overlayChromeVisible`
is only consumed together with `selectedRenderedElement?.type === "shape"` which stays
null (`selectionSceneId` → `"shape:primary"` matches no painted shape), and the
`useInspectorModel` guard keeps `"shape"` in `activeElements`. Pure test added
(`scripts/tests/editor-selection.test.mjs`): the home chip resolves to an id-less shape
selection via both `selectionForElement` and the reducer; layer-uid and bare-overlay
behaviour unchanged. `npm run test:unit`: **56/56 pass**.

**Evidence (real pointer clicks, dev port 3000 + isolated production build).**

| Action | Before fix | After fix |
|---|---|---|
| Click ✦Shapes chip in the open panel | panel **closes** (dev, real click; probe shows close after `click`, not `pointerdown`) | Shapes home opens ("Shapes on this design… ＋ Add shape") |
| `__woSelectElement('shape')` driver path | same null-selection close | Shapes home opens |
| ＋ Add shape → pick "Spark" | unreachable | Spark layer added AND painted on canvas; panel switches to "EDITING: SPARK" |
| Size pill M | unreachable | active pill flips S→M (edit applies), panel stays open |
| Delete shape | unreachable | layer removed, panel closes (same contract as Remove photo) |
| Full rail sweep Background/Photo/Caption/Logo/Shapes (real clicks) | — | every chip routes to its panel; zero console errors |

Production: isolated build with the fix (`WO_DIST_DIR=.next-shapepill next build`) — Shapes
chip opens the Shapes home (see build/verify notes in this entry's commit).

### 9.18 Verification log — R8.5 resident release gate (paid smoke sweep) (2026-07-15)

**GATE VERDICT: PASS.** Rule applied: a NEW regression is any journey/oracle that PASSED
in the pre-refactor 2026-07-14 baseline and FAILS now. **None exists.** Every difference
vs baseline is either a fix or a pre-existing (equal-or-improved) failure, so the R8.5 gate
passes and the checklist item is ticked. The sweep certified this exact tree (local `main`
at `5de2440`, 3 commits ahead of origin: `0885cb9` R0–R8 + `90ee24c` + `5de2440`).

**Run setup (matches the operating manual's Money rules — zero credits by construction).**
Isolated production build `WO_DIST_DIR=.next-r85 NEXT_PUBLIC_WO_TEST_HOOKS=1 next build` —
exit 0, "Compiled successfully", 24/24 static pages, `/generate` present; the `__woReadyCheck`
oracle string is present in the prod bundle (test hooks compiled in, so the tester's oracles
survive the prod build — see the gating note below). Sweep: `WO_DIST_DIR=.next-r85 node
scripts/resident-tester/run.js` (SMOKE, `realPhotos:0`) on port 3200. Photo generation fully
mocked: the server launched with the Higgsfield keys unset AND the browser hard-blocks
`platform.higgsfield.ai`. **Safety verified from the run's own `verify` record:**
`higgsfieldCalls:0` (nothing even attempted the host — zero BLOCKED-higgsfield notes, zero
Higgsfield references in `server.log`), `newSessionIds:[]` (cloud sessions 60→60 unchanged),
41 cloud writes intercepted+discarded, 0 real photos. **Actual spend:** 34 assistant calls,
tester's conservative estimate **$0.68** (34 × $0.02); real gpt-4o-mini cost ≈ $0.01–0.02 —
well within the ~$3 approval. One full pass, no retry loops. Wall clock 3.9 min. Report:
`docs/resident-tester/smoke-report-2026-07-15.md`; artifacts under
`scripts/resident-tester/runs/2026-07-15T03-00-09/`.

**Headline counters vs baseline (the PRD §9.13 mandate — compare counters, not just pass rate):**

| Counter | Baseline 2026-07-14 | New 2026-07-15 | Δ |
|---|---|---|---|
| Everyday journeys passed | 6 / 10 | **8 / 10** | +2 |
| Fuzz utterances | 31 | 31 | — |
| Fuzz utterances flagged | 13 | **8** | −5 |
| Total quality flags | 16 | **11** | −5 |
| Distinct issue types | 5 | **2** | −3 |
| Higgsfield / real photos | 0 / 0 | 0 / 0 | — |

**Journey-by-journey / oracle-by-oracle comparison (classification per the dispatch):**

| Journey / oracle | Baseline | New | Classification |
|---|---|---|---|
| landing→generate | ✅ | ✅ | unchanged pass |
| born-clean after generate (live) | ✅ | ✅ | unchanged pass |
| chat edit (wisteria) | ✅ | ✅ | unchanged pass |
| canvas click → inspector | ✅ | ✅ | unchanged pass |
| every element clickable (dead-click hit-test) | ⚠️ 3 dead roles (eyebrow/hero/support) | ✅ all clickable | **FIXED** (per-element hit targets, §9.14/§9.15) |
| + Add caption renders | ⚠️ no render delta | ✅ caption landed via chip | **FIXED** |
| Posts/History present | ✅ | ✅ | unchanged pass |
| undo reverts | ✅ | ✅ | unchanged pass |
| format switch ×N | ⚠️ **0 formats detected** | ⚠️ strip-Y jump on wide formats | still-failing (pre-existing) — see note A |
| Export → Ready checklist | ⚠️ export menu did not open | ⚠️ export menu did not open | still-failing (pre-existing) — see note B |
| fuzz: claim-vs-changed (silent false claim) | 2 (date; mauve) | **0** | **FIXED** (renderTruth honesty) |
| fuzz: honesty walk-back | 2 (too much green; title bigger) | **0** | **FIXED** — both now apply a real change |
| fuzz: born-clean (contrast/thumb-legibility, wide formats) | 10 | **8** | still-failing (pre-existing), improved −2 |

No oracle went PASS→FAIL; the only fuzz issue type that survives is born-clean, which is
the SAME pre-existing category (contrast-fail / thumb-legibility on twitter/facebook/banner),
reduced 10→8. The two trust-critical fuzz classes the refactor targeted — silent false
claims and honesty walk-backs — dropped to **zero**.

**Note A — format-switch strip-Y jump is pre-existing in-flow layout, NOT a refactor
regression, and NOT a NEW regression vs baseline.** The baseline flagged this journey for a
DIFFERENT reason: `.generator-format-strip button[aria-pressed]` matched nothing, so it
switched **0 formats** and the strip-Y-stable oracle never ran. On this tree the strip is
exercised and the oracle now fires: switching to the wide/short formats moves the strip's top
(Twitter −59px, Facebook −89px, Banner −247px vs a 737 baseline). Root cause is inherent
layout, not the refactor: `.generator-format-strip` is an **in-flow** element
(`style={{width:"100%",maxWidth:820,marginTop:18}}`) that sits BELOW the canvas and reflows
upward when the canvas shrinks for a wide aspect ratio. `git show 0885cb9^:components/Generator.jsx`
shows the strip markup is **byte-identical** pre-refactor — the same in-flow `marginTop:18`
container — so the behavior predates the refactor; the baseline simply couldn't reach it.
Because the journey was RED in the baseline and is RED now, it is **still-failing (pre-existing)**,
not a pass→fail regression. The `strip-y-stable` oracle assumes a fixed toolbar; the actual
surface is an in-flow "every format" preview grid, so this is best read as an oracle/contract
mismatch. NOT patched this dispatch (an oracle-semantics judgment, not a renamed selector;
the operating-manual bar for a tester change — headful re-run + sabotage-proof — was not met).

**Note B — Export "menu did not open" is a pre-existing tester-harness/flow limitation,
identical to the baseline, NOT a refactor regression.** The `.wo-export-cta` button exists
with the correct class and visible text "Export ▸" (`Generator.jsx:8265`) and IS in the
tester's `openGlobalControl` selector set, and the popover contains the readiness checklist.
The scripted J6(Posts)→J7(Export) sequence fails to open it in the headless 1440×900 sandbox
(below-canvas CTA; this run J6 opened a 122-tile Posts gallery where the baseline had none).
The failure string is byte-identical to the baseline, so it is stable and pre-refactor. NOT a
renamed-selector case, so not trivially fixable in the tester; reported as a future
tester-harness improvement, not patched.

**Test-hook gating (the prior agent's flag — "prod builds don't expose `__wo*` despite
NEXT_PUBLIC_WO_TEST_HOOKS=1").** Partly true but harmless for the sweep. The **oracle** hooks
the smoke tester actually reads — `__woReadyCheck` (`Generator.jsx`, gated on `TEST_HOOKS`),
`__woTruth`/`__woRoleBounds` (`useVerificationDrivers`, gated on `testHooks`), and
`__woBornCleanGuard` (`useRenderVerificationBoards`, gated on `testHooks`) — DO survive a
`NEXT_PUBLIC_WO_TEST_HOOKS=1` prod build and were present this run. Only the **dev-only
drivers** (`__woSelectElement`, `__woApplyPatch`, `__woUndo`, `__woSetArchetype`, …) are gated
on `devHooks = NODE_ENV!=="production"` and are correctly absent from any prod build. The
smoke journeys drive the UI with **real pointer clicks**, not those drivers, so they do not
depend on them (the dev-gated drivers were the R1.6 interactive-verification path in §9.14–17,
run against the dev tree). The documented tester target — build with `NEXT_PUBLIC_WO_TEST_HOOKS=1`,
which `package.json test:resident` does — is correct; nothing needed changing to get the sweep
running.

**Gate battery (final tree).**
- `npm run test:unit`: **56/56 pass**.
- Isolated production build (`WO_DIST_DIR=.next-r85 NEXT_PUBLIC_WO_TEST_HOOKS=1 next build`):
  exit 0, "Compiled successfully", 24/24 static pages, `/generate` present.
- Resident smoke sweep: 8/10 journeys, 11 flags / 2 issue types, 0 credits, 0 cloud writes,
  ~$0.68 est spend — **no NEW regressions vs baseline → gate PASS**.

**Not done (by direction):** no push (local `main` stays 3 ahead of origin); no nightly probe;
no real-photo generation; the two still-failing journeys (format strip-Y oracle mismatch,
Export harness flow) are reported for follow-up, not patched.
