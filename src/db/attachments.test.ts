import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { FILE, FILE_SHA256 } from '../test/fixtures'
import { createTrip, removeTripFromPhone } from './actions'
import { addAttachments, deleteAttachment, deleteAttachments, keepOnlyHere, shareAttachment, updateAttachment, type NewFile } from './attachments'
import { applyMerge, exportTripFile, readTables } from './backupIO'
import { db } from './db'
import { emptyTables } from './types'

const tripInput = { name: 'Lisbon & Porto', startDate: '2027-03-10', endDate: '2027-03-13', timeZone: 'Europe/Lisbon', currency: 'EUR' }
const photo = (): NewFile => ({
  kind: 'photo',
  name: 'Fado.jpg',
  type: 'image/jpeg',
  blob: new Blob([FILE], { type: 'image/jpeg' }),
  thumb: new Blob([FILE], { type: 'image/jpeg' }),
  sha256: FILE_SHA256,
  takenAt: '2027-03-11T21:04',
})
const later = (seconds = 1) => new Date(Date.now() + seconds * 1000).toISOString()
const outboxIds = async (tripId: string) => (await db.outbox.where('tripId').equals(tripId).toArray()).map((o) => o.id).sort()

let tripId: string

beforeEach(async () => {
  await db.delete()
  await db.open()
  tripId = await createTrip(tripInput, [{ name: 'Ana' }, { name: 'Bo' }])
  await db.unsent.clear()
  await db.outbox.clear()
})

describe('photos and documents', () => {
  it('are added with their file, waiting for the server but not for links', async () => {
    const [id] = await addAttachments(tripId, [photo()], { to: { itemTable: 'activities', itemId: 'todo0001' }, caption: 'Fado night' })
    expect(await db.attachments.get(id)).toMatchObject({ tripId, kind: 'photo', size: 3, sha256: FILE_SHA256, itemTable: 'activities', caption: 'Fado night' })
    expect((await db.files.get(id))!.blob!.size).toBe(3)
    expect(await outboxIds(tripId)).toEqual([id])
    expect(await db.unsent.count()).toBe(0)
  })

  it('kept only on this phone go nowhere', async () => {
    const [id] = await addAttachments(tripId, [photo()], { private: true })
    expect(await db.attachments.get(id)).toMatchObject({ private: true })
    expect(await db.files.get(id)).toBeDefined()
    expect(await db.outbox.count()).toBe(0)
  })

  it('move between items and the whole trip', async () => {
    const [id] = await addAttachments(tripId, [photo()], { to: { itemTable: 'activities', itemId: 'todo0001' } })
    await db.outbox.clear()
    await updateAttachment(id, { name: 'Fado.jpg' }) // to the whole trip
    const moved = (await db.attachments.get(id))!
    expect(moved.itemTable).toBeUndefined()
    expect(moved.itemId).toBeUndefined()
    expect(await outboxIds(tripId)).toEqual([id])

    await db.outbox.clear()
    await updateAttachment(id, { name: 'Fado.jpg' }) // nothing changes
    expect(await db.outbox.count()).toBe(0)
  })

  it("can be for a journey's whole booking, and stop being when they move off journeys", async () => {
    const ticket = { ...photo(), kind: 'document' as const, name: 'E-ticket.pdf', type: 'application/pdf' }
    const [id] = await addAttachments(tripId, [ticket], { to: { itemTable: 'transports', itemId: 'move0001', wholeBooking: true } })
    expect(await db.attachments.get(id)).toMatchObject({ itemTable: 'transports', itemId: 'move0001', wholeBooking: true })

    await updateAttachment(id, { name: 'E-ticket.pdf', itemTable: 'transports', itemId: 'move0001' }) // this journey only
    expect(await db.attachments.get(id)).not.toHaveProperty('wholeBooking')
    await updateAttachment(id, { name: 'E-ticket.pdf', itemTable: 'activities', itemId: 'todo0001', wholeBooking: true })
    expect(await db.attachments.get(id)).not.toHaveProperty('wholeBooking')
    await updateAttachment(id, { name: 'E-ticket.pdf', itemTable: 'transports', itemId: 'move0002', wholeBooking: true })
    await updateAttachment(id, { name: 'E-ticket.pdf', wholeBooking: true }) // to the whole trip
    expect(await db.attachments.get(id)).not.toHaveProperty('wholeBooking')

    const [photoId] = await addAttachments(tripId, [photo()], { to: { wholeBooking: true } })
    expect(await db.attachments.get(photoId)).not.toHaveProperty('wholeBooking')
  })

  it('are deleted for everyone, and their file here', async () => {
    const [id] = await addAttachments(tripId, [photo()])
    await db.outbox.clear()
    await deleteAttachment(id)
    expect((await db.attachments.get(id))!.deletedAt).toBeDefined()
    expect(await db.files.get(id)).toBeUndefined()
    expect(await outboxIds(tripId)).toEqual([id])
  })

  it('are deleted several at once, skipping ones already deleted', async () => {
    const [a, b, gone] = [...(await addAttachments(tripId, [photo(), photo(), photo()]))]
    await deleteAttachment(gone)
    await db.outbox.clear()
    await deleteAttachments([a, b, gone])
    expect((await db.attachments.get(a))!.deletedAt).toBeDefined()
    expect((await db.attachments.get(b))!.deletedAt).toBeDefined()
    expect(await db.files.get(a)).toBeUndefined()
    expect(await db.files.get(b)).toBeUndefined()
    expect(await outboxIds(tripId)).toEqual([a, b].sort())
  })

  it('switch between shared and kept only here', async () => {
    const [id] = await addAttachments(tripId, [photo()])
    await db.outbox.clear()

    // Kept here: deleted for the others, with a private copy under a new id.
    const copy = (await keepOnlyHere(id))!
    expect(copy).not.toBe(id)
    expect((await db.attachments.get(id))!.deletedAt).toBeDefined()
    expect(await db.attachments.get(copy)).toMatchObject({ private: true, sha256: FILE_SHA256 })
    expect(await db.files.get(id)).toBeUndefined()
    expect((await db.files.get(copy))!.blob!.size).toBe(3)
    expect(await outboxIds(tripId)).toEqual([id])

    await db.outbox.clear()
    await shareAttachment(copy)
    expect((await db.attachments.get(copy))!.private).toBeUndefined()
    expect(await outboxIds(tripId)).toEqual([copy])
  })

  it("lose their file when deleted elsewhere, and stay out of the outbox when they're private", async () => {
    const [shared, mine] = [...(await addAttachments(tripId, [photo()])), ...(await addAttachments(tripId, [photo()], { private: true }))]
    await db.outbox.clear()
    const tables = await readTables(tripId)
    const deleted = tables.attachments.map((a) => ({ ...a, caption: 'From a backup', deletedAt: a.id === shared ? later() : undefined, updatedAt: later() }))
    await applyMerge({ ...emptyTables(), attachments: deleted }, 'test')

    expect(await db.files.get(shared)).toBeUndefined()
    expect(await db.files.get(mine)).toBeDefined()
    expect(await outboxIds(tripId)).toEqual([shared])
  })

  it('stay out of trip files sent to others', async () => {
    await addAttachments(tripId, [photo()])
    expect((await exportTripFile(tripId)).attachments).toEqual([])
  })

  it('go with the trip when it is removed from this phone', async () => {
    await addAttachments(tripId, [photo()])
    await removeTripFromPhone((await db.trips.get(tripId))!)
    expect(await db.attachments.count()).toBe(0)
    expect(await db.files.count()).toBe(0)
  })
})
