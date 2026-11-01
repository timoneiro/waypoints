import type { Transport } from '../db/types.ts'
import { airportCode, fold } from './places.ts'
import { daysBetween, zonedInstant } from './time.ts'

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

/** A place as the route and the connections show it: the airport code for flights. */
const stop = (r: Transport, place: string) => (r.mode === 'flight' && airportCode(place)) || place.trim()

/** Where the journeys go, one after the other: "LIS → FRA → NRT". A gap between them starts over after a comma. */
export function route(legs: Transport[]): string {
  const parts: string[][] = []
  for (const r of legs) {
    const last = parts.at(-1)
    const from = stop(r, r.from)
    if (last && fold(last.at(-1)!) === fold(from)) last.push(stop(r, r.to))
    else parts.push([from, stop(r, r.to)])
  }
  return parts.map((p) => p.join(' → ')).join(', ')
}

export type ConnectionJoin = { layoverMinutes?: number; place: string; warnings: string[] }
export type Connection = { key: string; legs: Transport[]; route: string; stops: number; joins: ConnectionJoin[] }

const DAY_MINUTES = 24 * 60

const arrival = (r: Transport) => zonedInstant(r.arriveDate ?? r.departDate, r.arriveTime, r.arriveTimeZone ?? r.departTimeZone)

/** Minutes between one journey arriving and the next leaving, when both times are known. Can be negative. */
const layover = (prev: Transport, next: Transport) => (prev.arriveTime && next.departTime ? (departure(next) - arrival(prev)) / 60_000 : undefined)

/** A gap of over a day ends a connection (a flight there and back on one ref is normal); without times, two calendar days do. */
function splits(prev: Transport, next: Transport): boolean {
  const minutes = layover(prev, next)
  return minutes === undefined ? daysBetween(prev.arriveDate ?? prev.departDate, next.departDate) >= 2 : minutes > DAY_MINUTES
}

/** The join after leg `n` of its connection (the next journey is leg `n + 1`), with every warning that applies. */
function joinOf(prev: Transport, next: Transport, n: number): ConnectionJoin {
  const minutes = layover(prev, next)
  const place = stop(prev, prev.to)
  const from = stop(next, next.from)
  const warnings: string[] = []
  if (fold(place) !== fold(from)) warnings.push(`Leg ${n + 1} leaves from ${from} but leg ${n} arrives in ${place}`)
  if (minutes !== undefined && minutes < 0) warnings.push(`Leg ${n + 1} leaves before leg ${n} arrives`)
  return { layoverMinutes: minutes, place, warnings }
}

/** The connections on every booking: runs of two or more journeys that join, first to leave first. Deleted journeys are left out. */
export function connections(transports: Transport[]): Connection[] {
  const live = transports.filter((r) => !r.deletedAt)
  const keys = new Set(live.map((r) => bookingKey(r.confirmation)).filter((k): k is string => k !== undefined))
  const found: Connection[] = []
  for (const key of keys) {
    const legs = bookingLegs(live, key)
    const runs: Transport[][] = []
    legs.forEach((next, i) => {
      const prev = legs[i - 1]
      if (prev && !splits(prev, next)) runs.at(-1)!.push(next)
      else runs.push([next])
    })
    for (const run of runs) {
      if (run.length < 2) continue
      found.push({
        key: run[0].id,
        legs: run,
        route: route(run),
        stops: run.length - 1,
        joins: run.slice(1).map((next, i) => joinOf(run[i], next, i + 1)),
      })
    }
  }
  return found.sort((a, b) => departure(a.legs[0]) - departure(b.legs[0]) || a.key.localeCompare(b.key))
}
