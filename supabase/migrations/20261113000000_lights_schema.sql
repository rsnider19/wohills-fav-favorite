-- Holiday lights contest: its own `lights` schema in the shared project.
--
-- This migration only creates objects inside `lights`. The parade's `public`
-- objects are untouched; the one shared object, public.is_admin(), is only
-- called from here.
--
-- Fairness model (same contract as the parade, see packages/core/README.md):
--   * Phone-verified users only (Supabase phone OTP); one house per phone
--     (unique houses.submitted_by) and one vote per phone (votes PK user_id).
--     Every write policy also requires a phone on the caller's token
--     (lights.caller_has_phone()), so email or anonymous accounts, which cost
--     nothing to mint, can't submit or vote even if those providers are on.
--   * Every window is evaluated against the database clock inside RLS.
--   * Entries are pending until the admin approves them; only approved houses
--     are public and only approved houses can receive votes. No self-votes.
--   * Owners can edit or withdraw only before voting opens.
--   * Tallies are readable only through get_results(), only after the reveal,
--     and only for the top 3.

create schema lights;

-- Later migrations' objects in this schema get the same baseline: full access
-- for the service role, nothing for anon/authenticated until a migration
-- grants it explicitly. (Per-schema default privileges can only add, so the
-- global PUBLIC execute on functions is revoked explicitly at the end.)
alter default privileges in schema lights grant all on tables to service_role;
alter default privileges in schema lights grant all on sequences to service_role;
alter default privileges in schema lights grant execute on functions to service_role;

grant usage on schema lights to anon, authenticated, service_role;

-- Settings ---------------------------------------------------------------------
-- Single row (the check on id makes a second row impossible). Written only by
-- the service role (tools/contest-admin.mjs) or SQL; readable by everyone.
--
-- Defaults are the decided 2026 dates (America/New_York, EST = -05:00):
--   submissions Nov 28 – Dec 15 (closes at the end of Dec 15),
--   voting      Dec 8  – Dec 20 (closes at the end of Dec 20).
-- Geofence: superseded by 20261114000000_lights_geofence_polygon.sql (a confirmed polygon,
-- with these columns holding its bounding box). The M3 box draft, kept for history:
-- Worthington Hills, Columbus OH 43235.
-- The parade's streets (Candlewood, Mission Hills, Blind Brook, Shelley /
-- Tennyson, Newcomer / Copperfield / Markhaven, Blackstone) and the Worthington
-- Hills Country Club span lat 40.1223..40.1376, lng -83.0610..-83.0367 in
-- OpenStreetMap (Overpass/Nominatim, © OpenStreetMap contributors, ODbL); the
-- US Census geocoder places addresses on those streets within ~30 m of that.
-- Padded ~500 m (north to 40.1450 to take in Loch Lomond, Churchill and
-- Strathshire Hall). See docs/milestones/M3.md "Geofence". Change it with
-- `contest-admin --contest lights` (now GEOFENCE_POLYGON=...), not in a migration.
create table lights.settings (
  id boolean primary key default true check (id),
  voting_open boolean not null default true,          -- kill switch
  results_visible boolean not null default false,     -- the reveal
  voting_opens_at timestamptz,
  voting_closes_at timestamptz,
  submissions_open boolean not null default true,     -- kill switch
  submissions_open_at timestamptz,
  submissions_close_at timestamptz,
  geofence_min_lat double precision not null,
  geofence_max_lat double precision not null,
  geofence_min_lng double precision not null,
  geofence_max_lng double precision not null,
  constraint voting_window_valid check (
    voting_opens_at is null or voting_closes_at is null or voting_opens_at < voting_closes_at
  ),
  constraint submission_window_valid check (
    submissions_open_at is null or submissions_close_at is null
    or submissions_open_at < submissions_close_at
  ),
  constraint geofence_valid check (
    geofence_min_lat between -90 and 90 and geofence_max_lat between -90 and 90
    and geofence_min_lng between -180 and 180 and geofence_max_lng between -180 and 180
    and geofence_min_lat < geofence_max_lat and geofence_min_lng < geofence_max_lng
  )
);

