import { reportId, type TripReport } from '../domain/report'
import { reviewId } from '../domain/reviews'
import { canonicalJSON } from '../domain/sync'
import { db, isLive, newId, nowISO, recordTable, setSetting, SETTINGS } from './db'
import { takeSnapshot } from './snapshots'
import {
  RECORD_TABLES,
  TRIP_TABLES,
  type LinkTable,
  type RecordTable,
  type Review,
  type ReviewableTable,
  type SyncMeta,
  type TableRecords,
  type Traveller,
  type Trip,
} from './types'

/*
 * All writes to trip records go through here (or backupIO, or attachments.ts for photos and
 * documents), so they're also noted as unsent (changes the rest of the group hasn't had in a link yet)
 * and in the outbox (changes the sync server hasn't had yet). Callers must include db.unsent and
 * db.outbox in any surrounding transaction.
 *
 * In a merge, the newer copy of a record wins as a whole, so writes touch only records that really
 * changed: saving an unchanged form must not override someone else's newer edit.
 */

export type Input<T> = Omit<T, keyof SyncMeta | 'tripId'>

/** Drops empty fields, so a cleared form field doesn't linger as "" or undefined. */
export function compact<T extends object>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined && v !== '')) as T
}

/** Same content, ignoring when it was last saved. */
export const sameContent = (a: SyncMeta, b: SyncMeta) => canonicalJSON({ ...a, updatedAt: '' }) === canonicalJSON({ ...b, updatedAt: '' })

/** Travellers are listed by when they were added: a millisecond apart keeps the order they were typed in. */
const inOrder = (iso: string, index: number) => new Date(Date.parse(iso) + index).toISOString()

/** Notes changed records for the group's next link and for the sync server. */
export async function markChanged(table: RecordTable, ids: string[], tripId: string) {
  const entries = ids.map((id) => ({ table, id, tripId }))
  await db.unsent.bulkPut(entries)
  await db.outbox.bulkPut(entries)
}

/** Creates a record, or replaces the editable fields of an existing one. Returns its id. */
export async function saveRecord<T extends LinkTable>(table: T, tripId: string, input: Input<TableRecords[T]>, id?: string): Promise<string> {
  const store = recordTable(table)
  return db.transaction('rw', store, db.unsent, db.outbox, async () => {
    const existing = id ? await store.get(id) : undefined
    const now = nowISO()
    const next = compact({ ...existing, ...input, id: existing?.id ?? newId(), tripId, createdAt: existing?.createdAt ?? now, updatedAt: now }) as TableRecords[T]
    if (existing && sameContent(next, existing)) return existing.id
    await store.put(next)
    await markChanged(table, [next.id], tripId)
    return next.id
  })
}

/** Creates many records at once (e.g. an imported list), all in one write. Returns their ids. */
export async function addRecords<T extends LinkTable>(table: T, tripId: string, inputs: Input<TableRecords[T]>[]): Promise<string[]> {
  if (inputs.length === 0) return []
  const store = recordTable(table)
  return db.transaction('rw', store, db.unsent, db.outbox, async () => {
    const now = nowISO()
    const records = inputs.map((input) => compact({ ...input, id: newId(), tripId, createdAt: now, updatedAt: now }) as TableRecords[T])
    await store.bulkAdd(records as never)
    const ids = records.map((r) => r.id)
    await markChanged(table, ids, tripId)
    return ids
  })
}

/** Changes a few fields of a record, e.g. ticking a place as visited. */
export async function patchRecord<T extends LinkTable>(table: T, id: string, changes: Partial<Input<TableRecords[T]>>) {
  const store = recordTable(table)
  await db.transaction('rw', store, db.unsent, db.outbox, async () => {
    const existing = await store.get(id)
    if (!existing || existing.deletedAt) return
    const next = compact({ ...existing, ...changes, updatedAt: nowISO() }) as TableRecords[T]
    if (sameContent(next, existing)) return
    await store.put(next)
    await markChanged(table, [id], existing.tripId)
  })
}

