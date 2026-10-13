import type { Activity, Place, Review, Stay, Time, Transport } from '../db/types.ts'
import { zonedInstant } from './time.ts'

/*
 * Reviews: everyone rates what they did (activities, places, stays and journeys) with stars and a
 * note, or says they didn't go. Something can be reviewed once it has started, and is up for review
 * (on everyone's list of things to review) once it's over. Places have no time: they're both once
 * someone ticks them as visited. A place that's in the plan is reviewed through its activities.
 */

export type ReviewTarget =
  | { table: 'activities'; record: Activity }
  | { table: 'places'; record: Place }
  | { table: 'stays'; record: Stay }
  | { table: 'transports'; record: Transport }

/** Everything in a trip that can be reviewed. */
export function reviewTargets(t: { activities: Activity[]; places: Place[]; stays: Stay[]; transports: Transport[] }): ReviewTarget[] {
  return [
    ...t.activities.map((record) => ({ table: 'activities' as const, record })),
    ...t.places.map((record) => ({ table: 'places' as const, record })),
    ...t.stays.map((record) => ({ table: 'stays' as const, record })),
    ...t.transports.map((record) => ({ table: 'transports' as const, record })),
  ]
}

// Ends without a time: an activity or a journey is over in the evening, a stay at the usual check-out hour.
const EVENING: Time = '18:00'
const CHECK_OUT: Time = '10:00'

/** When it starts and ends on the real timeline (UTC ms). Places have no time. */
function span(target: ReviewTarget): { start: number; end: number } | undefined {
  switch (target.table) {
    case 'activities': {
      const r = target.record
      return { start: zonedInstant(r.date, r.startTime, r.timeZone), end: zonedInstant(r.date, r.endTime ?? r.startTime ?? EVENING, r.timeZone) }
    }
    case 'stays': {
      const r = target.record
      return { start: zonedInstant(r.checkInDate, r.checkInTime, r.timeZone), end: zonedInstant(r.checkOutDate, r.checkOutTime ?? CHECK_OUT, r.timeZone) }
    }
    case 'transports': {
      const r = target.record
      const start = zonedInstant(r.departDate, r.departTime, r.departTimeZone)
      const arrives = r.arriveDate ?? r.departDate
      // Arriving the same day at an unknown time: it's over once it leaves, as far as anyone knows.
      const end =
        r.arriveTime || arrives !== r.departDate
          ? zonedInstant(arrives, r.arriveTime ?? EVENING, r.arriveTimeZone ?? r.departTimeZone)
          : zonedInstant(r.departDate, r.departTime ?? EVENING, r.departTimeZone)
      return { start, end: Math.max(start, end) }
    }
    case 'places':
      return undefined
  }
}

/** Whether it has started, so there's something to review. */
export const canReview = (target: ReviewTarget, now: number): boolean =>
  target.table === 'places' ? Boolean(target.record.visited) : span(target)!.start <= now

/** Whether it's over, so it's up for review. */
export const isOver = (target: ReviewTarget, now: number): boolean => (target.table === 'places' ? Boolean(target.record.visited) : span(target)!.end <= now)

/** When it was over, for listing the latest first. A place: when it was last changed (ticked as visited, usually). */
export const whenOver = (target: ReviewTarget): number => span(target)?.end ?? Date.parse(target.record.updatedAt)

/** The live reviews of an item. */
export const reviewsOf = (reviews: Review[], target: ReviewTarget): Review[] =>
  reviews.filter((r) => !r.deletedAt && r.itemId === target.record.id && r.itemTable === target.table)

/** The places in the plan: their activities are reviewed instead, so they aren't asked about twice. */
export const plannedPlaces = (activities: Activity[]): Set<string> =>
  new Set(activities.flatMap((a) => (a.placeId && !a.deletedAt ? [a.placeId] : [])))

/**
 * What's over that `by` hasn't reviewed yet (rated, written about, or said they didn't go), the
 * latest first. Without `by` (nobody has said who uses this phone), everything that's over.
 */
export function toReview(targets: ReviewTarget[], reviews: Review[], by: string | undefined, now: number): ReviewTarget[] {
  const done = new Set(reviews.filter((r) => !r.deletedAt && r.by === by).map((r) => `${r.itemTable}/${r.itemId}`))
  const planned = plannedPlaces(targets.flatMap((t) => (t.table === 'activities' ? [t.record] : [])))
  return targets
    .filter((t) => isOver(t, now) && !done.has(`${t.table}/${t.record.id}`) && !(t.table === 'places' && planned.has(t.record.id)))
    .sort((a, b) => whenOver(b) - whenOver(a))
}

/** Average stars of the reviews that have some, or undefined. */
export function averageStars(reviews: Review[]): number | undefined {
  const rated = reviews.filter((r) => !r.deletedAt && r.stars !== undefined)
  return rated.length ? rated.reduce((sum, r) => sum + r.stars!, 0) / rated.length : undefined
}

/**
 * The id of `by`'s review of an item: the same on every phone (16 URL-safe characters, like any
 * other id), so reviewing on a second phone replaces the review instead of adding another.
 */
export async function reviewId(tripId: string, itemId: string, by: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`review\n${tripId}\n${itemId}\n${by}`))
  let text = ''
  for (const b of new Uint8Array(digest).subarray(0, 12)) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_')
}
