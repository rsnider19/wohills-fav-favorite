import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

// Smoke test of the parade against the LOCAL stack (M8): the ballot loads, a neighbor signs
// in through the real dialog and votes, the vote survives a reload, and the reveal shows the
// top 3. It changes public.settings and casts one vote, and puts both back afterwards.
//   set -a; eval "$(npx --yes supabase@3.1.0 status -o env)"; set +a
//   npm run e2e:parade
const url = process.env.API_URL ?? ''
const serviceKey = process.env.SERVICE_ROLE_KEY ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) || !serviceKey)
  throw new Error('Set API_URL and SERVICE_ROLE_KEY to the LOCAL stack (supabase status -o env); never hosted')
const service = createClient(url, serviceKey, { auth: { persistSession: false } })
const PHONE = '15555550102'

// The parade shipped in July with these axe findings: low-contrast muted text and the red
// eyebrow on the paper background, and content outside landmarks. Fixing them changes how
// the live parade looks, which M8 doesn't do (M8 D11). They are pinned per screen as the
// number of elements each rule flags (axe 4.14.0, exact), so a new low-contrast element fails
// the test just like a new rule does; fewer is fine. Counts, not selectors: Tailwind scans
// this file too, and class names written here would add utilities to the parade's CSS.
const KNOWN: Record<string, Record<string, number>> = {
  ballot: { 'color-contrast': 5, region: 1 },
  'sign-in dialog': { 'color-contrast': 6, region: 1 },
  voted: { 'color-contrast': 7, region: 1 },
  results: { 'color-contrast': 15, region: 1 },
}
async function axe(page: Page, screen: string) {
  // Let finite animations and transitions end first (a card turning "voted" fades its title
  // in); a color caught halfway is a different finding on every run.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  )
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
  const unknown = violations
    .filter((v) => v.nodes.length > (KNOWN[screen][v.id] ?? 0))
    .map((v) => `${v.id} (${v.nodes.length} > ${KNOWN[screen][v.id] ?? 0}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
  expect(unknown, `${screen}: new axe violations`).toEqual([])
}

let saved: Record<string, unknown> | null = null
async function removeTestVotes() {
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 })
  const ids = data.users.filter((u) => u.phone === PHONE).map((u) => u.id)
  if (ids.length) await service.from('votes').delete().in('user_id', ids)
}
test.beforeAll(async () => {
  const { data, error } = await service.from('settings').select('*').eq('id', true).single()
  if (error) throw error
  saved = data
})
test.beforeEach(async () => {
  await service.from('settings').update({ voting_open: true, results_visible: false, voting_opens_at: null, voting_closes_at: null }).eq('id', true)
  await removeTestVotes()
})
test.afterAll(async () => {
  if (saved) await service.from('settings').update(saved).eq('id', true)
  await removeTestVotes()
})

test('ballot → sign in and vote → reload keeps it → the reveal shows the top 3', { tag: '@smoke' }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const signIn = page.getByRole('button', { name: 'Sign in to vote' })
  await expect(signIn).toHaveCount(6)
  await axe(page, 'ballot')
  await signIn.first().click()
  await expect(page.getByLabel('Phone number')).toBeVisible()
  await axe(page, 'sign-in dialog')
  await page.getByLabel('Phone number').fill(PHONE.slice(1))
  await page.getByRole('button', { name: /code/i }).click()
  await page.getByLabel('6-digit code').fill('123456')
  await page.getByRole('button', { name: 'Verify & vote' }).click()
  await expect(page.getByRole('status')).toContainText('Vote cast for')
  await expect(page.getByRole('button', { name: /Voted/ })).toHaveCount(1)
  await axe(page, 'voted')
  await page.reload()
  await expect(page.getByRole('button', { name: /Voted/ })).toHaveCount(1)
  await service.from('settings').update({ results_visible: true }).eq('id', true)
  await page.reload()
  await expect(page.getByText('★ The results are in')).toBeVisible()
  await expect(page.locator('[data-slot="leaderboard-row"]')).toHaveCount(3)
  await axe(page, 'results')
})
