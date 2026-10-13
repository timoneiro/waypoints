import type { FileInfo } from '../domain/serverProtocol.ts'

/**
 * Persisted records. Everything that belongs to a trip carries `id`, `createdAt`, `updatedAt` and
 * an optional `deletedAt` tombstone, so the copies of a trip on different phones can be merged
 * record by record (newest `updatedAt` wins, deletions included) instead of overwriting each other.
 */

export type ISODate = string
/** Calendar day, "YYYY-MM-DD". */
export type Day = string
/** Wall-clock time, "HH:MM" (24-hour). */
export type Time = string

export interface SyncMeta {
  id: string
  createdAt: ISODate
  updatedAt: ISODate
  deletedAt?: ISODate
}

export interface Trip extends SyncMeta {
  name: string
  emoji?: string
  startDate: Day
  endDate: Day
  /** IANA time zone that new bookings default to. */
  timeZone: string
  /** ISO 4217 code that totals and balances are shown in. */
  currency: string
  notes?: string
}

/** A record that belongs to one trip. */
export interface TripRecord extends SyncMeta {
  tripId: string
}

export interface Traveller extends TripRecord {
  name: string
  /**
   * For a trip on the sync server: the server member this traveller is. The server lets a trip be
   * seen only by the members its travellers are linked to. Travellers without one use links.
   */
  memberId?: string
  /**
   * When `memberId` was last set or cleared. The link merges on this clock, apart from the rest of the
   * traveller, so an edit made on an older copy (a rename, say) can't undo a link or an unlink.
   */
  linkedAt?: ISODate
}

/*
 * Kinds, modes and categories are stored as plain strings: a link from a newer version of the app may
 * use one this version doesn't know yet, which then shows as "other".
 */

export const STAY_KINDS = ['hotel', 'apartment', 'hostel', 'house', 'camping', 'other'] as const
export type StayKind = (typeof STAY_KINDS)[number]

export interface Stay extends TripRecord {
  name: string
  kind: StayKind
  city?: string
  address?: string
  checkInDate: Day
  checkInTime?: Time
  checkOutDate: Day
  checkOutTime?: Time
  /** Time zone the check-in and check-out times are in. */
  timeZone: string
  confirmation?: string
  phone?: string
  link?: string
  notes?: string
}

export const TRANSPORT_MODES = ['flight', 'train', 'bus', 'car', 'ferry', 'other'] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]

export interface Transport extends TripRecord {
  mode: TransportMode
  from: string
  to: string
  departDate: Day
  departTime?: Time
  departTimeZone: string
  arriveDate?: Day
  arriveTime?: Time
  /** Defaults to `departTimeZone`. */
  arriveTimeZone?: string
  carrier?: string
  /** Flight or train number. */
  number?: string
  seat?: string
  confirmation?: string
  link?: string
  notes?: string
}

export interface Activity extends TripRecord {
  title: string
  date: Day
  startTime?: Time
  endTime?: Time
  timeZone: string
  city?: string
  address?: string
  /** The saved place it was planned from, if any. */
  placeId?: string
  confirmation?: string
  link?: string
  notes?: string
}

export const PLACE_CATEGORIES = ['sight', 'museum', 'nature', 'food', 'drinks', 'shopping', 'other'] as const
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number]

export interface Place extends TripRecord {
  name: string
  category: PlaceCategory
  city?: string
  address?: string
  /** A Google/Apple Maps link or the place's website. */
  link?: string
  notes?: string
  mustSee?: boolean
  visited?: boolean
}

export const EXPENSE_CATEGORIES = ['food', 'groceries', 'transport', 'stay', 'activities', 'shopping', 'other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/** Who an expense is for: split equally, or exact amounts (in the expense's currency) per traveller. */
export type Split = { kind: 'equal'; among: string[] } | { kind: 'exact'; amounts: Record<string, number> }

export const PAID_WITH = ['cash', 'card'] as const
export type PaidWith = (typeof PAID_WITH)[number]

