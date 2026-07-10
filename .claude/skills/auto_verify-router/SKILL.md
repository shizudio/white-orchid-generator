---
name: auto_verify-router
description: "Verification tier router. Invoke AUTOMATICALLY before claiming any change is done/verified/fixed, before every safe-commit of non-doc code, and whenever composing a report that contains the words 'verified', 'fixed', or 'works'. Also invoke when reviewing a background agent's self-report to know which gates to re-run."
---

# auto_verify-router

Classifies the change set and prints the exact proof obligations from `docs/operating-manual.md` §8. The script is deterministic; your judgment is producing the evidence it demands.

## Use

```bash
# What must I prove for the staged / last change?
.claude/skills/auto_verify-router/scripts/verify-router.sh            # staged, falls back to last commit
.claude/skills/auto_verify-router/scripts/verify-router.sh --last
.claude/skills/auto_verify-router/scripts/verify-router.sh --files components/Generator.jsx

# Gate a "verified" claim — exits 1 unless evidence is attached:
.claude/skills/auto_verify-router/scripts/verify-router.sh --strict \
  --evidence "canvas 343×429 @375×812 via preview_eval" \
  --evidence "/tmp/comp-portrait.png" \
  --evidence "next build exit 0"
```

## Rules of use
- Run the printed proof commands for every tier listed; paste their outputs/numbers as `--evidence`.
- **Bug fixes**: the script prints the reproduce-before rule. If you did not reproduce the symptom before fixing, your report says **"plausible but unverified at the symptom level"** — verbatim, no softer phrasing.
- Evidence is numbers, exit codes, and file paths — never "looks right".
- When auditing an agent's report: run this on its commits (`--last`), then re-run at least one cheap gate from each printed tier yourself.
