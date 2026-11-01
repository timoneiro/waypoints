import { describe, expect, it } from 'vitest'
import type { PackingItem, Tables, Vote } from '../../src/db/types.ts'
import type { SyncRequest } from '../../src/domain/serverProtocol.ts'
import { ANA, attachment, BO, CY, place, report, review, stay, T0, T1, T2, traveller, trip } from '../../src/test/fixtures.ts'
import { emptyData, type Member, type StoreData } from './store.ts'
import { applySync, BadRequest, parseSyncRequest } from './sync.ts'

const NOW = new Date('2026-10-08T12:00:00.000Z')
const TRIP = 'trip0001'
const ANA_M = 'member-ana'
const BO_M = 'member-bo'
const CY_M = 'member-cy'

const member = (id: string, name: string): Member => ({ id, name, admin: false, createdAt: T0, devices: {} })

function server(): StoreData {
  return { ...emptyData(), members: { [ANA_M]: member(ANA_M, 'Ana'), [BO_M]: member(BO_M, 'Bo'), [CY_M]: member(CY_M, 'Cy') } }
}

/** Ana and Bo are on the server; Cy (a member too) isn't on this trip; Dee only uses links. */
const lisbon = (): Partial<Tables> => ({
  trips: [trip()],
  travellers: [traveller(ANA, 'Ana', { memberId: ANA_M }), traveller(BO, 'Bo', { memberId: BO_M }), traveller(CY, 'Dee')],
  stays: [stay()],
})

const send = (records: Partial<Tables>, cursor = 0, id = TRIP): SyncRequest => ({ trips: [{ id, cursor, records }] })
const sync = (data: StoreData, who: string, req: SyncRequest = { trips: [] }) => applySync(data, data.members[who], req, NOW)

