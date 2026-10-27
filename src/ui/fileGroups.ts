import type { AttachableTable } from '../db/types'
import type { ItemRef } from './attachments'

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

/** One item's (or the whole trip's, or a whole booking's) files inside a kind. */
export interface FileSection<T> {
  key: string
  title: string
  emoji?: string
  /** Path parts, after the trip, of the page with all this section's photos. */
  seeAll: string[]
  items: T[]
}

export interface KindSections<T> {
  group: FileGroup
  label: string
  sections: FileSection<T>[]
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Splits files into kinds (FILE_GROUPS order, empty ones left out), and each kind into one section per
 * item. Sections go by the item's day (none last), then title; files keep their input order.
 */
export function sectionFiles<T>(list: T[], ownerOf: (x: T) => ItemRef | undefined): KindSections<T>[] {
  const sections = new Map<string, FileSection<T> & { group: FileGroup; day?: string }>()
  for (const x of list) {
    const owner = ownerOf(x)
    const group: FileGroup = owner?.table ?? 'trip'
    const key = !owner ? 'trip' : owner.booking ? `booking:${owner.id}` : `${owner.table}:${owner.id}`
    let section = sections.get(key)
    if (!section) {
      section = {
        key,
        group,
        day: owner?.day,
        title: owner ? owner.title : 'Whole trip',
        emoji: owner?.emoji,
        seeAll: !owner
          ? ['photos', 'trip']
          : owner.booking
            ? ['photos', 'booking', owner.id]
            : ['photos', owner.table, owner.id],
        items: [],
      }
      sections.set(key, section)
    }
    section.items.push(x)
  }
  const result: KindSections<T>[] = []
  for (const { key: group, label } of FILE_GROUPS) {
    const inKind = [...sections.values()].filter((s) => s.group === group)
    if (inKind.length === 0) continue
    inKind.sort((a, b) => {
      if (a.day !== b.day) {
        if (a.day === undefined) return 1
        if (b.day === undefined) return -1
        return compare(a.day, b.day)
      }
      return compare(a.title, b.title) || compare(a.key, b.key)
    })
    result.push({
      group,
      label,
      sections: inKind.map(({ key, title, emoji, seeAll, items }) => ({ key, title, emoji, seeAll, items })),
    })
  }
  return result
}
