-- ============================================================
-- Paunawa — Supabase RPC functions
-- Run this AFTER schema.sql, in the same SQL Editor.
--
-- These functions replace what Code.gs + Reports.gs + Facilities.gs +
-- Ratings.gs + Blockchain.gs + Utils.gs used to do. Each is called from
-- the frontend via supabase.rpc('function_name', {...}) instead of a
-- fetch() to an Apps Script URL.
--
-- They are SECURITY DEFINER, meaning they run with the privileges of
-- the function owner (not the anonymous caller), which is how they're
-- allowed to write to tables that Row Level Security otherwise blocks
-- direct anon writes to. This mirrors the old setup where only Code.gs
-- (not the raw Sheet) could be written to.
-- ============================================================

-- ---------- Internal helpers (not directly callable by clients) ----------

create or replace function _generate_id(prefix text) returns text
language plpgsql as $$
begin
  return prefix || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
end;
$$;

create or replace function _now_iso() returns text
language plpgsql as $$
begin
  return to_char(timezone('utc', clock_timestamp()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
end;
$$;

-- Neutralize spreadsheet/formula-injection-style leading characters,
-- kept as a safety habit even though this is now a real database.
create or replace function _sanitize(p text) returns text
language plpgsql as $$
declare
  v text := trim(p);
begin
  if v ~ '^[=+\-@]' then
    v := '''' || v;
  end if;
  return v;
end;
$$;

-- Raise 'Unauthorized' unless p_pin matches the bcrypt-hashed admin PIN in
-- settings. SECURITY DEFINER so it can read settings (which anon cannot select).
-- Called at the top of every moderation function so the PIN check happens
-- server-side, not just in the UI.
create or replace function _check_admin(p_pin text) returns void
language plpgsql security definer as $$
declare
  v_stored text;
begin
  select value into v_stored from settings where key = 'adminPin';
  if v_stored is null or p_pin is null or v_stored <> crypt(p_pin, v_stored) then
    raise exception 'Unauthorized';
  end if;
end;
$$;

-- Only accept image URLs that point at this project's public storage bucket.
-- If settings.storageUrlPrefix is set, require an exact prefix match; otherwise
-- fall back to a generic supabase.co / report-images pattern. Blocks direct RPC
-- callers from injecting arbitrary external URLs into the images table.
create or replace function _valid_image_url(p_url text) returns boolean
language plpgsql security definer as $$
declare
  v_prefix text;
begin
  if p_url is null then return false; end if;
  select value into v_prefix from settings where key = 'storageUrlPrefix';
  if v_prefix is not null and length(v_prefix) > 0 then
    return left(p_url, length(v_prefix)) = v_prefix;
  end if;
  return p_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/report-images/';
end;
$$;

-- Server-side enum allowlists (mirror CONFIG.EMERGENCY_TYPES / STATUS / FACILITIES
-- in js/config.js). Enforced in create/update so a direct RPC call can't bypass
-- the client's dropdowns.
create or replace function _is_valid_report_type(t text) returns boolean
language sql immutable as $$
  select t = any (array['flood','earthquake','conflict','fire','landslide','storm','other']);
$$;

create or replace function _is_valid_status(s text) returns boolean
language sql immutable as $$
  select s = any (array['Active','Monitoring','Resolved']);
$$;

create or replace function _is_valid_facility_type(t text) returns boolean
language sql immutable as $$
  select t = any (array['evacuation','hospital','other']);
$$;

-- Reject if any element of a jsonb image array is not a valid bucket URL.
create or replace function _assert_valid_images(p_images jsonb) returns void
language plpgsql as $$
begin
  if p_images is null then return; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_images) as img
    where not _valid_image_url(img)
  ) then
    raise exception 'Invalid image URL';
  end if;
end;
$$;

-- Append one block to the hash chain for a report or facility.
-- record_id is generic: a reports.report_id OR a facilities.facility_id.
create or replace function _append_block(p_record_id text, p_action text, p_editor_id text, p_payload_text text)
returns table(previous_hash text, current_hash text, ts text)
language plpgsql as $$
declare
  v_prev text;
  v_ts text := _now_iso();
  v_block_string text;
  v_hash text;
begin
  select b.current_hash into v_prev from blockchain b where b.record_id = p_record_id order by b.id desc limit 1;
  if v_prev is null then v_prev := 'GENESIS'; end if;

  v_block_string := v_prev || '|' || p_record_id || '|' || p_action || '|' || coalesce(p_editor_id, 'anonymous') || '|' || v_ts || '|' || p_payload_text;
  v_hash := encode(digest(v_block_string, 'sha256'), 'hex');

  insert into blockchain(block_id, record_id, action, editor_id, "timestamp", previous_hash, current_hash, payload_snapshot)
  values (_generate_id('BLK'), p_record_id, p_action, coalesce(p_editor_id, 'anonymous'), v_ts, v_prev, v_hash, p_payload_text);

  return query select v_prev, v_hash, v_ts;
end;
$$;

-- ============================================================
-- Reports
-- ============================================================

create or replace function create_report(p_report jsonb) returns reports
language plpgsql security definer as $$
declare
  v_report_id text := coalesce(p_report->>'reportId', _generate_id('RPT'));
  v_now text := _now_iso();
  v_row reports;
  v_payload text;
  v_desc text := coalesce(p_report->>'description', '');
begin
  -- Server-side validation (client checks are UX only; this is the real gate).
  if not _is_valid_report_type(p_report->>'type') then
    raise exception 'Invalid report type';
  end if;
  if (p_report->>'lat')::double precision not between -90 and 90
     or (p_report->>'lng')::double precision not between -180 and 180 then
    raise exception 'Coordinates out of range';
  end if;
  if length(trim(v_desc)) < 10 or length(v_desc) > 1000 then
    raise exception 'Description must be 10-1000 characters';
  end if;
  perform _assert_valid_images(p_report->'images');

  insert into reports(report_id, "timestamp", last_updated, type, status, lat, lng, description, reporter_alias, editor_id, image_count)
  values (
    v_report_id,
    coalesce(p_report->>'timestamp', v_now),
    v_now,
    p_report->>'type',
    'Active',
    (p_report->>'lat')::double precision,
    (p_report->>'lng')::double precision,
    _sanitize(p_report->>'description'),
    coalesce(p_report->>'reporterAlias', 'Anonymous'),
    coalesce(p_report->>'editorId', 'anonymous'),
    coalesce(jsonb_array_length(p_report->'images'), 0)
  )
  returning * into v_row;

  if p_report ? 'images' then
    insert into images(image_id, record_id, uploaded_at, url, caption)
    select _generate_id('IMG'), v_report_id, v_now, img, 'photo'
    from jsonb_array_elements_text(p_report->'images') as img;
  end if;

  v_payload := jsonb_build_object('type', v_row.type, 'description', v_row.description, 'lat', v_row.lat, 'lng', v_row.lng)::text;
  perform _append_block(v_report_id, 'CREATE', v_row.editor_id, v_payload);

  return v_row;
end;
$$;

create or replace function update_report(p_report_id text, p_changes jsonb, p_editor_id text, p_editor_alias text)
returns reports
language plpgsql security definer as $$
declare
  v_existing reports;
  v_now text := _now_iso();
  v_payload jsonb := '{}'::jsonb;
  v_row reports;
  v_new_text text;
begin
  select * into v_existing from reports where report_id = p_report_id;
  if not found then raise exception 'Report not found.'; end if;

  -- Validate any fields being changed (mirrors create_report).
  if p_changes ? 'type' and not _is_valid_report_type(p_changes->>'type') then
    raise exception 'Invalid report type';
  end if;
  if p_changes ? 'status' and not _is_valid_status(p_changes->>'status') then
    raise exception 'Invalid status';
  end if;
  if p_changes ? 'lat' and (p_changes->>'lat')::double precision not between -90 and 90 then
    raise exception 'Latitude out of range';
  end if;
  if p_changes ? 'lng' and (p_changes->>'lng')::double precision not between -180 and 180 then
    raise exception 'Longitude out of range';
  end if;
  if p_changes ? 'description'
     and (length(trim(p_changes->>'description')) < 10 or length(p_changes->>'description') > 1000) then
    raise exception 'Description must be 10-1000 characters';
  end if;
  perform _assert_valid_images(p_changes->'images');

  if p_changes ? 'description' and (p_changes->>'description') is distinct from v_existing.description then
    v_new_text := _sanitize(p_changes->>'description');
    insert into updates(update_id, record_id, "timestamp", editor_id, editor_alias, field_changed, old_value, new_value)
    values (_generate_id('UPD'), p_report_id, v_now, coalesce(p_editor_id, 'anonymous'), coalesce(p_editor_alias, 'Anonymous'), 'description', v_existing.description, v_new_text);
    update reports set description = v_new_text where report_id = p_report_id;
    v_payload := v_payload || jsonb_build_object('description', v_new_text);
  end if;

  if p_changes ? 'type' and (p_changes->>'type') is distinct from v_existing.type then
    insert into updates(update_id, record_id, "timestamp", editor_id, editor_alias, field_changed, old_value, new_value)
    values (_generate_id('UPD'), p_report_id, v_now, coalesce(p_editor_id, 'anonymous'), coalesce(p_editor_alias, 'Anonymous'), 'type', v_existing.type, p_changes->>'type');
    update reports set type = p_changes->>'type' where report_id = p_report_id;
    v_payload := v_payload || jsonb_build_object('type', p_changes->>'type');
  end if;

  if p_changes ? 'status' and (p_changes->>'status') is distinct from v_existing.status then
    insert into updates(update_id, record_id, "timestamp", editor_id, editor_alias, field_changed, old_value, new_value)
    values (_generate_id('UPD'), p_report_id, v_now, coalesce(p_editor_id, 'anonymous'), coalesce(p_editor_alias, 'Anonymous'), 'status', v_existing.status, p_changes->>'status');
    update reports set status = p_changes->>'status' where report_id = p_report_id;
    v_payload := v_payload || jsonb_build_object('status', p_changes->>'status');
  end if;

  if p_changes ? 'lat' and (p_changes->>'lat')::double precision is distinct from v_existing.lat then
    insert into updates(update_id, record_id, "timestamp", editor_id, editor_alias, field_changed, old_value, new_value)
    values (_generate_id('UPD'), p_report_id, v_now, coalesce(p_editor_id, 'anonymous'), coalesce(p_editor_alias, 'Anonymous'), 'lat', v_existing.lat::text, p_changes->>'lat');
    update reports set lat = (p_changes->>'lat')::double precision where report_id = p_report_id;
    v_payload := v_payload || jsonb_build_object('lat', (p_changes->>'lat')::double precision);
  end if;

  if p_changes ? 'lng' and (p_changes->>'lng')::double precision is distinct from v_existing.lng then
    insert into updates(update_id, record_id, "timestamp", editor_id, editor_alias, field_changed, old_value, new_value)
    values (_generate_id('UPD'), p_report_id, v_now, coalesce(p_editor_id, 'anonymous'), coalesce(p_editor_alias, 'Anonymous'), 'lng', v_existing.lng::text, p_changes->>'lng');
    update reports set lng = (p_changes->>'lng')::double precision where report_id = p_report_id;
    v_payload := v_payload || jsonb_build_object('lng', (p_changes->>'lng')::double precision);
  end if;

  update reports set last_updated = v_now where report_id = p_report_id;

  if p_changes ? 'images' then
    delete from images where record_id = p_report_id;
    insert into images(image_id, record_id, uploaded_at, url, caption)
    select _generate_id('IMG'), p_report_id, v_now, img, 'photo'
    from jsonb_array_elements_text(p_changes->'images') as img;
    update reports set image_count = jsonb_array_length(p_changes->'images') where report_id = p_report_id;
  end if;

  perform _append_block(p_report_id, 'UPDATE', coalesce(p_editor_id, 'anonymous'), v_payload::text);

  select * into v_row from reports where report_id = p_report_id;
  return v_row;
end;
$$;

create or replace function upvote_report(p_report_id text, p_user_id text) returns jsonb
language plpgsql security definer as $$
declare
  v_uid text := coalesce(p_user_id, 'anonymous');
  v_rows int;
  v_new int;
begin
  perform 1 from reports where report_id = p_report_id;
  if not found then raise exception 'Report not found.'; end if;

  -- One upvote per (report, user): the ledger insert is a no-op on repeat.
  insert into upvotes(record_id, user_id) values (p_report_id, v_uid)
  on conflict (record_id, user_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    update reports set upvotes = upvotes + 1 where report_id = p_report_id returning upvotes into v_new;
    perform _append_block(p_report_id, 'UPVOTE', v_uid, jsonb_build_object('upvotes', v_new)::text);
  else
    select upvotes into v_new from reports where report_id = p_report_id;
  end if;

  return jsonb_build_object('upvotes', v_new, 'counted', (v_rows > 0));
end;
$$;

-- Drop the old unauthenticated 4-arg signature. `create or replace` with a new
-- argument list would ADD an overload, leaving the vulnerable version callable.
drop function if exists moderate_report(text, text, text, text);

create or replace function moderate_report(p_report_id text, p_moderator_id text, p_action text, p_reason text, p_pin text) returns reports
language plpgsql security definer as $$
declare
  v_row reports;
begin
  perform _check_admin(p_pin);  -- server-side authorization; raises 'Unauthorized' on bad PIN

  if p_action = 'hide' then update reports set hidden = true where report_id = p_report_id;
  elsif p_action = 'unhide' then update reports set hidden = false where report_id = p_report_id;
  elsif p_action = 'resolve' then update reports set status = 'Resolved' where report_id = p_report_id;
  elsif p_action = 'flag' then update reports set flagged = true where report_id = p_report_id;
  elsif p_action = 'unflag' then update reports set flagged = false where report_id = p_report_id;
  else raise exception 'Unknown moderation action: %', p_action;
  end if;

  update reports set last_updated = _now_iso() where report_id = p_report_id;

  select * into v_row from reports where report_id = p_report_id;
  if not found then raise exception 'Report not found.'; end if;

  perform _append_block(p_report_id, 'MODERATE:' || p_action, coalesce(p_moderator_id, 'admin'), jsonb_build_object('reason', coalesce(p_reason, ''), 'action', p_action)::text);

  return v_row;
end;
$$;

-- ============================================================
-- Ratings
-- ============================================================

create or replace function submit_rating(p_report_id text, p_user_id text, p_ratings jsonb) returns jsonb
language plpgsql security definer as $$
declare
  v_acc int := greatest(1, least(5, coalesce((p_ratings->>'accuracy')::int, 3)));
  v_auth int := greatest(1, least(5, coalesce((p_ratings->>'authenticity')::int, 3)));
  v_use int := greatest(1, least(5, coalesce((p_ratings->>'usefulness')::int, 3)));
  v_avg_acc numeric; v_avg_auth numeric; v_avg_use numeric;
begin
  -- One rating row per (report, user): re-submitting revises the existing
  -- rating rather than piling on and skewing the average.
  insert into ratings(rating_id, report_id, user_id, accuracy, authenticity, usefulness, "timestamp")
  values (_generate_id('RTG'), p_report_id, coalesce(p_user_id, 'anonymous'), v_acc, v_auth, v_use, _now_iso())
  on conflict (report_id, user_id) do update
    set accuracy = excluded.accuracy,
        authenticity = excluded.authenticity,
        usefulness = excluded.usefulness,
        "timestamp" = excluded."timestamp";

  select avg(accuracy), avg(authenticity), avg(usefulness)
  into v_avg_acc, v_avg_auth, v_avg_use
  from ratings where report_id = p_report_id;

  update reports
  set avg_accuracy = round(v_avg_acc, 1), avg_authenticity = round(v_avg_auth, 1), avg_usefulness = round(v_avg_use, 1)
  where report_id = p_report_id;

  perform _append_block(p_report_id, 'RATE', coalesce(p_user_id, 'anonymous'), p_ratings::text);

  return jsonb_build_object('success', true);
end;
$$;

-- ============================================================
-- Facilities
-- ============================================================

create or replace function create_facility(p_facility jsonb) returns facilities
language plpgsql security definer as $$
declare
  v_facility_id text := coalesce(p_facility->>'facilityId', _generate_id('FAC'));
  v_now text := _now_iso();
  v_row facilities;
  v_payload text;
  v_name text := coalesce(p_facility->>'name', '');
begin
  if not _is_valid_facility_type(p_facility->>'type') then
    raise exception 'Invalid facility type';
  end if;
  if length(trim(v_name)) < 2 or length(v_name) > 200 then
    raise exception 'Facility name must be 2-200 characters';
  end if;
  if (p_facility->>'lat')::double precision not between -90 and 90
     or (p_facility->>'lng')::double precision not between -180 and 180 then
    raise exception 'Coordinates out of range';
  end if;
  perform _assert_valid_images(p_facility->'images');

  insert into facilities(facility_id, name, type, lat, lng, capacity, contact, description, submitted_by, editor_id, image_count, "timestamp", last_updated)
  values (
    v_facility_id,
    _sanitize(p_facility->>'name'),
    p_facility->>'type',
    (p_facility->>'lat')::double precision,
    (p_facility->>'lng')::double precision,
    coalesce(p_facility->>'capacity', ''),
    coalesce(p_facility->>'contact', ''),
    case when p_facility->>'description' is not null then _sanitize(p_facility->>'description') else '' end,
    coalesce(p_facility->>'submittedBy', 'Anonymous'),
    coalesce(p_facility->>'editorId', 'anonymous'),
    coalesce(jsonb_array_length(p_facility->'images'), 0),
    v_now, v_now
  )
  returning * into v_row;

  if p_facility ? 'images' then
    insert into images(image_id, record_id, uploaded_at, url, caption)
    select _generate_id('IMG'), v_facility_id, v_now, img, 'photo'
    from jsonb_array_elements_text(p_facility->'images') as img;
  end if;

  v_payload := jsonb_build_object('name', v_row.name, 'type', v_row.type, 'lat', v_row.lat, 'lng', v_row.lng)::text;
  perform _append_block(v_facility_id, 'CREATE_FACILITY', v_row.editor_id, v_payload);

  return v_row;
end;
$$;

create or replace function update_facility(p_facility_id text, p_changes jsonb, p_editor_id text, p_editor_alias text)
returns facilities
language plpgsql security definer as $$
declare
  v_existing facilities;
  v_now text := _now_iso();
  v_payload jsonb := '{}'::jsonb;
  v_row facilities;
  v_new_text text;
begin
  select * into v_existing from facilities where facility_id = p_facility_id;
  if not found then raise exception 'Facility not found.'; end if;

  if p_changes ? 'type' and not _is_valid_facility_type(p_changes->>'type') then
    raise exception 'Invalid facility type';
  end if;
  if p_changes ? 'name'
     and (length(trim(p_changes->>'name')) < 2 or length(p_changes->>'name') > 200) then
    raise exception 'Facility name must be 2-200 characters';
  end if;
  if p_changes ? 'lat' and (p_changes->>'lat')::double precision not between -90 and 90 then
    raise exception 'Latitude out of range';
  end if;
  if p_changes ? 'lng' and (p_changes->>'lng')::double precision not between -180 and 180 then
    raise exception 'Longitude out of range';
  end if;
  perform _assert_valid_images(p_changes->'images');

  if p_changes ? 'name' and (p_changes->>'name') is distinct from v_existing.name then
    v_new_text := _sanitize(p_changes->>'name');
    insert into updates(update_id, record_id, "timestamp", editor_id, editor_alias, field_changed, old_value, new_value)
    values (_generate_id('UPD'), p_facility_id, v_now, coalesce(p_editor_id, 'anonymous'), coalesce(p_editor_alias, 'Anonymous'), 'name', v_existing.name, v_new_text);
    update facilities set name = v_new_text where facility_id = p_facility_id;
    v_payload := v_payload || jsonb_build_object('name', v_new_text);
  end if;

  if p_changes ? 'type' and (p_changes->>'type') is distinct from v_existing.type then
    insert into updates(update_id, record_id, "timestamp", editor_id, editor_alias, field_changed, old_value, new_value)
    values (_generate_id('UPD'), p_facility_id, v_now, coalesce(p_editor_id, 'anonymous'), coalesce(p_editor_alias, 'Anonymous'), 'type', v_existing.type, p_changes->>'type');
    update facilities set type = p_changes->>'type' where facility_id = p_facility_id;
    v_payload := v_payload || jsonb_build_object('type', p_changes->>'type');
  end if;

  if p_changes ? 'capacity' and (p_changes->>'capacity') is distinct from v_existing.capacity then
    insert into updates(update_id, record_id, "timestamp", editor_id, editor_alias, field_changed, old_value, new_value)
    values (_generate_id('UPD'), p_facility_id, v_now, coalesce(p_editor_id, 'anonymous'), coalesce(p_editor_alias, 'Anonymous'), 'capacity', v_existing.capacity, p_changes->>'capacity');
    update facilities set capacity = p_changes->>'capacity' where facility_id = p_facility_id;
    v_payload := v_payload || jsonb_build_object('capacity', p_changes->>'capacity');
  end if;

  if p_changes ? 'contact' and (p_changes->>'contact') is distinct from v_existing.contact then
    insert into updates(update_id, record_id, "timestamp", editor_id, editor_alias, field_changed, old_value, new_value)
    values (_generate_id('UPD'), p_facility_id, v_now, coalesce(p_editor_id, 'anonymous'), coalesce(p_editor_alias, 'Anonymous'), 'contact', v_existing.contact, p_changes->>'contact');
    update facilities set contact = p_changes->>'contact' where facility_id = p_facility_id;
    v_payload := v_payload || jsonb_build_object('contact', p_changes->>'contact');
  end if;

  if p_changes ? 'description' and (p_changes->>'description') is distinct from v_existing.description then
    v_new_text := _sanitize(p_changes->>'description');
    insert into updates(update_id, record_id, "timestamp", editor_id, editor_alias, field_changed, old_value, new_value)
    values (_generate_id('UPD'), p_facility_id, v_now, coalesce(p_editor_id, 'anonymous'), coalesce(p_editor_alias, 'Anonymous'), 'description', v_existing.description, v_new_text);
    update facilities set description = v_new_text where facility_id = p_facility_id;
    v_payload := v_payload || jsonb_build_object('description', v_new_text);
  end if;

  if p_changes ? 'lat' and (p_changes->>'lat')::double precision is distinct from v_existing.lat then
    update facilities set lat = (p_changes->>'lat')::double precision where facility_id = p_facility_id;
    v_payload := v_payload || jsonb_build_object('lat', (p_changes->>'lat')::double precision);
  end if;

  if p_changes ? 'lng' and (p_changes->>'lng')::double precision is distinct from v_existing.lng then
    update facilities set lng = (p_changes->>'lng')::double precision where facility_id = p_facility_id;
    v_payload := v_payload || jsonb_build_object('lng', (p_changes->>'lng')::double precision);
  end if;

  update facilities set last_updated = v_now where facility_id = p_facility_id;

  if p_changes ? 'images' then
    delete from images where record_id = p_facility_id;
    insert into images(image_id, record_id, uploaded_at, url, caption)
    select _generate_id('IMG'), p_facility_id, v_now, img, 'photo'
    from jsonb_array_elements_text(p_changes->'images') as img;
    update facilities set image_count = jsonb_array_length(p_changes->'images') where facility_id = p_facility_id;
  end if;

  perform _append_block(p_facility_id, 'UPDATE_FACILITY', coalesce(p_editor_id, 'anonymous'), v_payload::text);

  select * into v_row from facilities where facility_id = p_facility_id;
  return v_row;
end;
$$;

create or replace function upvote_facility(p_facility_id text, p_user_id text) returns jsonb
language plpgsql security definer as $$
declare
  v_uid text := coalesce(p_user_id, 'anonymous');
  v_rows int;
  v_new int;
begin
  perform 1 from facilities where facility_id = p_facility_id;
  if not found then raise exception 'Facility not found.'; end if;

  insert into upvotes(record_id, user_id) values (p_facility_id, v_uid)
  on conflict (record_id, user_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    update facilities set upvotes = upvotes + 1 where facility_id = p_facility_id returning upvotes into v_new;
    perform _append_block(p_facility_id, 'UPVOTE_FACILITY', v_uid, jsonb_build_object('upvotes', v_new)::text);
  else
    select upvotes into v_new from facilities where facility_id = p_facility_id;
  end if;

  return jsonb_build_object('upvotes', v_new, 'counted', (v_rows > 0));
end;
$$;

drop function if exists moderate_facility(text, text, text, text);

create or replace function moderate_facility(p_facility_id text, p_moderator_id text, p_action text, p_reason text, p_pin text) returns facilities
language plpgsql security definer as $$
declare
  v_row facilities;
begin
  perform _check_admin(p_pin);  -- server-side authorization; raises 'Unauthorized' on bad PIN

  if p_action = 'hide' then update facilities set hidden = true where facility_id = p_facility_id;
  elsif p_action = 'unhide' then update facilities set hidden = false where facility_id = p_facility_id;
  elsif p_action = 'flag' then update facilities set flagged = true where facility_id = p_facility_id;
  elsif p_action = 'unflag' then update facilities set flagged = false where facility_id = p_facility_id;
  else raise exception 'Unknown moderation action: %', p_action;
  end if;

  update facilities set last_updated = _now_iso() where facility_id = p_facility_id;

  select * into v_row from facilities where facility_id = p_facility_id;
  if not found then raise exception 'Facility not found.'; end if;

  perform _append_block(p_facility_id, 'MODERATE_FACILITY:' || p_action, coalesce(p_moderator_id, 'admin'), jsonb_build_object('reason', coalesce(p_reason, ''))::text);

  return v_row;
end;
$$;

-- ============================================================
-- Users
-- ============================================================

create or replace function register_user(p_user jsonb) returns users
language plpgsql security definer as $$
declare
  v_row users;
begin
  if coalesce(p_user->>'userId', '') = '' then
    raise exception 'userId is required';
  end if;
  -- First registration wins: on conflict we do NOT overwrite the alias, so a
  -- caller replaying someone else's userId cannot hijack their display name.
  insert into users(user_id, alias, created_at_iso, role, reports_submitted)
  values (p_user->>'userId', coalesce(p_user->>'alias', 'Anonymous'), _now_iso(), 'reporter', 0)
  on conflict (user_id) do nothing
  returning * into v_row;
  if not found then
    select * into v_row from users where user_id = p_user->>'userId';
  end if;
  return v_row;
end;
$$;

-- ============================================================
-- Admin
-- ============================================================

create or replace function verify_admin_pin(p_pin text) returns jsonb
language plpgsql security definer as $$
declare
  v_stored text;
begin
  select value into v_stored from settings where key = 'adminPin';
  -- adminPin is a bcrypt hash; crypt() re-hashes p_pin with the stored salt.
  return jsonb_build_object('valid', (v_stored is not null and p_pin is not null and v_stored = crypt(p_pin, v_stored)));
end;
$$;

-- ============================================================
-- Dashboard (optional server-side aggregate; the frontend also
-- computes this client-side from the full report list)
-- ============================================================

create or replace function get_dashboard_stats() returns jsonb
language plpgsql security definer as $$
declare
  v_total int; v_active int; v_monitoring int; v_resolved int;
begin
  select count(*) into v_total from reports where hidden = false;
  select count(*) into v_active from reports where hidden = false and status = 'Active';
  select count(*) into v_monitoring from reports where hidden = false and status = 'Monitoring';
  select count(*) into v_resolved from reports where hidden = false and status = 'Resolved';
  return jsonb_build_object(
    'totalReports', v_total, 'active', v_active, 'monitoring', v_monitoring,
    'resolved', v_resolved, 'generatedAt', _now_iso()
  );
end;
$$;

-- ============================================================
-- Grants — lock down internal helpers, open up the public API
-- ============================================================

revoke execute on function _generate_id(text) from public;
revoke execute on function _now_iso() from public;
revoke execute on function _sanitize(text) from public;
revoke execute on function _append_block(text, text, text, text) from public;
revoke execute on function _check_admin(text) from public;
revoke execute on function _valid_image_url(text) from public;
revoke execute on function _assert_valid_images(jsonb) from public;
revoke execute on function _is_valid_report_type(text) from public;
revoke execute on function _is_valid_status(text) from public;
revoke execute on function _is_valid_facility_type(text) from public;

grant execute on function create_report(jsonb) to anon, authenticated;
grant execute on function update_report(text, jsonb, text, text) to anon, authenticated;
grant execute on function upvote_report(text, text) to anon, authenticated;
grant execute on function moderate_report(text, text, text, text, text) to anon, authenticated;
grant execute on function submit_rating(text, text, jsonb) to anon, authenticated;
grant execute on function create_facility(jsonb) to anon, authenticated;
grant execute on function update_facility(text, jsonb, text, text) to anon, authenticated;
grant execute on function upvote_facility(text, text) to anon, authenticated;
grant execute on function moderate_facility(text, text, text, text, text) to anon, authenticated;
grant execute on function register_user(jsonb) to anon, authenticated;
grant execute on function verify_admin_pin(text) to anon, authenticated;
grant execute on function get_dashboard_stats() to anon, authenticated;
