# Copy-fit spec — content adapts, format never does

**Status: RATIFIED 2026-07-13** (client rulings, this session). Owner of: how copy overflow is prevented, resolved, and surfaced. Extends the advice-ledger spec (one voice) and the born-clean law.

## The rulings (verbatim intent)

1. **AI-written copy: silently fit it.** Copy the system wrote (landing plan, caption writer, belts) is the system's own free variable — it is fitted to the slot at layout time, silently, never dropped-then-flagged. The owner's typed copy is NEVER silently altered (pins law).
2. **"Switch to {format}" is removed everywhere as a remedy.** Format is a precondition chosen by distribution channel, not a variable the system may negotiate. Per-format fit lives in exactly one place: the Export checklist, as *status*.

## The system (four tiers, in order)

**Tier 0 — the layout absorbs first (silent, all copy).** Before any role drops: step type to the legibility floor → take an available extra line within margins/whitespace → use a roomier sanctioned variant where the archetype offers one. Overflow must be rare, not common.

**Tier 1 — prevention: copy is written to fit (AI copy).** Every copy-writing surface (landing plan, chat belts, caption writer) receives the ACTIVE slot's measured character budget (derived from the current archetype × format box, floor size, line count) and writes within it. Generated copy fits by construction.

**Tier 2 — AI copy that still overflows is silently fitted.** Deterministic trim at a sentence boundary (fitCopy semantics), applied at layout time — the system's own words are its own free variable. No dot, no popover, no dropped role for AI-authored copy.

**Tier 3 — the owner's copy gets a guaranteed remedy.** When HER copy overflows (never silently altered): the finding appears with (a) **"Tighten it for me" — a contract, not a hope**: computed budget → rewrite to that number → apply → verify against render truth → if still overflowing, deterministic sentence-boundary trim that always fits. The button can never no-op (M2). (b) **"Edit it myself"** deep-link showing the live budget ("fits about N characters here"). (c) **"Leave it off"** (the honest loss-class ack). There is NO format-switch action.

## Authorship tracking
Fitting rules key off WHO wrote the field: AI-authored copy fields are marked at application time (the landing/caption/belt patches); any manual edit to a field transfers authorship to the owner and lifts it out of silent fitting permanently.

## Knobs
| Knob | Value | Effect |
|---|---|---|
| Budget source | measured slot box × floor size × max lines | The number every writer receives |
| Silent-fit trim | sentence boundary, fitCopy semantics | How AI copy is fitted |
| Tighten retries | 1 rewrite, then deterministic trim | The guarantee behind the button |
