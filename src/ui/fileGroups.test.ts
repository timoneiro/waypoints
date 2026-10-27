import { describe, expect, it } from 'vitest'
import { type FileGroup, groupFiles, isFileGroup } from './fileGroups'

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
