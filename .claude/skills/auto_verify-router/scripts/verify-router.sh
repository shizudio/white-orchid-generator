#!/bin/bash
# verify-router.sh — classifies a change set into verification tiers and prints
# the EXACT proof commands (docs/operating-manual.md §8). In --strict mode it
# refuses "verified" (exit 1) when a non-DOCS tier has no evidence attached.
# NOTE: written for macOS bash 3.2 (no declare -A, no mapfile).
#
# Usage:
#   verify-router.sh                      # classify staged (or last commit), print required proofs
#   verify-router.sh --last               # classify last commit
#   verify-router.sh --files a.js b.css   # classify an explicit list
#   verify-router.sh --strict --evidence "canvas 343px @375 (eval)" --evidence "/tmp/comp-1.png"
set -u

MODE="auto" STRICT=0 BUGFIX=0
FILES="" EVIDENCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --last) MODE="last"; shift ;;
    --staged) MODE="staged"; shift ;;
    --files) shift; while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do FILES="$FILES
$1"; shift; done ;;
    --strict) STRICT=1; shift ;;
    --bugfix) BUGFIX=1; shift ;;
    --evidence) EVIDENCE="$EVIDENCE
  • $2"; shift 2 ;;
    *) echo "verify-router: unknown arg '$1'" >&2; exit 2 ;;
  esac
done

if [ -z "$(echo "$FILES" | tr -d '[:space:]')" ]; then
  if [ "$MODE" = "last" ]; then
    FILES=$(git show --name-only --pretty=format: HEAD | grep -v '^$')
    git log -1 --pretty=%s | grep -qE '^fix' && BUGFIX=1
  else
    FILES=$(git diff --cached --name-only)
    if [ -z "$FILES" ]; then
      FILES=$(git show --name-only --pretty=format: HEAD | grep -v '^$')
      git log -1 --pretty=%s | grep -qE '^fix' && BUGFIX=1
    fi
  fi
fi
[ -n "$(echo "$FILES" | tr -d '[:space:]')" ] || { echo "verify-router: no changed files found" >&2; exit 2; }

T_RENDER=0 T_UI=0 T_API=0 T_LIB=0 T_MIRROR=0 T_TESTER=0 T_DOCS=0 T_TOOLING=0 T_OTHER=0
COUNT=0
OLDIFS=$IFS; IFS='
'
for f in $FILES; do
  [ -z "$f" ] && continue
  COUNT=$((COUNT+1))
  case "$f" in
    components/Generator.jsx|components/EditorChrome*|app/globals.css) T_RENDER=1 ;;
    components/*) T_UI=1 ;;
    app/api/*) T_API=1 ;;
    lib/design-patch.js) T_MIRROR=1; T_RENDER=1 ;;
    lib/*) T_LIB=1 ;;
    scripts/resident-tester/*) T_TESTER=1 ;;
    docs/*|*.md) T_DOCS=1 ;;
    .claude/*) T_TOOLING=1 ;;
    *) T_OTHER=1 ;;
  esac
done
IFS=$OLDIFS

NAMES=""
[ $T_RENDER = 1 ] && NAMES="$NAMES RENDER"; [ $T_UI = 1 ] && NAMES="$NAMES UI"
[ $T_API = 1 ] && NAMES="$NAMES API";       [ $T_LIB = 1 ] && NAMES="$NAMES LIB_CONTRACT"
[ $T_MIRROR = 1 ] && NAMES="$NAMES MIRROR"; [ $T_TESTER = 1 ] && NAMES="$NAMES TESTER"
[ $T_DOCS = 1 ] && NAMES="$NAMES DOCS";     [ $T_TOOLING = 1 ] && NAMES="$NAMES TOOLING"
[ $T_OTHER = 1 ] && NAMES="$NAMES OTHER"
echo "── verify-router ── $COUNT file(s) → tiers:$NAMES"
echo

[ $T_RENDER = 1 ] && cat <<'EOF'
[RENDER] Required proof (manual §8):
  1. Live browser at 1440×900 AND 375×812 — measured rects/px, not impressions
  2. Geometry touched → spot-check all 6 formats (ig_square/ig_portrait/story/twitter/facebook/banner)
  3. Born-clean: fresh generation shows 0 advisor findings (__woReadyCheck under
     NEXT_PUBLIC_WO_TEST_HOOKS=1, else the Export checklist)
  4. Stale-draw check: switch formats twice; canvas buffer matches current dims
  5. npx next build → green; browser console → clean
EOF
[ $T_UI = 1 ] && cat <<'EOF'
[UI] Required proof: before/after numbers at BOTH viewports (the untouched
  viewport proves non-regression); tap targets ≥44px on mobile; console clean.
EOF
[ $T_API = 1 ] && cat <<'EOF'
[API] Required proof: curl the route CONFIGURED and UNCONFIGURED (env absent);
  unconfigured must be HTTP 200 {"configured":false} — never a 500. Show codes.
EOF
[ $T_LIB = 1 ] && cat <<'EOF'
[LIB_CONTRACT] Required proof: works with Supabase env absent (localStorage
  mirror intact); no new throw paths; idempotent on re-run (run it twice, paste
  both outputs / exit codes).
EOF
[ $T_MIRROR = 1 ] && cat <<'EOF'
[MIRROR] Required proof: .claude/skills/auto_mirror-touchlist/scripts/mirror-check.sh
  exits 0 (or every reported drift is in the allowlist with a reason).
EOF
[ $T_TESTER = 1 ] && cat <<'EOF'
[TESTER] Required proof: run the affected journey once; prove the oracle FAILS
  when its defect is reintroduced (temporary sabotage), not only that it passes.
EOF
[ $T_TOOLING = 1 ] && cat <<'EOF'
[TOOLING] Required proof: execute the script/hook against its failure scenarios
  (each guard must actually refuse) — a passing happy path alone proves nothing.
EOF
[ $T_DOCS = 1 ] && echo "[DOCS] No runtime proof required. Check links if added."

if [ "$BUGFIX" = "1" ]; then cat <<'EOF'

[BUG FIX RULE] Verified ONLY if the symptom was reproduced BEFORE the fix and
watched disappearing AFTER. Otherwise the report must say, verbatim:
  "plausible but unverified at the symptom level"
EOF
fi

NONDOC=0
[ $T_RENDER = 1 -o $T_UI = 1 -o $T_API = 1 -o $T_LIB = 1 -o $T_MIRROR = 1 -o $T_TESTER = 1 -o $T_TOOLING = 1 -o $T_OTHER = 1 ] && NONDOC=1
if [ "$STRICT" = "1" ] && [ "$NONDOC" = "1" ]; then
  if [ -z "$EVIDENCE" ]; then
    echo; echo "STRICT: NOT VERIFIED — no --evidence attached for non-DOCS tiers." >&2
    exit 1
  fi
  echo; echo "ATTESTED EVIDENCE:$EVIDENCE"
fi
exit 0
