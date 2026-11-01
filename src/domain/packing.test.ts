import { describe, expect, it } from 'vitest'
import type { PackingItem } from '../db/types.ts'
import { newFromTemplate, progress, sortedItems, TEMPLATES, type Template } from './packing.ts'

const item = (id: string, text: string, over: Partial<PackingItem> = {}): PackingItem => ({
  id,
  tripId: 'trip0001',
  text,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...over,
})

const template = (items: string[]): Template => ({ id: 'beach', label: 'Beach', items })

describe('sortedItems', () => {
  it('lists unticked items before ticked ones, each group by when it was added', () => {
    const items = [
      item('a', 'Charger', { packed: true, createdAt: '2026-10-01T09:00:00.000Z' }),
      item('b', 'Sunscreen', { createdAt: '2026-10-01T11:00:00.000Z' }),
      item('c', 'Adaptor', { createdAt: '2026-10-01T10:00:00.000Z' }),
    ]
    expect(sortedItems(items).map((i) => i.id)).toEqual(['c', 'b', 'a'])
  })

  it('orders items added at the same time (a template) alphabetically, ignoring case', () => {
    const same = '2026-10-01T10:00:00.000Z'
    const items = [item('1', 'hat', { createdAt: same }), item('2', 'Beach towel', { createdAt: same }), item('3', 'Sunscreen', { createdAt: same })]
    expect(sortedItems(items).map((i) => i.text)).toEqual(['Beach towel', 'hat', 'Sunscreen'])
  })

  it('breaks a tie on text and then on id', () => {
    const same = '2026-10-01T10:00:00.000Z'
    const items = [item('z', 'Hat', { createdAt: same }), item('y', 'hat', { createdAt: same }), item('x', 'Hat', { createdAt: same })]
    expect(sortedItems(items).map((i) => i.id)).toEqual(['x', 'y', 'z'])
  })

  it('does not change the array it is given', () => {
    const items = [item('b', 'B', { createdAt: '2026-10-01T11:00:00.000Z' }), item('a', 'A')]
    sortedItems(items)
    expect(items.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('leaves out deleted items, and is empty for an empty list', () => {
    expect(sortedItems([])).toEqual([])
    const gone = item('g', 'Gone', { deletedAt: '2026-10-02T10:00:00.000Z' })
    expect(sortedItems([gone, item('k', 'Kept')]).map((i) => i.id)).toEqual(['k'])
  })
})

describe('newFromTemplate', () => {
  it('returns every item of the template when the list is empty, in template order', () => {
    expect(newFromTemplate([], template(['Sunscreen', 'Hat']))).toEqual(['Sunscreen', 'Hat'])
  })

  it('skips items already on the list, ticked or not, ignoring case and surrounding spaces', () => {
    const existing = [item('1', '  sunscreen '), item('2', 'Hat', { packed: true })]
    expect(newFromTemplate(existing, template(['Sunscreen', 'hat', 'Towel']))).toEqual(['Towel'])
  })

  it('adds nothing when every item is already there, so adding a template twice does not duplicate', () => {
    const beach = TEMPLATES.find((t) => t.id === 'beach')!
    const once = newFromTemplate([], beach).map((text, i) => item(String(i), text))
    expect(newFromTemplate(once, beach)).toEqual([])
  })

  it('does not count a deleted item as on the list', () => {
    const gone = item('g', 'Hat', { deletedAt: '2026-10-02T10:00:00.000Z' })
    expect(newFromTemplate([gone], template(['Hat']))).toEqual(['Hat'])
  })

  it('trims the template items it returns', () => {
    expect(newFromTemplate([], template(['  Towel  ']))).toEqual(['Towel'])
  })

  it('every built-in template has its own label and about ten items with no repeats', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['beach', 'city', 'hiking', 'skiing'])
    for (const t of TEMPLATES) {
      expect(t.label).toBeTruthy()
      expect(t.items.length).toBeGreaterThanOrEqual(8)
      const keys = t.items.map((text) => text.trim().toLowerCase())
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('progress', () => {
  it('counts packed items out of all items', () => {
    const items = [item('1', 'A', { packed: true }), item('2', 'B'), item('3', 'C', { packed: true })]
    expect(progress(items)).toEqual({ packed: 2, total: 3 })
  })

  it('is zero of zero for an empty list', () => {
    expect(progress([])).toEqual({ packed: 0, total: 0 })
  })

  it('leaves out deleted items', () => {
    const items = [item('1', 'A', { packed: true, deletedAt: '2026-10-02T10:00:00.000Z' }), item('2', 'B')]
    expect(progress(items)).toEqual({ packed: 0, total: 1 })
  })
})
