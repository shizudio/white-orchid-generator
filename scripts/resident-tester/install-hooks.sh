#!/usr/bin/env bash
# ── Resident Tester — INSTALL GIT HOOKS ──────────────────────────────────────
# Installs a `.git/hooks/pre-push` that runs the deploy smoke ONLY when the push
# targets the `staging` branch (that's the deploy that goes to the staging URL).
# Pushes to any other ref (feature branches, main, tags) are left untouched.
#
# Run once:  bash scripts/resident-tester/install-hooks.sh
# Re-running is safe — it overwrites the managed hook (only ours; it refuses to
# clobber an unrelated pre-push it didn't write).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK_DIR="$REPO/.git/hooks"
HOOK="$HOOK_DIR/pre-push"
MARKER="# managed-by: resident-tester/install-hooks.sh"

mkdir -p "$HOOK_DIR"

# Refuse to overwrite a foreign pre-push hook we didn't author (don't stomp on a
# husky / other tooling hook silently).
if [[ -f "$HOOK" ]] && ! grep -q "$MARKER" "$HOOK" 2>/dev/null; then
  echo "[install-hooks] a non-resident pre-push hook already exists at:"
  echo "                $HOOK"
  echo "[install-hooks] refusing to overwrite it. Merge the smoke call in by hand,"
  echo "                or remove that hook and re-run this."
  exit 1
fi

cat > "$HOOK" <<'HOOK_EOF'
#!/usr/bin/env bash
# managed-by: resident-tester/install-hooks.sh
# Pre-push: run the deploy smoke ONLY when pushing the `staging` branch.
#
# git feeds pushed refs on STDIN, one line per ref:
#   <local ref> <local sha> <remote ref> <remote sha>
# We scan for a remote ref of refs/heads/staging. If none is in this push, we skip
# (exit 0) so non-staging pushes are never slowed down. WO_SKIP_SMOKE=1 also skips.
set -uo pipefail

if [[ "${WO_SKIP_SMOKE:-0}" == "1" ]]; then
  echo "[pre-push] WO_SKIP_SMOKE=1 — skipping deploy smoke."
  exit 0
fi

REPO="$(git rev-parse --show-toplevel)"
SMOKE="$REPO/scripts/resident-tester/deploy-smoke.sh"

pushing_staging=0
while read -r local_ref local_sha remote_ref remote_sha; do
  # A deletion push has an all-zero local sha and no work to test.
  [[ "$local_sha" =~ ^0+$ ]] && continue
  if [[ "$remote_ref" == "refs/heads/staging" ]]; then
    pushing_staging=1
  fi
done

if [[ "$pushing_staging" != "1" ]]; then
  # Not a staging push — nothing to smoke. Let the push proceed untouched.
  exit 0
fi

if [[ ! -x "$SMOKE" && ! -f "$SMOKE" ]]; then
  echo "[pre-push] deploy-smoke.sh not found — skipping (exit 0)."
  exit 0
fi

echo "[pre-push] staging push detected — running deploy smoke…"
bash "$SMOKE"
# deploy-smoke.sh exits 0 unless the app fails to build/boot (then 1 → blocks).
exit $?
HOOK_EOF

chmod +x "$HOOK"
chmod +x "$SCRIPT_DIR/deploy-smoke.sh" 2>/dev/null || true

echo "[install-hooks] installed pre-push hook → $HOOK"
echo "[install-hooks] it runs the deploy smoke ONLY on pushes to 'staging'."
echo "[install-hooks] skip any time with:  WO_SKIP_SMOKE=1 git push origin staging"
