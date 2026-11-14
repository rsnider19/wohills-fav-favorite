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
- *(Superseded in review: `in_geofence` now ray-casts; see Review notes R1.)*
  **Point-in-polygon in SQL (D2): the native `polygon @> point`**, with the polygon built from
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
  other, so a drift fails `npm test`. Lights main bundle: 99.48 KB gzip (limit 155). *(Review: that
  build had no `VITE_SUPABASE_*` variables; the real figure is 152.35 KB, see R5.)*
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
Each was run by hand on the final tree.

1. **Pass.** `npm run lint`, `npx tsc -b`, `npm test` (24 files, 331 tests) and `npm run build`
   pass. Lights main bundle 99.48 KB gzip (limit 155) *(152.35 KB with the variables set; see R5)*.
2. **Pass.** `db reset` then `test db`: 5 files, 157 tests (22 new in `lights_00_schema`, 1 new in
   `lights_10_houses`).
3. **Pass.** With the status env exported: `npm run e2e:lights` 59 passed, 18 skipped (the
   `SHOOT=1` screenshot specs, skipped as before); `npm run e2e:smoke` 8 lights + 1 parade passed.
   I also ran `supabase/tests/lights-smoke.mjs` against a served `geocode` function (15 checks
   passed), which exercises the function reading the new column.
4. **Pass.** Against the local stack: `--show` prints `geofence  polygon (36 vertices) in lat
   40.1179..40.13877, lng -83.06427..-83.03402`; `GEOFENCE_POLYGON=supabase/geofence/worthington-hills.geojson`
   stored vertices equal to the file's (swapped); `GEOFENCE=40.1175,40.145,-83.067,-83.0305`
   printed that it clears the polygon and the column read back `null`; both at once failed with
   "Set GEOFENCE or GEOFENCE_POLYGON, not both" and a non-zero exit. Then `db reset` restored the
   migration's values (checked with `--show`).
5. **Pass.** A build of `origin/main` in a scratch worktree gave a `apps/parade/dist` identical to
   this branch's (`diff -r`), and nothing under `apps/parade` or `packages/` changed.
6. **Pass.** Working tree clean after the last commit; only the local stack was used.

### For a reviewer
- *(Superseded: no polygon text is built any more; see R1.)* `lights.in_geofence` builds the polygon text from jsonb with `format('(%s,%s)', ...)`; the
  numbers come from jsonb numerics, which print as plain decimals, and the check constraint
  guarantees they are numbers.
- The migration is the only place the settings row's box columns change; the old box
  (40.1175..40.145, -83.067..-83.0305) is gone from the database, the app default and the tests.

## Review notes
Reviewer, 2026-11-14, on `975c165..136ffd3` plus the fixes below (commits on
`ccr-d8fa11eb-d78hzt` after `136ffd3`).

### Findings and fixes
- **R1. `lights.in_geofence` accepted points up to ~35 m outside the polygon (fixed).** The
  axis order, `stable`, `search_path`, grants and the untouched RLS policies were all right,
  and the `format('(%s,%s)')` text was safe (jsonb numbers print as plain decimals, never in
  exponent form and never through the locale). The problem is Postgres's own
  `polygon @> point`: `point_inside()`/`lseg_crossing()` call a point "on the boundary" (so
  inside) when a cross product is below the fixed `EPSILON` of 1e-6. In degrees that
  cross product is edge length × distance, so for this polygon's 0.001–0.003° edges points
  tens of meters outside counted as inside. A fuzz of 25,151 points (random in the box, plus
  every vertex and edge midpoint at offsets from 1e-9° to 1e-5°) found 2,632 disagreements
  with the client's ray cast, the farthest 0.00035° (~30 m) outside, e.g. 40.1205, -83.0344
  east of the Route 315 edge; every disagreement was the database accepting a point the
  client refused, never the reverse. Fix: `in_geofence` now ray-casts in `float8` with the
  same arithmetic, in the same order, as `inGeofence()` in `geo.ts` and `census.ts` (same
  signature, `stable`, `search_path = ''`, grants kept by `create or replace`; the RLS
  policies still read `lights.in_geofence(lat, lng)`, checked in `pg_policy`). The same
  fuzz now gives **0 disagreements** between SQL, the app and the geocoder, vertices and
  edges included, because the three compute bit-identical doubles (jsonb text → `float8`
  and `JSON.parse` both round correctly; the app rounds a pin to 6 decimals before it both
  checks and saves it). A horizontal or zero-length edge never enters the division (guarded
  by `CASE`), so open and closed rings both work. Edited in the new migration itself, since
  it has never been pushed anywhere.
- **R2. The validator accepted a value that made `in_geofence` raise (fixed).** A
  coordinate like `1e-400` passes "a number in −90..90" but underflows the cast to `float8`
  ("out of range for type double precision"). The validator now also rejects a nonzero
  coordinate below 1e-300 in magnitude. Otherwise it was sound: immutable, nested `CASE` so
  nothing is cast before its type is known, `set search_path` (so never inlined), and it
  returns false, without raising, for JSON `null`, a string, `[]`, null or non-array
  vertices, booleans, nested arrays and out-of-range numbers (now a pgTAP test). NaN and
  Infinity cannot occur: JSON has no such numbers and `to_jsonb('NaN'::numeric)` is the
  string `"NaN"`, which fails the type check. A 200,000-vertex array validates in well under
  a second. Numeric strings (`"-83.05"`) are rejected, as the spec asks.
