# Product and technical audit — brand intelligence platform

Status: **strategic proposal for ratification**  
Date: 2026-07-21  
Evidence base: repository at `08ef373`, current product/docs contracts, schema,
API routes, unit and resident-test evidence, and current competitor documentation.

This document does not override the ratified editor contracts. It proposes the next
product architecture and roadmap.

## Executive verdict

The product is a credible, unusually thoughtful **single-brand social asset studio**.
It is not yet an AI-native brand platform.

The strongest work is below the visible UI: a canonical design document, typed edit
commands, format inheritance, render verification, a unified advice ledger, deterministic
audits, honest assistant reconciliation, and a human-in-the-loop feedback trail. Those are
the right foundations for governed creation and should be preserved.

The strategic gap is above and around that engine. Brand knowledge is mostly a fixed row,
fallback constants, prompt prose, and White-Orchid-specific heuristics. There is no tenant
boundary, identity or permission model, structured and versioned brand rules, campaign
domain, approval lifecycle, publishing boundary, or outcome-driven learning system. The
current experience still starts from “make a post” and converges on one editable canvas.
The vision starts from a business objective and produces a governed campaign system.

The product should not become a smaller Canva. It should become a **brand compiler**:

> Objective + audience + channel + versioned brand knowledge → campaign concepts and
> asset variants → deterministic and semantic validation → approval → export/activation →
> measured evidence → human-approved brand learning.

The editor remains important, but becomes the exception-handling and refinement surface,
not the center of the product thesis.

## What exists today

### Product surfaces

- Prompt-first landing page and a social post editor.
- Six responsive output formats with master/per-format inheritance.
- Direct canvas selection, contextual inspectors, undo/redo, templates and export.
- AI art director that can edit structured design fields and generate photography.
- Brand-kit administration for named colors, font-family names, guardrail text, and
  decorative SVG/PNG assets.
- Saved posts, templates, brand library, moodboard/likes, feedback capture, and weak
  campaign grouping through session `group_id` fields.
- Local and vision-based design audits plus pre-export readiness findings.

### Technical shape

- Next.js 14 App Router and React 18.
- Supabase persistence accessed by server routes and a browser client.
- A `DesignDocumentV1` domain object with typed command application, migrations and
  persistence envelopes.
- A Canvas 2D render engine, render result/bounds contracts, deterministic local audit,
  and format-aware layout inheritance.
- Focused hooks for commands, selection, gestures, sessions, autosave, audit, export,
  templates and feedback.
- OpenAI Responses orchestration plus image-provider fallbacks.
- Pure unit tests and a Playwright resident tester that exercises messy user requests,
  claim honesty, layout integrity, format switches and export.

### Architecture map

```text
Next pages
  landing / generate / library / upload / brand admin
                    |
            Generator orchestrator
      chat | canvas | inspectors | export | history
                    |
       DesignDocumentV1 + typed commands
                    |
    renderer -> render result -> audit/readiness
                    |
  Next API routes -> OpenAI/image providers/Supabase
                    |
     fixed default brand row + shared cloud tables
```

The edit path is increasingly coherent. The platform boundary is not.

## Vision-fit scorecard

| Capability | Current state | Verdict |
|---|---|---|
| On-brand generation | Strong rules for one preconfigured brand | Promising engine, not a platform |
| Structured brand knowledge | Palette/font strings/guardrail prose plus constants | Missing |
| Brand ingestion | Manual fields and decorative upload | Missing the knowledge-building workflow |
| Campaign objective → strategy | Landing prompt creates a post | Missing |
| Concepts, copy and layouts | Assistant proposes and patches one design | Partial |
| Cross-channel asset system | Six image ratios | Narrow; not email/web/ad experiences |
| Brand validation | Deterministic layout/a11y checks plus a vision critique | Strong seed, weak provenance |
| Editing | Rich canvas, chat and inspectors | Valuable but over-weighted |
| Collaboration/governance | None | Blocker |
| Multi-tenancy | Ratified spec only; fixed shared brand ID at runtime | Blocker |
| Learning | Feedback, undo/keep/export signals and proposal heuristics | Good instrumentation seed; no reliable learning loop |
| Publishing/performance | Export only | Missing, but should not be rushed |

