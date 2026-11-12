// Shared helpers for the lights end-to-end tests. LOCAL STACK ONLY: every test talks to
// the database as the service role to set up and clean up, so `env()` refuses anything
// but 127.0.0.1/localhost (same rule as supabase/tests/lights-smoke.mjs).
import { readFileSync } from 'node:fs'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { expect, type BrowserContext, type Page } from '@playwright/test'

export function env() {
  const url = process.env.API_URL ?? process.env.SUPABASE_URL
  const anonKey = process.env.ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  const serviceKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey)
    throw new Error('Set API_URL, ANON_KEY and SERVICE_ROLE_KEY: eval "$(npx --yes supabase@3.1.0 status -o env)"')
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url))
    throw new Error(`${url} is not the local stack; the e2e tests never run against hosted Supabase`)
  return { url: url.replace(/\/$/, ''), anonKey, serviceKey }
}

const opts = { db: { schema: 'lights' }, auth: { persistSession: false, autoRefreshToken: false } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>
let serviceClient: Client | null = null
export function service(): Client {
  const { url, serviceKey } = env()
  serviceClient ??= createClient(url, serviceKey, opts)
  return serviceClient
}

/** Test phones (config.toml [auth.sms.test_otp], code 123456). 0100 is made the admin. */
export const PHONE = { admin: '15555550100', pending: '15555550101', fresh: '15555550102', approved: '15555550103', other: '15555550104' }

/** Inside the geofence (a real Candlewood Dr point) and well outside it (downtown Columbus). */
export const CANDLEWOOD = { latitude: 40.12314, longitude: -83.05157 }
export const DOWNTOWN = { latitude: 39.9612, longitude: -82.9988 }

const SEED_PREFIX = '22222222-0000-4000-8000-'
/** Seed rows the tests change, with the values supabase/seed_lights.sql gives them. */
const SEED_ROWS = [
  { n: 1, status: 'approved', title: 'The Griswold Special', address: '1221 Candlewood Dr', lat: 40.12314, lng: -83.05157 },
  { n: 2, status: 'approved', title: 'Candy Cane Lane', address: '800 Blind Brook Dr', lat: 40.12927, lng: -83.04397 },
  { n: 3, status: 'approved', title: null, address: '920 Clubview Blvd S', lat: 40.12474, lng: -83.04227 },
  { n: 4, status: 'approved', title: "Frosty's Hideout", address: '7000 Blackstone Dr', lat: 40.137, lng: -83.059 },
  { n: 5, status: 'approved', title: null, address: '7100 Shelley Ct', lat: 40.1334, lng: -83.06 },
  { n: 6, status: 'pending', title: 'Waiting on the Admin', address: '700 Mission Hills Ln', lat: 40.1269, lng: -83.04 },
  { n: 7, status: 'pending', title: null, address: '7200 Markhaven Dr', lat: 40.1335, lng: -83.0568 },
  { n: 8, status: 'hidden', title: 'Hidden by the Admin', address: '7300 Copperfield Dr', lat: 40.1335, lng: -83.0587 },
]

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString()
const DAY = 86_400_000

/** Put the local lights data back the way `supabase db reset` leaves it (entries open,
 *  voting in a week), with 0100 as the admin. Runs before every test. */
export async function resetLights(overrides: Record<string, unknown> = {}) {
  const db = service()
  const check = (what: string, error: unknown) => {
    if (error) throw new Error(`${what}: ${JSON.stringify(error)}`)
  }
  let r = await db
    .from('settings')
    .update({
      submissions_open: true,
      voting_open: true,
      results_visible: false,
      submissions_open_at: iso(-DAY),
      submissions_close_at: iso(30 * DAY),
      voting_opens_at: iso(7 * DAY),
      voting_closes_at: iso(14 * DAY),
      ...overrides,
    })
    .eq('id', true)
  check('settings', r.error)
  r = await db.schema('public').from('admin_config').update({ admin_phone: PHONE.admin }).eq('id', true)
  check('admin_config', r.error)
  // Entries the tests created (anything that isn't a seed row), then the seed rows' fields.
  const { data: rows, error } = await db.from('houses').select('id')
  check('houses', error)
  const extra = (rows ?? []).map((h) => h.id as string).filter((id) => !id.startsWith(SEED_PREFIX))
  if (extra.length) check('delete', (await db.from('houses').delete().in('id', extra)).error)
  for (const { n, ...fields } of SEED_ROWS) {
    const id = SEED_PREFIX + String(n).padStart(12, '0')
    const photo_url = `https://picsum.photos/seed/wh-lights-${n}/1200/900`
    check(`seed ${n}`, (await db.from('houses').update({ ...fields, photo_url }).eq('id', id)).error)
  }
  // Every uploaded photo (the seed has none).
  const { data: folders } = await db.storage.from('houses').list('', { limit: 1000 })
  for (const f of folders ?? []) {
    const { data: files } = await db.storage.from('houses').list(f.name, { limit: 1000 })
    const paths = (files ?? []).map((x) => `${f.name}/${x.name}`)
    if (paths.length) await db.storage.from('houses').remove(paths)
  }
}

/** Set some lights.settings columns (e.g. open voting). */
export async function setSettings(values: Record<string, unknown>) {
  const { error } = await service().from('settings').update(values).eq('id', true)
  if (error) throw new Error(JSON.stringify(error))
}

export const hoursFromNow = (h: number) => iso(h * 3_600_000)

/** A signed-in client for a test phone. GoTrue allows one code per phone every few
 *  seconds, so this waits out the cooldown instead of failing. */
export async function signInApi(phone: string): Promise<{ client: Client; session: Session }> {
  const { url, anonKey } = env()
  const client = createClient(url, anonKey, opts)
  let sent = await client.auth.signInWithOtp({ phone })
  for (let i = 0; i < 4 && sent.error?.code === 'over_sms_send_rate_limit'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    sent = await client.auth.signInWithOtp({ phone })
  }
  if (sent.error) throw sent.error
  const { data, error } = await client.auth.verifyOtp({ phone, token: '123456', type: 'sms' })
  if (error || !data.session) throw error ?? new Error('no session')
  return { client, session: data.session }
}

/** The real sign-in dialog, as a neighbor uses it. Waits out GoTrue's 5-second cooldown
 *  per phone (config.toml [auth.sms] max_frequency) if an earlier test just used it. */
export async function signInWithDialog(page: Page, phone: string) {
  await page.getByLabel('Phone number').fill(phone.slice(1))
  for (let attempt = 0; ; attempt++) {
    await page.getByRole('button', { name: 'Text me a code' }).click()
    const code = page.getByLabel('6-digit code')
    const cooldown = page.getByRole('alert').filter({ hasText: 'you can only request this after' })
    await expect(code.or(cooldown)).toBeVisible()
    if (await code.isVisible()) break
    if (attempt === 3) throw new Error('OTP cooldown did not clear')
    await page.waitForTimeout(5000)
  }
  await page.getByLabel('6-digit code').fill('123456')
  await page.getByRole('button', { name: 'Verify & continue' }).click()
}

/** Start the browser already signed in as `phone` (supabase-js reads its session from
 *  localStorage; the key is sb-<first label of the API host>-auth-token). */
export async function signInAs(context: BrowserContext, phone: string) {
  const { session } = await signInApi(phone)
  const key = `sb-${new URL(env().url).hostname.split('.')[0]}-auth-token`
  await context.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [key, JSON.stringify(session)] as const)
  return session
}

