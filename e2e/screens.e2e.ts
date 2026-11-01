import { LINKS } from '../src/lib/links.ts'
import { dismissNotices, expect, importDemoTrip, pickMe, test } from './fixtures.ts'

const APP_ORIGIN = 'http://localhost:4173'

test('every main screen opens, fits a small phone and opens outside links in a new tab', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-04-11T10:00:00+09:00'))
  const backup = await importDemoTrip(page)
  const trip = backup.trips[0].id
  await pickMe(page, trip, 'Ana')

  const stay = backup.stays[0]
  const journey = backup.transports[0]
  const activity = backup.activities[0]
  const place = backup.places[0]
  const expense = backup.expenses[0]

  // [route, text that must be visible; undefined means any heading]
  const routes: [string, string | undefined][] = [
    ['/new', undefined],
    ['/open', undefined],
    ['/settings', undefined],
    ['/server', undefined],
    ['/whats-new', undefined],
    [`/trips/${trip}`, undefined],
    [`/trips/${trip}?view=bookings`, undefined],
    [`/trips/${trip}/places`, undefined],
    [`/trips/${trip}/money`, undefined],
    [`/trips/${trip}/photos`, undefined],
    [`/trips/${trip}/trip`, undefined],
    [`/trips/${trip}/share`, undefined],
    [`/trips/${trip}/reviews`, undefined],
    [`/trips/${trip}/packing`, undefined],
    [`/trips/${trip}/report`, undefined],
    [`/trips/${trip}/edit`, undefined],
    [`/trips/${trip}/server`, 'Connect this phone to a sync server first.'],
    [`/trips/${trip}/stays/${stay.id}`, stay.name],
    [`/trips/${trip}/transport/${journey.id}`, `${journey.from} → ${journey.to}`],
    [`/trips/${trip}/activities/${activity.id}`, activity.title],
    [`/trips/${trip}/places/${place.id}`, place.name],
    [`/trips/${trip}/expenses/${expense.id}`, expense.title],
    [`/trips/${trip}/stays/new`, undefined],
    [`/trips/${trip}/transport/new`, undefined],
    [`/trips/${trip}/activities/new`, undefined],
    [`/trips/${trip}/places/new`, undefined],
    [`/trips/${trip}/expenses/new`, undefined],
    [`/trips/${trip}/exchanges/new`, undefined],
  ]
  expect(routes).toHaveLength(28)

  for (const [route, text] of routes) {
    await page.goto(`#${route}`)
    await dismissNotices(page)
    const shown = text ? page.getByText(text, { exact: true }) : page.getByRole('heading')
    await expect(shown.first(), `${route} shows ${text ?? 'a heading'}`).toBeVisible()
    await expect(page.getByText("There's nothing here.")).toHaveCount(0)
    await expect(page.getByText("This isn't in the trip any more.")).toHaveCount(0)

    const width = await page.evaluate<{ scroll: number; inner: number }>(
      '({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth })',
    )
    expect(width.scroll, `${route} is ${width.scroll}px wide at ${width.inner}px`).toBeLessThanOrEqual(width.inner)

    const links = await page.evaluate<{ href: string; target: string; rel: string }[]>(
      `[...document.querySelectorAll('a[href^="http"]')]
        .filter((a) => !a.href.startsWith('${APP_ORIGIN}/'))
        .map((a) => ({ href: a.href, target: a.target, rel: a.rel }))`,
    )
    for (const link of links) {
      expect(link.target, `${route}: ${link.href} opens in a new tab`).toBe('_blank')
      expect(link.rel, `${route}: ${link.href} has rel noreferrer`).toContain('noreferrer')
    }

    if (route === '/settings') {
      await expect(page.getByRole('link', { name: 'How to use waypoints' })).toHaveAttribute('href', LINKS.guide)
    }
  }
})
