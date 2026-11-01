import type { PackingItem } from '../db/types.ts'

/*
 * Packing & to-do lists: one shared checklist per trip. Unticked items come first, then ticked ones,
 * each group in the order they were added. Templates add common items without touching the list.
 */

export interface Template {
  id: 'beach' | 'city' | 'hiking' | 'skiing'
  label: string
  items: string[]
}

export const TEMPLATES: Template[] = [
  {
    id: 'beach',
    label: 'Beach',
    items: ['Sunscreen', 'Swimsuit', 'Beach towel', 'Sunglasses', 'Flip-flops', 'Hat', 'Water bottle', 'Beach bag', 'After-sun lotion', 'Snorkel mask'],
  },
  {
    id: 'city',
    label: 'City',
    items: ['Phone charger', 'Power bank', 'Comfortable shoes', 'Umbrella', 'Daypack', 'Travel adapter', 'Camera', 'Offline maps', 'Reusable water bottle', 'Medication'],
  },
  {
    id: 'hiking',
    label: 'Hiking',
    items: ['Hiking boots', 'Rain jacket', 'Water bottle', 'Trail snacks', 'First-aid kit', 'Headlamp', 'Sun hat', 'Map and compass', 'Warm layer', 'Blister plasters'],
  },
  {
    id: 'skiing',
    label: 'Skiing',
    items: ['Ski jacket', 'Ski pants', 'Gloves', 'Goggles', 'Thermal base layer', 'Helmet', 'Ski socks', 'Lip balm', 'Neck warmer', 'Ski pass'],
  },
]

/** Items that are still on the list (a deleted item is a tombstone, not on the list). */
const live = (items: PackingItem[]): PackingItem[] => items.filter((i) => !i.deletedAt)

/** Unticked first, then ticked; each group by when it was added, then text, then id (the same on every phone). */
export function sortedItems(items: PackingItem[]): PackingItem[] {
  return live(items).sort((a, b) => {
    if (Boolean(a.packed) !== Boolean(b.packed)) return a.packed ? 1 : -1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    const ta = a.text.toLowerCase()
    const tb = b.text.toLowerCase()
    if (ta !== tb) return ta < tb ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * The template's items that aren't on the list yet: trimmed, compared case-insensitively, ticked items
 * count as on the list. Nothing here changes existing items. The result is in template order.
 */
export function newFromTemplate(existing: PackingItem[], template: Template): string[] {
  const on = new Set(live(existing).map((i) => i.text.trim().toLowerCase()))
  const added: string[] = []
  for (const item of template.items) {
    const key = item.trim().toLowerCase()
    if (on.has(key)) continue
    on.add(key)
    added.push(item.trim())
  }
  return added
}

/** How many items are packed, out of how many there are. */
export function progress(items: PackingItem[]): { packed: number; total: number } {
  const all = live(items)
  return { packed: all.filter((i) => i.packed).length, total: all.length }
}
