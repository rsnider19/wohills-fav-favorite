import { expect, test, type Browser, type Page } from '@playwright/test'
import { CANDLEWOOD, DOWNTOWN, PHONE, checkGuards, resetLights, service, signInAs, stubNetwork } from './helpers'

// M6: the lineup ⇄ map toggle, the bulbs, the house sheet, the navigate links, keyboard
// access and reduced motion. The basemap is the offline fixture (stubNetwork), so these
// never touch CARTO. The seed has 5 approved houses (No. 1–5), 2 pending, 1 hidden.

test.beforeEach(async () => {
  await resetLights()
})

const bulbs = (page: Page) => page.locator('[data-slot="map-bulb"]')
const bulb = (page: Page, n: number) => page.locator(`[data-slot="map-bulb"][data-number="${n}"]`)
const sheet = (page: Page) => page.locator('[data-slot="house-sheet"]')
const toggle = (page: Page, name: 'Lineup' | 'Map') =>
  page.getByRole('group', { name: 'Show the houses as' }).getByRole('button', { name })

async function openMap(page: Page, path = '/?view=map') {
  await page.goto(path)
  await expect(bulbs(page)).toHaveCount(5)
}

test('the toggle switches lineup ⇄ map, survives a reload, and the map shows only approved houses', { tag: '@smoke' }, async ({ page }) => {
  await stubNetwork(page)
  await page.goto('/')
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
  await expect(toggle(page, 'Lineup')).toHaveAttribute('aria-pressed', 'true')

  await toggle(page, 'Map').click()
  await expect(page).toHaveURL(/\?view=map$/)
  await expect(toggle(page, 'Map')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-slot="house-map"] canvas')).toBeVisible()
  await expect(bulbs(page)).toHaveCount(5)
  // Approved only: No. 6 and 7 are pending, No. 8 is hidden.
  const numbers = await bulbs(page).evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.number)).sort())
  expect(numbers).toEqual([1, 2, 3, 4, 5])
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(0)

  await page.reload()
  await expect(bulbs(page)).toHaveCount(5)
  await expect(toggle(page, 'Map')).toHaveAttribute('aria-pressed', 'true')

  await toggle(page, 'Lineup').click()
  await expect(page).toHaveURL(/localhost:\d+\/$/)
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
  await expect(bulbs(page)).toHaveCount(0)
})

test('picking a bulb opens the sheet; ?house= picks it on load; closing clears it', async ({ page }) => {
  await stubNetwork(page)
  await openMap(page)
  await expect(page.locator('[data-slot="map-hint"]')).toHaveText('Tap a bulb to see the house')

  await bulb(page, 4).click()
  await expect(sheet(page).getByRole('heading')).toHaveText("Frosty's Hideout")
  await expect(sheet(page)).toContainText('7000 Blackstone Dr')
  await expect(bulb(page, 4)).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/\?view=map&house=4$/)
  const directions = sheet(page).getByRole('link', { name: /^Directions to 7000 Blackstone Dr/ })
  await expect(directions).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=40.137000,-83.059000')

  // Another bulb swaps the sheet; the same bulb again closes it.
  await bulb(page, 3).click()
  await expect(sheet(page).getByRole('heading')).toHaveText('920 Clubview Blvd S')
  await expect(bulb(page, 4)).toHaveAttribute('aria-pressed', 'false')
  await bulb(page, 3).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\?view=map$/)

  // A shared link opens the map on that house.
  await openMap(page, '/?view=map&house=2')
  await expect(sheet(page).getByRole('heading')).toHaveText('Candy Cane Lane')
  await sheet(page).getByRole('button', { name: 'Close' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\?view=map$/)

  // A pending house's number picks nothing.
  await openMap(page, '/?view=map&house=6')
  await expect(sheet(page)).toHaveCount(0)
})

