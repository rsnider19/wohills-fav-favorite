import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { CANDLEWOOD, DOWNTOWN, PHONE, createEntryAs, housePhoto, resetLights, service, signInAs, stubNetwork } from './helpers'

// The M5 screenshots for the PR (docs/milestones/screenshots/M5). Skipped unless SHOOT=1:
//   SHOOT=1 npm run e2e:lights -- screenshots
// The basemap is the real CARTO Dark Matter unless MAP=fixture (offline stand-in). The seed's
// picsum.photos placeholders are replaced with drawn night-house photos.
test.skip(!process.env.SHOOT, 'screenshots only with SHOOT=1')
test.describe.configure({ timeout: 120_000 })

const OUT = new URL('../../../docs/milestones/screenshots/M5/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// The decided voting window, so the copy shows real dates; entries open since yesterday so
// the local database accepts submissions today.
const WINDOWS = {
  submissions_open_at: new Date(Date.now() - 86_400_000).toISOString(),
  submissions_close_at: '2026-12-16T05:00:00Z',
  voting_opens_at: '2026-12-08T05:00:00Z',
  voting_closes_at: '2026-12-21T05:00:00Z',
}

async function prepare(page: Page) {
  await stubNetwork(page, GEOCODE)
  if (process.env.MAP !== 'fixture') {
    await page.unroute('https://basemaps.cartocdn.com/**')
    await page.unroute('https://tiles.basemaps.cartocdn.com/**')
  }
  const photos = new Map<number, Buffer>()
  await page.route('https://picsum.photos/**', async (route) => {
    const n = Number(route.request().url().match(/wh-lights-(\d+)/)?.[1] ?? 0)
    if (!photos.has(n)) photos.set(n, (await housePhoto(page, n)).buffer)
    await route.fulfill({ body: photos.get(n), contentType: 'image/jpeg' })
  })
  // Same lineup order every run. A seeded generator, not a constant: MapLibre draws nothing
  // when Math.random always returns the same value (its ids collide).
  await page.addInitScript(() => {
    let seed = 42
    Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  })
}

// The address lookup's answers (the local edge runtime can't reach Census; M3 D19).
const GEOCODE = {
  '1221 candlewood': { lat: 40.12314, lng: -83.05157, inGeofence: true },
  '1250 candlewood': { lat: 40.12322, lng: -83.05101, inGeofence: true },
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 72, fullPage, animations: 'disabled' })
}

async function mapSettled(page: Page) {
  await expect(page.locator('[data-slot="mini-map"] canvas')).toBeVisible()
  await page.waitForTimeout(process.env.MAP === 'fixture' ? 1500 : 4000) // fly-to and tiles
}

