# Holiday Lights Contest: Monorepo + Milestone Plan

Status: **decisions made (see §7)**. Nothing here is built yet.

## Goal

Add a second neighborhood contest site, **Worthington Hills Holiday Lights**, next to the
existing 4th of July "Dynamic Duos" fan-favorite site. Both sites run the same fairness
model (phone OTP auth, one vote per phone, DB-enforced voting window, hidden tallies
until a reveal flag is flipped). They look completely different.

What's new for the lights site:

- **Self-submission**: a resident takes a photo of their house and enters the address.
- **Map** of every entry, each with an icon button that opens the device's maps app
  to navigate there.
- Voting window (start/end), phone auth to vote, results hidden until a flag
  shows the **top 3**. Same as the parade.
- Visual direction: **in-your-face holiday lights**.

---

## 1. Monorepo shape

**Recommendation: npm workspaces, internal (source-only) packages, no Turborepo yet.**
The repo already uses npm, and with two small Vite apps, extra build orchestration
doesn't pay for itself. Turborepo can be added later without restructuring.

```
.
├── apps/
│   ├── parade/                  # today's site, moved as-is
│   │   ├── src/  index.html  vite.config.ts  wrangler.jsonc  public/
│   │   └── scripts/             # seed-floats, seed-float-images
│   └── lights/
│       └── src/  index.html  vite.config.ts  wrangler.jsonc  public/
├── supabase/                    # ONE shared project: parade in `public`, lights in `lights`
├── packages/
│   ├── core/                    # @wohills/core: logic, no styling
│   └── ui/                      # @wohills/ui: themed React components + CSS
├── tools/
│   └── contest-admin.mjs        # generalized set-voting-window, run per app
├── tsconfig.base.json
├── eslint.config.js             # shared flat config
└── package.json                 # "workspaces": ["apps/*", "packages/*"]
```

**Internal packages** means the shared packages ship TypeScript source and have no
build step. Each app's Vite compiles them:

```jsonc
// packages/ui/package.json
{
  "name": "@wohills/ui",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./tokens.css": "./src/tokens.css",
    "./motion.css": "./src/motion.css"
  },
  "peerDependencies": { "react": "^19", "@wohills/core": "*" }
}
```

### Hosting: Cloudflare Workers for both sites (decided, **on hold**)

> **On hold:** DNS and deployment changes are paused. Until the H milestone below is
> picked up, the parade keeps deploying from Vercel exactly as it does today, and the
> lights app is only run locally. Everything in this section is the target setup for
> when hosting work resumes.

Each app is a Worker with static assets: `wrangler.jsonc` with
`assets.directory: "./dist"` and `not_found_handling: "single-page-application"`. That's
the config the parade already has at the repo root. Both Workers are connected to this
repo through **Workers Builds**, Cloudflare's own Git integration, so no deploy secrets
live in GitHub.

| | `apps/parade` | `apps/lights` |
|---|---|---|
| Worker name | `wh-4th-fan-vote` (existing) | `wh-holiday-lights` |
| Root directory | `apps/parade` | `apps/lights` |
| Build watch paths | `apps/parade/*`, `packages/*` | `apps/lights/*`, `packages/*` |
| Build command | `npm run build` | `npm run build` |
| Deploy command | `npx wrangler deploy` | `npx wrangler deploy` |
| Custom domain | `july-4-fan-favorite.worthingtonhills.org` | `holiday-lights.worthingtonhills.org` |

Things to get right:

