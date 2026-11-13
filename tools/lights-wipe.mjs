#!/usr/bin/env node
// Wipes the holiday-lights contest data, and nothing else: every row of lights.votes and
// lights.houses and every object in the `houses` storage bucket. The parade (public.*,
// the `floats` bucket), auth users, lights.settings and the admin phone are never touched.
// Used after a rehearsal with test data (docs/runbook-lights.md), never once real entries
// exist.
//
//   node tools/lights-wipe.mjs [--env-file <path>]                 # dry run: counts only
//   node tools/lights-wipe.mjs [--env-file <path>] --yes <host>    # wipe; <host> must match
//
// Same env as contest-admin: apps/lights/.env (resolved from the repo root) unless
// --env-file is given; exported variables win. Needs SUPABASE_URL (or VITE_SUPABASE_URL)
// and SUPABASE_SERVICE_ROLE_KEY. Rows go through PostgREST and photos through the Storage
// API (Supabase blocks direct SQL deletes on storage.objects). Entry numbers keep counting;
// the script prints the one SQL line that restarts them at 1.

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

let args
try {
  args = parseArgs({ options: { 'env-file': { type: 'string' }, yes: { type: 'string' } } }).values
} catch (error) {
  fail(error.message)
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = args['env-file'] ? resolve(args['env-file']) : resolve(repoRoot, 'apps', 'lights', '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
else if (args['env-file']) fail(`${envFile} does not exist`)

const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url) fail('SUPABASE_URL (or VITE_SUPABASE_URL) is not set')
if (!key) fail('SUPABASE_SERVICE_ROLE_KEY is not set')
const host = new URL(url).host
const base = { apikey: key, Authorization: `Bearer ${key}` }

async function call(path, init = {}) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...base, ...init.headers } })
  // Never echo the key; the body is Supabase's own error text.
  if (!res.ok) fail(`${init.method ?? 'GET'} ${path.split('?')[0]} → ${res.status}: ${await res.text()}`)
  return res
}

/** Exact row count of a table through PostgREST (HEAD + count=exact). */
async function count(schema, table) {
  const res = await call(`/rest/v1/${table}?select=*`, {
    method: 'HEAD',
    headers: { 'Accept-Profile': schema, Prefer: 'count=exact' },
  })
  return Number(res.headers.get('content-range')?.split('/')[1] ?? NaN)
}

/** Every object path in a bucket. Owners' photos sit one folder deep (<uid>/<file>); deeper
 *  folders are walked too, so nothing is left behind. */
async function listAll(bucket, prefix = '') {
  const paths = []
  for (let offset = 0; ; offset += 1000) {
    const res = await call(`/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    const items = await res.json()
    for (const item of items) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      // Folders come back with a null id.
      if (item.id === null) paths.push(...(await listAll(bucket, path)))
      else paths.push(path)
    }
    if (items.length < 1000) return paths
  }
}

async function snapshot() {
  return {
    lights: {
      houses: await count('lights', 'houses'),
      votes: await count('lights', 'votes'),
      photos: (await listAll('houses')).length,
    },
    parade: {
      entries: await count('public', 'entries'),
      votes: await count('public', 'votes'),
      photos: (await listAll('floats')).length,
    },
  }
}

const show = (label, s) =>
  console.log(
    `${label}  lights: ${s.lights.houses} houses, ${s.lights.votes} votes, ${s.lights.photos} photos` +
      `  ·  parade (never touched): ${s.parade.entries} entries, ${s.parade.votes} votes, ${s.parade.photos} photos`,
  )

console.log(`Target: ${host}`)
const before = await snapshot()
show('Now   ', before)

if (args.yes === undefined) {
  console.log(`Dry run, nothing deleted. To wipe the lights data on ${host}:`)
  console.log(`  node tools/lights-wipe.mjs${args['env-file'] ? ` --env-file ${args['env-file']}` : ''} --yes ${host}`)
  process.exit(0)
}
if (args.yes !== host) fail(`--yes ${args.yes} does not match the target ${host}; nothing deleted`)

// Rows first (votes cascade with their house anyway), then the photos: the same order as
// an owner's withdrawal.
const lights = { 'Accept-Profile': 'lights', 'Content-Profile': 'lights' }
await call('/rest/v1/votes?user_id=not.is.null', { method: 'DELETE', headers: lights })
await call('/rest/v1/houses?id=not.is.null', { method: 'DELETE', headers: lights })
const photos = await listAll('houses')
for (let i = 0; i < photos.length; i += 100) {
  await call('/storage/v1/object/houses', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: photos.slice(i, i + 100) }),
  })
}

const after = await snapshot()
show('After ', after)
if (after.lights.houses || after.lights.votes || after.lights.photos) fail('Something is left in lights; run it again')
if (JSON.stringify(after.parade) !== JSON.stringify(before.parade)) fail('The parade counts changed. Stop and investigate.')
console.log('✓ Lights data wiped; the parade is unchanged.')
console.log('Entry numbers keep counting. To start again at No. 1, run in the SQL editor (or psql):')
console.log('  alter table lights.houses alter column entry_number restart with 1;')
