import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test'
import { demoBackup } from '../scripts/guide/demo-trip.ts'
import type { Backup } from '../src/domain/sync.ts'

const APP_ORIGIN = 'http://localhost:4173'

/** Collects what must never happen on any page: uncaught errors, console errors, requests to other sites. */
function guard(context: BrowserContext, offences: string[]) {
  context.on('weberror', (error) => offences.push(`uncaught error: ${error.error().message}`))
  context.on('console', (message) => {
    if (message.type() === 'error') offences.push(`console.error: ${message.text()}`)
  })
  context.on('request', (request) => {
    const url = request.url()
    if (/^https?:/.test(url) && !url.startsWith(`${APP_ORIGIN}/`)) offences.push(`request to another site: ${url}`)
  })
}

type Fixtures = {
  offences: string[]
  newPhone: () => Promise<Page>
}

export const test = base.extend<Fixtures>({
  offences: [
    async ({ browserName }, provide) => {
      void browserName
      const offences: string[] = []
      await provide(offences)
      expect(offences, 'Problems found on the page').toEqual([])
    },
    { auto: true },
  ],
  page: async ({ page, context, offences }, provide) => {
    guard(context, offences)
    await provide(page)
  },
  // Another phone: its own browser context, so its own storage.
  newPhone: async ({ browser, baseURL, viewport, colorScheme, locale, timezoneId, offences }, provide) => {
    const contexts: BrowserContext[] = []
    await provide(async () => {
      const context = await browser.newContext({ baseURL, viewport, colorScheme, locale, timezoneId })
      guard(context, offences)
      contexts.push(context)
      return context.newPage()
    })
    for (const context of contexts) await context.close()
  },
})

export { expect }

/** Out of the way: a What's new card or an update banner would cover the screen. */
export async function dismissNotices(page: Page) {
  for (const name of ['Got it', 'Later']) {
    const button = page.getByRole('button', { name, exact: true })
    if (await button.count()) await button.first().click()
  }
}

/** Imports the fictional demo trip through the normal file import, and returns it. */
export async function importDemoTrip(page: Page): Promise<Backup> {
  const backup = await demoBackup()
  const file = join(mkdtempSync(join(tmpdir(), 'waypoints-smoke-')), 'japan-in-spring.json')
  writeFileSync(file, JSON.stringify(backup))
  await page.goto('#/open')
  await page.locator('input[type=file]').setInputFiles(file)
  await page.waitForURL(new RegExp(`/trips/${backup.trips[0].id}`))
  await page.waitForLoadState('networkidle')
  return backup
}

/** Picks who this phone belongs to, on the trip's own tab. */
export async function pickMe(page: Page, tripId: string, name: string) {
  await page.goto(`#/trips/${tripId}/trip`)
  await page.getByLabel('Which one are you?').selectOption({ label: name })
}
