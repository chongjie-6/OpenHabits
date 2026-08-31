import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * The promise this app is built around: every screen opens with the network off.
 *
 * Nothing in the unit suite can prove this. The prerendered HTML, the service
 * worker and its cache only exist in a built, served app, so this is the one
 * test that exercises what people actually install. It is also the test that
 * would have caught the stale `/quotes` entry sitting in the shell list, failing
 * silently on every install for three commits.
 */

/** Routes with their own prerendered HTML, and a string only that route renders. */
const ROUTES = [
  { path: '/', heading: 'Today' },
  { path: '/week', heading: 'Week' },
  { path: '/stats', heading: 'Stats' },
  { path: '/settings', heading: 'Settings' },
] as const

/** Resolve once the worker is active *and* has finished precaching the shell. */
async function serviceWorkerReady(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration()
          if (!registration?.active) return 0
          const names = await caches.keys()
          if (names.length === 0) return 0
          const cache = await caches.open(names[0])
          return (await cache.keys()).length
        }),
      { timeout: 30_000, message: 'the service worker never installed and cached the shell' },
    )
    // Every route in the shell, plus the manifest and the icon.
    .toBeGreaterThanOrEqual(6)
}

test.describe('with the network off', () => {
  test('every route serves its shell and its bundle', async ({ page, context }) => {
    await page.goto('/')
    await serviceWorkerReady(page)

    // Watching the requests is the point, not decoration. Asserting on headings
    // alone cannot fail here: the prerendered HTML contains them, so a page whose
    // bundle never loaded — no React, buttons that do nothing — looks identical
    // to a working one. Anything the browser could not fetch shows up below.
    const broken: string[] = []
    page.on('requestfailed', (request) =>
      broken.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`),
    )
    page.on('response', (response) => {
      if (response.status() >= 400) {
        broken.push(`${new URL(response.url()).pathname}: HTTP ${response.status()}`)
      }
    })

    await context.setOffline(true)

    for (const route of ROUTES) {
      await page.goto(route.path)
      await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible()

      // A reload is the real test: it goes through the service worker from a
      // cold start rather than through the client-side router.
      await page.reload()
      await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible()
    }

    expect(broken, 'the service worker failed to serve something offline').toEqual([])

    await context.setOffline(false)
  })

  test('the app is fully usable — add a habit, tick it, reload', async ({ page, context }) => {
    await page.goto('/')
    await serviceWorkerReady(page)

    await context.setOffline(true)
    await page.reload()

    // Add a habit with no network at all.
    await page.getByRole('button', { name: /Add (your first )?habit/ }).first().click()
    await page.getByLabel('Name').fill('Push-ups')
    await page.getByRole('button', { name: 'Add habit', exact: true }).click()

    const tick = page.getByRole('button', { name: 'Mark done: Push-ups' })
    await expect(tick).toBeVisible()
    await tick.click()

    await expect(page.getByRole('button', { name: 'Mark not done: Push-ups' })).toBeVisible()
    await expect(page.getByText('1 of 1 done')).toBeVisible()

    // Still offline, and IndexedDB is the only thing that can answer.
    await page.reload()
    await expect(page.getByRole('button', { name: 'Mark not done: Push-ups' })).toBeVisible()
    await expect(page.getByText('1 of 1 done')).toBeVisible()

    await context.setOffline(false)
  })
})