- **`VITE_*` values are build-time.** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` go in
  each Worker's **Build → Variables**, not its runtime variables, or Vite bakes in
  `undefined`. Both apps use the same values (shared project); lights selects the
  `lights` schema in code.
- **Workspace install.** With the root directory set to an app, confirm in H that the
  build installs from the root `package-lock.json` so `@wohills/*` resolve. (M1 checked
  this locally: `npm ci` inside `apps/parade` uses the root lockfile.) If it
  doesn't, the build command becomes
  `cd ../.. && npm ci && npm run build -w apps/<app>`.
- **Previews.** Non-production branch builds get a preview URL, so each PR gets
  per-app previews the way Vercel provides them today.
- **Custom domains** on a Worker require `worthingtonhills.org` to use Cloudflare DNS.
  If the zone is hosted elsewhere today, moving it is an H prerequisite.
- **Parade cutover from Vercel** (H): deploy the Worker, verify it on its
  `workers.dev` URL, attach the custom domain (which repoints DNS away from Vercel),
  then disconnect the Vercel project and delete `vercel.json` / `.vercelignore`. The
  parade site is in its post-reveal state, so a brief DNS overlap is harmless.

### Supabase: one shared project, one Postgres schema per contest (decided)

The parade's existing Supabase project hosts both sites. The parade's tables stay exactly
where they are in `public`, and nothing about them is migrated. The lights contest gets
its own **`lights` schema** with its own `houses`, `votes` and `settings` tables, so the
two contests can't collide.

What the sites share:

- **`auth.users`**: a neighbor who verified for the parade already has an account. They
  still sign in once per domain, because sessions are per-origin.
- **Twilio/SMS config**: configured once, with one SMS rate limit across both sites.
- **Admin**: `public.admin_config` and `public.is_admin()`. Lights policies call
  `public.is_admin()`, so the same admin phone runs both sites.
- **Storage**: a new public `houses` bucket next to `floats`, with policies keyed on
  `bucket_id`.
- **Migrations**: the single `supabase/` directory stays at the repo root (not per app).
  Lights migrations are prefixed so they're easy to spot, e.g.
  `2026111x_lights_*.sql`.

Wiring the schema up:

- Expose the schema to the API: `schemas = ["public", "graphql_public", "lights"]` in
  `config.toml`; on hosted, **Dashboard → API → Exposed schemas**.
- A new schema needs explicit grants:
  `grant usage on schema lights to anon, authenticated`, plus table, function and
  default privileges. RLS still does the real enforcement.
- The lights client is `createClient(url, key, { db: { schema: 'lights' } })`.
  `core`'s `SupabaseProvider` takes that client, so the shared hooks work unchanged
  (`useIsAdmin` reaches `public.is_admin()` through `client.schema('public')`).
- Generate types per schema: `supabase gen types --schema public,lights`.

The fairness rules (votes PK on `user_id`, `voting_is_open()`, `results_visible`-gated
`get_results()`) are re-implemented in the `lights` schema against `lights.settings`, and
documented once as a "contest contract" in `packages/core/README.md`.

⚠️ The two sites share blast radius. Lights migrations must only touch the `lights`
schema and the `houses` bucket. Test them locally with `supabase db reset`, which
re-runs the parade migrations as well, before `db push`.

---

## 2. Theming that cascades into shared components

### The approach: semantic CSS-variable tokens through Tailwind v4 `@theme`

The site already uses Tailwind v4 `@theme`, which turns tokens into CSS custom properties
**and** utilities. A class like `bg-primary` compiles to
`background-color: var(--color-primary)`. That gives us the cascade for free:

1. **Shared components only use semantic token names**: `bg-surface`, `text-fg`,
   `text-fg/60`, `bg-primary`, `font-display`, `rounded-card`, `shadow-card`. They never
   use palette names like `bg-red` or `text-ink`, which is what today's components do.
2. **`@wohills/ui/tokens.css` defines the contract** as an `@theme` block with neutral
   defaults, so a component always renders even without a theme.
3. **Each app overrides the values** in its own `@theme` block. A later `@theme` wins.
4. **Subtree overrides are plain CSS.** Redefine a variable on any element and everything
   inside re-themes, e.g. a "spotlight" section or a winner card. Opacity modifiers
   (`bg-primary/20`) compile to `color-mix()` on the variable, so they follow as well.

```css
/* packages/ui/src/tokens.css: the contract */
@theme {
  --color-bg: #ffffff;
  --color-surface: #f7f7f7;
  --color-fg: #111111;
  --color-primary: #2563eb;
  --color-primary-fg: #ffffff;
  --color-accent: #9333ea;
  --color-glow: transparent;          /* lights uses this heavily; parade leaves it off */

  --font-display: Georgia, serif;
  --font-sans: system-ui, sans-serif;

  --radius-card: 1rem;
  --radius-dialog: 1.5rem;
  --shadow-card: none;
  --shadow-card-hover: 0 16px 40px -20px rgb(0 0 0 / 0.35);
  --shadow-selected: 0 16px 40px -12px rgb(0 0 0 / 0.45);
}
```

M2 finalized the list. It adds `sunken`, `field`, `danger`, `scrim`, `--radius-field` and
`--countdown-digit-width`; see `docs/milestones/M2.md`.

```css
/* apps/parade/src/index.css */
@import "tailwindcss";
@import "@wohills/ui/tokens.css";
@import "@wohills/ui/motion.css";
/* No @source needed: tokens.css declares `@source "./"` for the package (M2, D4). */