## Product audit

### What should be protected

1. **The command and design-document model.** AI and humans increasingly use the same
   mutation language. This is essential for explainability, undo, validation and replay.
2. **One idea across formats.** Master values plus intentional format overrides are the
   beginning of a campaign-variant model.
3. **Validation beside creation.** The advice ledger can become the visible proof that an
   asset is brand-safe, accessible and channel-ready.
4. **Claim-versus-result honesty.** An assistant that verifies the actual design state is
   more trustworthy than one that merely narrates its intention.
5. **Human-ratified learning.** Capturing rejection and acceptance signals without silent
   autonomous tuning is the correct safety posture.

### What should be reframed

- **Brand kit → Brand profile.** A kit stores assets. A profile expresses identity,
  audience, positioning, voice, claims, exclusions, logo rules, type scale, color roles,
  imagery grammar, channel rules, exemplars and rule provenance.
- **Template → Brand program.** Templates should be constrained, parameterized programs
  compiled from a brand profile—not the main source of brand intelligence.
- **Post → Asset variant.** A post is one output within a concept and campaign, with a
  channel, locale, audience, format, lifecycle state and inherited brand-profile version.
- **AI art director → Campaign copilot.** It should clarify objectives, develop concepts,
  recommend a channel mix and create an asset set before opening a canvas.
- **Readiness dots → Explainable compliance.** Every finding needs a rule ID, source,
  severity, affected variants, evidence and safe remediation.
- **Likes → Evidence.** Taste signals must be separated from business outcomes and brand
  policy. A liked asset is not automatically a correct or effective brand rule.

### What should stop or wait

- Do not build a general-purpose freeform design tool. Canva and Figma own that contest.
- Do not prioritize a scheduler before campaign generation and brand governance work.
  Publishing integrations are expensive and do not create the core moat.
- Retire the Midjourney round trip from the core workflow once in-product image quality is
  sufficient. External prompt copying breaks provenance and enforcement.
- Do not add more global layout archetypes until they carry brand/channel compatibility
  metadata and can be evaluated as part of a governed system.
- Do not infer brand learning directly from exports or likes. Present evidence-backed
  learning proposals for an owner to approve.

### Initial wedge

“Founders, marketing teams, agencies and enterprise” is not one initial customer.
Their governance, collaboration and buying needs conflict.

Recommended wedge: **small marketing teams and brand/creative agencies managing recurring
campaigns for 2–20 brands**. They feel the cost of inconsistency, can supply guidelines and
examples, repeat the workflow often enough to generate learning evidence, and can tolerate
a guided onboarding process. Solo founders can use a simplified seat later; enterprise is
earned after tenancy, permissions, auditability and security exist.

The primary job is:

> Turn an approved campaign brief into a coherent, channel-ready set of assets without a
> designer manually policing every variant.

## Ruthless competitor lenses

### Canva-founder lens

The current editor is too narrow to win on breadth, templates, integrations or ease of
freeform creation. Every editor feature added for parity increases maintenance without
improving the thesis. Canva would copy the visible surface quickly. The defendable move is
not better dragging; it is stronger brand-specific decisions, enforcement and learning.

### Adobe-founder lens

The product lacks the enterprise content supply chain: structured guidelines, product and
persona context, approved asset repositories, claims/compliance rules, roles, review,
approval, activation and performance attribution. Adobe is heavy and expensive; the
opportunity is to deliver the same closed-loop logic with dramatically less setup and a
better experience for smaller teams. But “guardrails shown before export” is not
governance.

### Figma-founder lens

Figma/Buzz can turn an existing design system into team templates with controlled editable
fields, layout variants and bulk creation. Competing on collaborative canvas quality is a
losing strategy. The opportunity is upstream: infer and structure the brand, generate the
campaign system, explain why decisions comply, and let non-designers work inside a safe
intent-based space.

