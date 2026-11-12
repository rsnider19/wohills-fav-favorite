import { expect, test, type Page } from '@playwright/test'
import { PHONE, card, checkGuards, hoursFromNow, pollNow, resetLights, seedHouseId, service, setSettings, signInApi, signInAs, signInWithDialog, stubNetwork, voteOf } from './helpers'

// M7: voting on the cards and in the map sheet. The seed has 5 approved houses (No. 1 is
// 0103's, No. 6 is 0101's and pending, No. 8 is hidden). resetLights() removes every vote a
// test cast, so the seed's 21 votes stay as they are.

const VOTING = { voting_opens_at: hoursFromNow(-24), voting_closes_at: hoursFromNow(24 * 6) }

test.beforeEach(async () => {
  await resetLights(VOTING)
})

const ballot = (page: Page, n: number) => card(page, n).locator('[data-slot="vote-button"]')
const toast = (page: Page) => page.locator('[data-slot="toast"]')

test('sign in to vote → the vote goes in after the code → switch it → a reload keeps it', async ({ page }) => {
  await stubNetwork(page)
  await page.goto('/')
  await expect(ballot(page, 4)).toHaveText('Sign in to vote')
  await ballot(page, 4).click()
  // The sign-in says which vote is waiting.
  await expect(page.getByText("Your vote for Frosty's Hideout goes in as soon as you verify.")).toBeVisible()
  await signInWithDialog(page, PHONE.fresh)
  await expect(toast(page)).toHaveText("Vote cast for Frosty's Hideout ★")
  await expect(ballot(page, 4)).toHaveText('★ Your pick')
  await expect(card(page, 4)).toHaveAttribute('data-state', 'lit')
  await expect(card(page, 4).locator('[data-slot="house-badge"][data-tone="pick"]')).toHaveText('★ Your pick')
  expect(await voteOf(PHONE.fresh)).toBe(4)

  // Every other house offers a switch, as a ghost button (the lit card stays the brightest).
  await expect(ballot(page, 2)).toHaveText('Switch my vote here')
  await expect(card(page, 2).locator('[data-ballot="change"]')).toBeVisible()
  // No confirmation step: one tap moves the vote, and the toast says so.
  await ballot(page, 2).click()
  await expect(toast(page)).toHaveText('Vote switched to Candy Cane Lane ★')
  await expect(card(page, 2)).toHaveAttribute('data-state', 'lit')
  await expect(card(page, 4)).not.toHaveAttribute('data-state', 'lit')
  expect(await voteOf(PHONE.fresh)).toBe(2)

  // Tapping the pick again changes nothing.
  await ballot(page, 2).click()
  await expect(toast(page)).toHaveText('Candy Cane Lane is already your pick.')

  await checkGuards(page, 'voting lineup')

  await page.reload()
  await expect(ballot(page, 2)).toHaveText('★ Your pick')
  await expect(card(page, 2)).toHaveAttribute('data-state', 'lit')
  await expect(page.locator('[data-slot="house-card"][data-state="lit"]')).toHaveCount(1)
})

test('while a vote is saved every button waits; the card lights only once the database said yes', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page)
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/rest/v1/votes*', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  await page.goto('/')
  await ballot(page, 3).click()
  await expect(ballot(page, 3)).toHaveText('Saving…')
  await expect(ballot(page, 3)).toBeDisabled()
  await expect(ballot(page, 5)).toBeDisabled()
  await expect(card(page, 3)).not.toHaveAttribute('data-state', 'lit')
  release()
  await expect(card(page, 3)).toHaveAttribute('data-state', 'lit')
  await expect(ballot(page, 5)).toBeEnabled()
})

test('your own house says "Your house" and can never get your vote, not even through the sign-in', async ({ page }) => {
  await stubNetwork(page)
  await page.goto('/')
  // Signed out, 0103 taps No. 1 (their own house) and signs in.
  await ballot(page, 1).click()
  await signInWithDialog(page, PHONE.approved)
  await expect(toast(page)).toHaveText("That's your own house, so it can't get your vote. Pick another one!")
  await expect(ballot(page, 1)).toHaveText('Your house')
  await expect(ballot(page, 1)).toBeDisabled()
  expect(await voteOf(PHONE.approved)).toBeNull()
  // Every other house is a normal vote.
  await expect(ballot(page, 2)).toHaveText('Vote for this house')
})

test('a pending house has no card and no vote; once approved mid-vote it gets both without a reload', async ({ page, context }) => {
  await signInAs(context, PHONE.pending)
  await stubNetwork(page)
  await page.goto('/')
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
  await expect(card(page, 6)).toHaveCount(0)

  // The admin approves No. 6 while the page is open; the next poll brings it in.
  await service().from('houses').update({ status: 'approved' }).eq('id', seedHouseId(6))
  await pollNow(page)
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(6)
  // It's 0101's own house…
  await expect(ballot(page, 6)).toHaveText('Your house')
  // …so a neighbor votes for it instead.
  const { client } = await signInApi(PHONE.other)
  const { error } = await client.from('votes').upsert({ house_id: seedHouseId(6) }, { onConflict: 'user_id' })
  expect(error).toBeNull()
  expect(await voteOf(PHONE.other)).toBe(6)
})

