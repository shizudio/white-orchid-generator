# Text Elements — dynamic content roles under brand governance

**Status: RATIFIED 2026-07-21** (client rulings, milestone-audit session). Owner of: user-addable text elements, their classes, placement, budgets and AI remedies. Subordinate to the Design Layer Contract (docs/design-layer-contract.md §10-§12) — this spec is the implementation contract for the DLC's "any secondary content role may exist when the layout solver can place it cleanly."

## The rulings (verbatim intent)

1. "I should be able to add more text elements (heading, subheading, body, caption, CTA button etc) in any format available" — text elements become a dynamic collection, not a fixed archetype slot list.
2. "AI can recommend how to improve — ie simplify / summarize if it's too crowded" — crowding is an ADVISORY with executable remedies, never a hard cap. (Client: "yes advisory".)
3. Element classes are a CLOSED, brand-governed set of five (client: "just five"): `heading | subheading | body | caption | cta`. No freeform font/size picker — unlimited elements, unlimited words, only brand-sanctioned ways for text to look. New classes are added to the brand profile by governed decision, never by a user dropdown.

## 1. Document model

`content.elements[]` on DesignDocumentV1 (additive; schema migration bumps version):

```js
{
  uid: "el_x1",
  class: "heading" | "subheading" | "body" | "caption" | "cta",
  text: "",
  authorship: "owner" | "ai",
  required: false,          // added elements default optional
  priority: n,              // drop order under adaptation; lower drops first
  master: { /* placement */ },
  byDim: { /* per-format overrides */ },
  pins: { /* user-touched placement/treatment pins */ }
}
```

- Legacy fixed roles (headline, subtext, attribution, dateText, microLabel, pillText) MIGRATE into elements (headline→heading, subtext→subheading/body per current register, pillText→cta, etc.) via an idempotent load-time adapter (the established pattern). Old sessions render pixel-identical — enforced by the render-fingerprint baseline (guard battery D).
- New typed commands: `content/add-element`, `content/remove-element`, `content/set-element-text`, `content/set-element-class` (allowed transitions only), `content/set-element-priority`. One user action = one undo transaction.

## 2. Typography binding (the enforcement story)

Each class binds to brand-profile typography tokens (DLC §12): approved font asset/weight, size range, line-height, case, tracking, contrast surfaces. `cta` additionally binds the pill/button chrome (generalized from the existing pillText painter). Users never select fonts or absolute sizes; S/M/L steps within the class's sanctioned range only.

## 3. Placement

Added elements are placed by the element-placement solver (docs/element-placement-spec.md) with per-class priors: `heading/subheading` → hero/support anchoring; `body` → support-block anchoring; `caption` → date/eyebrow-like edge anchoring; `cta` → badge/pill anchoring. All existing hard filters apply (safe zones, obstacles, focal avoidance, contrast ladder, guarded re-measure). Elements join reflow de-collision and z-band 40 (DLC §8). Complete-or-absent: an element the solver cannot place cleanly in a format is not painted there and is named in that format's readiness — never squeezed, never silently dropped from storage.

## 4. Crowding advisory (the "AI recommends" ruling)

Per-layout density/whitespace budgets (existing archetype-drift machinery, extended to count dynamic elements). When over budget, ONE advisory finding (one-voice) with executable remedies, ranked:
1. **Simplify for me** — AI merges/summarizes the lowest-priority adjacent elements to fit (tighten-copy contract generalized; verified against render truth; stored = painted).
2. **Drop lowest-priority element** (named explicitly).
3. **Switch to a roomier layout** (solver-verified candidate only — never offered blind).
Born-clean holds: AI-initiated adds only land when the solver placed them cleanly; a fresh generation never births a crowding dot.

## 5. AI grammar & mirror surfaces (M6)

Patch schema additions: `addTextElement {class, text}` and per-uid element edits. Class enum must land together in: Generator constants, lib/design-patch.js enums + field guide prose, the assistant route's descriptor/belt layer, buildGenes/GENE_KEYS (likes can weight class usage), and mirror-check.sh (now guarding 9 surfaces — this adds the tenth). Chat belts: "add a caption saying X" → solver-placed element via the date-placement fix pattern; honest reply names what was added and where.

## 6. Per-format behavior

Elements inherit master→byDim like all format-aware properties. Capacity differs per format; per-format readiness reports unplaceable elements with remedies (the dead-roles pattern). User placement pins are per-format and survive re-solves (pins law).

## 7. Verification bar

- Unit: element CRUD commands, migration idempotency + round-trip, class/token binding, priority-drop order (suite baseline 125 — grow it).
- Guard battery: `test:contract` green; render fingerprint UNCHANGED for documents without added elements (the migration must be invisible); baseline extended with fixture cells for element-bearing docs once the feature lands.
- Born-clean + arch-stress at baseline; mirror-check green with the new surface.
- Live: add each class on desktop + mobile (half-sheet), drag/pin, format-switch honesty, crowding advisory fires with working remedies, chat-driven add.

