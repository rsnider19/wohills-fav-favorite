# 🎆 Dynamic Duos — Worthington Hills 4th of July Parade Fan Favorite

A fan-favorite voting site for the Worthington Hills 4th of July parade. Neighbors verify
their phone number with a 6-digit code, vote for their favorite "Dynamic Duo," and can
change that vote any time before voting closes — but can never vote twice.

**Stack:** React + Vite + Tailwind (frontend) · Supabase (Postgres, phone OTP auth, RLS) · Vercel (hosting today; Cloudflare Workers config staged in apps/parade/wrangler.jsonc)

## Fairness model

- **One person, one vote** — enforced at the database level: `votes.user_id` is the
  primary key, so a second vote row for the same user is physically impossible.
  Voting again is an upsert that *changes* the existing vote.
- **Phone verification** — voters sign in with their phone number and a 6-digit
  SMS code (Supabase OTP auth). No passwords, no accounts to create.
- **No vote spoofing** — row-level security only lets a user write a row whose
  `user_id` matches their authenticated identity, and only while voting is open.
- **Voting window** — `settings.voting_opens_at` / `voting_closes_at` are checked
  inside the RLS policies against the *database* clock (`voting_is_open()`), so early
  or late votes are rejected by Postgres no matter what the client claims — the
  on-page countdown is display only. `settings.voting_open` remains an emergency
  kill switch; all conditions must hold.
- **Hidden tallies** — nobody can read other people's votes. Totals are only available
  through the `get_results()` function, which returns nothing until
  `settings.results_visible` is flipped for the big reveal.

## Local development

Prereqs: Node 20+, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli).

This is an npm-workspaces monorepo. The parade site lives in `apps/parade`, and the shared
Supabase project lives in `supabase/` at the repo root. Run every command below from the
repo root.

```sh
supabase start    # local stack on ports 55321 (API), 55322 (db), 55323 (Studio)
npm install
npm run dev       # http://localhost:5173 (parade)
npm run dev:lights  # http://localhost:5174 (holiday lights)
```

Run `npm test` for the shared packages' unit tests (vitest). `config.toml` uses
`[local_smtp]`, which Supabase CLI 3.x requires (2.122+ also accepts it). If your
installed CLI is older, use `npx --yes supabase@3.1.0 start`.

**Pulled a new migration and `supabase start` fails** with
`supabase_rest_… unexpected status 503`? Your local database volume predates a schema
the API now exposes (e.g. `lights`), so `start` restores the old data without running the
new migrations. Run `supabase stop --no-backup` once, then `supabase start` (re-applies
every migration and the seeds; local data only).

Ports are set in `supabase/config.toml` in the 55xxx range to avoid colliding with
other local Supabase projects (which default to 54xxx).

Env vars live in **`apps/parade/.env`** (not the repo root). Copy
`apps/parade/.env.example` to `apps/parade/.env` and paste in the *Publishable* key
printed by `supabase start` / `supabase status`. If you had a `.env` at the repo root
from before the monorepo move, move it to `apps/parade/.env`; nothing reads the
root one any more.

### Test sign-in (no SMS sent)

These numbers are configured in `[auth.sms.test_otp]` in `supabase/config.toml`;
the verification code is always **123456**:

- (555) 555-0100 · (555) 555-0101 · (555) 555-0102 · (555) 555-0103 · (555) 555-0104

The lights seed (`supabase/seed_lights.sql`) gives 0101 a pending house and 0103 an
approved one; 0100, 0102 and 0104 have no house.

The Twilio credentials in `config.toml` are dummies — local phone auth never sends
a real text.

### Editing the parade lineup

Each float has a **theme** (e.g. "Salt & Pepper"), the **street** that built it
(e.g. "Shelley Ct"), and an optional **photo**. Entries live in
`supabase/seed.sql` (the seed uses picsum.photos placeholders). After editing,
reload with:

```sh
supabase db reset   # re-runs migrations + seed (wipes local votes AND the voting window)
npm run set-window  # re-apply the voting window after every reset
```

### Float photos (day-of)

Set `ADMIN_PHONE` in `apps/parade/.env` and run `npm run set-window`. When that person signs
in on the site (same phone-code flow as voting), every float card shows two
admin buttons: **📷 Photo** (take or pick a photo — it's resized client-side,
uploaded to the public `floats` storage bucket, and the entry is updated) and
**✏️ Edit** (change the theme, emoji, street, or description). One tap per
float, straight from a phone at the parade.

To sign in **before voting opens** (vote buttons are disabled until then), use
either hidden entrance: open the site with `/?signin`, or tap the
"Worthington Hills Parade" badge in the header 5 times quickly. Signing in
early grants nothing by itself — votes outside the window are still rejected
by the database.

