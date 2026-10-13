import { describe, expect, it } from 'vitest'
import { RECORD_TABLES, type RecordTable, type Tables } from '../db/types'
import { ANA, attachment, BO, exchange, expense, place, stay, T0, T1, T2, tables, traveller, trip } from '../test/fixtures'
import { DataError } from './records'
import { buildBackup, decodeLink, encodeLink, forSending, parseBackup, planMerge } from './sync'

const NOW = Date.parse('2026-10-08T12:00:00.000Z')
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown

const lisbon = tables({
  trips: [trip()],
  travellers: [traveller(ANA, 'Ana'), traveller(BO, 'Bo')],
  stays: [stay()],
  places: [place()],
  expenses: [expense({ split: { kind: 'equal', among: [ANA, BO] } })],
  exchanges: [exchange()],
})

/** This phone's copies, as planMerge looks them up. */
const local = (t: Tables) =>
  Object.fromEntries(RECORD_TABLES.map((table: RecordTable) => [table, new Map(t[table].map((r) => [r.id, r]))])) as Parameters<typeof planMerge>[0]

describe('backup files', () => {
  it('round-trip every record', () => {
    const text = JSON.stringify(buildBackup(lisbon, new Date(NOW)))
    expect(parseBackup(text, NOW)).toMatchObject({ app: 'waypoints', schemaVersion: 1, ...lisbon })
  })

  it('refuse other files and newer formats', () => {
    expect(() => parseBackup('not json', NOW)).toThrow(DataError)
    expect(() => parseBackup('{"app":"fronds","schemaVersion":1}', NOW)).toThrow("isn't a waypoints file")
    expect(() => parseBackup('{"app":"waypoints","schemaVersion":2}', NOW)).toThrow('newer version')
  })

  it('refuse invalid records', () => {
    const broken = (patch: object) => JSON.stringify({ ...buildBackup(lisbon), stays: [{ ...stay(), ...patch }] })
    expect(() => parseBackup(broken({ checkInDate: '2027-02-30' }), NOW)).toThrow('invalid stay')
    expect(() => parseBackup(broken({ name: 42 }), NOW)).toThrow('invalid stay')
    expect(() => parseBackup(broken({ name: undefined }), NOW)).toThrow('invalid stay')
    expect(() => parseBackup(broken({ id: 'x' }), NOW)).toThrow('invalid stay')
    expect(() => parseBackup(broken({ updatedAt: '2026-10-08T12:00:00Z' }), NOW)).toThrow('invalid stay')
    expect(() => parseBackup(broken({ updatedAt: '2030-01-01T00:00:00.000Z' }), NOW)).toThrow('in the future')
    expect(() => parseBackup(JSON.stringify({ ...buildBackup(lisbon), expenses: [{ ...expense(), split: { kind: 'equal', among: ['x'] } }] }), NOW)).toThrow(
      'invalid expense',
    )
  })

  it('keep fields and kinds from newer versions of the app', () => {
    const newer = { ...stay(), kind: 'treehouse', breakfast: true }
    const parsed = parseBackup(JSON.stringify({ ...buildBackup(lisbon), stays: [newer] }), NOW)
    expect(parsed.stays[0]).toEqual(newer)
  })

  it('accept files with tables missing', () => {
    expect(parseBackup(JSON.stringify({ app: 'waypoints', schemaVersion: 1, trips: [trip()] }), NOW).stays).toEqual([])
  })

  it("keep photos and documents' records, checked like any other", () => {
    const withFiles = tables({
      ...lisbon,
      attachments: [
        attachment(),
        attachment({ id: 'file0002', kind: 'document', type: 'application/pdf', private: true }),
        attachment({ id: 'file0003', kind: 'document', type: 'application/pdf', itemTable: 'transports', itemId: 'move0001', wholeBooking: true }),
      ],
    })
    expect(parseBackup(JSON.stringify(buildBackup(withFiles)), NOW).attachments).toEqual(withFiles.attachments)
    const broken = (patch: object) => JSON.stringify({ ...buildBackup(lisbon), attachments: [{ ...attachment(), ...patch }] })
    expect(() => parseBackup(broken({ sha256: 'abc' }), NOW)).toThrow('invalid attachment')
    expect(() => parseBackup(broken({ size: 0 }), NOW)).toThrow('invalid attachment')
    expect(() => parseBackup(broken({ size: 1.5 }), NOW)).toThrow('invalid attachment')
    expect(() => parseBackup(broken({ type: 'not a type' }), NOW)).toThrow('invalid attachment')
    expect(() => parseBackup(broken({ takenAt: '2027-03-11 21:04' }), NOW)).toThrow('invalid attachment')
    expect(() => parseBackup(broken({ takenAt: '2027-02-30T21:04' }), NOW)).toThrow('invalid attachment')
    expect(() => parseBackup(broken({ wholeBooking: 'yes' }), NOW)).toThrow('invalid attachment')
  })

  it('leave photos and documents out of a trip sent as a file', () => {
    const withFiles = tables({ ...lisbon, attachments: [attachment()] })
    expect(forSending(withFiles)).toEqual(lisbon)
  })
})

