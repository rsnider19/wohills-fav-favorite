#!/usr/bin/env node
// End-to-end smoke test of the lights backend through the real APIs
// (PostgREST with the `lights` schema exposed, Storage, Auth, Edge Functions).
// The SQL rules themselves are covered by `supabase test db`.
//
// LOCAL STACK ONLY: refuses any URL that isn't 127.0.0.1/localhost.
//
//   eval "$(npx --yes supabase@3.1.0 status -o env)"      # API_URL, ANON_KEY, SERVICE_ROLE_KEY
//   npx --yes supabase@3.1.0 functions serve --env-file <file with
//       CENSUS_GEOCODER_URL=http://host.docker.internal:55398> &
//   node supabase/tests/lights-smoke.mjs
//
// It starts a Census stub on :55398 (the edge runtime reaches it through
// host.docker.internal). Set LIGHTS_SMOKE_REAL_CENSUS=1 to skip the stub when
// the function is served against the real Census geocoder.
// Needs the local seed (supabase db reset). Restores what it changes.

import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const url = process.env.API_URL ?? process.env.SUPABASE_URL
const anonKey = process.env.ANON_KEY ?? process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) {
  console.error('✗ Set API_URL, ANON_KEY and SERVICE_ROLE_KEY (eval "$(supabase status -o env)")')
  process.exit(1)
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  console.error(`✗ ${url} is not the local stack; this script never runs against hosted Supabase`)
  process.exit(1)
}

const opts = { db: { schema: 'lights' }, auth: { persistSession: false, autoRefreshToken: false } }
const anon = createClient(url, anonKey, opts)
const service = createClient(url, serviceKey, opts)
const SEED_APPROVED_OWNED_BY_0103 = '22222222-0000-4000-8000-000000000001'
const SEED_PENDING = '22222222-0000-4000-8000-000000000006'
// Smallest valid JPEG (1×1).
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)

