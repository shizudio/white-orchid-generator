-- ─────────────────────────────────────────────
-- WHITE ORCHID — Supabase schema
-- Run this in Supabase → SQL Editor → New query
-- ─────────────────────────────────────────────
--
-- FULLY IDEMPOTENT: every statement is create-table-if-not-exists,
-- add-column-if-not-exists, create-index-if-not-exists, or an insert guarded by
-- `on conflict … do nothing`. Running this whole file top-to-bottom any number
-- of times is safe and non-destructive — it never drops or rewrites data.
--
-- ── MULTI-TENANCY P1 MIGRATION (run once) ────────────────────────────────────
-- The tokenization pass (docs/multi-tenancy-spec.md §P1) added the following.
-- To apply it to an existing database, just re-run this file — the guarded
-- statements below add exactly the new pieces and skip everything already there:
--
--   • brand_kit: new columns name, assistant_name, tone, voice_rules, photo_brief
--     (identity + voice + photographer-brief; defaults IDENTICAL to today's
--      hardcoded values — lib/brand-defaults.js is the code-side fallback).
--   • logo_variants: new columns slug, shape, wide, brand_id (+ unique slug
--     index) and the 14 White Orchid rows seeded (item c).
--   • brand_overlays: NEW table + the 10 built-in petal/shape/accessory rows
--     seeded (item d).
--
-- CONTRACT: every seeded value equals today's constant and every storage_path is
-- the SAME public /assets/… path the app already serves, so running this
-- migration changes NOTHING visible until a brand's admin actually edits a row.
-- An un-migrated DB (or a missing column/table) degrades to the code fallbacks
-- in lib/brand-defaults.js — i.e. exactly the current White Orchid behaviour.
-- ─────────────────────────────────────────────

-- Brand kit (single row, admin-managed)
create table if not exists brand_kit (
  id            uuid primary key default gen_random_uuid(),
  updated_at    timestamptz default now(),

  -- Colors (JSONB array of {label, hex, role})
  colors        jsonb not null default '[
    {"label":"Burnham","hex":"#2B5040","role":"primary"},
    {"label":"Ivory","hex":"#F5F0E8","role":"secondary"},
    {"label":"Tangerine","hex":"#FF6347","role":"accent"},
    {"label":"Wisteria","hex":"#C9B2CB","role":"accent"},
    {"label":"Celadon","hex":"#87C4A0","role":"accent"},
    {"label":"Ash","hex":"#B8B0A8","role":"neutral"},
    {"label":"Jet","hex":"#2D2D2D","role":"neutral"}
  ]'::jsonb,

  -- Typography
  font_heading  text not null default 'Cormorant Garamond',
  font_body     text not null default 'Fira Sans',
  font_ui       text not null default 'Syne',

  -- Guardrail notes (free text, shown to staff)
  guardrails    text not null default 'No identifiable children''s faces without explicit parental consent. No overclaiming language (e.g. "best", "only"). Keep copy warm and parent-facing, not child-facing.'
);

