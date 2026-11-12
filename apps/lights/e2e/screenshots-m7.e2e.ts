import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { PHONE, card, hoursFromNow, housePhoto, resetLights, seedHouseId, service, setSettings, signInApi, signInAs, stubNetwork } from './helpers'

// The M7 screenshots for the PR (docs/milestones/screenshots/M7). Skipped unless SHOOT=1:
//   SHOOT=1 npm run e2e:lights -- screenshots-m7
// Real CARTO tiles unless MAP=fixture; the seed's picsum.photos placeholders are replaced
// with drawn night-house photos. Votes: the seed's 21 plus 0102's pick (No. 4).
test.skip(!process.env.SHOOT, 'screenshots only with SHOOT=1')
test.describe.configure({ timeout: 120_000 })

const OUT = new URL('../../../docs/milestones/screenshots/M7/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// Voting open since yesterday, closing on the decided date; late entries still open.
const VOTING = {
  submissions_open_at: hoursFromNow(-24 * 10),
  submissions_close_at: '2026-12-16T05:00:00Z',
  voting_opens_at: hoursFromNow(-24),
  voting_closes_at: '2026-12-21T05:00:00Z',
}
const CLOSED = { voting_opens_at: hoursFromNow(-24 * 13), voting_closes_at: hoursFromNow(-2), submissions_close_at: hoursFromNow(-24 * 5) }

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
  // Same lineup order every run, with a seeded generator (never a constant: M5 notes).
  await page.addInitScript(() => {
    let seed = 42
    Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  })
}

async function photosReady(page: Page) {
  await page.evaluate(async () => {
    await Promise.all([...document.querySelectorAll('img')].map((img) => ((img.loading = 'eager'), img.decode().catch(() => {}))))
  })
}

async function shot(page: Page, name: string, animations: 'disabled' | 'allow' = 'disabled') {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 72, animations })
}

const scrollTo = (page: Page, selector: string, block: 'start' | 'center' = 'start') =>
  page.locator(selector).first().evaluate((el, block) => el.scrollIntoView({ block, behavior: 'instant' }), block)

/** 0102 votes for No. 4 (through the API, as the app does). */
async function pickFour() {
  const { client } = await signInApi(PHONE.fresh)
  const { error } = await client.from('votes').upsert({ house_id: seedHouseId(4) }, { onConflict: 'user_id' })
  if (error) throw error
}

/** Open the reveal, let it start, freeze it at `atMs` into the surge and shoot. */
async function surge(page: Page, name: string, atMs: number) {
  await page.clock.install()
  await page.goto('/')
  await expect(page.locator('[data-slot="podium"]')).toHaveAttribute('data-reveal', /armed|play/)
  await photosReady(page)
  await scrollTo(page, '#winners')
  await expect(page.locator('[data-slot="podium"]')).toHaveAttribute('data-reveal', 'play')
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50))
  await page.evaluate((t) => {
    for (const a of document.getAnimations() as (Animation & { animationName?: string })[]) {
      a.pause()
      a.currentTime = ['surge', 'surge-winner', 'blackout'].includes(a.animationName ?? '') ? t : 0
    }
  }, atMs)
  await shot(page, name, 'allow')
}