@theme {
  --color-bg: #f5f0e4;        /* was paper */
  --color-surface: #fdfaf2;   /* was card  */
  --color-fg: #1b2230;        /* was ink   */
  --color-primary: #cd3a22;   /* was red   */
  --color-accent: #2742c4;    /* was cobalt */
  --font-display: "Fraunces", Georgia, serif;
  --font-sans: "Archivo", system-ui, sans-serif;
}
```

```css
/* apps/lights/src/index.css */
@theme {
  --color-bg: #05060d;
  --color-surface: #0d0f1f;
  --color-fg: #fff6e0;
  --color-primary: #ff2d3d;
  --color-accent: #22ff7a;
  --color-glow: #ffc21a;
  --font-display: "Bungee", system-ui, sans-serif;
  --shadow-card: 0 0 0 1px rgb(255 194 26 / 0.25), 0 0 32px -6px var(--color-glow);
}
```

### Three escape hatches, in order of preference

Tokens cover color, type, radius and shadow. The lights site also wants things the
parade never will, like chasing bulb borders, flicker and glow. For those:

1. **`data-slot` hooks.** Every shared component tags its parts
   (`data-slot="dialog-panel"`, `data-slot="countdown-digit"`, `data-slot="leaderboard-row"`,
   `data-rank="1"`). The lights app's CSS targets them
   (`[data-slot="countdown-digit"] { text-shadow: … }`) and the package never learns that
   lights exist.
2. **`className` passthrough** on every component's root and key parts, merged with
   `tailwind-merge` so an app can override a utility without `!important`.
3. **Composition.** Where an app needs a different structure and not just a different
   look (e.g. a lights podium vs. the parade's ranked list), the app builds its own
   component from shared hooks + primitives. Shared components are for things that are
   *structurally* the same.

Copy differs too ("Vote for this float" vs. "Vote for this house"), so shared components
take labels as props with neutral defaults. There is no global copy context until it's
clearly needed.

**Rejected alternatives.** A JS `ThemeProvider` with a theme object adds runtime cost and
doesn't reach Tailwind classes. `variant="parade" | "lights"` props make the package know
about every app. CSS-in-JS would be a second styling system next to Tailwind.

---

## 3. What becomes shared

| Today | Moves to | Notes |
|---|---|---|
| `PhoneAuth.tsx` | `ui/PhoneAuthDialog` + `core/phone` (`toE164`, `formatPhone`) | Eyebrow/title/CTA copy become props. Lights uses it for **submitting and voting**. |
| Modal shell in `PhoneAuth` + `AdminEditButton` | `ui/Dialog` | Backdrop, `pop` panel, click-outside, aria. |
| `Countdown.tsx` | `ui/Countdown` | The Fraunces digit-width hack becomes a token (`--countdown-digit-width`). |
| `Results.tsx` | `ui/Leaderboard` taking generic rows `{id, title, subtitle, imageUrl, count}` | Lights may wrap it or build a podium on `core/useResults`. |
| Toast in `App.tsx` | `ui/Toaster` + `core/useToast` | |
| Ticker + `.marquee` CSS | `ui/Marquee` | |
| `rise` / `pop` keyframes | `ui/motion.css` | Including the `prefers-reduced-motion` guard. |
| Image pipeline in `AdminPhotoButton` (`decodeImage`, `sniffType`, `toJpeg`) | `core/image` + `core/uploadPublicImage()` | **Critical for lights**: residents will upload iPhone photos, and this code already handles the HEIC-labeled-as-PNG problem. Canvas re-encoding also strips EXIF GPS, which is good for privacy. |
| Photo `<input>` button | `ui/PhotoPicker` (adds a `capture="environment"` option) | |
| Session / settings poll / clock / `myVote` / `isAdmin` effects in `App.tsx` | `core` hooks: `useSession`, `useNow`, `useContestSettings` (poll), `useVotingWindow`, `useMyVote`, `useIsAdmin` | Behind a `SupabaseProvider` so each app passes its own client. |
| `hashId` shuffle + `?f=` pin | `core/useShuffledOrder` | Lights uses it for the gallery order. |
| 5-tap secret sign-in | `core/useSecretTaps` | |
| `EntryCard` vote-button label logic | `ui/VoteButton` | The card itself stays per app. |
| *(new)* directions link builder | `core/directions` | Generic, so it lives in core even though only lights uses it today. |
| `set-voting-window.mjs` | `tools/contest-admin.mjs --contest parade\|lights` | Reads `apps/<contest>/.env` (M3). |

**Stays in each app:** `EntryCard`, hero, `AdminEditButton`'s form, seed scripts, and the map
(lights-only for now; it can graduate to a package if a third site needs one).

**One existing gap to fix while extracting:** the parade's `get_results()` returns *every*
entry's count once results are visible, and the client slices off the top 3. Anyone can
call the RPC and see the full standings. The lights version should apply `limit 3` **in
SQL**, and the parade function can get the same one-line fix.

---

## 4. Lights site: product and data design

### Flows

- **Submit** (during the submission window, **one house per phone**): sign in with
  phone, take or choose a photo (resized client-side with the shared pipeline), enter
  the address, confirm the pin on a mini-map, submit. The entry is **pending until the
  admin approves it**.
- **Windows overlap** (decided). Submissions can stay open after voting starts, and a
  late entry starts collecting votes as soon as it's approved. Because of that:
  - The submitter can edit or withdraw freely **until voting opens**.
  - After voting opens, the owner can no longer withdraw. That would silently delete
    other people's votes through the cascade. The admin can still hide an entry.
  - After voting opens, the owner can't change the photo or address either. Allowing it
    would let someone swap a photo after collecting votes, and would flip a live entry
    back to pending in the middle of voting. The admin can still edit.
- **Browse**: gallery (shuffled order, like the parade ballot) ⇄ **map** toggle. Every
  entry shows a **navigate** icon button.
- **Vote** (during the voting window): same as the parade. One vote per phone, changeable
  until close. It's available from the gallery card and from the map's entry sheet.
- **Reveal**: when `results_visible` is flipped, show the top 3.
- **Admin** (phone-matched, like the parade): moderation queue (approve/hide), edit an
  entry, replace a photo.

### Location and geocoding

People submit either while standing at the house or from inside it, so **device GPS
is the best address signal we have**:

1. Ask for geolocation on a "Use my location" tap on the pin step (not unprompted: a
   denied prompt is sticky on iOS), drop a pin, and let the user move the map under it to adjust
   (M5 D6/D7).
2. Typed address = display text, plus a fallback geocode when GPS is denied. Use the
   **US Census Geocoder** (free, no API key, good US residential coverage) through a
   tiny Supabase Edge Function. The function also re-checks that the point is inside
   the neighborhood geofence.
3. The DB rejects any lat/lng outside the neighborhood bounding box (a check in the
   insert policy), so nobody can drop an entry across town.

### Map

**MapLibre GL JS** with a free dark vector basemap (e.g. CARTO Dark Matter, which needs
attribution), lazy-loaded so the gallery stays fast. Markers are HTML elements styled
as glowing bulbs, so they theme with CSS like everything else. Tapping a marker opens a
bottom sheet: photo, address, navigate, vote. M5's pin-confirm map already uses MapLibre and
CARTO Dark Matter through `apps/lights/src/map/`, which M6 extends (M5 D7/D8).

### Navigate button

`core/directions.ts`:

- iOS/iPadOS → `https://maps.apple.com/?daddr=<lat>,<lng>&q=<address>`
- everything else → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`
  (opens the Google Maps app on Android, the website on desktop)

It routes by coordinates, which is more reliable than address strings in a new
subdivision, and labels with the address. Optional later: a small chooser
(Apple / Google / Waze).

### Schema sketch (`lights` schema in the shared project)

```sql
lights.houses (
  id uuid pk,
  entry_number int generated always as identity,   -- display number
  submitted_by uuid not null unique references auth.users on delete cascade, -- 1 per phone
  address text not null,
  address_key text not null unique,                -- normalized, blocks duplicates
  lat double precision not null,
  lng double precision not null,
  photo_url text not null,
  title text,                                      -- optional, e.g. "The Griswold Special"
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'hidden')),
  created_at, updated_at
)

