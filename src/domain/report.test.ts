import { describe, expect, it } from 'vitest'
import { activity, ANA, BO, CY, exchange, expense, place, review, stay, T1, T2, transport, traveller, trip } from '../test/fixtures'
import { isId } from './records'
import { bestAndWorst, buildReport, changedSince, pickHighlights, readReport, REPORT_FORMAT, reportId, type ReportInput, type ReportItem } from './report'

const AFTER = Date.parse('2027-03-20T12:00:00.000Z')
const json = <T>(value: T) => JSON.parse(JSON.stringify(value)) as T

/**
 * Four days in Lisbon and Porto for Ana, Bo and Cy: two stays, three journeys (one without times),
 * three activities (one at a saved place), four saved places, a few expenses and reviews.
 */
const lisbon = (): ReportInput => ({
  trip: trip({ emoji: '🇵🇹' }),
  travellers: [traveller(ANA, 'Ana'), traveller(BO, 'Bo'), traveller(CY, 'Cy')],
  names: new Map([
    [ANA, 'Ana'],
    [BO, 'Bo'],
    [CY, 'Cy'],
  ]),
  stays: [
    stay({ id: 'stay0002', name: 'Hotel Douro', kind: 'hotel', city: 'Porto', checkInDate: '2027-03-12', checkOutDate: '2027-03-13' }),
    stay({ city: 'Lisbon' }),
  ],
  transports: [
    transport({ departTime: '09:00', arriveTime: '12:15' }),
    transport({ id: 'move0002', mode: 'flight', from: 'Porto', to: 'Lisbon', departDate: '2027-03-13', departTime: '18:00', arriveTime: '19:00' }),
    transport({ id: 'move0003', mode: 'bus', from: 'Lisbon', to: 'Sintra', departDate: '2027-03-11' }),
  ],
  activities: [
    activity({ city: 'Lisbon' }),
    activity({ id: 'todo0002', title: 'Livraria Lello', date: '2027-03-13', startTime: '10:00', city: 'Porto', placeId: 'spot0001' }),
    activity({ id: 'todo0003', title: 'Tram 28', city: 'Lisbon' }),
  ],
  places: [
    place(),
    place({ id: 'spot0002', name: 'Belém Tower', city: 'Lisbon', visited: true }),
    place({ id: 'spot0003', name: 'Serralves', category: 'museum' }),
    place({ id: 'spot0004', name: 'Pastéis de Belém', category: 'food', city: 'Lisbon', mustSee: true }),
    place({ id: 'spot0005', name: 'Gone', deletedAt: T1 }),
  ],
  expenses: [
    expense(),
    expense({ id: 'cost0002', title: 'Train tickets', amount: 60, category: 'transport', date: '2027-03-12', paidBy: BO }),
    expense({ id: 'cost0003', title: 'Sushi', amount: 4800, currency: 'JPY', paidWith: 'cash', date: '2027-03-11', paidBy: CY }),
    expense({ id: 'cost0004', title: 'Paying back', amount: 10, transfer: true, paidBy: BO, split: { kind: 'equal', among: [ANA] } }),
    expense({ id: 'cost0005', title: 'Jacket', amount: 50, currency: 'USD', category: 'shopping', date: '2027-03-12' }),
    expense({ id: 'cost0006', title: 'Deleted', amount: 999, deletedAt: T1 }),
  ],
  exchanges: [exchange()],
  reviews: [
    review({ stars: 5, note: 'Goosebumps' }),
    review({ id: 'rate0002', by: BO, stars: 4 }),
    review({ id: 'rate0003', itemTable: 'stays', itemId: 'stay0001', stars: 2 }),
    review({ id: 'rate0004', itemTable: 'stays', itemId: 'stay0001', by: BO, stars: undefined, missed: true }),
    review({ id: 'rate0005', itemTable: 'transports', itemId: 'move0001', by: CY, stars: 3 }),
    review({ id: 'rate0006', itemTable: 'transports', itemId: 'move0002', stars: 1, deletedAt: T2 }),
  ],
  photos: [
    { id: 'pic00001', day: '2027-03-10' },
    { id: 'pic00002', day: '2027-03-11' },
    { id: 'pic00003', day: '2027-03-11' },
    { id: 'pic00004', day: '2027-03-11' },
  ],
})

