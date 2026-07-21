# White Orchid Generator — Technical Audit (read-only)

Date: 2026-07-20. Repo: `/Users/shinamua/Documents/GitHub/white-orchid-generator` @ `main` (08ef373).
Method: full read of the ratified spec set + four parallel code sub-audits (API/persistence, renderer/document-model, AI/validation/learning, multi-tenancy/mirrored-enums) + independent verification of auth, brand-leak, schema, and file-size claims. Every claim cites `file:line` or a doc section.

Audited against the owner's stated vision: an **AI-native, brand-enforcing** platform (workspace → brand knowledge base → objective → multi-asset multi-channel generation → per-change brand validation → export/publish → continuous learning), multi-tenant across founders/teams/agencies/enterprise.

**Note on scope:** the brief referenced a "Post Now" Meta-publishing spec. No such file exists in this checkout (`grep -rli "post now|meta publish|graph.facebook"` over `docs/` and `.claude/` returns nothing; git log has no publish commits). Publishing today is **export-only** (`product-platform-audit-2026-07-21.md:100`). I audit against that reality.

---

## 1. ARCHITECTURE MAP — the actual system

### Data flow (as built)

```
                          NO AUTH LAYER  (no middleware.*, no auth lib in package.json)
                                 |
  UI gesture ──┐                 v
  AI proposal ─┴──► EditorCommand ──► dispatchDesignCommand ──► designReducer
                                                                    |
                                                     DesignDocumentV1 (design-document.mjs, 559 lines)
                                                     plain versioned JSON — CHANNEL-AGNOSTIC, clean
                                                                    |
                                                            resolveFormat (master + byFormat inheritance)
                                                                    |
                                        ┌───────────── renderScene  (Canvas 2D renderer, ~2.9k lines,
                                        |               MODULE-LEVEL inside Generator.jsx;
                                        |               reads mutable singletons B / F / LOGO_VARIANTS)
                                        v
                                   RenderResult (render-result.mjs, 88 lines)
                                   pixels(PNG) · sceneElements[] · text/contrast metrics · findings[]
                                        |
        ┌──────────────┬───────────────┼────────────────┬─────────────────┐
        v              v               v                v                 v
   canvas +        every-format     advice ledger     export (PNG)    persistence
   selection +     previews         (audit-local.js   single/all       adapters
   inspector       (idle queue)     1,230 lines +                    (localStorage
                                    AI audit merge)                   mirror + Supabase)
                                        |                                  |
                                        v                                  v
                             AI surfaces (server routes)         Supabase (service-role key,
                             /api/assistant 1,888 lines           NO RLS, ONE shared brand row
                             /api/design-audit (vision)           ...0001, hardcoded in 10 routes)
                             /api/feed-photo, /api/moodboard
```

### Rendering pipeline
- **Canvas 2D only.** The renderer is a hand-written HTML Canvas 2D engine (~2.9k lines) living at **module scope inside `components/Generator.jsx`** (10,281-line file). Per `refactor-prd.md:494` "the legacy renderer no longer lives inside the React root" — but it still lives in the same *file* at module level, reading mutable module singletons. Output is a raster PNG (`RenderResult.pixels`). It **cannot** emit HTML, responsive web, or email markup — the six "formats" are aspect ratios of the same canvas (`product-platform-audit-2026-07-21.md:94` "Six image ratios … not email/web/ad experiences").
- R4 of the refactor made rendering pure-ish (explicit render model in, `RenderResult` out, no writes to shared refs) — `refactor-prd.md:210-222`. This is real and valuable.

### Document model — genuinely strong
- `DesignDocumentV1` (`lib/design-document.mjs`, 559 lines) is plain versioned JSON: `content / composition / palette / typography / media / logo / shapes / furniture / pins / acknowledgements` (`refactor-prd.md:107-121`). Decoded images, DOM, selection, loading state are explicitly excluded (`refactor-prd.md:124`). The model itself is **channel-agnostic and clean** — the best asset in the codebase for the platform vision.
- Every edit (human or AI) is a **typed command** through `dispatchDesignCommand` → `designReducer`; undo stores document transitions; `CommandResult.changedPaths` drives truthful AI confirmations (`refactor-prd.md:182-196`, law 6 "Honesty" `operating-manual.md:36`). This is the shared mutation language the platform audit calls essential (`product-platform-audit-2026-07-21.md:105`).

