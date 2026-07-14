# Operating manual — how to work in this repo at full level

**Audience:** any model or fresh session working in `white-orchid-generator`. Read this before touching anything. Evidence base: all 312 commits (2026-06-15 → 2026-07-10), the docs/ spec set, and the code's own invariant comments. Where this manual and a spec doc disagree, the spec doc wins — each fact has one owner (see "Doc ownership").

---

## 1. What this is

A prompt-first social-media design studio for non-technical preschool staff (The White Orchid), being scaled multi-tenant (brand #2: Perena). It uses the Next.js 14 App Router. The editor root in `components/Generator.jsx` is now a 1,500-line orchestrator over extracted canvas, inspector, template, export, readiness, feed, persistence, session, command, and verification surfaces. The legacy Canvas 2D renderer remains module-level in that file while editable state is owned by `DesignDocumentV1` and typed commands. `lib/` holds pure contracts, `hooks/` owns focused orchestration, `app/api/` contains thin server routes, `scripts/tests/` contains the pure unit suite, and `scripts/resident-tester/` runs Playwright journeys against a production build. `next build` performs lint/type validation; no separate CI workflow is currently documented.

## 2. Doc ownership (one source of truth per fact)

| Fact | Owner |
|---|---|
| Composition/archetype geometry (numeric) | `docs/visual-language-spec.md` (FINAL — supersedes both `visual-language-research*.md` drafts) |
| Per-format layout & font-scale rules | `docs/format-design-spec.md` |
| Editor UX contract (one canvas, session=post) | `docs/ux-architecture.md` (ratified) |
| Multi-tenancy ("code contains zero brand facts") | `docs/multi-tenancy-spec.md` (ratified) |
| Advisor/audit unification (one voice) | `docs/advice-ledger-spec.md` (ratified) |
| Feedback capture → learning loop | `docs/self-improvement-loop.md` (ratified) |
| Tester cadence & guarantees | `docs/resident-tester/cadence.md` |
| Taste evidence (likes vs moodboard) | `docs/composition-study-1.md` + `-2.md` (#2 overturns #1's separation conclusion) |
| The generation pipeline, end to end (horizontal flow + vertical build + knobs board) | `docs/asset-pipeline.md` (points to `visual-language-spec.md` for archetype geometry, `format-design-spec.md` for per-format rules) |
| Everything else in docs/ | history/reports — evidence, never law |

`README.md` is **partly stale** (describes the dead Vite `src/App.jsx` layout). Trust `app/` + `components/`, not README.

## 3. The laws (product constitution — enforced in code, never re-litigate)

1. **One voice** — every advisor (local checker + AI auditor) writes into one findings ledger; never a parallel results list.
2. **Actionable findings** — every finding names the actual user-facing words/elements and carries a one-tap fix. No dead labels.
3. **Only real assets** — flag problems; never fabricate a backing/scrim/asset to fix them (`b30fc8e` removed auto-backings by client ruling).
4. **Born-clean** — a freshly generated design carries **zero** advisor dots. Every layout rule is a *layout-time* rule, not a post-hoc flag. Enforced by `lib/audit-local.js` guards + the `bornClean` oracle.
5. **Re-solve around pins** — a user's explicit choice is pinned and never reverted; the system adapts its *own* free variables around it. Explicit intent short-circuits every auto-guard (`5647c98`, `39be0f4`).
6. **Honesty** — a narrated change must be backed by really-changed keys (`renderTruth`); never offer what you can't execute; never a dead end (failed turns show a warm retryable line).
7. **Zero brand facts in code** — every brand constant lives in `lib/brand-defaults.js` (and its DB mirror). No inline brand literals anywhere else.

## 4. Conventions (stated + history-proven)

**Commits.** Conventional prefix + fine scope: `fix(canvas): …`, `feat(WP-Y5): …`, `test(resident): …`. Prose subjects with em-dashes are house style. Non-trivial fix bodies follow the **root-cause format**: `ROOT CAUSE:` paragraph → *"Why the N prior fixes missed it"* (when re-fixing) → `FIX:` → guard/instrumentation added. End every body with the model-versioned `Co-Authored-By: Claude <model> <noreply@anthropic.com>`. Median commit = 1 file; keep them atomic.

**Branch/deploy.** Trunk-based on `main`. **"push" means `git push origin main:staging`** (the deploy-gate branch; the pre-push hook runs deploy-smoke on staging pushes only, blocking only on build/boot failure). **Never push anywhere without the user's explicit word; production (`main` on the remote → shizudio.me pipeline equivalent here is the Vercel main deploy) only on an explicit "push to main/production".** Verify on localhost before any push.

**Code style.** Match the file's voice: explanatory block comments cite the ratified decision and commit context (`// (Hearts — ratified) …`). Comments state *constraints and contracts*, not narration. Single-quotes in lib/, JSX inline styles in the editor surfaces, no new dependencies without an explicit decision. Keep leaf product components and single-responsibility orchestration boundaries at or below 1,500 lines; route editable mutations through `dispatchDesignCommand` rather than adding React state ownership.

**The graceful-degradation contract** (follow it for anything cloud-touching): every cloud call is null-safe, never throws, returns `{configured}`; the API returns `{configured:false}` — never a 500 — when Supabase/env/table is absent; state always mirrors to localStorage; big dataURLs stay device-only. Known violator to not imitate: `app/api/brand/route.js` (returns 500s).

**Mirrored surfaces** (additions must land in ALL of these or fail silently): new archetype/bg/dimension/post-type → `Generator.jsx` constants **and** `lib/design-patch.js` enums (hand-mirrored; unknown values are *silently ignored*) **and** genes emission (`buildGenes`) so likes can weight it. New brand fact → `lib/brand-defaults.js` **and** `lib/schema.sql` seed. Run `auto_mirror-touchlist` (`.claude/skills/`) after any such addition.

**Money.** Photo generation spends real credits (Higgsfield primary, gpt-image-1 fallback). `__woBuildLibrary` and friends are `NODE_ENV` gated — never weaken those gates; never call credit-spending routes in tests (the tester mocks by unsetting keys + blocking the host).

**Shared cloud state.** Sessions/feedback write to one shared brand row. Anything that renders into React state for testing must wrap in `withHarnessMode()` or it pollutes the client's real Posts feed (this bug happened; the guard-purge machinery exists because of it).

## 5. The mistakes a weaker model WILL make here

Named like bugs. Each with the rule that prevents it.

**M1 · The Stale Closure Repaint.** A new async path (image load, debounced autosave, reset, patch apply) calls a captured `draw`/`applyPatch` and repaints the canvas with the previous format's `(W,H)` or pre-reset state. This is the repo's signature bug: `ea52363` documents *three* failed prior fixes. → **Rule: every deferred canvas/state operation goes through `*Ref.current` (`drawRef`, `applyPatchRef`). Never call a captured render/patch function from async code. If you add an async path, grep for how `a38d138`/`ea52363` route theirs.**

**M2 · The Silent No-op.** An edit resolves to "unchanged" against a stale/wrong baseline and does nothing, with no feedback — historically the #1 defect class (`c18533d`). → **Rule: after applying any patch, verify changed keys against render truth; a user-visible action that changes nothing is a defect even if no error is thrown.**

**M3 · The Helpful Override.** Adding an auto-guard (contrast, placement, legibility) that silently relocates/recolours something the user or AI placed deliberately. Eight commits ping-ponged on this before the ruling. → **Rule: automation may only act on the system's own free variables. A pinned/explicit choice is surfaced as an advisor dot, never auto-corrected. And the remedy is never a fabricated asset (law 3).**

**M4 · The Confident Claim.** Shipping a control/offer/narration the render can't back (dead buttons, unexecutable offers, "I changed the date" with no date on canvas). → **Rule: check every claim against `renderTruth` / actual render output before surfacing. A control that does nothing must be removed or labeled honestly ("coming soon").**

**M5 · The Clobbering Write.** A later pipeline stage (photo lands, sample greeting, template load) overwrites earlier user/generated state, or a re-run double-applies (`147fe82`, `461b2ef`, `9e0e271`). → **Rule: pipeline stages must be idempotent and guard against later-arriving async results; before writing, check whether the target changed since the operation started.**

**M6 · The Mirror Miss.** Adding an option in Generator.jsx but not `lib/design-patch.js` (or vice versa): nothing errors — the AI just can't ever select it. → **Rule: run the mirror-check script (see §4 Mirrored surfaces) after any enum/constant addition; treat drift as a build failure.**

**M7 · The Premature Root Cause.** Latching onto the first plausible cause and fixing the wrong thing (the portrait-default glitch took 3 attempts because the first two fixed symptoms; a session-restore race was the cause; likewise the "Facebook-specific gap" hypothesis was wrong — the user's correction, not more code reading, found it). → **Rule: reproduce the symptom and instrument *when/what order* things happen before fixing. Timing words in a bug report ("half a second after load", "when scrolled") are the diagnosis — take them literally.**

**M8 · The Polluting Test.** Running anything that generates designs without harness mode, writing junk to the client's real cloud data. → **Rule: `withHarnessMode()` around any programmatic generation; never POST to `/api/sessions`//api/feedback` from tests; the resident tester's network-layer interception is the reference.**

**M9 · The Desktop Regression (and its mirror).** Fixing mobile by editing shared sizing, silently breaking the tuned desktop layout — or vice versa. → **Rule: viewport-specific fixes go behind `@media (max-width: 76xpx)` or an explicit JS gate, and the verification must measure BOTH 375×812 and 1440×900, before/after numbers side by side.**

**M10 · The Generated-Artifact Commit.** Committing calibration boards, smoke reports, or `.next*` output (179 images are already tracked; the boards churn history every round). → **Rule: never `git add -A`. Stage explicit paths. Generated evidence goes to the scratchpad or `generated/` (already gitignored), not the repo — dated smoke-reports under `docs/resident-tester/` are the one sanctioned exception.**

## 6. Quality bar per deliverable type (checkable, never adjectives)

**A render-engine change (Generator.jsx layout/canvas):**
- [ ] Verified in a real browser at 1440×900 AND 375×812 (numbers, not impressions)
- [ ] All 6 formats spot-checked when geometry is touched (Square/Portrait/Story/Twitter/Facebook/Banner)
- [ ] Born-clean: `__woReadyCheck` (tester build) or the Export checklist shows 0 findings on a fresh generation
- [ ] No stale-draw: format-switch twice, confirm the canvas buffer matches the current dims
- [ ] `next build` green; console free of errors

**A UI/chrome change:** the same minus formats; plus tap targets ≥44px on mobile; plus desktop before/after measurements proving non-regression when the change is mobile-only (and vice versa).

**An API-route change:** curl the route in both configured and unconfigured states; the unconfigured response must be `{configured:false}`, HTTP 200. Rate-limit and size-cap behavior preserved.

**A lib-contract change (sessions/moodboard/cloud-sync/preferences):** the localStorage mirror still works with Supabase env absent (test by unsetting); no throw paths introduced; idempotent on re-run.

**A new archetype/variant:** appears in rotation; emits genes; born-clean in all 6 formats; respects the reflow obstacle set; numeric geometry recorded in `docs/visual-language-spec.md` terms.

**A doc:** states who owns which fact; no duplication of another doc's facts (pointer instead); dated if it's evidence/report class.

**A tester/oracle change:** run the affected journey headfully once; the oracle must fail when the defect is re-introduced (prove by temporary sabotage), not just pass when absent.

## 7. Escalation rules

**Never ask, just do:**
- Commit completed, verified work locally (atomic, house-style message)
- Run localhost/dev servers, browser measurement, screenshots, read-only queries (incl. Supabase reads via service key)
- Fix a bug you introduced this session; re-run verification after any fix
- Route work to background agents and adopt/stash their WIP per §9
- Write/refresh docs that record what already happened (studies, reports)
- Nudge-level cleanups inside files you're already editing (matching style, dead comment removal)

**Never do, regardless of confidence:**
- `git push` anywhere without the user's explicit word this session ("push" = staging; production needs "push to main/production" verbatim intent)
- Weaken `NODE_ENV`/`TEST_HOOKS` gates, or call credit-spending endpoints (`feed-photo`, `brand-library`, Higgsfield/gpt-image) outside an explicitly approved run
- Auto-apply learning-pass/self-improvement proposals (human ratifies; nothing self-applies)
- Write to cloud tables from tests without harness mode; delete/overwrite user data (sessions, likes, moodboard)
- Add a dependency, a brand fact outside `brand-defaults.js`, or a parallel findings list (law 1)
- `git add -A` / commit generated artifacts (M10); force-push; rewrite history
- Mark a task complete with failing or unrun verification

**Stop and surface with findings when:**
- A fix attempt on the same symptom fails twice — write up what you know (root-cause format), stop coding
- The verified fix contradicts the reported symptom (your repro may be wrong — say so)
- Two ratified laws genuinely conflict in a concrete case (e.g. born-clean vs re-solve-around-pins) — the client arbitrates, precedent: `b30fc8e`
- Work requires spending money, touching production data, schema DDL, or anything in the "never do" list
- A background agent dies instantly (0 tool calls = Opus spend limit): relaunch once on session model, then surface if it dies again
- You discover data loss, secret exposure, or the client's real cloud data polluted

## 8. Verification bar per change type

Runtime evidence beats code reading — always. The tiers:

| Change type | Required proof |
|---|---|
| Render/layout | Live browser measurement (rects/px) + screenshot at both viewports; born-clean check |
| Bug fix | **Symptom reproduced before the fix and watched disappearing after.** If you could not reproduce first, the report must say verbatim: **"plausible but unverified at the symptom level"** — no exceptions, no softer phrasing |
| UI/chrome | Before/after numbers at both viewports (the untouched viewport proves non-regression) |
| API route | curl output for configured + unconfigured paths (HTTP codes shown) |
| lib contract | Re-run with env absent; idempotency re-run; exit codes/outputs pasted |
| Docs-only | Read-back not required; link check if links added |
| Risky engine change (reflow/archetypes/patch pipeline) | All of "Render/layout" + generate ≥8 fresh designs across archetypes; resident tester on explicit request or before staging push (pre-push runs it anyway) |

A claim of "verified" without the row's proof is a defect in the report itself. Screenshots prove existence, numbers prove correctness — prefer numbers.

## 9. Orchestration (this repo is large)

The orchestrator stays on the smart model; work goes to background agents in their own contexts (their reads never bloat the orchestrator's). Dispatch policy (user-ratified): **Fable orchestrates, Opus executes; if an Opus agent dies instantly (0 tool calls — spend limit), relaunch once on the session model.** Sonnet for research-class reads.

Every agent brief must include:
1. **Read `docs/operating-manual.md` FIRST** (this file), plus the spec docs the slice touches
2. The slice with acceptance criteria and the exact verification commands (from §8)
3. Commit instructions: atomic, house style, **explicit pathspecs, never `-A`**, DO NOT PUSH
4. Return format: conclusions + machine-checkable evidence (exit codes, measured px, row counts, screenshot paths) — never file dumps — and an explicit list of what was NOT verified
5. Constraints that apply (born-clean, pins, harness mode, money, mirrors)

Never accept an agent's self-report: re-run the cheap gates yourself (`git log --oneline`, `next build` if in doubt, grep the touched files for the claimed change, spot-check one measurement). A failed slice escalates once (better brief or session model), then surfaces to the user. One agent per file-region at a time — check `git status` for another agent's WIP before dispatching into the same file.

## 10. Environment quick facts

- Dev servers: ports 3000/3100/3210 via `.claude/launch.json`; the tester builds into `.next-resident` (isolated)
- `npm run test:resident` = smoke (~4 min, photo-mocked, $0); `:nightly` adds fuzz + real-photo probe (≤3 credits). Nightly cron at 02:30 exists but its node path is currently broken (`env: node: No such file or directory` in `runs/nightly-cron.log`)
- Secrets: `.env.local` (gitignored); `FEEDBACK_DEV_KEY` gates the feedback GET; service-role key is server-only
- Supabase project: `twwjklctbyjadqypqzyo` — one shared brand row `…0001`; staging and local share it
- Staging URL: `white-orchid-generator-git-staging-shizudios-projects.vercel.app` (behind Vercel SSO for curl; use the browser)
