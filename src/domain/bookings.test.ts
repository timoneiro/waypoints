import { describe, expect, it } from 'vitest'
import type { Transport } from '../db/types.ts'
import { T1, transport } from '../test/fixtures'
import { bookingKey, bookingLegs, connections, legNoun, route } from './bookings'

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

describe('connections', () => {
  const flight = (over: Partial<Transport>) => transport({ mode: 'flight', confirmation: 'K1', ...over })
  // LIS 08:10 → FRA 10:40, then FRA 12:50 → NRT 07:30 the next day: a 2h 10m layover in FRA.
  const lisToFra = flight({
    id: 'conn0001',
    from: 'Lisbon (LIS)',
    to: 'Frankfurt (FRA)',
    departDate: '2027-03-10',
    departTime: '08:10',
    departTimeZone: 'Europe/Lisbon',
    arriveTime: '10:40',
    arriveTimeZone: 'Europe/Berlin',
  })
  const fraToNrt = flight({
    id: 'conn0002',
    from: 'Frankfurt (FRA)',
    to: 'Tokyo (NRT)',
    departDate: '2027-03-10',
    departTime: '12:50',
    departTimeZone: 'Europe/Berlin',
    arriveDate: '2027-03-11',
    arriveTime: '07:30',
    arriveTimeZone: 'Asia/Tokyo',
  })

  it('show a pair on one ref with its layover', () => {
    expect(connections([fraToNrt, lisToFra])).toEqual([
      {
        key: 'conn0001',
        legs: [lisToFra, fraToNrt],
        route: 'LIS → FRA → NRT',
        stops: 1,
        joins: [{ layoverMinutes: 130, place: 'FRA', warnings: [] }],
      },
    ])
  })

  it('measure a layover across time zones on the real timeline', () => {
    const arrives = flight({ id: 'conn0003', to: 'Frankfurt (FRA)', departDate: '2027-03-10', arriveTime: '10:40', arriveTimeZone: 'Europe/London' })
    const leaves = flight({ id: 'conn0004', from: 'Frankfurt (FRA)', departDate: '2027-03-10', departTime: '12:50', departTimeZone: 'Europe/Berlin' })
    expect(connections([arrives, leaves])[0].joins[0].layoverMinutes).toBe(70)
  })

  it('leave the layover out when an arrival time is missing, without a warning', () => {
    const noArrival = { ...lisToFra, arriveTime: undefined }
    const [connection] = connections([noArrival, fraToNrt])
    expect(connection.joins[0]).toEqual({ layoverMinutes: undefined, place: 'FRA', warnings: [] })
  })

  it('warn when the next leg leaves before the previous one arrives', () => {
    const early = { ...fraToNrt, departTime: '10:00' }
    const [connection] = connections([lisToFra, early])
    expect(connection.joins[0]).toEqual({ layoverMinutes: -40, place: 'FRA', warnings: ['Leg 2 leaves before leg 1 arrives'] })
  })

  it('warn when the next leg leaves from another place, with airport codes for flights', () => {
    const elsewhere = { ...fraToNrt, from: 'Munich (MUC)' }
    const [connection] = connections([lisToFra, elsewhere])
    expect(connection.route).toBe('LIS → FRA, MUC → NRT')
    expect(connection.joins[0]).toEqual({ layoverMinutes: 130, place: 'FRA', warnings: ['Leg 2 leaves from MUC but leg 1 arrives in FRA'] })
  })

  it('give both warnings on one join when the place and the time are both wrong', () => {
    const wrong = { ...fraToNrt, from: 'Munich (MUC)', departTime: '10:00' }
    const [connection] = connections([lisToFra, wrong])
    expect(connection.joins[0].warnings).toEqual(['Leg 2 leaves from MUC but leg 1 arrives in FRA', 'Leg 2 leaves before leg 1 arrives'])
  })

  it('keep a gap of exactly 1440 minutes in one connection', () => {
    const nextDay = { ...fraToNrt, departDate: '2027-03-11', departTime: '10:00' }
    const arrives = { ...lisToFra, arriveTime: '10:00' }
    expect(connections([arrives, nextDay])).toHaveLength(1)
  })

  it('split a gap of 1441 minutes', () => {
    const nextDay = { ...fraToNrt, departDate: '2027-03-11', departTime: '10:01' }
    const arrives = { ...lisToFra, arriveTime: '10:00' }
    expect(connections([arrives, nextDay])).toEqual([])
  })

  it('show nothing for a flight there and back ten days apart with no times', () => {
    const there = flight({ id: 'conn0005', from: 'Lisbon (LIS)', to: 'Frankfurt (FRA)', departDate: '2027-03-10' })
    const back = flight({ id: 'conn0006', from: 'Frankfurt (FRA)', to: 'Lisbon (LIS)', departDate: '2027-03-20' })
    expect(connections([there, back])).toEqual([])
  })

  it('show a connection each way as two, each with its own route', () => {
    const nrtToFra = flight({
      id: 'conn0007',
      from: 'Tokyo (NRT)',
      to: 'Frankfurt (FRA)',
      departDate: '2027-03-24',
      departTime: '10:00',
      departTimeZone: 'Asia/Tokyo',
      arriveDate: '2027-03-24',
      arriveTime: '17:00',
      arriveTimeZone: 'Europe/Berlin',
    })
    const fraToLis = flight({
      id: 'conn0008',
      from: 'Frankfurt (FRA)',
      to: 'Lisbon (LIS)',
      departDate: '2027-03-24',
      departTime: '19:00',
      departTimeZone: 'Europe/Berlin',
      arriveTime: '21:00',
      arriveTimeZone: 'Europe/Lisbon',
    })
    const found = connections([fraToLis, nrtToFra, fraToNrt, lisToFra])
    expect(found.map((c) => c.route)).toEqual(['LIS → FRA → NRT', 'NRT → FRA → LIS'])
    expect(found.map((c) => c.joins[0].layoverMinutes)).toEqual([130, 120])
  })

  it('count three legs as two stops and two joins', () => {
    const onward = flight({
      id: 'conn0009',
      from: 'Tokyo (NRT)',
      to: 'Osaka (KIX)',
      departDate: '2027-03-11',
      departTime: '10:00',
      departTimeZone: 'Asia/Tokyo',
    })
    const [connection] = connections([onward, fraToNrt, lisToFra])
    expect(connection.route).toBe('LIS → FRA → NRT → KIX')
    expect(connection.stops).toBe(2)
    expect(connection.joins.map((j) => [j.place, j.layoverMinutes])).toEqual([
      ['FRA', 130],
      ['NRT', 150],
    ])
  })

  it('show nothing for a single journey', () => {
    expect(connections([lisToFra])).toEqual([])
  })

  it('show nothing for journeys with no booking ref', () => {
    expect(connections([{ ...lisToFra, confirmation: undefined }, { ...fraToNrt, confirmation: undefined }])).toEqual([])
  })

  it('ignore a deleted journey', () => {
    expect(connections([lisToFra, { ...fraToNrt, deletedAt: T1 }])).toEqual([])
  })

  it('match refs that differ only in case, spacing or hyphens', () => {
    const [connection] = connections([{ ...lisToFra, confirmation: 'k 1' }, { ...fraToNrt, confirmation: 'K-1' }])
    expect(connection.legs.map((r) => r.id)).toEqual(['conn0001', 'conn0002'])
  })
})
