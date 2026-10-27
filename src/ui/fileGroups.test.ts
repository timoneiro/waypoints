import { describe, expect, it } from 'vitest'
import type { ItemRef } from './attachments'
import { type FileGroup, groupFiles, isFileGroup, sectionFiles } from './fileGroups'

type F = { id: string; group: FileGroup }

describe('groupFiles', () => {
  it('gives an empty list for no files', () => {
    expect(groupFiles<F>([], (f) => f.group)).toEqual([])
  })

  it('puts groups in FILE_GROUPS order and keeps the input order inside each group', () => {
    const list: F[] = [
      { id: 'a', group: 'expenses' },
      { id: 'b', group: 'trip' },
      { id: 'c', group: 'transports' },
      { id: 'd', group: 'trip' },
      { id: 'e', group: 'stays' },
      { id: 'f', group: 'expenses' },
    ]
    expect(groupFiles(list, (f) => f.group)).toEqual([
      { group: 'trip', label: 'Whole trip', items: [list[1], list[3]] },
      { group: 'stays', label: 'Stays', items: [list[4]] },
      { group: 'transports', label: 'Journeys', items: [list[2]] },
      { group: 'expenses', label: 'Expenses', items: [list[0], list[5]] },
    ])
  })

  it('leaves out groups without items', () => {
    const list: F[] = [{ id: 'a', group: 'activities' }]
    const result = groupFiles(list, (f) => f.group)
    expect(result.map((g) => g.group)).toEqual(['activities'])
    expect(result[0].label).toBe('Activities')
  })
})

describe('isFileGroup', () => {
  it('accepts the file groups', () => {
    expect(isFileGroup('trip')).toBe(true)
    expect(isFileGroup('transports')).toBe(true)
  })

  it('rejects other values', () => {
    expect(isFileGroup('photos')).toBe(false)
    expect(isFileGroup(undefined)).toBe(false)
  })
})

describe('sectionFiles', () => {
  const ref = (table: ItemRef['table'], id: string, title: string, day?: string, booking?: boolean): ItemRef =>
    ({
      table,
      id,
      emoji: '🎟️',
      title,
      day,
      path: `/${table}/${id}`,
      booking: booking ? ({} as ItemRef['booking']) : undefined,
    }) as ItemRef
  type P = { n: string; owner?: ItemRef }
  const run = (list: P[]) => sectionFiles(list, (p) => p.owner)

  it('gives an empty list for no files', () => {
    expect(run([])).toEqual([])
  })

  it('sorts sections by day, earlier first', () => {
    const late: P = { n: '1', owner: ref('activities', 'b', 'Late', '2026-05-02') }
    const early: P = { n: '2', owner: ref('activities', 'a', 'Early', '2026-05-01') }
    const result = run([late, early])
    expect(result).toHaveLength(1)
    expect(result[0].group).toBe('activities')
    expect(result[0].sections.map((s) => s.title)).toEqual(['Early', 'Late'])
  })

  it('puts places without a day after dated ones and sorts undated by name', () => {
    const result = run([
      { n: '1', owner: ref('places', 'z', 'Zoo') },
      { n: '2', owner: ref('places', 'c', 'Cafe') },
      { n: '3', owner: ref('places', 'd', 'Dated', '2026-05-01') },
    ])
    expect(result[0].sections.map((s) => s.title)).toEqual(['Dated', 'Cafe', 'Zoo'])
  })

  it('keeps a whole booking apart from the journey with the same id', () => {
    const result = run([
      { n: '1', owner: ref('transports', 'j1', 'LIS → NRT', '2026-05-01', true) },
      { n: '2', owner: ref('transports', 'j1', 'Lisbon → Frankfurt', '2026-05-01') },
    ])
    expect(result[0].sections.map((s) => s.key).sort()).toEqual(['booking:j1', 'transports:j1'])
    expect(result[0].sections.find((s) => s.key === 'booking:j1')?.seeAll).toEqual(['photos', 'booking', 'j1'])
    expect(result[0].sections.find((s) => s.key === 'transports:j1')?.seeAll).toEqual(['photos', 'transports', 'j1'])
  })

  it('puts files without an owner in the whole trip', () => {
    const result = run([{ n: '1' }])
    expect(result).toHaveLength(1)
    expect(result[0].group).toBe('trip')
    expect(result[0].sections).toHaveLength(1)
    expect(result[0].sections[0].key).toBe('trip')
    expect(result[0].sections[0].title).toBe('Whole trip')
    expect(result[0].sections[0].emoji).toBeUndefined()
    expect(result[0].sections[0].seeAll).toEqual(['photos', 'trip'])
  })

  it('keeps the input order inside a section', () => {
    const o = ref('activities', 'a', 'A', '2026-05-01')
    const list: P[] = [
      { n: '1', owner: o },
      { n: '2', owner: o },
      { n: '3', owner: o },
    ]
    expect(run(list)[0].sections[0].items).toEqual(list)
  })
})
