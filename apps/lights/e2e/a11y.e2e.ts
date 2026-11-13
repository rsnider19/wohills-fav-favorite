import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { PHONE, hoursFromNow, resetLights, setSettings, signInAs, stubNetwork } from './helpers'

// M8: axe-core (WCAG 2.2 A/AA and best practices) on every screen a neighbor or the admin
// sees, phone and desktop, with motion reduced so nothing is caught mid-animation.
// Contrast on the night-sky gradients is "incomplete" for axe; design.test.ts pins those pairs.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

async function expectNoViolations(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const found = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
  expect(found, `${screen}: axe violations`).toEqual([])
}

test.beforeEach(async () => {
  await resetLights()
})

for (const vp of ['phone', 'desktop'] as const) {
  test(`axe finds nothing on any screen (${vp})`, { tag: '@smoke' }, async ({ page, context }) => {
    test.setTimeout(120_000)
    if (vp === 'desktop') await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await stubNetwork(page)
    await page.goto('/')
    await expect(page.locator('[data-slot="house-card"]')).toHaveCount(5)
    await expectNoViolations(page, 'lineup')
    await page.goto('/?view=map')
    await expect(page.locator('[data-slot="map-bulb"]')).toHaveCount(5)
    await page.locator('[data-slot="map-bulb"][data-number="1"]').click()
    await expect(page.locator('[data-slot="house-sheet"]')).toBeVisible()
    await expectNoViolations(page, 'map with the sheet')
    await page.goto('/?signin')
    await expect(page.getByLabel('Phone number')).toBeVisible()
    await expectNoViolations(page, 'sign-in dialog')
    await page.goto('/enter')
    await expect(page.getByRole('button', { name: 'Verify your phone to start' })).toBeVisible()
    await expectNoViolations(page, 'enter (signed out)')

    // An owner: "My entry" (approved, still editable).
    await signInAs(context, PHONE.approved)
    await page.goto('/enter')
    await expect(page.locator('[data-slot="my-entry"]')).toBeVisible()
    await expectNoViolations(page, 'my entry')

    // The admin (signed in last, so this session wins): voting, the form, the queue.
    await setSettings({ voting_opens_at: hoursFromNow(-1) })
    await signInAs(context, PHONE.admin)
    await page.goto('/')
    await expect(page.locator('[data-slot="vote-button"]').first()).toBeVisible()
    await expectNoViolations(page, 'voting lineup (signed in)')
    await page.goto('/enter')
    await expect(page.getByRole('heading', { name: 'Snap your house' })).toBeVisible()
    await expectNoViolations(page, 'enter (photo step)')
    await page.goto('/admin')
    await expect(page.locator('[data-slot="admin-row"]').first()).toBeVisible()
    await expectNoViolations(page, 'admin queue')

    await setSettings({ voting_opens_at: hoursFromNow(-48), voting_closes_at: hoursFromNow(-1) })
    await page.goto('/')
    await expect(page.locator('[data-ballot="closed"]').first()).toBeVisible()
    await expectNoViolations(page, 'voting closed')
    await setSettings({ results_visible: true })
    await page.goto('/')
    await expect(page.locator('[data-slot="podium-place"]')).toHaveCount(3)
    await expectNoViolations(page, 'podium')
  })
}
