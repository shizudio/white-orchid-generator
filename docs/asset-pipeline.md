# The asset pipeline — how a ready-to-post design is decided and built, end to end

**This doc owns the generation pipeline, end to end** — the horizontal flow (what happens in what time order, from a prompt to a finished asset) and the vertical build (how the elements stack in space to become pixels). It is the map of the whole flow so you can see where a decision is made and change the logic there.

**How to read this (5 lines).** Part I follows one asset through time — the twelve decisions, in firing order, from the moment you type. Part II follows the same asset through space — the vocabulary of elements, the twelve-layer stack they paint into, and the rules that keep them from colliding. Part III is the three feedback loops (taste, chat edits, moodboard). Part IV is the **knobs board** — every tweakable value in one table. **The tweak workflow:** every adjustable rule in here has a plain-English name in **bold**; quote that name to any agent ("raise the *documentary cap*", "widen the *decor intent vocabulary*") and it knows exactly which constant to change and where. Part V is the honest list of what is stale, shared, or half-wired. The owner reads top-to-bottom; engineers and agents jump to the appendix and Part IV.

**Two things to know before you trust a line number.** (1) Anchors in this doc are **function and constant names**, not line numbers, because `components/Generator.jsx` is ~10k lines and its line numbers drift with every edit — search the name, not the number. (2) The **decor / overlay-shape subsystem is under active rebuild TODAY** (the shape system is being rewritten in parallel). Every threshold in the decor/overlay path — compose-vs-avoid, the early-vs-late draw split, contrast gates on shapes — is marked *under active change* below and must be re-verified against code before you rely on it.

For facts this doc deliberately does **not** own: the numeric geometry of each archetype (box fractions, scale ratios) lives in `docs/visual-language-spec.md`; the per-format layout and font-scale tables live in `docs/format-design-spec.md`. This doc points at them; it never restates them.

---

# Part I — The horizontal flow (what happens, in firing order)

An asset is decided in one pass through the server. Below is that pass as the owner experiences it: a prompt goes in, a proposal comes back, and a stack of deterministic rules quietly correct the proposal before it ever becomes a design. The spine is **the twelve decisions, in the order they fire.** For each: what decides it, and what you would change if you disagreed.

## Entry — which door the request came through
Four doors lead in, and **only two of them ever touch the AI.**
- **Landing prompt** — the box on the front page. The only path that calls the assistant with `context:'landing'`. It gets back a design plan, and if that plan named a photo scene, the *page itself* drives the photo pipeline (submit a job, poll it, quality-check it, re-roll up to **two** attempts) before handing the finished `{patch, imageUrl}` to the editor.
- **In-studio chat** — the Art Director chat inside the editor. Calls the assistant with `context:'editor'`, streaming, carrying the last ten messages plus the live design state. A running conversation; the landing exchange is appended to it, never replaced.
- **Templates** — a saved snapshot re-applied directly to the canvas. No AI, no belts, no archetype logic — a pure state restore.
- **Skip to the studio** — a bare link to a blank editor. Zero AI.

*What decides this:* which UI control the user touched. *What you'd change:* nothing here is a knob — it's the shape of the product. But note the legacy **creative-plan route** is wired to nothing (Part V).

## Decision 1 — Entry path
The path above is itself the first decision: it fixes whether any AI call happens at all, and with which `context`. An unknown context value silently becomes an editor turn; a caption request (`context:'caption'`) peels off into its own writer and returns before any archetype logic runs.

## Decision 2 — Is the AI even set up?
A rate-limit and API-key gate. If keys are missing the whole thing **degrades gracefully** — "AI isn't set up yet" — and the studio still works by hand. Nothing throws. This is the graceful-degradation law in action.

## Decision 3 — Load the taste memory
Before composing the prompt, the server loads the brand's **preference aggregate** (cached up to an hour): a short list of house-style exemplars and a set of tie-breaker counts distilled from every ♥ the brand has given (Part III). This is what lets the system lean toward what you've liked without being told.

## Decision 4 — The intent belts read the words (pre-AI)
Cheap, deterministic keyword checks run *before* the AI, on the raw prompt:
- **wants-text-only** — a quote/manifesto/"no photo" request; gates off the photo-first behaviour.
- **guess-intent** — sorts the ask into quote | text-post | event | photo-logo.
- **landing archetype hint** — a soft, preference-weighted suggestion dropped into the AI's prompt (a nudge, never a command).

*What decides this:* vocabulary lists (the **text-only intent vocabulary**, etc.). *What you'd change:* add or remove trigger words in those lists to change what the system recognises.

## Decision 5 — Assemble the system prompt
The prompt handed to the AI is built from: brand voice + the default voice rules, house-style exemplars (from Decision 3), a field guide and the allowed-options enums, and a context-specific block — for landing, the archetype catalog + a photo-first template + copy rules; for editor, few-shot examples that *mirror the belts below* so the AI proposes what the belts would have forced anyway.

## Decision 6 — The AI proposes (one call)
A single strict-schema call returns exactly `{reply, patch}` — a chat sentence and a design patch whose every field may be null. **This is a proposal, not a verdict.** The model is `gpt-4o-mini` by default (**art-director model**, overridable by env var). Everything after this decision is the system checking the model's homework.

