# White Orchid Generator — Product Audit

Date: 2026-07-21 · Method: read-only. Hands-on browse of an isolated local production
build (`WO_DIST_DIR=.next-audit`, `NEXT_PUBLIC_WO_TEST_HOOKS=1`) with **all AI/photo
provider keys unset** (OpenAI → assistant 503s honestly; Higgsfield → photo-gen degrades
to Library samples). Zero credits spent, zero cloud writes issued, dist cleaned up after.
Source verified via two parallel Explore passes over the editor and the AI/brand/learning
systems. Cross-checked against the owner's prior strategic doc
(`docs/product-platform-audit-2026-07-21.md`).

**One-line verdict:** A genuinely excellent, unusually *honest* single-brand social-post
studio. As measured against the stated vision ("AI-native brand platform, enforcement not
generation, workspace → brand KB → objective → multi-asset campaign → validate → publish →
learn"), it is a superb implementation of the **middle third** (generate one post → edit →
validate → export) and is largely **absent at both ends** (objective/campaign in; publish +
learning out). Brand enforcement is real but hand-tuned to one brand, not a rules engine.

---

## 1. Feature inventory (experienced hands-on where possible)

| # | Surface | What it does | Maturity | Evidence |
|---|---------|--------------|----------|----------|
| 1 | **Landing prompt flow** | "What do you want to create today?" single input + suggestion chips + "Skip to the studio" | **Polished** | Browsed live; chips are brand-specific ("welcome-back-to-school", "We're hiring educators") → single-post, single-brand orientation |
| 2 | **Editor canvas** | Canvas2D render + SVG selection chrome (resize/rotate/drag handles), direct-manipulation, hit-testing | **Polished** | `EditorCanvas.jsx` (44L, scale-aware handles, a11y); gesture engine `useCanvasGestures`; clicked photo → selected + inspector opened live |
| 3 | **Contextual inspector** | Element-type router (Background/Photo/Caption/Logo/Shapes) with per-element controls | **Polished** | `ContextualInspector.jsx` + 7 `*InspectorPanel.jsx` (all thin, memoized, no TODOs); verified live element-switcher pills |
| 4 | **Mobile half-sheet** | Two-detent bottom sheet, keeps selection visible, ResizeObserver, reduced-motion aware | **Polished** | `useMobileInspectorSheet.js` (145L) — unusually thorough (auto-scroll, settle-check, outside-tap dismiss) |
| 5 | **AI chat director ("Orchid")** | Free-text + chips → `{reply, patch}`; deterministic "belts" first, gpt-4o-mini fallback; verifies narration against **render truth** | **Works (verging polished), monolithic** | `assistant/route.js` (1888L), `ArtDirectorChat.jsx` (1413L); self-correction cascade `:812–1000`. Degrades honestly with key unset: *"AI isn't set up yet. You can still use the studio."* |
| 6 | **Advisor / readiness** | Per-format "ready to post" checks → canvas dots + popover fixes ("Move to a clearer spot" / "Edit myself" / "Keep it this way") | **Polished** | Verified live: `logo-legibility` finding, applied auto-fix → readiness flipped `ready:false→true`, needCount `1→0`. `audit-local.js` (1230L, WCAG/pinned/drift), `advice-ledger-spec.md` ratified |
| 7 | **Vision design-audit** | gpt-4o judges ONLY subjective dims (hierarchy/brand/composition/polish), told what local already caught | **Works** | `design-audit/route.js:136–149`; rate-limited 5/min, opt-in; palette named in prose (hardcoded) |
| 8 | **6-format cascade** | One design → IG Portrait/Square, Story/Reel, Twitter, Facebook, Banner; master (`ig_square`) + per-format overrides | **Polished** | Verified live ("YOUR POST IN EVERY FORMAT", 6 thumbs w/ per-format readiness); `DIMENSIONS` @ `Generator.jsx:2595` |
| 9 | **Export** | PNG/JPG × all 6 formats ("Download all 6 formats"), single or batch | **Works** | `ExportPanel.jsx` + `useExportOrchestration.js`; per-dim try/catch + retry summary. Weak link: 6× sequential `<a>.click()` @300ms may be browser-throttled |
| 10 | **Templates / gallery** | Shared team template library + Posts/Favourites/Moodboard tabs; **proposal-gate** lifecycle (proposed→official/declined, human-gated) | **Works, hardened** | `templates/route.js` (250L); un-migrated-DB graceful degradation; producer of proposals not yet wired |
| 11 | **Moodboard learning** | Owner uploads *external* inspiration → 1 cheap vision call → closed "gene" vocabulary (palette/composition/treatment/type/density) mapped back to real brand tokens | **Works — foundation only** | `moodboard-genes.js:46–65`; header says *"builds no learning logic"* — the consumer/proposal engine is future work |
| 12 | **Caption writer** | Design state → per-platform caption + hashtags + alt-text; X ≤280 enforced, no invented facts, tone-scrubbed | **Polished** | `assistant/route.js:679–845` (`handleCaption`), rewrite mode, banner=no-hashtags |
| 13 | **Photo generation** | Higgsfield "Soul" text2image primary, gpt-image-1 fallback; "photographer's brief" forbidden from brand/text words; per-photo vision QC; never throws | **Polished** (described, not invoked) | `higgsfield.js` (refusal contract `:28–33`, QC `:367`, wave-of-4). Optional trained `soul_id` = consistency lock |
| 14 | **Midjourney launcher** | **Manual** copy/paste helper: shows a hardcoded personalization code, user generates in MJ, downloads, re-uploads as "Midjourney render" | **Works, deliberately low-tech** | `MidjourneyLauncher.jsx` — no automation; brand consistency rides on one `--p` code by hand. Library shows 118 imgs, ~all Midjourney-type |
| 15 | **Cloud sessions / Posts feed** | 1 session = 1 post (design+chat), local-first, Supabase mirror; conflict resolution; auto-archive >10; likes store "genes" | **Works, battle-scarred** | `sessions.js` (473L). Ships a **harness kill-switch + guard-pollution purge** — scar tissue from test data leaking into the *shared* single-brand DB |
| 16 | **Brand kit admin** | Color roles (Primary/Secondary/Accent/Neutral), 3 font roles, decorative SVG/PNG upload, prose guardrails | **Works (thin)** | Browsed live: *"single source of truth… every post generated by school staff"*; no ingestion, no versioning, no structured rules, no hex validation |
| 17 | **Upload / Asset Library** | 118 images; TYPE filter (Midjourney/Real photo); real **consent workflow** (N/A/Cleared/Pending/Blocked) | **Works** | Browsed live; consent status enforced for real photos (`images/route.js:43`) — meaningful for a child-photo brand |
| 18 | **The Guide** | 8-step onboarding overlay, focus-managed, ESC-close, describes `/feedback` chat command | **Polished** | `QuickGuide.jsx` (72L) |
| 19 | **"How it works" pipeline map** | Nav link → **external claude.ai artifact** | **N/A (external)** | `ref href=https://claude.ai/code/artifact/…` — not an in-product surface |