### Command dispatch / hooks decomposition
- ~40 focused hooks (`hooks/`) each own one responsibility (persistence, sessions, autosave, gestures, readiness, advisor ledger, harmonization, export, templates…), extracted in R7.8 (`refactor-prd.md:432-486`). The React `Generator` product component is ~1,500 lines; the *file* is 10,281 because module-level renderer + shell + inspector + chrome-model all co-reside. `ArtDirectorChat` is 1,077 lines.

### Persistence / cloud
- Supabase via `@supabase/ssr` + `@supabase/supabase-js` (only cloud deps in `package.json`). Every cloud call is meant to be null-safe and mirror to localStorage (`operating-manual.md:46` graceful-degradation contract). Known violators that 500 instead of `{configured:false}`: `app/api/brand/route.js` and `app/api/images/route.js`.

### AI surfaces
- **Assistant** (`app/api/assistant/route.js`, 1,888 lines): intent-classified art director + copywriter. LLM output is tightly caged behind strict schemas and deterministic "belts" (intent → patch mapping, claim-vs-render verification). Monolithic (mixes intent parse, belts, prompt build, model call, image gen, patch normalize, narration) — `product-platform-audit-2026-07-21.md:241`.
- **Design audit** (`app/api/design-audit/route.js`): manual vision-model critique, merged into the one ledger (advice-ledger law).
- **Harmonizer** (`hooks/useDesignHarmonization.js`): silent auto-repair of AI patches + debounced manual-edit repair, respecting pins/acks (born-clean, law 4/5).
- **Caption/copy writer**: in the assistant route (`route.js:770` copywriter system prompt).
- **Moodboard learning** (`lib/moodboard-genes.js`): extracts "genes" from liked designs; likes weight rotation priors. Static extraction + frequency weighting, not model learning.

### Test / guard infrastructure — a real strength
- 49–52 pure unit tests (`scripts/tests/*.test.mjs`); Playwright **resident tester** runs semantic journeys against a production build, mocking paid image gen and intercepting cloud writes (`operating-manual.md:157-158`, `product-platform-audit-2026-07-21.md:225`).
- Layout-time invariant guards: `bornClean` oracle, `__woArchStress`, `__woLegacyDupGuard` (`advice-ledger-spec.md:73`). Product "laws" enforced in code (`operating-manual.md:28-37`).
- **Gaps:** no documented CI workflow; nightly cron's node path broken (`operating-manual.md:158`); no integration/auth/tenant-isolation tests.

### What is genuinely strong (preserve)
1. `DesignDocumentV1` + typed-command mutation language — channel-agnostic, replayable, testable.
2. Claim-vs-render honesty system (`renderTruth`, self-correction) — trust foundation.
3. Master + per-format inheritance (`{master, byFormat}` resolver) — seed of a campaign-variant model.
4. One advice ledger (dedup by decision, ack-binding) — seed of explainable compliance.
5. Semantic resident tester + pure unit suite + born-clean oracle — unusually disciplined for this stage.

---

## 2. VISION-CRITICAL GAPS (per pillar: what the architecture can / cannot do today)

### (a) Multi-workspace / multi-brand
- **Schema: ~30–40% ready.** Tables carry a `brand_id` column (`schema.sql:105` `logo_variants`, `:147` `brand_overlays`, plus images/exports/sessions). The data model *anticipates* many brand rows.
- **Runtime: 100% single-tenant.** Every route hardcodes `const BRAND_ID = '00000000-0000-0000-0000-000000000001'` — 10 confirmed sites: `assistant/route.js:98`, `design-audit/route.js:7`, `brand/route.js:3`, `sessions/route.js:11`, `templates/route.js:6`, `feedback/route.js:17`, `moodboard/route.js:12`, `drafts/route.js:6`, `logo-variants/route.js:14`, `overlay-assets/route.js:19` (14 sites total counting constants). There is **no middleware** (`middleware.*` absent), **no auth** (no `getUser`/`next-auth`/`clerk` anywhere; only cloud deps are Supabase), **no RLS**, and one physically shared brand row. `schema.sql:210` states it outright: *"no auth, single shared space keyed by BRAND_ID."* The multi-tenancy spec's P2 (auth + subdomain→brand resolution + RLS) is **entirely unbuilt** (`multi-tenancy-spec.md:29-31`). The brand row + `brand_id` columns get you the storage shape; nothing at runtime resolves or isolates a tenant.