test('a poll adds and removes bulbs, and keeps the picked house and the focus', async ({ page }) => {
  await stubNetwork(page)
  await openMap(page, '/?view=map&house=1')
  await expect(sheet(page).getByRole('heading')).toHaveText('The Griswold Special')
  await bulb(page, 2).focus()
  // The 30 s poll, now: usePolling also refreshes when the tab becomes visible.
  const poll = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  const setStatus = async (n: number, status: string) =>
    expect((await service().from('houses').update({ status }).eq('entry_number', n)).error).toBeNull()

  // The admin approves No. 6: exactly one new bulb; the pick, the sheet and the focus stay.
  await setStatus(6, 'approved')
  await poll()
  await expect(bulbs(page)).toHaveCount(6)
  await expect(page.locator('.maplibregl-marker')).toHaveCount(6)
  await expect(bulb(page, 1)).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet(page).getByRole('heading')).toHaveText('The Griswold Special')
  await expect(bulb(page, 2)).toBeFocused()
  // Nothing new: no duplicate markers.
  await poll()
  await poll()
  await expect(page.locator('.maplibregl-marker')).toHaveCount(6)

  // The admin hides the picked house: its bulb and its sheet go.
  await setStatus(1, 'hidden')
  await poll()
  await expect(bulbs(page)).toHaveCount(5)
  await expect(sheet(page)).toHaveCount(0)

  // The bulbs' Tab order is still the lineup's order.
  const onMap = await bulbs(page).evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.number)))
  await toggle(page, 'Lineup').click()
  const inLineup = await page.locator('[data-slot="house-card"] [data-slot="house-number"] b').allTextContents()
  expect(onMap).toEqual(inLineup.map(Number))
})

test('back, forward and in-app links follow the view and the house in the address bar', async ({ page }) => {
  await stubNetwork(page)
  await page.goto('/')
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
  // The hero's "#houses" link adds a history entry; the map then replaces it.
  await page.locator('[data-slot="hero-actions"] a[href="#houses"]').click()
  await expect(page).toHaveURL(/\/#houses$/)
  await toggle(page, 'Map').click()
  await bulb(page, 2).click()
  await expect(page).toHaveURL(/\?view=map&house=2$/)

  await page.goBack()
  await expect(page).toHaveURL(/localhost:\d+\/$/)
  await expect(toggle(page, 'Lineup')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)

  await page.goForward()
  await expect(toggle(page, 'Map')).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet(page).getByRole('heading')).toHaveText('Candy Cane Lane')

  // To /enter and back by the page's own link: home is the lineup (route.ts keeps no ?view=).
  await page.locator('[data-slot="hero-actions"]').getByRole('link', { name: 'Enter your house' }).click()
  await expect(page).toHaveURL(/\/enter$/)
  await page.locator('[data-slot="back-link"]').click()
  await expect(page).toHaveURL(/localhost:\d+\/$/)
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
  await expect(bulbs(page)).toHaveCount(0)
})

// [label, user agent, extra navigator overrides, expected href for No. 1, opens a new tab]
const AGENTS: [string, string, { platform?: string; maxTouchPoints?: number }, string, boolean][] = [
  [
    'iPhone, iOS 18.4',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
    {},
    'https://maps.apple.com/directions?destination=40.123140,-83.051570',
    false,
  ],
  [
    'iPhone, iOS 17.5',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    {},
    'https://maps.apple.com/?daddr=40.123140,-83.051570',
    false,
  ],
  [
    'iPad in desktop mode (says Mac)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15',
    { platform: 'MacIntel', maxTouchPoints: 5 },
    'https://maps.apple.com/directions?destination=40.123140,-83.051570',
    false,
  ],
  [
    'Android, Chrome',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    {},
    'https://www.google.com/maps/dir/?api=1&destination=40.123140,-83.051570',
    false,
  ],
  [
    'Mac, Chrome',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    { platform: 'MacIntel', maxTouchPoints: 0 },
    'https://www.google.com/maps/dir/?api=1&destination=40.123140,-83.051570',
    true,
  ],
]

async function pageAs(browser: Browser, userAgent: string, nav: { platform?: string; maxTouchPoints?: number }) {
  const context = await browser.newContext({ userAgent, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.addInitScript((nav) => {
    if (nav.platform) Object.defineProperty(Navigator.prototype, 'platform', { get: () => nav.platform })
    if (nav.maxTouchPoints !== undefined) Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => nav.maxTouchPoints })
  }, nav)
  const page = await context.newPage()
  await stubNetwork(page)
  return page
}