/** Deletes a record for the whole group: a tombstone that travels in the next link. */
export async function deleteRecord(table: LinkTable, id: string) {
  const store = recordTable(table)
  await db.transaction('rw', store, db.unsent, db.outbox, async () => {
    const existing = await store.get(id)
    if (!existing || existing.deletedAt) return
    const now = nowISO()
    await store.put({ ...existing, deletedAt: now, updatedAt: now })
    await markChanged(table, [id], existing.tripId)
  })
}

export interface ReviewInput {
  stars?: number
  note?: string
  missed?: boolean
}

/**
 * Saves `by`'s review of an item, replacing theirs if they have one. Didn't go means no stars. A
 * review left empty (no stars, no note, went) is deleted, so the item is theirs to review again.
 */
export async function saveReview(tripId: string, item: { table: ReviewableTable; id: string }, by: string, input: ReviewInput) {
  const id = await reviewId(tripId, item.id, by)
  await db.transaction('rw', db.reviews, db.unsent, db.outbox, async () => {
    const existing = await db.reviews.get(id)
    const now = nowISO()
    const note = input.note?.trim() || undefined
    const missed = input.missed || undefined
    const stars = missed ? undefined : input.stars
    if (!stars && !note && !missed) {
      if (!existing || existing.deletedAt) return
      await db.reviews.put({ ...existing, deletedAt: now, updatedAt: now })
    } else {
      const live: Partial<Review> = { ...existing }
      delete live.deletedAt
      const next = compact({ ...live, id, tripId, itemTable: item.table, itemId: item.id, by, stars, note, missed, createdAt: existing?.createdAt ?? now, updatedAt: now })
      if (existing && sameContent(next, existing)) return
      await db.reviews.put(next)
    }
    await markChanged('reviews', [id], tripId)
  })
}

/**
 * Keeps the trip's report for everyone on the sync server, replacing the one made before. It goes
 * only to the server (links and trip files leave reports out), so it's never noted as unsent.
 */
export async function saveReport(tripId: string, report: TripReport, madeBy: string | undefined) {
  const id = await reportId(tripId)
  // Plain JSON, as the server and other phones will have it.
  const data = JSON.parse(JSON.stringify(report)) as Record<string, unknown>
  await db.transaction('rw', db.reports, db.outbox, async () => {
    const existing = await db.reports.get(id)
    const now = nowISO()
    await db.reports.put(compact({ id, tripId, data, madeBy, createdAt: existing?.createdAt ?? now, updatedAt: now }))
    await db.outbox.put({ table: 'reports', id, tripId })
  })
}

/** A traveller linked to (or unlinked from) a server member now: the link has its own clock. */
const linked = (traveller: Traveller, memberId: string | undefined, now: string): Traveller => compact({ ...traveller, memberId, linkedAt: now })

export interface TravellerDraft {
  id?: string
  name: string
  /** The server member this traveller is, for a trip on the server. */
  memberId?: string
}

/**
 * Creates a trip with its travellers. The first traveller is the person using this phone. A trip
 * created on the server goes up with the next sync, whenever the server can be reached.
 */
export async function createTrip(input: Input<Trip>, travellerDrafts: TravellerDraft[], options: { onServer?: boolean } = {}): Promise<string> {
  const now = nowISO()
  const tripId = newId()
  const travellers: Traveller[] = travellerDrafts.map((t, i) => {
    const traveller: Traveller = { id: newId(), tripId, name: t.name, createdAt: inOrder(now, i), updatedAt: now }
    return t.memberId ? linked(traveller, t.memberId, now) : traveller
  })
  await db.transaction('rw', [db.trips, db.travellers, db.unsent, db.outbox, db.settings, db.serverTrips], async () => {
    await db.trips.add(compact({ ...input, id: tripId, createdAt: now, updatedAt: now }))
    await db.travellers.bulkAdd(travellers)
    await markChanged('trips', [tripId], tripId)
    await markChanged('travellers', travellers.map((t) => t.id), tripId)
    if (travellers[0]) await setSetting(SETTINGS.me(tripId), travellers[0].id)
    await setSetting(SETTINGS.lastCurrency, input.currency)
    if (options.onServer) await db.serverTrips.put({ tripId, cursor: 0, uploaded: false })
  })
  return tripId
}

