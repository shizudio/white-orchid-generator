# Moodboard → Templates spec — aspirational learning with a human gate

**Status: RATIFIED 2026-07-12** (client's words, this session). Extends `docs/self-improvement-loop.md` (nothing self-applies) and completes the standing "Templates 2.0" item from Theme 3. Owner of: the moodboard learning cadence, template-proposal flow, and template management rules.

## The ruling (verbatim intent)

> "Moodboard as good examples — about half a heart, but more aspirational: find patterns in what we like about the moodboard from the large quantities, and try to replicate that with our brand elements as a template. Reconsolidate learning every night, but only propose a new template every 5 days or unless I tell you to. Whenever we propose a new template, show a pop-up on the interface for the user to click and review the template, and decide whether we want to include it in the official template set. Also allow us to remove or edit any template."

## The system

### 1 · Two taste signals, two roles
- **Hearts (♥) = revealed taste**, weight **1.0** — keeps steering the per-generation rotation weights exactly as today.
- **Moodboard = aspirational taste**, weight **0.5** in the aggregate — but its PRIMARY consumption is different: pattern-mining at scale into **template proposals**, not per-generation nudging.

### 2 · Classification (at upload)
Every moodboard image gets one vision call on upload (cheap model), extracting the shared gene vocabulary plus the study-2 composition taxonomy: `{paletteClass, compositionDevice (type-weave | shape-mask | collage | pill-card | split | caption-band | type-only | full-bleed), photoTreatment, typeRegister, densityClass}`. Stored on the `brand_moodboard` row (`genes jsonb` column — idempotent `alter table add column if not exists`). Existing rows are backfilled by the first nightly pass.

### 3 · Nightly reconsolidation (extends the existing learning pass)
Every night the learning pass re-aggregates: hearts (1.0) + moodboard genes (0.5) → updated weights AND a **pattern ledger**: which composition devices / palette classes / registers recur across the moodboard at what frequency, which are ALREADY expressible with brand elements (existing archetypes/shapes/palette), and which cluster is strongest-but-unserved. Written to the learning-pass report (evidence, not action — nothing self-applies).

### 4 · Template proposal (every 5 days, or on demand)
- **Cadence:** a proposal is synthesized at most once per 5 days (`PROPOSAL_COOLDOWN_DAYS = 5`, stamped on the last proposal row), OR immediately when the client asks ("propose a template now").
- **Synthesis:** take the strongest unserved (or under-served) moodboard pattern cluster and replicate it **with brand elements only** — real palette tokens, real shapes, real fonts, existing archetype machinery (law 3: only real assets; a proposal never requires fabricating anything). The proposal is a complete, render-ready design state (like any saved template) + a one-paragraph rationale naming the moodboard images that inspired it.
- **Storage:** a `design_templates` row with `status:'proposed'` (idempotent `alter table add column if not exists status text default 'official'`), carrying `rationale` + `source_moodboard_ids` in its state/metadata. Proposed templates NEVER appear in the working template set.

### 5 · Review pop-up (the human gate)
On studio load, if an unreviewed proposal exists: a calm modal shows the rendered proposal (real thumbnail, portrait), the rationale, and the inspiring moodboard images. Three actions:
- **Add to templates** → `status:'official'` — joins the Templates gallery.
- **Not this one** → `status:'declined'` (kept as evidence; the pattern ledger learns the decline).
- **Later** → dismisses until next session; never nags mid-work.
One proposal pending at a time; a new proposal is not synthesized while one awaits review.

### 6 · Template management (applies to the whole set)
In the Templates gallery, every template — proposed-then-accepted, hand-saved, or starter — gets **Remove** (soft-delete, `deleted:true`, reversible in DB) and **Edit** (opens the template as the working design; saving updates the template in place with a confirmation, or saves-as-new). No template is ever auto-modified by the system.

## Laws that bind this feature
- **Nothing self-applies** — the pop-up IS the ratification gate; an unreviewed proposal influences nothing.
- **Only real assets** — proposals compose exclusively from brand elements.
- **Born-clean** — a proposed template must render with zero advisor dots in all 6 formats before it may be shown (a proposal failing this is discarded and logged, never surfaced).
- **One voice / honesty** — the rationale names the actual moodboard sources; no invented justification.

## Knobs
| Knob | Value | Effect |
|---|---|---|
| Moodboard weight | 0.5 (vs heart 1.0) | Aspirational signal strength in the aggregate |
| PROPOSAL_COOLDOWN_DAYS | 5 | Minimum days between autonomous proposals |
| Pending-proposal limit | 1 | Never more than one awaiting review |
| Nightly consolidation | with the existing learning pass | When patterns re-aggregate |

## Build phases
- **P1 (server, buildable now):** genes column + upload-time classification + backfill; aggregate reads moodboard @0.5; pattern ledger in the nightly pass.
- **P2 (server):** proposal synthesizer + cooldown + `design_templates.status` + API.
- **P3 (client, AFTER the shape-system agent releases Generator.jsx):** review pop-up + Remove/Edit on the Templates gallery.
- Schema deltas ride `lib/schema.sql` (idempotent) — one Supabase re-run when P1 lands.
