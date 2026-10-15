import { expect, test } from 'vitest'
import { parseBackup } from '../../src/domain/sync.ts'
import { demoBackup } from './demo-trip.ts'

test('the demo trip is a valid backup with everything the guide shows', async () => {
  const backup = parseBackup(JSON.stringify(await demoBackup()))
  expect(backup.trips).toHaveLength(1)
  expect(backup.travellers).toHaveLength(3)
  expect(backup.stays.length).toBeGreaterThanOrEqual(2)
  expect(backup.transports.length).toBeGreaterThanOrEqual(2)
  expect(backup.activities.length).toBeGreaterThanOrEqual(3)
  expect(backup.places.length).toBeGreaterThanOrEqual(4)
  expect(backup.expenses.length).toBeGreaterThanOrEqual(6)
  expect(backup.exchanges).toHaveLength(2)
  expect(backup.reviews.length).toBeGreaterThanOrEqual(6)
})
