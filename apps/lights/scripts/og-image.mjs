// Renders the share card (og-card.html → public/og.jpg, 1200×630) through a Vite dev
// server of its own and headless Chromium. Run after changing the card or the hero's look:
//   npm run og-image -w apps/lights
// Needs network for Google Fonts (the card uses the site's fonts). Never runs in CI.
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const server = await createServer({ root, configFile: `${root}vite.config.ts`, server: { port: 5177, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  await page.goto('http://localhost:5177/og-card.html', { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    await Promise.all(['16px Bungee', '16px "Bungee Shade"', '900 16px Doto', '400 16px Rubik'].map((f) => document.fonts.load(f)))
    await document.fonts.ready
  })
  await page.waitForTimeout(300)
  const out = fileURLToPath(new URL('../public/og.jpg', import.meta.url))
  await page.locator('[data-slot="og-card"]').screenshot({ path: out, type: 'jpeg', quality: 86 })
  console.log(`wrote ${out}`)
} finally {
  await browser.close()
  await server.close()
}