lights.votes (user_id uuid pk, house_id uuid fk, created_at, updated_at)  -- same as parade

lights.settings (
  submissions_open_at, submissions_close_at,
  voting_opens_at, voting_closes_at,
  voting_open bool,          -- kill switch
  submissions_open bool,     -- kill switch
  results_visible bool,
  geofence_min_lat, geofence_max_lat, geofence_min_lng, geofence_max_lng
)

-- admin: reuses public.admin_config / public.is_admin() (shared with the parade)
```

RLS highlights:

- `houses` select: `approved` rows to everyone; your own row to you; everything to admin.
- `houses` insert by owner: only while `submissions_are_open()`, inside the geofence,
  with `status = 'pending'`.
- `houses` update/delete by owner: only while submissions are open **and** voting hasn't
  opened yet (see "Windows overlap" above). A non-admin can't change `status`, and a
  trigger resets it to `pending` when the photo or address changes.
- `votes` insert/update: same as the parade, plus two conditions:
  - The target house must be `approved`.
  - **No self-votes** (decided): the target house's `submitted_by` must not be
    `auth.uid()`. The UI shows "Your house" in place of the vote button.
- Storage bucket `houses`: public read; writes only under `<auth.uid()>/…` and only while
  submissions are open.
- `get_results()`: security definer, `results_visible` gated, **`limit 3`**.

---

## 5. Design direction: "in-your-face holiday lights"

> Note: this was the first-pass direction. M4 made the final calls (tokens, fonts, every
> effect as CSS, layout, copy, measured guardrails); see
> [`docs/milestones/M4.md`](milestones/M4.md) "Design system". Where they differ, M4 wins.

- **The page is the night sky.** Near-black blue (`#05060d`) with faint snow/grain, so the
  colors actually glow.
