import { defineConfig } from '@playwright/test'

const BASE_URL = 'http://localhost:4173/waypoints/'

/** The smoke test: the built app, served as GitHub Pages serves it, checked in a phone-sized Chromium. */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 360, height: 780 },
    colorScheme: 'light',
    locale: 'en-GB',
    timezoneId: 'Europe/Lisbon',
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    env: { BASE_PATH: '/waypoints/' },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
