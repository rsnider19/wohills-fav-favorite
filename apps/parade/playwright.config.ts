import { defineConfig } from '@playwright/test'

// Smoke test for the parade against the LOCAL Supabase stack (M8). Same setup as the lights
// config: export the stack's env, then `npm run e2e:parade`. Its own dev server on 5176, so
// a running `npm run dev` (5173) or the lights tests (5175) are untouched.
const PORT = 5176
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  fullyParallel: false,
  // A stray test.only would quietly cut CI (and the @smoke grep) down to one test.
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: process.env.API_URL ?? '', VITE_SUPABASE_ANON_KEY: process.env.ANON_KEY ?? '' },
  },
})
