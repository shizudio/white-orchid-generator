-- ─────────────────────────────────────────────────────────────────────────────
-- BRAND STYLE DNA MIGRATION (docs/brand-style-dna-spec.md, ratified 2026-08-03)
-- Run this ONCE in Supabase → SQL Editor → New query. Safe to re-run: every
-- statement is guarded (add-if-not-exists / WHERE-guarded UPDATE), so running
-- the whole file any number of times converges on the same state and never
-- loses data.
--
-- What it does, in order:
--   1. brand_kit.style_dna — the brand's photographic style block as jsonb:
--      { text, distilledFrom:[image ids], updatedAt, authorship:"owner"|"ai" }.
--      Nullable; NULL = "no style DNA yet" (the feature reads as absent —
--      prompts and QC stay byte-identical to before).
--   2. Promotes any PRE-migration saves out of the write fallback: until this
--      file runs, PATCH /api/brand persists the block inside the existing
--      photo_brief jsonb as photo_brief.styleDna (missing-column ladder in
--      lib/style-dna.mjs writeStyleDna — same pattern as /api/images'
--      session_id ladder). The UPDATEs below move that value into the real
--      column and strip the fallback key; coalesce-style guards mean a re-run
--      touches zero rows and an already-promoted column value is never
--      overwritten by a stale fallback.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. brand_kit.style_dna ──────────────────────────────────────────────────

alter table brand_kit add column if not exists style_dna jsonb;


-- ── 2. Promote pre-migration fallback writes, then strip the fallback key ───

-- Column wins: only rows whose column is still NULL take the fallback value.
update brand_kit
   set style_dna = photo_brief->'styleDna'
 where style_dna is null
   and photo_brief ? 'styleDna';

-- The fallback key is removed once (and only where) it exists, so reads stop
-- seeing a stale duplicate. WHERE-guarded → a re-run touches zero rows.
update brand_kit
   set photo_brief = photo_brief - 'styleDna'
 where photo_brief ? 'styleDna';