### Agency-founder lens

The current product looks like a bespoke tool for one client. An agency needs isolated
client workspaces, fast onboarding, versioned approvals, client review links, reusable but
brand-aware operating patterns, provenance, bulk variants and predictable exports. It also
needs confidence that one client's data, prompts and learning can never affect another.

## Feature disposition

| Feature | Decision | Reason |
|---|---|---|
| Design document + commands | Invest | Core governed-edit foundation |
| Multi-format inheritance | Invest | Extend into channel/asset-set inheritance |
| Canvas editor | Maintain and simplify | Necessary refinement surface, not the moat |
| AI chat editing | Invest selectively | Route through typed tools and verified outcomes |
| Templates | Rework | Constrained brand programs with editable-slot policies |
| Brand kit admin | Replace incrementally | Needs ingestion, structured rules and versioning |
| Local audit/readiness | Invest heavily | Seed of explainable brand compliance |
| Vision audit | Rework | Must evaluate tenant rules, cite evidence and avoid hard-coded brand prose |
| Image generation | Keep provider-agnostic | Enforce brand visual grammar and provenance |
| Moodboard/likes | Rework | Separate exemplars, preference signals and outcome evidence |
| Saved posts/history | Keep | Evolve into versioned assets and campaign lineage |
| Standalone upload/library | Consolidate | One governed asset repository with metadata/status |
| Midjourney launcher | Deprecate from core | Breaks closed-loop governance |
| Scheduler | Defer | Low differentiation until campaign/output foundation exists |
| Freeform shapes/accessories | Constrain | Approved assets and brand-safe parameters only |

## Technical audit

### Strengths

- The canonical design-document/command direction has removed several conflicting state
  paths and makes undo, persistence and AI actions testable.
- Pure render models/results and role bounds support deterministic validation and direct
  canvas selection.
- Format inheritance is explicit rather than duplicated ad hoc.
- The local audit and advice ledger establish a shared issue language.
- The resident tester checks semantic outcomes, not only screenshots, and intercepts cloud
  writes/image spending in its harness.
- Documentation records product laws, migrations and failure modes unusually well.

### Critical risks

1. **No security or tenant boundary.** `/api/brand` uses a service-role client and a fixed
   brand UUID; routes have no authenticated membership check; schema comments explicitly
   describe a shared no-auth space. This blocks any external multi-customer release.
2. **Brand facts live in code and prompts.** Product routes, defaults, image prompts,
   assistant prompts, audit prompts, UI copy and verification fixtures contain White
   Orchid, Singapore and education assumptions. The ratified “zero brand facts in code”
   principle is not implemented.
3. **The brand model is too weak.** Colors are recognized partly by specific labels;
   typography stores family names rather than managed font assets; guardrails are prose;
   rules lack types, scope, severity, examples, source and version.
4. **Server orchestration is monolithic.** The ~1,900-line assistant route mixes intent
   parsing, deterministic belts, prompt construction, model calls, image generation,
   patch normalization and reply narration. It is difficult to secure, observe and extend.
5. **The editor is still a monolith.** `Generator.jsx` remains ~10,300 lines and contains
   module-level mutable brand/render configuration alongside orchestration and legacy
   renderer logic. The refactor improved state flow without finishing module boundaries.
6. **No durable asynchronous generation layer.** Campaign-scale generation, retries,
   cancellation, rate limiting and idempotency need jobs, not long request handlers.
7. **Learning lacks causal evidence.** Feedback events are useful, but there is no
   versioned policy proposal/approval model or clean join from campaign objective through
   shipped asset to performance outcome.
8. **Testing is strongest at the pure/editor layer.** API authorization, tenant isolation,
   schema migrations, provider contracts, job idempotency and rule-evaluation provenance
   need dedicated integration tests. No CI workflow is documented.