for (const [label, ua, nav, href, newTab] of AGENTS) {
  test(`navigate links on ${label}`, async ({ browser, baseURL }) => {
    const page = await pageAs(browser, ua, nav)
    const app = href.includes('apple') ? 'Apple Maps' : 'Google Maps'
    const name = `Directions to 1221 Candlewood Dr (${app}${newTab ? ', opens in a new tab' : ''})`
    // On the card (the lineup)...
    await page.goto(`${baseURL}/?house=1`)
    const card = page.locator('[data-slot="house-card"]').first()
    await expect(card.getByRole('heading')).toHaveText('The Griswold Special')
    const onCard = card.getByRole('link', { name })
    await expect(onCard).toHaveAttribute('href', href)
    if (newTab) {
      await expect(onCard).toHaveAttribute('target', '_blank')
      await expect(onCard).toHaveAttribute('rel', 'noopener noreferrer')
    } else await expect(onCard).not.toHaveAttribute('target')
    // ...and in the map's sheet.
    await page.goto(`${baseURL}/?view=map&house=1`)
    await expect(sheet(page).getByRole('link', { name })).toHaveAttribute('href', href)
    await page.context().close()
  })
}

test('keyboard: Tab reaches the bulbs, Enter opens the sheet, Escape returns to the bulb', async ({ page }) => {
  await stubNetwork(page)
  await openMap(page)
  // Every bulb is a named button.
  await expect(page.getByRole('button', { name: 'No. 1: The Griswold Special, 1221 Candlewood Dr' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'No. 3: 920 Clubview Blvd S' })).toBeVisible()
  // From the toggle, Tab goes through the map canvas to the first bulb.
  await toggle(page, 'Map').focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('.maplibregl-canvas')).toBeFocused()
  await page.keyboard.press('Tab')
  const first = page.locator('[data-slot="map-bulb"]:focus')
  await expect(first).toHaveCount(1)
  const n = Number(await first.getAttribute('data-number'))

  await page.keyboard.press('Enter')
  await expect(sheet(page).getByRole('heading')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(sheet(page).getByRole('link', { name: /^Directions to / })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(bulb(page, n)).toBeFocused()
})

test('keyboard: focusing a bulb outside the view moves the map to it', async ({ page }) => {
  await stubNetwork(page)
  await openMap(page, '/?view=map&house=1') // zoomed in on No. 1; No. 4 is far off screen
  // Bounding boxes are relative to the viewport, and focusing scrolls the page: measure the
  // map area and the bulb together, every time.
  const area = page.locator('[data-slot="house-map-area"]')
  const onScreen = async () => {
    const a = (await area.boundingBox())!
    const b = (await bulb(page, 4).boundingBox())!
    const x = b.x + b.width / 2
    const y = b.y + b.height // the bulb's tip, its anchor
    return x > a.x && x < a.x + a.width && y > a.y && y < a.y + a.height
  }
  const scrolled = () => page.locator('.maplibregl-map').evaluate((el) => el.scrollTop + el.scrollLeft)
  await area.scrollIntoViewIfNeeded()
  expect(await onScreen()).toBe(false)
  await bulb(page, 4).focus()
  await expect.poll(onScreen).toBe(true)
  // MapLibre's container never scrolls (that would knock the bulbs off their spots).
  expect(await scrolled()).toBe(0)

  // Escape from the sheet returns focus to its bulb even after the map was dragged away
  // from it, and the bulb comes back into view.
  await page.keyboard.press('Enter')
  await expect(sheet(page).getByRole('heading')).toBeFocused()
  await area.scrollIntoViewIfNeeded()
  const a = (await area.boundingBox())!
  const from = { x: a.x + a.width / 2, y: a.y + 100 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 300, from.y + 200, { steps: 8 })
  await page.mouse.up()
  await expect.poll(onScreen).toBe(false)
  await sheet(page).getByRole('heading').focus()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(bulb(page, 4)).toBeFocused()
  await expect.poll(onScreen).toBe(true)
  expect(await scrolled()).toBe(0)
})

test('the picked bulb pulses, holds still under reduced motion, and pauses off screen', async ({ page }) => {
  await stubNetwork(page)
  await openMap(page, '/?view=map&house=1')
  await page.locator('[data-slot="house-map"]').scrollIntoViewIfNeeded()
  const pulses = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => (a as CSSAnimation).animationName === 'bulb-pulse')
        .map((a) => a.playState),
    )
  await expect.poll(pulses).toEqual(['running'])
  await page.evaluate(() => window.scrollTo(0, 0)) // the map leaves the screen
  await expect.poll(pulses).toEqual(['paused'])

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openMap(page, '/?view=map&house=1')
  await page.locator('[data-slot="house-map"]').scrollIntoViewIfNeeded()
  await expect(sheet(page)).toBeVisible()
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)
  expect(running).toBe(0)
})

