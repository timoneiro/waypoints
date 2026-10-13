import { describe, expect, it } from 'vitest'
import { activity, ANA, BO, place, review, stay, transport, T1 } from '../test/fixtures'
import { isId } from './records'
import { averageStars, canReview, isOver, reviewId, reviewTargets, toReview, type ReviewTarget } from './reviews'

// Lisbon is on UTC in March 2027 (summer time starts on the 28th); Paris is an hour ahead.
const at = (iso: string) => Date.parse(iso)
const just = (iso: string) => at(iso) - 1

describe('when something can be reviewed', () => {
  it('an all-day activity from its day, and up for review that evening', () => {
    const fado: ReviewTarget = { table: 'activities', record: activity() }
    expect(canReview(fado, just('2027-03-11T00:00:00Z'))).toBe(false)
    expect(canReview(fado, at('2027-03-11T00:00:00Z'))).toBe(true)
    expect(isOver(fado, just('2027-03-11T18:00:00Z'))).toBe(false)
    expect(isOver(fado, at('2027-03-11T18:00:00Z'))).toBe(true)
  })

  it('a timed activity from its start, and up for review once it ends (or starts, without an end)', () => {
    const show: ReviewTarget = { table: 'activities', record: activity({ startTime: '21:00', endTime: '23:30' }) }
    expect(canReview(show, at('2027-03-11T21:00:00Z'))).toBe(true)
    expect(isOver(show, just('2027-03-11T23:30:00Z'))).toBe(false)
    expect(isOver(show, at('2027-03-11T23:30:00Z'))).toBe(true)
    expect(isOver({ table: 'activities', record: activity({ startTime: '21:00' }) }, at('2027-03-11T21:00:00Z'))).toBe(true)
  })

  it('a stay from its check-in day, and up for review at check-out', () => {
    const casa: ReviewTarget = { table: 'stays', record: stay() }
    expect(canReview(casa, just('2027-03-10T00:00:00Z'))).toBe(false)
    expect(canReview(casa, at('2027-03-10T00:00:00Z'))).toBe(true)
    expect(isOver(casa, just('2027-03-12T10:00:00Z'))).toBe(false)
    expect(isOver({ table: 'stays', record: stay({ checkOutTime: '12:00' }) }, just('2027-03-12T12:00:00Z'))).toBe(false)
    expect(isOver(casa, at('2027-03-12T10:00:00Z'))).toBe(true)
  })

  it('a journey from when it leaves, and up for review when it arrives, in the arrival time zone', () => {
    const flight: ReviewTarget = {
      table: 'transports',
      record: transport({ mode: 'flight', to: 'Paris', departTime: '08:00', arriveTime: '11:05', arriveTimeZone: 'Europe/Paris' }),
    }
    expect(canReview(flight, just('2027-03-12T08:00:00Z'))).toBe(false)
    expect(canReview(flight, at('2027-03-12T08:00:00Z'))).toBe(true)
    expect(isOver(flight, just('2027-03-12T10:05:00Z'))).toBe(false)
    expect(isOver(flight, at('2027-03-12T10:05:00Z'))).toBe(true)
    // Without an arrival time: over when it leaves the same day, or that evening without times at all.
    expect(isOver({ table: 'transports', record: transport({ departTime: '09:00' }) }, at('2027-03-12T09:00:00Z'))).toBe(true)
    expect(isOver({ table: 'transports', record: transport() }, just('2027-03-12T18:00:00Z'))).toBe(false)
    // An overnight train arriving at an unknown time: the evening it arrives.
    expect(isOver({ table: 'transports', record: transport({ departTime: '22:00', arriveDate: '2027-03-13' }) }, just('2027-03-13T18:00:00Z'))).toBe(false)
  })

  it('a place once someone has been there', () => {
    expect(canReview({ table: 'places', record: place() }, Infinity)).toBe(false)
    expect(isOver({ table: 'places', record: place() }, Infinity)).toBe(false)
    expect(canReview({ table: 'places', record: place({ visited: true }) }, 0)).toBe(true)
    expect(isOver({ table: 'places', record: place({ visited: true }) }, 0)).toBe(true)
  })
})

