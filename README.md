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
npm run dev       # http://localhost:5173
```

Run `npm test` for the shared packages' unit tests (vitest). `config.toml` uses
`[local_smtp]`, which Supabase CLI 3.x requires (2.122+ also accepts it). If your
installed CLI is older, use `npx --yes supabase@3.1.0 start`.

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

The npm scripts run with `apps/parade` as their working directory, which is how they find
`apps/parade/.env`. Run them through `npm run …`, not with `node` directly.

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
  scripts/set-voting-window.mjs      applies VOTING_*_AT / ADMIN_PHONE to the database
  scripts/seed-floats.mjs            placeholder float content (preview only)
  scripts/seed-float-images.mjs      placeholder float photos (preview only)
  src/App.tsx                        app shell, vote logic, settings polling
  src/components/EntryCard.tsx       one float on the ballot
  src/components/AdminPhotoButton.tsx day-of photo upload (admin only)
  src/components/AdminEditButton.tsx  day-of float text edits (admin only)
  src/copy.ts                         parade wording for the shared components
  src/lib/supabase.ts                client init from VITE_* env vars
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
  seed.sql                           parade floats (theme, street, photo)
docs/                                plan and per-milestone specs
package.json                         npm workspaces root (apps/*, packages/*)
tsconfig.base.json                   shared TypeScript options
eslint.config.js                     shared lint config
vercel.json                          Vercel bridge to apps/parade (until hosting moves)
```