Cross-cutting strengths (verified in both source and browse): **graceful degradation is
universal** (every route → `{configured:false}` + localStorage; every AI call has a
non-AI fallback; nothing throws to UX), and **honesty is architected in** (render-truth
verification, anti-re-litigation advice ledger, photo QC, honest "AI isn't set up" state).

---

## 2. Vision-stage coverage map

Vision workflow: **workspace setup → brand KB → objective → generate → edit + validate →
export/publish → learn.**

| Stage | Coverage | State | Notes |
|-------|----------|-------|-------|
| **Workspace / team setup** | ~5% | **Absent** | One hardcoded brand UUID `00000000-…-0001` in 6+ routes; no org/workspace/membership/role; multi-tenancy is a ratified spec only. "Team" = a shared single-brand DB (which caused real data-pollution incidents). |
| **Brand KB ingestion** | ~15% | **Thin/Absent** | Brand kit = editable colors + 3 fonts + decorative assets + prose guardrails. No guidelines-PDF/website ingestion → structured rules. No voice/claims/audience/imagery-grammar model, no versioning, no rule provenance. Facts live in `brand-defaults.js` (139L of White Orchid literals) + prompt prose + `design-patch.js` enums. |
| **Objective / campaign in** | ~10% | **Absent** | Landing = "describe the post". No objective→strategy step, no audience/offer/channel-mix, no concepts. Weak `group_id` on sessions ≈ ghost of campaign grouping. |
| **Generate** | **90%** | **Strong** | Prompt→post, born-clean layout, 6-format cascade, photo gen, caption writer. But single asset per generation — not concept sets or channel variants. |
| **Edit** | **95%** | **Strong** | Canvas + inspectors + chat director + typed command/design-document model + undo/redo. Over-weighted relative to the thesis (this is where a Canva war is *lost*, not won). |
| **Validate** | **85%** | **Strong** | Deterministic local audit + advisor dots + human-in-the-loop ack ledger + optional vision pass. The best-differentiated surface. Gap: findings are hand-tuned heuristics, not rule-IDs with source/severity/version. |
| **Export** | **80%** | **Solid** | PNG/JPG × 6 formats, honest. |
| **Publish / activate** | 0% | **Absent** | Spec'd (scheduler) but unbuilt — correctly deferred per the strategy doc. |
| **Learn** | ~20% | **Instrumentation only** | Likes store genes, moodboard classifies genes, feedback ring-buffer, template proposal-gate, `learning-pass.js` — all *capture*, no closed loop. Explicitly "builds no learning logic." No brief→asset→outcome join, no evidence-backed proposal→owner-approval→new brand version. |