-- (Multi-tenancy P1 — docs/multi-tenancy-spec.md) Identity + voice + photo-brief
-- fields, added so brand name/wordmark, the AI assistant's persona name, the
-- voice/tone copy rules, and the Higgsfield photographer-brief template all
-- live in the DB instead of hardcoded strings in app/api/assistant/route.js,
-- lib/higgsfield.js and components/Generator.jsx. Idempotent; defaults are
-- IDENTICAL to today's hardcoded values (lib/brand-defaults.js is the code
-- fallback, kept in sync by hand) so an un-migrated DB or a missing column
-- degrades to exactly the current White Orchid behaviour.
alter table brand_kit add column if not exists name            text not null default 'The White Orchid';
alter table brand_kit add column if not exists assistant_name  text not null default 'Orchid';
alter table brand_kit add column if not exists tone            text not null default 'warm, thoughtful, premium, clear and human';
alter table brand_kit add column if not exists voice_rules     text not null default 'Warm, plain-English, never salesy.
COPY TONE (applies to EVERY copy field you write — headline, subtext, attribution, reply):
- NEVER use an exclamation mark. Not one. Calm confidence, not excitement.
- Never salesy or promotional ("Join us for a day of discovery and learning!" is exactly wrong). No urgency phrases, no hype adjectives, no "don''t miss".
- Sentence case, not Title Case ("Come and see for yourself", not "Join Us For Our Open House").
- Short, quiet, editorial. An invitation reads like a note from a calm teacher, not a flyer.
- Avoid brochure clichés: "Join us for…", "a day of discovery and learning", "fun-filled", "exciting". Prefer plain, concrete lines ("Come and see for yourself", "Doors open at nine").';
-- Photographer-brief template (lib/higgsfield.js brandPhotoPrompt): the fixed
-- warm-grade + closing-negatives sentences, and the casting/setting brief used
-- by the gpt-image-1 fallback. JSONB so a brand can override any slot
-- independently; PHOTO_GRADE / PHOTO_CLOSING / castingBrief keys mirror
-- lib/brand-defaults.js DEFAULT_PHOTO_BRIEF.
alter table brand_kit add column if not exists photo_brief jsonb not null default '{
  "grade": "Gentle warm color grade, palette of forest green, ivory and warm terracotta, natural warm Asian skin tones.",
  "closing": "No text, no letters, no words, no logos, no UI, no poster, no frame, no layout, no captions, no border. A single full-frame edge-to-edge photograph.",
  "castingBrief": "Editorial photography for a calm, premium preschool / early-education brand. Warm natural light, soft focus, gentle earthy palette (deep forest green, ivory, soft mauve, muted celadon). Authentic, unposed, documentary feel; shallow depth of field; no harsh flash."
}'::jsonb;

-- Logo variants (admin-managed, replaces hardcoded LOGO_VARIANTS)
create table if not exists logo_variants (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,           -- e.g. "Primary 1"
  group_name  text not null,           -- "primary" | "secondary"
  color_tone  text not null,           -- "green" | "ivory"
  storage_path text not null,          -- path in Supabase Storage, e.g. logos/primary-1-green.svg
  sort_order  int not null default 0,
  created_at  timestamptz default now()
);

-- (Multi-tenancy P1 item c) slug (a stable client-facing id, e.g. "p1-green"),
-- shape (the render-selection class: horizontal|stacked|square|mark — see
-- pickBrandLogo in components/Generator.jsx) and wide (extra-wide lockup
-- bonus flag) — the fields GET /api/logo-variants needs to reproduce the
-- LOGO_VARIANTS shape exactly. Idempotent; nullable so absent columns degrade
-- gracefully (the client's hardcoded fallback keeps rendering unchanged).
alter table logo_variants add column if not exists slug  text;
alter table logo_variants add column if not exists shape text;
alter table logo_variants add column if not exists wide  boolean not null default false;
alter table logo_variants add column if not exists brand_id uuid default '00000000-0000-0000-0000-000000000001';
create unique index if not exists logo_variants_slug_idx on logo_variants (brand_id, slug) where slug is not null;

-- Seed the White Orchid's 14 logo variants (identical to the LOGO_VARIANTS
-- fallback in lib/brand-defaults.js) — storage_path here is the SAME public
-- asset path the app already serves today (/assets/logos/...), not a Supabase
-- Storage object, so seeding this table changes nothing until a brand's admin
-- actually re-points a row at an uploaded asset. on conflict keyed by slug so
-- this insert is safe to run more than once.
insert into logo_variants (slug, label, group_name, color_tone, shape, wide, storage_path, sort_order, brand_id) values
  ('p1-green',  'Primary 1',       'primary',   'green', 'horizontal', false, '/assets/logos/primary/primary-1-green.svg',        0,  '00000000-0000-0000-0000-000000000001'),
  ('p1-ivory',  'Primary 1',       'primary',   'ivory', 'horizontal', false, '/assets/logos/primary/primary-1-ivory.svg',        1,  '00000000-0000-0000-0000-000000000001'),
  ('p2-green',  'Primary 2',       'primary',   'green', 'horizontal', true,  '/assets/logos/primary/primary-2-green.svg',        2,  '00000000-0000-0000-0000-000000000001'),
  ('p2-ivory',  'Primary 2',       'primary',   'ivory', 'horizontal', true,  '/assets/logos/primary/primary-2-ivory.svg',        3,  '00000000-0000-0000-0000-000000000001'),
  ('p3-green',  'Primary 3',       'primary',   'green', 'stacked',    false, '/assets/logos/primary/primary-3-green.svg',        4,  '00000000-0000-0000-0000-000000000001'),
  ('p3-ivory',  'Primary 3',       'primary',   'ivory', 'stacked',    false, '/assets/logos/primary/primary-3-flat-ivory.svg',   5,  '00000000-0000-0000-0000-000000000001'),
  ('p3f-green', 'Primary 3 Flat',  'primary',   'green', 'stacked',    false, '/assets/logos/primary/primary-3-flat-green.svg',   6,  '00000000-0000-0000-0000-000000000001'),
  ('p4',        'Primary 4',       'primary',   'green', 'square',     false, '/assets/logos/primary/primary-4.svg',              7,  '00000000-0000-0000-0000-000000000001'),
  ('p-central', 'Central',         'primary',   'green', 'horizontal', false, '/assets/logos/primary/primary-central-green.svg',  8,  '00000000-0000-0000-0000-000000000001'),
  ('p-circle',  'Circle',          'primary',   'green', 'mark',       false, '/assets/logos/primary/primary-circle.svg',         9,  '00000000-0000-0000-0000-000000000001'),
  ('p-bg',      'With BG',         'primary',   'green', 'mark',       false, '/assets/logos/primary/primary-bg-green.svg',       10, '00000000-0000-0000-0000-000000000001'),
  ('s1-green',  'Secondary 1',     'secondary', 'green', 'square',     false, '/assets/logos/secondary/secondary-1-green.svg',    11, '00000000-0000-0000-0000-000000000001'),
  ('s1-ivory',  'Secondary 1',     'secondary', 'ivory', 'square',     false, '/assets/logos/secondary/secondary-1-ivory.svg',    12, '00000000-0000-0000-0000-000000000001'),
  ('s2-green',  'Secondary 2',     'secondary', 'green', 'horizontal', false, '/assets/logos/secondary/secondary-2-green.svg',    13, '00000000-0000-0000-0000-000000000001')
