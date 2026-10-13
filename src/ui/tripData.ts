import { createContext, useContext } from 'react'
import { db, getSetting, isLive, recordTable, SETTINGS } from '../db/db'
import { getServerConfig } from '../db/serverState'
import type { Activity, Attachment, Exchange, Expense, Place, ServerTrip, Stay, Transport, Traveller, Trip, TripTable } from '../db/types'
import { rateFinder, type RateOf } from '../domain/expenses'
import { fold } from '../domain/places'
import type { MemberSummary } from '../domain/serverProtocol'
import { labelOf, PLACE_CATEGORIES, STAY_KINDS } from './labels'

/** An address already in the trip, to suggest for another item there (an activity at the hotel). */
export interface KnownAddress {
  address: string
  /** What's there: "🏨 Hotel Sol". */
  what: string
  city?: string
  timeZone?: string
}

/** Everything in one trip that's still live, loaded once for all the trip's pages. */
export interface TripData {
  trip: Trip
  travellers: Traveller[]
  stays: Stay[]
  transports: Transport[]
  activities: Activity[]
  places: Place[]
  expenses: Expense[]
  exchanges: Exchange[]
  /** Photos and documents (their records: the files are in db.files). */
  attachments: Attachment[]
  /** Converts an expense to the trip's currency: its own rate, else what the exchanges got. */
  rateOf: RateOf
  /** The traveller using this phone, if they've said which one they are. */
  me?: Traveller
  /** Changes made here that the group hasn't had in a link yet. */
  unsent: number
  /** How far this phone has synced the trip, if it's on the sync server. */
  server?: ServerTrip
  /** For a trip on the server: changes here (or from links) that the server hasn't had yet. */
  waiting: number
  /** For a trip on the server: the server is too old to keep photos and documents. */
  oldServer: boolean
  /** Who this phone is on the sync server, when connected to one. */
  member?: MemberSummary
  /** When this phone found out it's no longer on this trip on the server. */
  serverGone?: string
  /** Travellers linked to someone still on the sync server (as far as this phone knows). */
  linked: Traveller[]
  /** Travellers who need links to get changes: everyone, unless the trip is on the server. */
  viaLinks: Traveller[]
  /** Every traveller ever on the trip, removed ones too: old expenses may still name them. */
  names: Map<string, string>
  /** Cities used anywhere in the trip, for suggestions. */
  cities: string[]
  /** The time zone of each city the trip's stays and activities are in, by folded name. */
  cityZones: Map<string, string>
  /** Addresses of the trip's stays, places and activities, for suggestions. */
  addresses: KnownAddress[]
  /** Time zones used in the trip, the trip's own first. */
  zones: string[]
}

const byCreation = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

export async function loadTrip(tripId: string): Promise<TripData | null> {
  const trip = await db.trips.get(tripId)
  if (!trip || trip.deletedAt) return null
  const ofTrip = <T extends TripTable>(table: T) => recordTable(table).where('tripId').equals(tripId).toArray()
  const [allTravellers, stays, transports, activities, places, expenses, exchanges, attachments, meId, unsent, server, waiting, config, serverGone] = await Promise.all([
    ofTrip('travellers'),
    ofTrip('stays'),
    ofTrip('transports'),
    ofTrip('activities'),
    ofTrip('places'),
    ofTrip('expenses'),
    ofTrip('exchanges'),
    ofTrip('attachments'),
    getSetting<string>(SETTINGS.me(tripId)),
    db.unsent.where('tripId').equals(tripId).count(),
    db.serverTrips.get(tripId),
    db.outbox.where('tripId').equals(tripId).count(),
    getServerConfig(),
    getSetting<string>(SETTINGS.serverGone(tripId)),
  ])
  const member = config?.member
  // Someone removed from the server keeps their link on old trips, but no longer gets changes.
  const members = config?.members.length ? new Set(config.members.map((m) => m.id)) : undefined
  const isLinked = (t: Traveller) => Boolean(t.memberId && (!members || members.has(t.memberId)))
  const travellers = allTravellers.filter(isLive).sort(byCreation)
  const data = {
    stays: stays.filter(isLive),
    transports: transports.filter(isLive),
    activities: activities.filter(isLive),
    places: places.filter(isLive),
    expenses: expenses.filter(isLive),
    exchanges: exchanges.filter(isLive),
    attachments: attachments.filter(isLive),
  }
  const cities = [...data.stays, ...data.activities, ...data.places].map((r) => r.city?.trim()).filter((c): c is string => Boolean(c))
  // Newest last, so a city's latest time zone wins.
  const cityZones = new Map(
    [...data.stays, ...data.activities]
      .filter((r) => r.city?.trim())
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .map((r) => [fold(r.city!), r.timeZone]),
  )
  const addresses: KnownAddress[] = [
    ...data.stays.map((s) => ({ address: s.address, what: `${labelOf(STAY_KINDS, s.kind).emoji} ${s.name}`, city: s.city, timeZone: s.timeZone })),
    ...data.places.map((p) => ({ address: p.address, what: `${labelOf(PLACE_CATEGORIES, p.category).emoji} ${p.name}`, city: p.city })),
    ...data.activities.map((a) => ({ address: a.address, what: `🎟️ ${a.title}`, city: a.city, timeZone: a.timeZone })),
  ]
    .map((a) => ({ ...a, address: a.address?.trim() ?? '', city: a.city?.trim() || undefined }))
    .filter((a, i, all) => a.address && all.findIndex((b) => b.address === a.address) === i)
  const zones = [
    trip.timeZone,
    ...data.stays.map((s) => s.timeZone),
    ...data.transports.flatMap((t) => [t.departTimeZone, t.arriveTimeZone]),
    ...data.activities.map((a) => a.timeZone),
  ].filter((z): z is string => Boolean(z))
  return {
    trip,
    travellers,
    ...data,
    rateOf: rateFinder(trip.currency, data.exchanges),
    me: travellers.find((t) => t.id === meId) ?? (server && member ? travellers.find((t) => t.memberId === member.id) : undefined),
    unsent,
    server,
    waiting: server ? waiting : 0,
    oldServer: Boolean(server && config?.lastSyncAt && !config.fileLimit),
    member,
    serverGone,
    linked: travellers.filter(isLinked),
    viaLinks: server ? travellers.filter((t) => !isLinked(t)) : travellers,
    names: new Map(allTravellers.map((t) => [t.id, t.name])),
    cities: [...new Set(cities)].sort((a, b) => a.localeCompare(b)),
    cityZones,
    addresses,
    zones: [...new Set(zones)],
  }
}

export const TripContext = createContext<TripData | null>(null)

export function useTrip(): TripData {
  const data = useContext(TripContext)
  if (!data) throw new Error('useTrip() outside a trip')
  return data
}

/** The trip when inside one, null elsewhere (the trip form is used for both). */
export const useOptionalTrip = () => useContext(TripContext)

/** Absolute path inside a trip: tripPath(id, 'stays', stayId). */
export const tripPath = (tripId: string, ...parts: string[]) => ['/trips', tripId, ...parts].filter(Boolean).join('/')

export const nameOf = (t: TripData, travellerId: string) => t.names.get(travellerId) ?? 'Someone'

/** "Send the group an update" makes sense when someone on the trip only gets changes by link. */
export const needsLinks = (t: TripData) => t.unsent > 0 && t.travellers.length > 1 && t.viaLinks.some((x) => x.id !== t.me?.id)