- **Full-saturation C9 bulb palette**: red `#ff2d3d`, green `#22ff7a`, gold `#ffc21a`,
  blue `#2b8cff`, magenta `#ff3df0`, warm white `#fff3d6`.
- **Glow on everything that matters**: neon layered `text-shadow` on headings, and cards
  framed by a **chasing bulb string** (radial-gradient dots, animated color steps). The
  card you voted for goes fully lit.
- **Type**: a chunky marquee-sign display face (Bungee / Bungee Shade family) with a
  readable sans for body. Final picks in M4.
- **Hero**: a light-string swag across the top, plus countdown digits drawn as lit bulb
  segments.
- **Signature moment, the reveal**: the page "loses power" and dims, then #3, #2 and #1
  surge on one at a time with a brownout flicker.
- **Map**: dark basemap with markers as glowing bulbs in rotating colors; the selected
  marker pulses.
- **Guardrails (non-negotiable)**: nothing flashes more than 3×/sec (WCAG 2.3.1,
  seizure safety), so chases are slow color shifts and not strobes.
  `prefers-reduced-motion` makes every effect static (lights *on*, not animating). Body
  text contrast is verified against the dark background.

---

## 6. Milestones

Today is Nov 12. The contest dates set three hard gates:

| Gate | Date | Must be done |
|---|---|---|
| **Submissions open** | **Sat Nov 28** | M1, M3, M4, M5, **H** (hosting, on hold), plus M8's backend items (hosted `lights` schema exposed, SMS limits, window set) |
| **Voting opens** | **Tue Dec 8** | M6 (map + navigate), M7 (voting + reveal) |
| **Voting closes** | **Sun Dec 20** | Reveal is flipped manually after close |

