import { expect, test } from '@playwright/test'
import {
  CANDLEWOOD,
  DOWNTOWN,
  PHONE,
  dragMap,
  entryOf,
  housePhoto,
  photosOf,
  resetLights,
  setSettings,
  signInAs,
  signInWithDialog,
  stubNetwork,
} from './helpers'

test.beforeEach(async () => {
  await resetLights()
})

/** Steps 1 and 2 of the form, up to the pin map. */
async function toPinStep(page: import('@playwright/test').Page) {
  await page.getByRole('heading', { name: 'Snap your house' }).waitFor()
  await page.locator('input[type=file]:not([capture])').setInputFiles(await housePhoto(page))
  await page.getByRole('button', { name: 'Next' }).click()
  // Focus follows the step (the Next button that had it is gone).
  await expect(page.getByRole('heading', { name: 'Pin your house' })).toBeFocused()
}

/** A JPEG with an EXIF block (camera GPS) spliced in after its start marker. */
function withExif(file: { name: string; mimeType: string; buffer: Buffer }) {
  const payload = Buffer.from('Exif\0\0GPSLatitude 40.12314 GPSLongitude -83.05157', 'latin1')
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload])
  return { ...file, buffer: Buffer.concat([file.buffer.subarray(0, 2), app1, file.buffer.subarray(2)]) }
}

test('submit: sign in, photo, GPS pin, drag, name, send → pending', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(CANDLEWOOD)
  await stubNetwork(page)

  await page.goto('/')
  await page.getByRole('link', { name: 'Enter your house' }).first().click()
  await expect(page).toHaveURL(/\/enter$/)
  // The real phone sign-in, as a neighbor does it.
  await page.getByRole('button', { name: 'Verify your phone to start' }).click()
  await expect(page.getByText('Sign in to enter your house.')).toBeVisible()
  await signInWithDialog(page, PHONE.fresh)

  await toPinStep(page)
  await page.getByLabel('Street address').fill('1250 Candlewood Dr')
  await page.getByRole('button', { name: 'Use my location' }).click()
  const coords = page.locator('[data-slot="pin-coords"]')
  await expect(coords).toHaveAttribute('data-lat', String(CANDLEWOOD.latitude))
  await expect(page.getByText('Pin is inside Worthington Hills')).toBeVisible()
  // Fine-tune: drag the map, the pin stays in the middle and its point changes.
  await page.waitForTimeout(1500) // the fly-to settles
  await dragMap(page, -40, 20)
  await expect(coords).not.toHaveAttribute('data-lat', String(CANDLEWOOD.latitude))
  await page.getByRole('button', { name: 'Next' }).click()

  await page.getByLabel('Give it a name (optional)').fill('Sparkle Manor')
  await expect(page.locator('[data-slot="card-preview"]').getByText('Sparkle Manor')).toBeVisible()
  await page.getByRole('button', { name: 'Light it up' }).click()
  await expect(page.getByRole('heading', { name: "You're on the list!" })).toBeVisible()

  const row = await entryOf(PHONE.fresh)
  expect(row).toMatchObject({ status: 'pending', title: 'Sparkle Manor', address: '1250 Candlewood Dr' })
  // The photo is our upload, in the owner's folder, and it's the only object there.
  const photos = await photosOf(PHONE.fresh)
  expect(photos).toHaveLength(1)
  expect(row!.photo_url).toContain(photos[0])
  expect((await page.request.get(row!.photo_url)).status()).toBe(200)

  await page.getByRole('button', { name: 'See my entry' }).click()
  await expect(page.locator('[data-slot="status-pill"]')).toHaveText('Waiting for approval')
  // Pending entries aren't in the lineup.
  await page.getByRole('link', { name: 'The lineup' }).click()
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
  await expect(page.getByRole('link', { name: 'My entry' }).first()).toBeVisible()
})

test('out of area: GPS across town and an address outside the fence are refused', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(DOWNTOWN)
  await stubNetwork(page, { '1 far away': { lat: 39.9612, lng: -82.9988, inGeofence: false } })
  await page.goto('/enter')
  await toPinStep(page)

  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByText("You don't seem to be in Worthington Hills right now")).toBeVisible()
  await expect(page.locator('[data-slot="pin-coords"]')).toHaveCount(0)

  await page.getByLabel('Street address').fill('1 Far Away Rd')
  await page.getByRole('button', { name: 'Find this address' }).click()
  await expect(page.getByText('That address is outside Worthington Hills')).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Pin your house' })).toBeVisible()
  await expect(page.locator('[data-slot="note"][data-tone="error"]').last()).toContainText('Use your location')
})

