# 🎆 Dynamic Duos — Worthington Hills 4th of July Parade Fan Favorite

A fan-favorite voting site for the Worthington Hills 4th of July parade. Neighbors verify
their phone number with a 6-digit code, vote for their favorite "Dynamic Duo," and can
change that vote any time before voting closes — but can never vote twice.

**Stack:** React + Vite + Tailwind (frontend) · Supabase (Postgres, phone OTP auth, RLS) · Cloudflare Workers (hosting)

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

```sh
supabase start    # local stack on ports 55321 (API), 55322 (db), 55323 (Studio)
npm install
npm run dev       # http://localhost:5173
```

Ports are set in `supabase/config.toml` in the 55xxx range to avoid colliding with
other local Supabase projects (which default to 54xxx).

If your local keys differ from `.env` (they're printed by `supabase start` /
`supabase status`), copy `.env.example` to `.env` and paste in the *Publishable* key.

### Test sign-in (no SMS sent)

These numbers are configured in `[auth.sms.test_otp]` in `supabase/config.toml`;
the verification code is always **123456**:

- (555) 555-0100 · (555) 555-0101 · (555) 555-0102

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

Set `ADMIN_PHONE` in `.env` and run `npm run set-window`. When that person signs
in on the site (same phone-code flow as voting), every float card shows a
**📷 Update photo** button: take or pick a photo, and it's resized client-side,
uploaded to the public `floats` storage bucket, and the entry is updated — one
tap per float, straight from a phone at the parade.

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

The open/close times come from env vars in `.env` (ISO 8601 **with a timezone
offset**) and are applied to the database — where RLS enforces them — with:

```sh
VOTING_OPENS_AT=2026-07-04T12:00:00-05:00
VOTING_CLOSES_AT=2026-07-04T20:00:00-05:00
SUPABASE_SERVICE_ROLE_KEY=<service-role key>   # local: `supabase status`; hosted: Dashboard → Settings → API

npm run set-window
```

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

### 2. Cloudflare

Build with the production Supabase values, then deploy:

```sh
VITE_SUPABASE_URL=https://<ref>.supabase.co \
VITE_SUPABASE_ANON_KEY=<publishable-key> \
npm run deploy
```

(`npm run deploy` = build + `wrangler deploy`; run `npx wrangler login` first.)
The publishable/anon key is safe to ship to browsers — RLS does the enforcement.

## Project layout

```
supabase/
  config.toml                        local stack config (55xxx ports, test OTPs)
  migrations/20260610000000_init.sql schema, RLS policies, get_results()
  migrations/20260611000000_voting_window.sql
                                     voting window columns + voting_is_open() RLS
  migrations/20260612000000_floats.sql
                                     theme/street rename + image_url
  migrations/20260613000000_admin_uploads.sql
                                     admin_config, is_admin(), photo-upload RLS
  seed.sql                           parade floats (theme, street, photo)
scripts/
  set-voting-window.mjs              applies VOTING_*_AT env vars to the database
src/
  App.tsx                            app shell, vote logic, settings polling
  components/PhoneAuth.tsx           phone → 6-digit code sign-in modal
  components/EntryCard.tsx           one float on the ballot
  components/AdminPhotoButton.tsx    day-of photo upload (admin only)
  components/Countdown.tsx           opens-in / closes-in timer
  components/Results.tsx             reveal-day leaderboard
  lib/supabase.ts                    client init from VITE_* env vars
wrangler.jsonc                       Cloudflare Workers static-assets config
```
