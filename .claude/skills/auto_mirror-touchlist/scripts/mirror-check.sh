#!/bin/bash
# mirror-check.sh — deterministic drift detector for the hand-mirrored surfaces
# (docs/operating-manual.md §4 "Mirrored surfaces", trap M6). These surfaces are
# hand-synced across files and fail SILENTLY when one copy is missed, so this
# script is the blocking guard (run in CI + after any archetype/format/post-type/
# colour/logo/overlay/brand-fact addition).
#
# Checks, in both directions unless noted:
#   1  Generator ARCHETYPES[].id   ↔ design-patch PATCH_OPTIONS.archetypeId
#   2  Generator DIMENSIONS[].id   ↔ PATCH_OPTIONS.dimensionId
#   3  Generator POST_TYPES[].id   ↔ PATCH_OPTIONS.postType
#   4  Generator BG_OPTIONS[].id   ⊆ PATCH_OPTIONS.bgColor
#   5  assistant/route.js LANDING_ARCHETYPES[].id  ==  Generator ARCHETYPES  (the
#      "third archetype table" — a landing pick with no ARCHETYPES twin is dead;
#      an ARCHETYPES entry the landing model can't pick is unreachable). M6/audit M6.
#   6  Generator FORMAT_LAYOUTS: top-level keys == DIMENSIONS ids, AND every format
#      contains every POST_TYPES id (a missing cell silently falls back to
#      ig_square.text_post via formatLayoutFor).
#   7  moodboard-genes DEVICE_TO_ARCHETYPES ids ⊆ ARCHETYPES  (an off-vocab id makes
#      a composition device silently non-expressible); plus preferences GENE_KEYS
#      == sessions buildGenes keys (a gene emitted but not aggregated is lost).
#   8  Generator BG_OPTIONS ids ⊆ brand-defaults DEFAULT_PALETTE keys (a bg with no
#      palette hex renders undefined).
#   9  brand-defaults DEFAULT_LOGO_VARIANTS ids == schema.sql logo_variants seed
#      slugs, AND DEFAULT_OVERLAY_ASSETS ids == brand_overlays seed slugs (1:1 — a
#      fallback with no DB twin can't be re-pointed per brand, and vice versa).
#  10  Text-element CLASS enum (spec §5) 1:1 across FOUR surfaces: text-elements.mjs
#      ELEMENT_CLASSES == design-patch PATCH_OPTIONS.elementClass == Generator
#      ELEMENT_CLASS_IDS == assistant/route.js ELEMENT_CLASSES. A class present in
#      one surface but missing from another silently loses either AI addressability,
#      belt routing, or apply/gene weighting.
# Plus a warn-level scan for inline brand hex literals outside lib/brand-defaults.js.
#
# Intentional exclusions live in .claude/mirror-allow.txt, one per line:
#   archetypeId:brand_card   # campaign-only, not exposed to the patch AI (reason)
#
# Exit 0 = mirrors clean (or all drift allowlisted). Exit 1 = unallowed drift.
# Exit 2 = a parser could not locate a surface (source shape changed — fix here).
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

python3 - <<'PYEOF'
import re, sys

def die(msg):
    print(msg); sys.exit(2)

def read(path):
    try:
        return open(path).read()
    except OSError as e:
        die(f"mirror-check: cannot read {path}: {e}")

g    = read('components/Generator.jsx')
d    = read('lib/design-patch.js')
asst = read('app/api/assistant/route.js')
mb   = read('lib/moodboard-genes.js')
pref = read('lib/preferences.js')
sess = read('lib/sessions.js')
bd   = read('lib/brand-defaults.js')
sql  = read('lib/schema.sql')
te   = read('lib/text-elements.mjs')

def block(src, pattern, name):
    m = re.search(pattern, src, re.S)
    if not m: die(f"mirror-check: could not locate {name} (parser needs updating?)")
    return m.group(1)

def gen_ids(const_name):
    body = block(g, rf'const {const_name}\s*=\s*\[(.*?)\n\];', f'`const {const_name}` in Generator.jsx')
    return set(re.findall(r'\bid:\s*"([A-Za-z_0-9-]+)"', body))

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

ARCH  = gen_ids('ARCHETYPES')
DIMS  = gen_ids('DIMENSIONS')
POSTS = gen_ids('POST_TYPES')
BG    = gen_ids('BG_OPTIONS')

failures, warnings = [], []
def fail(msg): failures.append("  " + msg)

# ── Checks 1–3: Generator enum ↔ design-patch PATCH_OPTIONS (both directions) ──
pairs = [
    ("archetypeId", ARCH,  patch_ids('archetypeId') - {'none'}),
    ("dimensionId", DIMS,  patch_ids('dimensionId')),
    ("postType",    POSTS, patch_ids('postType')),
]
for key, gen, patch in pairs:
    for missing in sorted(gen - patch):
        if f"{key}:{missing}" not in allow:
            fail(f"{key}: '{missing}' exists in Generator.jsx but NOT in design-patch.js PATCH_OPTIONS — the AI can never select it (silent). Add it there, or allowlist '{key}:{missing}' with a reason.")
    for dead in sorted(patch - gen):
        if f"{key}:{dead}" not in allow:
            fail(f"{key}: '{dead}' exists in design-patch.js but NOT in Generator.jsx — a dead enum the AI can offer but the app ignores. Remove it, or allowlist '{key}:{dead}'.")

