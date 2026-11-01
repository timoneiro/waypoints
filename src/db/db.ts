import Dexie, { type EntityTable } from 'dexie'
import type {
  Activity,
  Attachment,
  Exchange,
  Expense,
  OutboxEntry,
  PackingItem,
  Place,
  RecordTable,
  Report,
  Review,
  ServerTrip,
  SettingEntry,
  Snapshot,
  Stay,
  StoredFile,
  TableRecords,
  Transport,
  Traveller,
  Trip,
  UnsentEntry,
} from './types'

export const db = new Dexie('waypoints') as Dexie & {
  trips: EntityTable<Trip, 'id'>
  travellers: EntityTable<Traveller, 'id'>
  stays: EntityTable<Stay, 'id'>
  transports: EntityTable<Transport, 'id'>
  activities: EntityTable<Activity, 'id'>
  places: EntityTable<Place, 'id'>
  expenses: EntityTable<Expense, 'id'>
  exchanges: EntityTable<Exchange, 'id'>
  reviews: EntityTable<Review, 'id'>
  packingItems: EntityTable<PackingItem, 'id'>
  attachments: EntityTable<Attachment, 'id'>
  reports: EntityTable<Report, 'id'>
  files: EntityTable<StoredFile, 'id'>
  unsent: Dexie.Table<UnsentEntry, [string, string]>
  outbox: Dexie.Table<OutboxEntry, [string, string]>
  serverTrips: EntityTable<ServerTrip, 'tripId'>
  settings: EntityTable<SettingEntry, 'key'>
  snapshots: EntityTable<Snapshot, 'id'>
}

/*
 * SCHEMA HISTORY — people's trips live in this database, so versions are append-only: never edit or
 * delete an existing version, never change a primary key, never drop a table that holds user data.
 * Add a new `db.version(n)` and extend src/db/migrations.test.ts to cover it.
 */
db.version(1).stores({
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

/** 0.3.0: the optional sync server. Changes waiting for it, and how far each trip on it has synced. */
db.version(2).stores({
  outbox: '[table+id], tripId',
  serverTrips: 'tripId',
})

/**
 * 0.4.0: photos and documents. Their records, and their files (local only, apart from the records).
 *
 * Phones on 0.3.0 skipped the attachments the sync server sent them while moving on past them, so
 * every trip on the server is pulled again in full, once: merging is safe to repeat. Any version
 * that adds a table the server syncs must do the same.
 */
db.version(3)
  .stores({
    attachments: 'id, tripId',
    files: 'id, tripId',
  })
  .upgrade((tx) =>
    tx
      .table('serverTrips')
      .toCollection()
      .modify((state: { cursor: number }) => {
        state.cursor = 0
      }),
  )

/**
 * 0.8.0: reviews of activities, places, stays and journeys. Phones on 0.7.0 skipped the reviews the
 * sync server sent them, so every trip on the server is pulled again in full, once (as in v3).
 */
db.version(4)
  .stores({ reviews: 'id, tripId' })
  .upgrade((tx) =>
    tx
      .table('serverTrips')
      .toCollection()
      .modify((state: { cursor: number }) => {
        state.cursor = 0
      }),
  )

/**
 * 0.9.0: trip reports, kept on the sync server once a trip is over. Phones on 0.8.0 skipped the
 * reports the server sent them, so every trip on the server is pulled again in full, once (as in v3).
 */
db.version(5)
  .stores({ reports: 'id, tripId' })
  .upgrade((tx) =>
    tx
      .table('serverTrips')
      .toCollection()
      .modify((state: { cursor: number }) => {
        state.cursor = 0
      }),
  )

/**
 * Packing & to-do lists. Phones on the previous version skipped the items the sync server sent them,
 * so every trip on the server is pulled again in full, once (as in v3).
 */
db.version(6)
  .stores({ packingItems: 'id, tripId' })
  .upgrade((tx) =>
    tx
      .table('serverTrips')
      .toCollection()
      .modify((state: { cursor: number }) => {
        state.cursor = 0
      }),
  )

export const recordTable = <T extends RecordTable>(table: T) => db[table] as unknown as Dexie.Table<TableRecords[T], string>

export const nowISO = () => new Date().toISOString()

/** 16 URL-safe characters (96 random bits): unique across phones, and short, since ids fill much of a trip link. */
export function newId(): string {
  let text = ''
  for (const b of crypto.getRandomValues(new Uint8Array(12))) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_')
}

export const isLive = <T extends { deletedAt?: string }>(r: T) => !r.deletedAt

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting<T>(key: string, value: T | undefined) {
  if (value === undefined) await db.settings.delete(key)
  else await db.settings.put({ key, value })
}

/** Local settings keys. Never shared or exported. */
export const SETTINGS = {
  /** Name to suggest as the first traveller of a new trip. */
  myName: 'myName',
  /** Currency of the last trip created here. */
  lastCurrency: 'lastCurrency',
  /** Which of a trip's travellers uses this phone. */
  me: (tripId: string) => `me:${tripId}`,
  /** Trip opened most recently: the app opens straight into it while it's on. */
  lastTrip: 'lastTrip',
  lastSeenVersion: 'lastSeenVersion',
  /** The sync server this phone is connected to (see src/db/serverState.ts). */
  server: 'server',
  /** When this phone found out it's no longer on a trip on the server: shown on the trip until dismissed. */
  serverGone: (tripId: string) => `serverGone:${tripId}`,
  /** Address fields also search online (Photon, OpenStreetMap). Off unless turned on. */
  addressSearch: 'addressSearch',
} as const
