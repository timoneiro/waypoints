import type { Activity, Day, Exchange, Expense, Place, Review, Stay, Transport, Traveller, Trip } from '../db/types.ts'
import { awaitingCost, balances, rateFinder, settleUp, toTripCurrency, totals } from './expenses.ts'
import { derivedId } from './ids.ts'
import { transportDuration } from './itinerary.ts'
import { fold } from './places.ts'
import { isTimestamp } from './records.ts'
import { averageStars, canReview, plannedPlaces, reviewsOf, reviewTargets, type ReviewTarget } from './reviews.ts'
import { daysBetween, isDay } from './time.ts'

/*
 * The trip report: what the trip cost, what was worth it, and a few highlights, for the whole group
 * once the trip is over. It's made from the trip's records on this phone (after a merge, every phone
 * has them all), so it needs no server. A trip on the sync server keeps its report there once it's
 * over (see Report in src/db/types.ts): made once, the same for everyone, until someone makes it again.
 *
 * Everything in it is plain JSON, names included, so a kept report reads the same on every phone. It
 * comes from another phone, maybe on another version of the app, so it's read back through
 * readReport, which checks every field. REPORT_FORMAT goes up only if what a field means changes:
 * new fields can join the current format, since older apps leave out what they don't know.
 */

export const REPORT_FORMAT = 1

/** At most this many photo highlights, one a day. */
const MAX_HIGHLIGHTS = 12

export interface TripReport {
  format: number
  /** When it was made. */
  madeAt: string
  trip: { name: string; emoji?: string; startDate: Day; endDate: Day; currency: string }
  days: number
  /** Everyone on the trip, by name. */
  travellers: string[]
  /** Cities stayed in or visited, in the order the trip got to them. */
  cities: string[]
  money: ReportMoney
  stays: ReportStay[]
  journeys: ReportJourneys
  activities: number
  placesVisited: number
  /** Everything someone reviewed, top rated first. */
  reviewed: ReportItem[]
  /** Places saved but never visited or planned: ideas for next time, must-sees first. */
  ideas: ReportIdea[]
  /** The day with the most going on (activities and journeys), if any had two things or more. */
  busiestDay?: { day: Day; count: number }
  photos: {
    count: number
    /** Attachment ids: one photo a day, for up to MAX_HIGHLIGHTS days. */
    highlights: string[]
  }
}

/** In the trip's currency, to the cent. */
export interface ReportMoney {
  /** Spending: settle-up payments aren't. */
  total: number
  /** Most first. */
  byCategory: { category: string; amount: number }[]
  /** In order. */
  byDay: { day: Day; amount: number }[]
  /** What each traveller paid for, and their part of the spending. */
  people: { id: string; name: string; paid: number; share: number }[]
  /** Payments still needed to settle up, by name. None: everyone is square. */
  toSettle: { from: string; to: string; amount: number }[]
  biggest?: ReportExpense
  /** The most expensive in Food & drinks. */
  biggestMeal?: ReportExpense
  /** Expenses left out: their currency has no rate yet. */
  uncounted: number
  /** Card payments counted at an estimate, until what the bank charged is added. */
  estimated: number
}

export interface ReportExpense {
  title: string
  amount: number
  category: string
  day: Day
}

export interface ReportStay {
  id: string
  name: string
  kind: string
  city?: string
  checkIn: Day
  checkOut: Day
  nights: number
  average?: number
}

export interface ReportJourneys {
  count: number
  /** Most first. */
  byMode: { mode: string; count: number }[]
  /** Time travelling, over the journeys with both times. */
  minutes: number
  /** Journeys without both times, left out of `minutes`. */
  untimed: number
  longest?: { from: string; to: string; mode: string; minutes: number }
}

/** Something reviewed, with everyone's reviews of it. */
export interface ReportItem {
  /** One of REVIEWABLE_TABLES. */
  table: string
  id: string
  /** Its kind, mode or category, for its emoji ("activity" for activities). */
  kind: string
  title: string
  day?: Day
  city?: string
  average?: number
  reviews: ReportReview[]
}

