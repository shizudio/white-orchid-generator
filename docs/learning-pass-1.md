# Learning Pass #1 — evidence, proposals, ratification

Status: DRAFT for client ratification (Shina). Read-only pass — no app code was
changed. Contract: docs/self-improvement-loop.md §4 ("the pass clusters captured
failures, proposes changes WITH EVIDENCE, client ratifies, changes ship"). **Nothing
in this document self-applies.** Every proposal below is a checkbox; tick the ones
you want built.

Evidence base: 21 resident-tester runs (2026-07-06 08:58 → 2026-07-07 03:07, 431
logged events, 411 defects), the two committed smoke reports (07-06, 07-07), the
human-observed docs (deprecation-audit, interaction-audit, design-critique), the
git history of lib/audit-local.js and lib/preferences.js, and a live query of the
6 v8-backfilled liked sessions plus the actual liked export images.

**A note on timing, flagged for transparency:** while writing this pass, a commit
(`c18533d`, 2026-07-07 15:22 SGT — after the last tester run this pass analyzed)
was found already on `main`: *"fix(assistant): deterministic belts for the #1
defect class — simple asks no-op'd."* Its own commit message cites the identical
evidence this pass independently derived (mood words, colour vocabulary, text
substitution, add-name/contact, font-size asks all failing to patch). **That fix
shipped directly to code, outside this contract's ratify-then-apply loop** — it is
real, tested-in-message, and covers a meaningful slice of §2.2 below, but it is
also exactly the kind of change docs/self-improvement-loop.md §4 says should route
through a learning pass with client sign-off first. This pass reports what that
commit does and does not cover, and flags the process gap in §2.2 rather than
silently absorbing or duplicating the work.

---

## 1. What the data says

### 1.1 Defect classes, ranked by frequency × severity, with trend

| Oracle | Count (of 411) | Severity | Runs affected | Trend since the 18:36 07-06 fix commit |
|---|---|---|---|---|
| **born-clean** | 308 (75%) | medium | 19/21 (fires in every run with a landing-generate step) | **Unchanged — still fires post-fix.** |
| **honesty-apology** | 47 (11%) | high | 15/21 | Flat to rising (0→13 across the run sequence; last run 2/21, run before it 13/21 — noisy but never zero after run 8). |
| **claim-vs-changed** | 25 (6%) | high | 15/21 | Flat; ~13/25 are a measurement artifact (see 2.1), ~12/25 are genuine. |
| **add-renders** (+Add caption) | 15 (4%) | medium | 15/15 runs where the journey executed | **100% reproduction rate.** Every single run that reached this journey step flagged it. |
| **no-console-errors** | 13 (3%) | medium | 9/21 | Scattered, 1-2 per run, no repeating utterance — looks like infra noise, not a behavior defect (see 2.6). |
| **offer-without-execution** | 2 (0.5%) | high | 2/21 | Too few data points to trend. |
| **canvas-hit-targets** | 1 (0.2%) | high | 1/21 (new oracle, added 07-07) | New; one data point (`eyebrow`, `hero`, `furn_rule_0` all reported dead). |

**Everyday-journey pass rate degraded, not improved, run over run**: the 07-06
smoke report shows 6/9 journeys passing; the 07-07 smoke report (after the born-clean
fix commit landed) shows only 4/10 passing (one new journey added, but two
previously-passing journeys — `chat edit (wisteria)` and `undo reverts` — newly
failed, plus the new `canvas-hit-targets` journey failed on its first run).

### 1.2 The single biggest, most surprising finding: born-clean was "fixed" but never stopped firing

Commit `28d73bb` (2026-07-06 18:36, message: *"fix(born-clean): retire the
system-vs-advisor hero-ratio + edge-contrast dots"*) explicitly states: *"Verified
live: editorial/serif/floated/label/portrait/petal/cta/closing/schedule now carry 0
master dots on system copy."* It suppressed two specific findings
(`archetype-hero-ratio` when the caption is at its legibility floor, and a
`contrast-fail` min-escalation false alarm).

Every resident-tester run **after** that commit (14:42, 14:52, 16:21, 18:56 on
07-06, and 03:07 on 07-07 — 5 runs, all after the fix) still shows the
`landing-generate` journey's born-clean check firing at **1-3 advisor dots**,
identical to before the fix:

```
runs/2026-07-06T14-42-12  landing-generate: 2 advisor dot(s)
runs/2026-07-06T16-21-48  landing-generate: 2 advisor dot(s)
runs/2026-07-07T03-07-18  landing-generate: 2 advisor dot(s)
```

Visual confirmation (screenshots) shows the dot(s) anchored to a specific
element's box on plain, ordinary landing generations — a pink pastel "Art Week
Celebration" card and a text-forward "Holiday Closure Notice" banner both carry
1-2 dots on first render, with no user edits yet. Whatever finding is firing now,
it is **not** one of the two the commit suppressed (those were verified 0 across
9 named archetypes) — it's a third, still-unidentified category, or the same two
categories reappearing through an archetype/format path the commit's manual
verification didn't cover (verification was manual/spot-check, not driven by the
same automated sweep that would have caught the regression before it shipped).

### 1.3 The specimen failure (docs/self-improvement-loop.md §0) is still live

The contract's own worked example — "change the photo" claims a photo change with
no changed keys, or a layout ask lands on the wrong field — is reproducing today,
not just in the historical incident that motivated the contract:

| Utterance | Times seen | What actually happened |
|---|---|---|
| "change the photo to children painting" | 5× | Claimed a photo/background change; changed-keys line empty every time. |
| "i want the photo to fill the whole thing" | 2× | Once claimed a layout switch (no changed keys); once instead reported "I've made the headline larger" — a different field than the one the intent named. |
| "too much green" | 1× (genuine) | Claimed "I've removed the green panel" with empty changed-keys — the exact specimen scenario from §0. |
| "make the background wisteria" | 1× (genuine) | Claimed a background change with empty changed-keys. |
| "softer pls" | 1× (genuine) | Claimed a photo-treatment change with empty changed-keys. |

### 1.4 Honesty-apology and claim-vs-changed cluster around the same utterance families

Combined trigger counts (either oracle) by utterance, across all 21 runs:

| Utterance | Times flagged |
|---|---|
| "make it warmer" | 7 |
| "can u change the colour to that mauve one" | 7 |
| "softer pls" | 6 |
| "change the photo to children painting" | 5 |
| "it looks a bit boring tbh" | 4 |
| "add my name miss tan at the bottom" | 4 |
| "can you make it pop more" | 4 |
| "put our phone number at the bottom 9123 4567" | 4 |
| "add small text saying spaces are limited" | 4 |
| "make the background wisteria" | 4 |

These are **not random fuzz misses** — the same ~10 phrasings recur run after run
because the persona pool is fixed (by design, for reproducibility), which means
these ARE the highest-value, most-repeated evidence for prompt/grammar fixes: a
fix that resolves "make it warmer" alone would clear ~7 of the ~130 total
honesty+claim flags across the corpus in one move. (See §2.2 — nearly this whole
table was targeted by a commit that landed after this pass's evidence window
closed; only the photo/layout rows are confirmed still open.)

### 1.5 The +Add caption journey — 100% reproduction, never once succeeded

Across all 15 runs where journey J5 (+Add caption) executed, the oracle fired
every single time: `render truth unchanged after add`. This is not intermittent —
it is a fully deterministic, always-reproducing gap. Either the dynamic
`.wo-chat-chip` "add caption" chip isn't present in the mocked/sandboxed run (so
the tester falls back to asking chat directly, which then doesn't land a role-bound
change the oracle can detect), or the underlying add-caption path genuinely never
lands for the chat-driven route the tester exercises. Given the app's own
`renderAddGallery` inventory (docs/deprecation-audit.md §4.1: "Small text under the
title" tile) exists as a dedicated UI affordance, and the tester's fallback path is
explicitly "ask chat to add a caption" only when the dynamic chip is absent — this
is worth a targeted look, but the resident tester alone cannot tell you *why* it's
failing 100% of the time; only that it is.

### 1.6 Which rules the app itself overrides most (the "acks" question)

The app has a real acknowledgement ("Keep it this way") mechanism
(`lib/audit-local.js` — `ackKey`/`isAcked`/`ackFingerprint`), but it is
**session-scoped** (keyed to a specific design's geometry) and lives in
`session.state.acks`, which the resident tester's sandboxed, credential-less runs
never populate or read back (each run starts from a fresh session; acks never
persist across runs by construction). **We cannot report ack override frequency
from the current evidence** — the resident tester was never wired to capture it,
and the capture-layer table (`ai_feedback_events`) that WOULD carry per-turn
verdicts is unreachable to this pass (see 1.7). This is a real gap, not a null
result — see Proposal 2.9.

The closest proxy the data supports: **which advisor finding fires on a
freshly-generated, unedited design** (i.e., which finding the client would have to
override immediately, before making any edit at all) — that is exactly the
born-clean signal in 1.2, and it is the single most-repeated defect in the corpus.

### 1.7 What could not be reached (say so plainly)

- **`GET /api/feedback`** requires `FEEDBACK_DEV_KEY`, which is confirmed **unset**
  in `.env.local`. The route's own code returns a hard 403 without it
  (`app/api/feedback/route.js`). This pass did not probe the live endpoint (no
  key, and doing so would add nothing — the code path is unambiguous). **The
  `ai_feedback_events` capture table (real user chat-turn history, undo/rejection
  signals, thumbs-down) was not reachable and is not reflected in this report.**
- **localStorage** (any client-side ring-buffer fallback for feedback capture) is
  not reachable to a filesystem-and-API-bound pass; not reflected here either.
- **The v8 backfill genes** were emitted live to Supabase by
  `scripts/backfill-v8-likes.js` on 2026-07-06 and never written to a log file —
  the only durable record is the commit message (which names the 6 matched
  slugs but not their genes). A local dev server happened to be running on
  `:3100` during this pass with the real cloud sessions reachable, so genes
  **were** recovered by replaying the exact match/tie-break logic from the
  script against the live `/api/sessions` data (see §1.8) — but flagged below
  wherever a session was edited after the backfill ran, because its *current*
  state may no longer equal what was actually liked at backfill time.
  `liked`/`exported_at` columns from the ratified schema migration are
  confirmed **not yet applied** to this database (`liked: undefined` on all 6
  sessions checked) — the backfill script's own graceful-degradation path.

### 1.8 What the 6 seed likes share (the taste signature)

Genes recovered by replaying the backfill script's exact slug-match + newest-wins
tie-break against the live `/api/sessions` data, **cross-checked against the
actual liked export images** (the ground truth — 3 of the 6 sessions were edited
*after* the backfill ran, so their live DB state no longer matches what was
actually exported/liked; the image is authoritative where the two disagree):

| Liked export | Archetype (from the image) | Palette | Photo treatment | Type register |
|---|---|---|---|---|
| open-house | editorial split (photo right / solid text left) | deep forest-green ink on ivory | warm, near-raw candid (motion-blurred child running) | oversized serif, no eyebrow |
| welcome-back-to-school | editorial split, photo below a text band | ivory text band / warm-neutral photo | untreated / near-raw | small-caps tracked eyebrow + regular-weight body serif-adjacent sans |
| now-enrolling | full-bleed photo, ivory band anchoring the bottom third | ivory band over a warm terracotta-toned photo | warm, near-raw candid | mixed: plain caption line + bold serif-caps CTA |
| early-childhood-educators | text-only "manifesto" card, organic blob motif | wisteria (dusty lilac) field, cream blob, near-black ink | n/a (no photo) | italic serif eyebrow ("Join our team") + bold sans-caps headline |
| play-is-the-highest-form-of-re | quote-with-margin, photo anchoring the bottom | sage/celadon duotone wash over the photo | duotone (green wash) | serif-caps quote + plain sans attribution |
| learning-is-a-treasure-that-wi | quote, text-only | deep forest-green field, ivory ink | n/a (no photo) | serif quote + plain sans attribution, no photo at all |

**The signature, read across all 6:**
- **Archetype**: strong lean toward **quote/manifesto (text-forward, 3/6) and
  editorial-split-style photo composition (3/6)** — *not* the flashier full-bleed
  or petal-window treatments. All 6 are calm, editorial, low-ornamentation.
- **Palette**: deep forest-green and warm ivory dominate (4/6 use one or the
  other as the primary field); wisteria and sage each appear once. **No dark/jet,
  no butter, no tangerine-as-field** among the 6 — tangerine/coral only ever
  appears (elsewhere in the app) as an accent, never chosen as a liked field here.
- **Photo treatment**: when a photo is present (4/6), it is **warm/near-raw or a
  green duotone wash** — never left untreated-and-cool, never heavily stylized.
- **Register**: serif-led typography throughout, often with a small-caps or
  italic accent line (eyebrow/attribution) — consistent with the brand's stated
  "calm, editorial" identity in docs/design-critique.md, not a coincidence.

This is a **6-sample signal** — real, but thin. It should nudge priors gently, not
anchor them (see Proposal 2.3).

---

## 2. Proposals

Each proposal: evidence → change → risk → effort (S/M/L). **Checkbox = your
decision, not mine.** Nothing here is applied by this pass.

### 2.1 Fix the oracle, not the app: teach it the "Correction — that actually worked" phrase

- [ ] **Ratify**

**Evidence:** 13 of 25 `claim-vs-changed` defects (52%) are a false positive in the
*tester's own oracle*, not an app bug. `oracles.js`'s `HONESTY_PATTERNS` list
matches `/Honestly\s*—/i` and `/Actually\s*—\s*checking the canvas/i`, but the
app's actual retry-success phrase (verified in `components/ArtDirectorChat.jsx`
line 763) is **`"Correction — that actually worked: I changed the {fields}. Tap
Undo if that isn't what you wanted."`** — which matches none of the
`HONESTY_PATTERNS` regexes but DOES match `CLAIM_PATTERNS` (`/I['’]ve
changed|switched|.../i` catches "I changed"), so the oracle flags the app's own
*successful self-correction* as a silent false claim. Directly verified with the
regex against the real string: `honest match: false`, `claim match: true`.

**Proposed change:** add `/Correction\s*—\s*that actually worked/i` to
`HONESTY_PATTERNS` in `scripts/resident-tester/oracles.js`. This is a
**tester-only** change — no app code touched. It would immediately clear ~13 of
the 25 recorded claim-vs-changed defects as measurement noise, letting future
reports show the true ~12-genuine rate instead of inflating it 2×.

**Risk:** S — pure test-harness fix, zero product-code risk. The only care needed
is confirming the phrase is copied verbatim from `ArtDirectorChat.jsx` (done
above) so the regex doesn't accidentally swallow a genuine failure too.

**Effort:** S.

### 2.2 The genuine claim-vs-changed cases: mood/colour/text belts already shipped outside this loop — the photo/layout gap is still open

- [ ] **Ratify** (the remaining photo/layout gap only — see below)

**Evidence:** Of the 12 genuine (non-oracle-bug) claim-vs-changed defects, 5 are
"change the photo to children painting" claiming a photo change with an empty
changed-keys line, and 1 is "i want the photo to fill the whole thing" — the
exact specimen scenario from self-improvement-loop.md §0 — where the reply once
said "I've switched the layout... full frame" (empty changed-keys) and another
time instead reported changing headline size, a completely different field than
what "fill the whole thing" describes. Separately, the honesty-apology cluster
(§1.4 — "make it warmer", "softer pls", "can u change the colour to that mauve
one", "add my name", "put our phone number", "make the title bigger", etc.) was
the single biggest honesty-pipeline defect class across every nightly run.

**Already shipped (informational, not this pass's doing):** commit `c18533d`
(2026-07-07 15:22 SGT, titled *"deterministic belts for the #1 defect class —
simple asks no-op'd"*) added deterministic patch belts + matching prompt few-shots
for exactly this honesty-apology cluster: text substitution ("headline shud say
X"), add-name/contact ("add my name miss tan", "put our phone number"), colour
vocabulary (mauve/terracotta/sage/etc. → the nearest brand bg token), mood
recipes (warmer/softer/cuter/pop/fun/cooler/bolder/calmer → a defined
field+treatment bundle), and font-size bumps. The commit message explicitly
states the belts stay OUT of photo asks and pure questions. **This means the
mood/colour/text/contact/font-size slice of the honesty-apology cluster is likely
resolved** (unverified by this pass — no tester run exists after this commit
landed; re-running the smoke suite is the natural next check, see §2.2a below).
**The photo-change and layout-fill claim-vs-changed cases are explicitly untouched**
by that commit and remain open.

**Process note (flagging, not blocking):** this fix landed directly to `main`
without a documented ratification step, even though its own commit message cites
the identical nightly-run evidence this contract's §4 learning pass exists to
process. Worth deciding, going forward, whether "obviously-scoped, high-confidence,
single-defect-class" fixes like this one are allowed to bypass the ratify-first
loop, or whether they should wait for a pass like this one — a policy question for
you, not something this pass resolves unilaterally.

- [ ] **2.2a — Ratify:** re-run the resident-tester smoke suite now (post
  `c18533d`) to confirm the mood/colour/text/contact/font-size belts actually
  clear the honesty-apology defects they target, before assuming they're fixed.

- [ ] **2.2b — Ratify:** add explicit few-shot pairs (or a deterministic belt,
  mirroring `c18533d`'s pattern) to the assistant system prompt
  (`app/api/assistant/route.js`) for the still-open photo/layout gap:
  - "change the photo to X" / "different picture" → the photo-generation intent
    path must either (a) actually emit `change_keys` including the photo field
    once the generation lands, or (b) if generation is async/deferred, the
    immediate reply must NOT claim past tense ("I've set...") until the async
    result lands — use present/future tense ("Generating a photo of X now...")
    so the honesty oracle and the user both read it correctly.
  - "fill the whole thing" / "photo to fill the whole thing" → `archetypeId:
    full_bleed_*` + `photoTreatment`, never a headline-size change.

**Risk:** M — touches the live assistant prompt/patch-mapping logic; needs
re-running the resident tester smoke after the change to confirm the specific
utterances clear without new regressions elsewhere (the same discipline
`c18533d`'s message claims — "verified" — but that verification is not visible
in this repo's tester-run artifacts, see 2.2a).

**Effort:** M.

### 2.3 Priors: the 6 liked genes are a real but thin signal — the 40% diversity floor is very likely not yet binding, verify before touching it

- [ ] **Ratify** (verify only — no change proposed yet)

**Evidence:** `lib/preferences.js`'s `weightedPick` implements weight = `1 +
likeCount`, clamped so no single id exceeds 40% of the probability mass. With 6
distinct liked archetypes across a pool of 14 `CAP_SELECTABLE` archetypes (see
`app/api/assistant/route.js` `LANDING_ARCHETYPES`), each liked archetype currently
carries weight 2 against ~13 others at weight 1 — roughly 13-14% probability per
liked archetype vs. 7% for an unliked one, nowhere near the 40% ceiling. **The
diversity floor is very likely inert at current like volume** — it exists for a
future state (dozens of likes concentrated on one archetype) that hasn't arrived
yet. This isn't a defect; it just means "is the floor right" can't be answered
from today's data — there isn't enough signal for the floor to have bound yet.

**Proposed change:** none yet. Recommend re-checking this specific question in
Learning Pass #2, once more likes have accumulated (or once real users start
liking, not just the 6-item backfill), rather than tuning the 40% number now on a
sample that can't exercise it.

**Risk:** N/A (no change).

**Effort:** S (just re-measure next pass).

### 2.4 The 6-gene taste signature: consider it as a *rotation nudge* seed, not a hard rule

- [ ] **Ratify**

**Evidence:** §1.8's signature (quote/manifesto + editorial-split archetypes,
forest-green/ivory palette, warm-or-duotone photo treatment, serif register) is
consistent and plausible — it matches the brand's own stated identity in
docs/design-critique.md ("calm, editorial... real typographic system"). But it is
6 samples, and 3 of the 6 sessions were edited in the live DB *after* the backfill
ran (their current state no longer matches the liked export) — meaning the
"exemplars" the assistant prompt currently builds from `buildExemplars()` in
`lib/preferences.js` may already be reading slightly stale genes for those 3,
not what was actually pictured and liked.

**Proposed change:** re-run (or write, if it doesn't exist yet) a version of
`scripts/backfill-v8-likes.js` that derives genes from **the actual export image
metadata / a snapshot taken at like-time**, not a live re-query of
`/api/sessions` — or, simplest: snapshot the session `state` into the like event
itself at the moment of backfill (the event's own `verdict.genes` payload, not a
live join). This avoids future drift silently corrupting the exemplar phrases the
assistant prompt shows the model.

**Risk:** S — this is a data-hygiene fix to a one-off backfill script, not
production code.

**Effort:** S.

### 2.5 Born-clean: treat the post-fix regression as a P0 investigation, not a re-tune

- [ ] **Ratify**

**Evidence:** §1.2. Commit `28d73bb` explicitly verified 0 dots across 9 named
archetypes on 2026-07-06 18:36, but every one of the 5 tester runs since (spanning
into 07-07) still shows 1-3 dots on `landing-generate`. This means either (a) the
verification method (manual spot-check) missed an archetype/path the automated
persona pool exercises, or (b) a regression landed in a later commit (there were
several same-day commits after 18:36 touching `lib/audit-local.js`-adjacent code
— worth a `git log -p` diff between 28d73bb and HEAD on that file specifically),
or (c) the fix only ever addressed 2 of 3+ finding categories that can fire on a
fresh design, and a third (never named in that commit) is now the dominant
source.

**Proposed change:** before any prompt/grammar/prior tuning, spend a small,
targeted debugging session reading `fmt.issues[].category` (or `.id`) directly off
a fresh `landing-generate` design in each of the 6 formats — the resident tester's
own `born-clean` oracle currently only counts `.wo-advisor-dot-hit` elements, it
does **not** log which finding `id`/`category` is firing (see Proposal 2.7 — this
is also a tester-oracle gap). Once the actual finding id is known, either suppress
it the same way `28d73bb` suppressed the first two, or determine it's a genuine,
correct finding and this becomes a design/copy decision instead (e.g., "some
formats genuinely can't achieve legible type at this copy length, and that's a
content problem, not an audit bug").

**Risk:** M — touches audit logic in `lib/audit-local.js`, the same surface that
regressed once already; needs the same manual-verification-plus-automated-rerun
discipline the previous fix used, but this time closing the loop by re-running
the resident tester (not just a manual spot check) before calling it done.

**Effort:** M.

### 2.6 Stop measuring (or re-scope) the scattered no-console-errors 500s

- [ ] **Ratify**

**Evidence:** 13 `no-console-errors` defects across 9 runs, but spread across 12
different utterances at 1-2 occurrences each, with **zero matching entries in any
run's `server.log`** (checked the two highest-flag runs directly — 0 hits for
"500" or "Error" in both server logs). This pattern — client-visible 500, no
matching server-side log — points to a mocked-environment artifact (e.g. a
transient fetch to an intentionally-unconfigured endpoint under the sandboxed
Higgsfield-unset condition) rather than a real app defect a user would hit in
production (where the keys ARE configured).

**Proposed change:** either (a) have the oracle capture the failing request URL
(not just the console text) so a future pass can tell in one glance whether it's
a mocked-path artifact or a real route, or (b) if a first check confirms it's
always the mocked-photo-generation path, downgrade this oracle's severity from
medium to informational/excluded-from-headline-counts, since it's currently
inflating the "distinct issue types" count in the client-facing smoke reports
without being an actionable app defect.

**Risk:** S — either a small oracle enhancement or a severity reclassification;
no app code touched either way.

**Effort:** S.

### 2.7 New tester oracle: log the actual finding id/category on every born-clean hit

- [ ] **Ratify**

**Evidence:** §1.2 and §2.5 — the current `bornClean` oracle
(`scripts/resident-tester/oracles.js`) only reads `snap.advisorDots` (a count) and
optionally `snap.ready` (a per-format findings array), but the recorded defect
event only ever stores `"${dots} advisor dot(s)"` — never *which* finding. Every
born-clean investigation this pass required manually opening screenshots and
inferring geometry, when the app's own `__woReadyCheck()` hook (already exposed,
already read by the probe) carries the full `findings[]` array with `id` and
`category` per finding. This data is being **thrown away** at capture time.

**Proposed change:** extend the `PROBE` string in `oracles.js` to also surface
`ready.flatMap(f => f.findings.map(x => ({dimensionId: f.dimensionId, id: x.id,
category: x.category})))`, and have `bornClean()`'s `observed` string include the
distinct finding ids (e.g. `"2 advisor dot(s): contrast-warn, type-size-floor"`)
instead of just a count. This alone would have let this pass identify the root
cause in §1.2/2.5 without needing to eyeball screenshots.

**Risk:** S — tester-only change, additive (doesn't change what counts as a
defect, only what's recorded about it).

**Effort:** S.

### 2.8 New tester oracle: instrument the +Add caption path to distinguish "chip missing" from "add didn't render"

- [ ] **Ratify**

**Evidence:** §1.5 — 100% reproduction (15/15) of `add-renders` failing, but the
journey code (`journeys.js` lines 242-285) has two different paths (dynamic
`.wo-chat-chip` click vs. chat-text fallback) and the current oracle can't tell
you which path was taken when it logs the defect, nor whether the dynamic chip
was ever actually present. A 100%-reproducing defect this cheap to disambiguate
should be disambiguated before it's handed to engineering as "add caption is
broken" — it might be "the caption chip never appears in this sandboxed session
state" (a different, narrower bug) rather than "adding a caption never renders."

**Proposed change:** have the journey log which branch fired (`chip` vs.
`chat-fallback`) as part of the recorded defect's `observed` field.

**Risk:** S — tester-only, additive.

**Effort:** S.

### 2.9 Wire the resident tester (or a lightweight successor) to read real capture-layer evidence next pass

- [ ] **Ratify**

**Evidence:** §1.6/1.7 — this pass could not report ack-override frequency or any
real-user undo/rejection signal because `FEEDBACK_DEV_KEY` is unset and the
resident tester's synthetic sessions never populate `ai_feedback_events` in a way
this pass could read back (by design — the tester explicitly discards all
capture writes so it never pollutes real data). The self-improvement-loop
contract's Layer 1 (passive capture) and Layer 3 (explicit thumbs-down) are the
richest possible evidence for a future learning pass, but nothing has read from
them yet because the dev key was never set.

**Proposed change:** set `FEEDBACK_DEV_KEY` in the production/staging environment
(a one-time secret, not a code change) so Learning Pass #2 can pull real
`GET /api/feedback` data — real user utterances, real undo/rejection verdicts,
real thumbs-down pairs — instead of relying solely on the synthetic persona pool.
This is the single highest-leverage unlock for making future passes evidence-richer.

**Risk:** S — it's an env var in a key-gated, read-only dev endpoint; the route
itself already defends against public exposure (403 without the key). Standard
secret-handling hygiene applies (don't commit it, rotate if ever exposed).

**Effort:** S.

---

## 3. Explicitly out of scope for this pass

- **No code was changed.** Every proposal above is a checkbox for you.
- **No priors were re-weighted, no prompt few-shots were added, no oracle regexes
  were edited** — 2.1, 2.2, 2.6, 2.7, 2.8 all describe changes; none were applied.
- **The `ai_feedback_events` real capture data was not read** (unreachable, see
  1.7) — this pass is scoped to the tester-run + document + backfill-script
  evidence explicitly listed in the task, nothing more was inferred beyond what
  those sources support.
- **No claim about ack-override frequency is made** — the evidence doesn't exist
  yet in a form this pass could read (1.6); Proposal 2.9 is how to get it for
  next time.

---

## Top 5 proposals, in brief

1. **Investigate the born-clean regression as a P0** — a commit explicitly
   verified 0 dots on 07-06 18:36, but every run since (including 07-07) still
   shows 1-3 dots on fresh landing generations; the fix didn't hold or didn't
   cover the actual dominant finding. (M)
2. **Fix the tester oracle's honesty-pattern regex** to recognize "Correction —
   that actually worked" — clears ~13 of 25 claim-vs-changed defects that are
   oracle false positives, not app bugs. (S)
3. **Close the remaining photo/layout gap** in the honesty-apology cluster —
   "change the photo to X" and "fill the whole thing" are the highest-volume
   genuine claim-vs-changed cases and directly reproduce the specimen failure
   from self-improvement-loop.md §0. A same-day commit (`c18533d`) already fixed
   the mood/colour/text/contact/font-size slice of this cluster but explicitly
   left photo/layout asks untouched — and that fix shipped outside this
   contract's ratify-first loop, which is worth a policy conversation. (M)
4. **Add finding-id logging to the born-clean oracle** — currently only a dot
   *count* is recorded, not which advisory rule is firing; this is why #1 above
   required manual screenshot inspection instead of a one-line log read. (S)
5. **Set `FEEDBACK_DEV_KEY`** so the next learning pass can read real user
   capture data instead of only the synthetic persona pool — the richest
   evidence source in the whole contract has never been read yet. (S)
