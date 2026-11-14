#!/usr/bin/env node
// Contest admin CLI: applies a contest's settings from its env file to the
// database. Replaces apps/parade/scripts/set-voting-window.mjs.
//
//   node tools/contest-admin.mjs --contest parade|lights [--env-file <path>] [--show] [--dry-run]
//   npm run set-window                                  # parade (unchanged)
//   npm run contest-admin -- --contest lights
//
// Reads apps/<contest>/.env (resolved from the repo root, not the cwd) unless
// --env-file is given. Variables already exported in the shell win over the
// file. Only variables that are SET are applied; an unset variable leaves that
// setting unchanged, and an empty value clears a timestamp or the admin phone.
//
//   SUPABASE_URL (or VITE_SUPABASE_URL)   project API URL
//   SUPABASE_SERVICE_ROLE_KEY             settings are writable only by the service role
//                                         (local: `supabase status`; never ship it to a browser)
//
//   VOTING_OPENS_AT / VOTING_CLOSES_AT    ISO 8601 with offset, e.g. 2026-12-08T00:00:00-05:00
//   VOTING_OPEN                           true|false   kill switch
//   RESULTS_VISIBLE                       true|false   the reveal
//   ADMIN_PHONE                           US phone; shared by every contest (public.admin_config)
//   lights only:
//   SUBMISSIONS_OPEN_AT / SUBMISSIONS_CLOSE_AT   ISO 8601 with offset
//   SUBMISSIONS_OPEN                      true|false   kill switch
//   GEOFENCE_POLYGON                      path to a GeoJSON Polygon (or Feature) file; sets the polygon and
//                                         derives the four box columns from it (relative paths resolve
//                                         from your current directory)
//   GEOFENCE                              minLat,maxLat,minLng,maxLng (decimal degrees); sets the box and
//                                         CLEARS the polygon. Setting GEOFENCE and GEOFENCE_POLYGON together is an error.
//
// --show prints the current settings and changes nothing. --dry-run prints
// what would be sent. The database enforces every window inside RLS; the
// sites' countdowns only display them.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { parseGeofencePolygon } from './geofence-polygon.mjs'

const CONTESTS = {
  parade: { schema: 'public', lightsOnly: false },
  lights: { schema: 'lights', lightsOnly: true },
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

let args
try {
  args = parseArgs({
    options: {
      contest: { type: 'string' },
      'env-file': { type: 'string' },
      show: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  }).values
} catch (error) {
  fail(error.message)
}
const contest = CONTESTS[args.contest]
if (!contest) fail(`--contest must be one of: ${Object.keys(CONTESTS).join(', ')}`)

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = args['env-file'] ? resolve(args['env-file']) : resolve(repoRoot, 'apps', args.contest, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
else if (args['env-file']) fail(`${envFile} does not exist`)
else console.log(`(no ${envFile}; using exported environment variables)`)

function parseTime(name) {
  const raw = process.env[name]
  if (raw === undefined) return undefined
  if (raw.trim() === '') return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) fail(`${name}="${raw}" is not a valid ISO 8601 timestamp`)
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw.trim()))
    fail(`${name}="${raw}" has no timezone offset — append e.g. -05:00 or Z to avoid ambiguity`)
  return date.toISOString()
}

function parseBool(name) {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return undefined
  if (!/^(true|false)$/i.test(raw.trim())) fail(`${name}="${raw}" must be true or false`)
  return raw.trim().toLowerCase() === 'true'
}

function parseGeofence() {
  const raw = process.env.GEOFENCE
  const file = process.env.GEOFENCE_POLYGON
  const hasBox = raw !== undefined && raw.trim() !== ''
  const hasFile = file !== undefined && file.trim() !== ''
  if (hasBox && hasFile) fail('Set GEOFENCE or GEOFENCE_POLYGON, not both')
  if (hasFile) {
    const path = resolve(file.trim())
    if (!existsSync(path)) fail(`GEOFENCE_POLYGON=${file} does not exist`)
    try {
      return parseGeofencePolygon(readFileSync(path, 'utf8'))
    } catch (error) {
      fail(`GEOFENCE_POLYGON=${file} ${error.message}`)
    }
  }
  if (!hasBox) return {}
  const parts = raw.split(',').map((p) => Number(p.trim()))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
    fail(`GEOFENCE="${raw}" must be four numbers: minLat,maxLat,minLng,maxLng`)
  const [minLat, maxLat, minLng, maxLng] = parts
  if (!(minLat < maxLat && minLng < maxLng)) fail('GEOFENCE needs minLat < maxLat and minLng < maxLng')
  if (Math.abs(minLat) > 90 || Math.abs(maxLat) > 90 || Math.abs(minLng) > 180 || Math.abs(maxLng) > 180)
    fail('GEOFENCE is out of range (lat ±90, lng ±180)')
  console.log('(GEOFENCE sets a plain box: the polygon is cleared. Use GEOFENCE_POLYGON to keep a shape.)')
  return {
    geofence_min_lat: minLat,
    geofence_max_lat: maxLat,
    geofence_min_lng: minLng,
    geofence_max_lng: maxLng,
    geofence_polygon: null,
  }
}

