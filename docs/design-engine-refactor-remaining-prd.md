# Design Engine Refactor — Remaining Work PRD

**Status:** Draft for review  
**Owner:** Product + Engineering  
**Created:** 2026-07-22  
**Related documents:** `refactor-prd.md`, `design-layer-contract.md`,
`engineering-principles.md`  
**Execution style:** Incremental, behaviour-preserving checkpoints  
**Current implementation area:** DLC-2 through DLC-7, with primary work in DLC-6

## 1. Executive summary

The editor now has a canonical design document, typed commands, shared history,
format inheritance, render results, a unified advice ledger, and substantially cleaner
workflow orchestration. The current refactor has also moved important layout decisions
out of `Generator.jsx`, including:

- archetype format cascading, variants, and materialization;
- photo-seam and decorative-shape collision policy;
- headline fitting, width-fill, orphan repair, and readable floors;
- headline/support/eyebrow rhythm;
- safe-margin and intentional-bleed geometry;
- missing-role synthesis and focal-aware message-pill movement;
- schedule-row planning;
- complete-or-absent caption survival.

The architecture is improved but not finished. `Generator.jsx` remains approximately
9,166 lines because the Canvas renderer, compatibility layer, placement solvers, and
some product orchestration still share one file. Several painter-specific branches still
make layout or accessibility decisions while drawing. Verification coverage is strong at
the pure-module level, but the full browser guard battery must be restored and rerun
against the live compiled application.

This PRD defines the remaining work needed to reach a design engine that is deterministic,
testable, brand-governed, and safe to extend into a multi-brand AI-native platform.

## 2. Product outcome

After this work, a generated or edited design should follow one predictable path:

```text
Campaign intent / user gesture
          ↓
AI proposal or UI intent
          ↓
Validated semantic commands
          ↓
Canonical DesignDocument
          ↓
Format + layout + layer policy solvers
          ↓
Paint-ready RenderPlan
          ↓
Canvas painter
          ↓
RenderResult + constraint evidence
          ↓
One advisor/readiness/export decision
```

The Canvas painter may measure and paint. It must not independently decide which content
to remove, where a semantic role belongs, which brand rule wins, or whether a violation
is acceptable.

## 3. User-facing outcomes

The refactor is successful when users experience the following:

1. Text, logos, images, structural frames, and decoration do not unexpectedly compete.
2. Changing format, template, or media produces a valid first result without surprise
   movement of explicitly pinned elements.
3. Stored text and painted text always agree; copy is complete or visibly omitted with a
   useful remedy.
4. Clicking any visible element opens the correct inspector and selection bounds.
5. Accessibility and brand guidance point to the actual rendered element and offer a
   useful repair, edit path, or permissioned approval.
6. Undo, templates, sessions, exports, and multi-format previews reproduce the same design.
7. AI can suggest freely but can only commit changes allowed by the same rules as the UI.

## 4. Current baseline

### 4.1 Completed foundations

- `DesignDocumentV1` is the canonical serialisable state.
- Editable changes use semantic command workflows rather than direct component setters.
- Undo/redo snapshots store canonical document state plus minimal view context.
- Selection and scene identities are shared across Canvas, inspectors, and hit testing.
- Format inheritance is consistent across text, logo, image, and shapes.
- Layer contracts exist for layout, content/typography, media/logo, surfaces, decoration,
  and readiness.
- Render results expose measured geometry and normalized findings.
- Local and AI findings converge through one advice ledger.
- Export authorization consumes readiness policy rather than inventing another status.
- Production builds pass and the latest live `/generate` smoke check showed no runtime or
  reference error.

### 4.2 Latest verification evidence

- Last complete unit-suite run: **300/300 passed**.
- Additional focused tests added afterward for schedule and caption policy: passing.
- Latest production build: passing across all 24 routes.
- Latest browser smoke check: `/generate` loaded normally on port 3001.
- No commit or push is included in this PRD.

### 4.3 Known incomplete areas

- `Generator.jsx` still contains the main legacy Canvas renderer and several placement
  or surface decisions.
- Date and rescued-eyebrow placement still construct candidate ladders inside the painter.
- Message-pill geometry and some full-bleed backdrop planning remain renderer-local.
- Photo-frame and structural-shape paint-job construction remains mixed with painting.
- Furniture collision/placement retains renderer-specific policy.
- Some compatibility adapters still obscure the intended `RenderPlan` boundary.
- DLC-2 through DLC-6 contain started-but-not-closed checkpoints.
- The isolated browser verification hooks were compiled, but the previous attempted run
  observed cached tabs after localhost processes changed. The guard harness needs a clean,
  reproducible launch and proof that the hooks are available in the page execution world.