for (const vp of ['phone', 'desktop'] as const) {
  test.describe(vp, () => {
    if (vp === 'desktop') test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })

    test('voting', async ({ page, context }) => {
      await resetLights(VOTING)
      await prepare(page)
      if (vp === 'phone') {
        await page.goto('/?house=4')
        await expect(page.locator('[data-slot="vote-button"]').first()).toHaveText('Sign in to vote')
        await photosReady(page)
        await scrollTo(page, '[data-slot="gallery-title"]')
        await shot(page, 'phone-1-vote-lineup')
        await card(page, 4).locator('[data-slot="vote-button"]').click()
        await page.getByLabel('Phone number').fill('5555550102')
        await shot(page, 'phone-2-sign-in-to-vote')
      }
      await pickFour()
      await signInAs(context, PHONE.fresh)
      await page.goto('/?house=4')
      await expect(card(page, 4)).toHaveAttribute('data-state', 'lit')
      await photosReady(page)
      await scrollTo(page, vp === 'phone' ? '[data-slot="house-card"][data-state="lit"]' : '[data-slot="gallery-title"]')
      await shot(page, `${vp}-${vp === 'phone' ? 3 : 1}-your-pick`)

      await page.goto('/?view=map&house=2')
      await expect(page.locator('[data-slot="house-sheet"] [data-slot="vote-button"]')).toHaveText('Switch my vote here')
      await scrollTo(page, '[data-slot="gallery-title"]')
      await page.waitForTimeout(process.env.MAP === 'fixture' ? 1500 : 4000)
      await shot(page, `${vp}-${vp === 'phone' ? 5 : 2}-map-sheet-vote`)
    })

    if (vp === 'phone') {
      test('your house', async ({ page, context }) => {
        await resetLights(VOTING)
        await signInAs(context, PHONE.approved)
        await prepare(page)
        await page.goto('/?house=1')
        await expect(card(page, 1).locator('[data-slot="vote-button"]')).toHaveText('Your house')
        await photosReady(page)
        await scrollTo(page, '[data-slot="house-card"]')
        await shot(page, 'phone-4-your-house')
      })

      test('hidden pick', async ({ page, context }) => {
        await resetLights(VOTING)
        await pickFour()
        await service().from('houses').update({ status: 'hidden' }).eq('id', seedHouseId(4))
        await signInAs(context, PHONE.fresh)
        await prepare(page)
        await page.goto('/')
        await expect(page.getByText('The house you voted for was taken off the board')).toBeVisible()
        await photosReady(page)
        await scrollTo(page, '[data-slot="gallery-title"]')
        await shot(page, 'phone-12-hidden-pick')
      })

      test('closed', async ({ page, context }) => {
        await resetLights(VOTING)
        await pickFour()
        await setSettings(CLOSED)
        await signInAs(context, PHONE.fresh)
        await prepare(page)
        await page.goto('/?house=4')
        await expect(page.locator('[data-slot="scoreboard"]')).toHaveText('Votes are in')
        await shot(page, 'phone-6-closed')
        await photosReady(page)
        await scrollTo(page, '[data-slot="house-card"]')
        await shot(page, 'phone-7-closed-lineup')
      })

      test('preview', async ({ page, context }) => {
        await resetLights(VOTING)
        await signInAs(context, PHONE.admin)
        await prepare(page)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/?preview=results')
        await expect(page.getByText('★ Preview: sample podium')).toBeVisible()
        await photosReady(page)
        await scrollTo(page, '#winners')
        await shot(page, 'phone-11-preview-sample')
      })
    }

    test('reveal', async ({ page, context }) => {
      await resetLights(VOTING)
      await pickFour()
      await setSettings({ ...CLOSED, results_visible: true })
      await signInAs(context, PHONE.fresh)
      await prepare(page)
      // 3.4 s in: No. 3 and No. 2 are on, the winner is still dark, the page is dimmed.
      await surge(page, `${vp}-${vp === 'phone' ? 8 : 3}-reveal-surge`, 3400)

      await page.clock.resume()
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Replay the reveal' })).toBeVisible()
      await photosReady(page)
      // Phones show the podium as a countdown (3rd, 2nd, then the winner at the bottom).
      if (vp === 'phone') await page.locator('[data-slot="podium-slot"][data-rank="1"]').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }))
      else await scrollTo(page, '#winners')
      await shot(page, `${vp}-${vp === 'phone' ? 9 : 4}-podium`)
      if (vp === 'phone') {
        await scrollTo(page, '[data-slot="gallery-title"]')
        await shot(page, 'phone-10-lineup-after-reveal')
      }
    })
  })
}