9. **Operational debt is visible.** The last resident report passed its regression gate
   but only 8/10 everyday steps passed, export did not open, format controls moved, and 8
   of 31 realistic requests raised flags. The nightly cron's Node path is documented as
   broken.
10. **Documentation has strategic conflicts.** The old roadmap targets preschool staff and
    schedules every feature pre-production; the business-model document frames a managed
    studio rather than SaaS. These should become historical after the new strategy is
    ratified.

## Target domain and architecture

### Canonical domain

```text
Organization
  Workspace
    Membership + Role
    BrandProfile (versioned)
      BrandAsset
      BrandRule
      Product
      Persona
      Exemplar
    CampaignBrief
      Concept
        AssetSet
          AssetVariant -> DesignDocument
            Finding
            Revision
            Approval
            Export/Activation
            OutcomeSignal
    LearningProposal -> owner approval -> new BrandProfile version
```

### Runtime pipeline

```text
objective
  -> brief normalization and clarification
  -> retrieve versioned brand/product/persona/channel context
  -> concept and channel plan
  -> structured copy/image/layout proposals
  -> deterministic compiler into asset variants
  -> deterministic + semantic rule evaluation
  -> human edit through the same commands
  -> re-evaluation and approval
  -> export/activation with provenance
  -> outcomes and explicit decisions
  -> evidence-backed learning proposal
```

AI may propose. Domain services validate and commit. The model never writes arbitrary
database state or silently changes brand policy.

## Three-phase roadmap

### Phase 1 — MVP completion: trustworthy multi-brand foundation

Goal: prove two isolated brands can turn a brief into a validated social asset set.

1. Choose the initial customer and define three measurable jobs-to-be-done.
2. Implement organization/workspace/user/membership/role and server-side brand resolution.
3. Add Supabase Auth and RLS to every tenant-owned table; remove fixed brand IDs and direct
   unauthenticated service-role CRUD.
4. Build `BrandProfileV1`: versioned colors/roles, managed fonts, logos and usage rules,
   voice/tone, claims, forbidden claims, audiences, imagery rules, products, exemplars and
   source citations.
5. Build guided ingestion: upload guideline PDF/assets and website URL, extract a draft
   profile, show confidence/source, require owner approval.
6. Move all White-Orchid facts out of runtime code. Onboard White Orchid and a radically
   different second brand; require screenshot and rule-evaluation isolation tests.
7. Introduce `CampaignBrief`, `Concept`, `AssetSet` and `AssetVariant`; reinterpret the six
   formats as variants of one asset set.
8. Split assistant orchestration into typed stages: understand, retrieve, plan, propose,
   validate, execute, narrate. Split renderer/editor modules by responsibility.
9. Make every readiness finding rule-backed, actionable and dismissible only with a reason.
10. Add CI gates for unit, integration, tenant isolation, migrations, build and a free
    resident smoke. Fix the known export/format/nightly-runner failures.

Exit criteria:

- Two brands share one deployment with zero cross-brand leakage.
- A new brand can be onboarded in under 60 minutes with human review.
- A campaign brief generates an editable, validated six-format asset set.
- Every generation and edit records profile version, model/provider, inputs, commands and
  rule findings.
- Core journey success is at least 95% across the resident suite, with no known P0/P1.

### Phase 2 — Differentiation: the brand-aware campaign copilot

Goal: move from “make a post” to “build a coherent campaign.”

1. Campaign strategy flow: objective, audience, offer, proof, constraints, channels,
   schedule and success metric.
2. Generate 2–3 distinct concepts, each with rationale and brand-rule traceability, before
   generating all assets.
3. Add copy and visual systems across paid social, organic social, display and simple
   email/header variants. Add channels only where the rule and render model are mature.
4. Introduce constrained brand programs: editable slots, locked relationships, variant
   rules and owner-controlled escape permissions.
5. Add review links, comments, roles, approval states, version comparison and policy gates.
6. Create brand-aware image direction using approved exemplars, casting/composition rules,
   negative constraints, provenance and provider evaluation.