# ── Check 4: BG — Generator ids must be offerable (subset); patch may carry extra ─
bg_patch = patch_ids('bgColor')
for missing in sorted(BG - bg_patch):
    if f"bgColor:{missing}" not in allow:
        fail(f"bgColor: '{missing}' in Generator BG_OPTIONS but not in PATCH_OPTIONS.bgColor. Add or allowlist 'bgColor:{missing}'.")

# ── Check 5: assistant/route.js LANDING_ARCHETYPES == Generator ARCHETYPES ────────
lb = block(asst, r'const LANDING_ARCHETYPES\s*=\s*\[(.*?)\n\];', 'LANDING_ARCHETYPES in app/api/assistant/route.js')
LAND = set(re.findall(r"\bid:\s*'([A-Za-z_0-9-]+)'", lb))
for missing in sorted(ARCH - LAND):
    if f"landingArch:{missing}" not in allow:
        fail(f"LANDING_ARCHETYPES (assistant/route.js): ARCHETYPES has '{missing}' but the landing table does not — the landing model can never pick it (silent). Add it, or allowlist 'landingArch:{missing}'.")
for dead in sorted(LAND - ARCH):
    if f"landingArch:{dead}" not in allow:
        fail(f"LANDING_ARCHETYPES (assistant/route.js): '{dead}' has no ARCHETYPES twin in Generator.jsx — a landing pick the renderer can't realise. Remove it, or allowlist 'landingArch:{dead}'.")

# ── Check 6: FORMAT_LAYOUTS — keys == DIMS, each format covers every POST_TYPE ────
fl = block(g, r'const FORMAT_LAYOUTS\s*=\s*\{(.*?)\n\};', 'FORMAT_LAYOUTS in Generator.jsx')
fmt_keys = set(re.findall(r'^  (\w+):\s*\{', fl, re.M))
for missing in sorted(DIMS - fmt_keys):
    fail(f"FORMAT_LAYOUTS: no layout block for dimension '{missing}' — it silently falls back to ig_square. Add a '{missing}: {{ … }}' block.")
for extra in sorted(fmt_keys - DIMS):
    fail(f"FORMAT_LAYOUTS: block '{extra}' is not a DIMENSIONS id — dead layout. Remove it or add the dimension.")
for fmt, body in re.findall(r'^  (\w+):\s*\{(.*?)^  \},?\s*$', fl, re.M | re.S):
    if fmt not in DIMS: continue
    pts = set(re.findall(r'^    (\w+):\{', body, re.M))
    for missing in sorted(POSTS - pts):
        fail(f"FORMAT_LAYOUTS['{fmt}']: missing postType '{missing}' — that cell silently falls back to ig_square.text_post. Add it.")

# ── Check 7: moodboard DEVICE_TO_ARCHETYPES ⊆ ARCHETYPES; GENE_KEYS == buildGenes ─
dm = block(mb, r'DEVICE_TO_ARCHETYPES\s*=\s*\{(.*?)\n\};', 'DEVICE_TO_ARCHETYPES in lib/moodboard-genes.js')
dev_ids = set()
for arr in re.findall(r':\s*\[([^\]]*)\]', dm):
    dev_ids |= set(re.findall(r"'([A-Za-z_0-9-]+)'", arr))
for off in sorted(dev_ids - ARCH):
    fail(f"moodboard-genes DEVICE_TO_ARCHETYPES: '{off}' is not an ARCHETYPES id — its composition device is silently non-expressible. Fix the id or add the archetype.")

gk = re.search(r'GENE_KEYS\s*=\s*\[([^\]]*)\]', pref)
if not gk: die("mirror-check: could not locate GENE_KEYS in lib/preferences.js")
GENE_KEYS = set(re.findall(r"'([a-zA-Z]+)'", gk.group(1)))
bg_body = block(sess, r'export function buildGenes\([^)]*\)\s*\{.*?return\s*\{(.*?)\};', 'buildGenes in lib/sessions.js')
BUILD_KEYS = set(re.findall(r'^\s*(\w+):', bg_body, re.M))
for missing in sorted(BUILD_KEYS - GENE_KEYS):
    fail(f"gene keys: buildGenes emits '{missing}' but preferences GENE_KEYS omits it — the aggregate never counts that gene (silent). Add it to GENE_KEYS.")
for extra in sorted(GENE_KEYS - BUILD_KEYS):
    fail(f"gene keys: GENE_KEYS lists '{extra}' but buildGenes never emits it — a gene column that stays empty. Remove it or emit it.")

