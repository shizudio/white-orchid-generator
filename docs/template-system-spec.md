# Template System — product spec (RATIFIED 2026-08-18)

**Status: RATIFIED product direction.** Client ruling given in session on 2026-08-18.
This doc is **law-class**. It OWNS the facts listed in §2 and supersedes the parts of
other docs named there. Where this doc and an older spec disagree, **this doc wins** —
the older doc is history until it is revised or retired.

**Not yet implemented.** Nothing in the codebase reflects this yet. Read §11 before
touching code, and §12 before authoring templates.

---

## 1. Why — the problem this solves

Evidence, from a live client trial on 2026-08-18 plus two code investigations the same day:

- A real user generated a design, began tweaking, **the features fought each other, she
  did not know how to continue, and she gave up.**
- When she instead one-click generated something she liked, **she published it.** The
  value is concentrated in one moment: *generate → that's the right template → publish.*
- Client's own words on what worked: **"hitting on the right template."** On what did
  not: **"the set rules where we can start dragging things around and then it becomes
  chaotic"**, plus *"I don't know what's actually happening with the code"* and
  *"a lot of latencies or unexpected surprises."*

**Diagnosis.** Nearly every property of a design can currently be set by two owners —
the solver and the person — so seven rule systems exist to referee them: born-clean,
pins-win, no-helpful-override, honesty/renderTruth, capacity clamps, frequency caps,
the advisor ledger. The ten named traps in `operating-manual.md` §5 are the scar tissue
of that seam. The manual itself documents that two ratified laws *conflict* and need
case-by-case human arbitration (born-clean vs pins-win, precedent `b30fc8e`).

Measured symptoms of the same root cause:

| Symptom | Evidence |
|---|---|
| A size control that does nothing | `docs/type-scale.md` — title **M→L = 0% change**; autofit already consumed the size budget |
| A dead control shipped in the UI | the Scale slider (0.80–1.30) is a no-op on every archetype design |
| Advisor dots turned off entirely | `daeb329` — the AI audit's fixes were no-ops; nothing broke when the dots went away |
| An auditor that cannot fix what it sees | `composition` findings are **definitionally** advice-only — the patch schema has no spacing vocabulary |
| Drag latency | `drawLineArtLayer` recoloured 1.46M px **per pointermove** (`5c8e720`) |

**The move.** Not "cut features" — **split the audience, and resolve at authoring time
instead of runtime.** The existing app's power is exactly what a *designer* needs and
exactly what a *preschool teacher* cannot survive. Every decision moved from runtime to
authoring time in this design deletes a subsystem rather than refactoring one.

## 2. Doc ownership — what this doc owns and supersedes

| Fact | Owner after this ruling |
|---|---|
| The template contract (slots, constraints, dimensions, purpose text) | **this doc** |
| Admin/user split + shared render core | **this doc** |
| Autofit, floor, and character-budget rule | **this doc** |
| The four supported dimensions | **this doc** (supersedes the 6-format list in `format-design-spec.md`) |
| Composition/archetype geometry (numeric) | `visual-language-spec.md` — becomes **authoring reference** for hand-made templates, no longer a runtime solver contract |
| Per-format layout & font-scale rules | `format-design-spec.md` — **superseded** for the user app; retained as admin/authoring reference |
| Editor UX contract | `ux-architecture.md` — **superseded** for the user app; still describes the admin app |
| Advisor/audit unification | `advice-ledger-spec.md` — **retired for the user app** (see §10) |
| Element placement | `element-placement-spec.md` — **superseded** by baked template geometry |
| Multi-tenancy ("zero brand facts in code") | `multi-tenancy-spec.md` — **unchanged, still law** |
| Feedback → learning loop | `self-improvement-loop.md` — unchanged in principle; its signal source becomes template choice (§8) |

## 3. Users and non-goals

**Two audiences, two surfaces.**

- **Designer (admin).** One person (the client). Needs full control. Authors templates.
- **Staff (user).** Non-technical preschool staff. Needs a publishable post in ~90 seconds.

**Non-goals for the user app — explicitly out of scope, permanently:**

- No free drag / pan / zoom / rotate of anything.
- No user-facing font-size control of any kind (see §7 — autofit owns size).
- No colour picking outside the template's pre-verified pairs.
- No composing/uploading/treating motifs (pick from a set only).
- No layout editing. When a need cannot be expressed as a slot value, the answer is
  **"the designer will make a template"** — never "add a control."

