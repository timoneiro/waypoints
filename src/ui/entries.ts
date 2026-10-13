import { transportDuration, type PlanEntry } from '../domain/itinerary'
import type { ReviewTarget } from '../domain/reviews'
import { timeZoneName } from '../domain/time'
import { fmtDay, fmtDayTime, fmtDuration, fmtTime } from './format'
import { SEGMENT } from './items/save'
import { labelOf, PLACE_CATEGORIES, STAY_KINDS, TRANSPORT_MODES } from './labels'
import { tripPath, type TripData } from './tripData'

export interface EntryView {
  emoji: string
  title: string
  detail?: string
  to: string
  /** Short zone name when it isn't the trip's own, e.g. "GMT+9". */
  zone?: string
}

function zoneOf(e: PlanEntry): string {
  if (e.kind === 'transport') return e.record.departTimeZone
  if (e.kind === 'arrival') return e.record.arriveTimeZone ?? e.record.departTimeZone
  return e.record.timeZone
}

/** How a plan entry reads in a list. */
export function describeEntry(e: PlanEntry, t: TripData): EntryView {
  const zone = e.time && zoneOf(e) !== t.trip.timeZone ? timeZoneName(zoneOf(e), e.at) : undefined
  const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined
  switch (e.kind) {
    case 'transport': {
      const r = e.record
      const duration = transportDuration(r)
      const arrival = r.arriveTime && `arrives ${r.arriveDate && r.arriveDate !== r.departDate ? `${fmtDay(r.arriveDate)} ` : ''}${fmtTime(r.arriveTime)}`
      return {
        emoji: labelOf(TRANSPORT_MODES, r.mode).emoji,
        title: `${r.from} → ${r.to}`,
        detail: join([r.carrier, r.number].filter(Boolean).join(' '), arrival, duration !== undefined && fmtDuration(duration)),
        to: tripPath(t.trip.id, 'transport', r.id),
        zone,
      }
    }
    case 'arrival': {
      const r = e.record
      const mode = labelOf(TRANSPORT_MODES, r.mode)
      return {
        emoji: r.mode === 'flight' ? '🛬' : mode.emoji,
        title: `Arrive in ${r.to}`,
        detail: join(`${mode.label} from ${r.from}`, r.number),
        to: tripPath(t.trip.id, 'transport', r.id),
        zone,
      }
    }
    case 'checkin':
    case 'checkout': {
      const r = e.record
      return {
        emoji: e.kind === 'checkin' ? '🔑' : '🧳',
        title: `${e.kind === 'checkin' ? 'Check in' : 'Check out'}: ${r.name}`,
        detail: join(labelOf(STAY_KINDS, r.kind).label, r.city),
        to: tripPath(t.trip.id, 'stays', r.id),
        zone,
      }
    }
    case 'activity': {
      const r = e.record
      return {
        emoji: '🎟️',
        title: r.title,
        detail: join(r.endTime && `until ${fmtTime(r.endTime)}`, r.city),
        to: tripPath(t.trip.id, 'activities', r.id),
        zone,
      }
    }
  }
}

/** How something to review reads in a list. */
export function describeTarget(target: ReviewTarget, t: TripData): EntryView {
  const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined
  const to = tripPath(t.trip.id, SEGMENT[target.table], target.record.id)
  switch (target.table) {
    case 'activities': {
      const r = target.record
      return { emoji: '🎟️', title: r.title, detail: join(fmtDayTime(r.date, r.startTime), r.city), to }
    }
    case 'places': {
      const r = target.record
      const category = labelOf(PLACE_CATEGORIES, r.category)
      return { emoji: category.emoji, title: r.name, detail: join(category.label, r.city), to }
    }
    case 'stays': {
      const r = target.record
      return { emoji: labelOf(STAY_KINDS, r.kind).emoji, title: r.name, detail: join(`${fmtDay(r.checkInDate)} → ${fmtDay(r.checkOutDate)}`, r.city), to }
    }
    case 'transports': {
      const r = target.record
      return {
        emoji: labelOf(TRANSPORT_MODES, r.mode).emoji,
        title: `${r.from} → ${r.to}`,
        detail: join(fmtDayTime(r.departDate, r.departTime), [r.carrier, r.number].filter(Boolean).join(' ')),
        to,
      }
    }
  }
}