export interface Expense extends TripRecord {
  title: string
  amount: number
  currency: string
  /**
   * The rate this expense alone converts at (what the bank charged for a card payment): how many
   * units of `currency` one unit of the trip's currency was worth ("1 EUR = 161.5 JPY" is 161.5).
   * Without it, the expense converts at the rate the trip's exchanges got (see Exchange).
   */
  rate?: number
  /**
   * How an expense in another currency was paid. Cash converts at what the exchanges got. A card
   * payment converts at what the bank charged (`rate`), which can take days to show up: until it's
   * added, the payment counts at the exchanges' rate as an estimate, and is flagged. Older records
   * have none, and convert at their own rate if they have one.
   */
  paidWith?: PaidWith
  date: Day
  category: ExpenseCategory
  /** Traveller id. */
  paidBy: string
  split: Split
  /** A payment between travellers to settle up rather than spending: `split` is the one recipient. */
  transfer?: boolean
  notes?: string
}

/**
 * Money changed or withdrawn in another currency: what you got, and what it cost in the trip's
 * currency, fees included. Expenses in that currency convert at the rate these actually got.
 */
export interface Exchange extends TripRecord {
  date: Day
  /** Currency received, e.g. JPY. */
  currency: string
  /** How much of it. */
  amount: number
  /** What it cost, fees included. */
  cost: number
  /** Currency of `cost`: the trip's currency when it was added. */
  costCurrency: string
  /** Traveller who changed it. */
  by?: string
  notes?: string
}

export const ATTACHMENT_KINDS = ['photo', 'document'] as const
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]

/** Items a photo or document can belong to. Without one, it belongs to the whole trip. */
export const ATTACHABLE_TABLES = ['stays', 'transports', 'activities', 'places', 'expenses'] as const
export type AttachableTable = (typeof ATTACHABLE_TABLES)[number]

/**
 * A photo or document of a trip: of the whole trip, or of one of its items. The record merges like
 * any other, while the file itself is kept apart (StoredFile on each phone, the files folder on the
 * sync server). Attachments travel only through the sync server: links and trip files can't carry
 * the files, so they leave the records out too.
 */
export interface Attachment extends TripRecord {
  /** Plain string: a kind from a newer version of the app shows as a document. */
  kind: AttachmentKind
  /** File name: "Boarding pass.pdf". */
  name: string
  caption?: string
  /** Media type of the file: "image/jpeg", "application/pdf"… */
  type: string
  /** Size of the file, in bytes. */
  size: number
  /** SHA-256 of the file, in hex. The server only takes the file that matches it. */
  sha256: string
  /** Pixel size, for images. */
  width?: number
  height?: number
  /** For photos: when it was taken, as the wall-clock time where it was taken ("YYYY-MM-DDTHH:MM"). */
  takenAt?: string
  /** The item it belongs to (one of ATTACHABLE_TABLES, stored as a plain string). None: the whole trip. */
  itemTable?: string
  itemId?: string
  /**
   * For one of a journey: it's for every journey on the same booking (the same booking ref, see
   * src/domain/bookings.ts), such as an e-ticket for connecting flights. Versions before 0.6.0 show
   * it on its own journey only.
   */
  wholeBooking?: boolean
  /** Traveller who added it. */
  addedBy?: string
  /** Kept only on the phone that added it: never sent to the sync server, so nobody else sees it. */
  private?: boolean
}

/** Items people can review. */
export const REVIEWABLE_TABLES = ['activities', 'places', 'stays', 'transports'] as const
export type ReviewableTable = (typeof REVIEWABLE_TABLES)[number]

/** The most stars a review can give (and the fewest is 1). */
export const MAX_STARS = 5

/**
 * One traveller's review of an activity, place, stay or journey: stars and a note, or that they
 * didn't go. Everyone's is a record of its own, so reviews written on different phones merge without
 * overwriting each other. Its id comes from the trip, the item and the traveller (see reviewId in
 * src/domain/reviews.ts), so someone reviewing on two phones still has one review.
 */