insert into lights.settings (
  id,
  submissions_open_at, submissions_close_at,
  voting_opens_at, voting_closes_at,
  geofence_min_lat, geofence_max_lat, geofence_min_lng, geofence_max_lng
) values (
  true,
  '2026-11-28 00:00:00-05', '2026-12-16 00:00:00-05',
  '2026-12-08 00:00:00-05', '2026-12-21 00:00:00-05',
  40.1175, 40.1450, -83.0670, -83.0305
);

-- Window helpers -----------------------------------------------------------------
-- A null bound means "no restriction on that side" (same as the parade).
-- security invoker: settings is world-readable, so no definer is needed.

create function lights.submissions_are_open()
returns boolean
language sql
stable
set search_path = ''
as $$
  select s.submissions_open
     and (s.submissions_open_at is null or now() >= s.submissions_open_at)
     and (s.submissions_close_at is null or now() < s.submissions_close_at)
  from lights.settings s
$$;

create function lights.voting_is_open()
returns boolean
language sql
stable
set search_path = ''
as $$
  select s.voting_open
     and (s.voting_opens_at is null or now() >= s.voting_opens_at)
     and (s.voting_closes_at is null or now() < s.voting_closes_at)
  from lights.settings s
$$;

-- The edit lock. Owners may edit or withdraw only while submissions are open
-- AND the scheduled voting start is still in the future. It follows the
-- clock, not the voting_open kill switch, so pausing voting never unlocks
-- edits. A null voting_opens_at means voting is unrestricted from the start,
-- so owners are locked (fail closed).
create function lights.owner_edits_allowed()
returns boolean
language sql
stable
set search_path = ''
as $$
  select lights.submissions_are_open()
     and s.voting_opens_at is not null
     and now() < s.voting_opens_at
  from lights.settings s
$$;

-- True when the caller's token carries a phone number (GoTrue only puts a
-- confirmed phone there) and isn't an anonymous session. "One per phone" is
-- only as strong as this: an email or anonymous account would otherwise be a
-- free extra vote. Reads the signed JWT, like public.is_admin().
create function lights.caller_has_phone()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'phone', '') <> ''
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is false
$$;

create function lights.in_geofence(p_lat double precision, p_lng double precision)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    p_lat between s.geofence_min_lat and s.geofence_max_lat
      and p_lng between s.geofence_min_lng and s.geofence_max_lng,
    false
  )
  from lights.settings s
$$;

-- Address dedupe key. Lowercase; keep only the street line (text before the
-- first comma); drop a trailing city/state/ZIP typed without commas; strip
-- punctuation and unit markers; abbreviate common suffixes and directions.
-- "1221 Candlewood Drive, Columbus, OH 43235" and "1221 candlewood dr."
-- both become "1221 candlewood dr". Immutable, so it can back a generated
-- column.
create function lights.normalize_address(p_address text)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  abbreviations constant text[] := array[
    'drive', 'dr', 'court', 'ct', 'road', 'rd', 'lane', 'ln', 'street', 'st',
    'avenue', 'ave', 'boulevard', 'blvd', 'place', 'pl', 'circle', 'cir',
    'trail', 'trl', 'terrace', 'ter', 'parkway', 'pkwy',
    'north', 'n', 'south', 's', 'east', 'e', 'west', 'w'
  ];
  k text := lower(split_part(p_address, ',', 1));