test('outside the window the buttons say why and are disabled; the close flips them without a reload', async ({ page, context }) => {
  await resetLights() // voting opens in a week
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page)
  await page.goto('/')
  await expect(ballot(page, 2)).toHaveText(/^Voting opens (Mon|Tue|Wed|Thu|Fri|Sat|Sun), [A-Z][a-z]{2} \d{1,2}$/)
  await expect(ballot(page, 2)).toBeDisabled()

  // Voting open, closing in a few seconds: vote, then watch the close arrive.
  await setSettings({ voting_opens_at: hoursFromNow(-1), voting_closes_at: new Date(Date.now() + 9_000).toISOString() })
  await page.reload()
  await ballot(page, 2).click()
  await expect(ballot(page, 2)).toHaveText('★ Your pick')
  await expect(page.locator('[data-slot="countdown-label"]')).toHaveText('★ Voting closes in')
  await expect(ballot(page, 4)).toHaveText('Voting closed', { timeout: 15_000 })
  await expect(ballot(page, 4)).toBeDisabled()
  await expect(page.locator('[data-slot="scoreboard"]')).toHaveText('Votes are in')
  // The pick stays lit after the close.
  await expect(ballot(page, 2)).toHaveText('★ Your pick')
  await expect(ballot(page, 2)).toBeDisabled()
  await expect(card(page, 2)).toHaveAttribute('data-state', 'lit')

  // The database agrees: no more votes.
  const { client } = await signInApi(PHONE.other)
  const { error } = await client.from('votes').upsert({ house_id: seedHouseId(4) }, { onConflict: 'user_id' })
  expect(error?.code).toBe('42501')
})

test('paused voting says "paused", not "the votes are in"', async ({ page }) => {
  await setSettings({ voting_open: false })
  await stubNetwork(page)
  await page.goto('/')
  await expect(page.locator('[data-slot="phase-badge"]')).toHaveText('Voting paused')
  await expect(page.locator('[data-slot="scoreboard"]')).toHaveText('Back soon')
  await expect(page.locator('[data-slot="hero-tagline"]')).toHaveText('Voting is paused for a moment. Your vote is safe; check back soon.')
  await expect(ballot(page, 2)).toHaveText('Voting paused')
  await expect(ballot(page, 2)).toBeDisabled()
})

test('a pick the admin hides: no lit card, a notice, and the next vote counts', async ({ page, context }) => {
  const { client } = await signInApi(PHONE.fresh)
  expect((await client.from('votes').upsert({ house_id: seedHouseId(4) }, { onConflict: 'user_id' })).error).toBeNull()
  await service().from('houses').update({ status: 'hidden' }).eq('id', seedHouseId(4))
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page)
  await page.goto('/')
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(4)
  await expect(page.getByText("The house you voted for was taken off the board, so that vote doesn't count right now.")).toBeVisible()
  await expect(page.locator('[data-slot="house-card"][data-state="lit"]')).toHaveCount(0)
  // Not "switch": nothing counts right now.
  await expect(ballot(page, 2)).toHaveText('Vote for this house')
  await ballot(page, 2).click()
  await expect(toast(page)).toHaveText('Vote switched to Candy Cane Lane ★')
  await expect(page.getByText('The house you voted for was taken off the board')).toHaveCount(0)
  expect(await voteOf(PHONE.fresh)).toBe(2)
})

test('each refusal gets its own words: house taken off the board, voting closed, connection lost', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page)
  await page.goto('/')
  await expect(ballot(page, 5)).toHaveText('Vote for this house')

  // Hidden after the page loaded.
  await service().from('houses').update({ status: 'hidden' }).eq('id', seedHouseId(5))
  await ballot(page, 5).click()
  await expect(toast(page)).toHaveText("That house was just taken off the board, so your vote didn't go in. Pick another one.")
  await expect(card(page, 5)).toHaveCount(0) // the refusal refreshed the lineup

  // Closed after the page loaded (the clock still says open).
  await setSettings({ voting_open: false })
  await ballot(page, 3).click()
  await expect(toast(page)).toHaveText("Voting just closed, so your vote didn't go in.")
  await setSettings({ voting_open: true })
  await pollNow(page)
  await expect(ballot(page, 3)).toHaveText('Vote for this house')

  // Offline.
  await page.route('**/rest/v1/votes*', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()))
  await ballot(page, 3).click()
  await expect(toast(page)).toHaveText("Your vote didn't go in: the connection dropped. Check it and try again.")
  await expect(card(page, 3)).not.toHaveAttribute('data-state', 'lit')
  expect(await voteOf(PHONE.fresh)).toBeNull()
})

test('the map sheet has the same vote button, with Directions shrunk to its icon', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page)
  await page.goto('/?view=map&house=4')
  const sheet = page.locator('[data-slot="house-sheet"]')
  await expect(sheet.getByRole('heading')).toHaveText("Frosty's Hideout")
  await expect(sheet.locator('[data-slot="navigate"]')).toHaveAttribute('data-variant', 'icon')
  await sheet.getByRole('button', { name: 'Vote for this house' }).click()
  await expect(toast(page)).toHaveText("Vote cast for Frosty's Hideout ★")
  await expect(sheet.locator('[data-slot="vote-button"]')).toHaveText('★ Your pick')
  expect(await voteOf(PHONE.fresh)).toBe(4)
  await page.getByRole('group', { name: 'Show the houses as' }).getByRole('button', { name: 'Lineup' }).click()
  await expect(card(page, 4)).toHaveAttribute('data-state', 'lit')
})