## Decision 7 — Tone scrub
Exclamation marks are stripped, deterministically, from the reply and from headline / subtext / attribution / dateText. The brand rule ("NEVER use an exclamation mark. Not one.") is enforced twice — once by asking, once by force. *What you'd change:* the **tone-scrub field list** (today it does not touch micro-labels or pill text).

## Decision 8 — Overlay gate
Any decorative overlay the AI added is **deleted unless the user's own words named a decoration** (frame, petal, orchid, shape…). This stops the AI from sprinkling flourishes nobody asked for. *What you'd change:* the **decor intent vocabulary** — the list of words that count as "yes, I want decoration." *(Under active change — the shape subsystem rebuild touches this path.)*

## Decision 9 — Archetype resolution (the model rarely gets the last word)
On **landing**, the AI's chosen archetype is treated as a suggestion and re-decided by rhythm and rules:
1. Take the model's pick if it's valid, else nothing.
2. If it's missing or **over its cap** (each archetype has a max share of the recent window), filter the catalog to cap-clear, same-intent options and sort by **rhythm** — alternating photo-led against solid-colour layouts off the last pick — with liked archetypes breaking ties.
3. **Photo-first override:** unless the ask was text-only, if the resolved pick isn't a photo-led layout, swap to one.
4. **Anti-repeat:** if it matches the immediately previous pick, advance to the next alternative.
5. Record the pick into a rolling memory of the last twelve — now **durable per brand** (hydrated from and persisted to Supabase `brand_rotation`, so it survives deploys and is shared across instances; see Part V "rotation memory").
6. Choose a **variant** (a sanctioned colourway) of the final archetype.

On **editor**, a lighter gate: if the user didn't ask for a layout change, an unsolicited archetype swap from the AI is stripped.

*What decides this:* the per-archetype **caps**, the **dark-class ceilings**, the never-three-dark-in-a-row rule, and the **recent-window length**. *What you'd change:* raise a cap to see an archetype more often; lower the dark ceiling to reduce dark designs. The numeric geometry of each archetype is **not** here — see `docs/visual-language-spec.md`.

## Decision 10 — The editor simple-request belts
For in-studio edits, a chain of deterministic belts runs, **first match wins**, and each may rewrite *both* the patch and the chat reply: text substitution → contact-add → photo-change → colour-token → mood recipe → font-resize, then echo-strippers (undo unsolicited logo/photo tweaks), a shape-cycle ring, a full-image override, and a layout-variety ring. Text substitution deliberately beats colour and mood on a mixed sentence. *What you'd change:* the **mood recipes** (eight moods, each a bundle of background + treatment), the **colour word→token map**, the **full-image trigger set**.

## Decision 11 — Copy fitting
Landing copy is trimmed to fit hard budgets (**landing copy caps**: headline 48, subtext 120, attribution 64, dateText 48 chars) — cut on a sentence boundary if one sits past halfway, else on a whole word, never an ellipsis. A set of headline-led archetypes force the subtext to empty on landing regardless of length (a render-geometry workaround). Editor copy is never trimmed. *What you'd change:* the **landing copy caps**.

## Decision 12 — Photo sourcing
The last decision before the design becomes pixels. A scene prompt (landing) or an image prompt (editor) is kept only if the resolved archetype is photo-led, then sanitised (banned words stripped, truncated to 600 chars). The provider chain is: **Higgsfield Soul** (primary, real credits) → **gpt-image-1** (fallback) → a **library photo** from the brand's Supabase images → **text-only** if all else fails. Each archetype carries a one-line **negative-space directive** telling the photographer which region to keep calm so text has somewhere to live. Freshly generated photos (never library ones) get a vision **quality check** and up to two re-rolls. *What you'd change:* the **Soul quality/size**, the **QC attempt count**, the **poll timeouts**, the **scene-banned words**, the **negative-space directives**. Editor photo failures return HTTP 200 with `imageRefused:true` — never a crash.

---

# Part II — The vertical build (how the elements stack into pixels)

Part I ended with a finished design plan and maybe a photo. Part II is what the render loop does with them: it turns fractional boxes into pixels, paints twelve layers bottom-to-top, and runs a reflow engine that moves things apart when they collide. Everything here happens on the client, in one big render function.

## The element vocabulary — what a design is made of
Every archetype declares its parts as **canvas-fraction boxes** (`{x, y, w, h}` in 0–1 space, so they scale to any format): a **hero** (the headline), **support** (the caption/body), a **micro-label** (the eyebrow), a **logo** (position + size), and optionally a **photo**, a **card** or **mask** (clip containers). There are **exactly three text roles** — hero, support, micro-label. The "pill" is not a fourth role; it's a *rendering treatment* (hero+support drawn inside a rounded card).

**Furniture** — the small graphic marks — is a **closed vocabulary of five**: rule, underline, index, counterweight, badge. One painter draws all of them; adding a sixth kind means a new branch in that painter. A URL is not its own element — it lives inside support or the counterweight.

Non-text parts: the photo, the mask/card containers, a scatter-decor **motif**, the **overlay/decor shapes** (a separate system from archetype-authored parts — *under active change*), the **backdrop** (a scrim/band resolved at render time, not stored on the archetype), and the **palette** (background, ink, accent, plus a list of sanctioned variants).

