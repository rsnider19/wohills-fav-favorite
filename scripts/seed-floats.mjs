#!/usr/bin/env node
// Loads placeholder "Dynamic Duos" content onto the existing entries so the
// live-voting / results UI can be previewed before parade day. Matches rows by
// entry_number and only sets theme/description/emoji — real content is filled
// in day-of via the site's ✏️ Edit button (which overwrites these).
//
//   SUPABASE_URL (or VITE_SUPABASE_URL)  project API URL
//   SUPABASE_SERVICE_ROLE_KEY            entries writes are blocked by RLS,
//                                        so this needs the service-role key
//
// Run: npm run seed-floats   (after editing .env). Re-run anytime; it upserts.

try {
  process.loadEnvFile()
} catch {
  // no .env file — rely on exported environment variables
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Placeholder dynamic-duo themes, keyed by street.
const floats = {
  Blindbrook: {
    theme: 'Peanut Butter & Jelly',
    emoji: '🥪',
    description: 'A sticky-sweet classic — two halves that are way better together.',
  },
  NewCopperMark: {
    theme: 'Batman & Robin',
    emoji: '🦇',
    description: 'The Dynamic Duo themselves, rolling out a caped-crusader cruiser.',
  },
  Blackstone: {
    theme: 'Mario & Luigi',
    emoji: '🍄',
    description: "It's-a us! A pipe-dream float straight out of the Mushroom Kingdom.",
  },
  'Shelley & Tenney': {
    theme: 'Salt & Pepper',
    emoji: '🧂',
    description: 'A perfectly seasoned pair shaking up the parade route.',
  },
  'Mission Hills': {
    theme: 'Sun & Moon',
    emoji: '🌞',
    description: 'Day meets night in a celestial float that lights up the street.',
  },
  Candlewood: {
    theme: 'Thunder & Lightning',
    emoji: '⚡',
    description: 'A booming, flashing spectacle you can hear before you see it.',
  },
}

async function patch(street, body) {
  const res = await fetch(
    `${url}/rest/v1/entries?street=eq.${encodeURIComponent(street)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

let updated = 0
for (const [street, data] of Object.entries(floats)) {
  const rows = await patch(street, data)
  if (rows.length === 0) {
    console.warn(`  • no entry matched street "${street}" — skipped`)
    continue
  }
  console.log(`  ✓ ${street} → ${data.emoji} ${data.theme}`)
  updated += rows.length
}

console.log(`\nDone. Updated ${updated} float${updated === 1 ? '' : 's'}.`)
