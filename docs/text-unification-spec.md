# Text Unification — one text system, one home, one hierarchy

**Status: RATIFIED 2026-07-26** (client rulings). Owner of: the convergence of legacy text roles and dynamic text elements into a single system. Supersedes the dual-path reconciliation deliberately left by text-elements slice 2b ("archetype slots remain the painter for migrated roles until a later slice retires the dual path" — this is that slice). Subordinate to the DLC (docs/design-layer-contract.md §10-§12) and builds ON the required-content + editing-grace rules (client ruling 2026-07-26, task #57) — those invariants and their tests must survive every phase.

## The rulings (verbatim intent)

1. "The 'caption' function pill actually conflicts with 'Add text' — they are supposed to be the same system but currently separate... The text elements should always be under the same 'Text' pill, but just in different text fills." Client chose: **one Text pill only** (no per-element rail pills).
2. "When I already have 'caption' even when empty and I try to add text, system tells me there is not enough space... this is confusing because clearly there is space." Empty declared slots must read as OPPORTUNITY, not occupancy. "I should be able to still add as many text as I want, but with the warning if it is too chaotic" — unlimited adds, crowding advisory only (reaffirms text-elements-spec §4).
3. Client chose FULL MERGE: "heading-element-fills-the-title-slot" — adding an element whose class matches an empty slot BECOMES that slot's role. One system in truth, not just in UI.
4. "All text elements should have the same auto change accessibility feature (changing in weight and color depending on placement within the composition)."
5. "When we have multiple text elements on the canvas, you should be assigning different weights to them according to design principles and info hierarchy."

## Phase A — One Text home (UI)

- A single **Text** pill in the element rail. Its panel lists EVERY text on the design as rows — filled legacy roles and added elements alike — each row: class label, text field, and (on selection/expand) the per-element controls (size/pin, style/register, priority, remove where sanctioned). "+ Add text" (5-class picker) sits at the bottom of the same list.
- Canvas selection of any text routes to the Text panel scrolled/focused to that row (the selection-routing contract from 7dc941f extends to all rows).
- The separate Caption pill and per-element pills (Heading etc.) are retired. Pill-delete affordances follow the ratified panel-hierarchy pattern where applicable.
- Mobile half-sheet parity by construction (shared render fns).

## Phase B — One placement brain (full merge)

- **Slot-fill rule:** adding an element whose class maps to an EMPTY declared slot fills that slot: heading→hero; subheading→support; caption→caption/support/attribution family per the archetype's declared roles; cta→pill. The element and the role become ONE identity (the sourceRole convergence completes — no dual painting, no phantom reservation). Editing/removing that text behaves identically whether it was born as a role or an element.
- **Empty slots reserve nothing:** an unfilled declared slot is a prime CANDIDATE for the solver, never an obstacle. "No room in this format" may only be reported after empty slots were considered and the solver genuinely exhausted candidates.
- **Unlimited adds:** never hard-blocked by count; the crowding advisory (§4 of text-elements-spec) is the only voice on "too much," with its three ranked remedies.
- **#57 invariants preserved:** the heading/title (however represented) is REQUIRED — always paints (floor + honest advisory at the terminal rung); editing grace holds (focused text never drops mid-keystroke).
- Migration: existing designs render identically where no new action is taken (fingerprint v2 discipline); the merge activates on user action (an add or edit), not retroactively.

## Phase C — One treatment system

- Added elements join the accessibility director's CONTINUOUS auto-adaptation: ink and weight respond to placement/surface changes exactly as legacy roles do (not only at initial placement). Auto is the default; explicit ink/weight choices are pins with the standard honest-finding flow.
- **Relational hierarchy law (DLC §12 "primary hierarchy remains visually dominant"):** with multiple text elements, the system auto-assigns relative visual weight by class rank (heading > subheading > body/caption/cta chrome) at placement, and a render-truth check verifies the ranking every solve. A user pin that inverts hierarchy is respected (law 5) but raises an advisory naming the inversion with one-tap remedies.

## Verification bar

- Unit: slot-fill mapping per archetype × class; empty-slot candidacy; merge identity round-trip (add→becomes role→persists→reloads as one thing); hierarchy-rank check; #57's tests untouched and green.
- Battery: born-clean 456+/456+, arch-stress, legacy-dup, fingerprint v2 (element-free/no-action designs byte-identical; merge-activated renders documented per §23 if fixtures gain cells).
- Live (the client's exact repro): design with empty caption/title slots → "+ Add text" → Heading → text lands IN the title slot, no false "no room"; unlimited subsequent adds succeed until the crowding advisory (not a block) appears; one Text panel lists all; auto ink/weight adapts when the element is dragged from field to photo; a body pinned larger than the heading raises the inversion advisory.

## Sequencing

Builds strictly AFTER task #57 lands (same code territory: drop logic, deadRoles, ContentFieldsPanel). Phases land in order A→B→C or B→A→C at the implementer's discretion per risk, each phase committed green with the full battery.