export interface ReportReview {
  /** Traveller id. */
  by: string
  name: string
  stars?: number
  note?: string
  missed?: boolean
}

export interface ReportIdea {
  id: string
  name: string
  category: string
  city?: string
  mustSee: boolean
}

/** What a report is made from: the trip's records (live ones count), and the photos it may show. */
export interface ReportInput {
  trip: Trip
  travellers: Traveller[]
  /** Every traveller ever on the trip, removed ones too: old expenses and reviews may name them. */
  names: Map<string, string>
  stays: Stay[]
  transports: Transport[]
  activities: Activity[]
  places: Place[]
  expenses: Expense[]
  exchanges: Exchange[]
  reviews: Review[]
  /** Photos it may show (none kept only on someone's phone), in the order they were taken. */
  photos: { id: string; day: Day }[]
}

/** The id of a trip's report: the same on every phone, so two phones making it at once still make one. */
export const reportId = (tripId: string): Promise<string> => derivedId('report', tripId)

const live = <T extends { deletedAt?: string }>(list: T[]) => list.filter((r) => !r.deletedAt)
const cents = (n: number) => Math.round(n * 100) / 100

export function buildReport(input: ReportInput, now: number): TripReport {
  const { trip } = input
  const nameOf = (id: string) => input.names.get(id) ?? 'Someone'
  // In the order they were added, as everywhere else.
  const travellers = live(input.travellers).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const stays = live(input.stays).sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))
  const transports = live(input.transports)
  const activities = live(input.activities)
  const places = live(input.places)
  const reviews = live(input.reviews)

  // A place in the plan counts as visited once one of its activities has started.
  const planned = plannedPlaces(activities)
  const started = new Set(activities.filter((a) => a.placeId && canReview({ table: 'activities', record: a }, now)).map((a) => a.placeId))
  const visited = places.filter((p) => p.visited || started.has(p.id))
  const ideas = places
    .filter((p) => !visited.includes(p) && !planned.has(p.id))
    .sort((a, b) => Number(Boolean(b.mustSee)) - Number(Boolean(a.mustSee)) || (a.city ?? '').localeCompare(b.city ?? '') || a.name.localeCompare(b.name))
    .map((p) => ({ id: p.id, name: p.name, category: p.category, city: p.city, mustSee: Boolean(p.mustSee) }))

  const order = new Map(travellers.map((t, i) => [t.id, i]))
  const byTraveller = (a: Review, b: Review) => (order.get(a.by) ?? order.size) - (order.get(b.by) ?? order.size) || a.createdAt.localeCompare(b.createdAt)
  const reviewed = reviewTargets({ activities, places, stays, transports })
    .flatMap((target) => {
      const list = reviewsOf(reviews, target).sort(byTraveller)
      if (!list.length) return []
      const item: ReportItem = {
        ...describe(target),
        average: averageStars(list),
        reviews: list.map((r) => ({ by: r.by, name: nameOf(r.by), stars: r.missed ? undefined : r.stars, note: r.note, missed: r.missed || undefined })),
      }
      return [item]
    })
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0) || b.reviews.length - a.reviews.length || a.title.localeCompare(b.title))

  return {
    format: REPORT_FORMAT,
    madeAt: new Date(now).toISOString(),
    trip: { name: trip.name, emoji: trip.emoji, startDate: trip.startDate, endDate: trip.endDate, currency: trip.currency },
    days: Math.max(1, daysBetween(trip.startDate, trip.endDate) + 1),
    travellers: travellers.map((t) => t.name),
    cities: citiesOf(stays, activities, visited),
    money: moneyOf(input, travellers, nameOf),
    stays: stays.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      city: s.city,
      checkIn: s.checkInDate,
      checkOut: s.checkOutDate,
      nights: Math.max(0, daysBetween(s.checkInDate, s.checkOutDate)),
      average: averageStars(reviewsOf(reviews, { table: 'stays', record: s })),
    })),
    journeys: journeysOf(transports),
    activities: activities.length,
    placesVisited: visited.length,
    reviewed,
    ideas,
    busiestDay: busiestDay(activities, transports),
    photos: { count: input.photos.length, highlights: pickHighlights(input.photos) },
  }
}

