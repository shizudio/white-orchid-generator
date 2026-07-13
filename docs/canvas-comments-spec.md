# Canvas comments spec — point + say

**Status: RATIFIED 2026-07-13** ("agree on all, write the specs and start executing"). Owner of: the comment gesture, anchor semantics, and the comment→edit contract. Companion to `docs/element-placement-spec.md` (the solver comments can steer) and the honesty machinery (claims verified against the anchored element).

## The idea (client's words)

> "An 'add comment' feature where the user can add a comment on any part of the preview canvas so the AI immediately captures better where the edit should be."

The advisor speaks to the owner in dots; the owner speaks back in comments. Same canvas, same visual grammar, two directions — the user-authored half of the One Advice Ledger's world.

## Ruling 1 — Instruction now, annotations later

A comment is a **targeted instruction**: pin + type + send = one chat turn carrying spatial context; the AI acts immediately; the pin resolves (fades after the edit lands, stays if the turn failed with the honest retry line). **Persistent review threads (Figma-style unresolved annotations, staff→owner workflows) are explicitly P2** — same anchors, different lifecycle; nothing in P1 may preclude them.

## Ruling 2 — The gesture

- A quiet **💬 Comment** control in the below-canvas strip arms comment mode: the next tap anywhere on the canvas drops a pin and opens a small input bubble at the pin.
- **Long-press** (desktop click-hold and mobile) is the shortcut — drops the pin directly, no mode.
- Escape/tap-away cancels. Sending posts the comment into the chat rail as a normal turn with a **location chip** — *"💬 on the headline: make this warmer"* — so the conversation stays one thread.
- Plain tap keeps its existing meaning (select element). No ambiguity between the two.

## Ruling 3 — Anchors are elements first, regions second

- A pin landing on an element (hit-test order: text roles → logo → shapes → photo) binds to **that element** — the anchor survives reflow, format switches, and layout swaps.
- A pin on empty canvas binds to a **region anchor**: normalized {x,y} + the zone's character (quiet/busy, over-photo/over-field) — never raw pixels.
- **"Add X here" routes into the placement solver** with the region as the preferred candidate anchor (top priority, still subject to every hard restraint — the solver may land nearby if the exact spot violates safe zones/contrast, and says so). The solver is user-steerable by pointing.

## What the AI receives

The comment turn carries, alongside the normal design state:
```
comment: { text, anchor: { kind:'element', role:'support' } | { kind:'region', x:0.24, y:0.71, surface:'photo-busy' },
           elementSnapshot: { the anchored element's current copy/geometry/style } }
```
Server-side, the anchor pre-resolves the intent-belt target (no reference guessing); the reply's claims are verified against **the anchored element's** render truth specifically (the 6406d88 corrector, sharpened). A comment on element X that results in a patch touching only element Y is a contradiction → honest correction.

## Laws integration

- **Honesty**: the location chip claims are render-truth-verified like all claims; a failed comment turn keeps the pin + warm retry (never a dead end).
- **Pins**: a comment is an instruction, not a pin — resulting edits follow normal pin rules (an edit the user then drags becomes pinned as usual).
- **One voice**: comment pins share the dot visual language, user-coloured (distinct from advisor wisteria); never a parallel panel.
- **Born-clean**: untouched by this feature — comments are user-initiated by definition.

## UI details

- Pin: small user-coloured dot + short connector to the input bubble; bubble = single text field + send; matches the studio's calm dialog styling (never alert()).
- While a comment turn is in flight the pin pulses gently; on success it fades over ~2s; on failure it stays with the retry affordance.
- Mobile: long-press ≥350ms; bubble anchors above the thumb; ≥44px targets.
- The chat rail message is the durable record (the pin is ephemeral in P1 — annotations are P2).

## Knobs

| Knob | Default | Effect |
|---|---|---|
| Hit-test order | text → logo → shapes → photo → region | What a tap binds to |
| Long-press threshold | 350ms | Shortcut sensitivity |
| Pin fade | ~2s after verified success | How long the resolved pin lingers |
| Region-anchor priority in solver | candidate #1 | How strongly "here" steers placement |

## Build phases

- **P1a** — gesture + pin + bubble + chat-rail location chip; element/region anchor resolution client-side.
- **P1b** — server plumbing: comment context into the assistant call; belt target pre-resolution; anchored claim verification; "add X here" → placement solver routing.
- **P2 (later)** — persistent annotation threads on the same anchors; staff→owner review flows.