⚠️ **Gate 1 is 16 days out**, so the schedule is tight:

- M3 runs in parallel with M1/M2.
- M2 is planned in full ([`docs/milestones/M2.md`](milestones/M2.md)), with the
  lights-critical extractions (tokens, phone auth, dialog, image pipeline, data hooks,
  countdown) ordered first.
- **H must come off hold by about Nov 23** to leave time for DNS and the domain before
  submissions open.

### M1: Monorepo conversion (no behavior change)
- Spec: [`docs/milestones/M1.md`](milestones/M1.md).
- npm workspaces; move the current app to `apps/parade` (src, public, `index.html`,
  scripts including `set-voting-window.mjs`, vite/ts config, `wrangler.jsonc`,
  `.env.example`). The local `.env` moves to `apps/parade/.env`. `supabase/` stays at the
  repo root because it becomes the shared project. Root `tsconfig.base.json` + shared
  eslint.
- **No hosting changes.** Keep the current Vercel deploy working without touching the
  dashboard: the root `vercel.json` gets `"buildCommand": "npm run build -w apps/parade"`
  and `"outputDirectory": "apps/parade/dist"` alongside the existing SPA rewrite.
  `wrangler.jsonc` moves into `apps/parade` ready for H, untouched except its
  editor-only `$schema` path.
- **Done when:** `npm run build -w apps/parade` is green locally, and the PR's Vercel
  preview serves the parade identically to production.

### M2: Shared packages + token contract
- Spec: [`docs/milestones/M2.md`](milestones/M2.md).
- Create `@wohills/core` and `@wohills/ui` and extract everything in the table in §3.
- Convert the parade to semantic tokens (`paper→bg`, `card→surface`, `ink→fg`,
  `red→primary`, `cobalt→accent`).
- Add `data-slot` hooks and `className` passthrough to every shared component.
- `get_results()` `limit 3` fix for the parade.
- **Done when:** before/after Playwright screenshots of the parade (pre-vote, live, voted,
  results) match, and `App.tsx` is mostly composition.

### M3: Lights backend
- Spec: [`docs/milestones/M3.md`](milestones/M3.md).
- `lights` schema in the shared project: exposure + grants, migrations for the tables in
  §4, RLS, `lights.voting_is_open()`, `lights.submissions_are_open()`,
  `lights.get_results()` (top 3), and the `houses` bucket policies. Reuse
  `public.is_admin()`.
- Geofence: I draft a bounding box around Worthington Hills from map data **for you to
  confirm**, then store it in `lights.settings`. Drafted in M3: lat 40.1175 – 40.1450,
  lng −83.0670 – −83.0305 (sources and derivation in `M3.md`); change it with
  `contest-admin --contest lights` (`GEOFENCE=…`).
- Census-geocoder Edge Function.
- `contest-admin` CLI gets `--contest lights` to set the submission and voting windows
  and the reveal flag in `lights.settings`.
- SQL tests for the fairness rules: double vote, out-of-window vote, out-of-geofence
  insert, self-vote, voting for a pending house, owner edit or withdraw after voting
  opens, a non-admin approving their own entry, reading counts before reveal.
- **Done when:** all rule tests pass against the local stack, and the parade's behavior
  is unchanged after `supabase db reset`.

### M4: Lights app shell + visual system
- Spec: [`docs/milestones/M4.md`](milestones/M4.md).
- Scaffold `apps/lights` on the shared packages.
- Lights `@theme` + `data-slot` effects; hero, countdown, gallery of the local seed's
  approved houses (real `lights` data through the shared hooks), phone auth dialog in theme.
- Design pass here; verify reduced-motion and flash-rate guardrails.
- **Done when:** the themed app runs locally against the local stack, and screenshots
  (phone and desktop) are on the PR for feedback.

### M5: Submission flow + moderation
- Spec: [`docs/milestones/M5.md`](milestones/M5.md). Pages `/enter` and `/admin`.
- Photo capture/pick, then shared resize/upload, address entry, GPS pin with drag
  confirm, geocode fallback, submit.