# ── Check 8: BG_OPTIONS ids ⊆ DEFAULT_PALETTE keys ───────────────────────────────
pb = block(bd, r'DEFAULT_PALETTE\s*=\s*\{(.*?)\n\};', 'DEFAULT_PALETTE in lib/brand-defaults.js')
PAL = set(re.findall(r'(\w+)\s*:\s*"#[0-9A-Fa-f]{6}"', pb))
for off in sorted(BG - PAL):
    fail(f"BG_OPTIONS: '{off}' has no DEFAULT_PALETTE hex in lib/brand-defaults.js — it renders undefined. Add the palette key.")

# ── Check 9: logo variants + overlays — brand-defaults 1:1 with schema.sql seeds ──
def ids_in(src, pattern, name):
    return set(re.findall(r'\bid:\s*"([A-Za-z_0-9-]+)"', block(src, pattern, name)))
LOGO = ids_in(bd, r'DEFAULT_LOGO_VARIANTS\s*=\s*\[(.*?)\n\];', 'DEFAULT_LOGO_VARIANTS')
OVER = ids_in(bd, r'DEFAULT_OVERLAY_ASSETS\s*=\s*\[(.*?)\n\];', 'DEFAULT_OVERLAY_ASSETS')
lseed = block(sql, r'insert into logo_variants[^;]*?values(.*?)on conflict', 'logo_variants seed in lib/schema.sql')
LOGO_SEED = set(re.findall(r"\(\s*'([A-Za-z_0-9-]+)'", lseed))
oseed = block(sql, r'insert into brand_overlays[^;]*?values(.*?)on conflict', 'brand_overlays seed in lib/schema.sql')
OVER_SEED = set(re.findall(r"\(\s*'([A-Za-z_0-9-]+)'", oseed))
for missing in sorted(LOGO - LOGO_SEED):
    fail(f"logo variants: DEFAULT_LOGO_VARIANTS '{missing}' has no schema.sql logo_variants seed row — a DB brand can't override it. Add the seed row.")
for missing in sorted(LOGO_SEED - LOGO):
    fail(f"logo variants: schema.sql seeds '{missing}' but DEFAULT_LOGO_VARIANTS lacks it — the offline fallback can't render it. Add the default.")
for missing in sorted(OVER - OVER_SEED):
    fail(f"overlays: DEFAULT_OVERLAY_ASSETS '{missing}' has no brand_overlays seed row. Add the seed row.")
for missing in sorted(OVER_SEED - OVER):
    fail(f"overlays: brand_overlays seeds '{missing}' but DEFAULT_OVERLAY_ASSETS lacks it. Add the default.")

# ── Check 10: text-element CLASS enum 1:1 across four mirrored surfaces ───────────
te_body = block(te, r'ELEMENT_CLASSES\s*=\s*Object\.freeze\(\[(.*?)\]\)', 'ELEMENT_CLASSES in lib/text-elements.mjs')
TE_CLASSES = set(re.findall(r"['\"]([a-z]+)['\"]", te_body))
g_ec = block(g, r'const ELEMENT_CLASS_IDS\s*=\s*\[([^\]]*)\]', 'ELEMENT_CLASS_IDS in Generator.jsx')
GEN_CLASSES = set(re.findall(r"['\"]([a-z]+)['\"]", g_ec))
D_CLASSES = patch_ids('elementClass')
asst_ec = block(asst, r'const ELEMENT_CLASSES\s*=\s*\[([^\]]*)\]', 'ELEMENT_CLASSES in assistant/route.js')
ASST_CLASSES = set(re.findall(r"['\"]([a-z]+)['\"]", asst_ec))
CLASS_SURFACES = [
    ('lib/text-elements.mjs ELEMENT_CLASSES', TE_CLASSES),
    ('lib/design-patch.js PATCH_OPTIONS.elementClass', D_CLASSES),
    ('Generator.jsx ELEMENT_CLASS_IDS', GEN_CLASSES),
    ('assistant/route.js ELEMENT_CLASSES', ASST_CLASSES),
]
_canon = TE_CLASSES
for _name, _set in CLASS_SURFACES:
    for missing in sorted(_canon - _set):
        fail(f"elementClass: '{missing}' is a sanctioned class but MISSING from {_name} — the tenth mirrored surface drifted (spec §5). Add it there.")
    for extra in sorted(_set - _canon):
        fail(f"elementClass: '{extra}' appears in {_name} but is NOT in lib/text-elements.mjs ELEMENT_CLASSES — a phantom class. Remove it or add it to the canonical enum.")

# ── Brand-fact scan (warn only): hex literals outside brand-defaults ─────────────
for path in ['components/Generator.jsx', 'lib/design-patch.js', 'lib/audit-local.js']:
    src = read(path)
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
print("mirror-check OK: all 10 mirrored surfaces in sync" + (f" ({len(allow)} allowlisted)" if allow else ""))
PYEOF
