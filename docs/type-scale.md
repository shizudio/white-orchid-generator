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
| tall   | 0.78 | 1.00 | 1.36 | 28% | 36% |
| square | 0.80 | 1.00 | 1.33 | 25% | 33% |
| wide   | 0.82 | 1.00 | 1.30 | 22% | 30% |

Legacy extension steps: tall `xs 0.64 / xl 1.64`, square `xs 0.66 / xl 1.56`,
wide `xs 0.70 / xl 1.50`.

The L anchors were raised after live measurement (below): on small wide formats the
contrast-escalation ladder can lift M for body copy sitting over a photo, compressing the
top step — a strong L keeps M→L perceptible there. Wide keeps the **highest S** (least
shrink) for in-feed thumb-legibility; tall keeps the **widest total range**.

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

## The legacy hero auto-fit fix (the decisive one)

Live measurement (below) proved the multiplier widening alone did **nothing** for the legacy
editorial title: `fitEditorialHeadline` baked the S/M/L multiplier into the *start* target,
then the shrink-to-fit loop shrank that oversized target back down to the same box-capacity
fill — so S, M and L all painted 169px on ig_portrait (a **0% no-op**, the client's exact
complaint). The fix (`lib/editorial-typography-solver.mjs`): run the fit at the **natural
1× size** (byte-identical to the M render), then apply the step to that *result* —

- **M** (mult 1.0): untouched → pixel-identical to before (fixture invariance).
- **S** (mult < 1): shrink below the fill, floored at the readable minimum — the distinction
  the fit-loop used to erase. Live: ig_portrait hero S→M went 0% → **28%**.
- **L** (mult > 1): grow only as far as the box still holds the copy; a box-filling headline
  cannot grow, so it stays at the fill and reports `heroSizeCapped` (honest — no silent no-op).

## Honest effective step (no silent no-op — operating-manual M2)