function parseAdminPhone() {
  const raw = process.env.ADMIN_PHONE
  if (raw === undefined) return undefined
  if (raw.trim() === '') return null
  const digits = raw.replace(/\D/g, '')
  const normalized = digits.length === 10 ? `1${digits}` : digits
  if (normalized.length !== 11 || !normalized.startsWith('1')) fail(`ADMIN_PHONE="${raw}" is not a valid US phone number`)
  return normalized // digits only, matching the JWT phone claim
}

const lightsVars = ['SUBMISSIONS_OPEN_AT', 'SUBMISSIONS_CLOSE_AT', 'SUBMISSIONS_OPEN', 'GEOFENCE', 'GEOFENCE_POLYGON']
if (!contest.lightsOnly) {
  const stray = lightsVars.filter((name) => process.env[name] !== undefined && process.env[name] !== '')
  if (stray.length) fail(`${stray.join(', ')} only apply to --contest lights`)
}

const patch = Object.fromEntries(
  Object.entries({
    voting_opens_at: parseTime('VOTING_OPENS_AT'),
    voting_closes_at: parseTime('VOTING_CLOSES_AT'),
    voting_open: parseBool('VOTING_OPEN'),
    results_visible: parseBool('RESULTS_VISIBLE'),
    ...(contest.lightsOnly
      ? {
          submissions_open_at: parseTime('SUBMISSIONS_OPEN_AT'),
          submissions_close_at: parseTime('SUBMISSIONS_CLOSE_AT'),
          submissions_open: parseBool('SUBMISSIONS_OPEN'),
          ...parseGeofence(),
        }
      : {}),
  }).filter(([, value]) => value !== undefined),
)
const adminPhone = parseAdminPhone()

for (const [open, close] of [
  ['voting_opens_at', 'voting_closes_at'],
  ['submissions_open_at', 'submissions_close_at'],
]) {
  if (patch[open] && patch[close] && patch[open] >= patch[close]) fail(`${open} must be before ${close}`)
}

const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url) fail('SUPABASE_URL (or VITE_SUPABASE_URL) is not set')
if (!key && !args['dry-run']) fail('SUPABASE_SERVICE_ROLE_KEY is not set')

console.log(`Contest: ${args.contest} (schema ${contest.schema}) · target: ${new URL(url).host}`)

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'Accept-Profile': contest.schema,
  'Content-Profile': contest.schema,
}

const fmt = (iso) =>
  iso
    ? `${iso}  (${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} ET)`
    : '(no restriction)'

function printSettings(row) {
  if (contest.lightsOnly) {
    console.log(`  submissions  ${row.submissions_open ? 'enabled' : 'KILL SWITCH OFF'}`)
    console.log(`    opens      ${fmt(row.submissions_open_at)}`)
    console.log(`    closes     ${fmt(row.submissions_close_at)}`)
  }
  console.log(`  voting       ${row.voting_open ? 'enabled' : 'KILL SWITCH OFF'}`)
  console.log(`    opens      ${fmt(row.voting_opens_at)}`)
  console.log(`    closes     ${fmt(row.voting_closes_at)}`)
  console.log(`  results      ${row.results_visible ? 'VISIBLE (revealed)' : 'hidden'}`)
  if (contest.lightsOnly) {
    const lat = `${row.geofence_min_lat}..${row.geofence_max_lat}`
    const lng = `${row.geofence_min_lng}..${row.geofence_max_lng}`
    console.log(
      Array.isArray(row.geofence_polygon)
        ? `  geofence     polygon (${row.geofence_polygon.length} vertices) in lat ${lat}, lng ${lng}`
        : `  geofence     box lat ${lat} lng ${lng}`,
    )
  }
}

if (args['dry-run']) {
  console.log('Dry run, nothing sent. Would PATCH settings with:')
  console.log(JSON.stringify(patch, null, 2))
  if (adminPhone !== undefined) console.log(`Would set public.admin_config.admin_phone = ${adminPhone ?? 'null'}`)
  process.exit(0)
}

async function request(path, init) {
  const res = await fetch(`${url}/rest/v1/${path}`, init)
  if (!res.ok) fail(`Supabase responded ${res.status}: ${await res.text()}`)
  return res
}

if (args.show) {
  const [row] = await (await request('settings?id=eq.true&select=*', { headers })).json()
  if (!row) fail('No settings row found — run the migrations first')
  printSettings(row)
  process.exit(0)
}

if (Object.keys(patch).length === 0 && adminPhone === undefined) {
  fail('Nothing to apply: set at least one variable (see the header of tools/contest-admin.mjs)')
}

if (Object.keys(patch).length > 0) {
  const res = await request('settings?id=eq.true', {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  const [row] = await res.json()
  if (!row) fail('No settings row found — run the migrations first')
  console.log('✓ Settings applied:')
  printSettings(row)
}

if (adminPhone !== undefined) {
  // admin_config lives in public whatever the contest: one admin for both sites.
  await request('admin_config?on_conflict=id', {
    method: 'POST',
    headers: {
      ...headers,
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: true, admin_phone: adminPhone }),
  })
  console.log(adminPhone ? `✓ Admin phone set: +${adminPhone} (both contests)` : '✓ Admin phone cleared')
}
