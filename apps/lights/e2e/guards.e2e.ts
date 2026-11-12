import { expect, test, type Page } from '@playwright/test'
import { CANDLEWOOD, PHONE, housePhoto, resetLights, signInAs, stubNetwork } from './helpers'

// The M4 guardrails on the M5 screens, at phone width: nothing scrolls sideways, every
// control is at least 44px tall, and nothing animates under reduced motion.

test.beforeEach(async () => {
  await resetLights()
})

async function checkGuards(page: Page, screen: string) {
  const report = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth
    const small = [...document.querySelectorAll<HTMLElement>('button, a[href], input:not([type=file])')]
      .filter((el) => el.offsetParent !== null && !el.closest('.maplibregl-ctrl-attrib'))
      .map((el) => ({ el, h: el.getBoundingClientRect().height }))
      .filter(({ h }) => h > 0 && h < 44)
      .map(({ el, h }) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${h.toFixed(0)}px`)
    return { overflow, small }
  })
  expect(report.overflow, `${screen}: horizontal overflow`).toBeLessThanOrEqual(0)
  expect(report.small, `${screen}: tap targets under 44px`).toEqual([])
}

test('every M5 screen keeps the guardrails', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(CANDLEWOOD)
  await stubNetwork(page)
  await page.goto('/enter')
  await expect(page.getByRole('button', { name: 'Verify your phone to start' })).toBeVisible()
  await checkGuards(page, 'intro')

  await signInAs(context, PHONE.fresh)
  await page.goto('/enter')
  await page.getByRole('heading', { name: 'Snap your house' }).waitFor()
  await checkGuards(page, 'photo')
  await page.locator('input[type=file]:not([capture])').setInputFiles(await housePhoto(page))
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('1250 Candlewood Dr')
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.locator('[data-slot="pin-coords"]')).toBeVisible()
  await checkGuards(page, 'pin')
  await page.getByRole('button', { name: 'Next' }).click()
  await checkGuards(page, 'details')
  await page.getByRole('button', { name: 'Light it up' }).click()
  await expect(page.getByRole('heading', { name: "You're on the list!" })).toBeVisible()
  await checkGuards(page, 'done')
  await page.getByRole('button', { name: 'See my entry' }).click()
  await checkGuards(page, 'my entry')
  await page.getByRole('link', { name: 'The lineup' }).click()
  await checkGuards(page, 'lineup with "My entry"')
})

test('the admin queue keeps the guardrails, and nothing animates under reduced motion', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signInAs(context, PHONE.admin)
  await stubNetwork(page)
  await page.goto('/admin')
  await expect(page.locator('[data-slot="admin-row"]').first()).toBeVisible()
  await checkGuards(page, 'admin')
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)
  expect(running).toBe(0)
})