/** An entry created through the API as its owner, the same way the app does it. */
export async function createEntryAs(phone: string, entry: { address: string; title?: string | null; lat?: number; lng?: number }) {
  const { client, session } = await signInApi(phone)
  const uid = session.user.id
  const path = `${uid}/${Date.now()}-e2e.jpg`
  const up = await client.storage.from('houses').upload(path, new Blob([TINY_JPEG], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const photo_url = client.storage.from('houses').getPublicUrl(path).data.publicUrl
  const { data, error } = await client
    .from('houses')
    .insert({ address: entry.address, title: entry.title ?? null, lat: entry.lat ?? 40.1283, lng: entry.lng ?? -83.0466, photo_url })
    .select('id, entry_number')
    .single()
  if (error) throw error
  return data as { id: string; entry_number: number }
}

/** The house row for a phone's account, read as the service role. */
export async function entryOf(phone: string) {
  const { data: users } = await service().auth.admin.listUsers({ perPage: 1000 })
  const user = users.users.find((u) => u.phone === phone)
  if (!user) return null
  const { data } = await service().from('houses').select('*').eq('submitted_by', user.id).maybeSingle()
  return data as { id: string; status: string; title: string | null; address: string; lat: number; lng: number; photo_url: string } | null
}

/** Objects in a phone's photo folder. */
export async function photosOf(phone: string) {
  const { data: users } = await service().auth.admin.listUsers({ perPage: 1000 })
  const user = users.users.find((u) => u.phone === phone)
  if (!user) return []
  const { data } = await service().storage.from('houses').list(user.id)
  return (data ?? []).map((f) => f.name)
}

// Smallest valid JPEG (1×1), for entries made through the API.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)

const MAP_STYLE = readFileSync(new URL('./fixtures/map-style.json', import.meta.url), 'utf8')

/** Network stand-ins every test page gets: the basemap (offline, deterministic), the seed's
 *  picsum.photos placeholders, and the geocode function (the local edge runtime can't
 *  reach the Census geocoder from this sandbox; M3 D19). `geocode` maps a lower-case
 *  address prefix to a point; anything else is "no match". */
export async function stubNetwork(page: Page, geocode: Record<string, { lat: number; lng: number; inGeofence: boolean }> = {}) {
  await page.route('https://basemaps.cartocdn.com/**', (route) => route.fulfill({ body: MAP_STYLE, contentType: 'application/json' }))
  await page.route('https://tiles.basemaps.cartocdn.com/**', (route) => route.abort())
  await page.route('https://picsum.photos/**', (route) => route.fulfill({ body: TINY_JPEG, contentType: 'image/jpeg' }))
  await page.route('**/functions/v1/geocode', async (route) => {
    const address = String((route.request().postDataJSON() as { address?: string })?.address ?? '').toLowerCase()
    const hit = Object.entries(geocode).find(([prefix]) => address.startsWith(prefix))
    const cors = { 'access-control-allow-origin': '*' }
    if (!hit) return route.fulfill({ status: 404, headers: cors, json: { error: 'no_match' } })
    const [, m] = hit
    return route.fulfill({ status: 200, headers: cors, json: { match: { lat: m.lat, lng: m.lng, matchedAddress: address.toUpperCase() }, inGeofence: m.inGeofence } })
  })
}

/** A night-house photo drawn in the page (no binary fixture in the repo), as a JPEG file
 *  for setInputFiles. `n` varies the lights, so stand-ins for several houses differ. */
export async function housePhoto(page: Page, n = 0) {
  const dataUrl = await page.evaluate((n) => {
    const c = document.createElement('canvas')
    c.width = 1200
    c.height = 900
    const g = c.getContext('2d')!
    const sky = g.createLinearGradient(0, 0, 0, 900)
    sky.addColorStop(0, '#060a1c')
    sky.addColorStop(1, '#1d1d2c')
    g.fillStyle = sky
    g.fillRect(0, 0, 1200, 900)
    g.fillStyle = '#2a3048'
    g.fillRect(0, 700, 1200, 200)
    const left = 220 + (n % 3) * 40
    const width = 760 - (n % 3) * 60
    g.fillStyle = '#1a1726'
    g.fillRect(left, 380, width, 320)
    g.fillStyle = '#100e18'
    g.beginPath()
    g.moveTo(left - 40, 380)
    g.lineTo(left + width / 2, 190)
    g.lineTo(left + width + 40, 380)
    g.fill()
    g.fillStyle = '#ffc874'
    for (let i = 0; i < 4; i++) g.fillRect(left + 50 + (i * (width - 140)) / 3, 450, 80, 100)
    const palettes = [['#ff2d3d', '#22ff7a', '#ffc21a', '#2b8cff'], ['#fff3d6'], ['#ff2d3d', '#fff3d6'], ['#2b8cff', '#fff3d6'], ['#ff3df0', '#22ff7a', '#ffc21a']]
    const colors = palettes[n % palettes.length]
    const bulb = (x: number, y: number, color: string) => {
      const glow = g.createRadialGradient(x, y, 0, x, y, 30)
      glow.addColorStop(0, color)
      glow.addColorStop(1, color + '00')
      g.fillStyle = glow
      g.fillRect(x - 30, y - 30, 60, 60)
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.arc(x, y, 3, 0, 7)
      g.fill()
    }
    for (let i = 0; i <= 44; i++) {
      const t = i / 44
      const x = left - 40 + (width + 80) * t
      bulb(x, t < 0.5 ? 380 - 380 * t : 380 - 380 * (1 - t), colors[i % colors.length])
    }
    for (let x = left; x <= left + width; x += 28) bulb(x, 384, colors[(x / 28) % colors.length | 0])
    for (let k = 0; k < 60; k++) bulb(100 + ((k * 197) % 1000), 640 + ((k * 53) % 70), colors[k % colors.length])
    return c.toDataURL('image/jpeg', 0.8)
  }, n)
  return { name: 'house.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') }
}

/** Drag the pin map by (dx, dy) pixels with one finger (the tests run as a touch phone,
 *  where MapLibre pans on touch events; Playwright's mouse would not move it). */
export async function dragMap(page: Page, dx: number, dy: number) {
  const map = page.locator('[data-slot="mini-map"]')
  await map.scrollIntoViewIfNeeded()
  const box = (await map.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= 10; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}
