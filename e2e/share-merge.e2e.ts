import type { Page } from '@playwright/test'
import { dismissNotices, expect, importDemoTrip, pickMe, test } from './fixtures.ts'

const NOW = new Date('2026-04-11T10:00:00+09:00')

/** Makes a phone ready: fixed clock, no share sheet (so the app copies the link), clipboard allowed. */
async function setUp(page: Page) {
  await page.clock.setFixedTime(NOW)
  await page.context().addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4173' })
}

async function shareLink(page: Page, tripId: string): Promise<string> {
  await page.goto(`#/trips/${tripId}/share`)
  await dismissNotices(page)
  await page.getByRole('button', { name: '🔗 Share trip link' }).click()
  await expect(page.getByText('✓ Link copied')).toBeVisible()
  return page.evaluate(() => navigator.clipboard.readText())
}

async function addPlace(page: Page, tripId: string, name: string) {
  await page.goto(`#/trips/${tripId}/places/new`)
  await dismissNotices(page)
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
}

async function expectPlaces(page: Page, tripId: string, names: string[]) {
  await page.goto(`#/trips/${tripId}/places`)
  await dismissNotices(page)
  for (const name of names) await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

async function expectOneTrip(page: Page) {
  await page.goto('#/')
  await dismissNotices(page)
  await expect(page.getByText('Japan in spring', { exact: true })).toHaveCount(1)
}

test('two phones share a trip by link and merge each other back', async ({ page, newPhone }) => {
  const ana = page
  await setUp(ana)
  const backup = await importDemoTrip(ana)
  const trip = backup.trips[0].id
  await pickMe(ana, trip, 'Ana')

  // 1. Ana shares the trip.
  const anaLink = await shareLink(ana, trip)
  expect(anaLink).toContain('#/t/')

  // 2. Ben opens it and adds it to his trips.
  const ben = await newPhone()
  await setUp(ben)
  await ben.goto(anaLink)
  await ben.getByRole('button', { name: '+ Add to my trips' }).click()
  await ben.getByRole('button', { name: 'Ben', exact: true }).click()
  await ben.waitForURL(new RegExp(`/trips/${trip}`))

  // 3. Each adds a place of their own.
  await addPlace(ben, trip, 'Kinkaku-ji')
  await addPlace(ana, trip, 'Nara Park')

  // 4. Ben shares; Ana updates her copy.
  const benLink = await shareLink(ben, trip)
  await ana.goto(benLink)
  await ana.getByRole('button', { name: 'Update my copy' }).click()
  await expect(ana.getByText('Your copy is up to date', { exact: false })).toBeVisible()
  await expectPlaces(ana, trip, ['Kinkaku-ji', 'Nara Park'])
  await expectOneTrip(ana)

  // 5. Ana shares back; Ben updates, and the same link again has nothing new.
  const anaBackLink = await shareLink(ana, trip)
  await ben.goto(anaBackLink)
  await ben.getByRole('button', { name: 'Update my copy' }).click()
  await expect(ben.getByText('Your copy is up to date', { exact: false })).toBeVisible()
  await expectPlaces(ben, trip, ['Kinkaku-ji', 'Nara Park'])
  await expectOneTrip(ben)

  await ben.goto(anaBackLink)
  await expect(ben.getByText('Your copy already has everything in this link.')).toBeVisible()
})
