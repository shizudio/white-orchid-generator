# Type scale — the S/M/L size system

**Status: RATIFIED 2026-07-23.** Owner of: the S/M/L (and legacy xs/xl) size-step
multipliers for every text role and added element, per format family, and the honest
effective-step surface. Subordinate to the Design Layer Contract §12 (typography contract)
and docs/text-elements-spec.md §2 (typography binding). The numbers live as data in
`lib/type-scale.mjs`; this doc is the rationale.

## The complaint

Recurring client report: *"the font sizes (s,m,l) is still not making differences, should
we build a type system? confirm the pixels, which may differ for diff dimension."*

## What the audit found (before)

Driver: `node scripts/tools/type-scale-audit.mjs` (target px per step, pre auto-fit clamp).
It measures the size the table hands the painter — the lever the complaint is about.

Two truths came out of it:

1. **The element step multipliers were NOT the main culprit.** The old element table
   (`{S:0.82, M:1, L:1.25}`) already produced ~22%/25% adjacent target deltas — perceptible
   on paper. The old *legacy* role table had `s:0.85` (only 15% under M — below the
   perceptibility threshold) and `l:1.25`.
2. **The real no-op is the auto-fit / fit-loop capacity clamp.** For copy that fills its box
   (the common headline case), `fitEditorialHeadline` / `fitText` shrink the stepped target
   right back down to whatever the box holds, so S, M and L all paint the **same** size.
   Widening the multiplier does not change that on box-filling copy — the honest fix is to
   *report* the clamp, not hide it.
3. The numbers were **format-blind and scattered** across two files (Generator
   `FONT_SIZE_STEPS` and element-placement-solver `ELEMENT_SIZE_STEPS`) — impossible to
   reason about as one system, and a step that read on a tall portrait was swallowed on a
   wide banner (whose canvas scale `S=min(w,h)/1080` already shrinks everything ~2×).

## The design (after)

A per-class × per-format-family scale table in `lib/type-scale.mjs`. Three families:

| family | formats | rationale |
|---|---|---|
| tall   | ig_portrait, story | vertical room to spread widest |
| square | ig_square | the neutral middle |
| wide   | twitter, facebook, banner | highest S floor — a shrunk step must stay thumb-legible in-feed |

Element / legacy-s·m·l anchors (m and M **pinned at 1.0** in every family):

| family | S / s | M / m | L / l | ΔS→M | ΔM→L |
|---|---|---|---|---|---|
| tall   | 0.78 | 1.00 | 1.34 | 28% | 34% |
| square | 0.80 | 1.00 | 1.28 | 25% | 28% |
| wide   | 0.82 | 1.00 | 1.24 | 22% | 24% |

Legacy extension steps: tall `xs 0.64 / xl 1.64`, square `xs 0.66 / xl 1.56`,
wide `xs 0.70 / xl 1.46`.

**Principles encoded (tested in `scripts/tests/type-scale.test.mjs`):**

- **M is 1.0 everywhere** → a default design is pixel-identical to before. This is what
  keeps the born-clean / arch-stress / render-fingerprint fixtures (all authored at
  defaults) invariant without a re-baseline. Only non-default steps move pixels.
- **Adjacent S/M/L ≥ 18%** at the target size (`STEP_MIN_DELTA`) — perceptible before any
  clamp. Legacy xs/xl extensions relax to ≥ 15% (`LADDER_MIN_DELTA`).
- **Ladders strictly monotonic** xs < s < m < l < xl and S < M < L.
- **Family spread**: wide keeps the highest S (least shrink) for feed legibility; tall
  reaches the widest L. The class floors (`CLASS_FLOOR_PX`, `MIN_FONT_PX`) still clamp the
  shrink so no step drops below the ratified legibility minimums.

## Honest effective step (no silent no-op — operating-manual M2)

Auto-fit may still shrink a step below its target to make copy fit — that is legitimate
capacity behaviour. What is NOT allowed is painting M while the pill claims L.
`resolveEffectiveStep({ basePx, step, family, capacityPx, floorPx })` compares the requested
step against what actually painted (`capacityPx` = the painter's fit result) and returns the
coarsest step whose target still fits, plus `capped`. `describeEffectiveStep` renders the
pill label: `"L"` when it paints as asked, `"L (fits as M here)"` when capacity capped it.

For added elements this is wired at render time into the element ledger entry
(`sizeStep` / `effectiveStep` / `sizeCapped`), so the inspector and readiness can surface the
cap. This upholds **re-solve around pins** (law 5): an explicit user step is a pin auto-fit
respects within capacity; when capacity genuinely cannot fit it, the standard finding flow
(shorten copy / roomier layout) is the remedy — never a silent revert to M.

## Where the numbers are read

- `components/Generator.jsx` — `fontMultOf(fontSizes, role, family)` (legacy roles) and the
  element painter's `elementStepPx(base, step, family)`, both passing
  `formatFamilyOf(dimId)`. `FONT_SIZE_STEPS` there is now labels-only.
- `lib/element-placement-solver.mjs` — re-exports `ELEMENT_SIZE_STEPS` (the square view) and
  `elementStepPx` from the scale module.

## Verified / not yet verified

- Verified (pure, this environment): scale-table integrity, effective-step resolution,
  element-solver arithmetic, full unit + contract + mirror + build green.
- Not runnable here (needs the Chromium/149 render-truth harness): the on-canvas painted-px
  before/after per class × format, the live pill label `"L (fits as M here)"`, and the
  born-clean 456 / arch-stress 114 / render-fingerprint oracles. Because M is pinned at 1.0
  and the fixtures use defaults, those oracles are expected pixel-invariant; any non-default
  fixture cell that moves must be explained per operating-manual §23.
