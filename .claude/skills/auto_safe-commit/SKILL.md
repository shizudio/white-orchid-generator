---
name: auto_safe-commit
description: "Fail-closed commit gate. Invoke AUTOMATICALLY whenever you are about to run `git commit` in this repo, for any reason — your own work, an agent's adopted WIP, a doc, a one-line fix. Also invoke when the user says commit/save/checkpoint this. Never call `git commit` directly; always go through this skill's script."
---

# auto_safe-commit

The deterministic mechanics live in the script; your judgment is only in composing the message and choosing the pathspecs.

## Ritual

1. `git status --porcelain` — know what's dirty and whose it is (another agent's WIP is NOT yours to commit; if the index has strays the script will refuse).
2. Compose the message in house style (manual §4): `prefix(scope): prose subject`, root-cause body when it's a re-fix, `Co-Authored-By: Claude <model> <noreply@anthropic.com>` last line.
3. Run the gate — it stages, checks, and commits atomically:

```bash
.claude/skills/auto_safe-commit/scripts/safe-commit.sh -m "$(cat <<'MSG'
fix(scope): subject

Body.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
)" -- path/one path/two
```

4. If it refuses, FIX THE CAUSE — do not reach for the `--allow-*` overrides to silence it. Each override needs a stated reason in your reply.

## What the script refuses (fail-closed)
Non-empty index at start (stray sweep) · missing/implicit pathspecs (`-A` is impossible) · secret-like names or content · generated artifacts (calibration boards, smoke reports, `runs/`, logs) · blobs >2MB · off-main branch · non-house-style subject · missing Co-Authored-By. It never pushes; pushing needs the user's explicit word (CLAUDE.md non-negotiable #1).
