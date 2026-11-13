# Holiday Lights runbook

Everything an operator does to launch, run and wind down the Worthington Hills Holiday Lights
contest (`holiday-lights.worthingtonhills.org`), which shares one Supabase project with the
live 4th of July parade site.

> **Who runs what.** Parts A, B, C and the hosted commands in D are an **operator checklist
> for the site owner. The build agents have NOT done any of them**: they are not allowed to
> touch hosted Supabase, Vercel, Cloudflare, Twilio or DNS. Part F records what the agents
> rehearsed against the **local** Supabase stack only. Tick the boxes as you go.

Contest dates (America/New_York; decided, plan §7): entries **Sat Nov 28 – Tue Dec 15**,
voting **Tue Dec 8 – Sun Dec 20**, reveal flipped by hand after the close. Owners can edit or
withdraw until voting opens.

## Contents

- [Before you start](#before-you-start)
- [Timeline](#timeline)
- [A. Hosted rollout](#a-hosted-rollout-operator-not-done-by-the-agents)
- [B. Hosted rehearsal with test data, then the wipe](#b-hosted-rehearsal-with-test-data-then-the-wipe-operator-not-done-by-the-agents)
- [C. Real phones on the HTTPS preview](#c-real-phones-on-the-https-preview-operator-not-done-by-the-agents)
- [D. Running the contest (`contest-admin`)](#d-running-the-contest-contest-admin)
- [E. Emergencies](#e-emergencies)
- [F. Local rehearsal (what the agents ran)](#f-local-rehearsal-what-the-agents-ran)

## Before you start

- **Two env files, outside the repo, never committed.** `contest-admin` and `lights-wipe`
  read the target and the service-role key from a file you name with `--env-file`. Keep the
  hosted one somewhere private, for example `~/lights-hosted.env`:

  ```sh
  # ~/lights-hosted.env: hosted project. Only these two lines; contest dates are passed
  # on the command line so nothing changes by accident.
  SUPABASE_URL=https://<project-ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<service_role key: Dashboard → Project Settings → API Keys>
  ```

  Every command prints its target host first (`target: <ref>.supabase.co`). Read it before
  pressing Enter on anything that writes.
- **The parade shares the project.** Every hosted step below changes only the `lights`
  schema, the `houses` bucket, or a setting both sites share (Auth, SMS). Never run
  `supabase db reset --linked`, never run `supabase/seed*.sql` on hosted, and never delete
  from `public.*` or the `floats` bucket.
- **An old local stack on your own machine.** If `npx --yes supabase@3.1.0 start` fails with
  `supabase_rest_… 503` after pulling the lights migrations, run
  `npx --yes supabase@3.1.0 stop --no-backup` once, then `start` (local data only; the seeds
  come back). See M3 D23.
- **Tools:** Node 22, `npx --yes supabase@3.1.0` (CLI), the Supabase dashboard, the Twilio
  console, an iPhone and an Android phone for Part C.

## Timeline

| When | What | Part |
|---|---|---|
| By about **Nov 23** | H (hosting + DNS) comes off hold; you get an HTTPS preview of the lights site | plan §6 H |
| **Nov 23–27** | Hosted rollout | A |
| **Nov 23–27** | Rehearsal with test data, real phones, then the wipe | B, C |
| **Fri Nov 27** evening | Final `--show`: decided dates, results hidden, 0 houses | B9 |
| **Sat Nov 28** 00:00 ET | Entries open by themselves (no action) | D |
| **Tue Dec 8** 00:00 ET | Voting opens by themselves; owners are locked | D |
| **Mon Dec 21** 00:00 ET | Voting closes by itself | D |
| After the close (your call) | The reveal: `RESULTS_VISIBLE=true` | D3 |

## A. Hosted rollout (operator; not done by the agents)

Do these from your own machine, **in this order**. They are M3's "Hosted rollout notes" plus
what M4–M8 added. The parade is live on the same project: read each step before running it.

- [ ] **A1. Back up the parade data first.** `npx --yes supabase@3.1.0 link --project-ref <ref>`
  (if not linked), then
  `npx --yes supabase@3.1.0 db dump --linked --data-only -f ~/parade-backup-$(date +%F).sql`.
  Keep the file private (it holds the parade's votes). Nothing below should need it.
- [ ] **A2. See what's pending.** `npx --yes supabase@3.1.0 migration list`. Exactly these
  three should be local-only:
  - `20261112120000_parade_get_results_top3` (M2: the parade's `get_results()` returns the
    top 3 only. The parade already shows only 3, so nothing visible changes; it was never
    pushed to hosted.)
  - `20261113000000_lights_schema`
  - `20261113000100_lights_storage`

  Anything else listed as local-only: stop and ask before pushing.
- [ ] **A3. Dry run, then push.** `npx --yes supabase@3.1.0 db push --dry-run`, check it lists
  only those three, then `npx --yes supabase@3.1.0 db push`. This creates the `lights`
  schema, its RLS, the settings row with the decided dates and the drafted geofence, and the
  public `houses` bucket (10 MB, jpeg/png/webp) with its policies. Seeds are **not** applied
  (never pass `--include-seed`; `seed_lights.sql` also refuses to run on a database with real
  phones).
- [ ] **A4. Expose the schema, after A3, never before.** Dashboard → Project Settings → Data
  API → Exposed schemas: add `lights`, keep `public` and `graphql_public`, Save. (Exposing a
  schema that doesn't exist yet stops PostgREST from loading, which would take the parade's
  API down.) Then open the parade site and check it still shows its results.
- [ ] **A5. Deploy the address lookup.** `npx --yes supabase@3.1.0 functions deploy geocode`
  (add `--no-verify-jwt` if your CLI doesn't pick `verify_jwt = false` up from
  `config.toml`). No secrets; `CENSUS_GEOCODER_URL` must stay unset on hosted.
- [ ] **A6. Auth settings** (Dashboard → Authentication; shared with the parade; change
  nothing else):
  - Phone provider on (Twilio, as for the parade), **phone confirmations on** (otherwise
    `signUp({ phone, password })` would create "phone" accounts nobody verified).
  - **Anonymous sign-ins off**, **manual linking off**.
  - **CAPTCHA protection off.** Neither site sends a captcha token; turning it on would
    break sign-in on both.
- [ ] **A7. SMS limits and spend** (both sites now share them):
  - Dashboard → Authentication → Rate Limits → SMS messages per hour: raise it for the
    contest (suggested **150/hour** from Nov 28 to Dec 21; the local default is 30). It is
    one limit for the whole project. Put it back after the contest.
  - Keep the per-phone resend interval as it is (the dialog already waits between codes).
  - Twilio console → Messaging → Settings → **Geo permissions: United States only** (blocks
    SMS-pumping fraud to foreign numbers, the main cost risk of a public phone form).
  - Twilio: check the balance and set a usage alert (US SMS is about $0.008 each; a few
    hundred sign-ins cost a few dollars).
- [ ] **A8. Storage check.** Dashboard → Storage: `houses` exists, is public, 10 MB limit,
  `image/jpeg, image/png, image/webp`. `floats` is unchanged.
- [ ] **A9. Settings and the geofence.**
  `npm run contest-admin -- --contest lights --env-file ~/lights-hosted.env --show` prints
  the decided dates and the geofence `lat 40.1175..40.145, lng -83.067..-83.0305`.
  **You must confirm the geofence** (M3 "Geofence"): paste the corners
  (40.1175,-83.0670 and 40.1450,-83.0305) into a map and check every Worthington Hills
  street is inside. To change it:
  `GEOFENCE=minLat,maxLat,minLng,maxLng npm run contest-admin -- --contest lights --env-file ~/lights-hosted.env`.
- [ ] **A10. Admin phone.** SQL editor: `select admin_phone from public.admin_config;` must be
  the admin's phone (digits, e.g. `1614…`). It is shared with the parade; change it only with
  `ADMIN_PHONE=… npm run contest-admin -- --contest lights --env-file ~/lights-hosted.env`.
- [ ] **A11. The lights build uses the plain project URL.** In H's build variables,
  `VITE_SUPABASE_URL=https://<ref>.supabase.co` (no custom domain, no trailing path) and
  `VITE_SUPABASE_ANON_KEY=<publishable key>`. An owner's photo must live under exactly that
  origin (M3 rollout step 9). If a Supabase custom domain is ever added, redo B4 before
  relying on it.
- [ ] **A12. Map tiles.** The map uses CARTO's free Dark Matter basemap with attribution.
  Check CARTO's current terms against a few thousand map views over the contest; swapping the
  style is one constant (`MAP_STYLE_URL`).

**Rollback** (only before real entries exist): the SQL in M3 "Hosted rollback", then remove
`lights` from Exposed schemas and empty + delete the `houses` bucket.

## B. Hosted rehearsal with test data, then the wipe (operator; not done by the agents)

The plan's M8 "done when": the whole contest, end to end, against the hosted project with
test data, then wiped. Do it after A, before **Nov 28**, ideally together with C on H's
HTTPS preview. Without the preview, run the site on your machine against hosted (B2).

- [ ] **B1. Test phones.** Dashboard → Authentication → Sign In / Providers → Phone → test
  phone numbers: add `15555550101=123456` and `15555550102=123456` (fictional; no SMS is
  sent). The admin signs in with the real admin phone (one real SMS).
- [ ] **B2. A site to rehearse on.** H's HTTPS preview, or locally:
  `VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_ANON_KEY=<publishable key> npm run dev:lights`
  (exported variables win over `apps/lights/.env`; open `http://localhost:5174`).
- [ ] **B3. Open entries now** (`…` below stands for `npm run contest-admin -- --contest lights --env-file ~/lights-hosted.env`):

  ```sh
  SUBMISSIONS_OPEN_AT=$(date -u +%FT%TZ) npm run contest-admin -- --contest lights --env-file ~/lights-hosted.env
  ```
- [ ] **B4. Enter a house** as 0101 on `/enter`: photo, a real neighborhood address (e.g.
  1221 Candlewood Dr), the pin, send. "You're on the list!" The lookup must find the address
  (this proves A5). A second entry as 0102 at another address.
- [ ] **B5. Approve.** As the admin on `/admin`: both entries are "waiting"; approve them.
  They appear in the lineup and on the map.
- [ ] **B6. Open voting, vote, pause, close.**

  ```sh
  VOTING_OPENS_AT=$(date -u +%FT%TZ) npm run contest-admin -- --contest lights --env-file ~/lights-hosted.env
  ```
  As 0102: vote for 0101's house ("★ Your pick"); 0102's own card says "Your house". Then
  `VOTING_OPEN=false …` (every button says "Voting paused"), `VOTING_OPEN=true …`, then
  `VOTING_CLOSES_AT=$(date -u +%FT%TZ) …` ("Voting closed").
- [ ] **B7. The reveal.** As the admin: `/?preview=results` shows the sample podium ("??"
  votes). Then `RESULTS_VISIBLE=true …`; within 30 s the podium and the power surge appear
  (1 vote for 0101's house). Meanwhile open the **parade** site: unchanged.
- [ ] **B8. Wipe the lights data** (votes, houses, every `houses` photo; nothing else):

  ```sh
  node tools/lights-wipe.mjs --env-file ~/lights-hosted.env                       # dry run: counts
  node tools/lights-wipe.mjs --env-file ~/lights-hosted.env --yes <ref>.supabase.co
  ```
  It prints the parade's counts before and after and stops if they differ. Then, in the SQL
  editor, start entry numbers at 1 again (only while `lights.houses` is empty):
  `alter table lights.houses alter column entry_number restart with 1;`
  (A refused entry still uses up a number, so if anyone tries to enter before Nov 28 the
  first real entry may be No. 2. Harmless; numbers already have gaps after withdrawals.)
- [ ] **B9. Put the decided settings back** (one command, every value explicit):

  ```sh
  SUBMISSIONS_OPEN_AT=2026-11-28T00:00:00-05:00 SUBMISSIONS_CLOSE_AT=2026-12-16T00:00:00-05:00 \
  VOTING_OPENS_AT=2026-12-08T00:00:00-05:00 VOTING_CLOSES_AT=2026-12-21T00:00:00-05:00 \
  SUBMISSIONS_OPEN=true VOTING_OPEN=true RESULTS_VISIBLE=false \
    npm run contest-admin -- --contest lights --env-file ~/lights-hosted.env
  npm run contest-admin -- --contest lights --env-file ~/lights-hosted.env --show
  node tools/lights-wipe.mjs --env-file ~/lights-hosted.env                       # 0 houses, 0 votes, 0 photos
  ```
- [ ] **B10. Remove the test phones** from the Phone provider. Optionally delete the two test
  users (Authentication → Users, only `15555550101/02`; deleting a user also deletes any
  parade vote it had, and these never had one).
- [ ] **B11. Write down** the date, who ran it, and anything that surprised you in the log
  below.

| Date | Who | Result / notes |
|---|---|---|
| | | |

## C. Real phones on the HTTPS preview (operator; not done by the agents)

Needs H's HTTPS preview (camera and location need HTTPS) pointed at the hosted project, and
the rehearsal window from B (entries and voting opened, test phones on). Wipe again (B8–B10)
afterwards. Fill in ✓ / ✗ and the phone + OS version.

| Check | iPhone Safari (iOS 18.4+) | Android Chrome | Others |
|---|---|---|---|
| **Enter a house** (M5): camera photo, location allowed → pin, send | | | |
| Enter with location **denied** → the address lookup → pin, send | | | |
| Admin approves from a phone on `/admin` | | | |
| **Directions** (M6): `/?view=map`, pick a house, Directions opens the right app routed **to that house**; Back returns to the map with the house still picked | | | Older iPhone (iOS 17: the `daddr` link) · iPad in desktop mode (must open Apple Maps) · Samsung Internet · desktop Chrome |
| "Find my location" inside the neighborhood | | | |
| **Vote** (M7): vote, switch, "Sign in to vote" (the vote lands after the code), vote from the map sheet | | | |
| **The surge** on the podium: smooth, the blackout covers the screen with the iOS toolbar collapsing, Skip works | | | |
| iOS **Reduce Motion** on: the podium is lit at once | | n/a | |
| **Share card**: paste the site link into iMessage / WhatsApp; the card shows (only once the real domain serves `og.jpg`) | | | Facebook Sharing Debugger |

If Apple's `/directions` link misbehaves on a device, flip `UNIFIED_APPLE` in
`detectMapsDevice` so every iPhone gets `daddr` (M6 Risks).

## D. Running the contest (`contest-admin`)

`npm run contest-admin -- --contest lights --env-file <file> [--show] [--dry-run]` applies
only the variables that are **set** (exported variables win over the file); an empty
timestamp clears that bound. It prints the target host and the resulting settings in ET.
Add `--dry-run` to see the change without sending it. Locally, `<file>` is a file with the
local URL and the service-role key from `npx --yes supabase@3.1.0 status -o env`.

- **D1. Check:** `… --show`. Do this the evening before each date in the timeline.
- **D2. The windows** open and close by themselves from `lights.settings`; RLS enforces them
  with the database clock. Change a date only to correct a mistake, and never move
  `VOTING_OPENS_AT` back into the future once it has passed: that reopens owner edits.
- **D3. The reveal**, after the close (Dec 21 00:00 ET at the earliest):
  1. As the admin, rehearse on the real site: `/?preview=results` (sample podium, no counts).
  2. `RESULTS_VISIBLE=true npm run contest-admin -- --contest lights --env-file ~/lights-hosted.env`.
  3. Open pages show the podium within 30 s (at once when a phone returns to the tab); the
     first view per browser plays the surge. Tell people "reload at 8 pm" if you want them
     to watch together.
  4. To pull it back: `RESULTS_VISIBLE=false …`. Never move `VOTING_CLOSES_AT` to "reopen"
     voting after a reveal.
- **D4. Moderation** happens on `/admin` (admin phone only): approve, hide, put back, edit,
  replace a photo, delete. Prefer **hide** (reversible; the votes stay but don't count).
  **Delete** frees that phone and address for a new entry and deletes the house's votes.
- **D5. The admin phone** is shared with the parade:
  `ADMIN_PHONE=1614XXXXXXX npm run contest-admin -- --contest lights --env-file …`
  (`ADMIN_PHONE=` with nothing clears it).
- **D6. The geofence:** `GEOFENCE=minLat,maxLat,minLng,maxLng …`. Widening it is always safe;
  narrowing it never removes existing entries, but their owners can't edit them while outside.
- **D7. After the contest:** leave the results up. Put the SMS rate limit back (A7). Before a
  next season, archive with `npx --yes supabase@3.1.0 db dump --linked --data-only --schema lights -f ~/lights-2026.sql`,
  then wipe (B8) and set new dates.

## E. Emergencies

| Problem | Do this |
|---|---|
| Voting must stop now (abuse, a bug) | `VOTING_OPEN=false …`. Every page says "Voting paused"; votes already cast are kept. `VOTING_OPEN=true` resumes. Don't move dates. |
| Entries must stop now | `SUBMISSIONS_OPEN=false …`. Owners can't edit either. `true` resumes. |
| An offensive or fake entry | `/admin` → Hide. It leaves the lineup and the map at once and its votes stop counting. |
| Someone entered a neighbor's address | `/admin` → Delete (frees the address); tell the neighbor to enter. |
| SMS codes don't arrive | Dashboard → Authentication → Rate Limits (hourly SMS limit hit?) and the Twilio console (balance, geo permissions, error logs). It affects both sites. |
| The address lookup fails | Entries still work: GPS or dragging the pin. Check Dashboard → Edge Functions → `geocode` logs; the Census geocoder may be down. |
| The map shows no tiles | CARTO is down or rate-limiting; the lineup and directions still work. |
| Wrong results revealed | `RESULTS_VISIBLE=false …`, fix (hide/approve), then `true` again: a changed podium plays the surge again. |
| The parade site breaks after A4 | Remove `lights` from Exposed schemas (Dashboard → Data API) and save; the parade comes back. Then investigate. |

## F. Local rehearsal (what the agents ran)

The agents rehearsed Parts B and D against the **local** stack only (CLI 3.1.0, after
`npx --yes supabase@3.1.0 db reset`), with a local env file in place of
`~/lights-hosted.env` and the local test phones (15555550101/02, code 123456; 15555550100
as the admin). The exact script and its output are in `docs/milestones/M8.md` (Appendix B, AC8).

| Date | Who | Result |
|---|---|---|
| 2026-11-12 | M8 planning (prototype) | REHEARSAL OK: B3–B9 and D5 with these command lines; wrong `--yes` refused; parade counts and settings identical before and after; found the used-up entry number (B8 note) |
| | M8 implementation | |

What the local rehearsal can't prove: the hosted dashboard steps (A4, A6–A8, A11, B1, B10),
real SMS, real Census lookups (the local edge runtime can't reach Census from the sandbox;
M3 D19), the HTTPS preview (C) and the share card on real apps.
