import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { demoBackup } from './demo-trip.ts'

/**
 * Makes the user guide's screenshots (docs/guide/*.png) from the fictional demo trip.
 * Run `npm run dev`, then `npm run guide:screenshots`. A fresh browser each time, so nothing carries over.
 */

const APP = 'http://localhost:5173'
const OUT = join(import.meta.dirname, '..', '..', 'docs', 'guide')
const DURING = '2026-04-11T10:00:00+09:00'
const AFTER = '2026-04-20T10:00:00+01:00'

try {
  await fetch(APP)
} catch {
  console.error(`Can't reach ${APP}. Start the app first with "npm run dev", then run this again.`)
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'waypoints-guide-'))
const backup = await demoBackup()
const tripId = backup.trips[0].id
const flightId = backup.transports[0].id
const tripFile = join(tmp, 'japan-in-spring.json')
writeFileSync(tripFile, JSON.stringify(backup))

const browser = await chromium.launch()
// A phone-sized, light-theme, empty browser. Lisbon time, like the demo trip's travellers.
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
  locale: 'en-GB',
  timezoneId: 'Europe/Lisbon',
  acceptDownloads: false,
})
const page = await context.newPage()

// Three coloured pages with an emoji, as JPEG photos for the trip.
const photoFiles: string[] = []
const scenes = [
  ['#ffd1dc', '🌸'],
  ['#c7e8f3', '🗼'],
  ['#d4edc9', '🍵'],
]
const maker = await context.newPage()
for (const [i, [colour, emoji]] of scenes.entries()) {
  await maker.setViewportSize({ width: 600, height: 450 })
  await maker.setContent(`<body style="margin:0;display:grid;place-items:center;height:100vh;background:${colour};font-size:180px">${emoji}</body>`)
  const file = join(tmp, `photo-${i + 1}.jpg`)
  await maker.screenshot({ path: file, type: 'jpeg', quality: 80 })
  // Photos are dated by the file, so they look taken on the trip.
  utimesSync(file, new Date(`2026-04-10T1${i}:00:00+09:00`), new Date(`2026-04-10T1${i}:00:00+09:00`))
  photoFiles.push(file)
}
await maker.close()

const go = async (hash: string) => {
  await page.goto(`${APP}/#${hash}`)
  await page.reload()
  await page.waitForLoadState('networkidle')
  // Out of the way: a What's new card or an update banner would cover the screen.
  for (const name of ['Got it', 'Later']) {
    const button = page.getByRole('button', { name, exact: true })
    if (await button.count()) await button.first().click()
  }
}
const shot = async (name: string) => {
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log(`saved ${name}.png`)
}

await page.clock.setFixedTime(DURING)

await go('/')
await shot('welcome')

// Import the demo trip through the normal file import.
await go('/open')
await page.locator('input[type=file]').setInputFiles(tripFile)
await page.waitForURL(new RegExp(`/trips/${tripId}`))
await page.waitForLoadState('networkidle')

// This phone is Ana's.
await go(`/trips/${tripId}/trip`)
await page.getByLabel('Which one are you?').selectOption({ label: 'Ana' })

// The photos.
await go(`/trips/${tripId}/photos`)
await page.locator('label', { hasText: 'Add photos' }).locator('input[type=file]').setInputFiles(photoFiles)
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.getByText(/^Added 3 photos/).waitFor()

// In the app, not a reload: opening the app during a trip goes straight into it.
await page.getByRole('link', { name: 'All trips' }).click()
await page.waitForLoadState('networkidle')
await shot('trips')
await go('/new')
await shot('new-trip')
await go(`/trips/${tripId}`)
await shot('plan-today')
await go(`/trips/${tripId}?view=bookings`)
await shot('bookings')
await go(`/trips/${tripId}/transport/${flightId}`)
await shot('flight')
await go(`/trips/${tripId}/activities/new`)
await page.getByLabel('City', { exact: true }).pressSequentially('Kyo', { delay: 80 })
await page.getByRole('listbox').waitFor()
await shot('city-search')
await go(`/trips/${tripId}/places`)
await shot('places')
await go(`/trips/${tripId}/money`)
await shot('money')
await page.getByText('Shinkansen to Kyoto').first().click()
await page.waitForLoadState('networkidle')
await shot('expense')
await go(`/trips/${tripId}/money`)
await page
	.getByRole('heading', { name: /Exchange rates/ })
	.evaluate((el) => el.scrollIntoView({ block: 'start' }))
await shot('exchanges')
await go(`/trips/${tripId}/photos`)
await shot('photos')
await go(`/trips/${tripId}/share`)
await shot('share')
await go('/settings')
await shot('settings')

// After the trip.
await page.clock.setFixedTime(AFTER)
await go(`/trips/${tripId}/reviews`)
await shot('reviews')
await go(`/trips/${tripId}/report`)
await shot('report')

await browser.close()
