import { expect, test, type Page } from '@playwright/test'
import { PHONE, card, checkGuards, contestAdmin, hoursFromNow, pollNow, resetLights, seedHouseId, service, setSettings, signInApi, signInAs, stubNetwork } from './helpers'
import { flashProbe } from './flash'

// M7: the reveal. The seed's counts are No. 1: 7, No. 2: 5, No. 4: 4, No. 3: 2, No. 5: 1
// (and 2 on the hidden No. 8, which never counts), so the podium is 1, 2, 4.

const CLOSED = { voting_opens_at: hoursFromNow(-24 * 13), voting_closes_at: hoursFromNow(-1) }

test.beforeEach(async () => {
  await resetLights(CLOSED)
})

const podium = (page: Page) => page.locator('[data-slot="podium"]')
const slot = (page: Page, rank: number) => page.locator(`[data-slot="podium-slot"][data-rank="${rank}"]`)
const toWinners = (page: Page) => page.locator('#winners').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))

test('the reveal flips with contest-admin while the page is open, and the power surge plays once', { tag: '@smoke' }, async ({ page }) => {
  await stubNetwork(page)
  const asked: string[] = []
  page.on('request', (r) => r.url().includes('/rpc/get_results') && asked.push(r.url()))
  await page.goto('/')
  await expect(page.locator('[data-slot="scoreboard"]')).toHaveText('Votes are in')
  await expect(card(page, 2).locator('[data-slot="vote-button"]')).toHaveText('Voting closed')
  await expect(podium(page)).toHaveCount(0)
  // Before the reveal the page never asks for results, and the API answers nobody: not a
  // visitor, not a voter (the admin is checked in the preview test).
  expect(asked).toEqual([])
  const { client: voter } = await signInApi(PHONE.fresh)
  expect((await voter.rpc('get_results')).data).toEqual([])
  expect((await voter.from('votes').select('house_id')).data).toEqual([]) // only their own vote, and they have none

  const out = contestAdmin({ RESULTS_VISIBLE: 'true' })
  // The same call answers once revealed (so the empty answer above was the gate, not a fault).
  expect(((await voter.rpc('get_results')).data as unknown[]).length).toBe(3)
  expect(out).toContain('results      VISIBLE (revealed)')
  await pollNow(page) // a phone coming back to the tab; otherwise the 30 s poll
  await expect(page.locator('[data-slot="toast"]')).toHaveText('The winners are in! ★')
  await expect(page.locator('[data-slot="phase-badge"]')).toHaveText('Winners are in')
  await expect(page.getByRole('link', { name: 'See the winners' })).toHaveAttribute('href', '#winners')

  // Armed (dark) until the podium is on screen, then the surge, then lit.
  await expect(podium(page)).toHaveAttribute('data-reveal', /armed|play/)
  await toWinners(page)
  await expect(podium(page)).toHaveAttribute('data-reveal', 'play')
  await expect(page.locator('[data-slot="blackout"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible()
  await expect(podium(page)).not.toHaveAttribute('data-reveal', /.*/, { timeout: 9_000 })
  await expect(page.locator('[data-slot="blackout"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Replay the reveal' })).toBeVisible()
  await checkGuards(page, 'podium after the surge (with Replay)')

  // Rank, number, name, address, votes and directions, in rank order.
  await expect(slot(page, 1)).toContainText('1st place')
  await expect(slot(page, 1)).toContainText('Winner')
  await expect(slot(page, 1).getByRole('heading')).toHaveText('The Griswold Special')
  await expect(slot(page, 1).locator('[data-slot="podium-votes"]')).toHaveText('7votes')
  await expect(slot(page, 2).getByRole('heading')).toHaveText('Candy Cane Lane')
  await expect(slot(page, 2).locator('[data-slot="podium-votes"] b')).toHaveText('5')
  await expect(slot(page, 3).getByRole('heading')).toHaveText("Frosty's Hideout")
  await expect(slot(page, 3).locator('[data-slot="podium-votes"] b')).toHaveText('4')
  await expect(slot(page, 3).getByRole('link', { name: /^Directions to 7000 Blackstone Dr/ })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&destination=40.137000,-83.059000',
  )
  await expect(page.locator('[data-slot="podium-chip"]')).toHaveCount(0) // no ties here

  // The lineup stays, without vote buttons, with a ribbon on each winner.
  await expect(page.locator('[data-slot="vote-button"]')).toHaveCount(0)
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
  await expect(card(page, 4).locator('[data-slot="house-badge"][data-tone="rank"]')).toHaveText('★ 3rd place')
  await expect(card(page, 5).locator('[data-slot="house-badge"]')).toHaveCount(0)

  // Only the first visit plays it: a reload shows the lit podium at once, with Replay.
  await page.reload()
  await expect(slot(page, 1)).toBeVisible()
  await expect(podium(page)).not.toHaveAttribute('data-reveal', /.*/)
  await toWinners(page)
  await page.waitForTimeout(500)
  await expect(podium(page)).not.toHaveAttribute('data-reveal', /.*/)
  await page.getByRole('button', { name: 'Replay the reveal' }).click()
  await expect(podium(page)).toHaveAttribute('data-reveal', 'play')
  // Skip: lit at once, focus on the heading (the same button now offers Replay).
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(podium(page)).not.toHaveAttribute('data-reveal', /.*/)
  await expect(page.getByRole('heading', { name: 'The Winners' })).toBeFocused()
  await expect(page.locator('[data-slot="blackout"]')).toHaveCount(0)
})

test('reduced motion: the lit podium at once, no blackout, nothing animating, no Skip or Replay', async ({ page }) => {
  await setSettings({ results_visible: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await stubNetwork(page)
  await page.goto('/')
  await expect(slot(page, 1)).toBeVisible()
  await toWinners(page)
  await page.waitForTimeout(800)
  await expect(podium(page)).not.toHaveAttribute('data-reveal', /.*/)
  await expect(page.locator('[data-slot="blackout"]')).toHaveCount(0)
  await expect(page.locator('[data-slot="reveal-control"]')).toHaveCount(0)
  const state = await page.evaluate(() => ({
    running: document.getAnimations().filter((a) => a.playState === 'running').length,
    opacity: [...document.querySelectorAll('[data-slot="podium-slot"]')].map((el) => getComputedStyle(el).opacity),
  }))
  expect(state.running).toBe(0)
  expect(state.opacity).toEqual(['1', '1', '1'])
  await checkGuards(page, 'podium')
})

test('the pause switch mid-surge ends it lit', async ({ page }) => {
  await setSettings({ results_visible: true })
  await stubNetwork(page)
  await page.goto('/')
  await toWinners(page)
  await expect(podium(page)).toHaveAttribute('data-reveal', 'play')
  // Pressed where it is (a real tap would scroll the podium away, which also ends it).
  await page.getByRole('button', { name: 'Pause the twinkling' }).evaluate((el) => (el as HTMLElement).click())
  await expect(podium(page)).not.toHaveAttribute('data-reveal', /.*/)
  await expect(page.locator('[data-slot="blackout"]')).toHaveCount(0)
  const opacity = await page.locator('[data-slot="podium-slot"]').evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity))
  expect(opacity).toEqual(['1', '1', '1'])
})

test('ties show "Tied" and the rule; the earlier entry ranks first', async ({ page }) => {
  // Two more votes for No. 2 (7 each with No. 1), cast while voting was open.
  await setSettings({ voting_opens_at: hoursFromNow(-24), voting_closes_at: hoursFromNow(24) })
  for (const phone of [PHONE.fresh, PHONE.other]) {
    const { client } = await signInApi(phone)
    expect((await client.from('votes').upsert({ house_id: seedHouseId(2) }, { onConflict: 'user_id' })).error).toBeNull()
  }
  await setSettings({ ...CLOSED, results_visible: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await stubNetwork(page)
  await page.goto('/')
  await expect(slot(page, 1).getByRole('heading')).toHaveText('The Griswold Special')
  await expect(slot(page, 2).getByRole('heading')).toHaveText('Candy Cane Lane')
  for (const rank of [1, 2]) {
    await expect(slot(page, rank).locator('[data-slot="podium-votes"] b')).toHaveText('7')
    await expect(slot(page, rank).locator('[data-slot="podium-chip"]')).toHaveText('Tied')
  }
  await expect(slot(page, 3).locator('[data-slot="podium-chip"]')).toHaveCount(0)
  await expect(page.locator('[data-slot="podium-rule"]')).toHaveText('Ranked by votes. Ties go to the house that entered first.')
})

test('the podium never claims "no winners" by mistake: a failed count keeps counting; two places; no votes at all', async ({ page }) => {
  // Only No. 3 (2 votes) and No. 5 (1 vote) stay approved: a podium of two.
  await service().from('houses').update({ status: 'hidden' }).in('id', [1, 2, 4].map(seedHouseId))
  await setSettings({ results_visible: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await stubNetwork(page)
  // The first count fails (a phone's connection dropping on reveal night).
  let failures = 1
  await page.route('**/rest/v1/rpc/get_results*', (route) => (failures-- > 0 ? route.abort() : route.continue()))
  await page.goto('/')
  await expect(page.locator('[data-slot="podium-wait"]')).toHaveText('Counting the votes…')
  await page.waitForTimeout(500)
  await expect(page.getByText('No votes were cast')).toHaveCount(0)
  await pollNow(page)
  await expect(page.locator('[data-slot="podium-list"]')).toHaveAttribute('data-count', '2')
  await expect(page.locator('[data-slot="podium-slot"]')).toHaveCount(2)
  await expect(slot(page, 1).getByRole('heading')).toHaveText('920 Clubview Blvd S')
  await expect(slot(page, 2).locator('[data-slot="podium-votes"]')).toHaveText('1vote')
  await expect(page.locator('[data-slot="podium-rule"]')).toBeVisible()
  await checkGuards(page, 'a podium of two')
  await page.setViewportSize({ width: 1280, height: 800 })
  await checkGuards(page, 'a podium of two (desktop)')

  // Only houses nobody voted for: no winners, said plainly (get_results still answers with
  // their 0-vote rows; a 0-vote house is not a winner).
  await service().from('houses').update({ status: 'hidden' }).in('id', [3, 5].map(seedHouseId))
  await service().from('houses').update({ status: 'approved' }).in('id', [6, 7].map(seedHouseId))
  await pollNow(page)
  await expect(page.locator('[data-slot="podium-wait"]')).toHaveText('No votes were cast, so there are no winners this year.')
  await expect(page.locator('[data-slot="podium-list"]')).toHaveCount(0)
  await expect(page.locator('[data-slot="podium-rule"]')).toHaveCount(0)
})

test("the admin's ?preview=results shows a sample podium and never a real count", async ({ page, context }) => {
  await setSettings({ voting_opens_at: hoursFromNow(-24), voting_closes_at: hoursFromNow(24) }) // live voting, no reveal
  await signInAs(context, PHONE.admin)
  await stubNetwork(page)
  const rpc: unknown[] = []
  page.on('response', async (r) => {
    if (r.url().includes('/rpc/get_results')) rpc.push(await r.json())
  })
  await page.goto('/?preview=results')
  await expect(page.locator('[data-slot="phase-badge"]')).toHaveText('Preview: Winners are in')
  await expect(page.getByText('★ Preview: sample podium')).toBeVisible()
  await expect(page.getByText('A sample podium from the first three houses. The real results stay hidden until the reveal.')).toBeVisible()
  // The first three houses by number, no counts.
  await expect(slot(page, 1).getByRole('heading')).toHaveText('The Griswold Special')
  await expect(slot(page, 3).getByRole('heading')).toHaveText('920 Clubview Blvd S')
  await expect(page.locator('[data-slot="podium-votes"] b')).toHaveText(['??', '??', '??'])
  await expect(page.locator('body')).not.toContainText(/\b[0-9]+ ?votes\b/i)
  // The page never asked for the real results (and the database would answer nothing).
  expect(rpc).toEqual([])
  const { client } = await signInApi(PHONE.admin)
  expect((await client.rpc('get_results')).data).toEqual([])
  // It plays every time (the admin is checking it), and never marks the real reveal seen.
  await toWinners(page)
  await expect(podium(page)).toHaveAttribute('data-reveal', 'play')
  expect(await page.evaluate(() => localStorage.getItem('lights-reveal-seen'))).toBeNull()
})

for (const vp of ['phone', 'desktop'] as const) {
  test.describe(vp, () => {
    if (vp === 'desktop') test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })

    test(`flash probe on the power surge (${vp}): at most 3 flashes in any second, per block and on the whole screen`, async ({ page }) => {
      test.setTimeout(240_000)
      await setSettings({ results_visible: true })
      await stubNetwork(page)
      await page.clock.install()
      await page.goto('/')
      await page.evaluate(() => document.fonts.ready)
      await expect(podium(page)).toHaveAttribute('data-reveal', /armed|play/)
      await toWinners(page)
      await expect(podium(page)).toHaveAttribute('data-reveal', 'play')
      // Hold the app's timer that ends the reveal; the probe steps the animations itself.
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50))

      // Everything on screen stepped together (M4's per-block measure).
      const all = await flashProbe(page, 7200)
      expect(all.stepped).toEqual(expect.arrayContaining(['blackout', 'surge', 'surge-winner']))
      expect(all.block, 'worst 6×6 block').toBeLessThanOrEqual(3)
      // The reveal alone, merged over the whole screen.
      const reveal = await flashProbe(page, 7200, ['blackout', 'surge', 'surge-winner'])
      expect(reveal.screen, 'whole screen').toBeLessThanOrEqual(3)
      console.log(`flash probe ${vp}: worst block ${all.block}, whole screen (reveal alone) ${reveal.screen}`)
    })
  })
}
