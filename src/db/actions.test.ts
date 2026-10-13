import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { emptyTables } from './types'
import { addTraveller, clearUnsent, createTrip, deleteRecord, moveTripToServer, patchRecord, removeTripFromPhone, saveRecord, saveReview, updateTrip } from './actions'
import { applyMerge, previewMerge, readTables } from './backupIO'
import { db, getSetting, setSetting, SETTINGS } from './db'

const tripInput = { name: 'Lisbon & Porto', startDate: '2027-03-10', endDate: '2027-03-13', timeZone: 'Europe/Lisbon', currency: 'EUR' }
const stayInput = { name: 'Casa Azul', kind: 'apartment' as const, checkInDate: '2027-03-10', checkOutDate: '2027-03-12', timeZone: 'Europe/Lisbon' }
const people = (...names: string[]) => names.map((name) => ({ name }))
const unsentIds = async (tripId: string) => (await db.unsent.where('tripId').equals(tripId).toArray()).map((u) => u.id).sort()
const outboxIds = async (tripId: string) => (await db.outbox.where('tripId').equals(tripId).toArray()).map((u) => u.id).sort()

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('trips', () => {
  it('are created with their travellers, the first one using this phone', async () => {
    const tripId = await createTrip(tripInput, people('Ana', 'Bo'))
    const travellers = await db.travellers.where('tripId').equals(tripId).toArray()
    expect(travellers.map((t) => t.name).sort()).toEqual(['Ana', 'Bo'])
    expect(await getSetting(SETTINGS.me(tripId))).toBe(travellers.find((t) => t.name === 'Ana')!.id)
    expect(await unsentIds(tripId)).toEqual([tripId, ...travellers.map((t) => t.id)].sort())
  })

  it('only save what changed when edited', async () => {
    const tripId = await createTrip(tripInput, people('Ana', 'Bo', 'Cy'))
    const before = await db.trips.get(tripId)
    const [ana, bo] = (await db.travellers.toArray()).sort((a, b) => a.name.localeCompare(b.name))
    await clearUnsent(tripId)

    await updateTrip(tripId, tripInput, [{ id: ana.id, name: 'Ana' }, { id: bo.id, name: 'Bob' }, { name: 'Dee' }])

    expect(await db.trips.get(tripId)).toEqual(before)
    const after = await db.travellers.where('tripId').equals(tripId).toArray()
    expect(after.filter((t) => !t.deletedAt).map((t) => t.name).sort()).toEqual(['Ana', 'Bob', 'Dee'])
    expect(after.find((t) => t.name === 'Cy')?.deletedAt).toBeDefined()
    // Bob renamed, Dee added, Cy removed; Ana and the trip itself untouched.
    expect(await unsentIds(tripId)).toHaveLength(3)
    expect(await unsentIds(tripId)).not.toContain(ana.id)
  })

  it('can be removed from this phone only, keeping a snapshot', async () => {
    const keep = await createTrip({ ...tripInput, name: 'Keep' }, people('Ana'))
    const tripId = await createTrip(tripInput, people('Ana'))
    await saveRecord('stays', tripId, stayInput)
    await db.serverTrips.put({ tripId, cursor: 3, uploaded: true })
    await setSetting(SETTINGS.serverGone(tripId), '2026-10-09T10:00:00.000Z')
    await removeTripFromPhone((await db.trips.get(tripId))!)

    expect(await db.trips.get(tripId)).toBeUndefined()
    expect(await db.stays.count()).toBe(0)
    expect(await unsentIds(tripId)).toEqual([])
    expect(await outboxIds(tripId)).toEqual([])
    expect(await db.serverTrips.get(tripId)).toBeUndefined()
    expect(await getSetting(SETTINGS.serverGone(tripId))).toBeUndefined()
    expect(await getSetting(SETTINGS.me(tripId))).toBeUndefined()
    expect(await db.trips.get(keep)).toBeDefined()
    const [snapshot] = await db.snapshots.toArray()
    expect(snapshot.reason).toContain('Lisbon & Porto')
    expect(JSON.parse(snapshot.data).stays).toHaveLength(1)
  })
})