Enforcement is in the database: `is_admin()` compares the JWT phone claim to
`admin_config.admin_phone` (a table nobody can read), and RLS only lets admins
write to the bucket or update entries. Photos are stored under unique filenames
so the CDN never serves a stale image.

Manual fallback: upload to the `floats` bucket in the dashboard and set
`entries.image_url` to the file's public URL. Entries with a null `image_url`
simply render without a photo.

## Voting window

The open/close times come from env vars in `apps/parade/.env` (ISO 8601 **with a timezone
offset**) and are applied to the database — where RLS enforces them — with:

```sh
VOTING_OPENS_AT=2026-07-04T12:00:00-05:00
VOTING_CLOSES_AT=2026-07-04T20:00:00-05:00
SUPABASE_SERVICE_ROLE_KEY=<service-role key>   # local: `supabase status`; hosted: Dashboard → Settings → API

npm run set-window
```

`npm run set-window` runs `tools/contest-admin.mjs --contest parade`, which reads
`apps/parade/.env` wherever you run it from. Only variables that are set are applied:
`VOTING_OPENS_AT`, `VOTING_CLOSES_AT`, `VOTING_OPEN` and `RESULTS_VISIBLE` (`true`/`false`)
and `ADMIN_PHONE`. Add `--show` to print the current settings, `--dry-run` to preview.

Leave a bound empty for no restriction on that side. The site shows a live
countdown to opening before the window and to closing during it; buttons disable
outside the window, and the database rejects any vote outside it regardless.

For hosted, run the same command with `SUPABASE_URL` (or `VITE_SUPABASE_URL`)
and the hosted service-role key in the environment. The service-role key never
ships to the browser — it is only used by this script.

## Day-of operations (admin)

There is no admin UI. Voting opens and closes automatically on the window above;
flip the reveal switch (and the emergency kill switch if ever needed) in the
`settings` table from the Supabase dashboard (hosted) or Studio/psql (local):

```sql
update public.settings set results_visible = true;  -- reveal results 🎉
update public.settings set voting_open = false;     -- emergency kill switch (optional)
```

The site polls settings every 30 seconds, so the reveal shows up on everyone's
phone within half a minute.

## Holiday lights backend

The lights contest lives in the same Supabase project, in its own `lights` schema
(`supabase/migrations/20261113*_lights_*.sql`): houses, votes, settings, the `houses`
photo bucket and the `geocode` Edge Function. See `docs/milestones/M3.md` for the rules
and the API.

```sh
npx --yes supabase@3.1.0 test db              # pgTAP: every lights fairness rule (local stack)
npm run contest-admin -- --contest lights --show
npm run contest-admin -- --contest lights     # apply SUBMISSIONS_*/VOTING_*/RESULTS_VISIBLE/GEOFENCE/ADMIN_PHONE
```

`contest-admin --contest lights` reads `apps/lights/.env` (or `--env-file <path>`); see the
header of `tools/contest-admin.mjs` for every variable. Locally the seed opens submissions
on `db reset` and schedules voting a week later.

## Holiday lights app

The lights site lives in `apps/lights` and runs on the local stack:

```sh
cp apps/lights/.env.example apps/lights/.env   # paste the Publishable key from `supabase status`
npm run dev:lights                             # http://localhost:5174
```

It reads `lights.settings` and the approved houses through the shared hooks (the seed has
five), and shows whichever phase the settings put it in. To look at the other phases without
changing the database, add `?preview=before`, `submissions`, `voting`, `closed` or
`results` to the URL. That works in `npm run dev:lights` and, on a real build, only for the
signed-in admin. To change the real phase, use `npm run contest-admin -- --contest lights`.

Pages: `/` (the lineup), `/enter` (enter a house, or "My entry" once you have one: status,
edit and withdraw until voting opens) and `/admin` (the moderation queue: approve, hide, put
back, edit, delete; the footer links to it for the admin phone). Make a local admin with
`ADMIN_PHONE=15555550100 npm run contest-admin -- --contest lights`. The pin map is
MapLibre with the CARTO Dark Matter basemap and loads only on the pin step.

The lineup has a **Lineup / Map** switch. `/?view=map` opens the map (every approved house
as a glowing bulb; tap or Tab + Enter for its photo and directions) and `&house=<number>`
opens it on that house. Every house has a directions button: Apple Maps on iPhone and iPad,
Google Maps everywhere else, routed to the house's coordinates. The map loads only when
someone opens it, from the same MapLibre chunk as the pin map.

