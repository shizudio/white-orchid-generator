#!/bin/bash
# mirror-check.sh — deterministic drift detector for the hand-mirrored surfaces
# (docs/operating-manual.md §4 "Mirrored surfaces", trap M6).
#
# Compares, in both directions:
#   Generator.jsx ARCHETYPES[].id   ↔ design-patch.js PATCH_OPTIONS.archetypeId
#   Generator.jsx DIMENSIONS[].id   ↔ PATCH_OPTIONS.dimensionId
#   Generator.jsx POST_TYPES[].id   ↔ PATCH_OPTIONS.postType
#   Generator.jsx BG_OPTIONS[].id   ⊆ PATCH_OPTIONS.bgColor
# Plus a warn-level scan for inline brand hex literals outside lib/brand-defaults.js.
#
# Intentional exclusions live in .claude/mirror-allow.txt, one per line:
#   archetypeId:brand_card   # campaign-only, not exposed to the patch AI (reason)
#
# Exit 0 = mirrors clean (or all drift allowlisted). Exit 1 = unallowed drift.
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

python3 - <<'PYEOF'
import re, sys, os

def die(msg):
    print(msg); sys.exit(2)

try:
    g = open('components/Generator.jsx').read()
    d = open('lib/design-patch.js').read()
except OSError as e:
    die(f"mirror-check: cannot read source files: {e}")

def gen_ids(const_name):
    m = re.search(rf'const {const_name}\s*=\s*\[(.*?)\n\];', g, re.S)
    if not m: die(f"mirror-check: could not locate `const {const_name}` in Generator.jsx (parser needs updating?)")
    return set(re.findall(r'\bid:\s*"([A-Za-z_0-9-]+)"', m.group(1)))

def patch_ids(key):
    m = re.search(rf"{key}:\s*\[([^\]]*)\]", d, re.S)
    if not m: die(f"mirror-check: could not locate PATCH_OPTIONS.{key} in lib/design-patch.js")
    return set(re.findall(r"['\"]([A-Za-z_0-9-]+)['\"]", m.group(1)))

allow = set()
try:
    for line in open('.claude/mirror-allow.txt'):
        line = line.split('#')[0].strip()
        if line: allow.add(line)
except OSError:
    pass

pairs = [
    ("archetypeId", gen_ids('ARCHETYPES'), patch_ids('archetypeId') - {'none'}),
    ("dimensionId", gen_ids('DIMENSIONS'), patch_ids('dimensionId')),
    ("postType",    gen_ids('POST_TYPES'), patch_ids('postType')),
]
bg_gen, bg_patch = gen_ids('BG_OPTIONS'), patch_ids('bgColor')

failures, warnings = [], []
for key, gen, patch in pairs:
    for missing in sorted(gen - patch):
        tag = f"{key}:{missing}"
        if tag not in allow:
            failures.append(f"  {key}: '{missing}' exists in Generator.jsx but NOT in design-patch.js PATCH_OPTIONS — the AI can never select it (silent). Add it there, or allowlist '{tag}' with a reason.")
    for dead in sorted(patch - gen):
        tag = f"{key}:{dead}"
        if tag not in allow:
            failures.append(f"  {key}: '{dead}' exists in design-patch.js but NOT in Generator.jsx — a dead enum the AI can offer but the app ignores. Remove it, or allowlist '{tag}'.")

# BG: Generator ids must be offerable (subset); patch may carry extra curated pastels.
for missing in sorted(bg_gen - bg_patch):
    tag = f"bgColor:{missing}"
    if tag not in allow:
        failures.append(f"  bgColor: '{missing}' in Generator BG_OPTIONS but not in PATCH_OPTIONS.bgColor. Add or allowlist '{tag}'.")

# Brand-fact scan (warn only): hex literals outside brand-defaults.
for path in ['components/Generator.jsx', 'lib/design-patch.js', 'lib/audit-local.js']:
    try: src = open(path).read()
    except OSError: continue
    hexes = re.findall(r'["\']#([0-9A-Fa-f]{6})["\']', src)
    if hexes:
        warnings.append(f"  {path}: {len(hexes)} inline hex literal(s) — brand facts belong in lib/brand-defaults.js (warn-only; some are legit derived tones)")

if warnings:
    print("mirror-check WARNINGS (non-blocking):")
    print("\n".join(warnings))
if failures:
    print("mirror-check DRIFT (blocking):")
    print("\n".join(failures))
    sys.exit(1)
print("mirror-check OK: all mirrored surfaces in sync" + (f" ({len(allow)} allowlisted)" if allow else ""))
PYEOF
