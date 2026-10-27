import { tripPath } from './tripData'

export const TABS = [
  { key: 'plan', path: '', icon: '🗓️', label: 'Plan' },
  { key: 'places', path: 'places', icon: '📍', label: 'Places' },
  { key: 'money', path: 'money', icon: '💶', label: 'Money' },
  { key: 'photos', path: 'photos', icon: '📎', label: 'Files' },
  { key: 'trip', path: 'trip', icon: '🧳', label: 'Trip' },
] as const

/** Which tab a page belongs to, from the part of the path after /trips/<id>/. */
export function tabOf(section: string | undefined, over: boolean): (typeof TABS)[number]['key'] {
  if (section === 'places') return 'places'
  // The Plan tab leads to the report once the trip is over; before that, the Trip tab.
  if (section === 'report') return over ? 'plan' : 'trip'
  if (section === 'money' || section === 'expenses' || section === 'exchanges') return 'money'
  if (section === 'photos' || section === 'files') return 'photos'
  if (section === 'trip' || section === 'edit' || section === 'share' || section === 'server') return 'trip'
  return 'plan'
}

/** Where the top bar's arrow goes: the trip list on tab pages, otherwise back (or to the page's tab if there is no back). */
export function topBarBack(pathname: string, over: boolean): { to: '/' } | { fallback: string } {
  const parts = pathname.split('/')
  const tripId = parts[2] ?? ''
  const rest = parts.slice(3).filter(Boolean)
  if (rest.length === 0 || (rest.length === 1 && TABS.some((t) => t.path !== '' && t.path === rest[0]))) return { to: '/' }
  return { fallback: tripPath(tripId, TABS.find((t) => t.key === tabOf(rest[0], over))!.path) }
}