There are **19 archetypes** (a stale code comment still says "12" — trust the array, see Part V). Their exact box numbers and scale ratios are owned by `docs/visual-language-spec.md`, not here.

## The frames and the materializer — fractions become pixels
The **materializer** turns an archetype's fractional boxes into pixel boxes for a specific format. It deep-merges any per-format overrides over the square-authored defaults (twitter and facebook share one "wide" bucket), and derives the photo-frame type (card | petal-mask | shape-mask | none) from the archetype's flags.

The **master format is `ig_square`.** The layout cascade — which geometry wins for a given format — resolves in this priority: a per-format user override wins verbatim → a raw edit made on the master format wins on the master → the materialized per-format archetype geometry → a legacy fallback layout for unknown pairs. So a tweak the owner makes on the square canvas propagates its *relative* scale to the other formats, while absolute positions stay per-format.

## The Z-STACK — the twelve layers, bottom to top (verbatim)
Everything paints in this exact order, lowest first:

1. **Base field fill** — or a full-bleed photo painted straight to canvas.
2. **Photo-treatment filter** — composited onto the photo's pixels.
3. **Frame-masked photo** for frame types — a true silhouette clip (source-in / destination-in) for petal and shape masks.
4. **Solid decor shapes**, overlay mode, drawn **early, under the text**, so composed text reads as glyph-on-top. *(Under active change.)*
5. **Text backdrop / scrim** — the legibility band, clipped to the text zone (plus the message-pill gradient scrim).
6. **Eyebrow** (micro-label).
7. **Hero** + any prominent date line.
8. **Support / caption lines.**
9. **Furniture** — rule / underline / index / counterweight / badge.
10. **Logo** — no fabricated backing, by design (see law "only real assets").
11. **Outline / line-art decor** — the deferred decor pass, always last on the canvas. *(Under active change.)*
12. **(React, not canvas) Advisor-dot markers** — drawn from live-render refs, floating above everything.

The one trap: the early decor (layer 4) paints *before* the reflow engine has decided whether that shape is an obstacle or a partner, so avoidance rides on box math, not draw order.

## The constraint ladder — who wins when things collide (verbatim)
When two elements want the same space, they are resolved in this fixed priority:

