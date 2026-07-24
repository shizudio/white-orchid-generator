# Multi-Tenancy P1.5 — Role Vocabulary PRD

**Status:** Draft (client review pending)
**Started:** 2026-07-24
**Migration style:** Incremental, behaviour-preserving rename slices — pixel-identity gated
**Current checkpoint:** `Not started — PRD under review`
**Last completed checkpoint:** `—`

This document is the source of truth for the P1.5 role-vocabulary work: the mapping
table, the mechanism decisions, the phase plan, and the release gates. The *ruling*
that this work exists, and its place in the multi-tenancy sequence, is owned by
`docs/multi-tenancy-spec.md` (Ratifications, 2026-07-24) — this PRD implements it.
Every implementation session must update the two checkpoint lines above and tick
completed work below; resume at the first unchecked item.

## 1. Product problem

The platform is becoming multi-brand (brand #2: Perena), and the engine still *speaks
White Orchid*. P1 moved every brand value (hexes, fonts, assets, voice) into
`lib/brand-defaults.js` + `brand_kit`, but the vocabulary — the names the engine, the
AI, and the stored designs use to refer to colours and shapes — is still the White
Orchid palette:

- 1,200+ references to `burnham`/`whiteSmoke`/… across ~25 files (Generator.jsx 557,
  assistant route 211, ArtDirectorChat 97, audit-local 88, design-patch 48).
- The AI's patch schema and field guide reason in White Orchid colour names
  (`lib/design-patch.js` PATCH_OPTIONS.bgColor + PATCH_FIELD_GUIDE.bgColor): for any
  second brand the model would narrate the wrong brand's colours.
- 71 archetype variant palette entries and 14 literal `shape-1` engine references bind
  layouts to White Orchid token and shape ids.
- `applyBrandKit` (components/Generator.jsx) hydrates hexes by matching each row's
  *label string* against a White-Orchid-only table — a second brand's palette silently
  fails to load at all. This is a hard P3 blocker.

Without P1.5, onboarding any new brand means either lying to it in another brand's
vocabulary or forking the engine. With P1.5, the engine speaks semantic roles and each
brand's kit supplies the names and hexes — the multi-tenancy principle ("code contains
zero brand facts") completed at the vocabulary level.

## 2. Goals

1. The engine's colour and shape vocabulary is semantic roles, brand-book style
   (primary / secondary / support / accent / neutral / field tints), with zero brand
   names in engine code.
2. White Orchid's names become that brand's *labels* — what humans see is unchanged.
3. Every stored design, template, draft, and cached AI output that speaks the old
   vocabulary keeps working forever, without any rewrite of stored data.
4. Brand-kit hydration is role-keyed: any brand's palette loads without code changes.
5. The AI's colour vocabulary (schema enum descriptions + colour-word mapping) is
   generated per brand from its kit; for White Orchid the generated output preserves
   today's behaviour.
6. The proof of the whole phase is that White Orchid does not change: all 144
   render-fingerprint cells byte-identical, zero baseline bumps.

## 3. Non-goals

- Variable palette cardinality (brands with more or fewer than the 21 colour roles) —
  P3/P4 territory.
- Light/dark `klass` derivation from hex (WO hexes unchanged → classes stay valid).
- Expanding the `textColorId` set or any other enum's membership.
- Archetype core-vs-brand-pack enablement lists (separate ratified item).
- Font upload (P3), auth/RLS/subdomain resolution (P2).
- UI chrome label sweep — visible label strings stay untouched in P1.5; for White
  Orchid they are already correct. The sweep happens in P3 when Perena makes stale
  labels visible.
- Any bulk migration of stored design data. Ever.

## 4. Governing invariants (release blockers for every phase)

1. **Pixel identity.** All 144 fingerprint cells byte-identical to the pre-P1.5
   baseline in the env-matched harness; arch-stress 114/114; born-clean 456/456.
   Zero deliberate bumps — a moved hash means the change was not a pure rename.
2. **No stored-data writes.** Legacy names are translated on read at defined doors;
   sessions/templates/drafts JSONB is never rewritten.
3. **Mirrors stay whole.** `.claude/skills/auto_mirror-touchlist/scripts/mirror-check.sh`
   exits 0 at every phase boundary, including the new role-vocabulary checks.
4. **Labels are sacred.** Human-facing strings ("Burnham", "Celadon", tray names,
   inspector labels) do not change in this phase.
5. **The alias map is permanent.** It is load-bearing compatibility machinery, not a
   transition shim — never scheduled for deletion.

## 5. The role vocabulary (owned here)

| Group | WO label (unchanged) | Old engine id → New role |
|---|---|---|
| Primary | Burnham | `burnham` → `primary` |
| Primary dark | Burnham Dark | `burnhamDk` → `primaryDeep` |
| Primary ground | White Smoke | `whiteSmoke` → `paper` |
| Primary near-black | Jet | `jet` → `dark` |
| Neutral | Ash | `ash` → `neutral` |
| Secondary | Wisteria | `wisteria` → `secondary` |
| Support | Celadon | `celadon` → `support1` |
| Support deep | Celadon Deep | `celadonDeep` → `support1Deep` |
| Support | Yellow Green | `yellowGreen` → `support2` |
| Accent | Tangerine | `tangerine` → `accent` |
| Accent tint (derived) | Soft Tangerine | `softTangerine` → `accentSoft` |
| Field tint 1–6 | Dusty Pink, Butter, Sky, Sage, Terracotta, Lilac | `dustyPink`…`lilac` → `field1`…`field6` |
| Brand shape 1–3 | Shape 1/2/3 | `shape-1/2/3` → `mask1/mask2/mask3` |
| Accessories | Arrow, Curved Arrow, Spark, Plus, Ring, Wave | `acc-*` unchanged (already generic) |

Derived enum memberships (same cardinality, renamed values):
`bgColor` → `[primary, paper, secondary, support1, dark, field1..field6]`;
`textColorId` → `[auto, paper, primary, dark, accent, secondary]`;
`overlayAssetId` → `[mask1, mask2, mask3, acc-arrow, acc-curve, acc-spark, acc-plus, acc-ring, acc-wave]`.

Rationale for names: matches the brand-book grouping in White Orchid's own guideline
(design-system export `_ds_manifest.json`: "Primary palette — Burnham · Ash · White
Smoke · Jet", accent & status, tag/support colours) and the two-layer token pattern
(brand-named layer 1, semantic layer 2). Roles name *palette position*, not usage,
because the same colour is background in one archetype and ink in another.

## 6. Mechanism decisions (ratified in session, 2026-07-24)

1. **Legacy alias map — code constant.** `LEGACY_TOKEN_ALIASES` +
   `LEGACY_OVERLAY_ALIASES` in `lib/design-patch.js`, applied at exactly three doors:
   `applyDesignPatch` entry, stored-state load (sessions/templates/drafts), and the
   assistant belts' colour-word resolution. Live cloud `brand_overlays` rows with old
   slugs are normalised by the same alias on API read. No per-brand DB alias machinery.
2. **Role-keyed hydration.** `applyBrandKit` reads `color.role → B[role]`; the current
   label-matching table remains only as fallback for un-migrated kit rows.
3. **Generated AI vocabulary.** `buildColorGuide(brandColors)` produces the bgColor
   field-guide prose (role id + brand label + hex-derived colour words) per request.
   Snapshot-tested to preserve today's White Orchid colour-word mappings. The two
   brand-coloured phrases in the archetypeId guide are re-worded to roles.
4. **UI minimum-touch.** Components update internal id references only; visible label
   strings untouched (see Non-goals).

## 7. Phases

Each phase is one atomic safe-commit; gates run at every marked point.

- [ ] **R1 — Aliases first, inert.** Add both alias maps + normalisation at the three
      doors while old names are still canonical (no-op today). Unit tests for each door.
- [ ] **R2 — lib layer rename.** `design-patch.js` (enums, JSON schema, guide
      generator), `archetype-layout-policy.mjs`, `archetype-materialization.mjs`,
      `moodboard-genes.js` (PALETTE_CLASS_TO_BG), `audit-local.js`, `preferences.js`.
      Extend mirror-check with role-vocabulary checks. **Gate: fingerprint 144/144.**
- [ ] **R3 — Generator.jsx rename.** `B` keys, `BG_OPTIONS`, 71 variant entries,
      archetype specs, role-keyed `applyBrandKit`. The highest-risk slice.
      **Gate: fingerprint 144/144 + arch-stress 114/114 + born-clean 456/456.**
- [ ] **R4 — Assistant route + belts.** Colour-word→role map, generated field guide
      wired per brand, few-shot examples. WO guide-parity snapshot test.
- [ ] **R5 — UI components minimum-touch.** Internal id references in inspector
      panels, FeedGallery, ExportPanel, pages.
- [ ] **R6 — Seeds + docs.** `schema.sql` brand_kit.colors role seed (21 roles,
      labels/hexes unchanged) + brand_overlays `mask1..3` slugs; `brand-defaults.js`
      key rename with labels; fix the mirror-check path cited in
      `docs/multi-tenancy-spec.md` Ratifications (§2 names `scripts/mirror-check.sh`;
      correct path is `.claude/skills/auto_mirror-touchlist/scripts/mirror-check.sh`).
- [ ] **R7 — Full release gate.** All acceptance criteria below; localhost verification
      at 1440×900 + 375×812; staging push only on the client's explicit word.

## 8. Release gates (acceptance criteria — all pass/fail)

1. 144/144 fingerprint hashes byte-identical (offline-default AND cloud-config env);
   arch-stress 114/114; born-clean 456/456.
2. mirror-check.sh exit 0 including new role checks.
3. Unit suite green; `next build` green; `npm run test:resident` smoke green.
4. Legacy-load probe: a pre-P1.5 session state carrying `bgColor:"burnham"`,
   `textColorId:"wisteria"`, and a placed `shape-1` overlay renders pixel-identical in
   harness mode.
5. Legacy-patch probe: `applyDesignPatch` with old token names applies correctly.
6. Grep gate: old ids appear in `lib/`, `components/`, `app/` only inside the alias
   maps and human-facing label strings.
7. Hydration proof: a synthetic brand kit with alien labels hydrates via roles.
8. `buildColorGuide(WO row)` snapshot equals today's colour-word mappings.

## 9. Rollback

Revert the commit range; stored data was never touched, so old code reads it
unchanged. Known asymmetry: designs saved *after* the rename store role names, which
pre-P1.5 code silently ignores. Mitigation: short rollback window (verify localhost →
staging before production); if rollback is ever required, first cherry-pick a reversed
alias commit (role→legacy at the same three doors) onto the old code.

## 10. Pointers (doc ownership)

- The ruling + multi-tenancy sequence: `docs/multi-tenancy-spec.md` (Ratifications 2026-07-24)
- Archetype numeric geometry: `docs/visual-language-spec.md` (untouched by this work)
- Per-format layout rules: `docs/format-design-spec.md` (untouched)
- Fingerprint harness + baseline: `scripts/guards/render-fingerprint-baseline.json`
- Mirror gate: `.claude/skills/auto_mirror-touchlist/scripts/mirror-check.sh`
