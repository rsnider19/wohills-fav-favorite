-- Geofence polygon (follow-up to M3): the contest area is the neighborhood's real
-- shape, not a rectangle. See docs/milestones/geofence-polygon.md.
--
-- The four geofence_* box columns stay: they now hold the polygon's bounding box
-- (the lights map uses them for its pan limit and fallback view) and make a cheap
-- first check. geofence_polygon is the shape itself, an array of [lat, lng] pairs
-- (open or closed ring, at least 3 vertices). When it is null the box alone
-- applies, exactly as before.
--
-- Source of truth: supabase/geofence/worthington-hills.geojson (a GeoJSON Polygon,
-- [lng, lat] order, the union of the Worthington Hills, Village, North and Woods of
-- North outlines grown 30 m for geocoder drift). The vertices below are the same
-- numbers swapped to [lat, lng]; a unit test keeps the two in step. Change the live
-- shape with `contest-admin --contest lights` (GEOFENCE_POLYGON=...), not in a migration.

alter table lights.settings add column geofence_polygon jsonb;

-- Immutable so a check constraint can use it. Null is fine (no polygon). Otherwise:
-- an array of >= 3 vertices, each an array of exactly two numbers (lat in -90..90, lng
-- in -180..180, and never a nonzero value so small that in_geofence's float8 cast would
-- underflow and raise, e.g. 1e-400). Nested CASEs, because SQL doesn't promise AND
-- short-circuits and a cast of a non-number would otherwise raise instead of returning false.
create function lights.geofence_polygon_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then true
    when jsonb_typeof(p) <> 'array' then false
    when jsonb_array_length(p) < 3 then false
    else not exists (
      select 1
      from jsonb_array_elements(p) as v(e)
      where case
        when jsonb_typeof(v.e) <> 'array' then true
        when jsonb_array_length(v.e) <> 2 then true
        when jsonb_typeof(v.e -> 0) <> 'number' or jsonb_typeof(v.e -> 1) <> 'number' then true
        else not (
          (v.e ->> 0)::numeric between -90 and 90 and (v.e ->> 1)::numeric between -180 and 180
          and ((v.e ->> 0)::numeric = 0 or abs((v.e ->> 0)::numeric) >= 1e-300)
          and ((v.e ->> 1)::numeric = 0 or abs((v.e ->> 1)::numeric) >= 1e-300)
        )
      end
    )
  end
$$;

-- Same rule as every lights function: nothing executable by PUBLIC. Constraints run as the
-- writer (service role or the owner), and service_role has execute from the default privileges.
revoke execute on function lights.geofence_polygon_valid(jsonb) from public;

alter table lights.settings
  add constraint geofence_polygon_valid check (lights.geofence_polygon_valid(geofence_polygon));

update lights.settings set
  geofence_min_lat = 40.1179,
  geofence_max_lat = 40.13877,
  geofence_min_lng = -83.06427,
  geofence_max_lng = -83.03402,
  geofence_polygon = '[[40.13877,-83.06391],[40.1387,-83.06416],[40.13845,-83.06427],[40.13772,-83.06346],[40.13586,-83.0627],[40.13211,-83.06175],[40.12027,-83.05928],[40.12018,-83.05904],[40.11955,-83.04245],[40.11833,-83.04244],[40.11812,-83.04217],[40.1179,-83.03435],[40.11805,-83.03402],[40.11946,-83.03413],[40.12202,-83.03571],[40.12409,-83.03616],[40.12635,-83.03629],[40.12846,-83.03611],[40.12866,-83.0362],[40.12921,-83.03904],[40.129,-83.04034],[40.12913,-83.04154],[40.13155,-83.04146],[40.13174,-83.04156],[40.13182,-83.04173],[40.13223,-83.05573],[40.13462,-83.05564],[40.13479,-83.05589],[40.13484,-83.0572],[40.13802,-83.05707],[40.13821,-83.05717],[40.13829,-83.05741],[40.13836,-83.05942],[40.13854,-83.05955],[40.13862,-83.05979],[40.13877,-83.06391]]'::jsonb;

-- Box AND, when there is a polygon, point-in-polygon by ray casting (even-odd rule) in
-- float8: the same arithmetic, in the same order, as inGeofence() in apps/lights/src/lib/geo.ts
-- and supabase/functions/geocode/census.ts, so the site, the geocoder and RLS agree to the bit,
-- edges and vertices included (a point exactly on an edge may fall either way; the 30 m
-- growth makes that moot). An open or closed ring both work: the edge from the last vertex
-- back to the first is zero-length on a closed ring, and a horizontal edge never counts.
--
-- Not Postgres's native `polygon @> point`: its on-edge test compares a cross product (in
-- degrees squared) against a fixed 1e-6, so at neighborhood scale it counts points up to
-- ~35 m outside an edge as "on the boundary", hence inside (found in review).
--
-- Same signature, volatility and grants as before, so the RLS policies that call it are
-- unchanged. The CASE keeps the division away from horizontal edges (SQL doesn't promise
-- AND short-circuits).
create or replace function lights.in_geofence(p_lat double precision, p_lng double precision)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    p_lat between s.geofence_min_lat and s.geofence_max_lat
      and p_lng between s.geofence_min_lng and s.geofence_max_lng
      and (
        s.geofence_polygon is null
        or (
          select count(*) filter (where
            case
              when (e.lat > p_lat) <> (e.prev_lat > p_lat)
                then p_lng < (e.prev_lng - e.lng) * (p_lat - e.lat) / (e.prev_lat - e.lat) + e.lng
              else false
            end
          ) % 2 = 1
          from (
            select
              (v.e ->> 0)::double precision as lat,
              (v.e ->> 1)::double precision as lng,
              (coalesce(lag(v.e) over w, s.geofence_polygon -> -1) ->> 0)::double precision as prev_lat,
              (coalesce(lag(v.e) over w, s.geofence_polygon -> -1) ->> 1)::double precision as prev_lng
            from jsonb_array_elements(s.geofence_polygon) with ordinality as v(e, n)
            window w as (order by v.n)
          ) as e
        )
      ),
    false
  )
  from lights.settings s
$$;
