-- ============================================================
-- Paunawa — Supabase Storage policies
--
-- Run this AFTER creating the "report-images" bucket via the
-- Dashboard (Storage → New bucket → name it exactly "report-images",
-- toggle "Public bucket" ON). See docs/SUPABASE_SETUP.md step 5.
-- ============================================================

create policy "public upload to report-images"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'report-images');

create policy "public read report-images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'report-images');

-- Optional: allow the original uploader to delete/replace their own
-- image later. Skipped here since uploads are anonymous (no stable
-- ownership to check) — the app instead replaces image rows via
-- update_report()/update_facility(), and old Storage files are simply
-- left orphaned. If storage usage becomes a concern, periodically
-- clean up files not referenced in the "images" table.
