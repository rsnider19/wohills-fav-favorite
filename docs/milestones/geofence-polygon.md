# Geofence polygon (follow-up to M3/M8)

## Goal
Replace the lights contest's rectangular geofence with the neighborhood's real shape.
The site owner asked (2026-11-14) to mimic the Google Maps outlines of four places:
Worthington Hills, Worthington Hills Village, Worthington Hills North and The Woods of
Worthington Hills North. On the big outline, the east side should follow Route 315 from
Highview Dr south, without the cutout near the Rusty Bucket.

The traced shape is in `supabase/geofence/worthington-hills.geojson`: a GeoJSON Polygon with
36 vertices in `[lng, lat]` order. It is the union of the four outlines, grown by 30 m so a
house on the edge isn't rejected when the Census geocoder places it a little off. The four
outlines were georeferenced against street intersections from OpenStreetMap. Every
reference point lands within 10 m. A map of the result is
`docs/milestones/screenshots/geofence/traced-outline.jpg`. Red is the outline, blue dashed is
the 30 m version, which is the one we use, and grey is the old box.

Its bounding box: lat 40.11790..40.13877, lng -83.06427..-83.03402.

Reference points, checked against the polygon:

| Point | lat, lng | Expected |
|---|---|---|
| Candlewood Dr | 40.1231, -83.0516 | inside |
| Fairway Dr & Oakview Dr | 40.13131, -83.05912 | inside |
| Fairway Dr & Dollivor Dr | 40.13774, -83.06033 | inside |
| Evangeline Dr & Dollivor Dr | 40.13772, -83.06239 | inside |
| Highview Dr, west end | 40.12847, -83.04337 | inside |
| Gatehouse Ln | 40.11880, -83.03800 | inside |
| Colony Way & Clubview Blvd S | 40.12235, -83.04469 | inside |
| Darrow Dr & Nimitz Dr (west of the tracks) | 40.13193, -83.06264 | outside, but inside the OLD box |
| Waco Ln & Nimitz Dr (west of the tracks) | 40.12969, -83.06217 | outside, but inside the OLD box |
| Churchill Dr & Derby Dr (north) | 40.13955, -83.06074 | outside |
| Old Woods Farm (NE) | 40.1310, -83.0400 | outside, but inside the OLD box |
| Hickory Bluff park | 40.1350, -83.0500 | outside |
| Hard Rd & Sefton Park Dr (south) | 40.11667, -83.04225 | outside |
| East of Route 315 | 40.1230, -83.0330 | outside |
| Downtown Columbus | 39.9612, -82.9988 | outside |

## Decisions
- **D1. Keep the four box columns.** The bounding-box columns
  (`geofence_min_lat` … `geofence_max_lng`) stay, holding the polygon's bounding box. The map
  uses them for its pan limit and fallback view, and they make a cheap first check. Add a
  nullable `lights.settings.geofence_polygon jsonb`: an array of `[lat, lng]` pairs with at
  least 3 vertices. The ring may be closed or not; code must accept both. When it is null,
  the box alone applies, so behavior is exactly as before.
- **D2. One new migration; don't edit old ones.** Add
  `supabase/migrations/20261114000000_lights_geofence_polygon.sql`. It:
  1. adds the column, with a check constraint that rejects malformed values (see D3);
  2. sets the settings row's polygon to the vertices of the GeoJSON file above, swapped to
     `[lat, lng]`, and its box columns to that bounding box;
  3. redefines `lights.in_geofence(p_lat, p_lng)` (`create or replace`, same signature,
     `stable`, `set search_path = ''`, grants unchanged) as the box check AND, when the
     polygon is not null, a point-in-polygon test.

  Use Postgres's native geometric types (`polygon @> point`, with point = `(lng, lat)`), or a
  plain ray-casting SQL function. Either is fine; say which and why. The RLS policies that
  call `in_geofence` must not need changing.

  Hosted Supabase has never had the `lights` schema, so a new migration that runs after M3's
  is the right shape. Update the comments in the M3 migration's geofence block only if they
  would now mislead; prefer a comment in the new migration.