**Voting** (inside the voting window) is on every card and in the map's house sheet: "Sign
in to vote" (the vote goes in right after the code), "Vote for this house", "Switch my vote
here", "★ Your pick" (that card goes fully lit), "Your house" on your own entry (self-votes
are blocked), and "Voting opens …", "Voting paused" or "Voting closed" outside it. One vote
per phone, changeable until the close; the database enforces all of it (RLS).

**The reveal**: `RESULTS_VISIBLE=true npm run contest-admin -- --contest lights` (or `false`
to hide it again). Open pages pick it up on their next poll (30 s, or at once when a phone
comes back to the tab), and the top 3 appear in the hero with the "power surge": the page
dims and 3rd, 2nd and 1st come on one at a time (once per browser; Skip and "Replay the
reveal" buttons; reduced motion and the pause switch show the lit podium at once). Before
the real reveal, the admin's `?preview=results` shows a sample podium with no counts.

Other entrances: `/?signin` (or five quick taps on "Worthington Hills ★ 2026" in the hero)
opens the phone sign-in before anything is open, e.g. for the admin. The bulb button in the
header pauses every animation (remembered per device); visitors with "reduce motion" turned
on never see animation, and the lights stay on. `?house=<number>` puts that house first in
the lineup (and, with `view=map`, opens the map on it).

End-to-end tests (Playwright, local stack only; they reset the lights data they touch and
make 15555550100 the admin while they run):

```sh
set -a; eval "$(npx --yes supabase@3.1.0 status -o env)"; set +a   # API_URL, ANON_KEY, SERVICE_ROLE_KEY
npm run e2e:lights                                  # starts its own dev server on :5175
SHOOT=1 npm run e2e:lights -- screenshots.e2e       # the M5 screenshots
SHOOT=1 npm run e2e:lights -- screenshots-m6        # the M6 screenshots (map, sheet, lineup)
SHOOT=1 npm run e2e:lights -- screenshots-m7        # the M7 screenshots (voting, the reveal)
```

`reveal.e2e.ts` includes the WCAG 2.3.1 flash probe on the reveal (about two minutes; it steps
every animation through the 7-second surge and counts flashes). `a11y.e2e.ts` runs axe
(WCAG 2.2 A/AA) on every lights screen, phone and desktop.

The parade has a smoke test of its own (ballot, sign in and vote, the reveal, plus axe), and
the tests tagged `@smoke` in both apps make a one-minute subset:

```sh
npm run e2e:parade                                  # its own dev server on :5176
npm run e2e:smoke                                   # @smoke tests of both apps (~1 min)
```

**CI** (`.github/workflows/ci.yml`, GitHub Actions): on every pull request, lint, types, unit
tests and both builds, then a throwaway local Supabase stack on the runner with pgTAP and
`npm run e2e:smoke`. No secrets and no deploys; the Vercel preview stays the deploy check. Run
the workflow by hand with "full" for every e2e test (about 8 minutes).

**Share card:** `apps/lights/public/og.jpg` (1200×630, the `og:image`) is drawn from
`apps/lights/og-card.html` with `npm run og-image -w apps/lights` (needs Google Fonts).

The tests stub the address lookup (`geocode` function) in the browser, because the local
edge runtime can't reach the Census geocoder from a sandbox (M3 D19).

**Running the contest:** [`docs/runbook-lights.md`](docs/runbook-lights.md) has the hosted
rollout checklist, the rehearsal and the wipe (`node tools/lights-wipe.mjs`), the
`contest-admin` commands for windows, pauses and the reveal, and what to do in an emergency.

`apps/lights/wrangler.jsonc` is staged for the Cloudflare move (hosting is on hold); nothing
deploys the lights app yet, and Vercel still builds only the parade.

## Production deployment

### 1. Supabase (hosted)

1. Create a project at [supabase.com](https://supabase.com), then link and push the schema:

   ```sh
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

2. Seed the real lineup: paste the contents of `supabase/seed.sql` (with the real
   themes and streets) into the SQL editor, and insert the settings row if missing:

   ```sql
   insert into public.settings (id) values (true) on conflict do nothing;
   ```

   Then create a **public** storage bucket named `floats` (Dashboard → Storage)
   for the float photos, and apply the voting window (`npm run set-window` with
   the hosted `SUPABASE_URL` and service-role key in the environment).

3. **Enable phone auth with Twilio** — Dashboard → Authentication → Sign In / Up →
   Phone: enable, choose **Twilio**, and enter your Account SID, Auth Token, and
   Messaging Service SID from the [Twilio console](https://console.twilio.com).
   US SMS runs about $0.008/message — a few dollars covers the whole neighborhood.

4. Recommended hardening for voting day (Dashboard → Authentication → Rate Limits):
   keep SMS rate limits modest to cap Twilio spend.

### 2. Hosting (Vercel)

The site deploys from Vercel's Git integration. Every push builds a preview, and
`main` builds production. Vercel builds from the repo root, and the root
`vercel.json` bridges to the workspace:
`buildCommand: npm run build -w apps/parade`, `outputDirectory: apps/parade/dist`,
plus an SPA rewrite to `/index.html`. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
come from the Vercel project's environment variables. `.vercelignore` keeps any local
`.env` out of the upload, because a local file would override them.

`apps/parade/wrangler.jsonc` and `npm run deploy -w apps/parade` are staged for a
later move to Cloudflare Workers. They are not in use yet.

## Project layout

```
apps/parade/                         the 4th of July parade site (Vite app)
  index.html  vite.config.ts  wrangler.jsonc  .env.example
  public/og.png                      social share image
  scripts/seed-floats.mjs            placeholder float content (preview only)
  scripts/seed-float-images.mjs      placeholder float photos (preview only)
  src/App.tsx                        app shell, vote logic, settings polling
  src/components/EntryCard.tsx       one float on the ballot
  src/components/AdminPhotoButton.tsx day-of photo upload (admin only)
  src/components/AdminEditButton.tsx  day-of float text edits (admin only)
  src/copy.ts                         parade wording for the shared components
  src/lib/supabase.ts                client init from VITE_* env vars
  e2e/  playwright.config.ts         Playwright smoke test (local stack only)
apps/lights/                         the holiday lights site (Vite app; local only for now)
  index.html  vite.config.ts  wrangler.jsonc  .env.example  public/favicon.svg
  public/og.jpg  og-card.html  src/og/  scripts/og-image.mjs
                                     the share card and how it is drawn (`npm run og-image`)
  src/App.tsx                        app shell: settings, houses, phase, sign-in, pages
  src/index.css  src/effects.css     theme tokens and every light effect (guardrails inside)
  src/copy.ts                        all lights wording
  src/lib/phase.ts                   contest phase + ?preview= logic (tested)
  src/lib/route.ts                   /, /enter, /admin without a router library
  src/lib/submit.ts  src/lib/entries.ts
                                     entry writes (upload, then insert), my entry, moderation
  src/lib/view.ts  src/lib/navigate.ts
                                     ?view=map / ?house= and the directions link (tested)
  src/lib/ballot.ts  src/lib/reveal.ts
                                     vote-button states and errors; the podium and the reveal (tested)
  src/map/                           MapLibre setup, the pin map and the browse map (one lazy chunk)
  src/components/                    Header, Hero, LightString, Gallery, HouseCard, Footer, Page,
                                     MapView, HouseSheet, NavigateButton, ViewToggle, Ballot, Podium
  src/components/entry/              /enter: the three-step form and "My entry"
  src/components/admin/              /admin: the moderation queue
  e2e/  playwright.config.ts         Playwright end-to-end tests (local stack only)
packages/core/                       @wohills/core: Supabase hooks, phone, image pipeline, directions (no styling)
packages/ui/                         @wohills/ui: token contract (tokens.css), motion.css, shared components
supabase/                            shared Supabase project (all contests)
  config.toml                        local stack config (55xxx ports, test OTPs)
  migrations/20260610000000_init.sql schema, RLS policies, get_results()
  migrations/20260611000000_voting_window.sql
                                     voting window columns + voting_is_open() RLS
  migrations/20260612000000_floats.sql
                                     theme/street rename + image_url
  migrations/20260613000000_admin_uploads.sql
                                     admin_config, is_admin(), photo-upload RLS
  migrations/20261112120000_parade_get_results_top3.sql
                                     get_results() returns the top 3 only
  migrations/20261113000000_lights_schema.sql
                                     lights schema: settings, houses, votes, RLS, get_results()
  migrations/20261113000100_lights_storage.sql
                                     houses photo bucket + storage RLS
  functions/geocode/                 Census geocoder proxy (Edge Function) + unit tests
  tests/database/                    pgTAP tests (`supabase test db`)
  tests/lights-smoke.mjs             end-to-end API smoke test (local stack only)
  seed.sql                           parade floats (theme, street, photo)
  seed_lights.sql                    local-only lights houses, test users and votes
tools/contest-admin.mjs              applies contest settings / admin phone (`--contest parade|lights`)
tools/lights-wipe.mjs                wipes the lights data only (rehearsal clean-up; dry run by default)
.github/workflows/ci.yml             PR checks + Playwright smoke tests on a local stack (no deploys)
docs/                                plan, per-milestone specs and the lights runbook
package.json                         npm workspaces root (apps/*, packages/*)
tsconfig.base.json                   shared TypeScript options
eslint.config.js                     shared lint config
vercel.json                          Vercel bridge to apps/parade (until hosting moves)
```
