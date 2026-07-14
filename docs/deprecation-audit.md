# Deprecation Audit — a calmer, cleaner Content Studio

Status: **Superseded historical audit.** Its accepted removals have since changed the
surface map (for example, Export now lives beside the canvas and the format strip is the
canonical format control). Use `refactor-prd.md` and `ux-architecture.md` as current truth.

## How to read this

The client asked for a **less noisy, cleaner UX**. This document lists every
user-facing surface and control I could find in the code, flags the ones that are
outdated, duplicated, superseded, or never actually reachable, and proposes what to
do with each. Nothing here is deleted yet. **Tick a row to approve it.**

Each row is classified:

- **REMOVE** — delete outright; it adds noise and nothing depends on it.
- **DEMOTE** — keep the capability but fold it into a surface that already exists,
  so it stops being its own standing thing.
- **KEEP** — earns its place; listed only so the inventory is complete.

Risk is the effort + chance of breaking something: **S** small (isolated, safe),
**M** medium (touches shared state), **L** large (needs a real replacement first).

The five product laws this is measured against (from the ratified specs): **one
voice** (advisors advise once), **actionable** (never a dead end), **real assets**
(nothing that can't ship), **born-clean** (no clutter returning through a back door),
**pins** (the user's explicit choices are respected). Plus the §7 calm aesthetic:
the canvas is the hero, chrome recedes.

---

## Summary count

| Verdict | Count |
|---|---|
| **REMOVE** | 11 |
| **DEMOTE** | 6 |
| **KEEP (noted)** | 5 |
| **Total surfaces reviewed** | 22 |

The single biggest noise reduction is the **top navigation bar**: three of its four
tabs (Upload, Library, Brand kit) send the user *out of the studio* to standalone
pages that the in-editor photo flow has already replaced.

---

## 1. Top navigation bar (the four tabs)

| # | Surface / control | Evidence | Verdict | Recommendation | Risk |
|---|---|---|---|---|---|
| 1.1 | **"Upload" tab** → standalone upload page (`app/upload/page.jsx`) | Bulk-upload-with-consent page. The editor now uploads photos in two places already (photo inspector "＋ Upload", + Add gallery "Upload a photo"). A separate page predates the chat-first / in-editor flow. | **DEMOTE** | Remove the nav tab. Keep the consent-tagging capability only if the team still bulk-preps a photo library; if so, move it behind Brand kit / admin, not top-level nav. Otherwise REMOVE. | M |
| 1.2 | **"Library" tab** → standalone library page (`app/library/page.jsx`) | Full-page browser of saved images. In-editor `LibraryPicker` already lets you pick a Library photo without leaving the canvas. Two doors to one library. | **DEMOTE** | Remove the nav tab; the in-editor picker is the real path. Keep the page only as an admin/asset-management view if needed, off the main nav. | M |
| 1.3 | **"Brand kit" tab** → `app/admin/brand` | Admin-only (colours, typography, publishing guidance). Not a teacher-facing surface; sits in the same row as "Create". | **DEMOTE** | Keep the capability (admins need it) but move it out of the primary nav into an admin/settings entry, so student-teachers aren't shown a control they never use. | S |
| 1.4 | **"Create" tab** | The studio itself. The product. | **KEEP** | Keep — but once 1.1–1.3 leave, the nav is essentially just brand + "Create", which is the calm state we want. | — |

> After 1.1–1.3: the top nav stops being a four-way menu that scatters the user
> across pages and becomes a quiet header. This is the highest-leverage single change.

---

## 2. Landing page (`app/page.jsx`)

| # | Surface / control | Evidence | Verdict | Recommendation | Risk |
|---|---|---|---|---|---|
| 2.1 | **"Skip to the studio →" link** | Always-present bypass around the one screen that teaches the prompt-first product. Flagged as a taste call in docs/interaction-audit.md (L9) and docs/design-critique.md (#2). | **DEMOTE** | Don't delete the escape hatch, but soften it: fold it into a quieter secondary position (it currently gets its own block with 40px of air). It should not compete with the prompt. | S |
| 2.2 | Prompt bar + rotating example chips | Working, on-brand, teaches range. The heart of the product. | **KEEP** | — | — |

---

## 3. Top bar in the editor (globals row)

The row is: **Posts · Templates · Format · Type · ＋ Add** (recede weight) then
**↶ Undo · Export** (lead weight). Contents reviewed item by item below.

| # | Surface / control | Evidence | Verdict | Recommendation | Risk |
|---|---|---|---|---|---|
| 3.1 | **Posts** popover (session thumbnails, ＋ New post, sync badge, Show older) | The ratified sessions model (one session = one post). Real and load-bearing. | **KEEP** | — | — |
| 3.2 | **Templates** popover — starter templates + "Your templates" + "Save current design as a template" | Ratified home for templates. | **KEEP** | — | — |
| 3.3 | **Templates popover → "Layouts" section** (12 archetypes + None) | Duplicates the chat "Try another layout" chip AND the whole grid is a second way to do what chat does. The layout grid is a designer-tool affordance grafted into a template menu; the spec's own §2.6 maps "try another layout" to chat. | **DEMOTE** | Keep ONE layout entry point. Since the chat chip "Try another layout" is the ratified path, shrink the in-menu grid to a small "Change layout" that hands to chat, or drop it. Two grids of 12 tiles is exactly the "too many nouns" noise the critique named. | M |
| 3.4 | **Newer-draft-from-another-device banner** (Load / Dismiss inside Templates) | Sync recovery. Niche but real; only appears when a conflict exists. | **KEEP** | — | — |
| 3.5 | **Format** popover (6 dimensions + drop-hint) | Duplicates the always-visible "Your post in every format" strip below the canvas, which also switches format on click. The roadmap (WP-Y2) reframes the product as "every format, always" — a Format *switcher* menu contradicts that model. | **DEMOTE** | The below-canvas format strip is the ratified surface. Remove the Format popover from the top bar (or reduce it to a tooltip); the strip already does the job and matches the "one idea, all formats" story. | M |
| 3.6 | **Type** popover (post-type chips) | Post type shapes which text fields exist. Rarely changed by a teacher after generate; it's designer plumbing surfaced as a top-level noun. | **DEMOTE** | Fold into the + Add / chat flow (adding a date or caption already implies the type). At minimum recede it further; it competes with the conversation for no daily benefit. | M |
| 3.7 | **＋ Add** gallery | Ratified, praised in the interaction audit as "the star". | **KEEP** | — | — |
| 3.8 | **↶ Undo** (top bar) | Fine as muscle memory. | **KEEP** | — | — |
| 3.9 | **Export** popover | The finish. | **KEEP** (contents audited in §6) | — | — |

---

## 4. ＋ Add gallery contents (`renderAddGallery`)

| # | Tile / control | Evidence | Verdict | Recommendation | Risk |
|---|---|---|---|---|---|
| 4.1 | Text tiles: "Small text under the title", "Date", "Little label up top", "Button", "Logo", "Photo" | Recognition-over-recall, plain language. Exactly right for the audience. | **KEEP** | — | — |
| 4.2 | **"Photo" subsection** (separate "From the Library" + "Upload a photo" buttons) directly under the tile grid | Redundant with the "Photo" TILE right above it (which already opens Library / photo inspector) AND with the photo inspector's own Library/Upload buttons. Three ways to attach a photo in one panel. | **REMOVE** | Delete the duplicated Photo subsection; the Photo tile already routes correctly. | S |
| 4.3 | **Shapes** section (petal marks as tiles) | Client-ratified as first-class (§2.7). | **KEEP** | — | — |
| 4.4 | **Decoration** section + "Add new" (upload custom SVG/PNG overlay) | The petal Shapes are the signature brand element; a generic "Decoration" bucket plus a free-form SVG/PNG *uploader* invites off-brand clutter — the exact thing the brand-safety moat exists to prevent (design-critique "brand safety is enforced, not hoped for"). The built-in arrow/spark/plus/ring/wave accessories are low-value for a preschool poster. | **REMOVE** (the upload) / **DEMOTE** (the built-ins) | Remove the "Add new" custom-overlay uploader (born-clean law: no arbitrary art). Consider dropping the generic accessories entirely, or fold the few useful ones into Shapes. Keep petals. | S |

---

## 5. Photo inspector contents (`renderPhotoPanel`)

| # | Control | Evidence | Verdict | Recommendation | Risk |
|---|---|---|---|---|---|
| 5.1 | Sample photos strip + Library + Upload + quick transforms (Center/50/75/Fill/0°) | The ratified home for photo manipulation. | **KEEP** | — | — |
| 5.2 | **"AI photo idea" — Midjourney launcher** (`MidjourneyLauncher.jsx`) | Opens a helper that tells the user to go to midjourney.com, paste a hard-coded personalization profile string, generate, download, come back, and re-upload. This entire manual round-trip is **superseded** by the built-in Higgsfield photo pipeline (`/api/design-generate`, `generateScenePhoto`, the "Refresh photo" button, and chat "generate a photo of…"). It sends the user to a different tool for something the app now does in-canvas. Pure noise + off-brand risk. | **REMOVE** | Delete the Midjourney launcher and its trigger. The in-app photo generation + "Refresh photo" fully replace it. | S |
| 5.3 | **Video tab** (Upload / Play / Restart / Save / saved-videos list / MP4) | The panel itself says *"MP4 export is the next phase."* Video can be uploaded and composited on-canvas but **cannot be exported** — it is a dead-end feature that violates the real-assets law (nothing the user makes here can ship). Adds a whole media mode, a hidden file input, a saved-videos store, and inspector controls for zero shippable output. | **REMOVE** | Remove the Video tab, the video file input, `uploadVideo`/`saveVideo`/`savedVideos`, and the Image/Video toggle, until MP4 export actually exists. Re-introduce as a set when it can produce a real deliverable. | M |

---

## 6. Export popover contents

| # | Control | Evidence | Verdict | Recommendation | Risk |
|---|---|---|---|---|---|
| 6.1 | PNG / JPG toggle + "Download all N formats" (primary) + "Just this one" (secondary) | Ratified WP-Y2 finish (export the set). | **KEEP** | — | — |
| 6.2 | **Ready-to-post checklist** (per-format GO/FIX) | Ratified WP-Y5 trust layer. | **KEEP** | — | — |
| 6.3 | **AI audit** button | Ratified (One Advice Ledger): manual, merges into the same dots/checklist. Correctly wired to the new inline `AuditRunner`, NOT the old panel (see 8.1). | **KEEP** | — | — |
| 6.4 | **Caption** writer (`CaptionPanel.jsx`) | Overlaps the chat-first law: "make the caption warmer / rewrite the caption" is already a chat ask, and the chat has a "Rewrite caption" chip. A separate floating panel for caption text is a parallel path to a chat capability. It also floats over the canvas (a surface the architecture wants eliminated). | **DEMOTE** | Fold caption-writing into chat (it can already write copy). If kept for the "copy caption + hashtags for the platform" convenience, make it a chat action rather than a standing floating panel. | M |
| 6.5 | **Recent exports** history (thumbnails + "Clear all") | A mini file-manager inside an export menu. Nobody re-downloads from here (the file is already saved); it's storage + a "Clear all" chore the user must tend. Adds noise to the finish moment. | **REMOVE** | Delete the recent-exports history block and its clear control. The OS download folder is the history. | S |
| 6.6 | **Brand guardrails tooltip** | One-line consent/brand reminder before export. Low cost, high value for the consent workflow. | **KEEP** | — | — |

---

## 7. Chat (Art Director) surfaces

| # | Control | Evidence | Verdict | Recommendation | Risk |
|---|---|---|---|---|---|
| 7.1 | Dynamic quick chips (Change photo · Rewrite caption / + Add caption · Try another layout · New post) | Ratified §2.1. Never a dead end. | **KEEP** | — | — |
| 7.2 | `/feedback` command | Ratified escape hatch (WP-Z), deterministic, feeds the learning loop. | **KEEP** | — | — |
| 7.3 | **"⌄ Not what I meant" chip under every AI reply** | design-critique #5: repeating a faintly-negative control under every reply trains the eye to read the transcript as a column of complaints. Already softened to thumbs-only, but still omnipresent. | **DEMOTE** | Reveal on hover instead of standing under every turn, so the default reading is calm success. Keep the signal (it feeds learning), lose the standing negativity. | S |

---

## 8. Code-level signals of abandonment (not user-facing, but they prove the direction)

These are dead or orphaned in the code. They confirm which way the product moved and
should be cleaned up so no one wires them back in. Low user impact, but they're the
"back door" the born-clean law warns about.

| # | Item | Evidence | Verdict | Recommendation | Risk |
|---|---|---|---|---|---|
| 8.1 | **`AuditPanel.jsx`** (old audit panel) | Imported NOWHERE. Only survives as a comment reference. Fully replaced by the inline `AuditRunner` + the One Advice Ledger. | **REMOVE** | Delete the file. | S |
| 8.2 | **`regenerateDesign` function** (`Generator.jsx` ~line 4297) | Defined but never called anywhere in the component. An unmounted/dead action. | **REMOVE** | Delete the dead function. | S |
| 8.3 | **~50 `window.__wo*` dev/debug hooks** (`__woBuildLibrary`, `__woRunAiAudit`, `__woInjectAudit`, `__woSetArchetype`, `__woFeedBoard`, `__woCalibrationBoard`, `__woReproStep`, etc.) exposed on `window` in production | Attached unconditionally (guarded only for SSR, not by `NODE_ENV`). Some call real, credit-spending APIs (`__woBuildLibrary` batch-generates brand photos). A few are genuine verification guards named in the specs (`__woArchStress`, `__woLegacyDupGuard`, `__woBornCleanGuard`). | **DEMOTE** | Gate ALL of them behind `process.env.NODE_ENV !== "production"` so nothing (least of all the credit-spending library builder) is reachable from a live user's console. Keep them in dev. | M |
| 8.4 | Old `src/App.jsx` (808 KB) + `src/main.jsx` | Legacy pre-Next single-file app, alongside the live `app/` + `components/`. | **REMOVE** | Confirm nothing imports it, then delete `src/`. (Verify before removing.) | M |

---

## What the product feels like after

Today a nervous student-teacher lands in a studio ringed with nouns: a four-tab nav
that throws her onto three other pages, a top bar with seven competing menus, two
ways to change the layout, two ways to write a caption, three ways to attach a photo,
a "go use Midjourney" detour, a video mode that can't actually save a video, and a
little "not what I meant" complaint stamped under every reply.

After these removals the studio does one thing clearly: **she describes a post, and it
appears, and she touches it to adjust it.** The nav is a quiet header. The top bar is
Posts, Templates, ＋ Add, Undo, and Export — the finish carrying the most weight. The
canvas is the hero, with its every-format strip beneath it. Photos come from one place
and are generated in-app, not fetched from another website. Caption and layout live in
the conversation, where the product already promised they would. Nothing on screen is a
dead end or a dead feature. It feels like one calm tool that trusts her — which is the
whole point of the product.
