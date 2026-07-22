# Engineering principles — governed brand intelligence

Status: **proposed for ratification**  
Owner: product and engineering  
Last updated: 2026-07-21

This charter governs new platform work after ratification. Existing ratified editor specs
remain authoritative until a deliberate migration changes them.

## 1. Product boundary

We build a governed brand compiler, not a general-purpose design editor.

A feature belongs when it does at least one of these measurably:

1. Shortens objective-to-approved-asset time.
2. Strengthens brand or channel enforcement.
3. Improves explainable learning from permissioned evidence.

If it does none, reject it. If a simpler workflow removes a control, prefer the simpler
workflow.

## 2. Canonical domain truth

Core entities have one owner and one canonical representation. UI components, model
prompts and storage rows do not invent parallel state.

The intended hierarchy is organization → workspace → brand profile → campaign brief →
concept → asset set → asset variant/design document → revision/findings/approval →
activation/outcome → learning proposal.

Cross-domain changes occur through typed commands or services. Every command is
validatable, replayable where practical, attributable to an actor and observable.

## 3. Brand knowledge is versioned data

Runtime code contains no customer or brand facts. Brand names, colors, font files, voice,
claims, exclusions, logo constraints, imagery rules, audiences, products, exemplars and
channel policies live in a versioned brand profile.

Every rule records:

- stable ID and type;
- scope and severity;
- source and source excerpt/reference;
- positive and negative examples when available;
- creation/approval actor and timestamp;
- profile version and supersession history.

An asset always retains the exact profile version used to create and validate it.

## 4. AI proposes; deterministic systems commit

Models may interpret, retrieve, rank, generate and propose. They do not write arbitrary
domain state.

The standard path is:

```text
understand -> retrieve -> propose -> schema validate -> policy validate
-> typed command -> render -> verify -> narrate actual result
```

Model output is untrusted input. Parse it with strict schemas, enforce authorization and
domain invariants, record provenance, and reconcile narration against committed state.

## 5. Probabilistic center, deterministic shell

Creative generation can be probabilistic. Identity, access, budgets, dimensions, safe
areas, asset lineage, locked elements, rule severity, export gates and audit history are
deterministic.

The same design state plus render configuration must produce the same layout result.
Provider selection and model versions are explicit and recorded.

## 6. Enforcement is explainable

Every warning or block identifies the violated rule, evidence, affected variants,
severity and a safe corrective action. Vague “AI scores” are never the only explanation.

Blocking rules require an owner-approved policy. Overrides require permission, a reason
and an audit record. Accessibility and channel rules are first-class, not prompt advice.

## 7. User intent survives automation

Explicit user choices, locks and approved exceptions outrank regeneration and automatic
layout. Regeneration changes only the declared scope. Format inheritance and campaign
fan-out are visible and reversible.

Undo/redo, revision history and comparison are domain capabilities, not component-local
conveniences.

## 8. Tenant isolation is a release invariant

Every request resolves an authenticated actor, organization/workspace and brand context on
the server. Every tenant-owned row is protected by RLS and application authorization.
Service-role credentials never create an unauthenticated public CRUD path.

Tenant isolation has negative integration tests. A feature that cannot prove isolation
does not ship. Cross-tenant learning is off by default and requires explicit consent and
documented privacy controls.

## 9. Durable work is asynchronous and idempotent

Campaign generation, image generation, bulk variants, ingestion and publishing run as
durable jobs with stable IDs, idempotency keys, retries, cancellation, budgets, progress
and failure states.

HTTP handlers validate and enqueue; workers execute. Retrying a job must not duplicate
assets, charges or publications.

## 10. Learning changes policy only through review

We capture prompts, commands, revisions, undo/rejection signals, approvals, exports and
normalized outcomes with lineage. We distinguish preference, compliance and performance.

The system creates evidence-backed learning proposals. A brand owner approves a proposal
into a new profile version. Silent self-modification is prohibited. Every change is
reversible and its effect is measured.