**Absent list that matters most (verbatim against the vision):**
1. **Campaign objectives** (vs single-post prompts) — the product starts one rung too low.
2. **Multi-asset campaign outputs** (emails, web variants, ad sets) — only image ratios exist.
3. **Brand KB ingestion** (guidelines upload → structured, versioned rules) — the KB is a form.
4. **Workspace / team / tenant concepts** — a hardcoded single brand; the #1 architectural blocker.
5. **Publish** — spec'd, unbuilt (rightly deferred).
6. **Learning loop** — rich instrumentation, no causal join or approval model.

---

## 3. "On-brand by default" reality test

**How brand is enforced today (real, and better than most tools):**
- **Born-clean generation** — fresh designs fit copy to per-role budgets so they carry *zero*
  advisor dots at birth; enforcement is layout-time, not post-hoc flagging (`route.js:428–448`;
  `__woBornCleanGuard` returned pass, 456 cells, 0 offenders live).
- **Closed-enum patch schema** — the AI *cannot emit* an off-brand color/font/logo because every
  visual field in `design-patch.js:35–39` is restricted to a hardcoded White-Orchid token list
  (`bgColor: burnham/whiteSmoke/wisteria/celadon/jet/dustyPink…`, 14 logo lockups, archetype set).
  This is the actual "on-brand by default" lock, and it is elegant.
- **Advisor/readiness ledger** — WCAG contrast, logo legibility, safe zones, archetype drift,
  dropped content, per-format. Verified live end-to-end (finding → auto-fix → re-validate).
- **Brand fonts & palette** hydrated from a DB row (a thin override: ~8 colors + 3 fonts).
- **Photo QC + trained Soul** — generated photos vision-checked for text/poster layout; optional
  `soul_id`/Midjourney `--p` code locks the visual identity.

**Where a user can drift off-brand without the system noticing:**
- **Free-text copy typed on canvas** is never brand-checked for voice/claims — the tone rules
  (`toneScrub`, no exclamation marks) apply *only* to model-written fields (`TONE_FIELDS`), not
  to what a human types directly.
- **Uploaded real photos** pass unchecked — only AI-generated Higgsfield photos hit QC. An
  off-palette staff photo sails through.
- **Guardrails are advisory prose** "shown to staff before export" — nothing enforces them.
- **Admin brand-kit edits have no validation** — hex fields accept any string, so an admin can
  point the "lock" at off-brand values and the enforcement now enforces the wrong thing.

**Is it a rules engine or one-brand heuristics? → One-brand, hand-tuned.** The White Orchid
identity is baked at three layers: (a) `brand-defaults.js` (139L of literals: hexes, fonts
Romie/Syne/Fira/Aboreto, 14 logo paths, `thewhiteorchid.sg`, voice rules, a photographer brief
naming "ten-year-old Asian child… forest green, ivory, terracotta"), (b) prompt prose in the
assistant + audit routes ("Burnham green, ivory, wisteria, celadon, tangerine, jet"), and (c) the
`design-patch.js` enum token space. The `brand_kit` DB override reaches only colors + 3 fonts;
archetypes, logos, photo brief, tone, and the enum space stay hardcoded. **The engine's *shape*
is general and excellent; its *content* is one brand welded into source.** Enforcement is real
but does not yet generalize.

---

## 4. Workflow friction audit ("every feature simplifies the workflow")

**Primary journey (prompt → edit → export), walked live:**
1. Landing → type one sentence (or chip) → **1 step** to a fully-composed, born-clean, 6-format post.
2. Studio → click any element → contextual inspector → edit; or type "make the background wisteria";
   or tap a quick chip. Undo/redo everywhere.
3. Advisor dot appears only when something's genuinely off → one-tap auto-fix → re-validated.
4. Export → one format or all six.

