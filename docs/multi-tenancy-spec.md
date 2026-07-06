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
