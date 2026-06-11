#!/usr/bin/env node
// Applies the voting window from env vars to the settings row in Supabase.
//
//   VOTING_OPENS_AT / VOTING_CLOSES_AT  ISO 8601 with timezone offset,
//                                       e.g. 2026-07-04T12:00:00-05:00.
//                                       An empty value clears that bound.
//   SUPABASE_URL (or VITE_SUPABASE_URL) project API URL
//   SUPABASE_SERVICE_ROLE_KEY           settings writes are blocked by RLS,
//                                       so this needs the service-role key
//                                       (local: printed by `supabase status`)
//
// The database enforces these timestamps inside RLS — the frontend countdown
// only displays them. Run `npm run set-window` after editing .env.

try {
  process.loadEnvFile()
} catch {
  // no .env file — rely on exported environment variables
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function parseBound(name) {
  const raw = process.env[name]
  if (raw === undefined) fail(`${name} is not set (use an empty value to clear the bound)`)
  if (raw.trim() === '') return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) fail(`${name}="${raw}" is not a valid ISO 8601 timestamp`)
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw.trim()))
    fail(`${name}="${raw}" has no timezone offset — append e.g. -05:00 or Z to avoid ambiguity`)
  return date
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url) fail('SUPABASE_URL (or VITE_SUPABASE_URL) is not set')
if (!key) fail('SUPABASE_SERVICE_ROLE_KEY is not set')

const opens = parseBound('VOTING_OPENS_AT')
const closes = parseBound('VOTING_CLOSES_AT')
if (opens && closes && opens >= closes) fail('VOTING_OPENS_AT must be before VOTING_CLOSES_AT')

const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/settings?id=eq.true`, {
  method: 'PATCH',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({
    voting_opens_at: opens?.toISOString() ?? null,
    voting_closes_at: closes?.toISOString() ?? null,
  }),
})

if (!res.ok) fail(`Supabase responded ${res.status}: ${await res.text()}`)
const [row] = await res.json()
if (!row) fail('No settings row found — run the seed first')

console.log('✓ Voting window applied:')
console.log(`  opens  ${row.voting_opens_at ?? '(no restriction)'}`)
console.log(`  closes ${row.voting_closes_at ?? '(no restriction)'}`)
