---
name: auto_mirror-touchlist
description: "Mirrored-surfaces drift detector. Invoke AUTOMATICALLY after adding or renaming ANY of: an archetype, a dimension/format, a post type, a background colour, a logo variant, an overlay/shape, or a brand fact — and whenever a request contains phrases like 'add a new format/archetype/color/post type/brand'. These additions must land in several hand-mirrored places and fail SILENTLY when one is missed (trap M6)."
---

# auto_mirror-touchlist

The full touch-list for a multi-site addition, then the deterministic check.

## Touch-list (what must land together)

| Adding a… | Must touch |
|---|---|
| archetype/variant | `Generator.jsx` ARCHETYPES + `lib/design-patch.js` PATCH_OPTIONS.archetypeId (+ PATCH_FIELD_GUIDE note) + genes emission (`buildGenes`) + born-clean in all 6 formats |
| dimension/format | DIMENSIONS + FORMAT_LAYOUTS + PATCH_OPTIONS.dimensionId + `docs/format-design-spec.md` |
| post type | POST_TYPES + PATCH_OPTIONS.postType + assistant PATCH_FIELD_GUIDE |
| background colour | BG_OPTIONS + PATCH_OPTIONS.bgColor + contrast-pairing logic |
| brand fact (colour/font/logo/overlay/voice) | `lib/brand-defaults.js` + `lib/schema.sql` seed + never inline anywhere else |

## Check (deterministic, fail-closed)

```bash
.claude/skills/auto_mirror-touchlist/scripts/mirror-check.sh
```

Exit 0 = in sync. Exit 1 = drift, with per-id instructions. Intentional exclusions (e.g. campaign-only archetypes deliberately hidden from the patch AI) go in `.claude/mirror-allow.txt` as `archetypeId:some_id  # reason` — an allowlist entry without a reason comment is itself drift.

Run it even when you believe you touched everything — the point is that this class of miss produces no error anywhere else.