function describe(target: ReviewTarget): Omit<ReportItem, 'average' | 'reviews'> {
  const { table } = target
  switch (target.table) {
    case 'activities': {
      const r = target.record
      return { table, id: r.id, kind: 'activity', title: r.title, day: r.date, city: r.city }
    }
    case 'places': {
      const r = target.record
      return { table, id: r.id, kind: r.category, title: r.name, city: r.city }
    }
    case 'stays': {
      const r = target.record
      return { table, id: r.id, kind: r.kind, title: r.name, day: r.checkInDate, city: r.city }
    }
    case 'transports': {
      const r = target.record
      return { table, id: r.id, kind: r.mode, title: `${r.from} → ${r.to}`, day: r.departDate }
    }
  }
}

/** Cities of the stays and activities in the order they happen, then those of places visited. */
function citiesOf(stays: Stay[], activities: Activity[], visited: Place[]): string[] {
  const dated = [...stays.map((s) => ({ city: s.city, day: s.checkInDate })), ...activities.map((a) => ({ city: a.city, day: a.date }))]
  dated.sort((a, b) => a.day.localeCompare(b.day))
  const cities = new Map<string, string>()
  for (const { city } of [...dated, ...visited]) {
    const name = city?.trim()
    if (name && !cities.has(fold(name))) cities.set(fold(name), name)
  }
  return [...cities.values()]
}

function moneyOf(input: ReportInput, travellers: Traveller[], nameOf: (id: string) => string): ReportMoney {
  const { currency } = input.trip
  const expenses = live(input.expenses)
  const rateOf = rateFinder(currency, live(input.exchanges))
  const spent = totals(expenses, rateOf)
  const bal = balances(expenses, rateOf, travellers.map((t) => t.id))
  const counted: ReportExpense[] = expenses.flatMap((e) => {
    const rate = rateOf(e)
    return !e.transfer && rate ? [{ title: e.title, amount: cents(toTripCurrency(e.amount, rate)), category: e.category, day: e.date }] : []
  })
  const biggest = (list: ReportExpense[]) => list.reduce<ReportExpense | undefined>((top, e) => (!top || e.amount > top.amount ? e : top), undefined)
  const onTrip = new Set(travellers.map((t) => t.id))
  return {
    total: cents(spent.total),
    byCategory: [...spent.byCategory].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount: cents(amount) })),
    byDay: [...spent.byDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, amount]) => ({ day, amount: cents(amount) })),
    // Someone taken off the trip since shows if they're still in its expenses.
    people: [...bal]
      .filter(([id, b]) => onTrip.has(id) || Math.round(b.paid * 100) || Math.round(b.share * 100))
      .map(([id, b]) => ({ id, name: nameOf(id), paid: cents(b.paid), share: cents(b.share) })),
    toSettle: settleUp(new Map([...bal].map(([id, b]) => [id, b.net]))).map((p) => ({ from: nameOf(p.from), to: nameOf(p.to), amount: p.amount })),
    biggest: biggest(counted),
    biggestMeal: biggest(counted.filter((e) => e.category === 'food')),
    uncounted: expenses.filter((e) => !e.transfer && !rateOf(e)).length,
    estimated: expenses.filter((e) => awaitingCost(e, currency) && rateOf(e)).length,
  }
}

function journeysOf(transports: Transport[]): ReportJourneys {
  const modes = new Map<string, number>()
  let ms = 0
  let untimed = 0
  let longest: { r: Transport; ms: number } | undefined
  for (const r of transports) {
    modes.set(r.mode, (modes.get(r.mode) ?? 0) + 1)
    const duration = transportDuration(r)
    if (duration === undefined) {
      untimed++
      continue
    }
    ms += duration
    if (!longest || duration > longest.ms) longest = { r, ms: duration }
  }
  return {
    count: transports.length,
    byMode: [...modes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([mode, count]) => ({ mode, count })),
    minutes: Math.round(ms / 60_000),
    untimed,
    longest: longest && { from: longest.r.from, to: longest.r.to, mode: longest.r.mode, minutes: Math.round(longest.ms / 60_000) },
  }
}

