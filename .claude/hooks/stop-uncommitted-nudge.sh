#!/bin/bash
# Stop hook — NUDGE (never block) when a turn ends with uncommitted tracked work.
# Backstops auto_safe-commit: finished-but-uncommitted work is how fixes get lost
# between sessions. Emits a systemMessage; always exits 0.
cd "$(dirname "$0")/../.." || exit 0

DIRTY=$(git status --porcelain 2>/dev/null | grep -E '^( M|M |MM|A | A|D | D)' | awk '{print $2}')
[ -z "$DIRTY" ] && exit 0

N=$(echo "$DIRTY" | wc -l | tr -d ' ')
LIST=$(echo "$DIRTY" | head -4 | tr '\n' ' ')
MORE=""; [ "$N" -gt 4 ] && MORE="(+$((N-4)) more) "

# Nudge only — a human or agent may be mid-work; never block the stop.
printf '{"systemMessage": "⚠ %s tracked file(s) modified but uncommitted: %s%s— if this work is finished, commit it via auto_safe-commit before moving on."}\n' "$N" "$LIST" "$MORE"
exit 0
