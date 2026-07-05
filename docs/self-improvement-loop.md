# Self-Improvement Loop — capture → detect → learn → apply

Status: Layers ratified in discussion 2026-07-05 (client: Shina). Contract for WP-W.
Companion to docs/ux-architecture.md. Human-in-the-loop learning (client decision
pending on cadence; default: on-demand + weekly floor).

## 0. The specimen failure (why this exists)

Client asked "i want full image post" → AI patched `headline, text backdrop` and
CLAIMED "I've switched to a full image layout" while `archetypeId` never changed.
Then "remove the green solid" → AI patched `text backdrop, logo, overlay` — but the
green block was the split-layout PANEL, not a backdrop/overlay. Two failure classes:

1. **Intent → patch mapping gaps** (model doesn't know which field expresses the
   intent, or no field CAN express it). Fix lever: few-shot examples / grammar.
2. **False confidence** (AI reports what it intended, not what occurred; nothing
   checks the claim against the render). Fix lever: claim-vs-result verification.

## 1. Layer 1 — Passive capture (zero user effort)

Log every chat turn to Supabase (`ai_feedback_events` or similar):
- user message (verbatim), patch emitted, before/after design state diff
- session id (one session = one post; see ux-architecture amendments)
- implicit verdict from the user's NEXT action:
  - Undo click → rejection
  - rephrase/repeat of same ask → failure
  - "Try another layout" click → layout rejection (log rejected archetype+variant)
  - export / save → success
Storage is trivial (KBs of text+JSON; photos stay as URLs).

## 2. Layer 2 — Claim-vs-result verification (trust-critical)

After each AI patch applies:
- diff the actual state; if the AI's narration claims a change class that did not
  occur (claimed layout change, archetypeId unchanged; claimed removal, element
  still present; no-op patch), the AI must SELF-CORRECT in the same conversation
  ("That didn't do what you asked — switching to the full-bleed layout now")
  and the event is logged as a high-value failure example.
- The AI never again reports success that the render contradicts.

## 3. Layer 3 — One-tap explicit signal

- A small "not what I meant" chip on each AI reply (thumbs-DOWN only; success is
  implied by the user continuing — thumbs-up is noise).
- Optional one-line follow-up ("what did you want?") — intent-in-user's-words +
  wrong-patch pairs are the highest-grade training examples.

## 4. Layer 4 — The learning pass (where improvement happens)

Not fine-tuning. Three levers, chosen per failure cluster:
- **Prompt**: new few-shot mappings in the assistant system prompt
  (e.g. "full image post" → archetypeId full_bleed; "remove the green/panel" →
  layout switch, never backdrop tinkering).
- **Grammar**: if NO patch field can express a recurring intent, extend
  lib/design-patch.js (no prompt can fix a missing field).
- **Priors**: archetypes/variants the client consistently rejects get
  down-weighted in the rotation ring; consistently kept ones boosted.

Process: on-demand ("run the learning pass") + weekly floor. The pass clusters
captured failures, proposes changes WITH EVIDENCE ("quote_margin rejected 9/11
times"), client ratifies, changes ship. Human-in-the-loop until proposals are
boringly correct; automation is a later decision, not a default.

## 5. Sequencing

- **WP-W0 (hotfix + quick wins, immediate):** specimen-failure mappings + panel
  removal expressible in the grammar; minimal claim-vs-result honesty check;
  Cmd+Z/Cmd+Shift+Z + visible undo affordance + Guide updates; Shapes section
  (petals) restored beside Logo in + Add.
- **WP-W (system):** Layers 1–3 wired end-to-end (capture table, implicit
  verdicts, feedback chip, full verification + logging); sessions model
  (one session = one post) as the capture backbone; post-export save-as-template
  nudge.
- **Ongoing ritual:** Layer 4 passes, evidence-based, client-ratified.
