-- ─────────────────────────────────────────────────────────────────────────────
-- MEDIA ORGANIZATION MIGRATION (client rulings 2026-07-29)
-- Run this ONCE in Supabase → SQL Editor → New query. Safe to re-run: every
-- statement is guarded (drop-if-exists / add-if-not-exists / WHERE-guarded
-- UPDATE), so running the whole file top-to-bottom any number of times
-- converges on the same state and never loses data.
--
-- What it does, in order:
--   1. images.source_type vocabulary: ('midjourney_render','real_photo') →
--      ('generated','uploaded') — "the midjourney tag is outdated, its either
--      generated or uploaded". Existing rows are mapped, not deleted.
--      consent_status is UNTOUCHED (it stays an orthogonal dimension).
--   2. images.session_id — activity lineage: which design session an image was
--      generated/uploaded in ("the system can auto group them base on the
--      activity"). Nullable; pre-migration rows honestly stay unlinked.
--   3. exports table reshape — the old scaffold columns (post_type, channel,
--      logo_*, source_image_id) reflected an obsolete model and were NEVER
--      written by the app. New shape: id, created_at, session_id, dimension_id,
--      format ('png'|'jpeg'), storage_path, headline, metadata. We ALTER the
--      existing table instead of dropping/recreating it: although the table was
--      empty when this migration was authored, the new /api/exports route may
--      have written PRE-migration rows (real export history, packed into
--      metadata) before you ran this file — ALTER + backfill preserves them,
--      a DROP would destroy them.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. images.source_type: generated | uploaded ─────────────────────────────

-- Drop the old CHECK first so the mapping UPDATEs below can write the new
-- values. (Also drops the NEW check on a re-run — it is re-added at the end of
-- this section, so the drop/add pair is idempotent as a unit.)
alter table images drop constraint if exists images_source_type_check;

-- Map legacy rows to the new vocabulary (ratified: midjourney_render rows were
-- AI renders → 'generated'; real_photo rows were person-supplied → 'uploaded').
-- WHERE-guarded, so a re-run touches zero rows. consent_status is not touched.
update images set source_type = 'generated' where source_type = 'midjourney_render';
update images set source_type = 'uploaded'  where source_type = 'real_photo';

-- Re-add the CHECK with the new (and only the new) vocabulary. Every row now
-- satisfies it thanks to the UPDATEs above.
alter table images add constraint images_source_type_check
  check (source_type in ('generated','uploaded'));


-- ── 2. images.session_id: activity lineage ──────────────────────────────────

-- Which design session the image entered the library from. Nullable TEXT
-- (matches design_sessions.id, a client-minted key). Every pre-existing row
-- stays NULL — those images genuinely have no recorded lineage, and the
-- Library's "By activity" view shows them in one honest "Earlier / unlinked"
-- group rather than faking history.
alter table images add column if not exists session_id text;

-- The "By activity" view groups by session, newest activity first.
create index if not exists images_session_idx on images (session_id, created_at desc);


-- ── 3. exports table reshape ────────────────────────────────────────────────

-- New columns (nullable, so this is safe regardless of existing rows).
alter table exports add column if not exists session_id   text;   -- design_sessions.id — "go back to the session"
alter table exports add column if not exists dimension_id text;   -- e.g. 'ig_square' | 'story' — which format was exported
alter table exports add column if not exists format       text;   -- 'png' | 'jpeg'

-- Backfill: any PRE-migration rows the new /api/exports route wrote carried
-- the real values inside metadata (marked pre_migration:true) because these
-- columns did not exist yet. Promote them into the real columns. coalesce()
-- keeps already-promoted values, so a re-run changes nothing.
update exports set
  session_id   = coalesce(session_id,   metadata->>'session_id'),
  dimension_id = coalesce(dimension_id, metadata->>'dimension_id'),
  format       = coalesce(format,       metadata->>'format')
where (metadata->>'pre_migration') = 'true';

-- Any row still missing a format defaults to png (the route's own default).
update exports set format = 'png' where format is null;

-- Constrain format to the two values the exporter produces. Drop-if-exists +
-- add keeps the pair idempotent (same pattern as the images check above).
alter table exports drop constraint if exists exports_format_check;
alter table exports add constraint exports_format_check
  check (format in ('png','jpeg'));

-- Drop the obsolete scaffold columns. The app NEVER wrote these (verified:
-- the table shipped as dead scaffold — nothing inserted into it before the
-- 2026-07-29 export-history feature, and that feature never writes them), so
-- no data is lost. if-exists-guarded → idempotent.
alter table exports drop constraint if exists exports_source_image_id_fkey;
alter table exports drop constraint if exists exports_logo_variant_id_fkey;
alter table exports drop column if exists source_image_id;
alter table exports drop column if exists post_type;
alter table exports drop column if exists channel;
alter table exports drop column if exists logo_variant_id;
alter table exports drop column if exists logo_position;
alter table exports drop column if exists logo_size;
alter table exports drop column if exists thumb_path;   -- new shape has no server thumbs
alter table exports drop column if exists created_by;   -- no auth/user model on this table

-- Export history lists newest-first; "Open session" joins on session_id.
create index if not exists exports_created_idx on exports (created_at desc);
create index if not exists exports_session_idx on exports (session_id, created_at desc);