describe('trip links', () => {
  it('carry one trip without repeating its id on every record', () => {
    const other = tables({ trips: [trip()], stays: [stay(), stay({ id: 'stay0009', tripId: 'trip0009' })] })
    const payload = encodeLink(other, 'Ana', new Date(NOW)) as { stays: object[] }
    expect(payload.stays).toEqual([expect.not.objectContaining({ tripId: expect.anything() })])
    expect(payload.stays).toHaveLength(1)
  })

  it('decode back to the same records', () => {
    const link = decodeLink(json(encodeLink(lisbon, '  Ana  ', new Date(NOW))), NOW)
    expect(link.sentBy).toBe('Ana')
    expect(link.sentAt).toBe('2026-10-08T12:00:00.000Z')
    expect(link.tables).toEqual(lisbon)
  })

  it("never carry photos and documents, which links can't hold the files of", () => {
    const withFiles = tables({ ...lisbon, attachments: [attachment()] })
    const payload = encodeLink(withFiles, undefined, new Date(NOW))
    expect(payload).not.toHaveProperty('attachments')
    // A crafted link with some is read as if it had none.
    const crafted = { ...json(payload) as object, attachments: [attachment()] }
    expect(decodeLink(crafted, NOW).tables).toEqual(lisbon)
  })

  it('refuse links from a newer version, and broken ones', () => {
    expect(() => decodeLink({ v: 2, trip: {}, sentAt: '' }, NOW)).toThrow('newer version')
    expect(() => decodeLink({ hello: 1 }, NOW)).toThrow(DataError)
    expect(() => decodeLink({ v: 1, sentAt: 'x', trip: { ...trip(), currency: 'euro' } }, NOW)).toThrow('invalid trip')
    expect(() => decodeLink({ v: 1, sentAt: 'x', trip: trip(), stays: 'nope' }, NOW)).toThrow(DataError)
  })
})

describe('planMerge', () => {
  it('adds new records and keeps the newest copy of each', () => {
    const mine = tables({ trips: [trip()], places: [place({ updatedAt: T1, notes: 'mine' })], stays: [stay()] })
    const theirs = tables({
      trips: [trip()],
      places: [place({ updatedAt: T0, notes: 'older' })],
      stays: [stay({ updatedAt: T1, name: 'Renamed' })],
      expenses: [expense()],
    })
    const plan = planMerge(local(mine), theirs)
    expect(plan.counts).toEqual({ added: 1, updated: 1, removed: 0 })
    expect(plan.changes.stays).toEqual([theirs.stays[0]])
    expect(plan.changes.places).toEqual([])
    expect(plan.changes.trips).toEqual([])
    expect(plan.newTrips).toEqual([])
  })

  it('applies deletions that are newer than the edit here', () => {
    const plan = planMerge(local(tables({ stays: [stay({ updatedAt: T1 })] })), tables({ stays: [stay({ updatedAt: T2, deletedAt: T2 })] }))
    expect(plan.counts).toEqual({ added: 0, updated: 0, removed: 1 })
  })

  it('changes nothing when merging the same trip twice', () => {
    expect(planMerge(local(lisbon), lisbon).counts).toEqual({ added: 0, updated: 0, removed: 0 })
  })

  it('reports trips that are new to this phone', () => {
    expect(planMerge(local(tables()), lisbon).newTrips.map((t) => t.id)).toEqual(['trip0001'])
  })

  it('never moves a record to another trip', () => {
    const plan = planMerge(local(tables({ stays: [stay()] })), tables({ stays: [stay({ tripId: 'trip0009', updatedAt: T2 })] }))
    expect(plan.changes.stays).toEqual([])
  })
})

describe("planMerge and travellers' server links", () => {
  const linkedAna = traveller(ANA, 'Ana', { updatedAt: T1, memberId: 'member-ana', linkedAt: T1 })

  it('keeps a link when someone renames the traveller from an older copy', () => {
    const renamedFromOldCopy = traveller(ANA, 'Ana M.', { updatedAt: T2 })
    const plan = planMerge(local(tables({ travellers: [linkedAna] })), tables({ travellers: [renamedFromOldCopy] }))
    expect(plan.changes.travellers).toEqual([{ ...renamedFromOldCopy, memberId: 'member-ana', linkedAt: T1 }])
  })

  it('takes a newer link or unlink, even onto a copy edited more recently here', () => {
    const renamedHere = { ...linkedAna, name: 'Ana M.', updatedAt: T2 }
    const unlinkedThere = traveller(ANA, 'Ana', { updatedAt: '2026-10-02T12:00:00.000Z', linkedAt: '2026-10-02T12:00:00.000Z' })
    const plan = planMerge(local(tables({ travellers: [{ ...renamedHere, linkedAt: T0 }] })), tables({ travellers: [unlinkedThere] }))
    expect(plan.changes.travellers).toEqual([{ ...renamedHere, memberId: undefined, linkedAt: '2026-10-02T12:00:00.000Z' }])
    expect('memberId' in plan.changes.travellers[0]).toBe(false)
    expect(plan.counts).toEqual({ added: 0, updated: 1, removed: 0 })
    // And the same again changes nothing.
    expect(planMerge(local(tables({ travellers: plan.changes.travellers })), tables({ travellers: [unlinkedThere] })).changes.travellers).toEqual([])
  })

  it("doesn't let links or files change who's on a trip kept on the server", () => {
    const onServer = new Set(['trip0001'])
    const pointedElsewhere = traveller(ANA, 'Ana', { updatedAt: T2, memberId: 'member-eve', linkedAt: T2 })
    const newWithLink = traveller(BO, 'Bo', { memberId: 'member-eve', linkedAt: T2 })
    const plan = planMerge(local(tables({ travellers: [linkedAna] })), tables({ travellers: [pointedElsewhere, newWithLink] }), onServer)
    expect(plan.changes.travellers.map((t) => [t.id, t.memberId])).toEqual([
      [ANA, 'member-ana'],
      [BO, undefined],
    ])
    // A trip that isn't on the server here takes them as they come.
    expect(planMerge(local(tables({ travellers: [linkedAna] })), tables({ travellers: [pointedElsewhere] })).changes.travellers).toEqual([pointedElsewhere])
  })
})
