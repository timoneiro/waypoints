import { describe, expect, it } from 'vitest'
import { activity, stay, transport, trip } from '../test/fixtures'
import { buildPlan, nextUp, planEntries, tripPhase, zoneOnDay } from './itinerary'
import { zonedInstant } from './time'

const lisbon = stay({ id: 'stay0001', name: 'Casa Azul', checkInDate: '2027-03-10', checkInTime: '15:00', checkOutDate: '2027-03-12', checkOutTime: '11:00' })
const porto = stay({ id: 'stay0002', name: 'Porto Lodge', checkInDate: '2027-03-12', checkOutDate: '2027-03-14' })
const flight = transport({
  id: 'move0001',
  mode: 'flight',
  from: 'New York',
  to: 'Lisbon',
  departDate: '2027-03-09',
  departTime: '22:00',
  departTimeZone: 'America/New_York',
  arriveDate: '2027-03-10',
  arriveTime: '09:30',
  arriveTimeZone: 'Europe/Lisbon',
})
const train = transport({ id: 'move0002', departDate: '2027-03-12', departTime: '09:00', arriveTime: '12:00' })
const fado = activity({ id: 'todo0001', title: 'Fado night', date: '2027-03-11', startTime: '19:00' })
const museums = activity({ id: 'todo0002', title: 'Museum day', date: '2027-03-11' })

const plan = buildPlan(trip(), [lisbon, porto], [flight, train], [fado, museums])
const summary = (day: string) =>
  plan.find((d) => d.day === day)!.entries.map((e) => `${e.kind}:${'title' in e.record ? e.record.title : 'name' in e.record ? e.record.name : e.record.to}`)

describe('buildPlan', () => {
  it('covers the trip, plus days outside it that have something planned', () => {
    expect(plan.map((d) => [d.day, d.number, d.inTrip])).toEqual([
      ['2027-03-09', 0, false],
      ['2027-03-10', 1, true],
      ['2027-03-11', 2, true],
      ['2027-03-12', 3, true],
      ['2027-03-13', 4, true],
      ['2027-03-14', 5, false],
    ])
  })

  it('puts each entry on its own local day, in real-time order', () => {
    expect(summary('2027-03-09')).toEqual(['transport:Lisbon'])
    expect(summary('2027-03-10')).toEqual(['arrival:Lisbon', 'checkin:Casa Azul'])
    // An untimed activity comes before timed ones; an untimed check-in counts as the afternoon.
    expect(summary('2027-03-11')).toEqual(['activity:Museum day', 'activity:Fado night'])
    expect(summary('2027-03-12')).toEqual(['transport:Porto', 'checkout:Casa Azul', 'checkin:Porto Lodge'])
    expect(summary('2027-03-13')).toEqual([])
    expect(summary('2027-03-14')).toEqual(['checkout:Porto Lodge'])
  })

  it('knows where you sleep each night', () => {
    expect(plan.map((d) => d.night?.name)).toEqual([undefined, 'Casa Azul', 'Casa Azul', 'Porto Lodge', 'Porto Lodge', undefined])
  })
})

describe('tripPhase', () => {
  const t = trip({ startDate: '2027-03-10', endDate: '2027-03-13' })
  it('counts down, counts days, and looks back', () => {
    expect(tripPhase(t, '2027-03-01')).toEqual({ phase: 'upcoming', daysToGo: 9 })
    expect(tripPhase(t, '2027-03-10')).toEqual({ phase: 'ongoing', day: 1, length: 4 })
    expect(tripPhase(t, '2027-03-13')).toEqual({ phase: 'ongoing', day: 4, length: 4 })
    expect(tripPhase(t, '2027-03-20')).toEqual({ phase: 'past', daysAgo: 7 })
  })
})

describe('nextUp', () => {
  it('finds the next timed entry that has not started', () => {
    const entries = planEntries([lisbon, porto], [flight, train], [fado, museums])
    const noonInLisbon = zonedInstant('2027-03-11', '12:00', 'Europe/Lisbon')
    expect(nextUp(entries, '2027-03-11', noonInLisbon)?.record.id).toBe('todo0001')
    const lateEvening = zonedInstant('2027-03-11', '21:00', 'Europe/Lisbon')
    expect(nextUp(entries, '2027-03-11', lateEvening)?.record.id).toBe('move0002')
  })
})

describe('zoneOnDay', () => {
  // Lisbon, then a flight to Tokyo (arriving the next day), a stay in Kyoto, and a flight home.
  const toTokyo = transport({
    id: 'move0010',
    mode: 'flight',
    departDate: '2027-04-01',
    departTime: '13:00',
    departTimeZone: 'Europe/Lisbon',
    arriveDate: '2027-04-02',
    arriveTime: '09:00',
    arriveTimeZone: 'Asia/Tokyo',
  })
  const kyoto = stay({ id: 'stay0010', checkInDate: '2027-04-05', checkOutDate: '2027-04-09', timeZone: 'Asia/Tokyo' })
  const home = transport({ id: 'move0011', mode: 'flight', departDate: '2027-04-09', departTimeZone: 'Asia/Tokyo', arriveTimeZone: 'Europe/Lisbon' })
  const zone = (day: string) => zoneOnDay(day, [kyoto], [toTokyo, home])

  it('follows the journeys: the day after flying to Japan is in Japan', () => {
    expect(zone('2027-04-02')).toBe('Asia/Tokyo')
    expect(zone('2027-04-03')).toBe('Asia/Tokyo')
    expect(zone('2027-04-06')).toBe('Asia/Tokyo')
    // Arriving home the same day: that day is home's.
    expect(zone('2027-04-09')).toBe('Europe/Lisbon')
    expect(zone('2027-04-20')).toBe('Europe/Lisbon')
  })

  it('before anything arrives, is where the first journey leaves from', () => {
    expect(zone('2027-04-01')).toBe('Europe/Lisbon')
    expect(zone('2027-03-20')).toBe('Europe/Lisbon')
  })

  it('counts stays too, so a trip without journeys still moves with its stays', () => {
    const tokyo = stay({ id: 'stay0011', checkInDate: '2027-04-02', checkOutDate: '2027-04-05', timeZone: 'Asia/Tokyo' })
    const seoul = stay({ id: 'stay0012', checkInDate: '2027-04-05', checkOutDate: '2027-04-08', timeZone: 'Asia/Seoul' })
    expect(zoneOnDay('2027-04-01', [tokyo, seoul], [])).toBe('Asia/Tokyo')
    expect(zoneOnDay('2027-04-04', [tokyo, seoul], [])).toBe('Asia/Tokyo')
    expect(zoneOnDay('2027-04-05', [tokyo, seoul], [])).toBe('Asia/Seoul')
    // A later arrival on the same day wins over an earlier check-in.
    const ferry = transport({ id: 'move0012', departDate: '2027-04-05', departTime: '18:00', arriveTime: '21:00', departTimeZone: 'Asia/Seoul', arriveTimeZone: 'Asia/Tokyo' })
    expect(zoneOnDay('2027-04-05', [tokyo, seoul], [ferry])).toBe('Asia/Tokyo')
  })

  it('has nothing to say about an empty plan', () => {
    expect(zoneOnDay('2027-04-01', [], [])).toBeUndefined()
  })
})