on conflict (brand_id, slug) where slug is not null do nothing;

-- Brand overlays (multi-tenancy P1 item d) — the built-in petal/shape +
-- accessory set that ships in the "+ Add → Shapes" tray. Mirrors
-- lib/brand-defaults.js DEFAULT_OVERLAY_ASSETS 1:1 so a brand can re-point any
-- built-in at its own uploaded asset. Same pattern + degradation contract as
-- logo_variants: GET /api/overlay-assets reshapes these rows into the client's
-- overlay shape; any env/table/row problem returns { configured:false } and the
-- editor keeps the hardcoded DEFAULT_OVERLAYS fallback (byte-identical to the
-- seed below), so a fresh brand or a DB outage shows the White Orchid shapes
-- exactly as today. This is DISTINCT from the OFFICIAL owner-uploaded decorations
-- (app/api/brand-assets, stored as bucket objects) which layer ON TOP of these.
--
-- ratio is stored as an integer numerator/denominator pair (ratio_num/ratio_den)
-- so the client reproduces the EXACT float DEFAULT_OVERLAY_ASSETS uses (e.g.
-- 169/207) — a rounded decimal column could shift petal sizing sub-pixel.
create table if not exists brand_overlays (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid default '00000000-0000-0000-0000-000000000001',
  slug         text not null,           -- stable client id, e.g. "orchid-petal"
  name         text not null,           -- tray label, e.g. "Orchid"
  storage_path text not null,           -- public asset path today (/assets/shapes/…) or a Storage object
  kind         text not null,           -- "center" | "accessory"
  category     text not null,           -- "overlays" | "accessories"
  ratio_num    int not null default 1,  -- aspect ratio numerator
  ratio_den    int not null default 1,  -- aspect ratio denominator
  sort_order   int not null default 0,
  created_at   timestamptz default now()
);
create unique index if not exists brand_overlays_slug_idx on brand_overlays (brand_id, slug);

