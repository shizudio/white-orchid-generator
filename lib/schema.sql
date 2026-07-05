-- ─────────────────────────────────────────────
-- WHITE ORCHID — Supabase schema
-- Run this in Supabase → SQL Editor → New query
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