test('out of area: GPS inside the bounding box but outside the polygon is refused', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await context.grantPermissions(['geolocation'])
  // Darrow Dr & Nimitz Dr, west of the tracks: inside the geofence's bounding box, outside the
  // polygon. A box-only check would drop the pin. (Its own test: the browser caches a position
  // for a minute, so a second setGeolocation in one page would not be seen.)
  await context.setGeolocation({ latitude: 40.13193, longitude: -83.06264 })
  await stubNetwork(page)
  await page.goto('/enter')
  await toPinStep(page)

  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByText("You don't seem to be in Worthington Hills right now")).toBeVisible()
  await expect(page.locator('[data-slot="pin-coords"]')).toHaveCount(0)
})

test('GPS denied: the address lookup drops the pin instead (and the photo goes up without EXIF)', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page, { '7420 test dr': { lat: 40.1283, lng: -83.0466, inGeofence: true } })
  await page.goto('/enter')
  await page.getByRole('heading', { name: 'Snap your house' }).waitFor()
  const photo = withExif(await housePhoto(page))
  expect(photo.buffer.includes('GPSLatitude')).toBe(true)
  await page.locator('input[type=file]:not([capture])').setInputFiles(photo)
  await page.getByRole('button', { name: 'Next' }).click()

  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByText('Location is off for this site')).toBeVisible()
  await page.getByLabel('Street address').fill('7420 Test Dr')
  await page.getByRole('button', { name: 'Find this address' }).click()
  await expect(page.locator('[data-slot="pin-coords"]')).toHaveAttribute('data-lat', '40.1283')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Light it up' }).click()
  await expect(page.getByRole('heading', { name: "You're on the list!" })).toBeVisible()
  const row = await entryOf(PHONE.fresh)
  expect(row).toMatchObject({ address: '7420 Test Dr', lat: 40.1283, lng: -83.0466, title: null })
  const uploaded = await (await page.request.get(row!.photo_url)).body()
  expect(uploaded.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  expect(uploaded.includes('Exif')).toBe(false)
  expect(uploaded.includes('GPSLatitude')).toBe(false)
})

test('duplicate address: refused, nothing left behind', async ({ page, context }) => {
  await signInAs(context, PHONE.other)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(CANDLEWOOD)
  await stubNetwork(page)
  await page.goto('/enter')
  await toPinStep(page)
  // Seed No. 1 is "1221 Candlewood Dr"; the database normalizes "Drive, Columbus, OH".
  await page.getByLabel('Street address').fill('1221 Candlewood Drive, Columbus, OH 43235')
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.locator('[data-slot="pin-coords"]')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Light it up' }).click()
  await expect(page.getByText('That address is already entered.')).toBeVisible()
  expect(await entryOf(PHONE.other)).toBeNull()
  // The photo uploaded for the failed insert was removed again.
  expect(await photosOf(PHONE.other)).toEqual([])
  await page.getByRole('button', { name: 'Fix the address or pin' }).click()
  await expect(page.getByRole('heading', { name: 'Pin your house' })).toBeFocused()
  // Back on the pin step, the map starts at the pin (not the overview), so nudging it moves
  // the pin a little instead of jumping it to the middle of the neighborhood.
  const coords = page.locator('[data-slot="pin-coords"]')
  await expect(coords).toHaveAttribute('data-lat', String(CANDLEWOOD.latitude))
  await page.locator('[data-slot="mini-map"] canvas').waitFor()
  await page.waitForTimeout(1500)
  await dragMap(page, -40, 0)
  await expect(coords).not.toHaveAttribute('data-lng', String(CANDLEWOOD.longitude))
  expect(Math.abs(Number(await coords.getAttribute('data-lat')) - CANDLEWOOD.latitude)).toBeLessThan(0.0005)
  expect(Math.abs(Number(await coords.getAttribute('data-lng')) - CANDLEWOOD.longitude)).toBeLessThan(0.0005)
})