## 8. Slices (each committed green; QUEUED behind the parallel session's DLC-2/3 landing — shared files)

1. Document model + commands + migration (pure).
2. Renderer + solver class priors + typography binding (incl. cta chrome generalization).
3. Editor UI: "+ Add text" with class picker in the Caption/Text panel; selection/drag/pins ride existing infra.
4. AI grammar + belts + crowding advisory + mirror/genes surfaces.

## 9. Implementation checkpoints

- **Slices 1–3 — LANDED** (HEAD `6006db8`, plus the parallel-session font-restore
  `9d9982a` that made the Fira Sans binaries real and re-baselined the fingerprint).
  Document model + migration (pure), renderer/solver class priors + typography binding,
  and the "+ Add text" editor UI with per-uid selection/drag/pins.

- **Slice 4 — AI grammar + crowding advisory — LANDED 2026-07-22** (commits `6dbef7f`,
  `9b75d1e`).
  - **AI grammar (`6dbef7f`):** `addTextElement {class,text}` + per-uid `editElements`
    added to `lib/design-patch.js` (closed `elementClass` / `elementSizeStep` enums,
    length-bounded text, field-guide prose, stripped from audit fixes). They compile in
    `lib/design-patch-commands.mjs` into the SAME `content/add-element` /
    `content/set-element-*` commands the UI picker dispatches, so AI and inspector share
    one reducer. The class enum lands in ALL mirror surfaces —
    `lib/text-elements.mjs ELEMENT_CLASSES`, `PATCH_OPTIONS.elementClass`, Generator
    `ELEMENT_CLASS_IDS`, assistant route `ELEMENT_CLASSES` + descriptor + the add-element
    belt — and element-class usage became the `elementClasses` gene (`buildGenes` +
    `GENE_KEYS`). `mirror-check.sh` grew a **tenth surface** (fail-closed; sabotage-proven:
    dropping a class from one surface exits 1, restore is byte-identical).
  - **Crowding advisory + ledger (`9b75d1e`):** the per-layout density budget
    (`dynamicElementBudget(whitespaceTarget)`) and its one-voice crowding advisory (new
    contract rule `layout.whitespace-budget`, severity `advisory`) with the three ranked
    remedies (AI simplify → drop the named lowest-priority element → roomier layout, the
    last offered only when the render verified a candidate). The renderer feeds its
    `contentElements` ledger into the audit signal, so each unplaced element raises one
    `content.complete-or-absent` finding — closing slice 2b's deferred ledger item.
    Born-clean holds: both fire only on genuine over-budget / unplaced states. The pure
    belt detection moved to `lib/assistant-intents.js` (`detectAddElement`) for unit tests.
  - **Gates:** unit **364/364** (+15 in `text-element-ai-grammar.test.mjs` — belt
    detection, patch compile/validation, budget math, remedy ranking, advisory +
    unplaced findings, born-clean), contract **25/25** (ledger invariant checker C green;
    new rule registered), mirror **10/10** (sabotage-proven), build green.

### Outstanding checks (browser / real-key — Slice 4)

These require the isolated test-hooks dist (`WO_DIST_DIR`, `NEXT_PUBLIC_WO_TEST_HOOKS=1`,
keys unset, hosts blocked) with the Playwright-bundled harness (Chromium/149) and
`document.fonts.ready` discipline — not runnable in the pure-node lane:

- **Browser oracles:** born-clean 456/456, arch-stress 114/114, legacy-dup 30/30, and the
  self-baseline render fingerprint on element-free docs (the migration/grammar must stay
  pixel-invisible). Then the **deliberate additive baseline bump** (§23): 2–3 element-
  bearing fixture cells captured on the Chromium/149 harness (existing cells untouched).
- **Live chat belt (interception):** the add-element belt fires with keys unset and no
  model — assert `patch.addTextElement` applied + the honest belt reply. The live-model
  reply phrasing needs a real-key run.
- **Placement-outcome-aware client reply** ("Added your button bottom-right" vs the honest
  can't-place / kept-in-storage note): the deterministic server belt reply is already
  honest and kept-in-storage aware; refining it with the exact placed position requires
  exposing the render ledger on `ArtDirectorChat`'s render-truth path and a browser check.
- **"Simplify for me" live rewrite quality:** the remedy ROUTING + ranking is verified in
  units; the AI merge/summarize rewrite quality is a real-key check.
- **Crowding advisory live fire:** verified on the constructed over-budget signal in units;
  the on-canvas fire with all three remedies actionable needs the browser harness.