### (b) Structured brand knowledge base
- **Exists:** `lib/brand-defaults.js` (139 lines — palette `B`, font role map `F`, logo variants, photographer brief), moodboard "genes" (`lib/moodboard-genes.js`), guardrail **prose** strings, brand-kit admin (named colors, font-family names, decorative SVG/PNG uploads).
- **Missing for "AI understands the brand":** a versioned, typed rule model. Rules today are prose and constants — no rule IDs, types, scope, severity, positive/negative examples, source citation, or version history (`engineering-principles.md:41-48`, `product-platform-audit-2026-07-21.md:239`). No ingestion workflow (upload guidelines PDF/site → structured draft profile). Typography stores family *names*, not managed font assets. Critically, **brand identity is embedded in AI prompt prose**: `assistant/route.js:770` ("social copywriter for … a Singaporean preschool / early-education brand"), `:1170` ("Art Director … Singaporean education brand for students aged 10 and above" — internally inconsistent with the preschool prompt), `design-audit/route.js:162` ("The White Orchid, a Singaporean education brand"), `lib/higgsfield.js` (photographer brief). The ratified "zero brand facts in code" law (`operating-manual.md:36`) is **not implemented** — ~20 hardcoded brand-fact lines survive across 14 files.

### (c) Campaign objective → multi-asset generation
- **Today:** one design at a time. Landing prompt → one editable canvas (`product-platform-audit-2026-07-21.md:26`). Weak grouping only via session `group_id`.
- **Missing:** the entire campaign domain (`CampaignBrief → Concept → AssetSet → AssetVariant`, `engineering-principles.md:30`). Multi-channel is the hard wall: emails and web variants are **not** canvas PNGs — they need HTML/responsive renderers the codebase does not have. The six formats are aspect ratios, not channels. Campaign-scale generation also needs a durable async job layer (idempotency, retries, budgets) that does not exist — today it's long-lived request handlers (`product-platform-audit-2026-07-21.md:247`, `engineering-principles.md:104`).

### (d) Validation engine
- **What it is:** `lib/audit-local.js` (1,230 lines) — a set of **hand-coded, White-Orchid-specific heuristics** (contrast floors, legibility ladder, safe zones, density, born-clean guards, colour label recognition). The vision audit (`design-audit/route.js`) is a brand-prose-primed model critique. Both are excellent *seeds* of "explainable compliance," and the one-ledger + dedup-by-decision + ack machinery is real (`advice-ledger-spec.md`).
- **Distance from the vision:** it is **not a general engine** driven by brand data. It is procedural checks tuned to one brand; colours are recognized partly by specific labels; findings lack rule IDs/provenance/source (`product-platform-audit-2026-07-21.md:239`, `engineering-principles.md:41`). To become "validates every change against brand rules" for arbitrary brands, the checks must read a versioned rule set, not hardcode thresholds.

### (e) Learning loop
- **Spec (ratified):** capture → claim-vs-result verification → one-tap signal → periodic human-ratified learning pass; nothing self-applies (`self-improvement-loop.md`).
- **What actually runs:** claim-vs-render honesty is live (real). Passive capture of feedback/undo/keep/export signals exists. But the "learning" is a **manual `learning-pass` script + like-frequency priors** (liked genes up-weight rotation via `moodboard-genes.js`). There is no causal loop from objective → shipped asset → outcome, no versioned proposal/approval model, and by explicit design **nothing auto-applies** (`operating-manual.md:112`, `product-platform-audit-2026-07-21.md:249`). "Gets smarter with usage" is instrumented but not closed.

