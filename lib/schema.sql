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

-- ── Seed brand kit (one row) ──────────────────
insert into brand_kit (id) values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ── Storage buckets (run after creating tables) ─
-- Create these manually in Supabase → Storage:
-- 1. "logos"   — public  — for SVG logo files
-- 2. "images"  — private — for uploaded source images
-- 3. "exports" — private — for composited outputs
