# D1 — Focus, first-run, and one calm surface

Contract for the D1 build. Consolidates docs/design-critique.md §Phase D1 with the
staging interaction-audit findings (docs/interaction-audit.md H1, H3, M4, M6, M7).
Theme: make the editor feel like ONE calm surface with the poster at its center, and
teach first-time users what to say. Lowest-risk, highest-leverage UX. Primary user =
non-technical preschool staff. Does NOT touch the taste/render engine.

## Scope (all items)

### 1. Panel discipline (audit H1 — biggest confusion source)
Today the contextual inspector floats OVER the canvas, + Add covers the chat rail,
and the Guide can stack under the inspector — up to three overlays at once, and
Escape closes none of them.
- ONE overlay open at a time: opening any panel (inspector, + Add, Posts/Templates/
  Format/Type/Export popovers, Guide) closes the others.
- Escape closes the active overlay/inspector; clicking the canvas empty area or
  another element also dismisses/replaces cleanly.
- The contextual INSPECTOR must sit BESIDE the canvas (a column the canvas makes room
  for), never a sheet floating over the artwork. When the inspector is open the canvas
  shrinks/recenters so nothing it edits is occluded. At rest (no selection) the canvas
  is unobstructed (already true) and gets the freed width.
- Verify at desktop + mobile: no overlay ever covers the artwork you're editing.

### 2. Canvas is the hero
- Quiet the chrome so the poster is the one bright object (squint test: the design
  dominates). Reduce competing visual weight of the beige field / surrounding bands;
  make the stage feel intentional (centered, purposeful margin), not empty leftover.
- Keep it on-brand per feed-grammar §7 (airy, thin, restrained). No new decoration.

### 3. Re-rank the top bar (critique D1)
Export and Undo lead (Export is the finish, Undo is muscle memory). Posts / Templates /
Format / Type / + Add recede to calmer weight (they stay reachable, just not competing
at equal loudness with the conversation + canvas).

### 4. Remove the floating Guide duplicate (audit H3)
The dark circular button on the right edge duplicates the header "? Guide", is UNNAMED
(a11y: announced only as "button"), has an unclear icon, and sits on the canvas. REMOVE
it; keep the single header Guide entry. (If product wants a second entry, it must have
an accessible name + clear help icon + live off the artwork — but default is remove.)

### 5. Single-click panel switching (audit M4)
With one panel open, clicking a different top-bar menu currently wastes the first click
closing the open one. A single click should switch directly to the target panel.
(Falls out of the panel-discipline model in item 1 if built as "open X ⇒ close others".)

### 6. Name the inspector by what was selected (audit M6)
The inspector header says "CAPTION" even when the headline/title was clicked. Title it
by the selected element ("Title", "Text", "Date", "Logo", "Photo", "Background",
"Shape"), matching what the user tapped. Keep the plain-language, no-jargon register.

### 7. First-run: rotating, outcome-framed suggestions (critique D1)
The landing's four static chips are a start but do not teach the RANGE of what you can
say. Make them rotate and vary in KIND so the empty state teaches the span: a whole
post (open house, quote, hiring, welcome-back) AND a small change ("make it warmer",
"change the photo"). Keep the tappable empty-state chips in the chat rail consistent
with this. Goal: no blank-prompt freeze.

### 8. Lighter feedback control (critique D1)
"Not what I meant" appears under every AI reply, training the eye to see a column of
tiny complaints. Make it lighter-weight / less omnipresent (reveal on hover, or a
single small affordance) WITHOUT removing the signal (it still feeds the learning
loop). Default reading of the transcript should be calm success.

### 9. Warm the assistant naming (critique D1)
"ART DIRECTOR" in tracked caps reads as intimidating/corporate for a preschool teacher.
Warm the label + register so a nervous non-designer feels invited (e.g. a friendlier
name for the assistant). Keep personality; lose the intimidation. Small copy change,
apply everywhere the label shows (rail header, guide, any references).

### 10. Low-contrast + Add labels (audit M7)
The Shape tiles and some labels ("Shape 1/2/3") are faint grey on light. Raise to
WCAG AA. Quick contrast pass over the + Add gallery labels.

### 11. Verify (audit L8) — Send button icon contrast
Check the ↑ arrow contrast on the tangerine Send button (landing + editor); if under
3:1, darken the arrow or the fill. Fix only if it fails.

## Out of scope (do NOT do here)
- H2 canvas accessibility (screen-reader/keyboard perceivability) — separate WP.
- D2 (streaming/perceived speed), D3 (radius discipline, mobile pass), campaigns.
- Any render/taste-engine change.

## Guards
- One-patch-pipeline parity, contextual inspector behavior, WP-Y5 readiness, chat,
  sessions all keep working.
- `__woArchStress` 0, `__woLegacyDupGuard` 0, `next build` green, console clean.
- Real-browser verify at desktop + mobile (390px) with before/after screenshots.