describe('records', () => {
  it('are saved, edited and deleted for the whole group', async () => {
    const tripId = await createTrip(tripInput, people('Ana'))
    await clearUnsent(tripId)

    const id = await saveRecord('stays', tripId, { ...stayInput, phone: '+351 21 000 0000' })
    expect(await unsentIds(tripId)).toEqual([id])
    // The sync server's list is separate: sending a link doesn't clear it.
    expect(await outboxIds(tripId)).toContain(id)
    const saved = (await db.stays.get(id))!

    // Saving the form unchanged keeps the record as it was, so it can't override newer edits from others.
    await clearUnsent(tripId)
    expect(await saveRecord('stays', tripId, { ...stayInput, phone: '+351 21 000 0000' }, id)).toBe(id)
    expect(await db.stays.get(id)).toEqual(saved)
    expect(await unsentIds(tripId)).toEqual([])

    // A cleared field is removed, fields this version doesn't know are kept.
    await db.stays.put({ ...saved, ...{ breakfast: true } })
    await saveRecord('stays', tripId, { ...stayInput, phone: undefined }, id)
    const edited = (await db.stays.get(id))!
    expect(edited.phone).toBeUndefined()
    expect('phone' in edited).toBe(false)
    expect(edited).toMatchObject({ breakfast: true, createdAt: saved.createdAt })

    await deleteRecord('stays', id)
    expect((await db.stays.get(id))!.deletedAt).toBeDefined()
    expect(await unsentIds(tripId)).toEqual([id])
  })

  it('can be patched, e.g. ticking a place as visited', async () => {
    const tripId = await createTrip(tripInput, people('Ana'))
    const id = await saveRecord('places', tripId, { name: 'Livraria Lello', category: 'sight' })
    await patchRecord('places', id, { visited: true })
    expect((await db.places.get(id))!.visited).toBe(true)
    await patchRecord('places', id, { visited: undefined })
    expect('visited' in (await db.places.get(id))!).toBe(false)
  })

  it('travellers can be added by someone joining', async () => {
    const tripId = await createTrip(tripInput, people('Ana'))
    const id = await addTraveller(tripId, 'Bo')
    expect((await db.travellers.get(id))!.name).toBe('Bo')
    expect(await unsentIds(tripId)).toContain(id)
  })
})

describe('reviews', () => {
  const setup = async () => {
    const tripId = await createTrip(tripInput, people('Ana', 'Bo'))
    const [ana, bo] = (await db.travellers.toArray()).sort((a, b) => a.name.localeCompare(b.name))
    const stayId = await saveRecord('stays', tripId, stayInput)
    await clearUnsent(tripId)
    await db.outbox.clear()
    return { tripId, ana: ana.id, bo: bo.id, item: { table: 'stays' as const, id: stayId } }
  }
  const live = async () => (await db.reviews.toArray()).filter((r) => !r.deletedAt)

  it('are one per traveller and item, whichever phone writes them', async () => {
    const { tripId, ana, bo, item } = await setup()
    await saveReview(tripId, item, ana, { stars: 4 })
    await saveReview(tripId, item, ana, { stars: 5, note: '  Great view  ' })
    await saveReview(tripId, item, bo, { stars: 2 })
    const reviews = await live()
    expect(reviews).toHaveLength(2)
    expect(reviews.find((r) => r.by === ana)).toMatchObject({ tripId, itemTable: 'stays', itemId: item.id, stars: 5, note: 'Great view' })
    expect(await unsentIds(tripId)).toEqual(reviews.map((r) => r.id).sort())
    expect(await outboxIds(tripId)).toEqual(reviews.map((r) => r.id).sort())

    // Ana's other phone, with a copy of the trip from before her reviews, reviews it too: the same record.
    const sent = await readTables(tripId)
    await db.delete()
    await db.open()
    await applyMerge({ ...sent, reviews: [] }, 'test')
    await saveReview(tripId, item, ana, { stars: 3 })
    expect((await db.reviews.toArray()).map((r) => r.id)).toEqual([sent.reviews.find((r) => r.by === ana)!.id])
  })

  it("don't change when saved as they are", async () => {
    const { tripId, ana, item } = await setup()
    await saveReview(tripId, item, ana, { stars: 4, note: 'Quiet' })
    const before = await db.reviews.toArray()
    await clearUnsent(tripId)
    await saveReview(tripId, item, ana, { stars: 4, note: 'Quiet ' })
    expect(await db.reviews.toArray()).toEqual(before)
    expect(await unsentIds(tripId)).toEqual([])
  })

  it("have no stars when the traveller didn't go, and keep a note", async () => {
    const { tripId, ana, item } = await setup()
    await saveReview(tripId, item, ana, { stars: 4, note: 'Ill that night', missed: true })
    const [review] = await live()
    expect(review.missed).toBe(true)
    expect(review.note).toBe('Ill that night')
    expect('stars' in review).toBe(false)
  })

  it('are deleted when left empty, and can be written again', async () => {
    const { tripId, ana, item } = await setup()
    await saveReview(tripId, item, ana, { missed: true })
    await saveReview(tripId, item, ana, { missed: false })
    expect(await live()).toEqual([])
    expect((await db.reviews.toArray())[0].deletedAt).toBeDefined()

    await saveReview(tripId, item, ana, { stars: 3 })
    const [review] = await live()
    expect(review.stars).toBe(3)
    expect('deletedAt' in review).toBe(false)
    expect(await db.reviews.count()).toBe(1)
  })

  it('keep fields from newer versions of the app', async () => {
    const { tripId, ana, item } = await setup()
    await saveReview(tripId, item, ana, { stars: 4 })
    const [review] = await db.reviews.toArray()
    await db.reviews.put({ ...review, photoId: 'file0001' } as typeof review)
    await saveReview(tripId, item, ana, { stars: 5 })
    expect(await db.reviews.get(review.id)).toMatchObject({ stars: 5, photoId: 'file0001' })
  })
})