test('already entered: a phone with an entry gets "My entry", not the form', async ({ page, context }) => {
  await signInAs(context, PHONE.pending)
  await stubNetwork(page)
  await page.goto('/enter')
  await expect(page.getByRole('heading', { name: 'Your house' })).toBeVisible()
  await expect(page.locator('[data-slot="status-pill"]')).toHaveText('Waiting for approval')
  await expect(page.getByText('Waiting on the Admin')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Snap your house' })).toHaveCount(0)
})

test('window closed: no form while entries are paused or over', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page)
  await setSettings({ submissions_open: false })
  await page.goto('/enter')
  await expect(page.getByRole('heading', { name: 'Entries are paused' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Snap your house' })).toHaveCount(0)
  // The lineup offers no "Enter your house" either.
  await page.goto('/')
  await expect(page.locator('[data-slot="house-card"]').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Enter your house' })).toHaveCount(0)
})

test('upload failure: the entry is kept and goes through on retry', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page, { '7450 test dr': { lat: 40.1283, lng: -83.0466, inGeofence: true } })
  await page.goto('/enter')
  await toPinStep(page)
  await page.getByLabel('Street address').fill('7450 Test Dr')
  await page.getByRole('button', { name: 'Find this address' }).click()
  await expect(page.locator('[data-slot="pin-coords"]')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()

  // The connection drops during the photo upload.
  await page.route('**/storage/v1/object/houses/**', (route) => route.abort('internetdisconnected'))
  await page.getByRole('button', { name: 'Light it up' }).click()
  await expect(page.getByText("Your entry didn't go through: the connection dropped.")).toBeVisible()
  expect(await entryOf(PHONE.fresh)).toBeNull()

  await page.unroute('**/storage/v1/object/houses/**')
  await page.getByRole('button', { name: 'Light it up' }).click()
  await expect(page.getByRole('heading', { name: "You're on the list!" })).toBeVisible()
  expect(await entryOf(PHONE.fresh)).toMatchObject({ address: '7450 Test Dr', status: 'pending' })
})

test('lost answer: the insert went through but the response never came back', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page, { '7470 test dr': { lat: 40.1283, lng: -83.0466, inGeofence: true } })
  await page.goto('/enter')
  await toPinStep(page)
  await page.getByLabel('Street address').fill('7470 Test Dr')
  await page.getByRole('button', { name: 'Find this address' }).click()
  await expect(page.locator('[data-slot="pin-coords"]')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()

  // The insert reaches the database, then the connection drops before the answer.
  await page.route('**/rest/v1/houses?*', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await route.fetch()
    await route.abort('internetdisconnected')
  })
  await page.getByRole('button', { name: 'Light it up' }).click()
  // The form checks before blaming the network: the entry is there, so it's done.
  await expect(page.getByRole('heading', { name: "You're on the list!" })).toBeVisible()
  const row = await entryOf(PHONE.fresh)
  expect(row).toMatchObject({ address: '7470 Test Dr', status: 'pending' })
  expect(await photosOf(PHONE.fresh)).toEqual([row!.photo_url.split('/').pop()])
})

test('map offline: the step still works without the map', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page, { '7460 test dr': { lat: 40.1283, lng: -83.0466, inGeofence: true } })
  // The map chunk can't be downloaded (dev server path; in a build it is assets/MiniMap-*.js).
  await page.route(/\/src\/map\/MiniMap\.tsx/, (route) => route.abort('internetdisconnected'))
  await page.goto('/enter')
  await toPinStep(page)
  await expect(page.getByText("The map didn't load.")).toBeVisible()
  await page.getByLabel('Street address').fill('7460 Test Dr')
  await page.getByRole('button', { name: 'Find this address' }).click()
  await expect(page.locator('[data-slot="pin-coords"]')).toHaveAttribute('data-lat', '40.1283')
  await expect(page.locator('[data-slot="note"][data-tone="ok"]')).toHaveText('Pin is inside Worthington Hills.')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Light it up' }).click()
  await expect(page.getByRole('heading', { name: "You're on the list!" })).toBeVisible()
})

test('basemap offline: the map says it did not load, GPS still sets the pin', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(CANDLEWOOD)
  await stubNetwork(page)
  // The style can't be fetched (offline, or the basemap host is down); MapLibre itself loaded.
  await page.route('https://basemaps.cartocdn.com/**', (route) => route.abort('internetdisconnected'))
  await page.goto('/enter')
  await toPinStep(page)
  await expect(page.locator('[data-slot="mini-map"] [data-slot="map-fallback"]')).toHaveText(/The map didn't load\./)
  await page.getByLabel('Street address').fill('1250 Candlewood Dr')
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.locator('[data-slot="pin-coords"]')).toHaveAttribute('data-lat', String(CANDLEWOOD.latitude))
  // No map to zoom or drag, so the hint doesn't ask for it.
  await expect(page.locator('[data-slot="note"][data-tone="ok"]')).toHaveText('Pin is inside Worthington Hills.')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Name it & send it' })).toBeFocused()
})