describe('a trip on the server', () => {
  it('is created by one of its travellers, and reaches the others linked to it', () => {
    const data = server()
    const { response, changed } = sync(data, ANA_M, send(lisbon()))
    expect(changed).toBe(true)
    // Everything sent was accepted, so nothing needs to come back.
    expect(response.trips).toEqual([{ id: TRIP, cursor: 5, records: {} }])
    expect(response.members.map((m) => m.name)).toEqual(['Ana', 'Bo', 'Cy'])

    const bo = sync(data, BO_M).response
    expect(bo.trips).toHaveLength(1)
    expect(bo.trips[0]).toMatchObject({ id: TRIP, cursor: 5 })
    expect(bo.trips[0].records).toEqual(lisbon())

    expect(sync(data, CY_M).response.trips).toEqual([])
  })

  it("isn't created when the sender isn't one of its travellers", () => {
    const data = server()
    const { response, changed } = sync(data, CY_M, send(lisbon()))
    expect(response).toMatchObject({ trips: [], gone: [TRIP] })
    expect(changed).toBe(false)
    expect(data.trips).toEqual({})
  })

  it('stays closed to members who are not on it, even if they know its id', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))
    const intruder = { ...lisbon(), travellers: [traveller('cy-ghost', 'Cy', { memberId: CY_M, updatedAt: T1 })] }
    const { response, changed } = sync(data, CY_M, send(intruder, 5))
    expect(response).toMatchObject({ trips: [], gone: [TRIP] })
    expect(changed).toBe(false)
    expect(data.trips[TRIP].records.travellers?.['cy-ghost']).toBeUndefined()
  })

  it('merges record by record: newer wins, and an older copy gets the newer one back', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))

    // Bo renames the stay; Ana, whose clock is behind, sends an older edit of it plus a new place.
    sync(data, BO_M, send({ stays: [stay({ name: 'Casa Verde', updatedAt: T2 })] }, 5))
    const { response } = sync(data, ANA_M, send({ stays: [stay({ name: 'Casa Rosa', updatedAt: T1 })], places: [place({ tripId: TRIP })] }, 5))

    expect(data.trips[TRIP].records.stays?.stay0001.rec.name).toBe('Casa Verde')
    expect(response.trips[0].cursor).toBe(7)
    // Ana gets Bo's rename (her copy lost), not the place she just sent.
    expect(response.trips[0].records).toEqual({ stays: [stay({ name: 'Casa Verde', updatedAt: T2 })] })
  })

  it('is left by unlinking yourself, and closes to someone unlinked by another traveller', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))

    // Ana takes Bo off the server trip; his expenses would keep him as a traveller, just not linked.
    sync(data, ANA_M, send({ travellers: [traveller(BO, 'Bo', { updatedAt: T1 })] }, 5))
    expect(sync(data, BO_M, send({}, 5)).response).toMatchObject({ trips: [], gone: [TRIP] })

    // Ana leaves: her last change is kept, then the trip is gone for her.
    const { response, changed } = sync(data, ANA_M, send({ travellers: [traveller(ANA, 'Ana', { updatedAt: T2 })] }, 6))
    expect(changed).toBe(true)
    expect(response.gone).toEqual([TRIP])
    expect(data.trips[TRIP].records.travellers?.[ANA].rec.memberId).toBeUndefined()
  })

  it("keeps a traveller's link when someone renames them from an older copy, and takes a newer unlink", () => {
    const data = server()
    const linked = { ...lisbon(), travellers: [traveller(ANA, 'Ana', { memberId: ANA_M, linkedAt: T0 }), traveller(BO, 'Bo', { memberId: BO_M, linkedAt: T0 })] }
    sync(data, ANA_M, send(linked))

    // From a copy without the link (a link sent before the trip went on the server).
    const renamed = traveller(BO, 'Bo M.', { updatedAt: T1 })
    const { response } = sync(data, ANA_M, send({ travellers: [renamed] }, 3))
    expect(data.trips[TRIP].records.travellers?.[BO].rec).toMatchObject({ name: 'Bo M.', memberId: BO_M, linkedAt: T0 })
    // The phone gets the merged copy back, link included.
    expect(response.trips[0].records.travellers).toEqual([{ ...renamed, memberId: BO_M, linkedAt: T0 }])
    expect(sync(data, BO_M).response.trips).toHaveLength(1)

    // Taking Bo off from a copy that's older except for the link still takes him off.
    sync(data, ANA_M, send({ travellers: [traveller(BO, 'Bo', { updatedAt: T0, linkedAt: T2 })] }, 4))
    expect(data.trips[TRIP].records.travellers?.[BO].rec).toMatchObject({ name: 'Bo M.', linkedAt: T2 })
    expect(data.trips[TRIP].records.travellers?.[BO].rec.memberId).toBeUndefined()
    expect(sync(data, BO_M).response.trips).toEqual([])
  })

  it('closes to members removed from the server', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))
    delete data.members[BO_M]
    expect(sync(data, ANA_M).response.members.map((m) => m.name)).toEqual(['Ana', 'Cy'])
    data.members[BO_M] = member(BO_M, 'Bo')
    expect(sync(data, BO_M).response.trips).toHaveLength(1)
  })

  it('asks for everything again when the server is behind the phone', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))

    // Restored from an older backup: the phone has pulled further than the server ever got.
    const behind = sync(data, ANA_M, send({}, 9)).response
    expect(behind.resend).toEqual([TRIP])
    expect(behind.trips[0]).toMatchObject({ id: TRIP, cursor: 5, records: lisbon() })

    // The trip itself is missing: nothing partial is stored until the phone sends it all.
    const empty = server()
    const missing = sync(empty, ANA_M, send({ stays: [stay({ updatedAt: T1 })] }, 9))
    expect(missing.response).toMatchObject({ trips: [], gone: [], resend: [TRIP] })
    expect(missing.changed).toBe(false)
    expect(empty.trips).toEqual({})
  })

  it('refuses invalid records and keeps the rest', () => {
    const data = server()
    const { response } = sync(
      data,
      ANA_M,
      send({
        ...lisbon(),
        stays: [stay({ checkInDate: '2027-02-30' })],
        places: [place({ tripId: 'another-trip' }), place({ id: 'spot0002', tripId: TRIP })],
        ...({ reviews: [{ id: 'review01' }] } as object),
      }),
    )
    expect(response.rejected.map((r) => `${r.table}/${r.id}`)).toEqual(['stays/stay0001', 'places/spot0001', 'reviews/review01'])
    expect(response.rejected[1].reason).toContain('another trip')
    expect(Object.keys(data.trips[TRIP].records.places ?? {})).toEqual(['spot0002'])
    expect(data.trips[TRIP].records.stays).toEqual({})
  })
})

