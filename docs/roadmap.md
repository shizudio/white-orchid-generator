# Product Roadmap — from single-asset studio to marketing engine

Status: priorities ratified by client (Shina), 2026-07-05, after a marketer's-eye UX
critique. Companion to docs/ux-architecture.md + docs/self-improvement-loop.md.

## Audience (decides everything below)
PRIMARY (now): preschool student-teachers + a light-touch marketing lead who make a
handful of posts and do NOT run heavy campaigns yet. **Consistency and trust are the
product** for them. SECONDARY (later, "Pro layer"): the volume marketer who needs
campaigns/batch. We build ONE product with progressive disclosure — never fork the UX.

## The six moves (marketer critique), mapped to phases
Ranked build order the client set: **{1, 2, 5} first, then {3, 4, 6}. All six ship
before the NEXT production push.** Then production.

| # | Move | Phase | Notes |
|---|---|---|---|
| 1 | Campaign / multi-asset generation | **1a now (foundation) · 1b Pro (later)** | Full campaign engine = Pro/deferred. NOW = only the data/architecture an eventual campaign plugs into (see §1). |
| 2 | "Every format, always" | **Batch 1 (now)** | Design the idea once → all ratios laid out intelligently; tweak exceptions only. Kills format-babysitting; serves consistency. |
| 5 | Post-ready checklist (auditor upgrade) | **Batch 1 (now)** | Turn the existing AI auditor into a per-format "ready to post" gate: contrast at thumbnail, safe-area, platform copy limits, legibility. Trust layer that removes the human reviewer. |
| 3 | Variations on demand | **Batch 2 (pre-prod)** | "5 versions of this", "apply to all". Volume speed without the Pro engine. |
| 4 | Photo steering (light) | **Batch 2 (pre-prod)** | Directable re-rolls ("warmer", "wider", "the child on the left") without writing a photographer brief. |
| 6 | Scheduler / calendar | **Batch 2 (pre-prod)** | Plan + (later) publish; closes the loop back to which designs actually shipped/performed. |

## Batch 1 — NOW (consistency + trust)

### WP-Y5 — Auditor → "Ready to post" checklist (start FIRST; client emphasised it)
Upgrade the AI auditor (lib/audit-local.js + the vision audit) from advisory findings
into a per-format GO/FIX gate shown before export:
- Contrast/legibility checked at ACTUAL thumbnail size (feed scale), not full-res.
- Safe-area check per platform (IG story UI zones, feed crop, etc.).
- Copy within platform limits (caption length, headline overflow).
- One clear verdict per format: "Ready" ✓ or specific fixes, each one-tap-fixable via
  the patch pipeline. Never a vague warning.
- Runs across ALL formats (auditAllFormats already sweeps off-screen) — surfaces the
  format that fails even when the current one is clean.

### WP-Y2 — "Every format, always"
Reframe the mental model from one-canvas to one-idea-many-formats:
- After generate, the design exists in ALL 6 formats simultaneously (it already renders
  each; make the UX treat them as one set, not a switcher you babysit).
- A format strip that shows every ratio live; edits to the "master" cascade, per-format
  tweaks are local overrides (the perDim system already supports this — surface it).
- Export = all formats at once, named + organised (already exists; make it the default
  finish, tied to the WP-Y5 checklist passing per format).

### WP-Y1a — Campaign FOUNDATION only (no Pro UI yet)
Lay the data model a campaign will plug into later, without building the engine:
- A "set" abstraction: sessions can belong to a named group (foundation for campaigns).
- Ensure the every-format + variations data shapes are campaign-ready.
- NO campaign generation UI now — that's Pro (§Pro).

## Batch 2 — BEFORE the next production push

### WP-Y3 — Variations on demand
"Give me 5 versions" / "apply this change to all" — fan a patch or a generate across
copies, present as a small board to pick from. Reuses the archetype variant ring + the
board renderers (__woFeedBoard/__woCalibrationBoard scaffolding).

### WP-Y4 — Photo steering (light)
Between "refresh photo" (dice roll) and writing a photographer brief: quick directable
nudges ("warmer", "wider crop", "less clutter", "different child") that adjust the
Higgsfield scene prompt under the hood — the user never writes the brief.

### WP-Y6 — Scheduler / calendar
A calendar surface to place finished posts on dates; (later) publish + capture which
designs shipped, feeding the self-improvement loop's performance signal.

## Pro layer — LATER (deferred, acknowledged important)
### WP-P1 — Campaign engine (the full §1)
"Give me a two-week enrollment campaign" → a planned feed-rhythm grid of N posts +
stories + banner, each on-brand, steerable, exportable + schedulable as a set. Built on
the WP-Y1a foundation. Progressive disclosure: appears for power users, invisible to
teachers.

## Gate
Batches 1 + 2 (WP-Y1a,Y2,Y3,Y4,Y5,Y6) all land + verify on staging → client review →
production push. The Pro campaign engine is a separate later track.