-- Seed the White Orchid's 10 built-in overlays (identical to the DEFAULT_OVERLAYS
-- fallback in lib/brand-defaults.js). storage_path is the SAME public asset path
-- the app serves today, so seeding this table changes nothing until a brand's
-- admin re-points a row. on conflict keyed by (brand_id, slug) so it is safe to
-- run more than once.
insert into brand_overlays (slug, name, storage_path, kind, category, ratio_num, ratio_den, sort_order, brand_id) values
  ('orchid-petal', 'Orchid',       '/assets/shapes/orchid-petal.svg',        'center',    'overlays',    1,   1,   0, '00000000-0000-0000-0000-000000000001'),
  ('shape-1',      'Shape 1',      '/assets/shapes/shape-1.svg',             'center',    'overlays',    169, 207, 1, '00000000-0000-0000-0000-000000000001'),
  ('shape-2',      'Shape 2',      '/assets/shapes/shape-2.svg',             'center',    'overlays',    217, 196, 2, '00000000-0000-0000-0000-000000000001'),
  ('shape-3',      'Shape 3',      '/assets/shapes/shape-3.svg',             'center',    'overlays',    173, 207, 3, '00000000-0000-0000-0000-000000000001'),
  ('acc-arrow',    'Arrow',        '/assets/accessories/arrow.svg',          'accessory', 'accessories', 3,   1,   4, '00000000-0000-0000-0000-000000000001'),
  ('acc-curve',    'Curved Arrow', '/assets/accessories/curved-arrow.svg',   'accessory', 'accessories', 1,   1,   5, '00000000-0000-0000-0000-000000000001'),
  ('acc-spark',    'Spark',        '/assets/accessories/spark.svg',          'accessory', 'accessories', 1,   1,   6, '00000000-0000-0000-0000-000000000001'),
  ('acc-plus',     'Plus',         '/assets/accessories/plus.svg',           'accessory', 'accessories', 1,   1,   7, '00000000-0000-0000-0000-000000000001'),
  ('acc-ring',     'Ring',         '/assets/accessories/ring.svg',           'accessory', 'accessories', 1,   1,   8, '00000000-0000-0000-0000-000000000001'),
  ('acc-wave',     'Wave',         '/assets/accessories/wave.svg',           'accessory', 'accessories', 3,   1,   9, '00000000-0000-0000-0000-000000000001')
on conflict (brand_id, slug) do nothing;

-- Images (uploaded source assets)
create table if not exists images (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  created_by      text,                          -- future: user id
  storage_path    text not null,                 -- path in Supabase Storage
  thumb_path      text,                          -- compressed thumbnail path
  filename        text not null,
  source_type     text not null check (source_type in ('midjourney_render','real_photo')),
  consent_status  text not null default 'na' check (consent_status in ('na','cleared','pending','blocked')),
  -- na = not applicable (midjourney), cleared/pending/blocked = real photos
  metadata        jsonb not null default '{}'::jsonb  -- width, height, etc.
);

-- Exported assets (composited outputs)
create table if not exists exports (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  created_by      text,
  source_image_id uuid references images(id) on delete set null,  -- lineage
  storage_path    text not null,
  thumb_path      text,
  post_type       text not null,        -- photo_logo | quote | event | text_post | texture_text
  channel         text not null,        -- instagram_feed | instagram_story | facebook_post | whatsapp
  logo_variant_id uuid references logo_variants(id) on delete set null,
  logo_position   text,
  logo_size       text,
  headline        text,
  metadata        jsonb not null default '{}'::jsonb
);

-- Design templates (SHARED team library — mirrors localStorage "wo-design-templates")
-- Same trust model as images: no auth, single shared space keyed by BRAND_ID.
create table if not exists design_templates (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  brand_id    uuid default '00000000-0000-0000-0000-000000000001',
  name        text not null,
  thumb       text,                          -- small JPEG dataURL (160×160, ~q0.68)
  state       jsonb not null,                -- currentTemplateState() serialization
  deleted     boolean default false
);
create index if not exists design_templates_brand_idx on design_templates (brand_id, deleted, updated_at desc);

-- Design drafts (cross-device working doc — mirrors localStorage "wo-workdoc")
-- id is a stable per-design draft key (e.g. "current"); latest-write-wins by updated_at.
create table if not exists design_drafts (
  id           text primary key,             -- stable draft key, e.g. "current"
  brand_id     uuid default '00000000-0000-0000-0000-000000000001',
  updated_at   timestamptz default now(),
  state        jsonb not null,               -- { overlayLayers, ... }
  device_label text
);

