import type { Transport } from '../db/types.ts'
import { airportCode, fold } from './places.ts'
import { zonedInstant } from './time.ts'

/*
 * Journeys bought together (connecting flights, or a flight there and back) share a booking ref, and
 * a document for the whole booking (the e-ticket, the receipt) shows on each of them.
 */

/** A booking ref as journeys are matched on: "abc 123" and "ABC-123" are one booking. None when empty. */
export function bookingKey(ref: string | undefined): string | undefined {
  return ref?.toUpperCase().replace(/[\s-]/g, '') || undefined
}

const departure = (r: Transport) => zonedInstant(r.departDate, r.departTime, r.departTimeZone)

/** The journeys of one booking, in the order they leave. */
export function bookingLegs<T extends Transport>(transports: T[], key: string | undefined): T[] {
  if (!key) return []
  return transports.filter((r) => bookingKey(r.confirmation) === key).sort((a, b) => departure(a) - departure(b) || a.id.localeCompare(b.id))
}

/** "flight" when they're all flights, else "journey". */
export const legNoun = (legs: Transport[]) => (legs.every((r) => r.mode === 'flight') ? 'flight' : 'journey')

/** Where the journeys go, one after the other: "LIS → FRA → NRT". A gap between them starts over after a comma. */
export function route(legs: Transport[]): string {
  const stop = (r: Transport, place: string) => (r.mode === 'flight' && airportCode(place)) || place.trim()
  const parts: string[][] = []
  for (const r of legs) {
    const last = parts.at(-1)
    const from = stop(r, r.from)
    if (last && fold(last.at(-1)!) === fold(from)) last.push(stop(r, r.to))
    else parts.push([from, stop(r, r.to)])
  }
  return parts.map((p) => p.join(' → ')).join(', ')
}