describe('sync requests', () => {
  it('must be a list of trips with records', () => {
    expect(() => parseSyncRequest(null)).toThrow(BadRequest)
    expect(() => parseSyncRequest({ trips: [{ id: TRIP, cursor: -1, records: {} }] })).toThrow(BadRequest)
    expect(() => parseSyncRequest({ trips: [{ id: 'x', cursor: 0, records: {} }] })).toThrow(BadRequest)
    expect(() => parseSyncRequest({ trips: [{ id: TRIP, cursor: 0, records: { stays: {} } }] })).toThrow(BadRequest)
    const twice = { id: TRIP, cursor: 0, records: {} }
    expect(() => parseSyncRequest({ trips: [twice, twice] })).toThrow('twice')
    expect(parseSyncRequest({ trips: [twice] })).toEqual({ trips: [twice] })
  })
})


describe('photos and documents on the server', () => {
  it('sync like other records, apart from private ones', () => {
    const data = server()
    const { response } = sync(data, ANA_M, send({ ...lisbon(), attachments: [attachment(), attachment({ id: 'file0002', private: true })] }))
    expect(response.rejected).toEqual([{ tripId: TRIP, table: 'attachments', id: 'file0002', reason: 'It is kept only on the phone it was added on.' }])
    expect(Object.keys(data.trips[TRIP].records.attachments ?? {})).toEqual(['file0001'])
    expect(sync(data, BO_M).response.trips[0].records.attachments).toEqual([attachment()])
  })

  it("can't have their file swapped for another", () => {
    const data = server()
    sync(data, ANA_M, send({ ...lisbon(), attachments: [attachment()] }))
    const swapped = attachment({ sha256: 'f'.repeat(64), updatedAt: T1 })
    const { response } = sync(data, BO_M, send({ attachments: [swapped] }, 5))
    expect(response.rejected).toMatchObject([{ id: 'file0001', reason: "A photo or document's file can't be changed." }])
    expect(data.trips[TRIP].records.attachments?.file0001.rec).toEqual(attachment())
    // Anything else about it can change: a caption, what it belongs to.
    expect(sync(data, BO_M, send({ attachments: [attachment({ caption: 'Fado!', itemTable: undefined, itemId: undefined, updatedAt: T1 })] }, 5)).response.rejected).toEqual([])
  })

  it('say which files to delete when they are deleted', () => {
    const data = server()
    sync(data, ANA_M, send({ ...lisbon(), attachments: [attachment()] }))
    const { removedFiles } = sync(data, BO_M, send({ attachments: [attachment({ deletedAt: T2, updatedAt: T2 })] }, 5))
    expect(removedFiles).toEqual([{ tripId: TRIP, id: 'file0001' }])
    expect(sync(data, ANA_M, send({ stays: [stay({ name: 'Casa Verde', updatedAt: T1 })] }, 5)).removedFiles).toEqual([])
  })
})

