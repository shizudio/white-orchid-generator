# One Advice Ledger — unify every advisor into one voice

Status: RATIFIED (client, 2026-07-05). Dispatches immediately after the "Advisor dots +
Keep it this way" package lands (it builds on that package's ack keys + dot rendering).
Companion to docs/ux-architecture.md, docs/self-improvement-loop.md.

## Problem
Two advice-givers exist and don't know about each other: the LOCAL readiness checker
(WP-Y5, deterministic, instant — powers the advisor dots / strip dots / Export
checklist) and the AI AUDITOR (vision model, manual "AI AUDIT" button in Export).
Without unification: the auditor re-litigates acked decisions in different words;
dot-fixes leave stale audit findings; audit fixes could move pinned elements; the same
issue appears twice in two vocabularies. The client's ruling stands: advisors advise,
the human decides — once.

## Design (6 rules)

1. **One ledger.** Every advisory source (local checker, AI auditor, photo QC, future)
   emits findings into a single store with one canonical shape:
   `{ key, category, anchor (element + geometry fingerprint + dimensionId), message,
   proposedFix (patch|null), sources[], severity }`. One finding = one dot = one Export
   checklist row. No parallel lists anywhere in the UI.

2. **Dedup by decision, not messenger.** Findings merge on (category + anchor). If the
   AI audit reports what the local checker already flagged, merge into ONE finding
   (keep the richer message; sources: [local, ai-audit]). Never two dots for one issue.

3. **Acks bind to the finding key, source-agnostic.** "Keep it this way" (from the dots
   package) acknowledges (category + anchor fingerprint). Any later finding with the
   same key — from ANY source — arrives pre-acknowledged: it lands in "Notes you've
   okayed", never a new dot, never re-litigated. Ack invalidation stays as designed:
   only a MATERIAL geometry change of the anchored element re-opens it once.

4. **Lifecycle reconciled by the patch pipeline.** Every applied patch (dot Fix, manual
   edit, AI edit, audit fix) triggers the cheap local recompute which reconciles the
   ledger: findings that no longer reproduce are RESOLVED (dot disappears, checklist
   clears). AI-audit findings are re-anchored where possible; if their anchor is gone or
   the design materially changed since the audit ran, they are marked stale and dropped
   (they return only if the next manual audit reconfirms). No advisor may argue with a
   design that no longer exists.

5. **The AI auditor is told what's known.** The audit request includes the current
   ledger + acks as context: "these are known; these are decided; report only NEW
   observations." Its job narrows to what the deterministic checker cannot see (taste,
   awkward crops, tone, photo issues). CLIENT DECISION: the audit stays MANUAL (the
   Export button) — never auto-run; results merge into the ledger silently through the
   same dedup/ack rules. No surprise dots at the finish line beyond what it genuinely
   newly found.

6. **One pipeline, one jurisdiction for fixes.** Audit fixes are proposals routed
   through the same applyReadyFix / patch pipeline (undoable); NOTHING auto-applies
   from the auditor; acked/pinned elements are untouchable by auditor fixes and the
   harmonizer alike (extends the explicit-placement-wins + ack-pin rules).

## UI consequence
The user never meets "the checker" vs "the auditor" — only *suggestions*: same dot,
same popover, same Fix / Keep it this way, same Export checklist. Optionally a small
provenance note in the popover ("spotted by the design audit"). One advisor, several
senses.

## Learning loop
Ledger events (finding raised/merged/resolved/acked, source) flow to the capture layer
so the learning pass can see which rules fire most, which get overridden, and whether
the AI audit adds value beyond the local checks.

## Verification bar (for the executing agent)
- Same issue flagged by both sources → exactly one dot/row; ack it → run manual audit →
  it does NOT return as a dot (lands pre-acked in "Notes you've okayed").
- Fix via dot → audit findings reconcile (no stale rows); run audit after big edits →
  stale findings from the earlier look are dropped.
- Audit proposes a fix on an acked/pinned element → the fix is not offered as
  auto-anything and cannot relocate the pinned element.
- Guards: __woArchStress 0, __woLegacyDupGuard 0, build green, console clean; dots
  package behaviors all intact (acks persist/reload, material-change re-open).