describe('what is left to review', () => {
  const trip = {
    activities: [activity(), activity({ id: 'todo0002', title: 'Tram 28', date: '2027-03-10', startTime: '10:00' })],
    places: [place({ visited: true }), place({ id: 'spot0002', name: 'Belém', visited: false })],
    stays: [stay()],
    transports: [transport()],
  }
  const targets = reviewTargets(trip)
  const ids = (list: ReviewTarget[]) => list.map((x) => x.record.id)
  const AFTER = at('2027-03-14T00:00:00Z')

  it('is everything over that this traveller has not reviewed, the latest first', () => {
    // The train (evening of the 12th), the stay (10:00 on the 12th), fado, the tram; the visited place last (no time: when it was changed).
    expect(ids(toReview(targets, [], ANA, AFTER))).toEqual(['move0001', 'stay0001', 'todo0001', 'todo0002', 'spot0001'])
    expect(ids(toReview(targets, [], ANA, at('2027-03-11T12:00:00Z')))).toEqual(['todo0002', 'spot0001'])
  })

  it('leaves out what they rated, wrote about or missed, but not what others reviewed', () => {
    const reviews = [
      review(),
      review({ id: 'rate0002', itemTable: 'stays', itemId: 'stay0001', stars: undefined, missed: true }),
      review({ id: 'rate0003', itemTable: 'places', itemId: 'spot0001', stars: undefined, note: 'Queue round the block' }),
      review({ id: 'rate0004', itemTable: 'transports', itemId: 'move0001', by: BO }),
      review({ id: 'rate0005', itemId: 'todo0002', deletedAt: T1 }),
    ]
    expect(ids(toReview(targets, reviews, ANA, AFTER))).toEqual(['move0001', 'todo0002'])
    expect(ids(toReview(targets, reviews, BO, AFTER))).toEqual(['stay0001', 'todo0001', 'todo0002', 'spot0001'])
  })

  it('matches reviews by table and id', () => {
    expect(ids(toReview(targets, [review({ itemTable: 'stays' })], ANA, AFTER))).toContain('todo0001')
  })

  it('asks about a place in the plan through its activities only', () => {
    const planned = reviewTargets({ ...trip, activities: [...trip.activities, activity({ id: 'todo0003', placeId: 'spot0001', date: '2027-03-12' })] })
    expect(ids(toReview(planned, [], ANA, AFTER))).not.toContain('spot0001')
    expect(ids(toReview(planned, [], ANA, AFTER))).toContain('todo0003')
  })

  it('is everything over when nobody has said who uses this phone', () => {
    expect(toReview(targets, [review()], undefined, AFTER)).toHaveLength(5)
  })
})

describe('reviews', () => {
  it('average the stars of those who gave some', () => {
    expect(averageStars([])).toBeUndefined()
    expect(averageStars([review({ stars: 5 }), review({ stars: 4 }), review({ stars: undefined, missed: true }), review({ stars: 1, deletedAt: T1 })])).toBe(4.5)
  })

  it('have one id per traveller and item, the same on every phone', async () => {
    const id = await reviewId('trip0001', 'todo0001', ANA)
    expect(isId(id)).toBe(true)
    expect(id).toHaveLength(16)
    expect(await reviewId('trip0001', 'todo0001', ANA)).toBe(id)
    expect(await reviewId('trip0001', 'todo0001', BO)).not.toBe(id)
    expect(await reviewId('trip0001', 'todo0002', ANA)).not.toBe(id)
  })

  it('keep the ids they have always had', async () => {
    // Made by 0.8.0: a different id would give everyone who reviewed again a second review.
    expect(await reviewId('trip0001', 'todo0001', ANA)).toBe('b7tL9HjvVdL_kgBn')
  })
})