### (f) Permissions / governance
- **None.** No identity, roles, memberships, workspaces, approval states, review links, or audit trail. This is a hard blocker for the agency/enterprise wedge (`product-platform-audit-2026-07-21.md:98,192`).

---

## 3. TECHNICAL DEBT INVENTORY (rated: blocking-the-vision / drag / cosmetic)

| # | Debt | Evidence | Rating |
|---|---|---|---|
| 1 | **No auth / tenant boundary; service-role key on every route; no RLS; unauthenticated PATCH rewrites the brand kit; `brand-library` + `feed-photo` are open, unthrottled, credit-spending endpoints** | no `middleware.*`, no auth dep in `package.json`; `schema.sql:210`; 10 hardcoded `BRAND_ID` route sites | **BLOCKING** |
| 2 | **Zero-brand-facts law unimplemented — brand identity hardcoded in AI prompt prose + routes** | `assistant/route.js:770,1170`; `design-audit/route.js:162`; `higgsfield.js`; ~20 lines / 14 files | **BLOCKING** |
| 3 | **Canvas-2D-only renderer — no HTML/email/web output path** | renderer module-level in `Generator.jsx`; `RenderResult.pixels` is PNG; `product-platform-audit:94` | **BLOCKING** (multi-channel) / drag (today) |
| 4 | **No general validation engine — audit is hand-coded WO heuristics** | `audit-local.js` (1,230 lines); findings lack rule IDs/provenance | **BLOCKING** (platform) / drag (single-brand) |
| 5 | **No durable async job layer for campaign-scale generation** | long request handlers; `engineering-principles.md:104` | **BLOCKING** (campaigns) |
| 6 | **`Generator.jsx` = 10,281-line file with module-level mutable singletons (`B`, `F`, `LOGO_VARIANTS`) co-resident with renderer + shell + inspector** | `wc -l`; `refactor-prd.md:487-494` | **DRAG** (blocks tenancy: per-request brand config impossible while brand lives in module mutables) |
| 7 | **Monolithic assistant route (1,888 lines mixing 7 concerns)** | `app/api/assistant/route.js`; `product-platform-audit:241` | DRAG |
| 8 | **M6 "mirror miss" — mirror-check guards only 2 of 5+ hand-synced surfaces; an unguarded 3rd archetype table lives in `assistant/route.js`; unknown enum values fail silently** | `operating-manual.md:48,68`; auto_mirror-touchlist skill | DRAG |
| 9 | **Graceful-degradation violations: `brand/route.js` + `images/route.js` 500 on missing cloud instead of `{configured:false}`** | `operating-manual.md:46`; `brand/route.js` | DRAG |
| 10 | **No CI workflow; nightly cron node path broken; resident report shows 6–8/10 journeys passing, Export didn't open, format strip flaky** | `operating-manual.md:158`; `refactor-prd.md:525-531` | DRAG |
| 11 | ~100-hook App component / very high hook count | `hooks/` (~40 files) + App | COSMETIC/drag |
| 12 | Tracked generated artifacts (179 images), multiple stray `.next-*` dirs, dead Vite `src/` + stale README | `operating-manual.md:26,76`; top-level `ls` | COSMETIC |

---

## 4. SCALE & SECURITY REALITY CHECK

**At 1 brand (today):** works. Single shared row `…0001`, staging and local share it (`operating-manual.md:160`).

**At 10 brands:** breaks immediately without the security+brand seams. There is one physical brand row and a hardcoded `BRAND_ID` in every route — a 10th brand cannot exist at runtime without editing code. No middleware to resolve subdomain→brand. No auth to say *who* is asking. The `brand_id` columns exist but nothing populates or filters by them per-request. Brand-fact prose in prompts means every brand would get "Singaporean preschool" copy.