- The prior `shape_cutout` Twitter/Facebook seam-straddle result must be rerun against the
  extracted alpha-aware structural detector. It is not yet classified as a confirmed
  defect or a confirmed false positive.

## 5. Scope

### In scope

- Finish the Design Layer Contract implementation.
- Establish an explicit paint-ready `RenderPlan` between policy solvers and Canvas.
- Remove remaining semantic decisions from Canvas drawing branches.
- Centralize placement policy for every text role and furniture item.
- Consolidate post-render evidence and readiness decisions.
- Delete compatibility paths once migration and pixel-equivalence evidence exists.
- Restore deterministic browser verification and complete the release guard battery.
- Update architecture documentation and resume instructions after every checkpoint.

### Out of scope

- New AI generation features.
- A visual redesign of the editor.
- Replacing Canvas 2D with SVG, WebGL, or a third-party design SDK.
- Multi-tenant workspace, permissions, billing, or publishing implementation.
- Silent learning or automatic modification of brand policy.
- Paid resident or AI test traffic without explicit approval.

## 6. Workstreams and checkpoints

## Phase A — Close and verify the current extraction

### A1. Verification baseline

- [ ] Run the complete unit suite after the latest placement/support modules.
- [ ] Run `npm run test:contract`.
- [ ] Run the production build.
- [ ] Run `git diff --check`.
- [ ] Reload `/generate` and verify no runtime/reference error.
- [ ] Verify New post → edit → undo → redo → format switch → export-panel open.

**Exit criteria:** all non-paid checks pass from the same working tree.

### A2. Restore the browser guard harness

- [ ] Start an isolated build with `NEXT_PUBLIC_WO_TEST_HOOKS=1` and a dedicated dist dir.
- [ ] Confirm the browser is connected to the live process rather than a cached shell.
- [ ] Make guard invocation independent of browser isolated-world limitations.
- [ ] Run `__woArchStress`, `__woBornCleanGuard`, and `__woLegacyDupGuard`.
- [ ] Record compact results and the exact build hash/configuration.
- [ ] Stop the isolated server after evidence is captured; preserve normal localhost.

**Exit criteria:** every guard is callable through one documented command or resident-test
entry point and produces reproducible output.

### A3. Resolve the 112/114 seam-straddle question

- [ ] Reproduce the `shape_cutout` Twitter/Facebook cells with fixed copy and inputs.
- [ ] Compare structural alpha samples, semantic zone rectangles, and rendered pixels.
- [ ] Determine whether text genuinely crosses a painted/unpainted surface boundary.
- [ ] If genuine, fix layout placement through the solver.
- [ ] If false, correct the structural relation test without weakening true positives.
- [ ] Add a permanent regression fixture for both affected formats.

**Exit criteria:** classification is evidence-backed, both cells pass for the right reason,
and no existing true seam-straddle fixture is suppressed.

## Phase B — Finish the render-plan boundary

### B1. Universal semantic-role placement

- [ ] Extract the date candidate ladder from the Canvas painter.
- [ ] Extract rescued-eyebrow candidate generation and obstacle construction.
- [ ] Share safe areas, focal regions, hard obstacles, soft obstacles, and relation order.
- [ ] Preserve owner-frozen role behavior: position never changes silently.
- [ ] Return explicit placement outcomes: placed, preserved pin, or intentionally absent.

**Acceptance criteria:** date and eyebrow placement can be tested without DOM or Canvas
painting; Canvas receives final coordinates, font choice, ink, and optional backing only.

### B2. Surface and message-pill planning

- [ ] Extract message-pill rectangle, padding, corner radius, and content-envelope logic.
- [ ] Use the shared caption-survival plan for pill sizing, backdrop union, and final draw.
- [ ] Extract photo-label gradient intent as a surface treatment plan.
- [ ] Make the single-backdrop invariant explicit in the render plan.
- [ ] Preserve pinned ink verbatim and report low contrast instead of silently reverting it.

**Acceptance criteria:** one text block produces one resolved surface and one ink decision;
no renderer branch computes a competing caption or contrast outcome.

### B3. Media and structural-frame paint jobs

- [ ] Convert card, shape-mask, petal-mask, and explicit frame layers into ordered paint jobs.
- [ ] Resolve the media host before painting.
- [ ] Return photo window, crop transform, structural boundary, and obstacle geometry from
  the same job definition.
- [ ] Keep alpha decoding and actual draw calls in Canvas adapters.
- [ ] Remove duplicate override-render shape synthesis from post-render auditing.

**Acceptance criteria:** painting, hit testing, subject projection, and constraint evidence
consume the same structural job identities and geometry.