describe('reviews on the server', () => {
  it("reach everyone on the trip, each traveller's their own", () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))
    const anas = review({ itemTable: 'stays', itemId: 'stay0001', stars: 5, updatedAt: T1 })
    const bos = review({ id: 'rate0002', itemTable: 'stays', itemId: 'stay0001', by: BO, stars: undefined, missed: true, updatedAt: T1 })
    sync(data, ANA_M, send({ reviews: [anas] }, 5))
    const { response } = sync(data, BO_M, send({ reviews: [bos] }, 5))
    expect(response.rejected).toEqual([])
    expect(response.trips[0].records.reviews).toEqual([anas])
    expect(Object.keys(data.trips[TRIP].records.reviews ?? {}).sort()).toEqual(['rate0001', 'rate0002'])
  })

  it('are checked like any other record', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))
    const { response } = sync(data, ANA_M, send({ reviews: [review({ stars: 9 })] }, 5))
    expect(response.rejected).toMatchObject([{ table: 'reviews', id: 'rate0001', reason: 'It contains an invalid review.' }])
  })
})

describe('packing items on the server', () => {
  const item = (over: Partial<PackingItem> = {}): PackingItem => ({
    id: 'pack0001',
    createdAt: T0,
    updatedAt: T1,
    tripId: TRIP,
    text: 'Charger',
    ...over,
  })

  it('reach everyone on the trip', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))
    const charger = item({ packed: true, bringer: BO })
    expect(sync(data, ANA_M, send({ packingItems: [charger] }, 5)).response.rejected).toEqual([])
    expect(sync(data, BO_M, send({}, 5)).response.trips[0].records.packingItems).toEqual([charger])
    expect(Object.keys(data.trips[TRIP].records.packingItems ?? {})).toEqual(['pack0001'])
  })

  it('are checked like any other record', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))
    const { response } = sync(data, ANA_M, send({ packingItems: [item({ text: 'x'.repeat(500) })] }, 5))
    expect(response.rejected).toMatchObject([{ table: 'packingItems', id: 'pack0001', reason: 'It contains an invalid packing item.' }])
  })
})

describe('votes on the server', () => {
  const vote = (over: Partial<Vote> = {}): Vote => ({
    id: 'vote0001',
    createdAt: T0,
    updatedAt: T1,
    tripId: TRIP,
    placeId: 'spot0001',
    by: ANA,
    ...over,
  })

  it('reach everyone on the trip', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))
    const anas = vote()
    expect(sync(data, ANA_M, send({ votes: [anas] }, 5)).response.rejected).toEqual([])
    expect(sync(data, BO_M, send({}, 5)).response.trips[0].records.votes).toEqual([anas])
    expect(Object.keys(data.trips[TRIP].records.votes ?? {})).toEqual(['vote0001'])
  })

  it('are checked like any other record', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))
    const { response } = sync(data, ANA_M, send({ votes: [{ ...vote(), by: undefined } as unknown as Vote] }, 5))
    expect(response.rejected).toMatchObject([{ table: 'votes', id: 'vote0001', reason: 'It contains an invalid vote.' }])
  })
})

describe('the trip report on the server', () => {
  it('is kept once for everyone on the trip, the newest one winning', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))
    const anas = report({ updatedAt: T1 })
    expect(sync(data, ANA_M, send({ reports: [anas] }, 5)).response.rejected).toEqual([])
    expect(sync(data, BO_M, send({}, 5)).response.trips[0].records.reports).toEqual([anas])
    expect(sync(data, CY_M).response.trips).toEqual([])

    // Bo makes it again, with the same id.
    const bos = report({ madeBy: BO, updatedAt: T2, data: { ...anas.data, madeAt: T2 } })
    sync(data, BO_M, send({ reports: [bos] }, 6))
    expect(Object.values(data.trips[TRIP].records.reports ?? {}).map((s) => s.rec)).toEqual([bos])
  })

  it('is checked like any other record', () => {
    const data = server()
    sync(data, ANA_M, send(lisbon()))
    const { response } = sync(data, ANA_M, send({ reports: [report({ data: { madeAt: T1 } })] }, 5))
    expect(response.rejected).toMatchObject([{ table: 'reports', id: 'repo0001', reason: 'It contains an invalid report.' }])
  })
})