test('the locate button shows where you are, and says why when it cannot', async ({ page, context }) => {
  await stubNetwork(page)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(CANDLEWOOD)
  await openMap(page)
  await page.getByRole('button', { name: 'Find my location' }).click()
  await expect(page.locator('.maplibregl-user-location-dot')).toBeVisible()

  // Across town: the map stays on the neighborhood and says why.
  await context.setGeolocation(DOWNTOWN)
  await openMap(page)
  await page.getByRole('button', { name: 'Find my location' }).click()
  await expect(page.locator('[data-slot="toast"]')).toHaveText("You're outside Worthington Hills, so the map stays on the neighborhood.")

  // Location refused.
  await context.clearPermissions()
  await openMap(page)
  await page.getByRole('button', { name: 'Find my location' }).click()
  await expect(page.locator('[data-slot="toast"]')).toHaveText('Location is off for this site. Turn it on in your browser to see where you are.')
})

test("an owner's pending entry isn't on the map, and the map says so", async ({ page, context }) => {
  await signInAs(context, PHONE.pending) // owns No. 6, pending
  await stubNetwork(page)
  await openMap(page)
  await expect(page.getByText('Your house lights up on the map as soon as the admin approves it.')).toBeVisible()
  await expect(bulb(page, 6)).toHaveCount(0)
})

test('without the basemap the map says so and offers the lineup', async ({ page }) => {
  await stubNetwork(page)
  await page.route('https://basemaps.cartocdn.com/**', (route) => route.abort())
  await page.goto('/?view=map')
  await expect(page.getByText("The map didn't load.")).toBeVisible()
  // The bulbs and controls under the overlay are out of reach (inert).
  await expect(page.locator('[data-slot="house-map-canvas"]')).toHaveJSProperty('inert', true)
  await page.getByRole('button', { name: 'Show the lineup' }).click()
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
  await expect(page).toHaveURL(/localhost:\d+\/$/)
  // Focus lands on the toggle, not on <body>.
  await expect(toggle(page, 'Lineup')).toBeFocused()
})

test('without the map chunk the lineup still works', async ({ page }) => {
  await stubNetwork(page)
  // The dev server serves the lazy map as /src/map/HouseMap.tsx (a hashed chunk in a build).
  await page.route('**/src/map/HouseMap.tsx*', (route) => route.abort())
  await page.goto('/?view=map')
  await expect(page.getByText("The map didn't load.")).toBeVisible()
  await expect(page.getByText("The map didn't load.")).toHaveCount(1)
  await page.getByRole('button', { name: 'Show the lineup' }).click()
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
})

test('the map view keeps the guardrails at phone width', { tag: '@smoke' }, async ({ page }) => {
  await stubNetwork(page)
  await openMap(page)
  await page.locator('[data-slot="house-map"]').scrollIntoViewIfNeeded()
  await checkGuards(page, 'map')
  await bulb(page, 1).click()
  await expect(sheet(page)).toBeVisible()
  await checkGuards(page, 'map with the sheet')
  await toggle(page, 'Lineup').click()
  await checkGuards(page, 'lineup with navigate buttons')
})