> **The discipline that keeps this working:** the user app may only ever consume the
> template contract. The first control added to the user app outside this contract is
> the beginning of a rebuild of the thing being escaped.

## 4. Architecture

**One shared render core, two thin apps.**

```
                 ┌─────────────────────────┐
                 │   RENDER CORE (shared)  │
                 │  template + values →    │
                 │  canvas. No solving.    │
                 └───────────┬─────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │                                         │
┌───────▼─────────┐                     ┌─────────▼────────┐
│   ADMIN APP     │  publish template   │    USER APP      │
│ (today's app)   │ ──────────────────► │ (new, small)     │
│ full control    │                     │ gallery → fill   │
│ authors + bakes │                     │ → improve → 4 up │
└─────────────────┘                     └──────────────────┘
```

- **Render core** — "given a template and slot values, paint a canvas." Roughly
  today's `renderLegacyScene` minus all solving. The only shared code.
- **Admin app** — today's app, largely untouched. Keeps drag, size controls, shape
  treatments. Its known bugs become admin-side and drop in priority: a designer
  tolerates a quirky tool, a teacher does not.
- **User app** — **BUILD FRESH. DO NOT SUBTRACT IT FROM `Generator.jsx`.** Removing
  features from ~10k lines carrying ten named traps means fighting entanglement and
  inheriting every regression. A clean surface against the contract is faster and
  leaves the admin app running throughout — no risky migration.

## 5. The four dimensions

Six become four. All four are **shown together**, as in the current app.

| id | Purpose | Family |
|---|---|---|
| `portrait` | IG feed 4:5, also Reels | tall |
| `story` | Stories / Reels 9:16 | tall |
| `square` | IG 1:1 | square |
| `landscape` | Twitter **and** Facebook (shared) | wide |

- `banner` (1500×500) is **retired**.
- `twitter` and `facebook` **merge** into one `landscape` render.
- **Each dimension is AUTHORED, never derived.** Showing four baked layouts is cheap and
  predictable; today's cost came from *solving* six at runtime. All per-format
  derive-from-master logic is retired for the user app.
- A template declares which dimensions it supports. Not every template must support all
  four — a portrait editorial layout may have no honest landscape form.

## 6. The template contract

### 6.1 Global slot vocabulary — CLOSED SET

Every template implements the same slots. This is what makes **template swap preserve
her content** (§8). Adding a slot is a rare, deliberate decision, not routine.

**Text:** `eyebrow` · `heading` · `body` · `pill` · `attribution`
**Non-text:** `photo` · `logo` · `colourPair` · `motif`

Notes:

- **No `date` slot.** A date is served by `heading` (date-as-hero), `eyebrow`
  ("18 JULY · 9AM" as a small-caps line), or inline in `body`. This also retires the
  special-case DATE-FIRST branch in the assistant's text-substitution belt.
- **`pill` is a label, not a button.** Nothing on a social image is clickable; the name
  must not imply interactivity (existing honest naming: "NOW ENROLLING").
- **`motif` means "pick one from the brand set, or none."** It does NOT mean placing or
  treating artwork — see §9.

### 6.2 Constraints are DATA, never behaviour

> **Hard rule.** A template may declare *constraints* — numbers, enums, presence flags.
> It may **never** declare *rules* — no conditionals, no computed behaviour, no
> "if body is long then shrink heading." Constraints must be readable as a table.
> The moment a template needs a conditional, the solver has been rebuilt in data and
> this whole design has regressed.

Per template:

| Field | Meaning |
|---|---|
| `id`, `name` | identity |
| `purpose` | short client-facing description — *why* you'd choose this one (§8) |
| `dimensions` | subset of the four it supports |
| `allowedLogoPositions` | subset of the existing 5-position enum, or `none` |
| `colourPairs` | 2–3 **pre-verified** pairs (contrast checked at authoring time) |
| `motif` | `none` \| the allowed motif set |

Per slot, per template, **per dimension**:

| Field | Meaning |
|---|---|
| `present` | does this template use this slot at all |
| `required` | may she leave it empty |
| `maxLines` | fixed line count of the box (§7) |
| `charBudget` | measured, baked (§7) |

### 6.3 Slot activation

Each template activates only some slots. This is `present: true/false`.

Three rules make it safe:

1. **Deactivating never deletes.** Swapping to a template without a `body` **keeps her
   body text, hidden** — swapping back restores it. Silent content loss is precisely the
   surprise class that made her give up.
2. **Swap says what it is doing** — one honest line: *"this template doesn't show your
   body copy; it'll be kept for later."* No dialog.