begin
  k := btrim(regexp_replace(regexp_replace(k, '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
  k := regexp_replace(
    k, '( (columbus|worthington|powell))?( (oh|ohio))?( [0-9]{5}( [0-9]{4})?)?$', '');
  for i in 1 .. array_length(abbreviations, 1) by 2 loop
    k := regexp_replace(k, '\m' || abbreviations[i] || '\M', abbreviations[i + 1], 'g');
  end loop;
  return btrim(k);
end;
$$;

-- Houses -------------------------------------------------------------------------

create table lights.houses (
  id uuid primary key default gen_random_uuid(),
  -- Display number. Gaps after a withdrawal are fine.
  entry_number int generated always as identity unique,
  -- One house per phone: the auth user is the verified phone.
  submitted_by uuid not null unique default auth.uid()
    references auth.users (id) on delete cascade,
  address text not null check (char_length(btrim(address)) between 5 and 200),
  address_key text not null unique
    generated always as (lights.normalize_address(address)) stored,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  photo_url text not null check (photo_url ~ '^https?://' and char_length(photo_url) <= 1000),
  title text check (title is null or char_length(btrim(title)) between 1 and 60),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index houses_status_idx on lights.houses (status);

-- Votes ---------------------------------------------------------------------------
-- One row per voter. The PK on user_id is the single-vote guarantee.
create table lights.votes (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  house_id uuid not null references lights.houses (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index votes_house_id_idx on lights.votes (house_id);

-- Triggers --------------------------------------------------------------------------

-- Guards what RLS can't express (it can't compare old and new values):
--   * only the admin (or the service role / SQL) changes `status`;
--   * an owner's change to anything the public sees (address, pin, photo,
--     title) sends an approved entry back to `pending` for re-approval (a
--     hidden entry stays hidden: editing must not put it back in the queue);
--   * whenever an owner sets or changes photo_url it must be the public URL,
--     on this project, of an object they already uploaded to their own folder
--     of the `houses` bucket. The project origin comes from the token's
--     issuer (<origin>/auth/v1). A look-alike path on another host would let
--     the owner swap the image after approval, so it is refused, as is a URL
--     to an object that doesn't exist yet (it could be uploaded later);
--   * timestamps are server-set.
-- Runs as the caller (security invoker), so current_user tells API callers
-- (anon/authenticated) apart from the service role and migrations.
create function lights.houses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_api_user constant boolean := current_user in ('anon', 'authenticated');
  trusted constant boolean := not is_api_user or public.is_admin();
  photo_prefix text;
  photo_name text;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    if not trusted then
      new.status := 'pending';
    end if;
  else
    new.created_at := old.created_at;
    new.updated_at := now();
    if new.status is distinct from old.status and not trusted then
      raise exception 'only the admin can change an entry''s status'
        using errcode = '42501';
    end if;
    if not trusted and old.status = 'approved' and (
      new.address, new.lat, new.lng, new.photo_url, new.title
    ) is distinct from (
      old.address, old.lat, old.lng, old.photo_url, old.title
    ) then
      new.status := 'pending';
    end if;
  end if;

  if not trusted and (tg_op = 'INSERT' or new.photo_url is distinct from old.photo_url) then
    photo_prefix := regexp_replace(coalesce((select auth.jwt()) ->> 'iss', ''), '/auth/v1/?$', '')
                    || '/storage/v1/object/public/houses/';
    if left(new.photo_url, char_length(photo_prefix)) = photo_prefix then
      photo_name := substr(new.photo_url, char_length(photo_prefix) + 1);
    end if;
    -- Runs as the caller, so storage.objects RLS limits the lookup to their
    -- own folder anyway; the name pattern also rules out query strings,
    -- fragments, `..` and nested folders.
    if photo_prefix !~ '^https?://[^/]+/storage/'
       or photo_name is null
       or photo_name !~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$')
       or not exists (
         select 1 from storage.objects o where o.bucket_id = 'houses' and o.name = photo_name
       ) then
      raise exception 'photo_url must be a photo you uploaded to the houses bucket'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger houses_before_write
  before insert or update on lights.houses
  for each row
  execute function lights.houses_before_write();

create function lights.votes_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger votes_set_updated_at
  before update on lights.votes
  for each row
  execute function lights.votes_set_updated_at();

-- Row Level Security ------------------------------------------------------------

alter table lights.settings enable row level security;
alter table lights.houses enable row level security;
alter table lights.votes enable row level security;

create policy "settings are public"
  on lights.settings for select
  to anon, authenticated
  using (true);

-- Houses: three select policies (OR'd). Separate policies because anon can't
-- execute public.is_admin().
create policy "approved houses are public"
  on lights.houses for select
  to anon, authenticated
  using (status = 'approved');

create policy "owners read their own house"
  on lights.houses for select
  to authenticated
  using (submitted_by = (select auth.uid()));

create policy "admin reads every house"
  on lights.houses for select
  to authenticated
  using ((select public.is_admin()));

create policy "owners submit while submissions are open"
  on lights.houses for insert
  to authenticated
  with check (
    submitted_by = (select auth.uid())
    and (select lights.caller_has_phone())
    and status = 'pending'
    and (select lights.submissions_are_open())
    and lights.in_geofence(lat, lng)
  );

create policy "owners edit before voting opens"
  on lights.houses for update
  to authenticated
  using (
    submitted_by = (select auth.uid())
    and (select lights.owner_edits_allowed())
  )
  with check (
    submitted_by = (select auth.uid())
    and (select lights.owner_edits_allowed())
    and lights.in_geofence(lat, lng)
  );

create policy "admin edits any house"
  on lights.houses for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "owners withdraw before voting opens"
  on lights.houses for delete
  to authenticated
  using (
    submitted_by = (select auth.uid())
    and (select lights.owner_edits_allowed())
  );

create policy "admin deletes any house"
  on lights.houses for delete
  to authenticated
  using ((select public.is_admin()));

-- Votes: same as the parade, plus the target must be approved and not your own.
-- The houses subquery runs under the voter's RLS, which already hides pending
-- and hidden houses from them.
create policy "read own vote"
  on lights.votes for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "cast own vote while voting is open"
  on lights.votes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select lights.caller_has_phone())
    and (select lights.voting_is_open())
    and exists (
      select 1 from lights.houses h
      where h.id = house_id
        and h.status = 'approved'
        and h.submitted_by <> (select auth.uid())
    )
  );

create policy "change own vote while voting is open"
  on lights.votes for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select lights.caller_has_phone())
    and (select lights.voting_is_open())
    and exists (
      select 1 from lights.houses h
      where h.id = house_id
        and h.status = 'approved'
        and h.submitted_by <> (select auth.uid())
    )
  );

-- Results ------------------------------------------------------------------------
-- The only way to read tallies: nothing until results_visible, then the top 3
-- approved houses. Votes on hidden or pending houses never count and those
-- houses never appear. Ties break on entry_number (earlier entry first), the
-- same rule as the parade. search_path is empty and the body fully qualified.
create function lights.get_results()
returns table (
  house_id uuid,
  entry_number int,
  title text,
  address text,
  photo_url text,
  vote_count bigint,
  rank bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  select r.id, r.entry_number, r.title, r.address, r.photo_url, r.vote_count,
         row_number() over (order by r.vote_count desc, r.entry_number) as rank
  from (
    select h.id, h.entry_number, h.title, h.address, h.photo_url,
           count(v.user_id) as vote_count
    from lights.houses h
    left join lights.votes v on v.house_id = h.id
    where h.status = 'approved'
      and (select s.results_visible from lights.settings s)
    group by h.id
  ) r
  order by r.vote_count desc, r.entry_number
  limit 3;
$$;

-- Grants -------------------------------------------------------------------------
-- RLS does the real enforcement; grants are the outer fence. Column lists keep
-- server-owned columns (id, entry_number, address_key, status on insert,
-- submitted_by on update, timestamps) out of clients' hands.

grant select on lights.settings to anon, authenticated;

grant select on lights.houses to anon, authenticated;
grant insert (address, lat, lng, photo_url, title) on lights.houses to authenticated;
grant update (address, lat, lng, photo_url, title, status) on lights.houses to authenticated;
grant delete on lights.houses to authenticated;

-- upsert(onConflict: 'user_id') needs insert and update on both columns.
grant select on lights.votes to authenticated;
grant insert (user_id, house_id), update (user_id, house_id) on lights.votes to authenticated;

-- Functions: nothing for PUBLIC; only the ones RLS and the clients call.
-- Trigger functions need no grant (they are never called directly).
revoke execute on all functions in schema lights from public;
grant execute on function lights.submissions_are_open() to anon, authenticated;
grant execute on function lights.voting_is_open() to anon, authenticated;
grant execute on function lights.owner_edits_allowed() to anon, authenticated;
grant execute on function lights.in_geofence(double precision, double precision) to anon, authenticated;
grant execute on function lights.caller_has_phone() to anon, authenticated;
grant execute on function lights.normalize_address(text) to anon, authenticated;
grant execute on function lights.get_results() to anon, authenticated;
