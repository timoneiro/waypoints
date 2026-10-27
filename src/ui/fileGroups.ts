import type { AttachableTable } from '../db/types'

/** What a file belongs to: the whole trip, or one kind of item. */
export type FileGroup = 'trip' | AttachableTable

export const FILE_GROUPS: { key: FileGroup; label: string }[] = [
  { key: 'trip', label: 'Whole trip' },
  { key: 'stays', label: 'Stays' },
  { key: 'transports', label: 'Journeys' },
  { key: 'activities', label: 'Activities' },
  { key: 'places', label: 'Places' },
  { key: 'expenses', label: 'Expenses' },
]

export const isFileGroup = (s: string | undefined): s is FileGroup => FILE_GROUPS.some((g) => g.key === s)

/** Splits files into the groups they belong to, in FILE_GROUPS order. Empty groups are left out. */
export function groupFiles<T>(
  list: T[],
  groupOf: (x: T) => FileGroup,
): { group: FileGroup; label: string; items: T[] }[] {
  const result: { group: FileGroup; label: string; items: T[] }[] = []
  for (const { key, label } of FILE_GROUPS) {
    const items = list.filter((x) => groupOf(x) === key)
    if (items.length > 0) result.push({ group: key, label, items })
  }
  return result
}
