import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { PHONE, housePhoto, resetLights, signInAs, stubNetwork } from './helpers'

// The M6 screenshots for the PR (docs/milestones/screenshots/M6). Skipped unless SHOOT=1:
//   SHOOT=1 npm run e2e:lights -- screenshots-m6
// The basemap is the real CARTO Dark Matter unless MAP=fixture (offline stand-in). The seed's
// picsum.photos placeholders are replaced with drawn night-house photos.
test.skip(!process.env.SHOOT, 'screenshots only with SHOOT=1')
test.describe.configure({ timeout: 120_000 })

const OUT = new URL('../../../docs/milestones/screenshots/M6/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// The decided windows, so the copy shows real dates (entries open since yesterday).
const WINDOWS = {
  submissions_open_at: new Date(Date.now() - 86_400_000).toISOString(),
  submissions_close_at: '2026-12-16T05:00:00Z',
  voting_opens_at: '2026-12-08T05:00:00Z',
  voting_closes_at: '2026-12-21T05:00:00Z',
}

async function prepare(page: Page) {
  await stubNetwork(page)
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
  // when Math.random always returns the same value (its ids collide; M5 notes).
  await page.addInitScript(() => {
    let seed = 42
    Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  })
}

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 72, animations: 'disabled' })
}

/** Scroll so the lineup's title is at the top of the screen. */
async function toLineupTitle(page: Page) {
  await page.locator('[data-slot="gallery-title"]').evaluate((el) => el.scrollIntoView({ block: 'start' }))
}

/** Open the map view at the lineup's title, and wait for the tiles. */
async function openMap(page: Page, path: string) {
  await page.goto(path)
  await expect(page.locator('[data-slot="map-bulb"]')).toHaveCount(5)
  await toLineupTitle(page)
  await page.waitForTimeout(process.env.MAP === 'fixture' ? 1500 : 4000)
}

for (const vp of ['phone', 'desktop'] as const) {
  test.describe(vp, () => {
    if (vp === 'desktop') test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })

    test.beforeEach(async () => {
      await resetLights(WINDOWS)
    })

    test('lineup and map', async ({ page }) => {
      await prepare(page)
      await page.goto('/?house=1')
      await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
      await toLineupTitle(page)
      await page.evaluate(async () => {
        await Promise.all([...document.querySelectorAll('img')].map((img) => ((img.loading = 'eager'), img.decode().catch(() => {}))))
      })
      await shot(page, `${vp}-1-lineup`)

      await openMap(page, '/?view=map')
      await shot(page, `${vp}-2-map`)

      await page.locator('[data-slot="map-bulb"][data-number="1"]').click()
      await expect(page.locator('[data-slot="house-sheet"] img')).toBeVisible()
      await page.waitForTimeout(1000) // the ease to the bulb
      await shot(page, `${vp}-3-map-sheet`)
    })

    if (vp === 'phone') {
      test('pending note', async ({ page, context }) => {
        await signInAs(context, PHONE.pending)
        await prepare(page)
        await openMap(page, '/?view=map')
        await shot(page, 'phone-4-map-pending-note')
      })

      test('offline', async ({ page }) => {
        await prepare(page)
        await page.route('https://basemaps.cartocdn.com/**', (route) => route.abort())
        await page.goto('/?view=map')
        await expect(page.getByText("The map didn't load.")).toBeVisible()
        await toLineupTitle(page)
        await shot(page, 'phone-5-map-offline')
      })
    }
  })
}
