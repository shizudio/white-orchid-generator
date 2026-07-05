# Design Critique — prompt-first UX audit

Reviewer stance: senior product designer (Apple/Figma lineage), evaluating the LIVE
app as a prompt-first product for non-technical users. Date 2026-07-05. Companion to
docs/ux-architecture.md and docs/roadmap.md. This is critique + plan; the source-fix
loop is deferred until the in-flight polish lands and the client green-lights it.

## First impression

Landing: a deep-green poster with a serif question ("What do you want to create
today?"), one input, four suggestion chips, and a "Skip to the studio" escape. It reads
calm, editorial, and on-brand in three seconds. It does NOT look AI-generated: real
typographic system (Romie serif + Syne caps), warm non-purple palette, brand-forward.
That alone puts it ahead of 90% of AI tools.

Editor: three vertical bands (chat rail left, canvas center on a beige field, top bar
above) plus a below-canvas control strip and the all-formats strip. Competent and clean.
The eye does not yet have a single obvious hero, which is the core critique below.

One-word verdict: composed. The bones are good. What is missing is FOCUS and a few
prompt-first instincts that would make it feel inevitable rather than merely nice.

## What is genuinely good (protect these)
- Brand safety is enforced, not hoped for. The single biggest moat.
- The typographic system is real and expressive. No default-font surrender.
- The honesty check (AI never claims a change the render did not make). Rare and precious.
- One patch pipeline: chat, canvas, inspector emit the same edits. Correct architecture.
- Passive vocabulary teaching ("added that as a caption, the small text under your title").

## The critique, highest leverage first

### 1. The canvas is not the hero, and it should be
Three competing bands (chat, top bar, format strip) plus two control clusters give the
eye no anchor. In a design tool the artwork is the point. Right now the canvas floats in
a large empty beige field doing no work, while chrome frames it on all four sides.
FIX: give the canvas dominance. Quiet the top bar (see #3), let the beige field become
an intentional "poster on a wall" stage (subtle, centered, generous but purposeful
margin), and make the format strip feel like a tray beneath the stage, not a fourth
competing band. The squint test should leave the poster as the one bright object.

### 2. "Blank prompt anxiety" is the #1 prompt-first risk
A prompt-first product lives or dies on the first empty state. Four static suggestions is
a start, but users freeze at a blank composer because they do not know the RANGE of what
they can say. FIX: rotate the suggestions, and make them outcome-framed and varied in
KIND so they teach the span of the system (a photo post, a quote, an event with a date, a
hiring post, "change the mood", "make it warmer"). The empty state is the manual. It
should quietly show: you can describe a whole post, OR ask for one small change.

### 3. Top bar has too many nouns competing with the conversation
Posts, Templates, Format, Type, + Add, Undo, Export. For a "just talk to it" product that
is a lot of standing chrome shouting alongside the chat. Everything visible at once means
nothing is primary. FIX: rank them. Export earns weight (it is the finish). Undo is
muscle memory (fine). Posts/Templates/Format/Type/+Add can recede into calmer weight or
group under fewer entry points, so the conversation and the canvas carry the room.

### 4. "Art Director" is designer-speak for a preschool teacher
The chat is labelled ART DIRECTOR in tracked caps. To the target user that can read as
intimidating or corporate, not "your friendly helper". FIX: warm the naming and the
register. It can still have personality, but the label should invite a nervous
non-designer in, not announce a profession they do not have.

### 5. "Not what I meant" on every message adds noise and a negative frame
Good that explicit feedback exists (it feeds the learning loop). But repeating a
faintly-negative control under every AI reply trains the eye to see a row of tiny
complaints. FIX: make it lighter-weight and less omnipresent: reveal on hover, or a
single small thumbs affordance, so the default reading of the transcript is calm success,
not a column of "not what I meant".

### 6. Streaming and optimistic feedback (verify, likely a gap)
Prompt-first products must FEEL fast. If the AI reply appears as a spinner then a finished
block, and the canvas jumps to its new state in one snap, the loop feels slower than it
is. FIX: stream the reply token by token, and where possible show the design updating
optimistically / with a soft transition, so the user sees thinking-then-doing. Perceived
latency is a design surface, not just an engineering one.

### 7. The chat should never look like a dead end
Today after a reply the chips are present (good). Keep enforcing: every AI turn ends with
an obvious next move, and every dead-role / "cannot do that here" ends with a one-tap
alternative (the promotion-to-a-layout-that-fits work already does this). Never leave the
user staring at a full-stop.

### 8. Radius and card discipline (AI-slop watch)
The chrome leans on rounded pills and pastel cards (celadon, wisteria). Lovely in
moderation, but uniform bubbly radius on everything is one of the ten AI-slop tells.
FIX: keep a radius hierarchy (buttons vs cards vs the canvas), and make each pastel card
earn its existence. Cards only where the card IS the interaction.

### 9. Mobile is stacking, verify it is designed not just not-broken
Chat under canvas is correct. But canvas + chat + format strip + controls stacked
vertically gets long. FIX: prioritise ruthlessly on mobile. The poster and the composer
are the two things in a hurry; everything else is a tap away with an obvious path.

## Prompt-first best practices this product should adopt
1. The empty state IS onboarding. Teach capability and range through examples, not docs.
2. Kill blank-prompt anxiety with dynamic, outcome-framed, varied-in-kind suggestions.
3. Stream everything. Show thinking, then doing. Perceived speed is the product.
4. Never a dead end. Every turn offers the next move; every limit offers an alternative.
5. One surface. Chat, canvas, inspector are the same edit under the hood (already true).
6. Make the AI's limits legible and kind (the honesty check; keep extending it).
7. Teach vocabulary passively, never as a prerequisite (already true).
8. Undo is omnipresent and trivial (already true; keep it off the artwork).
9. Progressive disclosure. Simple by default, power on reach (the Pro layer plan).
10. Trust is the feature. The Ready-to-post checklist is the right instinct; make its
    calm, plain-language verdict the emotional payoff before publishing.

## Implementation plan (prioritised, phased)

### Phase D1 — focus + first-run (highest leverage, low risk)
- Canvas becomes the hero: quiet the beige field into an intentional stage, reduce
  chrome weight around it (#1).
- Rotating, outcome-framed, kind-varied empty-state suggestions (#2).
- Re-rank the top bar so Export/Undo lead and the rest recede (#3).
- Re-tone "Not what I meant" to hover / lighter weight (#5).
- Warm the assistant naming + register (#4).

### Phase D2 — perceived speed + never-a-dead-end
- Stream AI replies; soft-transition the canvas to its new state; optimistic where safe (#6).
- Audit every turn and every limit for a next-move / alternative (#7).

### Phase D3 — polish + platform
- Radius + card discipline pass (#8).
- Mobile prioritisation pass, designed not just stacked (#9).
- Ready-to-post verdict as a calm, plain-language moment before export (#10).

### Notes on overlap with existing roadmap
- The readiness-indicator softening already in flight covers part of #10 and the calm-tone
  instinct. D1 builds on it.
- The every-format work (WP-Y2) is the substrate for the format-strip-as-tray idea in #1.
- None of this touches the archetype/taste engine. It is UX framing, first-run, perceived
  speed, and tone. Lower risk than the render work already shipped.

## Scores (designer's read, not a measured audit)
- Design: B+. Real system, on-brand, clean. Held back from A by focus (#1) and top-bar
  competition (#3).
- AI-slop resistance: A-. Genuinely not sloppy; only the radius/card uniformity is a watch.
- Prompt-first maturity: B. Strong architecture and honesty; needs first-run teaching (#2),
  streaming (#6), and tone warmth (#4) to feel inevitable.