3. **The gallery states each template's slots** as part of its purpose text — "big
   heading + photo + logo, no body copy" — so she chooses knowing.

> Today the identical mechanism reads as a *refusal* ("Not shown in this layout: the
> date" + "Switch to a layout that shows it") because the **system** chose the layout.
> The same behaviour reads as guidance when **she** chose and could see it up front.
> Same code, opposite feeling, purely because of who decided.

## 7. Autofit, floor, and the character budget

**The box is fixed. The type autofits down to a floor. The floor defines the budget.**

1. Every text slot has a **fixed box** — fixed width and fixed height, sized for its
   declared `maxLines` at the floor size. The box never changes size.
2. Type **autofits**: short copy renders large and dramatic, longer copy renders
   smaller, down to a floor.
3. The **floor** is the legibility floor. Reuse the existing per-format `MIN_FONT_PX`
   basis (derived from thumbnail legibility; banner-class ≈24px body / ≈34px headline).
   Do not invent a new number.
4. The **`charBudget` is measured at the floor** — how much fits in `maxLines` at the
   floor size — with a conservative safety margin.
5. The budget is **enforced in the input**: `maxLength` (hard stop) plus a **visible
   counter**.

**Why the floor matters more than it looks:** because the budget is derived *from* the
floor and enforced at input, **the floor can never be breached**. Everything downstream
of a breach therefore cannot happen — the §6 degradation ladder (shrink → drop tertiary
→ drop secondary), `copy-dropped`, unclipped overflow spill, `required-over-capacity`.
The failure mode is removed, not handled.

> **Hard rule: autofit owns size completely. The user never sets size.** No S/M/L, no
> scale slider, no per-role pins. If she can also request a size, "L does nothing"
> returns immediately, because autofit has already consumed the size budget.

### 7.1 The cross-dimension minimum

All four dimensions show the same copy, so **the shown budget is the MINIMUM across the
dimensions the template supports.** If portrait holds 40 at its floor and landscape holds
28, the budget is **28** — otherwise her post fits three dimensions and breaks in the
fourth.

At authoring time you have two knobs to equalise this — **box size and floor size**.
Deliberately author each dimension so all supported dimensions hold the *same* declared
budget. This is a real constraint on template design: a landscape form that is far
tighter than its portrait sibling drags everyone's budget down.

### 7.2 Hard line breaks

Enter inserts a real hard break (shipped `8f687ee`). A manual break ends its line early,
so copy **under** the character budget can still exceed `maxLines`.

Resolution: the box is fixed at `maxLines`, so the break must be accounted for.
`maxLength` remains the primary guard; **additionally**, if the measured wrap at the
floor exceeds `maxLines`, the field enters an over-budget state and export is blocked for
the affected dimension until it is fixed. This is the one place a second check is
required — a character count alone cannot see a break.

## 8. User flow

```
gallery (9 templates, purpose text, dimension filter)
   → pick a template
   → fill slots        (text fields w/ visible counters; photo from library;
                        logo position from allowed set; colour pair; motif)
   → one-click improve  (optional, on her own words)
   → see all four dimensions
   → export / publish
```

- **She writes the caption first; AI only improves it.** She owns the facts, so the
  hallucinated-date/name class disappears entirely.
- **Template swap preserves everything** (§6.3) — the gallery is explorable, not a
  commitment.
- **She must see the template with her real content** before committing. Generic
  previews are still a guess.
- **Template choice is a learning signal** — feed it to the existing likes/genes
  machinery (`self-improvement-loop.md`).

### 8.1 One-click improve — two requirements

1. **It must write within the slot's `charBudget`.** Otherwise it hands back copy that
   does not fit and re-opens overflow through the front door. (`fitCopy` +
   `computeCopyBudgets` already exist for this.)
2. **It must be revertible, visibly.** Show her original alongside, or one-tap undo. If
   improve makes it worse and eats her words, she will not press it twice.

## 9. Motif — slot, not layer

Today a motif is a *composable layer*: arbitrary uploaded art, auto-classified by art
class, assigned one of five treatment modes, dragged, folded into the reflow obstacle
set, and recoloured pixel-by-pixel every repaint. That is what caused the latency bug
fixed in `5c8e720`.

As a **slot** it is a different thing wearing the same name:

- The **template** declares where the motif sits, at what size, in which treatment —
  baked at authoring time.
- She only chooses **which** motif from the brand set, or none.
- **The treatment is pre-rendered.** Store the treated asset; `drawLineArtLayer` never
  runs at render time. This *deletes* today's perf bug rather than preserving it.
- No dragging → no pins, no reflow obstacles. No auto-classification → no misrouting an
  upload into the expensive painter. No ink-sensitivity slider, no structure order.
- If staff upload motifs later, the treatment runs **once, at upload** ("preparing your
  motif…"); what is stored is the finished asset. Authoring-time, never render-time.

## 10. What this retires

Three buckets. Precision matters: much of this **survives in the admin app** — it is
retired from the *user surface* and from *runtime*.

### (A) Deleted outright — nothing needs them

- Advisor ledger end to end: dots, popover, acks, `findingAckPinned`, findings merge
- The AI audit: `/api/design-audit`, `buildAuditSchema`, `coerceFixToCategory`,
  `AUDIT_CATEGORY_FIELDS`, `useAiAuditLedger`
- Findings that can no longer occur: `copy-dropped`, `copy-stump`, `thumb-legibility`,
  `type-size-floor`, `copy-over-capacity`, `pinned-placement`, `logo-clear-space`,
  `logo-legibility`, `safe-area-logo`, `logo-focal-band`, `archetype-margin-crop`,
  `safe-zone-violation`, `crowding-advisory`, `element-unplaced:*`
- The §6 degradation ladder
- The dead Scale slider (0.80–1.30)
- Capacity clamp: `resolveEffectiveStep`, `sizeCapped`, `describeEffectiveStep`
- Archetype selection machinery: frequency caps, dark-share cap, rotation rings,
  `RECENT_PICKS`, anti-repeat belts, `seededRotationPick`, `resolveLandingArchetype`,
  `pickPhotoLedArchetype`, `guessIntent`→`suits`  *(note: `seededRotationPick` was
  built on 2026-08-18 solely to stop the AI repeating a layout — when the human picks,
  the whole problem is gone. A good illustration of cutting upstream.)*
- `dateText` as a distinct role, incl. the assistant's DATE-FIRST branch
- The `banner` dimension; `twitter`/`facebook` as separate solved layouts
- Most of the ~10 regex intent belts in `/api/assistant` (colour words, mood recipes,
  text substitution, contact add, font resize, full-image intent, band removal, layout
  variety, polish) — fewer expressible operations, less to disambiguate
- Runtime contrast guards (colour pairs are pre-verified) — **AMENDED
  2026-08-18, see below**
- The two parallel text systems (legacy roles + added elements) → one slot model

### AMENDMENT (client ruling, 2026-08-18) — the backdrop check

Retiring runtime contrast guards rests on one premise: **every colour pair was
verified at authoring time.** That premise holds exactly as stated, and nothing
in it is being re-opened. It stops applying the moment the field behind the ink
is something that did not exist at authoring time:

| New user freedom | Verifiable at bake time? |
|---|---|
| A photo she picks from the library, or uploads | **No** — the photo did not exist when the template was baked |
| Which sanctioned brand mark she swaps to | **No** — only the colour-class DEFAULT was verified against each pair |

So one check is reinstated, scoped to exactly that gap:

- It runs **only** when a photo is painted (text and mark) or when the caller
  names the mark's own ink (mark only). With no photo and the default mark, not
  one pixel is sampled, and the render is **byte-identical** to before.
- It **measures**; it never negotiates. The scrim is a fixed declared number —
  no adaptive ladder, no auto-recolour, no relocation, no fabricated backing
  (law 3), no substituted mark (M3).
- Failing is a **refusal**, in the §7.2 idiom already built for over-budget: the
  affected dimensions go on hold and their export is blocked, with one honest
  line naming them. **No advisor dot, no ledger, no "apply fix" button** — §10A
  stays deleted.

Everything else in §10A is unchanged. `lib/render-core/backdrop-contrast.mjs`
carries the same reasoning next to the code, and reuses the existing colour maths
(`lib/surface-contrast-policy.mjs`) rather than growing a second copy.

The template contract absorbs this as **data only** (§6.2): the `photo` slot
declares a box and a `fit` enum per dimension, plus one fixed scrim
(colour + opacity) per colour class — the same lookup shape `logoAssets` already
had. `allowedLogoAssets` is likewise a plain array of brand asset ids.
`assertValidTemplate` still rejects a function, accessor, RegExp, class instance
or rule-shaped key anywhere in that new surface.

### (B) Moved to authoring time — run once, baked, inspectable

- Budget measurement: `computeCopyBudgets` runs **once per template per dimension**, not
  per render
- Contrast verification of `colourPairs`
- Motif treatment (pre-rendered asset)
- Layout geometry itself: the three solvers (`editorial-layout-solver`,
  `editorial-typography-solver`, `element-placement-solver`),
  `reserveHeadlineSupportSpace`, `format-placement-policy` derive-from-master

### (C) Admin-only from now on

- Free drag/pan/zoom/rotate and the pins they create (`roleOffset`, `logoFree`,
  overlay transforms), snap guides, `dragLift`
- Reflow obstacle sets (`decorObstacles`, `_activeShapeBoxes`, `_softShapeBoxes`)
- The five shape treatment modes, art-class detection (`lineArtModeFor`), ink
  sensitivity, structure order
- All per-role/per-element size controls

### Laws whose status changes

| Law (`operating-manual.md` §3) | New status |
|---|---|
| **Born-clean** | Becomes **structural, not enforced.** A broken design is unreachable when every slot value was verified at authoring time. No runtime guard needed. |
| **Pins win** | **Retired from the user app** — there are no free pins, only slot values. Still applies in admin. |
| **Only real assets** | **Unchanged, still law.** |
| **One voice / actionable findings** | **Retired with the ledger** (§10A). Replaced by input-level constraints that prevent the problem instead of reporting it. |
| **Honesty / renderTruth** | **Unchanged in spirit, cheaper to keep** — with no negotiation, narration and render cannot diverge. |
| **Zero brand facts in code** | **Unchanged, still law.** |

> The manual's §3 laws and §5 traps will need revision once implementation starts. That
> is a **separate, reviewed change** — this doc records the ruling, it does not rewrite
> the constitution.

## 11. Verification bar

Per `operating-manual.md` §8, runtime evidence beats code reading.

- **A template is not done until all its declared dimensions render clean** with (a)
  empty slots, (b) copy at exactly `charBudget`, and (c) copy at budget **with two hard
  line breaks** in every text slot.
- **Budgets must be measured in the canvas render core, never read off Figma.** Figma
  and canvas do not wrap text identically; the budget is only honest if it comes from
  the thing that actually paints.
- **Autofit floor check:** at `charBudget` the painted px must equal the declared floor,
  not below it.
- **Swap fidelity:** fill every slot, swap through all nine templates and back; assert
  zero content loss.
- The user app needs its own tests; the resident tester's journeys assume today's editor
  and will need rewriting against the new flow.

## 12. Sequencing — do NOT author nine templates first

**Build ONE template, in all four dimensions, end to end** — author → measured budgets →
gallery card with purpose text → fill → improve → four renders → export.

One template will surface every gap in the contract while it is cheap to change.
Authoring 36 layouts and *then* discovering the constraint schema needs another field is
the expensive version of the same lesson.

### Authoring workflow

Figma is the right place for the design decisions. **But do not hand-transcribe.**
Nine templates × four dimensions is 36 layouts; manual transcription drifts, and every
Figma tweak needs re-transcribing — exactly the hand-mirroring problem that already
produced trap M6 and the `auto_mirror-touchlist` skill.

Two acceptable paths:

1. **Generate from Figma.** Read the file's real geometry/type/variables and emit the
   template data. Figma stays source of truth; the template file is a build artifact,
   regenerated on change.
2. **Author in the app.** What you design *is* what renders — zero translation. Existing
   archetypes are already templates in code, so a "freeze and bake" plus a small
   constraint editor is far less work than a design tool from scratch.

Either way: **budgets are always measured in the render core** (§11).

## 13. Open questions — NOT decided

1. **Does AI recommend templates from a brief?** Raised, not taken up. Client stated
   users "can only see existing templates," so treat AI template-recommendation as
   **out of scope for v1**. Revisit only if the gallery proves hard to navigate.
2. **Template versioning.** Working assumption: a template is published data with a
   version; a post records the version it used, so editing a template never
   retroactively changes existing posts. `/api/templates` already has a `proposed`
   status to build on. Not ratified.
3. **Are motifs actually used?** Never answered with usage data. Motif is in the slot
   vocabulary, but if real usage is near zero, dropping the slot removes work.
4. **Which templates support `landscape`?** Depends on the nine designs; decide per
   template while authoring (§5).
5. **Gallery navigation** — is dimension a filter before template choice, or is every
   template shown with all its dimensions? Decide with template one.
6. **What happens when no template fits a brief?** Cheapest honest answer: show the
   closest and let her pick, with "new template" as a designer task with a real
   turnaround. No synthesis path.
