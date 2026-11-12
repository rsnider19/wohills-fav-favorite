# @wohills/core

Logic shared by the Worthington Hills contest sites: the Supabase provider and hooks,
phone helpers, the photo pipeline, countdown math and the directions link builder. No
styling; themed components live in `@wohills/ui`.

This is an internal, source-only package. It has no build step: each app's Vite compiles
`src/` directly. Import only from `@wohills/core` (the `src/index.ts` barrel).

## Using it

```tsx
import { createClient } from '@supabase/supabase-js'
import { SupabaseProvider } from '@wohills/core'

// Parade: default `public` schema. Lights: its own schema in the same project.
const supabase = createClient(url, anonKey, { db: { schema: 'lights' } })

createRoot(root).render(
  <SupabaseProvider client={supabase}>
    <App />
  </SupabaseProvider>,
)
```

Every hook reads the client from the provider, so table and function names resolve in
the client's schema. The exception is `useIsAdmin()`, which always calls
`public.is_admin()`, because both contests share one admin.

## The contest contract

A contest is a Postgres schema with these objects. The hooks rely on them, and the
database (not the client) enforces every fairness rule.

| Object | Shape | Rules | Used by |
|---|---|---|---|
| `settings` | one row: `voting_open boolean`, `results_visible boolean`, `voting_opens_at timestamptz null`, `voting_closes_at timestamptz null`, plus contest-specific columns | readable by `anon`/`authenticated`; writable only with the service role | `useContestSettings`, `votingWindow` |
| `voting_is_open()` | `boolean`: kill switch AND `now()` inside the window (database clock) | used inside the `votes` RLS policies | (RLS) |
| `votes` | `user_id uuid primary key references auth.users`, `<target>_id uuid` (`entry_id` / `house_id`), `created_at`, `updated_at` | select own row only; insert/update own row only while `voting_is_open()`; the PK makes a second vote impossible (upsert changes it) | `useMyVote` |
| `get_results()` | `security definer`; returns no rows unless `results_visible`; at most **3** rows ordered by vote count desc, then a stable tiebreak | the only way to read tallies | `useResults` |
| `public.is_admin()` | `boolean`: JWT phone = `public.admin_config.admin_phone` | shared by every contest | `useIsAdmin` |

Client clocks and countdowns are display only. Parade: `public` schema, target
`entries` / `entry_id`. Lights (M3): `lights` schema, target `houses` / `house_id`, plus
its own rules (only approved houses, no self-votes, submission window).

## Tests

`npm test` at the repo root runs the vitest suites in `src/*.test.ts`.
