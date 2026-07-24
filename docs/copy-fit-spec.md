# Copy-fit spec — content adapts, format never does

**Status: RATIFIED 2026-07-13** (client rulings, this session). Owner of: how copy overflow is prevented, resolved, and surfaced. Extends the advice-ledger spec (one voice) and the born-clean law.

## The rulings (verbatim intent)

1. **AI-written copy: fit it before it becomes design state.** Copy the system wrote (landing plan, caption writer, belts) is the system's own free variable. It is written or repaired to the measured slot budget before the patch is accepted, and the fitted value is the value shown in both the input and canvas. The renderer never owns or secretly changes copy. The owner's typed copy is NEVER silently altered (pins law).
2. **"Switch to {format}" is removed everywhere as a remedy.** Format is a precondition chosen by distribution channel, not a variable the system may negotiate. Per-format fit lives in exactly one place: the Export checklist, as *status*.

## The system (four tiers, in order)

**Tier 0 — the layout absorbs first (silent, all copy).** Before any role drops: step type to the legibility floor → take an available extra line within margins/whitespace → use a roomier sanctioned variant where the archetype offers one. Overflow must be rare, not common.

**Tier 1 — prevention: copy is written to fit (AI copy).** Every copy-writing surface (landing plan, chat belts, caption writer) receives the ACTIVE slot's measured character budget (derived from the current archetype × format box, floor size, line count) and writes within it. Generated copy fits by construction.

**Tier 2 — AI copy that still overflows is repaired at the application boundary.** Deterministic sentence-boundary fitting may be used before committing the patch, but the resulting visible string must be persisted as the actual field value. Candidate generation should verify every required format and choose a roomier layout or rewrite again when needed. There is no render-time copy mutation. If a role still cannot fit at a readable size, it is complete-or-absent and enters the same explicit remedy flow as any other missing copy.

**Tier 3 — the owner's copy gets a guaranteed remedy.** When HER copy overflows (never silently altered): the finding appears with (a) **"Tighten it for me" — a contract, not a hope**: computed budget → rewrite to that number → apply → verify against render truth → if still overflowing, deterministic sentence-boundary trim that always fits. The button can never no-op (M2). (b) **"Edit it myself"** deep-link showing the live budget ("fits about N characters here"). (c) **"Leave it off"** (the honest loss-class ack). There is NO format-switch action.

## Brand-name copy exclusion (client ruling 2026-07-23)

The system never AUTHORS the brand's own name as on-canvas text content (attribution, support, or any role/element) — "the logo should already inform that." Applies to every generation surface (landing plan, belts, missing-role synthesis, defaults). The name is read from the brand profile (zero-brand-facts: the rule is generic, the name is data). Owner-typed brand-name copy is untouched (pins law), and the social-media caption writer may still use the name (off-canvas copy).

## Authorship tracking
Fitting rules key off WHO wrote the field: AI-authored copy fields are marked at application time (the landing/caption/belt patches), and their persisted values may be repaired before acceptance. Any manual edit transfers authorship to the owner permanently. Authorship metadata may guide future rewrites, but it must never make identical stored strings render differently.

## Knobs
| Knob | Value | Effect |
|---|---|---|
| Budget source | measured slot box × floor size × max lines | The number every writer receives |
| Pre-apply fit | sentence boundary, fitCopy semantics | How AI copy is repaired before it enters design state |
| Tighten retries | 1 rewrite, then deterministic trim | The guarantee behind the button |