- "My entry" view: shows pending/approved status; edit or withdraw until voting opens,
  read-only after that; submission-window states.
- Admin moderation queue (approve/hide), edit, replace photo.
- **Done when:** a test phone can submit from an iPhone and an Android, the admin
  approves it, and it appears in the gallery. **This gates opening submissions.** Locally
  this is proven by Playwright on an emulated touch phone; the real-device pass needs HTTPS
  (geolocation), so it runs on H's preview URL (M5 "Notes", M8).

### M6: Map + navigation
- Lazy-loaded MapLibre dark map, bulb markers, entry bottom sheet, gallery ⇄ map toggle.
- `core/directions` navigate button on cards and the sheet.
- **Done when:** the navigate button opens Apple Maps on iOS and Google Maps on Android
  to the right house.

### M7: Voting + reveal
- Voting on cards and the map sheet (shared hooks/`VoteButton`), window countdowns.
- The submitter's own house shows "Your house" in place of the vote button.
- Late-approved entries appear mid-vote without a reload, via the existing 30s poll.
- Top-3 reveal with the "power surge" sequence.
- **Done when:** the full window lifecycle works locally (pre-vote → live →
  closed → revealed) using the admin preview toggle.

### M8: Launch hardening
- OG image and social meta for the lights site.
- Expose the `lights` schema on hosted. Revisit the SMS rate limits, which are now
  shared by both sites.
- `contest-admin` runbook for windows/reveal/admin phone.
- Playwright smoke tests for both apps in CI; accessibility pass.
- **Done when:** the runbook has been rehearsed end to end against the hosted Supabase
  project with test data, then wiped. Truncate only `lights.*` tables and the `houses`
  bucket; the parade data lives in the same project.

### H: Hosting + DNS (on hold, must land before submissions open)
- Confirm `worthingtonhills.org` uses Cloudflare DNS (a prerequisite for Worker custom
  domains).
- Parade: connect the `wh-4th-fan-vote` Worker via Workers Builds and verify the
  workspace install. Cut over from Vercel (§1 steps), then remove `vercel.json` /
  `.vercelignore` and update the README.
- Lights: create the `wh-holiday-lights` Worker via Workers Builds and attach
  **`holiday-lights.worthingtonhills.org`**.
- **Done when:** pushes to `main` deploy both apps via Workers Builds, both custom domains
  serve from Cloudflare, and Vercel is disconnected.

### Stretch (post-launch)
- "Light tour": a route through several entries (Google Maps URLs accept a limited number
  of waypoints, fewer on mobile, so longer tours would be split into legs).
- Award categories (Most Lights, Best Theme, the Griswold Award).
- Reuse the same project each year via a `season` column instead of wiping data.

---

## 7. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Supabase | **One shared project**, lights in its own `lights` Postgres schema (§1) |
| 2 | Who can submit | **Phone-verified, one house per phone** |
| 3 | Moderation | **Admin approves** before an entry is public |
| 4 | Self-voting | **Blocked** in RLS |
| 5 | Windows | **Overlapping**: owner edits/withdrawals lock when voting opens (§4) |
| 6 | Geofence | **Derived from map data by Claude, confirmed by you** (M3) |
| 7 | Domain | **`holiday-lights.worthingtonhills.org`** |
| 8 | Dates | **Submissions Nov 28 – Dec 15, voting Dec 8 – Dec 20** (reveal after close, manual flip) |
| 9 | Edit lock | **Confirmed**: owner edit/withdraw locks when voting opens |
| 10 | Results | **Top 3 with rank and vote counts** (same as the parade) |
| 11 | Admins | **Same single admin phone** as the parade (shared `public.admin_config`) |
| 12 | Navigate | **Platform default**: Apple Maps on iOS/iPadOS, Google Maps elsewhere |
| 13 | Entry name | **Optional** display name (`houses.title`), shown as the card title with the address underneath; falls back to the address |
| 14 | Hosting | **Cloudflare Workers for both sites**, deployed by **Workers Builds** (§1). **On hold**; parade stays on Vercel until H |

Still needed: when hosting resumes (by about Nov 23), confirm whether
`worthingtonhills.org` DNS is on Cloudflare (H).
