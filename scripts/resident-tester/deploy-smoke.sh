#!/usr/bin/env bash
# ── Resident Tester — DEPLOY SMOKE HOOK ──────────────────────────────────────
# Runs the resident tester's SMOKE cadence (full persona pool, photos mocked) so
# every staging deploy gets a quick sanity sweep of the studio. Meant to be called
# by the pre-push hook, but is safe to run by hand.
#
# BEHAVIOUR
#   • Builds the isolated production dist (WO_DIST_DIR=.next-resident) ONLY if it's
#     stale or missing — a fresh build is reused, so back-to-back pushes are fast.
#   • Runs the smoke (node run.js, no --nightly) which writes the report.
#   • Prints the report path + a one-line verdict.
#
# EXIT CODES (this is the contract the pre-push hook relies on)
#   0  — the app built, booted, and the smoke completed. NON-BLOCKING on findings:
#        quality flags do NOT fail the push (they're advisory; read the report).
#   1  — the app FAILED to build or boot. This SHOULD block a broken push.
#
# Skip entirely with WO_SKIP_SMOKE=1.
set -uo pipefail

if [[ "${WO_SKIP_SMOKE:-0}" == "1" ]]; then
  echo "[deploy-smoke] WO_SKIP_SMOKE=1 — skipping."
  exit 0
fi

# Resolve the repo root from this script's location (works from any cwd / from git).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO" || { echo "[deploy-smoke] cannot cd to repo root"; exit 1; }

DIST_DIR="${WO_DIST_DIR:-.next-resident}"
export WO_DIST_DIR="$DIST_DIR"

echo "[deploy-smoke] repo: $REPO"
echo "[deploy-smoke] dist: $DIST_DIR"

# ── Build the isolated dist if stale ─────────────────────────────────────────
# "Stale" = no BUILD_ID, OR any tracked source file is newer than the BUILD_ID.
needs_build=0
build_id="$REPO/$DIST_DIR/BUILD_ID"
if [[ ! -f "$build_id" ]]; then
  needs_build=1
  echo "[deploy-smoke] no existing build — building."
else
  # Newest source file across the app surfaces we care about.
  newest_src="$(find app components lib public package.json next.config.* -type f \
      \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.json' -o -name '*.css' \) \
      -newer "$build_id" 2>/dev/null | head -n1)"
  if [[ -n "$newest_src" ]]; then
    needs_build=1
    echo "[deploy-smoke] build is stale (e.g. $newest_src changed) — rebuilding."
  else
    echo "[deploy-smoke] build is fresh — reusing it."
  fi
fi

if [[ "$needs_build" == "1" ]]; then
  # NEXT_PUBLIC_WO_TEST_HOOKS=1 keeps the tester's ORACLES (__woTruth,
  # __woReadyCheck, the guard sweeps, __woFeedbackDump…) alive in this ISOLATED
  # build only — a real production build (flag unset) carries no __wo hooks at
  # all (security item 8, ratified 2026-07-06).
  if ! WO_DIST_DIR="$DIST_DIR" NEXT_PUBLIC_WO_TEST_HOOKS=1 npx next build; then
    echo "[deploy-smoke] ❌ BUILD FAILED — blocking the push (fix the build, then re-push)."
    exit 1
  fi
fi

if [[ ! -f "$build_id" ]]; then
  echo "[deploy-smoke] ❌ build produced no BUILD_ID — blocking the push."
  exit 1
fi

# ── Run the smoke ────────────────────────────────────────────────────────────
echo "[deploy-smoke] running smoke (full persona pool, photos mocked)…"
if ! node "$SCRIPT_DIR/run.js"; then
  # run.js exits non-zero only on a FATAL (couldn't boot the server / crashed) — a
  # broken app the push should NOT proceed on.
  echo "[deploy-smoke] ❌ smoke could not run (app failed to boot) — blocking the push."
  exit 1
fi

# ── Verdict ──────────────────────────────────────────────────────────────────
DATE="$(date +%F)"
REPORT="$REPO/docs/resident-tester/smoke-report-$DATE.md"
if [[ -f "$REPORT" ]]; then
  echo "[deploy-smoke] report: $REPORT"
  # Pull the "Total quality flags raised" line for a one-line verdict.
  flags_line="$(grep -m1 'Total quality flags raised' "$REPORT" 2>/dev/null || true)"
  if [[ -n "$flags_line" ]]; then
    echo "[deploy-smoke] verdict: ${flags_line#*- }"
  else
    echo "[deploy-smoke] verdict: smoke complete (see report)."
  fi
else
  echo "[deploy-smoke] verdict: smoke complete (report path not found for $DATE)."
fi

echo "[deploy-smoke] ✅ non-blocking — push proceeds. Review the report above."
exit 0
