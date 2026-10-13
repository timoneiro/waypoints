import type { Activity, Day, Stay, Time, Transport, Trip } from '../db/types.ts'
import { daysBetween, eachDay, zonedInstant } from './time.ts'

/*
 * The day-by-day plan: transport, check-ins and check-outs and activities, each on the day it
 * happens where it happens (its own wall clock), ordered on the real timeline.
 */

interface Entry<K extends string, R> {
  kind: K
  day: Day
  time?: Time
  /** When it happens on the real timeline (UTC ms); untimed entries count as their usual hour. */
  at: number
  record: R
}

export type PlanEntry =
  | Entry<'transport', Transport>
  | Entry<'arrival', Transport>
  | Entry<'checkin', Stay>
  | Entry<'checkout', Stay>
  | Entry<'activity', Activity>

export interface PlanDay {
  day: Day
  /** 1 on the trip's first day. 0 or less before the trip, more than its length after it. */
  number: number
  inTrip: boolean
  entries: PlanEntry[]
  /** Where you sleep that night. */
  night?: Stay
}

// Entries without a time are ordered as if they happened at these hours.
const USUAL_TIME: Record<PlanEntry['kind'], Time> = {
  checkout: '10:00',
  checkin: '15:00',
  transport: '00:00',
  arrival: '00:00',
  activity: '00:00',
}

const at = (kind: PlanEntry['kind'], day: Day, time: Time | undefined, timeZone: string) =>
  zonedInstant(day, time ?? USUAL_TIME[kind], timeZone)

export function planEntries(stays: Stay[], transports: Transport[], activities: Activity[]): PlanEntry[] {
  const entries: PlanEntry[] = []
  for (const s of stays) {
    entries.push({ kind: 'checkin', day: s.checkInDate, time: s.checkInTime, at: at('checkin', s.checkInDate, s.checkInTime, s.timeZone), record: s })
    entries.push({ kind: 'checkout', day: s.checkOutDate, time: s.checkOutTime, at: at('checkout', s.checkOutDate, s.checkOutTime, s.timeZone), record: s })
  }
  for (const t of transports) {
    entries.push({ kind: 'transport', day: t.departDate, time: t.departTime, at: at('transport', t.departDate, t.departTime, t.departTimeZone), record: t })
    if (t.arriveDate && t.arriveDate !== t.departDate) {
      const zone = t.arriveTimeZone ?? t.departTimeZone
      entries.push({ kind: 'arrival', day: t.arriveDate, time: t.arriveTime, at: at('arrival', t.arriveDate, t.arriveTime, zone), record: t })
    }
  }
  for (const a of activities) entries.push({ kind: 'activity', day: a.date, time: a.startTime, at: at('activity', a.date, a.startTime, a.timeZone), record: a })
  return entries.sort((a, b) => a.day.localeCompare(b.day) || a.at - b.at)
}

/**
 * The time zone the plan has you in on `day`, for something new on that day: where the last journey
 * arriving by then took you, or the last stay checked into by then, whichever was later. Before any
 * of those, where the first journey leaves from (or the first stay is). Undefined without either.
 */
export function zoneOnDay(day: Day, stays: Stay[], transports: Transport[]): string | undefined {
  type Mark = { day: Day; at: number; zone: string }
  const checkIns: Mark[] = stays.map((s) => ({ day: s.checkInDate, at: at('checkin', s.checkInDate, s.checkInTime, s.timeZone), zone: s.timeZone }))
  const arrivals: Mark[] = transports.map((t) => {
    const arrives = t.arriveDate ?? t.departDate
    const zone = t.arriveTimeZone ?? t.departTimeZone
    return { day: arrives, at: at('arrival', arrives, t.arriveTime, zone), zone }
  })
  const departures: Mark[] = transports.map((t) => ({ day: t.departDate, at: at('transport', t.departDate, t.departTime, t.departTimeZone), zone: t.departTimeZone }))
  const before = [...arrivals, ...checkIns].filter((m) => m.day <= day)
  if (before.length) return before.sort((a, b) => b.day.localeCompare(a.day) || b.at - a.at)[0].zone
  return [...departures, ...checkIns].sort((a, b) => a.day.localeCompare(b.day) || a.at - b.at)[0]?.zone
}

/** How long a journey takes (ms), when both its times are known. */
export function transportDuration(r: Transport): number | undefined {
  if (!r.departTime || !r.arriveTime) return undefined
  const start = zonedInstant(r.departDate, r.departTime, r.departTimeZone)
  const end = zonedInstant(r.arriveDate ?? r.departDate, r.arriveTime, r.arriveTimeZone ?? r.departTimeZone)
  return end > start ? end - start : undefined
}

/** Every day of the trip, plus any day outside it that has something planned. */
export function buildPlan(trip: Pick<Trip, 'startDate' | 'endDate'>, stays: Stay[], transports: Transport[], activities: Activity[]): PlanDay[] {
  const entries = planEntries(stays, transports, activities)
  const length = daysBetween(trip.startDate, trip.endDate) + 1
  const days = [...new Set([...eachDay(trip.startDate, trip.endDate), ...entries.map((e) => e.day)])].sort()
  return days.map((day) => {
    const number = daysBetween(trip.startDate, day) + 1
    const night = stays
      .filter((s) => s.checkInDate <= day && day < s.checkOutDate)
      .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate))[0]
    return { day, number, inTrip: number >= 1 && number <= length, entries: entries.filter((e) => e.day === day), night }
  })
}

export type TripPhase =
  | { phase: 'upcoming'; daysToGo: number }
  | { phase: 'ongoing'; day: number; length: number }
  | { phase: 'past'; daysAgo: number }

export function tripPhase(trip: Pick<Trip, 'startDate' | 'endDate'>, today: Day): TripPhase {
  if (today < trip.startDate) return { phase: 'upcoming', daysToGo: daysBetween(today, trip.startDate) }
  if (today > trip.endDate) return { phase: 'past', daysAgo: daysBetween(trip.endDate, today) }
  return { phase: 'ongoing', day: daysBetween(trip.startDate, today) + 1, length: daysBetween(trip.startDate, trip.endDate) + 1 }
}

/** The next timed thing that hasn't started yet, today or later. */
export function nextUp(entries: PlanEntry[], today: Day, now: number): PlanEntry | undefined {
  return entries.find((e) => e.day >= today && e.time !== undefined && e.at > now)
}