/** Saves the trip's details and its list of travellers: renamed, linked, added and removed ones. */
export async function updateTrip(tripId: string, input: Input<Trip>, travellers: TravellerDraft[]) {
  await db.transaction('rw', [db.trips, db.travellers, db.unsent, db.outbox], async () => {
    const trip = await db.trips.get(tripId)
    if (!trip) return
    const now = nowISO()
    const next = compact({ ...trip, ...input, updatedAt: now })
    if (!sameContent(next, trip)) {
      await db.trips.put(next)
      await markChanged('trips', [tripId], tripId)
    }
    const current = new Map((await db.travellers.where('tripId').equals(tripId).toArray()).filter(isLive).map((t) => [t.id, t]))
    const changed: Traveller[] = []
    let added = 0
    for (const draft of travellers) {
      const existing = draft.id ? current.get(draft.id) : undefined
      if (!existing) {
        const traveller: Traveller = { id: newId(), tripId, name: draft.name, createdAt: inOrder(now, added++), updatedAt: now }
        changed.push(draft.memberId ? linked(traveller, draft.memberId, now) : traveller)
      } else if (existing.memberId !== draft.memberId) {
        changed.push(linked({ ...existing, name: draft.name, updatedAt: now }, draft.memberId, now))
      } else if (existing.name !== draft.name) {
        changed.push({ ...existing, name: draft.name, updatedAt: now })
      }
      if (existing) current.delete(existing.id)
    }
    for (const removed of current.values()) changed.push({ ...removed, deletedAt: now, updatedAt: now })
    await db.travellers.bulkPut(changed)
    await markChanged('travellers', changed.map((t) => t.id), tripId)
  })
}

/** Adds someone to a trip, e.g. a friend who joins from a link and isn't on the list yet. */
export async function addTraveller(tripId: string, name: string): Promise<string> {
  const now = nowISO()
  const traveller: Traveller = { id: newId(), tripId, name, createdAt: now, updatedAt: now }
  await db.transaction('rw', db.travellers, db.unsent, db.outbox, async () => {
    await db.travellers.add(traveller)
    await markChanged('travellers', [traveller.id], tripId)
  })
  return traveller.id
}

/**
 * Puts a trip on the sync server: links its travellers to server members (by traveller id) and
 * sends all of it with the next sync. Its id stays the same, so links keep working alongside.
 */
export async function moveTripToServer(tripId: string, links: Record<string, string | undefined>) {
  await db.transaction('rw', [db.travellers, db.unsent, db.outbox, db.serverTrips], async () => {
    const now = nowISO()
    const travellers = (await db.travellers.where('tripId').equals(tripId).toArray()).filter(isLive)
    const changed = travellers.filter((t) => t.id in links && links[t.id] !== t.memberId).map((t) => linked({ ...t, updatedAt: now }, links[t.id], now))
    await db.travellers.bulkPut(changed)
    await markChanged('travellers', changed.map((t) => t.id), tripId)
    await db.serverTrips.put({ tripId, cursor: 0, uploaded: false })
  })
}

export const setMe = (tripId: string, travellerId: string | undefined) => setSetting(SETTINGS.me(tripId), travellerId)

/** After the trip went out in a link or file: everything changed so far has been shared. */
export const clearUnsent = (tripId: string) => db.unsent.where('tripId').equals(tripId).delete()

/**
 * Deletes a trip from this phone only, keeping a safety snapshot. Nothing is sent to anyone: the
 * group's copies stay as they are, and a link from them brings the trip back. The files of its photos
 * and documents go too: safety copies can't hold them.
 */
export async function removeTripFromPhone(trip: Trip) {
  await takeSnapshot(`Before removing “${trip.name}”`)
  await db.transaction('rw', [...RECORD_TABLES.map(recordTable), db.files, db.unsent, db.outbox, db.serverTrips, db.settings], async () => {
    await db.trips.delete(trip.id)
    for (const table of TRIP_TABLES) await recordTable(table).where('tripId').equals(trip.id).delete()
    await db.files.where('tripId').equals(trip.id).delete()
    await db.unsent.where('tripId').equals(trip.id).delete()
    await db.outbox.where('tripId').equals(trip.id).delete()
    await db.serverTrips.delete(trip.id)
    await db.settings.bulkDelete([SETTINGS.me(trip.id), SETTINGS.serverGone(trip.id)])
  })
}
