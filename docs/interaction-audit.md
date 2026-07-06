# Interaction & Accessibility Audit — staging walkthrough

Method: end-to-end click-through of the standard flow on the live staging build
(current, post-softening + flash-fix), driven through the user's authenticated
browser. Landing → generate → editor → click-to-edit → inspector → + Add → export.
Date 2026-07-05. Feeds D1/D2 in docs/design-critique.md. Voice: reduce confusion
and drop-off for non-technical users; meet basic a11y.

## What is already good (high readiness)
- Generate flow works end to end on staging: on-brand result, chat seeded with the
  user's prompt + the AI reply. Strong.
- Accessible names are almost everywhere. The Undo button even announces its
  shortcut ("Undo the last change (⌘Z · redo ⇧⌘Z)"). Exemplary.
- Click-to-edit works: clicking the headline selects it (dashed box + a "TEXT" tag)
  and opens a rich contextual inspector (text fields + typography).
- The + Add gallery is the star: visual thumbnail tiles with plain-language labels
  ("Small text under the title", "Date", "Little label up top", "Button", "Photo"),
  a Shapes section with the petal marks, and "no design words needed". Exactly right
  for the audience.
- A loading state exists ("Composing your design…").
- html lang=en; a prefers-reduced-motion query is present.
- Readiness indicators are now calm (soft wisteria dot, "N to review"), not alarms.

## Findings, prioritised

### HIGH — confusion, drop-off, or a11y blockers

**H1. Panels overlay the canvas and each other; no mutual exclusion; Escape does not
close them.** Observed: the contextual inspector floats OVER the canvas (covers the
photo side of the design you are editing). Opening + Add put a THIRD surface on
screen — + Add covers the entire chat rail on the left while the inspector still
covers the canvas on the right. The Guide panel stacked UNDER the inspector. Escape
did not dismiss the inspector; it stayed open through opening + Add and through
clicking Export. This is the single biggest confusion source and directly
contradicts the "clean preview / one surface" principle.
FIX: (a) one overlay at a time — opening any panel closes the others; (b) Escape
closes the active overlay; (c) the inspector should be a COLUMN the canvas makes
room for (or a compact popover anchored to the selected element), never a sheet
floating over the artwork. This is the core of D1's "canvas is the hero".

**H2. The canvas is a black box to assistive tech.** It is role="application" with an
aria-label but no exposed text content, and click-to-edit is mouse-only. Screen
reader and keyboard-only users cannot perceive the design or reach its elements.
FIX: expose the design's text as a readable alternative and make the inspector a
fully keyboard-reachable, announced path to every element — the inspector IS the
accessible way to edit; ensure you can Tab to it and operate the whole design there
without the canvas.

**H3. Two Guide entry points; one is unnamed and floats over the canvas.** A dark
circular button on the right edge duplicates the header "? Guide", has NO accessible
name (announced only as "button"), an unclear panel/list icon, and sits on top of
the artwork.
FIX: remove the floating duplicate (keep the header Guide). If kept, give it an
accessible name + a clear help icon, and move it off the canvas.

**H1b. Canvas glitches to a wrong (too-tall) format ~2s AFTER a correct render.**
Distinct from the format-switch flash (fixed): the design renders correctly, then
about two seconds later the canvas grows taller than its artwork, leaving a block of
ivory dead space below (seen on IG Portrait). The delay points to a debounced
BACKGROUND SWEEP (the readiness check / format-thumbnail generation, which renders
every format) corrupting the LIVE canvas instead of using a clean offscreen buffer,
and not restoring the live canvas size/draw afterward.
FIX: the all-format sweep must render to a SEPARATE offscreen canvas (never
canvasRef.current), or fully restore the live canvas (dimensions + redraw) when it
finishes. High priority — it makes finished designs look broken.

### MEDIUM — friction / polish

**M4. Switching panels costs a wasted click.** With one panel open, clicking a
different top-bar menu first closes the open one; you must click again to open the
target (observed clicking Export while + Add was open — it only closed + Add).
FIX: a single click should switch panels.

**M5. Generation loading is a single static line.** "Composing your design…" with no
time expectation or staged progress; for a 10-30s generation (the photo step) this
risks abandonment.
FIX: staged steps ("writing the copy… finding a photo… composing…") or a time hint.
Keep the user oriented. (D2 perceived-speed.)

**M6. Inspector titled "CAPTION" when editing the headline.** The section header does
not match what was clicked (a big title, not a caption).
FIX: title the inspector by the selected element ("Title", "Text", the specific
role), not a generic "Caption".

**M7. Low-contrast labels in + Add.** The Shape tiles and some labels ("Shape 1/2/3")
are faint grey on light.
FIX: raise label contrast to WCAG AA.

### LOW — verify

**L8. Send button icon contrast.** The ↑ arrow reads white/pale on light tangerine
(landing + editor). Verify the icon meets 3:1; if not, darken the arrow or the fill.

**L9. "Skip to the studio" escape hatch** on the landing slightly undercuts the
prompt-first promise (a bypass around the one screen that teaches the product).
Consider softening its prominence. Debatable.

## Mapping to the roadmap
- H1 + H3 belong in **D1** (canvas-as-hero + clean preview): add panel discipline —
  one overlay at a time, Escape-to-close, inspector-as-column-not-overlay, and
  remove the floating Guide duplicate.
- H2 is an **accessibility work item** (new): expose canvas text + keyboard path.
  Higher effort; schedule explicitly.
- M4, M6, M7, L8 are **D1 polish**.
- M5 is **D2** (perceived speed / staged loading).
- L9 is a taste call for D1.