for (const vp of ['phone', 'desktop'] as const) {
  test.describe(vp, () => {
    if (vp === 'desktop') test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })

    test.beforeEach(async () => {
      await resetLights(WINDOWS)
    })

    test('the form, start to finish', async ({ page, context }) => {
      await context.grantPermissions(['geolocation'])
      await context.setGeolocation(CANDLEWOOD)
      await prepare(page)
      if (vp === 'phone') {
        await page.goto('/')
        await expect(page.locator('[data-slot="house-card"]').first()).toBeVisible()
        await shot(page, 'phone-1-home-enter')
        await page.goto('/enter')
        await expect(page.getByRole('button', { name: 'Verify your phone to start' })).toBeVisible()
        await shot(page, 'phone-2-intro')
      }
      await signInAs(context, PHONE.fresh)
      await page.goto('/enter')
      await page.getByRole('heading', { name: 'Snap your house' }).waitFor()
      if (vp === 'phone') await shot(page, 'phone-3-photo-empty')
      await page.locator('input[type=file]:not([capture])').setInputFiles(await housePhoto(page, 1))
      await page.getByRole('button', { name: 'Next' }).waitFor()
      if (vp === 'phone') await shot(page, 'phone-4-photo-set', true)
      await page.getByRole('button', { name: 'Next' }).click()
      await page.getByLabel('Street address').fill('1250 Candlewood Dr')
      await page.getByRole('button', { name: 'Use my location' }).click()
      await mapSettled(page)
      await page.locator('[data-slot="map-frame"]').scrollIntoViewIfNeeded()
      await shot(page, `${vp}-${vp === 'phone' ? 5 : 1}-pin`, vp === 'phone')
      await page.getByRole('button', { name: 'Next' }).click()
      await page.getByLabel('Give it a name (optional)').fill('Sparkle Manor')
      await shot(page, `${vp}-${vp === 'phone' ? 7 : 2}-details`, true)
      await page.getByRole('button', { name: 'Light it up' }).click()
      await expect(page.getByRole('heading', { name: "You're on the list!" })).toBeVisible()
      if (vp === 'phone') await shot(page, 'phone-9-done', true)
      await page.getByRole('button', { name: 'See my entry' }).click()
      if (vp === 'phone') await shot(page, 'phone-10-my-entry-pending', true)
      if (vp === 'phone') {
        await page.getByRole('button', { name: 'Withdraw' }).click()
        await shot(page, 'phone-13-withdraw-dialog')
        await page.getByRole('button', { name: 'Keep it' }).click()
        await page.getByRole('link', { name: 'The lineup' }).click()
        await expect(page.locator('[data-slot="house-card"]').first()).toBeVisible()
        await shot(page, 'phone-15-home-my-entry')
      }
    })

    if (vp === 'phone') {
      test('errors on the pin step and on send', async ({ page, context }) => {
        await context.grantPermissions(['geolocation'])
        await context.setGeolocation(DOWNTOWN)
        await prepare(page)
        await signInAs(context, PHONE.other)
        await page.goto('/enter')
        await page.locator('input[type=file]:not([capture])').setInputFiles(await housePhoto(page, 2))
        await page.getByRole('button', { name: 'Next' }).click()
        await page.getByLabel('Street address').fill('1221 Candlewood Drive')
        await page.getByRole('button', { name: 'Use my location' }).click()
        await expect(page.getByText("You don't seem to be in Worthington Hills")).toBeVisible()
        await page.getByRole('button', { name: 'Next' }).click()
        await mapSettled(page)
        await shot(page, 'phone-6-pin-errors', true)
        await page.getByRole('button', { name: 'Find this address' }).click()
        await mapSettled(page)
        await page.getByRole('button', { name: 'Next' }).click()
        await page.getByRole('button', { name: 'Light it up' }).click()
        await expect(page.getByText('That address is already entered.')).toBeVisible()
        await shot(page, 'phone-8-error-duplicate', true)
      })

      test('my entry: approved, locked, closed', async ({ page, context }) => {
        await prepare(page)
        await signInAs(context, PHONE.approved)
        await page.goto('/enter')
        await expect(page.locator('[data-slot="status-pill"]')).toHaveText('On the board')
        await shot(page, 'phone-11-my-entry-approved', true)
        await service().from('settings').update({ voting_opens_at: new Date(Date.now() - 3_600_000).toISOString() }).eq('id', true)
        await page.reload()
        await expect(page.getByText('Voting has started, so your entry is locked')).toBeVisible()
        await shot(page, 'phone-12-my-entry-locked', true)
        await service().from('settings').update({ ...WINDOWS, submissions_open: false }).eq('id', true)
        await signInAs(context, PHONE.fresh)
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Entries are paused' })).toBeVisible()
        await shot(page, 'phone-14-paused')
      })
    }

    test('moderation', async ({ page, context }) => {
      await createEntryAs(PHONE.other, { address: '7410 Lakeside Ct', title: 'North Pole Annex' })
      await prepare(page)
      await signInAs(context, PHONE.admin)
      await page.goto('/admin')
      await expect(page.locator('[data-slot="admin-row"]').first()).toBeVisible()
      await page.evaluate(async () => {
        await Promise.all([...document.querySelectorAll('img')].map((img) => ((img.loading = 'eager'), img.decode().catch(() => {}))))
      })
      await shot(page, `${vp}-${vp === 'phone' ? 16 : 3}-admin-queue`, vp === 'desktop')
      await page.locator('[data-slot="admin-row"]', { hasText: 'North Pole Annex' }).getByRole('button', { name: 'Edit' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await shot(page, `${vp}-${vp === 'phone' ? 17 : 4}-admin-edit`)
    })
  })
}