function busiestDay(activities: Activity[], transports: Transport[]): TripReport['busiestDay'] {
  const counts = new Map<Day, number>()
  for (const day of [...activities.map((a) => a.date), ...transports.map((t) => t.departDate)]) counts.set(day, (counts.get(day) ?? 0) + 1)
  const [top] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return top && top[1] >= 2 ? { day: top[0], count: top[1] } : undefined
}

/** One photo a day (the middle one of the day's), for at most `max` days spread over the trip. */
export function pickHighlights(photos: { id: string; day: Day }[], max = MAX_HIGHLIGHTS): string[] {
  const days = new Map<Day, string[]>()
  for (const p of photos) days.set(p.day, [...(days.get(p.day) ?? []), p.id])
  const lists = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([, ids]) => ids)
  const picked = lists.length <= max ? lists : Array.from({ length: max }, (_, i) => lists[Math.round((i * (lists.length - 1)) / (max - 1))])
  return picked.map((ids) => ids[Math.floor((ids.length - 1) / 2)])
}

/**
 * The report's reviews in three: the best (4 stars or more on average), the ones not worth it (2.5
 * or less), up to `size` of each, and everything else, in the order they were.
 */
export function bestAndWorst(items: ReportItem[], size = 3): { best: ReportItem[]; worst: ReportItem[]; rest: ReportItem[] } {
  const rated = items.filter((i) => i.average !== undefined).sort((a, b) => b.average! - a.average!)
  const best = rated.filter((i) => i.average! >= 4).slice(0, size)
  const worst = rated
    .filter((i) => i.average! <= 2.5 && !best.includes(i))
    .reverse()
    .slice(0, size)
  return { best, worst, rest: items.filter((i) => !best.includes(i) && !worst.includes(i)) }
}

/** How many of a trip's records changed after `since` (when a kept report was made): it may be out of date. */
export const changedSince = (lists: { updatedAt: string }[][], since: string): number =>
  lists.reduce((n, list) => n + list.filter((r) => r.updatedAt > since).length, 0)

// Reading a kept report back: every field is checked, and anything that doesn't fit is left out.

type Obj = Record<string, unknown>
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const objectOf = (v: unknown): Obj => (isObject(v) ? v : {})
const text = (v: unknown, max = 10_000) => (typeof v === 'string' ? v.slice(0, max) : undefined)
const amount = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12 ? v : undefined)
const whole = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : 0)
const dayOf = (v: unknown) => (isDay(v) ? v : undefined)
const starsOf = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 5 ? v : undefined)
const texts = (v: unknown, max = 200) => (Array.isArray(v) ? v.slice(0, 1000).flatMap((x) => (typeof x === 'string' ? [x.slice(0, max)] : [])) : [])

function listOf<T>(v: unknown, read: (x: Obj) => T | undefined): T[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 10_000).flatMap((x) => {
    const item = isObject(x) ? read(x) : undefined
    return item === undefined ? [] : [item]
  })
}

/** Keeps a read value only when every required part of it is there. */
const all = <T extends object>(value: T, ...required: unknown[]): T | undefined => (required.every((x) => x !== undefined) ? value : undefined)

function readExpense(x: unknown): ReportExpense | undefined {
  if (!isObject(x)) return undefined
  const e = { title: text(x.title, 200), amount: amount(x.amount), category: text(x.category, 40), day: dayOf(x.day) }
  return all(e as ReportExpense, e.title, e.amount, e.category, e.day)
}