**Where it already beats Canva-class tools:**
- **One-sentence → finished multi-format post** (Canva makes you pick a template and lay it out).
- **6-format cascade from one design** with per-format readiness (Canva's Magic Resize is dumber).
- **Honest AI** — verifies against render truth, self-corrects false claims, degrades to a truthful
  "not set up" state. Almost no consumer tool does this.
- **Born-clean + advisor** — the tool won't hand you a broken-contrast post without telling you.
- **Consent workflow** on the asset library — real governance for a child-photo brand.

**Friction / dead-ends / confusion:**
- **Free-text chat is all-or-nothing on the LLM key** — with OpenAI down, the *suggestion chips*
  and free text both dead-end to "AI isn't set up," even though deterministic belts (color/mood/
  text/font/layout) exist server-side and *could* have served some of them offline.
- **Video tab is a "coming soon" stub** in the media inspector — a visible dead-end surface.
- **Midjourney round-trip breaks flow** — leave the app, generate elsewhere, download, re-upload.
  Provenance and enforcement both break at the handoff.
- **Batch export fragility** — 6 sequential programmatic downloads at 300ms can be throttled/blocked.
- **No campaign/objective on-ramp** — a founder who wants "a launch campaign" must instead think in
  single posts and repeat the journey N times.

**Where it's behind Canva/Figma (by design or by gap):**
- No drag-anything freeform canvas (deliberate — and correct not to chase).
- No multi-page / carousel / doc.
- No real-time collaboration, comments, review links, or roles.
- No brand *portfolio* (one brand only).

---

## 5. Feature-bloat check (against the vision's workflow)

Named honestly — surfaces whose complexity outruns the "enforce one brand, simplify the workflow" thesis:

- **Overlay system (strongest bloat candidate).** 4 render modes incl. client-side **line-art
  extraction with an "ink sensitivity" threshold** + accessory tinting (`OverlayInspectorPanel.jsx`,
  `drawLineArtLayer`). This is a mini graphics engine inside a brand-post tool; high maintenance,
  low thesis-value.
- **Photo-treatment engine** — duotone/strong-duotone/soft-lift/film-grain/warm-grade. A filter
  suite that edges toward "creative tool," not "brand enforcer."
- **Video upload tab** — a "coming soon" placeholder with no implementation. Cut or hide it.
- **Midjourney launcher** — breaks the closed loop (provenance/enforcement); the strategy doc already
  flags it to deprecate from core once in-product photo quality suffices.
- **The Guide** — well-built, but its 8-step length is a tell that the UI needs explaining; not bloat
  so much as a signal to keep simplifying the surface it documents.
- **Editor breadth generally** — `Generator.jsx` is 10,281 lines; the edit surface is the most
  *finished* part of the product and the *least* defensible part of the thesis. Every parity feature
  added here is maintenance that Canva can copy overnight.

Not bloat (earns its place): advisor/readiness, caption writer, consent workflow, moodboard genes,
6-format cascade, born-clean.

---

## 6. User-lens gap notes — top 3 missing per persona

**Startup founder (solo, non-designer, wants speed):**
1. **Campaign/objective on-ramp** — "announce our seed round" → a coherent set, not one post at a time.
2. **Bring-your-own-brand in <10 min** — paste a website/logo/2 colors → a working brand; today it's
   hardcoded White Orchid + an admin form with no ingestion.
3. **More channels than image ratios** — at minimum a simple email header + an X/LinkedIn text variant.

**Marketing team (2–10 people, recurring cadence):**
1. **Real workspace + roles + review** — approval states, review links, comments; today it's a shared
   single-brand DB with no auth (and documented pollution scars).
2. **Content calendar / campaign grouping** — plan and batch a week/month; `group_id` is a stub.
3. **Multi-asset campaign generation** — one brief → paid + organic + email + web variants as a matrix,
   not N hand-repeated single posts.

**Agency (managing many client brands):**
1. **Multi-tenant client isolation** — separate, provably-isolated brand workspaces; the #1 blocker
   (one hardcoded `BRAND_ID`, no tenant boundary, service-role CRUD, no membership checks).
2. **Fast brand onboarding from client guidelines** — upload a brand-guidelines PDF → structured,
   versioned rules; today impossible.
3. **Client review + white-label export/handoff** — shareable review links, approval, provenance;
   none exist.

---

## Bottom line

Protect: the design-document/typed-command model, the advisor/readiness ledger, render-truth honesty,
born-clean generation, the 6-format cascade, and graceful degradation. These are a rare, high-quality
foundation. The strategic move is not more editor breadth — it's to (a) break the single-brand weld
into a real tenant + versioned BrandProfile model, (b) add an objective→concept→multi-asset campaign
layer above the current single-post generate step, and (c) close the learning loop with evidence-backed,
owner-approved brand-rule proposals. The product is a superb *middle third* of its own vision; the ends
are where the platform (and the moat) actually live.
