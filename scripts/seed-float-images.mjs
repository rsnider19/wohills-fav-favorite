#!/usr/bin/env node
// Uploads example float photos into the public `floats` storage bucket and
// points each entry's image_url at them — purely for previewing the live UI
// before parade day. Real photos are uploaded day-of via the site's 📷 button
// (which overwrites these). Source images come from picsum.photos (a stock
// placeholder service), one stable image per street.
//
//   SUPABASE_URL (or VITE_SUPABASE_URL)  project API URL
//   SUPABASE_SERVICE_ROLE_KEY            storage upload + entries write
//
// Run: npm run seed-float-images   (after editing .env). Re-run anytime.

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

const BUCKET = 'floats'
// Stable picsum seed per street so re-runs produce the same image.
const streets = [
  'Blindbrook',
  'NewCopperMark',
  'Blackstone',
  'Shelley & Tenney',
  'Mission Hills',
  'Candlewood',
]

async function fetchImage(seed) {
  const res = await fetch(`https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`)
  if (!res.ok) throw new Error(`picsum ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function upload(path, bytes) {
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  })
  if (!res.ok) throw new Error(`upload ${res.status} ${await res.text()}`)
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`
}

async function setImageUrl(street, imageUrl) {
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
      body: JSON.stringify({ image_url: imageUrl }),
    },
  )
  if (!res.ok) throw new Error(`patch ${res.status} ${await res.text()}`)
  return res.json()
}

let done = 0
for (const street of streets) {
  const slug = street.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const bytes = await fetchImage(slug)
  const publicUrl = await upload(`seed/${slug}.jpg`, bytes)
  const rows = await setImageUrl(street, publicUrl)
  if (rows.length === 0) {
    console.warn(`  • no entry matched street "${street}" — image uploaded but unlinked`)
    continue
  }
  console.log(`  ✓ ${street} → ${publicUrl}`)
  done += 1
}

console.log(`\nDone. Uploaded + linked ${done} image${done === 1 ? '' : 's'}.`)