## 11. Provider independence and evaluation

Text, image, embedding, storage and publishing providers sit behind narrow adapters.
Domain code does not depend on provider-specific response shapes.

Providers are chosen by measured approval rate, policy fit, latency and cost per approved
asset—not novelty. Evaluation datasets are versioned per capability and include multiple
brands, difficult inputs and refusal/failure cases.

## 12. Module boundaries

- UI components render state and emit typed intent; they do not contain business policy.
- Hooks coordinate UI lifecycles; they do not become hidden domain stores.
- Domain modules own invariants and remain framework-independent where practical.
- API routes authenticate, validate and delegate; they do not become orchestration
  monoliths.
- Renderers accept explicit immutable inputs and return explicit results/bounds.
- Persistence repositories translate domain objects; storage schemas do not leak through
  the whole application.

New domain/server code uses TypeScript and runtime schemas. Existing JavaScript migrates
when its boundary is touched; no big-bang rewrite.

When a file mixes unrelated responsibilities or cannot be tested without constructing the
whole product, split by ownership rather than by arbitrary line count.

## 13. Compatibility and migrations

Design documents, brand profiles, campaign briefs, events and jobs are versioned. Readers
migrate old data explicitly; writers emit the current version. Migrations are idempotent,
tested against production-shaped fixtures and reversible where feasible.

Never infer a schema version from the presence of one field. Never mutate historical
approved artifacts in place.

## 14. Observability, cost and provenance

Every AI/job path records tenant-safe structured events: request/job ID, actor, capability,
model/provider version, brand-profile version, token/credit cost, latency, retries, result
status and rule findings. Sensitive prompt/content logging follows retention policy.

We optimize cost per approved asset set. Limits exist at request, workspace and provider
levels. Expensive tests and generation are explicit; automated suites default to free
mocks unless the run is deliberately budgeted.

## 15. Security and privacy by design

Validate file type and content, scan uploads, use private storage and signed URLs, bound
payloads, rate-limit expensive routes and never expose secret/provider keys to clients.

Prompt injection and untrusted guideline documents cannot override system policy,
authorization or tool scopes. Customer content is not training permission.

## 16. Quality gates

Required coverage grows with risk:

- pure unit tests for commands, migrations, rules, inheritance and render models;
- contract tests for model/provider schemas and repository adapters;
- integration tests for auth, RLS, tenant isolation, jobs and API idempotency;
- visual/semantic browser tests for core brief, edit, validate, approve and export flows;
- multi-brand regression fixtures proving one brand cannot alter another;
- accessibility and mobile checks on every primary workflow.

Known P0/P1 defects block release. A regression gate that passes while core journeys fail
is evidence, not a production-quality declaration.

## 17. Architecture decisions are explicit

Material decisions get a short ADR: context, decision, alternatives, consequences, owner
and date. Product laws and active specs are listed in `docs/README.md`; dated research and
audits remain evidence, not accidental requirements.

Code comments explain invariants and non-obvious constraints, not project history.

## 18. Definition of done

A feature is done only when:

- the customer job and success metric are clear;
- authorization and tenant isolation are proven;
- domain state and migrations are versioned;
- AI output is schema/policy validated and provenance is captured;
- error, retry, empty, loading and cancellation paths are designed;
- accessibility and mobile behavior are verified;
- tests match the risk and operational dashboards can reveal failure;
- docs and active contracts are updated;
- no dead compatibility path or brand-specific literal was introduced.

## Pull-request questions

1. Which customer job and product principle does this advance?
2. What is the canonical domain owner of the new state?
3. Can another tenant read, change or influence it?
4. What happens when the model/provider is wrong, slow, unavailable or retried?
5. Which brand/profile version and rule evidence produced the result?
6. Does the change preserve explicit user intent across formats and regeneration?
7. How is the result tested, observed, budgeted and rolled back?
8. What did we remove or simplify to pay for this complexity?