/** A kept report as this version of the app can show it, or undefined if it can't (a newer format, say). */
export function readReport(raw: unknown): TripReport | undefined {
  if (!isObject(raw) || raw.format !== REPORT_FORMAT || !isTimestamp(raw.madeAt)) return undefined
  const trip = objectOf(raw.trip)
  const name = text(trip.name, 200)
  const startDate = dayOf(trip.startDate)
  const endDate = dayOf(trip.endDate)
  const currency = typeof trip.currency === 'string' && /^[A-Z]{3}$/.test(trip.currency) ? trip.currency : undefined
  if (name === undefined || !startDate || !endDate || !currency) return undefined
  const money = objectOf(raw.money)
  const journeys = objectOf(raw.journeys)
  const longest = objectOf(journeys.longest)
  const busiest = objectOf(raw.busiestDay)
  const photos = objectOf(raw.photos)
  return {
    format: REPORT_FORMAT,
    madeAt: raw.madeAt,
    trip: { name, emoji: text(trip.emoji, 16), startDate, endDate, currency },
    days: whole(raw.days),
    travellers: texts(raw.travellers, 60),
    cities: texts(raw.cities),
    money: {
      total: amount(money.total) ?? 0,
      byCategory: listOf(money.byCategory, (x) => all({ category: text(x.category, 40)!, amount: amount(x.amount)! }, text(x.category), amount(x.amount))),
      byDay: listOf(money.byDay, (x) => all({ day: dayOf(x.day)!, amount: amount(x.amount)! }, dayOf(x.day), amount(x.amount))),
      people: listOf(money.people, (x) => {
        const p = { id: text(x.id, 64), name: text(x.name, 60), paid: amount(x.paid), share: amount(x.share) }
        return all(p as ReportMoney['people'][number], p.id, p.name, p.paid, p.share)
      }),
      toSettle: listOf(money.toSettle, (x) => {
        const p = { from: text(x.from, 60), to: text(x.to, 60), amount: amount(x.amount) }
        return all(p as ReportMoney['toSettle'][number], p.from, p.to, p.amount)
      }),
      biggest: readExpense(money.biggest),
      biggestMeal: readExpense(money.biggestMeal),
      uncounted: whole(money.uncounted),
      estimated: whole(money.estimated),
    },
    stays: listOf(raw.stays, (x) => {
      const s = {
        id: text(x.id, 64),
        name: text(x.name, 200),
        kind: text(x.kind, 40),
        city: text(x.city, 200),
        checkIn: dayOf(x.checkIn),
        checkOut: dayOf(x.checkOut),
        nights: whole(x.nights),
        average: starsOf(x.average),
      }
      return all(s as ReportStay, s.id, s.name, s.kind, s.checkIn, s.checkOut)
    }),
    journeys: {
      count: whole(journeys.count),
      byMode: listOf(journeys.byMode, (x) => all({ mode: text(x.mode, 40)!, count: whole(x.count) }, text(x.mode))),
      minutes: whole(journeys.minutes),
      untimed: whole(journeys.untimed),
      longest: all(
        { from: text(longest.from, 200)!, to: text(longest.to, 200)!, mode: text(longest.mode, 40)!, minutes: whole(longest.minutes) },
        text(longest.from),
        text(longest.to),
        text(longest.mode),
      ),
    },
    activities: whole(raw.activities),
    placesVisited: whole(raw.placesVisited),
    reviewed: listOf(raw.reviewed, (x) => {
      const item = {
        table: text(x.table, 40),
        id: text(x.id, 64),
        kind: text(x.kind, 40),
        title: text(x.title, 500),
        day: dayOf(x.day),
        city: text(x.city, 200),
        average: starsOf(x.average),
        reviews: listOf(x.reviews, (r) => {
          const review = { by: text(r.by, 64), name: text(r.name, 60), stars: starsOf(r.stars), note: text(r.note), missed: r.missed === true || undefined }
          return all(review as ReportReview, review.by, review.name)
        }),
      }
      return all(item as ReportItem, item.table, item.id, item.kind, item.title)
    }),
    ideas: listOf(raw.ideas, (x) => {
      const idea = { id: text(x.id, 64), name: text(x.name, 200), category: text(x.category, 40), city: text(x.city, 200), mustSee: x.mustSee === true }
      return all(idea as ReportIdea, idea.id, idea.name, idea.category)
    }),
    busiestDay: all({ day: dayOf(busiest.day)!, count: whole(busiest.count) }, dayOf(busiest.day)),
    photos: { count: whole(photos.count), highlights: texts(photos.highlights, 64).slice(0, MAX_HIGHLIGHTS) },
  }
}