1. **Explicit user pins** — a touched logo, a pinned role, a pinned colour/backdrop — short-circuit *everything* and are honoured verbatim.
2. **Platform safe-zone margins** — the legal rectangle is expanded before any box math.
3. **Hero** — seam-safe photo avoidance → decor compose-or-avoid → reserve room for support → shrink-to-fit (seeded by the headline-width floor) → orphan re-wrap → hard legibility floor.
4. **Label / eyebrow** — avoid the photo → avoid decor → if it overlaps the hero, move above or **drop** (it's the lowest-priority role).
5. **Support** — snap to a rhythm gap → push below the hero → clamp to the bottom → avoid photo and decor → re-clamp.
6. **Logo** (resolved outside reflow) — explicit pin verbatim → focal + text-envelope + frame-boundary exclusions + born-clean relocation → contrast ink-variant swap → render-and-flag (never fabricate a backing).
7. **Advisor findings** — raised only *after* 1–6 settle; they never feed back into the same pass.
8. **Silent harmonizer** (≤2 rounds) — re-solves failures across formats but re-applies the pin logic every round, so it can never override step 1.

## Conditions and guards — the safety checks at layout time
- **Born-clean** — the law that a freshly generated design carries **zero** advisor dots. Every rule above is a *layout-time* rule, not a post-hoc flag: a logo on a busy region is relocated proactively, story-format logos are legal by construction.
- **Contrast** — the system picks the higher-contrast ink pole against each zone's luminance, and lays a scrim band only where needed. The sole scrim family is a solid brand band (the gradient scrim was removed). Contrast audits are advisory below the layout guards.
- **Pins** — a user's explicit choice (`.free` role, touched logo, per-dim photo transform, pinned colour) sets `explicit:true` and short-circuits the entire auto-guard ("never relocate or shrink"). A pinned-but-illegible logo renders as-is with only an advisor dot — by design.
- **Focal** — a face/subject saliency estimate keeps the logo and the message-pill off the subject.

## The 6-format cascade — one design, six shapes
The six formats: **ig_portrait 4:5** (leads presentationally), **ig_square 1:1** (the master), **story 9:16**, **twitter 16:9**, **facebook 1.91:1**, **banner 3:1**. Exact per-format font-scale and layout rules are owned by `docs/format-design-spec.md`.

**Shared across all six:** copy, palette, photo source, logo variant. **Re-flowed per format:** role geometry, photo crop (re-zoomed so the focal point lands on that format's thirds), and logo placement. Story has extra platform-safe bands baked in. A dev-only **format-fit self-heal** catches a mis-sized canvas and schedules one corrective redraw — but it's dev-only, so a production CSS-aspect mismatch goes undetected (Part V).

## Post-render — from finished canvas to a file on disk
- **Honesty snapshot** (`renderTruth`) — after each render, a small truth record (archetype, logo box, role bounds, dead roles, canvas size) is read from live refs so the AI chat can only claim what actually rendered.
- **The advisor / local audit** — one audit object per render feeds a local checker covering contrast, type-size, degradation, overlap, safe-zone, composition, copy-limit, logo, and an archetype-drift family. All findings flow into **one ledger** (the "one voice" law), deduped within a run and across sources, acknowledgements surviving small content edits.
- **The Ready gate** — only a short **blocker set** (contrast-fail, logo-over-text, logo-in-focal-band, safe-zone-violation, archetype-margin-crop, archetype-box-overlap) blocks "Ready"; everything else is advisory. Ready rolls up all six formats and can suggest "switch to a roomier format" when copy won't fit.
- **Export** — a final draw, then PNG or JPEG (JPEG flattened onto white, quality 0.92). "Download all" loops the six formats offscreen and staggers the saves; export is **advisory-gated, never blocked** — the button always works even with open findings.

---

# Part III — The feedback loops

Three loops let the system learn and be corrected. Two are live and shaping output today; one is captured but not yet read.

## The taste loop — what a ♥ teaches the system
When you heart a design, the system extracts its **genes** — exactly: archetype, variant, background colour, photo treatment, hero register, post type, dimension, and a scene category (people | still-life | scene, classified only while a live photo brief exists). That gene set, plus a tiny thumbnail, is logged as a like/unlike event.

**The weighting math:** the aggregator reads the newest ~1000 events for the brand, keeps the latest like/unlike per session (an unlike cancels the like — net zero), and counts each gene value. Those counts influence output at three points:
1. **Exemplars** — up to five phrases (top-2 archetypes, top bg/treatment/scene) injected as a HOUSE STYLE block in the prompt. An explicit ask always wins over this.
2. **Tie-breakers** — liked values break ties in variant and archetype selection, **but only after** rhythm and caps have filtered the pool. This is the **rhythm-before-preference** rule: the system will not show you three of your favourite archetype in a row just because you like it. Rhythm and variety are enforced *first*; preference only decides between options that already passed.
3. **Soft nudge** — a preference-weighted draw feeds the landing archetype hint (a suggestion in the prompt, not a constraint).

"More like this" is a separate move: it re-applies *this session's own* genes to a fresh post, not the brand aggregate.

## The chat editing loop — one patch, one undo
Every edit — AI or manual — flows through **one patch applier**. It snapshots state for undo (unless it's amending an existing entry), validates the patch against the live option lists (unknown values are silently ignored — the mirror trap), applies only genuinely-different fields, and re-seeds palette/treatment atomically on an archetype change. Manual edits are **burst-aware**: a drag or a typing run folds into a *single* undo entry.

After an AI change, an optional **harmonizer** sweeps all six formats plus the live canvas (≤2 rounds), collects real failures that have a concrete fix and aren't pinned, and merges them into one repair patch applied as an *amend* — so **one Undo reverts the AI change and its auto-repair together**. Crucially, the harmonizer re-applies the pin logic every round and will **drop** a fix entirely rather than override a user's pin or fight itself across formats (one format may keep a contrast fail to protect another). The AI can never emit certain low-level fields (raw colours, transforms, overlay edits) — those are client-only.

## The moodboard — captured, but not yet read (open opportunity)
The moodboard records what the user pins there, tagged as its own event kind — **but it contributes nothing to the taste aggregate today.** Those rows carry no genes, and the aggregator reads only like-events. The data is tagged and waiting for a future learning pass. **This is the clearest open opportunity in the system:** a signal the user is actively giving that the generator does not yet hear. Flag it whenever the topic is "how do we learn faster."

---

# Part IV — The knobs board

Every tweakable value from the pipeline, grouped by stage. This is the tweak surface: name the knob to an agent and it changes the constant. Anchors are function/constant names (line numbers drift). Values are the current defaults.

### Intent recognition (Decisions 4, 8, 10) — `app/api/assistant/route.js`
| Knob | Current value | Where (anchor) | What changing it does |
|---|---|---|---|
| **Decor intent vocabulary** | ~150 words (`frame\|petal\|orchid\|shape\|decorat\|ornament\|flourish\|cut-?out\|silhouette\|overlay`) | `DECOR_INTENT` | Which words let the AI keep an overlay. Widen = more decoration honoured; already narrowed once (invite/party false-triggered). *Under active change.* |
| **Text-only intent vocabulary** | ~176 words (`quote\|manifesto\|mission\|…\|text-?only\|no photo`) | `TEXT_ONLY_INTENT` | Which asks turn off photo-first (become quote/text designs). |
| **Layout-change vocabulary** | regex | `LAYOUT_INTENT` | Whether an editor turn is allowed to swap archetype. |
| **Full-image trigger set** | 7 branches incl. "green (solid\|panel\|block\|band\|column\|slab)" | `FULL_IMAGE_INTENT` | Forces documentary / full-bleed-duotone. Built from two failing client transcripts. |
| **Layout-variety triggers** | regex | `LAYOUT_VARIETY_INTENT` | Advances the photo/text layout ring. |
| **Shape-swap triggers** | regex | `SHAPE_SWAP_INTENT` | Cycles the shape ring. *Under active change.* |
| **Mood recipes** | 8 moods (warmer, softer, cuter, fun, pop, bolder, cooler, calmer), each `{bgColor, bgAlt, photoTreatment, narrate}` | `MOOD_RECIPES` | The whole palette+treatment bundle a mood word applies. |
| **Colour word→token map** | 10 regex→token pairs, order-sensitive | `COLOUR_WORD_TO_TOKEN` | Which colour words map to which brand tokens. |

### The AI proposal (Decisions 5–7) — `app/api/assistant/route.js`, `lib/design-patch.js`
| Knob | Current value | Where (anchor) | What changing it does |
|---|---|---|---|
| **Art-director model** | `gpt-4o-mini` (env override; reasoning models get `effort:'low'`) | `OPENAI_ART_DIRECTOR_MODEL` | Which model proposes the design. |
| **Tone-scrub field list** | reply + `['headline','subtext','attribution','dateText']` | `toneScrub` / `TONE_FIELDS` | Which fields get exclamation marks stripped. (Micro-label / pill text not scrubbed today.) |
| **Patch schema / allowed options** | strict, all-nullable | `PATCH_JSON_SCHEMA`, `PATCH_OPTIONS` | The shape and legal values of an AI patch. Hand-mirrored with Generator constants (mirror trap — Part V). |
| **AI-forbidden fields** | bgAlpha, fieldColor, textLayout, photoTransform, overlayUpdate, removeOverlay, imageSrc, removeImage, archVariant, furnitureUpdate, roleOffset, logoFree, hideLogo | `CLIENT_PATCH_KEYS` | Which low-level fields the AI can never touch. |

### Archetype & variant selection (Decision 9) — `app/api/assistant/route.js`, `lib/preferences.js`
| Knob | Current value | Where (anchor) | What changing it does |
|---|---|---|---|
| **Per-archetype cap** | e.g. petal_window 0.12, documentary 0.10, floated_card 0.20, schedule_tile 0.06 | `LANDING_ARCHETYPES` | Max share of the recent window an archetype may hold. Raise = seen more often. |
| **Dark-class ceiling (selection)** | 0.32 dark-share; never 2 dark in a row | `exceedsCap` | How often dark layouts may appear at the archetype stage. |
| **Dark-class ceiling (variant)** | 0.27 dark-share | `pickVariant` (wantDark) | A *second, different* dark threshold at the variant stage — keep the two in mind together. |
| **Pastel share ceiling** | pastelShareOfLight < 0.34 | `pickVariant` | How often pastel variants appear among light designs. |
| **Non-fallback set** | petal_window, brand_card, closing_card | `NON_FALLBACK` | Archetypes excluded from the cap-clear fallback pool. |
| **Recent-window length** | 12 | `RECENT_MAX` | How far back rhythm/anti-repeat looks. Now backed by a durable per-brand row (`brand_rotation`); the ring is the cache + fallback. |
| **Rotation load budget** | 150ms | `LOAD_TIMEOUT_MS` (`lib/rotation-state.js`) | Hard cap on the cloud hydration read; on timeout the landing turn falls back to the in-memory ring (no latency cliff). |
| **Preference draw ceiling** | maxShare 0.4 | `weightedPick` (`lib/preferences.js`) | Caps how much a liked value can dominate the soft hint draw. |

### Copy (Decision 11) & captions — `app/api/assistant/route.js`
| Knob | Current value | Where (anchor) | What changing it does |
|---|---|---|---|
| **Landing copy caps** | headline 48, subtext 120, attribution 64, dateText 48 | `LANDING_COPY_MAX` / `fitCopy` | Character budgets for landing copy (editor copy never trimmed). |
| **Headline-led subtext drop** | editorial_split, floated_card, portrait_credential, full_bleed_duotone | `HEADLINE_LED_LONG_CAPTION_DROPS` | Which archetypes force subtext to empty on landing (render-geometry workaround). |
| **Platform caption rules** | per dimension (IG "4–8 hashtags"; banner "NO hashtags") | caption branch | Hashtag/format rules per platform. |
| **X/Twitter hard cap** | 280 chars (server-side trim loop) | caption branch | Twitter caption ceiling. |

### Photo sourcing (Decision 12) — `lib/higgsfield.js`, `app/api/design-generate/route.js`, `app/page.jsx`
| Knob | Current value | Where (anchor) | What changing it does |
|---|---|---|---|
| **Soul quality** | 1080p (only 720p\|1080p accepted) | `SOUL_QUALITY` | Higgsfield render resolution. |
| **Soul size by format** | wide set (twitter/facebook/banner) → 2048×1152, else 1536×2048 | `soulSizeForDimension` | Photo aspect per format. |
| **Photo poll timeout / interval** | 50s / 2.5s | `POLL_TIMEOUT_MS` / `POLL_INTERVAL_MS` | How long/often the photo job is polled. |
| **Max concurrent jobs** | 4 | `MAX_CONCURRENT_JOBS` | Account-level Higgsfield concurrency cap. |
| **Generate poll interval / max** | 3s / 75s | `GEN_POLL_INTERVAL_MS` / `GEN_POLL_MAX_MS` | The page-side polling of the generate route. |
| **QC re-roll attempts** | 2 (last attempt qc=0) | `MAX_ATTEMPTS` (`app/page.jsx`) | How many photo re-rolls a quality-check failure buys. |
| **Scene-banned words** | ~14 terms | `SCENE_BANNED` | Words stripped from a scene prompt before sending. |
| **Negative-space directives** | 14 one-liners (per archetype) | `ARCHETYPE_PHOTO_DIRECTIVES` | Which region each archetype tells the photographer to keep calm. |
| **Photo-attach archetypes** | 6: editorial_split, floated_card, documentary, full_bleed_duotone, shape_cutout, message_pill | `PHOTO_ATTACH_ARCHETYPES` | Which archetypes may attach a generated photo. |

### The materializer & typography (Part II) — `components/Generator.jsx`
| Knob | Current value | Where (anchor) | What changing it does |
|---|---|---|---|
| **Master format** | ig_square | `MASTER_DIM` | The canvas edits cascade from. |
| **Min font floors** | headline `max(0.068h, 38·h/1080)`; date `max(0.100h, 60·h/1080)`; intro `0.062h/34`; body `0.062h/32`; dateLabel `0.040h/22` | `MIN_FONT_PX` | Smallest legible size per role per format height. |
| **Hero height (per archetype)** | editorial_split 0.42, floated_card 0.40, portrait_credential 0.30, petal_window 0.34 | `ARCHETYPES` | Vertical space the headline gets. (Full geometry → `visual-language-spec.md`.) |
| **Headline-width floor** | target 0.70·w, capped 0.42·h, gate heroCapFrac ≥ 0.10 | `heroWidthTarget` | Seeds the headline shrink loop bigger so photos get a confident headline. |
| **Orphan re-wrap** | lone line < 0.35 of widest → re-wrap; floor 0.84 of fitting size | reflow orphan branch | Prevents a single stranded word on its own line. |
| **Rhythm gap** | `max(0.35·heroLineH, 24·h/1080)` | reflow support branch | Vertical breathing room between hero and support. |

### Reflow & collision (Part II) — `components/Generator.jsx`
| Knob | Current value | Where (anchor) | What changing it does |
|---|---|---|---|
| **Seam tolerance** | 2% of min dimension | `seamTol` | How far resolved boxes clear a photo seam. |
| **Compose pad** | 6% of shape's short side | `resolveDecor` | Padding required to center text *inside* a decor shape. *Under active change.* |
| **Side-clearance threshold** | 18% of canvas width | `constrainToBand` / `resolveDecor` | Minimum clear side to shift text sideways instead of down. |
| **Compose contrast gate** | 4.5:1 | `renderScene` canCompose | Contrast a decor shape needs before text may sit on it. *Under active change.* |

### Formats & safe zones (Part II) — `components/Generator.jsx`, `lib/audit-local.js`
| Knob | Current value | Where (anchor) | What changing it does |
|---|---|---|---|
| **Format set** | 6 (portrait, square, story, twitter, facebook, banner) | `DIMENSIONS` | The output formats. |
| **Base safe margin** | 0.06 on all sides | `F_S` | Default text-safe inset. |
| **Story platform-safe bands** | top/bottom 0.13, left/right 0.04 | `PLATFORM_SAFE.story` (`lib/audit-local.js`) | Keeps content out of Story UI overlays. |
| **Dead-strip trigger** | edge-ivory ≥ 0.6 | `checkFormatFit` | How much unpainted ivory flags a mis-fit format. |

### Audit, Ready gate & export (Part II post-render) — `lib/audit-local.js`, `components/Generator.jsx`
| Knob | Current value | Where (anchor) | What changing it does |
|---|---|---|---|
| **Contrast thresholds** | fail 3.0, warn 4.5 | `CONTRAST_FAIL` / `CONTRAST_WARN` | Where the contrast checker fails vs warns. |
| **Thumbnail-legibility floor** | 6.5 device px at a 130px cell | `THUMB_MIN_PX` / `THUMB_CELL_W` | Smallest text that must survive the IG grid thumbnail. |
| **Audit copy caps** | support 240, headline 90 | `COPY_MAX` | Copy-overflow thresholds in the audit. |
| **Ack tolerance** | 0.025 (2.5% box move re-surfaces) | `ACK_FINGERPRINT_TOLERANCE` | How much an element may move before a dismissed finding returns. |
| **Blocker set** | contrast-fail, logo-overlap-text, logo-focal-band, safe-zone-violation, archetype-margin-crop, archetype-box-overlap | `BLOCKER_IDS` | The only findings that block "Ready". |
| **Format copy capacity** | banner 0 … story 5 | `FORMAT_COPY_CAPACITY` | Ranks formats for the "switch to a roomier format" suggestion. |
| **JPEG quality** | 0.92 | `download` | Export JPEG quality. |
| **Download-all stagger** | 300ms | `downloadAll` | Delay between the six saves. |

### The editing & taste loops (Part III) — `components/Generator.jsx`, `lib/preferences.js`, `lib/sessions.js`
| Knob | Current value | Where (anchor) | What changing it does |
|---|---|---|---|
| **AI undo depth** | 8 | `AI_UNDO_DEPTH` | How many AI edits are undoable. |
| **Harmonizer rounds** | 2 | `HARMONIZE_MAX_ROUNDS` | How many repair sweeps run after an AI change. |
| **Manual harmonize debounce** | 600ms | `MANUAL_HARMONIZE_DEBOUNCE_MS` | Quiet time after a manual burst before the repair sweep. |
| **Gene set** | archetype, variant, bgColor, treatment, register, postType, dimension, sceneCategory | `GENE_KEYS` / `buildGenes` | What a ♥ records — and therefore what the system can learn. |
| **Taste cache TTL** | 1h success / 5min failure | `CACHE_TTL_MS` / `FAIL_TTL_MS` | How fresh the preference aggregate stays. |
| **Taste scan limit** | 1000 newest events | `SCAN_LIMIT` | How far back likes still count (older ones silently stop). |
| **Exemplar count** | ≤5 phrases | `buildExemplars` | Size of the injected HOUSE STYLE block. |
| **Thumbnail cap** | 40KB | `logLike` (`lib/sessions.js`) | Max size of the stored like thumbnail. |

---

# Part V — Known gaps & honest caveats

Each is one sentence plus why it matters. All are drawn from the research, not invented here.

- **The "12 archetypes" comment is stale.** The header comment says 12; the array holds 19 — trust the array. *Why it matters:* a reader who believes the comment will miscount the catalog and mis-tune caps.
- **The rotation memory is now durable per brand (G1 — fixed).** `RECENT_PICKS` / `RECENT_VKINDS` / `LAST_BG` are still the in-memory ring, but it is now the **cache + fallback** over a durable Supabase row (`brand_rotation`, keyed by `brand_id`): the landing finalize path hydrates the ring from cloud at the top of the turn and persists it after the pick (`lib/rotation-state.js`). So rhythm/anti-repeat **survives deploys and is shared across serverless instances** — the correct scope, since the ring protects one brand's single feed. The cap/rhythm math is unchanged (same thresholds, same functions — only the state is durable). *Caveats that remain:* (a) with Supabase **absent** the ring degrades to exactly the old per-instance-memory behaviour (graceful, no 500s); (b) concurrent picks on two instances are **last-write-wins** — worst case one lost pick, self-correcting within a `RECENT_MAX` (12) window; (c) the cloud read is time-boxed (≤~150ms) and falls back to memory on timeout, so it never adds a latency cliff. *Why it still matters:* two users hitting the **same** instance within one turn still share that instance's live ring (as before) — the fix removes the cross-deploy/cross-instance divergence, not same-instance sharing (which is intended for a single shared feed).
- **The moodboard is now read (Moodboard → Templates P1/P2 — fixed).** Every inspiration image is gene-classified by one cheap vision call at upload (`lib/moodboard-genes.js`, backfilled nightly with a per-night cap by `scripts/learning-pass.js`); the aggregate folds those genes in at weight 0.5 alongside hearts at 1.0 (`lib/preferences.js`), and their primary consumption is pattern-mining into human-gated template proposals (`lib/proposal-engine.js` — cooldown, one-pending limit, `design_templates.status:'proposed'`). Cadence, knobs, and laws are owned by `docs/moodboard-templates-spec.md` — this doc only points. *Caveat:* the review pop-up + gallery Remove/Edit (P3) are client work, pending; until the owner re-runs `lib/schema.sql`, every path degrades gracefully to the old unread behaviour.
- **The creative-plan route is orphaned.** `app/api/creative-plan/route.js` and its `applyCreativePlan` / `undoCreativePlan` handlers are wired to nothing. *Why it matters:* dead code that looks live can mislead anyone tracing the planner.
- **The headline-width floor is muted when obstacles pre-narrow the box.** `heroWidthTarget` is measured *after* the box has already been narrowed by photo/decor avoidance, so it can't enlarge a headline that was clipped first. *Why it matters:* photo-heavy designs may get a smaller headline than the floor intends.
- **PARTNER-fit-but-centred-outside-safe falls through.** When text fits inside a decor shape but the centred position lands outside the safe rect, it exits with a bare continue — left uncentred and not re-avoided in that pass. *Why it matters:* a rare decor layout can strand text off-center. *(Under active change.)*
- **The format self-heal is dev-only.** The corrective redraw for a mis-sized canvas runs only in dev; a production CSS-aspect mismatch goes undetected. *Why it matters:* a format could ship slightly wrong in prod with no automatic catch.
- **"Download all" silently skips a failed format.** A per-format render exception in the batch export is swallowed. *Why it matters:* the user may get five files thinking they got six, with no warning.

---

# Technical appendix (anchors only)

Terse per-part index for engineers/agents. Anchors are function/constant names; line numbers drift. Re-verify any decor/overlay anchor — that subsystem is being rebuilt today.

**Part I — horizontal (`app/api/assistant/route.js` unless noted).** Entry callers: `submit` (`app/page.jsx`, landing → `/api/assistant` `context:'landing'`, then `generateScenePhoto` → `/api/design-generate` POST+poll, `MAX_ATTEMPTS`), `send` (`components/ArtDirectorChat.jsx`, `context:'editor'`, stream), `applyDesignTemplate` (Generator), skip Link (`app/page.jsx`). Context coercion `['landing','caption'].includes(...)`. Pre-LLM belts: `wantsTextOnly`/`TEXT_ONLY_INTENT`, `guessIntent`, `pickLandingArchetypeHint`. `finalizeBody` order: `wantsDecoration`/`DECOR_INTENT` → `resolveLandingArchetype` → `wantsLayoutChange`(`LAYOUT_INTENT`/`wantsFullImage`) → editor belts (`detectTextSubstitution`→`detectContactAdd`→`detectPhotoChange`/`PHOTO_CHANGE_INTENT`→`detectColourToken`+`COLOUR_ASK_INTENT`→`detectMood`/`MOOD_RECIPES`→`detectFontResize`) → echo-strippers → `SHAPE_SWAP_INTENT`/`SHAPE_RING` → `wantsFullImage`/`FULL_IMAGE_INTENT` → `LAYOUT_VARIETY_INTENT`/`PHOTO_RING`/`TEXT_RING`. Model: `OPENAI_ART_DIRECTOR_MODEL`||`gpt-4o-mini`; `/v1/responses`, `PATCH_JSON_SCHEMA` (`lib/design-patch.js`). Overrides: `toneScrub`/`TONE_FIELDS`, `LANDING_COPY_MAX`/`fitCopy`, `HEADLINE_LED_LONG_CAPTION_DROPS`. Archetypes: `LANDING_ARCHETYPES` (19), `resolveLandingArchetype`, `exceedsCap`, `pickPhotoLedArchetype`/`PHOTO_LED_BY_INTENT`, `recordPick`/`RECENT_PICKS`/`RECENT_MAX`, `pickVariant`, `weightedPick` (`lib/preferences.js`, `maxShare` 0.4). Durable rotation: `loadRotation`/`saveRotation`/`rotationClient`/`LOAD_TIMEOUT_MS` (`lib/rotation-state.js`), table `brand_rotation` (`lib/schema.sql`), hydrated at the top of the `context==='landing'` finalize block and persisted after `pickVariant`. Photo: `sanitizeScenePrompt`/`SCENE_BANNED`, `fallbackScene`/`DEFAULT_PHOTO_BRIEF`, `pickLandingPhoto`, `brandPhotoPrompt`/`ARCHETYPE_PHOTO_DIRECTIVES` (`lib/higgsfield.js`), `PHOTO_ATTACH_ARCHETYPES`, `qcPhoto` (design-generate GET). Caption: `handleCaption`/`CAPTION_JSON_SCHEMA`.

**Part II — vertical (`components/Generator.jsx` unless noted).** Vocab: `ARCHETYPES` (19; stale "12" comment), roles hero/support/microLabel, `drawFurniture` (rule/underline/index/counterweight/badge), `PHOTO_TREATMENTS`/`treatOf`, palette+`variants`. Materializer: `materializeArchetypeLayout`, `resolveArchetypeElements`, `archetypeFormatClass` ("wide" bucket), `MASTER_DIM`="ig_square", `resolveTextLayout`, `FORMAT_LAYOUTS`/`formatLayoutFor`. Z-stack painters: base/full-bleed (`renderScene`), `PHOTO_TREATMENTS`, `drawFrameLayer` (petal/shape source-in/destination-in), `_decorEarly` *(active change)*, `drawBackdrop`/`analyzeQuietRegion`, `drawMicroLabel`, `drawHeroText`, support `drawTextLines`, `drawFurniture`, `putLogo` (no backing), `drawOutlineLayer`/`drawLineArtLayer` *(active change)*, `<AdvisorDot>`. Reflow: `reflowEditorial`, `constrainToBand`, `resolveDecor` (PARTNER/OBSTACLE, `canCompose`), `seamTol`, `heroWidthTarget`, orphan branch, `pickLogoPlacement`. Typography: `MIN_FONT_PX`, `heroCapFrac`/`heroToSupport`, `fitText`, `greedyHeroWrap`/`measureHeroLines`. Guards: born-clean sites, `resolveZoneTextColor`, `analyzeQuietRegion`, `measureZoneContrast`, `LOGO_FOCAL_RADIUS`, `estimateFocalPoint`, pins (`userLogoTouched`/`.free`/`photoTouchedByDim`/`explicit`). Formats: `DIMENSIONS`, `F_S`, `PLATFORM_SAFE.story` (`lib/audit-local.js`), `focalToImgT`, `resolveLogoBase`, `checkFormatFit` (+dev-only self-heal). Post-render: `renderTruth`, `auditRef`, `runLocalAudit`/`runArchetypeDrift` (`lib/audit-local.js`), `computeReadyVerdict`/`BLOCKER_IDS`, One Advice Ledger (`mergeAuditIntoChecklist`/`reconcileAuditFindings`), `auditAllFormats`, `download`/`downloadAll`.

**Part III — loops.** Taste: `toggleLike`→`buildGenes`/`GENE_KEYS` (`lib/sessions.js`)→`logLike`→`ai_feedback_events`; `computeAggregate`/`SCAN_LIMIT`/`getLikePreferences`/`CACHE_TTL_MS`/`buildExemplars` (`lib/preferences.js`); `moreLikeThis` (session genes, not aggregate). Editing: `applyDesignPatch`/`applyPatch`, `aiUndoStack`/`AI_UNDO_DEPTH`, `noteManualEdit` burst-fold, `harmonizeRef`/`HARMONIZE_MAX_ROUNDS`/`MANUAL_HARMONIZE_DEBOUNCE_MS`, `CLIENT_PATCH_KEYS`/`coerceFixToCategory` (`lib/design-patch.js`), `drawRef` (stale-closure discipline). Moodboard: `verdict.kind='moodboard'`, no genes, unread by `computeAggregate`.
