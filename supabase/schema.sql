-- ============================================================
-- Paunawa — Supabase schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- ============================================================

create extension if not exists pgcrypto; -- needed for SHA-256 hashing (digest())

-- ---------- Reports ----------
create table if not exists reports (
  id bigserial primary key,
  report_id text unique not null,
  "timestamp" text not null,
  last_updated text not null,
  type text not null,
  status text not null default 'Active',
  lat double precision not null,
  lng double precision not null,
  description text not null,
  reporter_alias text default 'Anonymous',
  editor_id text default 'anonymous',
  upvotes int default 0,
  avg_accuracy numeric default 0,
  avg_authenticity numeric default 0,
  avg_usefulness numeric default 0,
  flagged boolean default false,
  hidden boolean default false,
  image_count int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_reports_type on reports(type);
create index if not exists idx_reports_status on reports(status);
create index if not exists idx_reports_hidden on reports(hidden);

-- ---------- Facilities ----------
create table if not exists facilities (
  id bigserial primary key,
  facility_id text unique not null,
  name text not null,
  type text not null,
  lat double precision not null,
  lng double precision not null,
  capacity text default '',
  contact text default '',
  description text default '',
  submitted_by text default 'Anonymous',
  editor_id text default 'anonymous',
  upvotes int default 0,
  flagged boolean default false,
  hidden boolean default false,
  image_count int default 0,
  "timestamp" text not null,
  last_updated text not null,
  created_at timestamptz default now()
);
create index if not exists idx_facilities_type on facilities(type);
create index if not exists idx_facilities_hidden on facilities(hidden);

-- ---------- Updates (field-level version history; generic parent key) ----------
create table if not exists updates (
  id bigserial primary key,
  update_id text unique not null,
  record_id text not null, -- reports.report_id OR facilities.facility_id
  "timestamp" text not null,
  editor_id text default 'anonymous',
  editor_alias text default 'Anonymous',
  field_changed text not null,
  old_value text,
  new_value text,
  created_at timestamptz default now()
);
create index if not exists idx_updates_record on updates(record_id);

-- ---------- Ratings ----------
-- One rating per (report, user): submit_rating() upserts on this key so a
-- single device cannot stuff the average by rating the same report repeatedly.
create table if not exists ratings (
  id bigserial primary key,
  rating_id text unique not null,
  report_id text not null,
  user_id text default 'anonymous',
  accuracy int not null,
  authenticity int not null,
  usefulness int not null,
  "timestamp" text not null,
  created_at timestamptz default now(),
  unique (report_id, user_id)
);
create index if not exists idx_ratings_report on ratings(report_id);
-- Backfill the constraint on databases created before this column existed.
-- (No-op on fresh installs where the inline UNIQUE above already applied.)
do $$ begin
  alter table ratings add constraint ratings_report_user_uniq unique (report_id, user_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

-- ---------- Upvotes (per-user ledger; the reports/facilities.upvotes column
-- is just a cached counter) ----------
-- record_id is generic: a reports.report_id OR a facilities.facility_id.
-- upvote_report()/upvote_facility() insert here on-conflict-do-nothing and
-- only bump the counter when a NEW row lands, making upvotes idempotent per user.
create table if not exists upvotes (
  id bigserial primary key,
  record_id text not null,
  user_id text not null default 'anonymous',
  created_at timestamptz default now(),
  unique (record_id, user_id)
);
create index if not exists idx_upvotes_record on upvotes(record_id);

-- ---------- Users (anonymous device registry — no PII, no auth) ----------
create table if not exists users (
  id bigserial primary key,
  user_id text unique not null,
  alias text default 'Anonymous',
  created_at_iso text not null,
  role text default 'reporter',
  reports_submitted int default 0
);

-- ---------- Blockchain (hash-chain audit trail; generic parent key) ----------
create table if not exists blockchain (
  id bigserial primary key,
  block_id text unique not null,
  record_id text not null, -- reports.report_id OR facilities.facility_id
  action text not null,
  editor_id text default 'anonymous',
  "timestamp" text not null,
  previous_hash text not null,
  current_hash text not null,
  payload_snapshot text not null,
  created_at timestamptz default now()
);
create index if not exists idx_blockchain_record on blockchain(record_id, id);

-- ---------- Images (generic parent key; stores Storage public URLs, not base64) ----------
create table if not exists images (
  id bigserial primary key,
  image_id text unique not null,
  record_id text not null, -- reports.report_id OR facilities.facility_id
  uploaded_at text not null,
  url text not null,
  caption text default '',
  created_at timestamptz default now()
);
create index if not exists idx_images_record on images(record_id);

-- ---------- Settings ----------
create table if not exists settings (
  key text primary key,
  value text not null
);
-- adminPin is stored as a bcrypt hash (pgcrypto crypt/gen_salt), never plaintext,
-- and verified server-side by verify_admin_pin() / _check_admin(). We intentionally
-- seed an UNGUESSABLE random hash so there is NO usable default PIN — the admin must
-- set a real one before moderation works:
--   update settings set value = crypt('YOUR_REAL_PIN', gen_salt('bf')) where key = 'adminPin';
insert into settings (key, value) values ('adminPin', crypt(gen_random_uuid()::text, gen_salt('bf')))
  on conflict (key) do nothing;
insert into settings (key, value) values ('appName', 'Paunawa')
  on conflict (key) do nothing;
-- Optional strict image-URL allowlist. When non-empty, uploaded image URLs must
-- start with this exact prefix (set it to your project's public bucket URL, e.g.
-- https://<ref>.supabase.co/storage/v1/object/public/report-images/). When empty,
-- _valid_image_url() falls back to a generic supabase.co/report-images pattern.
insert into settings (key, value) values ('storageUrlPrefix', '')
  on conflict (key) do nothing;

-- ---------- Seed sample facilities ----------
insert into facilities (facility_id, name, type, lat, lng, capacity, contact, description, submitted_by, editor_id, "timestamp", last_updated)
values
  ('FAC-0001', 'City Central Evacuation Center', 'evacuation', 14.6091, 121.0223, '500', '+63-000-0000', 'Primary evacuation site for flood-prone barangays.', 'System', 'system', now()::text, now()::text),
  ('FAC-0002', 'General Hospital', 'hospital', 14.6042, 121.0198, '', '+63-000-1111', '', 'System', 'system', now()::text, now()::text)
on conflict (facility_id) do nothing;

-- ============================================================
-- Row Level Security
-- Public (anon) can READ non-hidden rows directly.
-- Public CANNOT write directly — all writes go through the
-- SECURITY DEFINER functions in functions.sql, which run with
-- elevated privileges and enforce the audit-trail logic, mirroring
-- how only Code.gs (not the raw Sheet) could be written to before.
-- ============================================================

alter table reports enable row level security;
alter table facilities enable row level security;
alter table updates enable row level security;
alter table ratings enable row level security;
alter table users enable row level security;
alter table blockchain enable row level security;
alter table images enable row level security;
alter table settings enable row level security;
-- upvotes: no policies at all, so anon can neither read nor write it directly.
-- Only the SECURITY DEFINER upvote_* functions touch it.
alter table upvotes enable row level security;

create policy "public read non-hidden reports" on reports
  for select using (hidden = false);

create policy "public read non-hidden facilities" on facilities
  for select using (hidden = false);

create policy "public read updates" on updates
  for select using (true);

create policy "public read ratings" on ratings
  for select using (true);

create policy "public read users" on users
  for select using (true);

create policy "public read blockchain" on blockchain
  for select using (true);

create policy "public read images" on images
  for select using (true);

-- Settings is intentionally NOT readable by anon (contains adminPin).
-- verify_admin_pin() is a SECURITY DEFINER function that checks it
-- server-side without ever exposing the value to the client.
