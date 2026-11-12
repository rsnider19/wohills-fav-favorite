# Holiday Lights Contest: Monorepo + Milestone Plan

Status: **draft for discussion**. Nothing here is built yet.

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
│   │   ├── src/  index.html  vite.config.ts  vercel.json  public/
│   │   ├── supabase/            # parade's Supabase project (migrations untouched)
│   │   └── scripts/             # seed-floats, seed-float-images
│   └── lights/
│       ├── src/  index.html  vite.config.ts  vercel.json  public/
│       └── supabase/            # lights' Supabase project
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

**Deploys.** There will be two Vercel projects on the same repo, with Root Directory set
to `apps/parade` and `apps/lights`. Each gets an "Ignored Build Step" that skips the build
unless its app or `packages/` changed. ⚠️ The parade's Vercel project root directory must
be changed **in the same window** that the move merges, or the live parade site's next
deploy breaks. (The README still describes Cloudflare/wrangler; Vercel is what actually
deploys now, so `wrangler.jsonc` and the deploy script can be retired in M1.)

### Supabase: one project per site (recommended)

| | Separate projects (recommended) | One shared project |
|---|---|---|
| Parade DB | Untouched; its results stay frozen as-is | Needs migrating to a multi-contest schema |
| Schema fit | Lights gets a schema designed for submissions + geodata | Generic `contests`/`entries` tables have to serve both |
| Blast radius | A bad lights migration can't touch parade data | Shared |
| Cost/ops | Twilio creds configured twice; Supabase free tier allows **2 active projects** per org | One config |
| Phone users | A neighbor re-verifies on the new site (sessions are per-origin anyway) | Same `auth.users` row, but still a new login per domain |

The fairness rules (votes PK on `user_id`, `voting_is_open()`, `is_admin()`,
`results_visible`-gated `get_results()`) are SQL patterns, so we **copy them** into the
lights migrations and document them once as a "contest contract" in
`packages/core/README.md`. Sharing SQL across two Supabase projects via a package isn't
worth the tooling.

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