**At 100 brands:** the model-learning story collapses further — one shared like/feedback flywheel with no `brand_id` scoping at the query layer means taste bleeds across brands (spec wants per-brand flywheels, `multi-tenancy-spec.md:11`, but runtime doesn't scope). No async job layer means campaign generation for 100 brands overruns request timeouts. No cost controls per workspace.

**Secrets handling:** service-role Supabase key is used **server-side on every route** with no membership check — so any caller who can reach a route acts with full DB privileges scoped only by the hardcoded constant. `FEEDBACK_DEV_KEY` gates one GET (`operating-manual.md:159`). No `NEXT_PUBLIC_` leak of the service key was found (good), but the open credit-spending routes (`feed-photo`, `brand-library`) are unauthenticated and unthrottled — a direct financial-abuse vector. Provider keys (Higgsfield, OpenAI/gpt-image) are server-only.

**Shared-brand-row model:** `schema.sql:210` — "no auth, single shared space keyed by BRAND_ID." Any client can `PATCH` the brand kit (rewrite colors/fonts/guardrails) with no identity. Sessions/feedback write to the one shared row; test pollution of the client's real Posts feed is a known recurring bug (`operating-manual.md:52`).

**API auth on routes:** open. Every route in `app/api/*` is reachable unauthenticated. This is the single largest release blocker for any external customer.

---

## 5. REFACTOR RECOMMENDATIONS (strangler-fig, incremental; the canonical-document refactor just landed and works — do NOT restart a broad UI refactor)

**Principle:** the `DesignDocumentV1` + typed-command core is the right foundation — build the platform *around* it, not through it. Refactor along product boundaries (matches `product-platform-audit-2026-07-21.md:391` and `engineering-principles.md`).

### BEFORE any vision feature (blocking prerequisites)

**R1 — Security + tenant seam (do first).** Add request-context resolution: auth (Supabase Auth), `resolveBrandContext(request)` middleware, and RLS on every tenant-owned table. Replace the 14 hardcoded `BRAND_ID` constants with the resolved context (a mechanical, testable strangler pass — one route at a time, each landing with a negative isolation test). Close the open credit-spending routes behind auth + rate limits. This unblocks *every* multi-brand pillar and is the highest-ROI work. It does **not** touch the document model.

**R2 — Brand seam (do second).** Promote `brand-defaults.js` → a versioned `BrandProfileV1` **data** object (typed rules: colors+roles, managed fonts, voice, claims, exclusions, logo rules, imagery grammar, exemplars, source, version — `engineering-principles.md:41`). Move the AI prompt prose (`assistant/route.js:770,1170`, `design-audit:162`, `higgsfield.js`) into brand tokens injected per-request — this simultaneously (a) implements the zero-brand-facts law, (b) generalizes the copywriter/art-director/audit prompts to any brand, and (c) gives the validation engine a data source. Refactor `audit-local.js` incrementally to read thresholds/rules from the profile instead of hardcoding them — check by check, keeping WO behavior pixel-identical (`multi-tenancy-spec.md:15` "the proof is White Orchid does not change").

### CAN WAIT (build after the two seams, incrementally)

**R3 — Output/render seam.** Extract the module-level renderer + `B`/`F`/`LOGO_VARIANTS` singletons out of `Generator.jsx` into an injected, tenant-neutral render config (prerequisite for per-request brand rendering — debt #6). Then treat Canvas 2D as **one output adapter** behind a channel-output interface, and add an HTML/email adapter reading the **same `DesignDocument`** as a second adapter. This is how multi-channel arrives without a rewrite. Defer until a campaign actually needs email/web.

**Also defer (in priority order, not prerequisites):** campaign domain entities (`CampaignBrief/Concept/AssetSet`) layered around the existing document; a durable job layer for campaign-scale generation; typed-stage split of the assistant monolith; the learning proposal/approval/version model; CI + fixing the export/format/nightly failures. Do **not** build the (unspecced) "Post Now" publishing integration before the campaign + governance foundation exists (`product-platform-audit-2026-07-21.md:133`, `engineering-principles.md:16`).

**Sequencing rule:** strangler migration — old White Orchid behavior runs through adapters while each new seam replaces a fixed-ID or hardcoded path; new domain/server code in TypeScript with runtime schemas; existing stable JS modules migrate only when their boundary is touched (`product-platform-audit-2026-07-21.md:405`).