let passed = 0
async function step(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}\n  ${error?.stack ?? error}`)
    throw error
  }
}

async function signIn(phone) {
  const client = createClient(url, anonKey, opts)
  // GoTrue allows one OTP request per phone every 4 s, so back-to-back runs can
  // hit the cooldown; wait it out instead of failing.
  let sent = await client.auth.signInWithOtp({ phone })
  for (let attempt = 0; attempt < 3 && sent.error?.code === 'over_sms_send_rate_limit'; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    sent = await client.auth.signInWithOtp({ phone })
  }
  assert.equal(sent.error, null, `otp for ${phone}: ${sent.error?.message}`)
  const { data, error } = await client.auth.verifyOtp({ phone, token: '123456', type: 'sms' })
  assert.equal(error, null, `verify ${phone}: ${error?.message}`)
  return { client, user: data.user, token: data.session.access_token }
}

function startCensusStub() {
  const server = createServer((req, res) => {
    const address = (new URL(req.url, 'http://stub').searchParams.get('address') ?? '').toLowerCase()
    const addressMatches = address.startsWith('1221 candlewood dr')
      ? [{ matchedAddress: '1221 CANDLEWOOD DR, COLUMBUS, OH, 43235', coordinates: { x: -83.051571785478, y: 40.123142496818 } }]
      : []
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ result: { addressMatches } }))
  })
  return new Promise((resolve) => server.listen(55398, '0.0.0.0', () => resolve(server)))
}

const stub = process.env.LIGHTS_SMOKE_REAL_CENSUS ? null : await startCensusStub()
const { data: savedSettings } = await service.from('settings').select('*').single()
const created = { houseIds: [], paths: [], voters: [] }

try {
  await step('lights schema is exposed: anon reads settings and approved houses', async () => {
    const { data: s, error } = await anon.from('settings').select('*').single()
    assert.equal(error, null, error?.message)
    assert.equal(typeof s.geofence_min_lat, 'number')
    const { data: houses, error: e2 } = await anon.from('houses').select('id, status')
    assert.equal(e2, null, e2?.message)
    assert.ok(houses.length > 0 && houses.every((h) => h.status === 'approved'))
  })

  await step('parade API unchanged (public schema)', async () => {
    const parade = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data, error } = await parade.from('entries').select('id')
    assert.equal(error, null, error?.message)
    assert.equal(data.length, 6)
  })

  await step('no results before the reveal', async () => {
    const { data, error } = await anon.rpc('get_results')
    assert.equal(error, null, error?.message)
    assert.deepEqual(data, [])
  })

  // Phase: submissions open, voting opens tomorrow.
  const day = 24 * 60 * 60 * 1000
  await service.from('settings').update({
    submissions_open: true, voting_open: true, results_visible: false,
    submissions_open_at: new Date(Date.now() - day).toISOString(),
    submissions_close_at: new Date(Date.now() + 10 * day).toISOString(),
    voting_opens_at: new Date(Date.now() + day).toISOString(),
    voting_closes_at: new Date(Date.now() + 10 * day).toISOString(),
  }).eq('id', true)

  const fresh = await signIn('15555550102')
  created.voters.push(fresh.user.id)
  await service.from('houses').delete().eq('submitted_by', fresh.user.id) // leftovers from a failed run
  const path = `${fresh.user.id}/smoke-${Date.now()}.jpg`

  await step('owner uploads a photo into their own folder', async () => {
    const { error } = await fresh.client.storage.from('houses').upload(path, JPEG, { contentType: 'image/jpeg' })
    assert.equal(error, null, error?.message)
    created.paths.push(path)
    const res = await fetch(anon.storage.from('houses').getPublicUrl(path).data.publicUrl)
    assert.equal(res.status, 200, 'public URL serves the photo')
  })

  await step('uploads elsewhere, of the wrong type, or overwriting are refused', async () => {
    const other = await fresh.client.storage.from('houses')
      .upload(`11111111-0000-4000-8000-000000000103/x-${Date.now()}.jpg`, JPEG, { contentType: 'image/jpeg' })
    assert.notEqual(other.error, null, 'someone else\'s folder')
    const text = await fresh.client.storage.from('houses')
      .upload(`${fresh.user.id}/note-${Date.now()}.txt`, Buffer.from('hi'), { contentType: 'text/plain' })
    assert.notEqual(text.error, null, 'text/plain')
    const overwrite = await fresh.client.storage.from('houses')
      .upload(path, JPEG, { contentType: 'image/jpeg', upsert: true })
    assert.notEqual(overwrite.error, null, 'overwrite')
  })

  await step('owner deletes a spare photo before voting opens', async () => {
    const spare = `${fresh.user.id}/spare-${Date.now()}.jpg`
    const up = await fresh.client.storage.from('houses').upload(spare, JPEG, { contentType: 'image/jpeg' })
    assert.equal(up.error, null, up.error?.message)
    const { data, error } = await fresh.client.storage.from('houses').remove([spare])
    assert.equal(error, null, error?.message)
    assert.equal(data.length, 1)
  })

  let houseId
  await step('owner submits a house; it comes back pending', async () => {
    const photoUrl = fresh.client.storage.from('houses').getPublicUrl(path).data.publicUrl
    const { data, error } = await fresh.client.from('houses')
      .insert({ address: '7000 Northway Dr', lat: 40.1314, lng: -83.048, photo_url: photoUrl, title: 'Smoke Test' })
      .select().single()
    assert.equal(error, null, error?.message)
    assert.equal(data.status, 'pending')
    assert.equal(typeof data.entry_number, 'number')
    houseId = data.id
    created.houseIds.push(houseId)
  })

  await step('a second house from the same phone is refused', async () => {
    const photoUrl = fresh.client.storage.from('houses').getPublicUrl(path).data.publicUrl
    const { error } = await fresh.client.from('houses')
      .insert({ address: '7002 Northway Dr', lat: 40.1314, lng: -83.048, photo_url: photoUrl })
    assert.equal(error?.code, '23505')
  })

  await step('is_admin() is reachable through schema("public")', async () => {
    const { data, error } = await fresh.client.schema('public').rpc('is_admin')
    assert.equal(error, null, error?.message)
    assert.equal(data, false)
  })

  await step('geocode function: signed-in lookup, anon refused, CORS preflight', async () => {
    const fn = `${url}/functions/v1/geocode`
    const ok = await fetch(fn, {
      method: 'POST',
      headers: { Authorization: `Bearer ${fresh.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '1221 Candlewood Dr' }),
    })
    const body = await ok.json()
    assert.equal(ok.status, 200, JSON.stringify(body))
    assert.equal(body.inGeofence, true)
    assert.ok(Math.abs(body.match.lat - 40.1231) < 0.001)
    const refused = await fetch(fn, {
      method: 'POST',
      headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '1221 Candlewood Dr' }),
    })
    assert.equal(refused.status, 401)
    const preflight = await fetch(fn, { method: 'OPTIONS' })
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
  })

  // Phase: voting open, submissions still open (overlap).
  await service.from('settings').update({ voting_opens_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', true)

  await step('after voting opens the owner can no longer edit or withdraw', async () => {
    const edit = await fresh.client.from('houses').update({ title: 'Swapped' }).eq('id', houseId).select()
    assert.equal(edit.error, null, edit.error?.message)
    assert.deepEqual(edit.data, [])
    const del = await fresh.client.from('houses').delete().eq('id', houseId).select()
    assert.deepEqual(del.data, [])
  })

  await step('voting: upsert works, pending and own houses are refused', async () => {
    const vote = await fresh.client.from('votes')
      .upsert({ user_id: fresh.user.id, house_id: SEED_APPROVED_OWNED_BY_0103 }, { onConflict: 'user_id' })
    assert.equal(vote.error, null, vote.error?.message)
    const again = await fresh.client.from('votes')
      .upsert({ user_id: fresh.user.id, house_id: SEED_APPROVED_OWNED_BY_0103 }, { onConflict: 'user_id' })
    assert.equal(again.error, null, again.error?.message)
    const pending = await fresh.client.from('votes')
      .upsert({ user_id: fresh.user.id, house_id: SEED_PENDING }, { onConflict: 'user_id' })
    assert.notEqual(pending.error, null, 'pending house')
    const owner = await signIn('15555550103')
    created.voters.push(owner.user.id)
    const self = await owner.client.from('votes')
      .upsert({ user_id: owner.user.id, house_id: SEED_APPROVED_OWNED_BY_0103 }, { onConflict: 'user_id' })
    assert.notEqual(self.error, null, 'self-vote')
    const mine = await fresh.client.from('votes').select('house_id')
    assert.deepEqual(mine.data, [{ house_id: SEED_APPROVED_OWNED_BY_0103 }])
  })

  await step('reveal: top 3 with counts and ranks', async () => {
    await service.from('settings').update({ results_visible: true }).eq('id', true)
    const { data, error } = await anon.rpc('get_results')
    assert.equal(error, null, error?.message)
    assert.equal(data.length, 3)
    assert.deepEqual(data.map((r) => r.rank), [1, 2, 3])
    assert.equal(data[0].house_id, SEED_APPROVED_OWNED_BY_0103)
    assert.equal(data[0].vote_count, 8)
  })
} finally {
  await service.from('votes').delete().in('user_id', created.voters)
  if (created.houseIds.length) await service.from('houses').delete().in('id', created.houseIds)
  if (created.paths.length) await service.storage.from('houses').remove(created.paths)
  if (savedSettings) await service.from('settings').update(savedSettings).eq('id', true)
  stub?.close()
}
console.log(`\n${passed} smoke checks passed`)
