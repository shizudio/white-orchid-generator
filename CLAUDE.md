# White Orchid Generator — Claude digest

**Read `docs/operating-manual.md` before non-trivial work.** This file is the fixed per-session cost; depth lives in the manual and the spec docs it indexes (§2 there maps every fact to its one owning doc).

**Also read `docs/template-system-spec.md` (RATIFIED 2026-08-18) before product work.** Fixed hand-authored templates + an admin/user split. Not yet implemented, but it changes the status of several non-negotiables below (born-clean becomes structural; pins-win becomes admin-only) and supersedes parts of the other specs. Its §2 says exactly what it owns.

## Non-negotiables
- **NEVER `git push` without the user's explicit word.** "push" = `git push origin main:staging`. Production only on explicit "push to main/production". Verify on localhost first.
- **Born-clean**: fresh generations carry zero advisor dots — layout-time rules, never post-hoc flags.
- **Pins win**: never auto-revert or auto-correct an explicit user/AI placement; adapt the system's own free variables; surface issues as advisor dots only.
- **Never fabricate assets** (scrims/backings) to fix a finding — flag instead.
- **Zero brand facts outside `lib/brand-defaults.js`.**
- **No credit spend** (Higgsfield/gpt-image routes, `__woBuildLibrary`) and no `NODE_ENV`/`TEST_HOOKS` gate weakening without explicit approval.
- **Harness mode** (`withHarnessMode()`) around any programmatic generation — cloud state is the client's real data.
- Stage explicit paths, never `git add -A`. No generated artifacts in commits.

## The traps (manual §5 has all ten, named, with rules)
Top three by recurrence: **stale-closure repaints** (route every async draw/patch through `*Ref.current`), **silent no-op edits** (verify changed keys against render truth after applying), **mirror misses** (Generator.jsx constants ↔ `lib/design-patch.js` enums ↔ genes — additions must land in all; run `auto_mirror-touchlist`).

## Verification (manual §8 has the full table)
Runtime evidence beats code reading. Bug fixes: reproduce the symptom before, watch it disappear after — otherwise report **"plausible but unverified at the symptom level"** verbatim. Layout changes: measured numbers at 375×812 AND 1440×900, all 6 formats when geometry moves.

## Commits
`prefix(scope): prose subject` — see manual §4 for the root-cause body format. End with model-versioned `Co-Authored-By`. Atomic; median is 1 file.

## Orchestration (manual §9)
Fable orchestrates, Opus executes, session-model relaunch when Opus dies at 0 tool calls. Every agent brief: manual-first, acceptance criteria + exact verification commands, explicit-pathspec commits, no push, evidence not file dumps. Re-run cheap gates on every agent self-report.

## Skills (project `.claude/skills/`)
- `auto_safe-commit` — run before every commit: branch/secret/generated-file/message-format gate (fail-closed script)
- `auto_verify-router` — classifies a change, prints the exact proof commands, refuses "verified" without them
- `auto_mirror-touchlist` — after adding archetype/bg/dimension/post-type/brand-fact: detects mirror drift deterministically

## Quick facts
Dev: `npm run dev` (ports via `.claude/launch.json`). Tests: `npm run test:resident` only (~4 min, $0) — no lint/unit/CI. Staging deploys via pre-push smoke on `staging` pushes. Supabase project `twwjklctbyjadqypqzyo`, one shared brand row. README is partly stale — trust `app/` + `components/Generator.jsx` (~10k lines, the whole editor).
