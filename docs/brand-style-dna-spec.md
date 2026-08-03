# Brand Style DNA — one visual voice for every generated photo

**Status: RATIFIED 2026-08-03** (client ruling, verbatim): "i wonder how to create images with the same white orchid brand style" → layer 1 approved.

Subordinate to the zero-brand-facts law (docs/multi-tenancy-spec.md — the style block is DATA on the brand row, never a constant in code), the money law (distilling and generating spend real credits — both are user-invoked), the photographer-brief laws (lib/higgsfield.js — no text/design words ever reach the diffusion model), and the graceful-degradation contract ({configured:false}, never a 500).

## The system (three layers; layer 1 is built)

A brand's photos should share one visual voice — lighting, palette temperature, composition habits, texture — regardless of who prompts or what the scene is. Three layers, each strictly additive:

1. **Style DNA (BUILT)** — a short prose block describing HOW the brand's photos look (never WHAT is in them), stored as data on the brand row, distilled by AI from owner-chosen anchor photos or written by hand, composed into every outgoing scene prompt and enforced by the existing vision QC.
2. **Reference-image conditioning (DEFERRED)** — condition the provider directly on anchor images instead of prose. See Deferred §L2.
3. **Likes-driven learning (DEFERRED)** — the style block evolves from what the owner actually likes. See Deferred §L3.

## Layer 1 — the four pieces

### 1. Storage — `brand_kit.style_dna` (jsonb, data not code)

The brand row gains one nullable jsonb column:

```json
{
  "text": "the style block — prose, ≤2000 chars",
  "distilledFrom": ["image-id", "…"],
  "updatedAt": "ISO timestamp (server-stamped on write)",
  "authorship": "owner" | "ai"
}
```

- `null` / missing column / missing key = **no style DNA yet** — every read path answers exactly as the feature never existed. Behavior with no style DNA is byte-identical to before this spec.
- Schema: `lib/schema.sql` (guarded `add column if not exists`); the owner-run migration is `lib/migrations/2026-08-03-style-dna.sql` (idempotent, commented — same pattern as 2026-07-29).
- **Pre-migration write fallback (attempt ladder, /api/images precedent):** until the owner runs the migration, a write to the missing `style_dna` column is retried by folding the block into the existing `photo_brief` jsonb as `photo_brief.styleDna`. Reads check the column first, then the fallback key (`normalizeStyleDna` in `lib/style-dna.mjs`). The migration promotes any fallback value into the real column and strips the key — running it any number of times converges.
- **All writes go through the existing admin-gated `PATCH /api/brand`** (`x-wo-admin-key`, `lib/admin-auth.js` — fail-closed 503 when the key is unconfigured). `PATCH { style_dna: null }` clears. The server sanitizes the block and stamps `updatedAt`; the client never sets the timestamp.

### 2. Brand kit UI — the "Photo style" section (app/admin/brand)