- **R3. `contest-admin` would store a self-crossing ring (fixed).** Parsing was right:
  a bare Polygon, a Feature or a one-feature collection; `[lng, lat]` swapped to
  `[lat, lng]`; a MultiPolygon, holes, a 3-number vertex, strings and out-of-range values
  refused with a message naming the problem; the box is the vertices' min/max; `GEOFENCE`
  sets `geofence_polygon: null` and says so; both together fail inside the patch build,
  before any request. A bow tie or a ring that touches itself was accepted, though, and
  inside/outside would then stop matching the map. `parseGeofencePolygon` now refuses any
  ring whose non-neighboring edges cross or touch (the shipped outline passes; tests for a
  bow tie, a self-touching ring, an open ring and a concave L). The tool has no local/remote
  guard of its own beyond printing `target: <host>` (unchanged from `975c165`); `--env-file`
  and the "exported variables win" rule are untouched.
- **R4. The hosted rollback would have left the new migration recorded (fixed).** Runbook
  rollback step 3 deleted only M3's two `schema_migrations` rows, so after a rollback a
  re-push would skip `20261114000000` and the site would select a column that no longer
  exists. Step 3 now deletes that row too. The rollout itself was right: the migration is
  in A2's list and A3's push, before A4 exposes `lights`, and `--remote` is on every
  `db push`, `db dump` and `migration list`. I also pointed the M3 migration's
  "FOR THE USER TO CONFIRM … (GEOFENCE=...)" comment at the new migration, since it now
  misleads (a comment only; hosted has never run either file).
- **R5. The bundle did not shrink; the measurement did.** `apps/lights/src/lib/supabase.ts`
  throws at module load when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are missing.
  Built without them, Vite inlines `undefined`, the `throw` becomes unconditional and the
  bundler drops everything after it: 338.00 KB / 99.48 KB gzip, for `975c165` (pre-change)
  and this branch alike, a page that would only throw. With the variables set, as CI sets
  them (`.github/workflows/ci.yml`) and as M8 measured: `975c165` gives 523.12 KB /
  **151.89 KB** gzip (M8's figure) and this branch **524.19 KB / 152.35 KB** gzip, so the
  polygon costs 0.46 KB gzip, under the 155 KB limit. Nothing broke, no chunk moved, no
  feature is missing. A build without the variables is never a valid size measurement.
- **R6. Test holes (filled).** The pgTAP and `geo.test.ts` reference points all passed even
  with the broken native operator, because none sat near an edge. Both now share a table of
  points 3 m either side of five edges plus the 30 m point (every "outside" row fails on the
  old function). New e2e `out of area: GPS inside the bounding box but outside the polygon is
  refused`: a GPS fix at Darrow & Nimitz must not drop a pin. I checked it fails when
  `inGeofence` is made box-only. (It is its own test because the app asks for a position at
  most 60 s old, so a second `setGeolocation` in the same page is not seen.)

### Checked and left alone
- **D4 file match** really compares all three copies: the migration literal and
  `DEFAULT_GEOFENCE_POLYGON` against the parsed GeoJSON, element by element, plus the four box
  numbers.
- **Seed and e2e points.** After `db reset`, every seeded house passes
  `lights.in_geofence` (8 of 8, new function), as do all `e2e/helpers.ts` rows, the
  1283/-83.0466 and Candlewood stubs and the pgTAP fixtures. Nothing moved.
- **Exact edges and vertices.** SQL, `geo.ts` and `census.ts` now agree bit for bit, so there
  is no edge case where one rejects what another accepts. A point exactly on an edge may be
  in or out (half-open ray-cast rule), unlike the inclusive box; with the outline grown 30 m
  that cannot decide a real house.
- **Geocoder.** `toGeofence` refusing a malformed polygon (so `geofence_unavailable`) rather
  than falling back to the box is the right call. The function reads the new column with the
  anon key, which the table-level `select` grant covers. Not re-served locally in review
  (its code did not change after the implementer's smoke run).
- **App wiring.** Every "is this pin inside" decision (`PlaceStep` pin hint, GPS "far",
  `SubmitWizard` error mapping) uses `inGeofence`; the map pan limit and fallback view keep
  the box (`App.tsx`, `geofence(fence)` for the mini-map).
- **Swapped files.** A GeoJSON file written in `[lat, lng]` order would pass the range checks
  (lat −83, lng 40). Not guarded: the tool prints the resulting box, and `--dry-run` shows the
  whole patch first.
- **3D coordinates** (`[lng, lat, alt]`) are refused rather than trimmed, as the
  implementer's tests assert; the message is clear.
- `functions deploy`/`functions delete` in the runbook have no `--remote`: they target the
  linked project by design and are not database commands (unchanged from M8).

### Final checks (on the final tree)
- `npm run lint`, `npx tsc -b`: pass. `npm test`: 24 files, 347 tests pass.
- `npm run build` with CI's variables: pass, no chunk warning; lights main
  `index-*.js` 524.19 KB / **152.35 KB gzip** (limit 155).
- `npx --yes supabase@3.1.0 db reset` then `test db`: 5 files, **171 tests** pass
  (`lights_00_schema` 68).
- With the status env exported: `npm run e2e:lights` **60 passed**, 18 skipped (the `SHOOT=1`
  screenshot specs); `npm run e2e:smoke` 8 lights + 1 parade passed.
- `contest-admin` against the local stack: `--show` prints the polygon line; a bow-tie file and
  `GEOFENCE`+`GEOFENCE_POLYGON` both exit 1 before writing; `GEOFENCE=…` prints that it clears
  the polygon and the column reads `null` (Darrow & Nimitz then inside); `GEOFENCE_POLYGON=…`
  stores the file's vertices swapped, equal to the file. Then `db reset`.
- Parade: `apps/parade/dist` built from `origin/main` (f8ae601) and from this branch with
  the same variables: `diff -r` identical; nothing under `apps/parade` or `packages/` changed.
- Local stack left reset to the seed; no dev servers, Playwright processes or `.env` files.