7. Add bulk/locale/audience variants as a structured matrix, not duplicated canvases.
8. Turn findings into guided fixes and explain the relevant brand/channel rule in plain
   language.

Exit criteria:

- A marketer can create, review and approve a coherent multi-asset campaign without a
  designer fixing each variant.
- At least 80% of generated variants reach approval with zero manual layout repair.
- Median brief-to-approved-set time is meaningfully below the existing workflow.
- Owners trust rule explanations and false-positive rates are measured per rule.

### Phase 3 — Long-term moat: governed learning and activation

Goal: make every approved and shipped campaign improve future decisions.

1. Connect activation/performance sources selectively; retain a clean lineage from brief,
   concept, profile version and creative attributes to outcome.
2. Normalize outcome signals by channel, spend, audience and objective. Do not treat raw
   engagement as taste.
3. Generate evidence-backed learning proposals: proposed rule/preference, supporting and
   conflicting examples, confidence, expected scope and rollback plan.
4. Let brand owners approve proposals into a new profile version; preserve audit history.
5. Add enterprise governance: SSO/SCIM, custom roles, approval policies, retention,
   regional controls, audit exports and private model/provider policies.
6. Build a provider-evaluation layer that continuously measures copy/image models against
   per-brand rubrics, cost, latency and approval rate.
7. Offer an API and integrations only after the domain contracts are stable.

The moat is not the model. It is the accumulated, permissioned graph connecting brand
rules, creative decisions, approvals and normalized outcomes—with a product that can act
on that graph safely.

## Refactoring sequence

Do not start another broad UI refactor. Refactor along product boundaries:

1. **Security seam:** request context, auth, tenant resolution and RLS.
2. **Brand seam:** `BrandProfileV1`, repository, versioning, rule evaluator and complete
   removal of runtime brand literals.
3. **Campaign seam:** campaign/asset-set entities and lineage around the existing design
   document.
4. **AI seam:** typed orchestration services and provider adapters; keep deterministic
   intent handlers only as explicit tools/policies.
5. **Render seam:** extract the remaining renderer and brand configuration from
   `Generator.jsx`; make renderer input pure and tenant-neutral.
6. **Job seam:** durable generation jobs with idempotency, retries, budgets and status.
7. **Learning seam:** event taxonomy, outcome joins, proposal/approval/version model.

Use a strangler migration: old White Orchid behavior runs through adapters while each new
domain seam replaces a fixed-ID or hard-coded path. Avoid a big-bang TypeScript rewrite;
new server/domain contracts should be TypeScript and existing stable modules migrate when
touched.

## Decisions required before implementation

1. Ratify the initial customer wedge and the first three campaign jobs.
2. Decide whether a workspace owns one brand or a portfolio of brands. Recommendation:
   organization → workspaces/projects → brands, with agencies allowed multiple brands.
3. Define which rules block export versus warn, and who may override them.
4. Choose the first channels after social images; recommendation: Meta paid/organic and
   simple display before full email/web builders.
5. Define data retention and whether customer content may ever improve shared systems.
   Default should be tenant-private learning only, opt-in for anything broader.
6. Archive or supersede the old roadmap/business-model thesis after this strategy is
   ratified.

## North-star and guardrail metrics

- **North star:** approved, on-brand asset sets shipped per active workspace per month.
- Time from brief to first acceptable concept.
- Percentage of variants approved without manual layout repair.
- First-pass brand compliance rate and false-positive rate by rule.
- Rework commands per approved asset.
- Campaign concept acceptance rate.
- Cross-format consistency and exception rate.
- Learning proposals accepted, rejected and rolled back.
- Cost and latency per approved asset set—not per generation.
- Tenant-isolation/security incidents: always zero.

## Final recommendation

Freeze feature breadth for one cycle. Make multi-tenant brand knowledge, campaign lineage
and explainable enforcement the product. Preserve the edit engine, but move the center of
gravity from canvas operations to brief → concept → governed asset set. That is the path
from a polished client tool to a defensible platform.

