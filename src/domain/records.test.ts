import { describe, expect, it } from 'vitest'
import { checkRecord } from './records.ts'

const place = {
  id: 'place-0001',
  tripId: 'trip-0001',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: 'Torre dos Clérigos',
  category: 'sight',
}

describe('checkRecord places', () => {
  it('accepts a place with coordinates', () => {
    expect(() => checkRecord('places', { ...place, lat: 41.1456705, lng: -8.6145977 })).not.toThrow()
  })
  it('accepts a place without coordinates', () => {
    expect(() => checkRecord('places', place)).not.toThrow()
  })
  it('rejects coordinates out of range or not numbers', () => {
    expect(() => checkRecord('places', { ...place, lat: 91, lng: 0 })).toThrow()
    expect(() => checkRecord('places', { ...place, lat: '41', lng: 0 })).toThrow()
    expect(() => checkRecord('places', { ...place, lat: 0, lng: 181 })).toThrow()
  })
})

describe('checkRecord packing items', () => {
  const item = {
    id: 'pack-0001',
    tripId: 'trip-0001',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    text: 'Charger',
  }
  it('accepts a valid item', () => {
    expect(() => checkRecord('packingItems', item)).not.toThrow()
    expect(() => checkRecord('packingItems', { ...item, packed: true, bringer: 'ana-0001' })).not.toThrow()
  })
  it('rejects a missing text', () => {
    const { text: _text, ...without } = item
    expect(() => checkRecord('packingItems', without)).toThrow('It contains an invalid packing item.')
  })
  it('rejects a 500-character text', () => {
    expect(() => checkRecord('packingItems', { ...item, text: 'a'.repeat(500) })).toThrow('It contains an invalid packing item.')
  })
})
