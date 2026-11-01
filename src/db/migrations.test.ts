import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { expect, it } from 'vitest'
import { activity, attachment, exchange, expense, review, stay, traveller, trip } from '../test/fixtures'

/*
 * Guards existing users' data: open a database exactly as v0.1 of the app created it, then open it
 * with the current schema and check nothing was lost. When adding db.version(n), keep this test and
 * add the new tables' expectations — never delete the v1 seeding below.
 */

it('opening a v0.1 database with the current schema keeps every record', async () => {
  await Dexie.delete('waypoints')
  const v1 = new Dexie('waypoints')
  v1.version(1).stores({
    trips: 'id',
    travellers: 'id, tripId',
    stays: 'id, tripId',
    transports: 'id, tripId',
    activities: 'id, tripId',
    places: 'id, tripId',
    expenses: 'id, tripId',
    exchanges: 'id, tripId',
    unsent: '[table+id], tripId',
    settings: 'key',
    snapshots: '++id, createdAt',
  })
  await v1.open()
  await v1.table('trips').add(trip())
  await v1.table('travellers').add(traveller('ana00001', 'Ana'))
  await v1.table('stays').add(stay({ deletedAt: '2026-10-02T10:00:00.000Z' }))
  await v1.table('expenses').add(expense())
  await v1.table('exchanges').add(exchange())
  await v1.table('unsent').add({ table: 'stays', id: 'stay0001', tripId: 'trip0001' })
  await v1.table('settings').add({ key: 'me:trip0001', value: 'ana00001' })
  v1.close()

  const { db } = await import('./db')
  await db.open()

  expect(db.verno).toBeGreaterThanOrEqual(2)
  // v2 (0.3.0): the sync server's tables start empty; no trip is on a server until someone puts it there.
  expect(await db.outbox.count()).toBe(0)
  expect(await db.serverTrips.count()).toBe(0)
  expect(await db.trips.toArray()).toEqual([trip()])
  expect(await db.travellers.toArray()).toEqual([traveller('ana00001', 'Ana')])
  expect(await db.stays.toArray()).toEqual([stay({ deletedAt: '2026-10-02T10:00:00.000Z' })])
  expect(await db.expenses.toArray()).toEqual([expense()])
  expect(await db.exchanges.toArray()).toEqual([exchange()])
  expect(await db.unsent.count()).toBe(1)
  expect(await db.settings.get('me:trip0001')).toEqual({ key: 'me:trip0001', value: 'ana00001' })
  db.close()
})

it('opening a 0.3.0 database pulls every trip on the server again, once', async () => {
  await Dexie.delete('waypoints')
  const v2 = new Dexie('waypoints')
  v2.version(1).stores({
    trips: 'id',
    travellers: 'id, tripId',
    stays: 'id, tripId',
    transports: 'id, tripId',
    activities: 'id, tripId',
    places: 'id, tripId',
    expenses: 'id, tripId',
    exchanges: 'id, tripId',
    unsent: '[table+id], tripId',
    settings: 'key',
    snapshots: '++id, createdAt',
  })
  v2.version(2).stores({ outbox: '[table+id], tripId', serverTrips: 'tripId' })
  await v2.open()
  await v2.table('trips').add(trip())
  await v2.table('serverTrips').add({ tripId: 'trip0001', cursor: 7, uploaded: true })
  await v2.table('outbox').add({ table: 'trips', id: 'trip0001', tripId: 'trip0001' })
  v2.close()

  const { db } = await import('./db')
  await db.open()

  // v3 (0.4.0): photos and documents start empty. 0.3.0 skipped the ones the server sent, so the
  // trip is pulled again from the start; what's waiting to go up stays waiting.
  expect(await db.attachments.count()).toBe(0)
  expect(await db.files.count()).toBe(0)
  expect(await db.serverTrips.toArray()).toEqual([{ tripId: 'trip0001', cursor: 0, uploaded: true }])
  expect(await db.outbox.count()).toBe(1)
  expect(await db.trips.toArray()).toEqual([trip()])
  db.close()
})