describe('the trip report', () => {
  const report = buildReport(lisbon(), AFTER)

  it('says where and for how long', () => {
    expect(report).toMatchObject({
      format: REPORT_FORMAT,
      madeAt: '2027-03-20T12:00:00.000Z',
      trip: { name: 'Lisbon & Porto', emoji: '🇵🇹', startDate: '2027-03-10', endDate: '2027-03-13', currency: 'EUR' },
      days: 4,
      travellers: ['Ana', 'Bo', 'Cy'],
      cities: ['Lisbon', 'Porto'],
      activities: 3,
    })
  })

  it('counts the spending, not settle-up payments, and says what it left out', () => {
    expect(report.money).toMatchObject({
      total: 120,
      byCategory: [
        { category: 'food', amount: 60 },
        { category: 'transport', amount: 60 },
      ],
      byDay: [
        { day: '2027-03-10', amount: 30 },
        { day: '2027-03-11', amount: 30 },
        { day: '2027-03-12', amount: 60 },
      ],
      biggest: { title: 'Train tickets', amount: 60, category: 'transport', day: '2027-03-12' },
      biggestMeal: { title: 'Dinner', amount: 30 },
      uncounted: 1,
      estimated: 0,
    })
  })

  it('says who paid what, and who still owes whom', () => {
    expect(report.money.people).toEqual([
      { id: ANA, name: 'Ana', paid: 30, share: 40 },
      { id: BO, name: 'Bo', paid: 60, share: 40 },
      { id: CY, name: 'Cy', paid: 30, share: 40 },
    ])
    // Ana paid Bo back 10 already.
    expect(report.money.toSettle).toEqual([
      { from: 'Ana', to: 'Bo', amount: 20 },
      { from: 'Cy', to: 'Bo', amount: 10 },
    ])
  })

  it('keeps someone taken off the trip who is still in its expenses', () => {
    const input = lisbon()
    input.travellers = input.travellers.filter((t) => t.id !== CY)
    expect(buildReport(input, AFTER).money.people.map((p) => p.name)).toEqual(['Ana', 'Bo', 'Cy'])
  })

  it('lists the stays and journeys', () => {
    expect(report.stays).toEqual([
      { id: 'stay0001', name: 'Casa Azul', kind: 'apartment', city: 'Lisbon', checkIn: '2027-03-10', checkOut: '2027-03-12', nights: 2, average: 2 },
      { id: 'stay0002', name: 'Hotel Douro', kind: 'hotel', city: 'Porto', checkIn: '2027-03-12', checkOut: '2027-03-13', nights: 1, average: undefined },
    ])
    expect(report.journeys).toEqual({
      count: 3,
      byMode: [
        { mode: 'bus', count: 1 },
        { mode: 'flight', count: 1 },
        { mode: 'train', count: 1 },
      ],
      minutes: 255,
      untimed: 1,
      longest: { from: 'Lisbon', to: 'Porto', mode: 'train', minutes: 195 },
    })
    expect(report.busiestDay).toEqual({ day: '2027-03-11', count: 3 })
  })

  it('has everything reviewed, top rated first, with everyone’s reviews in the trip’s order', () => {
    expect(report.reviewed.map((i) => [i.title, i.average])).toEqual([
      ['Fado night', 4.5],
      ['Lisbon → Porto', 3],
      ['Casa Azul', 2],
    ])
    expect(report.reviewed[0]).toMatchObject({ table: 'activities', id: 'todo0001', kind: 'activity', day: '2027-03-11', city: 'Lisbon' })
    expect(report.reviewed[0].reviews).toEqual([
      { by: ANA, name: 'Ana', stars: 5, note: 'Goosebumps', missed: undefined },
      { by: BO, name: 'Bo', stars: 4, note: undefined, missed: undefined },
    ])
    expect(report.reviewed[2].reviews[1]).toMatchObject({ name: 'Bo', missed: true, stars: undefined })
  })

  it('counts places visited, and keeps the rest as ideas for next time, must-sees first', () => {
    // Belém was ticked; Lello was visited through its activity.
    expect(report.placesVisited).toBe(2)
    expect(report.ideas.map((i) => i.name)).toEqual(['Pastéis de Belém', 'Serralves'])
    expect(report.ideas[0]).toEqual({ id: 'spot0004', name: 'Pastéis de Belém', category: 'food', city: 'Lisbon', mustSee: true })
  })

  it('treats a place planned for later as neither visited nor an idea', () => {
    const before = buildReport(lisbon(), Date.parse('2027-03-12T12:00:00.000Z'))
    expect(before.placesVisited).toBe(1)
    expect(before.ideas.map((i) => i.name)).toEqual(['Pastéis de Belém', 'Serralves'])
  })

  it('picks a photo a day', () => {
    expect(report.photos).toEqual({ count: 4, highlights: ['pic00001', 'pic00003'] })
  })
})

