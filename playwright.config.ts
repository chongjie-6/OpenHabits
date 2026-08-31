import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const baseURL = `http://localhost:${PORT}`

/**
 * End-to-end tests run against the *built* app, never the dev server.
 *
 * The things worth testing here — the prerendered HTML per route, the service
 * worker, the offline shell — do not exist in dev. `vite preview` serves dist/
 * the way a static host would, which is the only place those three are real.
 *
 * One worker, and no parallelism: these tests share a service-worker cache and a
 * single preview server, and interleaving them proves nothing except that they
 * interleave.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