### B4. Furniture and decoration planning

- [ ] Extract furniture instance normalization and stable keys.
- [ ] Plan index, badge, underline, rule, and counterweight placement before drawing.
- [ ] Enforce decoration budgets and collision ownership outside Canvas.
- [ ] Preserve user-hidden/color/width overrides and inspector identities.

**Acceptance criteria:** furniture is selectable, reproducible, and unable to create a
second unofficial placement system.

### B5. Introduce `RenderPlanV1`

Define a serialisable or inspection-friendly plan shaped approximately as:

```js
{
  dimension,
  surfaces: [],
  mediaJobs: [],
  structuralJobs: [],
  textJobs: [],
  markJobs: [],
  decorationJobs: [],
  furnitureJobs: [],
  protectedZones: [],
  expectedSceneElements: [],
  controlledAbsences: [],
}
```

- [ ] Create plan schema and validation.
- [ ] Build it from `RenderModelV1` plus decoded asset metadata.
- [ ] Make Canvas paint in canonical z-order from this plan.
- [ ] Make `RenderResult` reconcile actual measurements against planned jobs.
- [ ] Keep temporary legacy adapters only where pixel-equivalence is not yet proven.

**Exit criteria:** the main Canvas painter is an executor of a plan, not an owner of
cross-layer policy.

## Phase C — Complete contracts, readiness, and command architecture

### C1. Close DLC-2 constraint-engine coverage

- [ ] Map every blocking renderer finding to a stable contract `ruleId`.
- [ ] Remove remaining duplicate legacy counters once shared constraint evidence exists.
- [ ] Ensure each blocker declares a real command, policy remedy, approval path, or direct
  edit destination.
- [ ] Verify one violation produces one ledger row across all six formats.

### C2. Close DLC-4 layer contracts

- [ ] Remove remaining duplicated typography, media, logo, surface, and decoration constants.
- [ ] Confirm every layer has one owner for geometry, color, visibility, and provenance.
- [ ] Add cross-layer fixtures covering logo/text, logo/subject, text/frame, decoration/text,
  decoration/subject, and backdrop/structural-shape interactions.

### C3. Close DLC-5 readiness policy

- [ ] Verify technical, accessibility, brand, channel, and approval states independently.
- [ ] Ensure acknowledgement never masquerades as approval.
- [ ] Ensure current-format and all-format export authorization are correct.
- [ ] Remove every remaining “Keep it this way” dead end for a blocking issue.

### C4. Close DLC-6 commands and compatibility

- [ ] Ensure assistant output compiles only to semantic commands and typed effects.
- [ ] Remove compatibility operations after their lossless command representation exists.
- [ ] Remove retired aliases and stale component-local writable paths.
- [ ] Document every intentionally retained adapter with a deletion checkpoint.

**Exit criteria for Phase C:** DLC-2, DLC-4, DLC-5, and DLC-6 can be marked complete in the
Design Layer Contract with tests supporting each claim.

## Phase D — Component and runtime cleanup

### D1. Move renderer code out of `Generator.jsx`

- [ ] Move the render-plan builder into dedicated design-engine modules.
- [ ] Move Canvas painting into a dedicated renderer module.
- [ ] Keep React hooks responsible for lifecycle and publication only.
- [ ] Keep asset decode/cache logic in browser adapters.
- [ ] Reduce `Generator.jsx` to product orchestration and composition.

**Target:** no policy function in `Generator.jsx`; no renderer module imports React.

### D2. Performance and cancellation

- [ ] Ensure six-format preview work cancels only on real design changes.
- [ ] Avoid repeated image analysis and repeated plan construction within one design hash.
- [ ] Measure preview, drag, resize, format-switch, and export-plan latency.
- [ ] Keep interaction work inside the agreed responsiveness budget.

Proposed budgets on a representative laptop:

- pointer feedback: under 16 ms per frame;
- inspector reaction: under 100 ms;
- active-format redraw: under 150 ms after a discrete edit;
- six-format preview completion: under 2 seconds without blocking interaction.

## Phase E — DLC-7 release gate

### E1. Automated evidence

- [ ] Full unit suite passes.
- [ ] Contract suite passes.
- [ ] Migration round trips pass for legacy and canonical fixtures.
- [ ] Pixel signatures or approved image diffs cover every archetype × six formats.
- [ ] Born-clean guard passes.
- [ ] Legacy duplicate guard passes.
- [ ] No uncategorized blocking finding remains.
- [ ] Production build passes with no runtime exception.

### E2. Interaction and mobile journeys