describe('photo highlights', () => {
  it('spread over the trip when there are more days than room', () => {
    const photos = Array.from({ length: 30 }, (_, i) => ({ id: `pic${String(i).padStart(5, '0')}`, day: `2027-04-${String(i + 1).padStart(2, '0')}` }))
    const picked = pickHighlights(photos)
    expect(picked).toHaveLength(12)
    expect(picked[0]).toBe('pic00000')
    expect(picked.at(-1)).toBe('pic00029')
    expect(new Set(picked).size).toBe(12)
  })
})

describe('best and worst', () => {
  const item = (title: string, average?: number): ReportItem => ({ table: 'activities', id: `${title}-0001`, kind: 'activity', title, average, reviews: [] })

  it('splits the reviews into the best, the ones not worth it, and the rest', () => {
    const items = [item('A', 5), item('B', 4.2), item('C', 3), item('D', 2), item('E', 1), item('F')]
    const { best, worst, rest } = bestAndWorst(items)
    expect(best.map((i) => i.title)).toEqual(['A', 'B'])
    expect(worst.map((i) => i.title)).toEqual(['E', 'D'])
    expect(rest.map((i) => i.title)).toEqual(['C', 'F'])
  })

  it('keeps at most three of each', () => {
    const { best, rest } = bestAndWorst([item('A', 5), item('B', 5), item('C', 4.5), item('D', 4)])
    expect(best.map((i) => i.title)).toEqual(['A', 'B', 'C'])
    expect(rest.map((i) => i.title)).toEqual(['D'])
  })
})

describe('a kept report', () => {
  const report = buildReport(lisbon(), AFTER)

  it('reads back as it was made', () => {
    expect(readReport(json(report))).toEqual(json(report))
  })

  it("isn't read when it's in another format or isn't a report", () => {
    expect(readReport({ ...json(report), format: REPORT_FORMAT + 1 })).toBeUndefined()
    expect(readReport({ ...json(report), trip: { name: 'x' } })).toBeUndefined()
    expect(readReport({ ...json(report), madeAt: 'yesterday' })).toBeUndefined()
    expect(readReport(null)).toBeUndefined()
    expect(readReport('report')).toBeUndefined()
    expect(readReport([report])).toBeUndefined()
  })

  it('leaves out the parts that are broken, keeping the rest', () => {
    const broken = {
      ...json(report),
      days: -3,
      travellers: ['Ana', 7, null],
      money: { total: 'lots', people: [{ id: ANA, name: 'Ana', paid: 3 }], byCategory: 'food', toSettle: [null, 'x', { from: 'Ana', to: 'Bo', amount: -5 }] },
      reviewed: [{ title: 5 }, 'x', null, { ...report.reviewed[0], average: 9, reviews: [{ by: ANA }, { by: BO, name: 'Bo', stars: 0, note: 42 }] }],
      stays: {},
      journeys: [],
      busiestDay: 'monday',
      photos: { count: 2, highlights: ['pic00001', 3] },
    }
    const read = readReport(broken)!
    expect(read.days).toBe(0)
    expect(read.travellers).toEqual(['Ana'])
    expect(read.money).toMatchObject({ total: 0, people: [], byCategory: [], toSettle: [] })
    expect(read.reviewed).toHaveLength(1)
    expect(read.reviewed[0]).toMatchObject({ title: 'Fado night', average: undefined, reviews: [{ by: BO, name: 'Bo', stars: undefined, note: undefined }] })
    expect(read.stays).toEqual([])
    expect(read.journeys).toEqual({ count: 0, byMode: [], minutes: 0, untimed: 0, longest: undefined })
    expect(read.busiestDay).toBeUndefined()
    expect(read.photos).toEqual({ count: 2, highlights: ['pic00001'] })
    expect(read.cities).toEqual(['Lisbon', 'Porto'])
  })

  it('never breaks on whatever is in it', () => {
    const junk = [0, '', true, [], {}, [[]], { a: { b: [1, 'c'] } }, 'x'.repeat(50)]
    for (const value of junk) {
      for (const key of Object.keys(report)) {
        if (key === 'format' || key === 'madeAt') continue
        expect(() => readReport({ ...json(report), [key]: value })).not.toThrow()
      }
    }
  })
})

describe('report ids', () => {
  it('are one per trip, the same on every phone', async () => {
    const id = await reportId('trip0001')
    expect(isId(id)).toBe(true)
    expect(await reportId('trip0001')).toBe(id)
    expect(await reportId('trip0002')).not.toBe(id)
  })
})

describe('changes since a report was made', () => {
  it('counts the records changed after it', () => {
    expect(changedSince([[stay({ updatedAt: T2 }), stay({ updatedAt: T1 })], [review({ updatedAt: T2 })]], T1)).toBe(2)
    expect(changedSince([[stay()]], T1)).toBe(0)
  })
})
