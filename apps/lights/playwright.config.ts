import { defineConfig } from '@playwright/test'

// End-to-end tests for the lights app against the LOCAL Supabase stack.
//   eval "$(npx --yes supabase@3.1.0 status -o env)"   # API_URL, ANON_KEY, SERVICE_ROLE_KEY
//   npm run e2e:lights
// Needs `supabase start` and the local seed (`supabase db reset` once). The tests reset the
// lights data they touch before each test and make 15555550100 the admin.
const PORT = 5175

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // One shared database: run tests one at a time, in file order.
  workers: 1,
  fullyParallel: false,
  // A stray test.only would quietly shrink CI (and the @smoke grep) to one test.
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalTeardown: './e2e/teardown.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    // A phone: most neighbors enter from their driveway.
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
  },
  webServer: {
    // A dev server of its own (5175), so a running `npm run dev:lights` (5174) is untouched.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      // Already-set variables win over apps/lights/.env (Vite's rule), so the app talks to
      // the same local stack as the tests.
      VITE_SUPABASE_URL: process.env.API_URL ?? '',
      VITE_SUPABASE_ANON_KEY: process.env.ANON_KEY ?? '',
    },
  },
})
