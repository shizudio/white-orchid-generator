# Multi-Tenancy — one platform, many brands

Status: RATIFIED (client, 2026-07-06). Brand #2: **Perena** (Shina's DeFi company).
Routing: **subdomain per brand**. Requirement: any update to main works across all
brands — therefore ONE repo, ONE deployment, ONE database, many brand rows.

## Principles
1. **Code contains zero brand facts.** Everything brand-specific lives in the DB
   (brand_kit + assets), keyed by brand_id. The engine (17 archetypes, five laws,
   guards, honesty system, advisor/ledger, patch pipeline, feed grammar MECHANICS)
   is shared product — ship once, all brands inherit.
2. **Taste is per-brand.** Likes/acks/feedback/priors/house-style exemplars already
   carry brand_id — separate flywheels per brand, same machinery. Learning passes
   run per brand.
3. **The proof of tokenization is that White Orchid does not change.**

## Phases
**P1 — Tokenization pass.** Extract every hardcoded White Orchid-ism into brand_kit
rows/assets: palette (the B object), fonts (files + role mapping), LOGO_VARIANTS,
petal/shape assets (Brand kit is already the asset front desk), the PHOTOGRAPHER
BRIEF style block (casting, palette words, lighting, camera — Perena's will be
non-photographic/product-abstract, proving this must be a token), tone/voice rules
(assistant prompt inserts), guardrails text, archetype-variant palette mappings,
landing suggestion pools. Code reads tokens with a per-request brand context.
Verify: White Orchid renders pixel-identical pre/post (screenshot diff + guards).

**P2 — Auth + brand resolution.** Subdomain → brand_id resolution (Next middleware;
Vercel wildcard domain). Supabase Auth + RLS: users belong to brands; every table's
RLS enforces brand_id scoping (replaces the current no-auth shared-key model — the
honest new work). The resident tester + cron get a brand parameter (runs per brand;
White Orchid remains the default nightly).

**P3 — Onboard Perena manually** (the guinea pig): create brand row, upload assets,
seed voice from the perena-marketing rules (no em dashes, trusting/feminine/bold/
direct, Purple VIP register), define its photographer/visual brief, calibrate with
a scored board round (same process White Orchid used). Success bar: Perena posts
that pass its own guards + feel unmistakably Perena, while White Orchid is untouched.

**P4 — Onboarding wizard** (only after P3 proves the shape): logo+fonts+palette+
one-sentence voice + imagery brief → live brand in an hour.

## Non-goals now: billing/plans, cross-brand asset sharing, per-brand feature flags.
## Sequencing: after the declutter+hearts package lands and ships. P1 and P2 are
separate packages (P1 has zero user-visible change; P2 introduces login).

## Ratifications (client, 2026-07-24)
1. **Sequencing gate CLEARED.** The declutter+hearts package has landed and shipped —
   multi-tenancy work starts now.
2. **P1.5 — role vocabulary (NEW phase, before P2).** The engine stops speaking White
   Orchid token names. Colour tokens become semantic roles (the typography_config
   pattern: roles, zero literal names); `burnham`/`whiteSmoke`/… become White Orchid's
   brand_kit *labels* for those roles. Shape/motif ids likewise: archetype masks and
   motif sets resolve through brand_overlays slots, not literal `shape-1`. Touches the
   full mirror set (Generator.jsx archetype specs, design-patch enums + LLM schema +
   field guide, moodboard gene maps, schema seeds) — one atomic package, gated by
   mirror-check (`.claude/skills/auto_mirror-touchlist/scripts/mirror-check.sh`) AND
   the pixel-identity proof (the render-fingerprint harness: 144 cells byte-identical,
   zero bumps). Implementation PRD: `docs/role-vocabulary-prd.md` (owns the mapping
   table, mechanism decisions, phase plan R1–R7, release gates).
   Stored designs (sessions/templates/drafts state JSONB) keep working via a
   legacy-name alias map — never a bulk rewrite of user data.
3. **Fonts are uploadable per brand** (P3 builds the path; the P4 wizard surfaces it).
   Clients upload their own faces (woff2/otf) per font role; onboarding introspects the
   files' real weights and derives typography_config weightRanges from what actually
   exists (a register may never demand a weight the brand's file lacks). Licensing is
   an attestation, not policed. Canvas draws only after FontFace load resolves (M1
   guard).
4. **Archetypes split: core vs brand packs.** The catalog is tagged general-purpose
   (geometry any brand can wear) vs brand-flavoured; each brand enables core + its own
   pack (brand_kit enablement list). Mask/motif archetypes (petal_window, shape_cutout)
   count as core once P1.5 makes their shapes brand-slot-resolved. Custom per-brand
   archetype AUTHORING is later work — not promised in P3/P4.
5. **Path confirmed:** P1.5 → P2 → P3 (Perena, manual; every step documented — the
   runbook IS P4's spec) → P4 (wizard, ending with a taste-calibration board round
   that seeds the brand's preference aggregate before first real use).