```css
/* apps/parade/src/index.css */
@import "tailwindcss";
@import "@wohills/ui/tokens.css";
@import "@wohills/ui/motion.css";
@source "../../../packages/ui/src";   /* Tailwind must scan the package for classes */

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
| `set-voting-window.mjs` | `tools/contest-admin.mjs --app lights` | Reads `apps/<app>/.env`. |

**Stays in each app:** `EntryCard`, hero, `AdminEditButton`'s form, seed scripts, and the map
(lights-only for now; it can graduate to a package if a third site needs one).

**One existing gap to fix while extracting:** the parade's `get_results()` returns *every*
entry's count once results are visible, and the client slices off the top 3. Anyone can
call the RPC and see the full standings. The lights version should apply `limit 3` **in
SQL**, and the parade function can get the same one-line fix.

---

## 4. Lights site: product and data design

### Flows

- **Submit** (during the submission window): sign in with phone, take or choose a photo
  (resized client-side with the shared pipeline), enter the address, confirm the pin on
  a mini-map, submit. While submissions are open, the submitter can edit or withdraw
  their entry.
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

1. Ask for geolocation when the photo is taken, drop a pin, and let the user drag to adjust.
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
bottom sheet: photo, address, navigate, vote.

### Navigate button

`core/directions.ts`:

- iOS/iPadOS → `https://maps.apple.com/?daddr=<lat>,<lng>&q=<address>`
- everything else → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`
  (opens the Google Maps app on Android, the website on desktop)

It routes by coordinates, which is more reliable than address strings in a new
subdivision, and labels with the address. Optional later: a small chooser
(Apple / Google / Waze).

### Schema sketch (lights Supabase project)

```sql
houses (
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

votes (user_id uuid pk, house_id uuid fk, created_at, updated_at)   -- same as parade

settings (
  submissions_open_at, submissions_close_at,
  voting_opens_at, voting_closes_at,
  voting_open bool,          -- kill switch
  submissions_open bool,     -- kill switch
  results_visible bool,
  geofence_min_lat, geofence_max_lat, geofence_min_lng, geofence_max_lng
)

admin_config (admin_phone)                                          -- same as parade
```

RLS highlights:

- `houses` select: `approved` rows to everyone; your own row to you; everything to admin.
- `houses` insert/update by owner: only while `submissions_are_open()`, inside the
  geofence, and `status` can't be changed by a non-admin (a trigger resets it to
  `pending` when the photo or address changes).
- `votes` insert/update: same as the parade, plus the target house must be `approved`.
- Storage bucket `houses`: public read; writes only under `<auth.uid()>/…` and only while
  submissions are open.
- `get_results()`: security definer, `results_visible` gated, **`limit 3`**.

---

## 5. Design direction: "in-your-face holiday lights"

> Note: the `frontend-design` skill wasn't installed in the planning session, so this is
> a first-pass direction to be refined in M4.

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

Today is Nov 12. Submissions only need M1 → M5. The map (M6) and voting (M7) can ship
after submissions open, as long as they land before voting opens. M3 can run in parallel
with M2.

### M1: Monorepo conversion (no behavior change)
- npm workspaces; move the current app to `apps/parade` (src, public, supabase, scripts,
  vite/ts/vercel config); root `tsconfig.base.json` + shared eslint.
- Retire `wrangler.jsonc` / `npm run deploy`, update the README.
- Repoint the parade Vercel project's Root Directory; add the ignored-build-step.
- **Done when:** `npm run build -w apps/parade` is green and the deployed parade site is
  identical.

### M2: Shared packages + token contract
- Create `@wohills/core` and `@wohills/ui` and extract everything in the table in §3.
- Convert the parade to semantic tokens (`paper→bg`, `card→surface`, `ink→fg`,
  `red→primary`, `cobalt→accent`).
- Add `data-slot` hooks and `className` passthrough to every shared component.
- `get_results()` `limit 3` fix for the parade.
- **Done when:** before/after Playwright screenshots of the parade (pre-vote, live, voted,
  results) match, and `App.tsx` is mostly composition.

### M3: Lights backend
- New Supabase project; migrations for the schema in §4, RLS, `voting_is_open()`,
  `submissions_are_open()`, `is_admin()`, `get_results()` (top 3), `houses` bucket
  policies, geofence check.
- Census-geocoder Edge Function.
- Local `config.toml` on a third port range (e.g. 56xxx) with test OTP numbers.
- SQL tests for the fairness rules: double vote, out-of-window vote, out-of-geofence
  insert, a non-admin approving their own entry, reading counts before reveal.
- **Done when:** all rule tests pass against the local stack.

### M4: Lights app shell + visual system
- Scaffold `apps/lights` on the shared packages.
- Lights `@theme` + `data-slot` effects; hero, countdown, gallery of mock entries,
  phone auth dialog in theme.
- Run the `frontend-design` pass here; verify reduced-motion and flash-rate guardrails.
- **Done when:** a themed preview deploy with mock data is up for feedback.

### M5: Submission flow + moderation
- Photo capture/pick, then shared resize/upload, address entry, GPS pin with drag
  confirm, geocode fallback, submit.
- "My entry" view (edit/withdraw while open), submission-window states.
- Admin moderation queue (approve/hide), edit, replace photo.
- **Done when:** a test phone can submit from an iPhone and an Android, the admin
  approves it, and it appears in the gallery. **This gates opening submissions.**

### M6: Map + navigation
- Lazy-loaded MapLibre dark map, bulb markers, entry bottom sheet, gallery ⇄ map toggle.
- `core/directions` navigate button on cards and the sheet.
- **Done when:** the navigate button opens Apple Maps on iOS and Google Maps on Android
  to the right house.

### M7: Voting + reveal
- Voting on cards and the map sheet (shared hooks/`VoteButton`), window countdowns.
- Top-3 reveal with the "power surge" sequence.
- **Done when:** the full window lifecycle works in preview (pre-vote → live →
  closed → revealed) using the admin preview toggle.

### M8: Launch hardening
- Domain (e.g. `lights.worthingtonhills.org`), OG image, Twilio on the new project, SMS
  rate limits.
- `contest-admin` runbook for windows/reveal/admin phone.
- Playwright smoke tests for both apps in CI; accessibility pass.
- **Done when:** the runbook has been rehearsed end to end on production with test data,
  then wiped.

### Stretch (post-launch)
- "Light tour": a route through several entries (Google Maps URLs accept a limited number
  of waypoints, fewer on mobile, so longer tours would be split into legs).
- Award categories (Most Lights, Best Theme, the Griswold Award).
- Reuse the same project each year via a `season` column instead of wiping data.

---

## 7. Open decisions

1. **Supabase**: separate project for lights (recommended) or one shared project?
2. **Who can submit**: phone-verified residents only, one entry per phone (recommended)?
3. **Moderation**: admin approval before an entry is public (recommended for public
   photo uploads), or auto-publish with admin hide?
4. **Self-voting**: may a submitter vote for their own house? (Easy to block in RLS.)
5. **Dates**: submission window and voting window. Do they overlap or run back to back?
6. **Geofence**: the neighborhood boundary (a bounding box is fine to start).
7. **Domain** for the lights site.