it('opening a 0.7.0 database pulls every trip on the server again, once', async () => {
  await Dexie.delete('waypoints')
  const v3 = new Dexie('waypoints')
  v3.version(1).stores({
    trips: 'id',
    travellers: 'id, tripId',
    stays: 'id, tripId',
    transports: 'id, tripId',
    activities: 'id, tripId',
    places: 'id, tripId',
    expenses: 'id, tripId',
    exchanges: 'id, tripId',
    unsent: '[table+id], tripId',
    settings: 'key',
    snapshots: '++id, createdAt',
  })
  v3.version(2).stores({ outbox: '[table+id], tripId', serverTrips: 'tripId' })
  v3.version(3).stores({ attachments: 'id, tripId', files: 'id, tripId' })
  await v3.open()
  await v3.table('trips').add(trip())
  await v3.table('activities').add(activity())
  await v3.table('attachments').add(attachment())
  await v3.table('serverTrips').add({ tripId: 'trip0001', cursor: 12, uploaded: true, files: [{ id: 'file0001', thumb: true }] })
  await v3.table('outbox').add({ table: 'activities', id: 'todo0001', tripId: 'trip0001' })
  v3.close()

  const { db } = await import('./db')
  await db.open()

  // v4 (0.8.0): reviews start empty. 0.7.0 skipped the ones the server sent, so the trip is pulled
  // again from the start; what's waiting to go up stays waiting, and nothing else changes.
  expect(await db.reviews.count()).toBe(0)
  expect(await db.serverTrips.toArray()).toEqual([{ tripId: 'trip0001', cursor: 0, uploaded: true, files: [{ id: 'file0001', thumb: true }] }])
  expect(await db.outbox.count()).toBe(1)
  expect(await db.trips.toArray()).toEqual([trip()])
  expect(await db.activities.toArray()).toEqual([activity()])
  expect(await db.attachments.toArray()).toEqual([attachment()])
  db.close()
})

it('opening a 0.8.0 database pulls every trip on the server again, once', async () => {
  await Dexie.delete('waypoints')
  const v4 = new Dexie('waypoints')
  v4.version(1).stores({
    trips: 'id',
    travellers: 'id, tripId',
    stays: 'id, tripId',
    transports: 'id, tripId',
    activities: 'id, tripId',
    places: 'id, tripId',
    expenses: 'id, tripId',
    exchanges: 'id, tripId',
    unsent: '[table+id], tripId',
    settings: 'key',
    snapshots: '++id, createdAt',
  })
  v4.version(2).stores({ outbox: '[table+id], tripId', serverTrips: 'tripId' })
  v4.version(3).stores({ attachments: 'id, tripId', files: 'id, tripId' })
  v4.version(4).stores({ reviews: 'id, tripId' })
  await v4.open()
  await v4.table('trips').add(trip())
  await v4.table('activities').add(activity())
  await v4.table('reviews').add(review())
  await v4.table('serverTrips').add({ tripId: 'trip0001', cursor: 30, uploaded: true, files: [] })
  await v4.table('outbox').add({ table: 'reviews', id: 'rate0001', tripId: 'trip0001' })
  v4.close()

  const { db } = await import('./db')
  await db.open()

  // v5 (0.9.0): reports start empty. 0.8.0 skipped the ones the server sent, so the trip is pulled
  // again from the start; what's waiting to go up stays waiting, and nothing else changes.
  expect(await db.reports.count()).toBe(0)
  expect(await db.serverTrips.toArray()).toEqual([{ tripId: 'trip0001', cursor: 0, uploaded: true, files: [] }])
  expect(await db.outbox.count()).toBe(1)
  expect(await db.trips.toArray()).toEqual([trip()])
  expect(await db.activities.toArray()).toEqual([activity()])
  expect(await db.reviews.toArray()).toEqual([review()])
  db.close()
})

it('opening a 0.9.0 database pulls every trip on the server again, once', async () => {
  await Dexie.delete('waypoints')
  const v5 = new Dexie('waypoints')
  v5.version(1).stores({
    trips: 'id',
    travellers: 'id, tripId',
    stays: 'id, tripId',
    transports: 'id, tripId',
    activities: 'id, tripId',
    places: 'id, tripId',
    expenses: 'id, tripId',
    exchanges: 'id, tripId',
    unsent: '[table+id], tripId',
    settings: 'key',
    snapshots: '++id, createdAt',
  })
  v5.version(2).stores({ outbox: '[table+id], tripId', serverTrips: 'tripId' })
  v5.version(3).stores({ attachments: 'id, tripId', files: 'id, tripId' })
  v5.version(4).stores({ reviews: 'id, tripId' })
  v5.version(5).stores({ reports: 'id, tripId' })
  await v5.open()
  await v5.table('trips').add(trip())
  await v5.table('activities').add(activity())
  await v5.table('reviews').add(review())
  await v5.table('serverTrips').add({ tripId: 'trip0001', cursor: 40, uploaded: true, files: [] })
  await v5.table('outbox').add({ table: 'reviews', id: 'rate0001', tripId: 'trip0001' })
  v5.close()

  const { db } = await import('./db')
  await db.open()

  // v6: packing items start empty. The previous version skipped the ones the server sent, so the trip
  // is pulled again from the start; what's waiting to go up stays waiting, and nothing else changes.
  expect(await db.packingItems.count()).toBe(0)
  expect(await db.serverTrips.toArray()).toEqual([{ tripId: 'trip0001', cursor: 0, uploaded: true, files: [] }])
  expect(await db.outbox.count()).toBe(1)
  expect(await db.trips.toArray()).toEqual([trip()])
  expect(await db.activities.toArray()).toEqual([activity()])
  expect(await db.reviews.toArray()).toEqual([review()])
  db.close()
})