-- Design sessions (WP-W — one session = one post; ux-architecture §2.7)
-- A session binds a design + its full chat conversation under one id. Sessions
-- auto-save continuously (debounced) and supersede the old single-row draft:
-- the working document is now "the session you're in". Same trust model as the
-- rest of the table (no auth, single shared space keyed by brand_id). Graceful
-- degradation: when this table / env is absent the client keeps everything in
-- localStorage — nothing user-facing breaks.
create table if not exists design_sessions (
  id            text primary key,             -- client-minted session key, e.g. "s_lqx9…"
  brand_id      uuid default '00000000-0000-0000-0000-000000000001',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  title         text,                         -- AI-derived from the brief (falls back to headline / post type)
  thumb         text,                         -- small canvas JPEG dataURL (~160×160, q0.68)
  state         jsonb not null default '{}'::jsonb,  -- currentTemplateState() serialization (the design)
  conversation  jsonb not null default '[]'::jsonb,  -- the chat turns [{role,content,…}]
  archived      boolean default false         -- older-than-N auto-archived; fetch-on-demand, never deleted
);
create index if not exists design_sessions_brand_idx on design_sessions (brand_id, archived, updated_at desc);

-- (WP-Y1a) Campaign FOUNDATION — a nullable "set"/group abstraction over sessions.
-- A standalone post has all three columns null and behaves exactly as before. A
-- campaign (WP-P1, later) = N sessions sharing group_id, ordered by group_order.
-- Idempotent; run once in Supabase → SQL Editor. Absent columns degrade gracefully
-- (the client keeps groups in localStorage until these are added), so standalone
-- sessions are never affected by whether this migration has run.
alter table design_sessions add column if not exists group_id    text;
alter table design_sessions add column if not exists group_title  text;
alter table design_sessions add column if not exists group_order  int;
create index if not exists design_sessions_group_idx on design_sessions (brand_id, group_id, group_order);

-- (Hearts + Feed gallery, ratified 2026-07-06) liked = the owner hearted this
-- post (its design GENES feed the preference-weighted rotation + house-style
-- exemplars); exported_at = the post was downloaded (the gallery marks it).
-- Idempotent; absent columns degrade gracefully (hearts stay device-local
-- until this runs — the API retries without them).
alter table design_sessions add column if not exists liked        boolean default false;
alter table design_sessions add column if not exists exported_at  timestamptz;

-- Official decorative assets (Declutter item 7, 2026-07-06): stored as OBJECTS
-- in the existing PUBLIC `logos` bucket under the `brand-assets/` prefix (see
-- app/api/brand-assets/route.js) — no table needed. Metadata rides in the
-- object name: brand-assets/<ts>__<kind>__<ratio*1000>__<name>.<svg|png>

-- AI feedback events (WP-W / self-improvement-loop §1 — the capture layer).
-- One row per chat turn: the user's verbatim message, the patch emitted, a
-- compact before/after design diff, the renderTruth honesty verdict (incl. any
-- self-correction the AI made and BOTH contradiction directions), and the
-- implicit verdict enriched from the user's NEXT action (undo → rejection,
-- re-ask → failure, "try another layout" → layout rejection, export → success).
-- Fire-and-forget from the client; never blocks the UX. localStorage ring-buffer
-- fallback when this table / env is absent. The learning pass (§4) pulls from here.
create table if not exists ai_feedback_events (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid default '00000000-0000-0000-0000-000000000001',
  created_at    timestamptz default now(),
  session_id    text,                         -- design_sessions.id (nullable — pre-session turns)
  turn_id       text,                         -- client-minted per-turn key (for later verdict enrichment)
  user_message  text,                         -- verbatim user prompt
  patch         jsonb,                        -- the patch the AI emitted
  change_keys   jsonb,                        -- the keys that ACTUALLY changed (true diff)
  state_diff    jsonb,                        -- compact before/after of touched fields
  verdict       jsonb,                        -- { honesty, corrected, contradictions[], implicit, note, … }
  reply         text                          -- the AI's narration (for the honesty audit)
);
create index if not exists ai_feedback_events_session_idx on ai_feedback_events (brand_id, session_id, created_at desc);
create index if not exists ai_feedback_events_created_idx on ai_feedback_events (brand_id, created_at desc);

-- ── Seed brand kit (one row) ──────────────────
insert into brand_kit (id) values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ── Storage buckets (run after creating tables) ─
-- Create these manually in Supabase → Storage:
-- 1. "logos"   — public  — for SVG logo files
-- 2. "images"  — private — for uploaded source images
-- 3. "exports" — private — for composited outputs