- **D3. Validation.** Use an immutable helper, e.g. `lights.geofence_polygon_valid(jsonb)`,
  for the check constraint. Null is OK. Otherwise the value must be:
  - a JSON array of at least 3 elements;
  - each element an array of exactly 2 numbers, with lat in −90..90 and lng in −180..180;
  - not wider than the box columns is NOT required.
- **D4. Source of truth.** `supabase/geofence/worthington-hills.geojson` is the shape. The
  migration embeds the same numbers. Add one automated check that they match, e.g. a node
  unit test under `tools/` or `apps/lights` that reads both files.
- **D5. `tools/contest-admin.mjs --contest lights`.**
  - Add `GEOFENCE_POLYGON=<path to a GeoJSON Polygon/Feature file>`. It sets
    `geofence_polygon` and derives the four box columns from it, in one update.
  - `GEOFENCE=minLat,maxLat,minLng,maxLng` keeps working, sets the box and clears the
    polygon (null), and the tool says so.
  - Setting both at once is an error.
  - Status output shows `geofence  polygon (N vertices) in lat a..b, lng c..d`, or
    `box lat … lng …` when there is no polygon.
  - Keep the tool's existing local/remote guard behavior exactly as is.
- **D6. Edge Function `supabase/functions/geocode`.** Read `geofence_polygon` with the box.
  `toGeofence` returns the box plus an optional polygon, and "inside" means inside the box AND,
  if present, the polygon. Keep the existing `geofence_unavailable` behavior when settings
  can't be read, and extend `census.test.ts`.
- **D7. Lights app.**
  - `types.ts` gets `geofence_polygon: [number, number][] | null`.
  - `phase.ts` adds it to the settings `select` list. `DEFAULT_LIGHTS_SETTINGS` uses the new
    bounding box and the same polygon, imported from the GeoJSON file or a small generated
    TS module. Keep the bundle cost small; the lights main bundle limit is 155 KB gzip.
  - `lib/geo.ts` gets `inGeofence(point, settings)`: box AND polygon (ray casting, with
    the polygon optional).
  - Every place the app decides "is this pin inside the contest area" uses `inGeofence`.
    Map pan limits and the fallback view keep using the box.
  - No visual change is required. Drawing the outline on the entry mini-map is out of scope.
- **D8. Seed and e2e data.** Every seeded house in `supabase/seed_lights.sql` and every
  "inside" point used by tests (e.g. `apps/lights/e2e/helpers.ts`) must be inside the
  polygon. Check them all. Move any that fall outside to a real street inside, and say which.
- **D9. Docs.**
  - Update `docs/runbook-lights.md` A9 and D6: the geofence is now confirmed, it is a
    polygon, and here is how to change it with `GEOFENCE_POLYGON`. Remove "You must confirm
    the geofence".
  - Update the plan's §7 decision 6, the `lights.settings` description in §3/§4 if it lists
    the columns, and the README if it documents `GEOFENCE`.
  - Add `## Implementation notes` here.
- **D10. Parade untouched.** Nothing under `apps/parade`, `packages/`, or the parade's
  migrations changes, and the parade `dist` stays byte-identical.

## Tests (must exist and pass)
- **pgTAP:**
  - Every row of the reference-point table through `lights.in_geofence`.
  - The polygon check constraint rejects: a 2-vertex array, a non-array, a vertex with 3
    numbers, a vertex with a string, and lat 95.
  - Null polygon falls back to the box: set it null in a transaction and Darrow/Nimitz
    becomes inside again.
  - In `lights_10_houses`, an owner insert at Darrow/Nimitz is rejected, because it is
    inside the old box but outside the polygon. The existing out-of-geofence tests still
    pass.
- **Unit tests:**
  - `geo.ts` `inGeofence`: the reference points; an open ring and a closed ring give the
    same answers; a null polygon falls back to the box.
  - `census.ts`: a match inside the box but outside the polygon is not preferred.
  - `contest-admin`'s polygon parsing, if it is factored into a testable function.
  - The D4 file-match check.
- **e2e:** the full `npm run e2e:lights` and `npm run e2e:smoke` stay green.

## Acceptance criteria
1. `npm run lint`, `npx tsc -b`, `npm test` and `npm run build` pass, and the lights main
   bundle stays under 155 KB gzip.
