#!/bin/bash
# UserPromptSubmit hook — NUDGE (never block) when the prompt asks for a
# multi-site addition (new archetype/format/post type/colour/brand fact…).
# These land in several hand-mirrored places and fail SILENTLY when one is
# missed (operating-manual trap M6). Stdout on exit 0 becomes context for Claude.
PROMPT=$(python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("prompt",""))
except Exception: pass' 2>/dev/null)

echo "$PROMPT" | grep -qiE '(add|create|introduce|make)[^.]{0,40}\b(new )?(archetype|format|dimension|post ?type|background|bg colou?r|colou?r token|logo variant|overlay|shape|brand fact|brand #?[0-9])|new (archetype|format|dimension|post ?type|brand)\b' || exit 0

cat <<'EOF'
[multisite-nudge] This request looks like a MULTI-SITE ADDITION. Such additions
must land in several hand-mirrored places and fail silently when one is missed
(trap M6). After implementing, invoke auto_mirror-touchlist: consult its
touch-list table and run scripts/mirror-check.sh until it exits 0.
EOF
exit 0