export interface Review extends TripRecord {
  /** The item's table: one of REVIEWABLE_TABLES, stored as a plain string. */
  itemTable: string
  itemId: string
  /** Traveller whose review it is. */
  by: string
  /** 1 to MAX_STARS. None when they didn't go, or only wrote a note. */
  stars?: number
  note?: string
  /** They didn't go, so it's not theirs to rate. */
  missed?: boolean
}

/**
 * The trip's report (spending, reviews, highlights), kept on the sync server once the trip is over,
 * so it's made once and everyone opens the same one. One per trip: its id comes from the trip's (see
 * reportId in src/domain/report.ts), so phones that make it at the same time still end up with one.
 * It travels only through the sync server, like attachments: trips that aren't on one make their
 * report afresh each time it's opened.
 */
export interface Report extends TripRecord {
  /**
   * The report as it was made: a TripReport (src/domain/report.ts), with its `format`. It comes from
   * other phones, so it's only shown through readReport, which checks every part of it.
   */
  data: Record<string, unknown>
  /** Traveller who made it. */
  madeBy?: string
}

/**
 * What trip links carry, all in LINK_VERSION 1. Reviews came in 0.8.0: older versions of the app
 * open links that have them, leaving the reviews out. Attachments and reports travel only through
 * the sync server.
 */
export const LINK_TABLES = ['travellers', 'stays', 'transports', 'activities', 'places', 'expenses', 'exchanges', 'reviews'] as const
export type LinkTable = (typeof LINK_TABLES)[number]
export const TRIP_TABLES = [...LINK_TABLES, 'attachments', 'reports'] as const
export type TripTable = (typeof TRIP_TABLES)[number]
export type RecordTable = 'trips' | TripTable
export const RECORD_TABLES: readonly RecordTable[] = ['trips', ...TRIP_TABLES]

export interface TableRecords {
  trips: Trip
  travellers: Traveller
  stays: Stay
  transports: Transport
  activities: Activity
  places: Place
  expenses: Expense
  exchanges: Exchange
  reviews: Review
  attachments: Attachment
  reports: Report
}

/** Records of any number of trips, by table. The shape of backups, trip files and merges. */
export type Tables = { [T in RecordTable]: TableRecords[T][] }

export const emptyTables = (): Tables => ({
  trips: [],
  travellers: [],
  stays: [],
  transports: [],
  activities: [],
  places: [],
  expenses: [],
  exchanges: [],
  reviews: [],
  attachments: [],
  reports: [],
})

/** Local-only key/value settings (never shared or exported). */
export interface SettingEntry {
  key: string
  value: unknown
}

/** A record changed on this phone since the trip was last sent to the group. */
export interface UnsentEntry {
  table: RecordTable
  id: string
  tripId: string
}

/**
 * A record changed on this phone that the sync server hasn't had yet. Noted for every trip but only
 * sent for trips on the server, so moving a trip there later loses nothing.
 */
export interface OutboxEntry {
  table: RecordTable
  id: string
  tripId: string
}

/** How far this phone has synced a trip that's on the sync server. Local only. */
export interface ServerTrip {
  tripId: string
  /** The server's change number for the trip that this phone has pulled up to (0: nothing yet). */
  cursor: number
  /** False until every record this phone has of the trip has been sent once. */
  uploaded: boolean
  /** The trip's files the server has, as of the last sync. Absent: an older server, which keeps no files. */
  files?: FileInfo[]
}

/**
 * The file of a photo or document on this phone (see Attachment). Local only: never in links, files,
 * backups or safety copies, which would grow too big. Removed only with its attachment (deleted here
 * or by someone else) or with the whole trip.
 */
export interface StoredFile {
  /** The attachment's id. */
  id: string
  tripId: string
  /** The file itself. Someone else's photo has only its preview until it's opened. */
  blob?: Blob
  /** A small JPEG preview for lists, for images. */
  thumb?: Blob
  /** Why the server refused the file. It isn't sent again until someone tries again. */
  uploadError?: string
}

/** Automatic local backup taken before an operation that removes or overwrites data. */
export interface Snapshot {
  id?: number
  createdAt: ISODate
  reason: string
  /** Serialised Backup JSON. */
  data: string
  trips: number
}
