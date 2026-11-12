import { expect, test } from '@playwright/test'
import { PHONE, createEntryAs, resetLights, service, signInAs, stubNetwork } from './helpers'

test.beforeEach(async () => {
  await resetLights()
})

test('approve: a new entry goes from the queue to the lineup', async ({ page, context }) => {
  const { entry_number } = await createEntryAs(PHONE.other, { address: '7410 Test Dr', title: 'E2E Approve Me' })
  await signInAs(context, PHONE.admin)
  await stubNetwork(page)
  await page.goto('/')
  // The admin's way in: the footer link, with the number waiting.
  await page.getByRole('link', { name: 'Moderation · 3 waiting' }).click()
  await expect(page.getByRole('heading', { name: 'Moderation' })).toBeVisible()
  const row = page.locator('[data-slot="admin-row"]', { hasText: 'E2E Approve Me' })
  await expect(row).toContainText('7410 Test Dr')
  await expect(row.getByRole('link', { name: /Check the pin/ })).toHaveAttribute('href', /google\.com\/maps\/search/)
  await row.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText(`No. ${entry_number} is on the board.`)).toBeVisible()
  await expect(page.locator('[data-slot="admin-row"]', { hasText: 'E2E Approve Me' })).toHaveCount(0)
  await page.getByRole('button', { name: /^On the board/ }).click()
  await expect(page.locator('[data-slot="admin-row"]', { hasText: 'E2E Approve Me' })).toBeVisible()

  await page.getByRole('link', { name: 'The lineup' }).click()
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(6)
  await expect(page.locator('[data-slot="house-card"]', { hasText: 'E2E Approve Me' })).toBeVisible()
})

test('hide and put back: an approved entry leaves the lineup and returns', async ({ page, context }) => {
  await signInAs(context, PHONE.admin)
  await stubNetwork(page)
  await page.goto('/admin')
  await page.getByRole('button', { name: /^On the board/ }).click()
  await page.locator('[data-slot="admin-row"]', { hasText: 'Candy Cane Lane' }).getByRole('button', { name: 'Hide' }).click()
  await expect(page.getByText('No. 2 is hidden.')).toBeVisible()
  await page.getByRole('link', { name: 'The lineup' }).click()
  await expect(page.locator('[data-slot="house-card"]')).toHaveCount(4)
  await expect(page.getByText('Candy Cane Lane')).toHaveCount(0)

  await page.getByRole('link', { name: /Moderation/ }).click()
  await page.getByRole('button', { name: /^Hidden/ }).click()
  await page.locator('[data-slot="admin-row"]', { hasText: 'Candy Cane Lane' }).getByRole('button', { name: 'Put back' }).click()
  await expect(page.getByText('No. 2 is on the board.')).toBeVisible()
  await page.getByRole('link', { name: 'The lineup' }).click()
  await expect(page.locator('[data-slot="house-card"]', { hasText: 'Candy Cane Lane' })).toBeVisible()
})

test('edit: the admin renames an entry without changing its status', async ({ page, context }) => {
  await signInAs(context, PHONE.admin)
  await stubNetwork(page)
  await page.goto('/admin')
  const row = page.locator('[data-slot="admin-row"]', { hasText: 'Waiting on the Admin' })
  await row.getByRole('button', { name: 'Edit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit No. 6' })
  await dialog.getByLabel('Give it a name (optional)').fill('Renamed by the Admin')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await expect(page.locator('[data-slot="admin-row"]', { hasText: 'Renamed by the Admin' })).toContainText('Waiting for approval')
  const { data } = await service().from('houses').select('title, status').eq('entry_number', 6).single()
  expect(data).toEqual({ title: 'Renamed by the Admin', status: 'pending' })
})

test('not the admin: the queue stays closed', async ({ page, context }) => {
  await signInAs(context, PHONE.fresh)
  await stubNetwork(page)
  await page.goto('/admin')
  await expect(page.getByText("This phone isn't the contest admin.")).toBeVisible()
  await expect(page.locator('[data-slot="admin-row"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Moderation/ })).toHaveCount(0)
})