Auto-fit may still shrink a step below its target to make copy fit — that is legitimate
capacity behaviour. What is NOT allowed is painting M while the pill claims L.
`resolveEffectiveStep({ basePx, step, family, capacityPx, floorPx })` compares the requested
step against what actually painted (`capacityPx` = the painter's fit result) and returns the
coarsest step whose target still fits, plus `capped`. `describeEffectiveStep` renders the
pill label: `"L"` when it paints as asked, `"L (fits as M here)"` when capacity capped it.

For added elements this is wired at render time into the element ledger entry
(`sizeStep` / `effectiveStep` / `sizeCapped`, surfaced through `createRenderResult` and
`__woContentElements`); for the legacy hero the same signal rides on `fontMeta.headlineSizeCapped`.
The inspector and readiness can surface the cap. This upholds **re-solve around pins** (law 5):
an explicit user step is a pin auto-fit respects within capacity; when capacity genuinely
cannot fit it, the standard finding flow (shorten copy / roomier layout) is the remedy —
never a silent revert to M.

## Live render-truth evidence (Chromium/149 harness, keys unset)

Painted px, measured on a real editorial design via `__woRoleBounds` / `__woFontMeta` and the
element ledger (`generated/live-scale-verify.mjs`):

| role | format | S | M | L | ΔS→M | ΔM→L | note |
|---|---|---|---|---|---|---|---|
| legacy title | ig_portrait | 131.9 | 169.2 | 170.0 | **28%** | 0% | L capped (box full, `heroSizeCapped=true`) |
| legacy title | ig_square | 134.5 | 168.1 | 169.0 | 25% | 1% | L capped |
| legacy title | banner | 92.4 | 112.7 | 122.0 | 22% | 8% | L capped |
| heading element | ig_portrait | 42.1 | 54.0 | 73.4 | 28% | 36% | full range |
| heading element | banner | 20.5 | 25.0 | 32.5 | 22% | 30% | full range |
| body element | ig_portrait | 23.4 | 30.0 | 40.8 | 28% | 36% | full range |
| body element | banner | 11.4 | 13.9 | 18.1 | 22% | 30% | full range |

Before this work the legacy title read S=M=L=169 (0%). Guard battery on the change:
born-clean 456/456, arch-stress 114/114, legacy-dup 30/30, and the render-fingerprint
**self-baseline pre-vs-post = 144/144 identical (0 diffs)** in this environment — empirical
proof M is pixel-invariant. (The committed baseline shows 90 same-dimension hash diffs from
pure cross-environment font drift, present at the pre-change HEAD too.)

## Where the numbers are read

- `components/Generator.jsx` — `fontMultOf(fontSizes, role, family)` (legacy roles) and the
  element painter's `elementStepPx(base, step, family)`, both passing
  `formatFamilyOf(dimId)`. `FONT_SIZE_STEPS` there is now labels-only.
- `lib/element-placement-solver.mjs` — re-exports `ELEMENT_SIZE_STEPS` (the square view) and
  `elementStepPx` from the scale module.

## Verified

- Pure: scale-table integrity, effective-step resolution, element-solver arithmetic, full
  unit (400) + contract (25) + mirror (10) + build green.
- Browser (Chromium/149, keys unset): born-clean 456/456, arch-stress 114/114, legacy-dup
  30/30, render-fingerprint self-baseline 144/144 identical pre-vs-post, and the live painted
  px truth table + screenshots above.

## Remaining (UI polish, not correctness)

The effective-step signal reaches the render result and the `__wo` hooks; wiring the visible
pill label `"L (fits as M here)"` into the React inspector chrome is a small follow-up — the
honest data is already there for it to read.

## The GLOBAL HIERARCHICAL SIZE system (client ruling 2026-07-23) — LANDED

**Also owner of:** `typography.globalSizeStep` and the per-role step-response weights.

Verbatim intent: *"the change in size should change the size for all the text elements used;
if the L size is deemed too noisy, then prioritize changing title size … keep the rest in
smaller size based on information hierarchy; but when user clicks on each text element, they
should be able to change the size individually."*

### The model

One document-level control — `typography.globalSizeStep` (`S | M | L`, default **M**) — scales
**every** text element at once, but by information hierarchy, not uniformly. It composes on top
of the existing per-role/per-element S/M/L base as a second multiplier, `globalStepMult(role,
step, family)` (lib/type-scale.mjs):

- `globalStepMult(role, "M", *) === 1.0` for every role → **global M is pixel-identical to
  before** (fixture invariance; generation defaults were NOT changed, so born-clean / arch-stress
  / fingerprint fixtures — all authored at default M — stay invariant with no baseline bump).
- `"L" → 1 + grow(role)·(L_anchor−1)`; `"S" → 1 − shrink(role)·(1−S_anchor)`.

### The step-response weights (`GLOBAL_STEP_RESPONSE`)

`grow` = fraction of the family's full L travel a role takes at global L; `shrink` = fraction of
the S travel it gives up at global S. The two are **inverse** (the ruling's "compresses
inversely"): the title takes the whole L step but barely shrinks; the small roles grow little
but compress hardest. So the signed response delta obeys **title ≥ subheading ≥ body at every
step** — hierarchy contrast widens both louder and quieter.

| role (tier) | grow (at L) | shrink (at S) |
|---|---|---|
| heading / highlight (title) | 1.00 | 0.30 |
| subheading / content (support) | 0.60 | 0.60 |
| body / caption / cta / eyebrow (small) | 0.30 | 1.00 |

Tested in `type-scale.test.mjs`: weights in (0,1]; M exactly 1.0 in every family; monotonic per
role (S<1<L); hierarchy (signed delta title ≥ subheading ≥ body) at S, M and L in all families;
title moves strictly more than body at both extremes.

### Pins (re-solve-around-pins, law 5)

A per-element / per-role size choice is a **PIN** that ignores the global step. Elements pin on
`element.pins.sizeStep` (the generated base stays on `master.sizeStep` and follows the global
step); legacy roles pin via `typography.fontSizePins[role]`. Commands (one undo each):
`typography/set-global-size-step`, `content/pin-element-size` (null clears → rejoin global),
`typography/set-font-size-pin`. The element inspector Size control offers **Auto** (follow) +
S/M/L (pin); the Text-panel top control is relabelled **"Text size (all)"**. Honest capping
composes: a global-L role that the box can't grow still reports the existing "fits as M" label.

### Live render-truth evidence (Chromium, keys unset, `next dev`)

Painted px for added elements via `__woContentElements`, driving `typography/set-global-size-step`:

| tier | format | S | M | L | Δ M→L | Δ M→S |
|---|---|---|---|---|---|---|
| heading (title) | ig_portrait | 50.4 | 54.0 | 73.4 | **+36%** | **−6.6%** |
| subheading | ig_portrait | 33.0 | 38.0 | 46.2 | +21.6% | −13.2% |
| body | ig_portrait | 23.4 | 30.0 | 33.2 | +10.8% | −22% |
| caption | ig_portrait | 20.3 | 26.0 | 28.8 | +10.8% | −22% |
| heading (title) | banner | 23.7 | 25.0 | 32.5 | +30% | −5.4% |
| body | banner | 11.4 | 13.9 | 15.1 | +9% | −18% |

Every value equals `base × globalStepMult` to the decimal; M matches the pre-change baseline
(heading 54.0 / body 30.0 — invariance confirmed empirically). **Pin:** a body element pinned to
L held 40.8px when the global step flipped M→S (unchanged), while the unpinned caption shrank
26→20.3; clearing the pin returned the body to 23.4 (rejoined the global step). Both viewports:
fresh-generation ready-check clean (5/6 formats 0 issues, `story` a copy-specific pre-existing
note), canvas dims track the active format (no stale draw), 0 console errors. Gates: unit 448/448,
contract 25/25, mirror 11/11 (globalSizeStep is NOT in the AI patch grammar — no new surface),
next build green.

### Deferred (documented)

- **Part 1 "M-with-headroom generation"** (make generation *target* M so L is always reachable,
  changing templates that currently author `heading:"l"`) is a REAL generation-default design
  change that shifts the born-clean/fingerprint fixtures and needs the §23 baseline bump +
  screenshots. It is intentionally NOT done here: the current build keeps generation defaults
  and stays fully invariant. The global control already gives the user M-with-L-headroom on
  demand; making it the *generated* default is the follow-up.
- The full resident-tester born-clean 456 / arch-stress 114 / fingerprint self-baseline battery
  was not re-run (heavy). Default-M invariance is proven mathematically (`globalStepMult` returns
  literal `1.0` at M) and empirically (M painted-px identical to baseline), so those oracles are
  unaffected by construction.