2. `npx --yes supabase@3.1.0 db reset` and `npx --yes supabase@3.1.0 test db` pass, with the
   new tests counted.
3. With the env exported via `set -a; eval "$(npx --yes supabase@3.1.0 status -o env)"; set +a`,
   `npm run e2e:lights` (full) and `npm run e2e:smoke` pass.
4. Against the local stack:
   - `node tools/contest-admin.mjs --contest lights` shows the polygon line.
   - `GEOFENCE_POLYGON=supabase/geofence/worthington-hills.geojson` round-trips.
   - `GEOFENCE=…` clears the polygon.
   - Both at once fails.
   - Afterwards, the stack is back to the migration's values (`db reset`).
5. The parade `dist` is byte-identical to `origin/main`'s build.
6. The working tree is clean, and nothing hosted is touched.

## Implementation notes

Commits on `ccr-d8fa11eb-d78hzt` after the spec (975c165): the database, the app/geocoder/tool,
then docs and the final checks (see the PR for SHAs).

### Choices and deviations
- **No deviation from D1–D10.** Choices the spec left open:
- **Point-in-polygon in SQL (D2): the native `polygon @> point`**, with the polygon built from
  the jsonb vertices on each call (`point = (lng, lat)`). It is built in, counts boundary points
  as inside like the box does, and takes an open or closed ring. It is `stable`, `set search_path = ''`,
  with the same signature and grants, so the RLS policies are untouched. The cost is a 36-vertex
  string build per call, which is nothing at this scale.
- **Validator (D3)** is `lights.geofence_polygon_valid(jsonb)`, immutable, using nested `CASE`
  rather than `AND` so a string vertex returns false instead of raising a cast error (SQL does not
  promise short-circuiting). The pgTAP tests assert SQLSTATE 23514 for each bad shape. I
  `revoke`d PUBLIC execute on it: an existing schema test requires that no `lights` function is
  PUBLIC-executable (service_role keeps execute through the default privileges).
- **Closed ring in the migration and the GeoJSON.** The traced file repeats its first vertex at
  the end (36 entries). The migration embeds exactly the file's numbers, closed. The code accepts
  both forms (tested in pgTAP, `geo.ts`, `census.ts`).
- **App default (D7)** is a small hand-kept module, `apps/lights/src/lib/geofence-default.ts`,
  rather than importing the GeoJSON (Vite only treats `.json` as JSON and the file is outside the
  app root). The D4 test checks the GeoJSON, the migration literal and this module against each
  other, so a drift fails `npm test`. Lights main bundle: 99.48 KB gzip (limit 155).
- **Components take a `fence` prop** (the settings columns) instead of a `box`: `SubmitWizard`
  and `PlaceStep` decide "inside" with `inGeofence`, and `PlaceStep` derives the box for the
  mini-map. `App.tsx` keeps the box for the lineup map's pan limit and fallback view.
- **Geocoder with a malformed polygon.** `toGeofence` returns null (so `geofence_unavailable`,
  HTTP 500) when `geofence_polygon` is present but malformed. The database check makes that
  impossible, and silently falling back to the box would let out-of-polygon matches through.
- **contest-admin.** The polygon parsing is in `tools/geofence-polygon.mjs` (unit tested in
  `tools/geofence.test.ts`). It accepts a bare Polygon, a Feature or a one-feature collection
  with exactly one ring and no holes. The tool has no local/remote guard of its own, so none was
  changed. `GEOFENCE_POLYGON` is resolved from the current directory.
- **Docs.** Runbook A2/A3 now list four pending migrations (and eight versions after the push),
  which the new migration requires. `apps/lights/.env.example` documents the new variable. I left
  the M3 migration's "FOR THE USER TO CONFIRM" comment alone (the new migration's header explains
  the supersession) and the M3 and later milestone docs as written history.

### Seed and test points
All reference points match the table. Every seeded house (`seed_lights.sql`), every point in
`e2e/helpers.ts`, the e2e stubs (1283/-83.0466, the Candlewood points), and the pgTAP fixtures
(Blackstone Dr 40.1370/-83.0590, Candlewood, Blind Brook, Clubview, Shelley Ct) were checked
against the polygon and are inside. **No seed or test point was moved.**

### Acceptance criteria
See the results below (filled in after the final run).
