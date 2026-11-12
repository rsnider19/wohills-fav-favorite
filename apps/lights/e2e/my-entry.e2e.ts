import { expect, test } from '@playwright/test'
import { PHONE, createEntryAs, entryOf, hoursFromNow, housePhoto, photosOf, resetLights, setSettings, signInAs, stubNetwork } from './helpers'

test.beforeEach(async () => {
  await resetLights()
})

test('edit: changing an approved entry sends it back to pending', async ({ page, context }) => {
  await signInAs(context, PHONE.approved) // owns seed No. 1, approved
  await stubNetwork(page)
  await page.goto('/enter')
  await expect(page.locator('[data-slot="status-pill"]')).toHaveText('On the board')
  await expect(page.getByText('Changes take it off the board until the admin approves it again.')).toBeVisible()

  await page.getByRole('button', { name: 'Edit entry' }).click()
  await page.getByRole('button', { name: 'Keep this photo' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Saving changes takes your house off the board')).toBeVisible()
  await page.getByLabel('Give it a name (optional)').fill('The Griswold Deluxe')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Changes saved. Your entry is waiting for approval again.')).toBeVisible()
  await expect(page.locator('[data-slot="status-pill"]')).toHaveText('Waiting for approval')
  expect(await entryOf(PHONE.approved)).toMatchObject({ status: 'pending', title: 'The Griswold Deluxe' })

  // Off the lineup until the admin approves it again.
  await page.getByRole('link', { name: 'The lineup' }).click()
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(4)
  await expect(page.getByText('The Griswold Special')).toHaveCount(0)
})

test('withdraw: deletes the entry and its photo, and the form comes back', async ({ page, context }) => {
  await createEntryAs(PHONE.other, { address: '7430 Test Dr', title: 'Withdraw Me' })
  await signInAs(context, PHONE.other)
  await stubNetwork(page)
  await page.goto('/enter')
  await expect(page.getByText('Withdraw Me')).toBeVisible()
  await page.getByRole('button', { name: 'Withdraw' }).click()
  await expect(page.getByRole('dialog', { name: 'Withdraw your entry?' })).toBeVisible()
  await page.getByRole('button', { name: 'Withdraw entry' }).click()
  await expect(page.getByText('Entry withdrawn.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Snap your house' })).toBeVisible()
  expect(await entryOf(PHONE.other)).toBeNull()
  expect(await photosOf(PHONE.other)).toEqual([])
})

test('locked: once voting opens, the entry is read-only', async ({ page, context }) => {
  await setSettings({ voting_opens_at: hoursFromNow(-1) }) // voting live, late entries still open
  await signInAs(context, PHONE.pending)
  await stubNetwork(page)
  await page.goto('/enter')
  await expect(page.getByText('Voting has started, so your entry is locked')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit entry' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Withdraw' })).toHaveCount(0)
})

test('late entry: after voting opens the form warns that it locks at once', async ({ page, context }) => {
  await setSettings({ voting_opens_at: hoursFromNow(-1) })
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page, { '7440 test dr': { lat: 40.1283, lng: -83.0466, inGeofence: true } })
  await page.goto('/enter')
  await page.locator('input[type=file]:not([capture])').setInputFiles(await housePhoto(page))
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('7440 Test Dr')
  await page.getByRole('button', { name: 'Find this address' }).click()
  await expect(page.locator('[data-slot="pin-coords"]')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText("Voting has already started, so once you send this entry you can't change or withdraw it.")).toBeVisible()
  await page.getByRole('button', { name: 'Light it up' }).click()
  await expect(page.getByRole('heading', { name: "You're on the list!" })).toBeVisible()
  // The windows overlap: no "Voting opens Dec 8" once it already has.
  await expect(page.getByText('Voting is already open, so neighbors can vote for it as soon as it lights up.')).toBeVisible()
  await expect(page.getByText(/^Voting opens/)).toHaveCount(0)
  await page.getByRole('button', { name: 'See my entry' }).click()
  await expect(page.getByText('Voting has started, so your entry is locked')).toBeVisible()
})
