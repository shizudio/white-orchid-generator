#!/bin/bash
# safe-commit.sh — fail-closed commit gate for white-orchid-generator.
# Enforces: clean index at start (no sweeping another agent's WIP), explicit
# pathspecs (never -A), no secrets, no generated artifacts, no oversized blobs,
# house-style message, main-branch-only. NEVER pushes.
#
# Usage:
#   safe-commit.sh -m "$(cat <<'MSG'
#   fix(scope): subject line
#
#   Body...
#
#   Co-Authored-By: Claude <model> <noreply@anthropic.com>
#   MSG
#   )" [--allow-generated] [--allow-large] [--allow-branch] -- <path> [<path>...]
#
# Exit 0 = committed. Exit 1 = refused (reason on stderr, index restored).
set -u

MSG="" ALLOW_GENERATED=0 ALLOW_LARGE=0 ALLOW_BRANCH=0
PATHS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -m) MSG="$2"; shift 2 ;;
    --allow-generated) ALLOW_GENERATED=1; shift ;;
    --allow-large) ALLOW_LARGE=1; shift ;;
    --allow-branch) ALLOW_BRANCH=1; shift ;;
    --) shift; PATHS=("$@"); break ;;
    *) echo "safe-commit: unknown arg '$1' (paths go after --)" >&2; exit 1 ;;
  esac
done

fail() { echo "safe-commit REFUSED: $*" >&2; [ ${#ADDED[@]:-0} -gt 0 ] && git reset -q -- "${ADDED[@]}" 2>/dev/null; exit 1; }
ADDED=()

[ -n "$MSG" ] || fail "no commit message (-m required)"
[ ${#PATHS[@]} -gt 0 ] || fail "no pathspecs — explicit paths after -- are required (never -A)"

# ── Branch guard ──────────────────────────────────────────────────────────────
BRANCH=$(git branch --show-current 2>/dev/null)
if [ "$BRANCH" != "main" ] && [ "$ALLOW_BRANCH" != "1" ]; then
  fail "on branch '$BRANCH', not main (this repo is trunk-based; --allow-branch to override)"
fi

# ── Clean-index guard: refuse to inherit strays (another agent's WIP) ────────
PRESTAGED=$(git diff --cached --name-only)
if [ -n "$PRESTAGED" ]; then
  fail "index is not empty — pre-staged files would be swept into this commit:
$PRESTAGED
Unstage them (git reset) or commit them separately first."
fi

# ── Stage exactly the requested paths ─────────────────────────────────────────
for p in "${PATHS[@]}"; do
  git add -- "$p" 2>/dev/null || fail "cannot stage '$p' (does it exist?)"
  ADDED+=("$p")
done
STAGED=$(git diff --cached --name-only)
[ -n "$STAGED" ] || fail "nothing staged — the given paths have no changes"

# ── Secret guards: filenames, then content ───────────────────────────────────
BAD_NAMES=$(echo "$STAGED" | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|(^|/)secrets?\.' | grep -v '\.env\.example$')
[ -z "$BAD_NAMES" ] || fail "secret-like filenames staged:
$BAD_NAMES"
SECRET_HITS=$(git diff --cached --unified=0 | grep -E '^\+' | grep -E 'sk-[A-Za-z0-9_-]{20,}|eyJhbGciOi[A-Za-z0-9_-]{10,}|SERVICE_ROLE_KEY\s*=\s*.+|API_KEY\s*=\s*[A-Za-z0-9]{8,}' | head -5)
[ -z "$SECRET_HITS" ] || fail "secret-looking content in the staged diff:
$SECRET_HITS"

# ── Generated-artifact guard ──────────────────────────────────────────────────
if [ "$ALLOW_GENERATED" != "1" ]; then
  GEN=$(echo "$STAGED" | grep -E '^Examples/calibration_board|^docs/resident-tester/smoke-report-|^generated/|^\.next|^scripts/resident-tester/runs/|\.log$')
  [ -z "$GEN" ] || fail "generated artifacts staged (use --allow-generated only if truly intended):
$GEN"
fi

# ── Size guard: no blob > 2MB ────────────────────────────────────────────────
if [ "$ALLOW_LARGE" != "1" ]; then
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    SZ=$(wc -c < "$f" | tr -d ' ')
    if [ "$SZ" -gt 2097152 ]; then fail "staged file over 2MB: $f ($SZ bytes) — use --allow-large if intended"; fi
  done <<< "$STAGED"
fi

# ── Message format: house style ───────────────────────────────────────────────
FIRST=$(printf '%s' "$MSG" | head -1)
echo "$FIRST" | grep -qE '^(feat|fix|test|docs|refactor|refine|style|remove|security|chore|perf|build|merge)(\([^)]+\))?: .+' \
  || fail "subject line doesn't match 'prefix(scope): subject' house style: '$FIRST'"
[ ${#FIRST} -le 100 ] || fail "subject line over 100 chars"
printf '%s' "$MSG" | grep -q 'Co-Authored-By:' \
  || fail "message missing the Co-Authored-By line (house convention on every commit)"

# ── Commit (never push) ───────────────────────────────────────────────────────
TMP=$(mktemp) && printf '%s\n' "$MSG" > "$TMP"
git commit -q -F "$TMP" || { rm -f "$TMP"; fail "git commit itself failed"; }
rm -f "$TMP"
echo "safe-commit OK: $(git log --oneline -1)"
echo "(not pushed — pushing requires the user's explicit word)"