- The style block in an **editable textarea + its own Save** (through the gated PATCH). Saving hand-written or hand-edited text marks `authorship: "owner"`; saving an **unedited** adopted distill draft keeps `authorship: "ai"` with its anchor ids in `distilledFrom` (honesty: the record says who actually wrote it).
- **"Distill from my photos"**: the owner picks **3–8 anchor images** from the library (own multi-select picker `components/StyleAnchorPicker.jsx`, reading `GET /api/images` — `LibraryPicker` is single-select-and-close by contract, so it cannot serve unmodified), then the distill route runs and the DRAFT block is shown **with the anchors it came from** and the per-image notes.
- **Nothing auto-applies.** The tap on Distill is consent to SPEND (the ledger law's spirit); the Save is consent to ADOPT. The draft lives only in the page until the owner edits/approves and saves.
- Honest copy: the section states that distilling reads each chosen photo with AI and uses paid AI credits.

### 3. Distill route — `POST /api/brand/style-distill`

`POST { imageIds: [3–8 ids] }` →

1. Rate-limit, then `requireAdminKey` (fail-closed 503 — this is a credit-spending endpoint).
2. `imageIds` validated: strings, deduped, **min 1 / max 8 — more than 8 is an honest 400**, never a silent slice on a paid route.
3. No `OPENAI_API_KEY` → `{ configured:false }` (HTTP 200). Supabase absent/missing table → `{ configured:false }`.
4. Per image (signed URL, `detail: "low"`, small max_tokens, `gpt-4o-mini` by default / `OPENAI_STYLE_MODEL`): extract style attributes only — **lighting, palette temperature, composition, texture/grain, subject treatment — HOW it looks, never who is in it, no names, no identities.**
5. ONE synthesis call writes the final block. The synthesis prompt **forbids**: the brand name or any proper noun (the name is read from the brand row at runtime — zero brand facts in code); any text-in-image/poster/logo/frame/caption/typography language (the scenePrompt laws — those words make diffusion models render text walls); and **subject-content prescriptions** (style ≠ content — the block must compose with ANY scene: no people, activities, objects, or scene content in the block).
6. Returns `{ draft, perImageNotes: [{ id, notes }] }`. Images that fail vision are skipped with an honest per-image note; zero usable images → `{ failed:true }` (HTTP 200), never a 500.

Engine (`distillStyle`) and every prompt builder live in `lib/style-dna.mjs` (pure, mock-testable); the route stays thin.

### 4. Generation + QC integration — the single choke point

Every generated photo path (landing, refresh photo, chat generate) goes through `app/api/design-generate/route.js`; that route is the ONLY integration point.

- **Prompt assembly (POST):** when the brand row carries `styleDna.text`, the outgoing scene becomes

  ```
  <scene>

  VISUAL STYLE (always): <styleDna.text>
  ```

  — composing with, never replacing, the scene; the photographer-brief scaffold (grade/camera/closing negatives) still wraps it as before. **When style DNA is absent the outgoing scene is byte-identical to today** (`composeSceneWithStyle` returns the input string itself).
- **QC (GET poll):** the existing vision QC gains exactly ONE additional criterion, only when styleDna is present: does the photo broadly match the style block (lighting / palette / texture)? An off-brand verdict answers `status:'qc_failed', offBrandStyle:true` and re-rolls via the EXISTING client re-roll machinery (`fetchScenePhoto`) — **attempt caps unchanged (2); the last attempt still skips QC (`qc=0`) so the user gets a photo over nothing.** QC still degrades OPEN on any API problem.
- Brand-row reads in this route are wrapped and null-safe: any Supabase problem reads as "no style DNA" and the pipeline proceeds exactly as today.
- Dev-only dry-run (`__woDryRun:true`, blocked in production): returns the composed scene + final prompt WITHOUT submitting a Higgsfield job — the money-law-safe way to prove prompt assembly live.

## Rules

- **Zero brand facts in code** — the block, the anchors, and the banned brand name are all data on the brand row. No style prose constants anywhere in `lib/` or `app/`.
- **Style ≠ content** — the block describes rendering qualities only. A block that prescribes subjects is a distill-quality bug; the synthesis prompt forbids it and the owner's edit pass is the backstop.
- **Absent = invisible** — no style DNA (unset, un-migrated column, unconfigured Supabase) must be indistinguishable from the pre-feature product: same prompts (byte-identical), same QC criteria, same responses.
- **Consent to spend ≠ consent to adopt** — Distill spends (one tap, honest copy); only Save adopts. Nothing the AI drafts touches generation until the owner saves it.
- **Money** — tests mock ALL OpenAI/Higgsfield calls. The sanctioned live check is one distill on ≤3 anchors (low-detail, cents). Generation integration is proven by unit tests + the dev dry-run, never a real Higgsfield spend.
- **No patch-grammar changes** — this feature adds no archetype/dimension/enum surface; mirror-check must stay 11/11.

## Verification bar

- Unit: style-DNA storage round-trip incl. the missing-column ladder (mocked supabase); distill engine shapes (cap, degradation, per-image failure, mocked vision + synthesis); prompt assembly with and without styleDna (byte-identity asserted with `===`); QC criterion wiring (criterion present only with styleText, verdict honored, degrade-open); brand PATCH acceptance of `style_dna` (live curl: gate 403/503 paths + persisted round-trip).
- Live: Brand kit shows the Photo style section; a real distill on ≤3 anchors returns a sensible draft; edit + Save persists through the gated PATCH and survives reload; dry-run proves the assembled prompt carries the block under the delimiter and is byte-identical without it. Zero console errors after hot-load.

## Deferred

### L2 — Reference-image conditioning (provider check, 2026-08-03)

Finding from the in-repo Higgsfield evidence (`lib/higgsfield.js` header + payload comments, verified empirically against `https://platform.higgsfield.ai` July 2026; `docs/agent-image-generation-guide.md` §A.1; `docs/feed-grammar-notes.md`):

- The public `POST /v1/text2image/soul` surface accepts `params: { prompt, width_and_height, quality, batch_size, seed, enhance_prompt, soul_id }` — **no reference-image / image-conditioning field exists on this endpoint.** `style_id` is MCP-internal and 400s ("style not found") on our key.
- **`soul_id` is the supported consistency mechanism**: a Soul identity *trained on reference images* (out-of-band, on Higgsfield's platform) locks the brand look; our code already passes it when `HIGGSFIELD_SOUL_ID` is set (`lib/higgsfield.js` `soulParams`).
- So layer 2's realistic shape is: train a Soul from the owner's anchor images (the same 3–8 anchors the distill flow already collects) and store the resulting `soul_id` on the brand row next to `style_dna` — not per-request image conditioning.
- **To verify before building** (no in-repo evidence either way): whether the platform API exposes Soul *training* endpoints programmatically (vs. dashboard-only), and whether any image2image/style-reference endpoint exists beside `text2image/soul` — both answerable with the same cheap 422-validator probes used to map the current surface.

### L3 — Likes-driven learning

The owner's like signal (`getLikePreferences` aggregate, docs/self-improvement-loop.md) periodically proposes a style-block revision: distill the top-liked generated photos, diff against the current block, and surface the proposal for ratification — **never self-applying** (the self-improvement law: human ratifies). `authorship` stays honest: an adopted proposal is `"ai"`. Pickup path: reuse `distillStyle` on liked-image anchors; add a proposals surface to the Photo style section.