- [ ] Click-select every scene-element type and confirm the matching inspector.
- [ ] Drag/resize text, logo, photo, structural shape, decoration, and furniture.
- [ ] Verify one continuous gesture creates one undo entry.
- [ ] Verify mobile inspector opening, scrolling, selection retention, and preview visibility.
- [ ] Verify template apply/save/restore and multi-format override reset.
- [ ] Verify export authorization and successful current/all-format downloads.

### E3. Optional resident and AI tests

- [ ] Request explicit approval before paid assistant traffic.
- [ ] Run the resident suite only after all deterministic gates pass.
- [ ] Compare results with the committed historical baseline.
- [ ] Treat new regressions as release blockers; document accepted deltas.

**Final exit criteria:** DLC-7 is complete, deterministic gates are green, browser journeys
are recorded, and any paid validation has explicit approval and a budget.

## 7. Priorities

| Priority | Work | Why it comes first |
|---|---|---|
| P0 | A1–A3 verification and seam classification | Establishes trustworthy evidence before more extraction. |
| P0 | B1–B2 semantic text/surface planning | Removes the highest-risk duplicated layout and content-survival decisions. |
| P1 | B3–B5 structural jobs and `RenderPlanV1` | Creates the durable engine/painter boundary needed for future brands. |
| P1 | C1–C4 contract/readiness closure | Makes enforcement consistent and explainable. |
| P1 | D1 renderer extraction | Makes the architecture maintainable once behavior is fully characterized. |
| P2 | D2 performance tuning | Optimize after the ownership boundaries are stable. |
| P0 release | E1–E2 deterministic and interaction gates | Required before declaring completion or shipping broadly. |
| Optional | E3 paid resident testing | Useful final evidence, but never substitutes for deterministic tests. |

## 8. Success metrics

### Architecture

- Zero direct editable-state dispatches outside the command/workflow boundary.
- Zero policy functions inside the Canvas painter.
- Zero React imports in design-engine policy or renderer modules.
- Every blocking finding resolves to one contract rule and at least one useful path.
- Every planned/painted element has the same stable scene identity.
- `Generator.jsx` becomes orchestration rather than the location of the design engine.

### Product quality

- Zero stored-versus-painted copy mismatches.
- Zero partial-sentence rendering.
- Zero system-generated logo/text overlaps in born-clean designs.
- Zero false safe-area blockers when measured geometry is clear.
- Zero blocking checklist rows with only acknowledgement as an action.
- All six formats remain reproducible after save, restore, undo, and template reuse.

### Verification

- Unit, contract, migration, build, browser smoke, and interaction gates pass.
- Every archetype × format cell is represented in deterministic render verification.
- Pixel changes are either absent or reviewed and intentionally accepted.

## 9. Risks and controls

### Pixel drift during extraction

**Control:** characterize existing output first, extract without redesign, compare pixel
signatures, and keep a narrow compatibility adapter until equivalence is proven.

### Pure tests pass while browser behavior breaks

**Control:** every phase ends with a real browser journey against a live process, not only
HTTP status or cached UI.

### The new plan becomes a second writable design model

**Control:** `RenderPlanV1` is derived and immutable. It is never persisted as editable
truth and never writes back into `DesignDocument` during rendering.

### Over-aggressive automatic repair overrides users

**Control:** owner pins and approved exceptions remain immutable inputs. Solvers may move
only system-owned variables; conflicts with owner intent become findings.

### Compatibility removal breaks saved work

**Control:** migration fixtures, version checks, telemetry, and a documented rollback path
are required before deletion.

### Refactor expands into feature work

**Control:** visual/product improvements are recorded separately. This PRD changes
ownership and correctness, not the creative direction of templates.

## 10. Definition of done

The remaining refactor is complete only when all of the following are true:

1. `DesignDocument` is the only editable source of truth.
2. Semantic commands are the only mutation path.
3. Layout and layer solvers produce one immutable `RenderPlan`.
4. Canvas executes that plan without owning content, layout, accessibility, or brand rules.
5. `RenderResult` is the only source for scene geometry and measured evidence.
6. The advice ledger and export readiness consume the same normalized violations.
7. Every explicit user pin is preserved and every autonomous result is born-clean.
8. All deterministic, migration, build, browser, mobile, and interaction gates pass.
9. Architecture documents accurately describe the shipped implementation.
10. No unresolved compatibility adapter lacks an owner and deletion checkpoint.

## 11. Exact resume point

Resume at **A1 — Verification baseline**:

1. Run the full unit and contract suites after the latest schedule/support extraction.
2. Run the production build and `git diff --check`.
3. Reload the live editor and verify the short interaction path.
4. Proceed to A2 and restore the isolated browser guard harness.
5. Do not start B1 until the `shape_cutout` seam result has reproducible evidence.