describe('merging a trip from another phone', () => {
  it('adds the trip, then updates it, and is safe to repeat', async () => {
    const tripId = await createTrip(tripInput, people('Ana', 'Bo'))
    const stayId = await saveRecord('stays', tripId, stayInput)
    const sent = await readTables(tripId)

    // The other phone starts empty.
    await db.delete()
    await db.open()
    expect((await previewMerge(sent)).newTrips.map((t) => t.id)).toEqual([tripId])
    expect(await applyMerge(sent, 'test')).toEqual({ added: 4, updated: 0, removed: 0 })
    expect(await readTables(tripId)).toEqual(sent)
    // Merged records came from the group, so they aren't this phone's unsent changes.
    expect(await db.unsent.count()).toBe(0)
    // …but they go to the sync server through this phone, if the trip is on it.
    expect(await outboxIds(tripId)).toEqual([tripId, ...sent.travellers.map((t) => t.id), stayId].sort())
    expect(await db.snapshots.count()).toBe(0)

    // A later link renames the stay: overwriting a record here keeps a snapshot first.
    const later = { ...emptyTables(), stays: [{ ...sent.stays[0], name: 'Casa Verde', updatedAt: new Date(Date.now() + 1000).toISOString() }] }
    expect(await applyMerge(later, 'Before merging a link')).toEqual({ added: 0, updated: 1, removed: 0 })
    expect((await db.stays.get(stayId))!.name).toBe('Casa Verde')
    expect(await db.snapshots.count()).toBe(1)

    expect(await applyMerge(later, 'again')).toEqual({ added: 0, updated: 0, removed: 0 })
    expect(await applyMerge(sent, 'older')).toEqual({ added: 0, updated: 0, removed: 0 })
    expect((await db.stays.get(stayId))!.name).toBe('Casa Verde')
  })
})

describe('trips on the sync server', () => {
  it('are created with travellers linked to server members', async () => {
    const tripId = await createTrip(tripInput, [{ name: 'Ana', memberId: 'member-ana' }, { name: 'Dee' }], { onServer: true })
    const travellers = await db.travellers.where('tripId').equals(tripId).sortBy('createdAt')
    expect(travellers.map((t) => [t.name, t.memberId])).toEqual([
      ['Ana', 'member-ana'],
      ['Dee', undefined],
    ])
    expect('memberId' in travellers[1]).toBe(false)
    expect(await db.serverTrips.get(tripId)).toEqual({ tripId, cursor: 0, uploaded: false })
  })

  it('link and unlink travellers when the trip is edited', async () => {
    const tripId = await createTrip(tripInput, people('Ana', 'Bo'))
    const [ana, bo] = await db.travellers.where('tripId').equals(tripId).sortBy('createdAt')
    await db.outbox.clear()

    await updateTrip(tripId, tripInput, [{ id: ana.id, name: 'Ana', memberId: 'member-ana' }, { id: bo.id, name: 'Bo' }])
    const linked = (await db.travellers.get(ana.id))!
    expect(linked.memberId).toBe('member-ana')
    expect(linked.linkedAt).toBe(linked.updatedAt)
    expect(await outboxIds(tripId)).toEqual([ana.id])

    // A rename leaves the link's own clock alone; unlinking moves it.
    await updateTrip(tripId, tripInput, [{ id: ana.id, name: 'Ana M.', memberId: 'member-ana' }, { id: bo.id, name: 'Bo' }])
    expect((await db.travellers.get(ana.id))!.linkedAt).toBe(linked.linkedAt)
    await new Promise((r) => setTimeout(r, 2))
    await updateTrip(tripId, tripInput, [{ id: ana.id, name: 'Ana M.' }, { id: bo.id, name: 'Bo' }])
    const unlinked = (await db.travellers.get(ana.id))!
    expect('memberId' in unlinked).toBe(false)
    expect(unlinked.linkedAt! > linked.linkedAt!).toBe(true)
  })

  it('can be moved there later, linking travellers and keeping the trip id', async () => {
    const tripId = await createTrip(tripInput, people('Ana', 'Bo', 'Cy'))
    const [ana, bo, cy] = await db.travellers.where('tripId').equals(tripId).sortBy('createdAt')
    await db.outbox.clear()

    await moveTripToServer(tripId, { [ana.id]: 'member-ana', [bo.id]: 'member-bo', [cy.id]: undefined })
    expect((await db.travellers.where('tripId').equals(tripId).sortBy('createdAt')).map((t) => t.memberId)).toEqual(['member-ana', 'member-bo', undefined])
    expect(await outboxIds(tripId)).toEqual([ana.id, bo.id].sort())
    expect(await db.serverTrips.get(tripId)).toEqual({ tripId, cursor: 0, uploaded: false })
  })
})
