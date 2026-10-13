import { describe, expect, it } from 'vitest'
import { transport } from '../test/fixtures'
import { bookingKey, bookingLegs, legNoun, route } from './bookings'

const leg1 = transport({
  id: 'move0001',
  mode: 'flight',
  from: 'Lisbon (LIS)',
  to: 'Frankfurt (FRA)',
  departDate: '2027-03-10',
  departTime: '07:00',
  confirmation: 'abc 123',
})
const leg2 = transport({
  id: 'move0002',
  mode: 'flight',
  from: 'Frankfurt (FRA)',
  to: 'Tokyo (NRT)',
  departDate: '2027-03-10',
  departTime: '10:00',
  departTimeZone: 'Europe/Berlin',
  confirmation: 'ABC-123',
})
const early = transport({ id: 'move0003', mode: 'flight', from: 'Porto', to: 'Lisbon', departDate: '2027-03-10', departTime: '08:30', confirmation: 'XYZ999' })
const train = transport({ id: 'move0004', from: 'Tokyo', to: 'Kyoto', departDate: '2027-03-12', confirmation: 'ABC123' })

describe('bookings', () => {
  it('match booking refs however they were typed', () => {
    expect(bookingKey(' abc-12 3 ')).toBe('ABC123')
    expect(bookingKey('')).toBeUndefined()
    expect(bookingKey('  ')).toBeUndefined()
    expect(bookingKey(undefined)).toBeUndefined()
  })

  it('list the journeys of one booking in the order they leave', () => {
    expect(bookingLegs([train, leg2, early, leg1], 'ABC123').map((r) => r.id)).toEqual(['move0001', 'move0002', 'move0004'])
    expect(bookingLegs([leg1, leg2], undefined)).toEqual([])
  })

  it('order journeys by when they really leave, not by the wall clock', () => {
    // 21:00 in Tokyo is 12:00 UTC; 19:00 in Frankfurt the same day is 18:00 UTC.
    const tokyo = transport({ id: 'move0005', departDate: '2027-03-20', departTime: '21:00', departTimeZone: 'Asia/Tokyo', confirmation: 'R1' })
    const frankfurt = transport({ id: 'move0006', departDate: '2027-03-20', departTime: '19:00', departTimeZone: 'Europe/Berlin', confirmation: 'R1' })
    expect(bookingLegs([frankfurt, tokyo], 'R1').map((r) => r.id)).toEqual(['move0005', 'move0006'])
  })

  it('call them flights only when they all are', () => {
    expect(legNoun([leg1, leg2])).toBe('flight')
    expect(legNoun([leg1, train])).toBe('journey')
  })

  it("read as a route, with airport codes for flights and a comma where one doesn't start where the last ended", () => {
    expect(route([leg1, leg2])).toBe('LIS → FRA → NRT')
    expect(route([leg1, leg2, train])).toBe('LIS → FRA → NRT, Tokyo → Kyoto')
    expect(route([transport({ from: 'Lisbon', to: 'Porto' }), transport({ from: 'porto ', to: 'Faro' })])).toBe('Lisbon → Porto → Faro')
  })
})
