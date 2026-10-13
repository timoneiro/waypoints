import type { RecordTable, TableRecords } from '../db/types.ts'
import { isDay, isTime } from './time.ts'

/*
 * Shape checks for records from outside this phone: trip links, backup files and the sync server
 * (which runs the same checks on what phones send it). Anyone can craft a link, so nothing is trusted. Fields this version doesn't know are kept as they are, so a record
 * from a newer version of the app survives a round trip through an older one.
 */

/** A problem with a link or file, with a message for people. */
export class DataError extends Error {}

type Check = (value: unknown) => boolean

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (max: number): Check => (v) => typeof v === 'string' && v.length <= max
const SHORT = text(200)
const LONG = text(10_000)
const URL_TEXT = text(2_000)
/** Kinds, modes and categories: open-ended, so newer values from other phones are accepted. */
const WORD = text(40)
const ZONE: Check = (v) => typeof v === 'string' && /^[A-Za-z0-9_+\-/]{1,64}$/.test(v)
const bool: Check = (v) => typeof v === 'boolean'
const currency: Check = (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v)
const money: Check = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12
const rate: Check = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e9
const positive: Check = (v) => money(v) && (v as number) > 0
const count = (max: number): Check => (v) => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= max
const mediaType: Check = (v) => typeof v === 'string' && /^[\w.+-]{1,40}\/[\w.+-]{1,120}$/.test(v)
const sha256: Check = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
/** A wall-clock time, "YYYY-MM-DDTHH:MM". */
const wallClock: Check = (v) => typeof v === 'string' && v.length === 16 && v[10] === 'T' && isDay(v.slice(0, 10)) && isTime(v.slice(11))

/** Largest file any attachment can have. Servers set their own, lower limit. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024

export const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{8,64}$/.test(v)

/** Exactly what `Date.toISOString()` writes, so timestamps compare correctly as strings. */
export const isTimestamp = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && !Number.isNaN(Date.parse(v))

const split: Check = (v) => {
  if (!isObject(v)) return false
  if (v.kind === 'equal') return Array.isArray(v.among) && v.among.length <= 100 && v.among.every(isId)
  if (v.kind === 'exact') {
    return isObject(v.amounts) && Object.keys(v.amounts).length <= 100 && Object.entries(v.amounts).every(([id, a]) => isId(id) && money(a))
  }
  return false
}

const required = (check: Check) => ({ check, required: true })
const optional = (check: Check) => ({ check, required: false })

const SPECS: { [T in RecordTable]: Record<string, { check: Check; required: boolean }> } = {
  trips: {
    name: required(SHORT),
    emoji: optional(text(16)),
    startDate: required(isDay),
    endDate: required(isDay),
    timeZone: required(ZONE),
    currency: required(currency),
    notes: optional(LONG),
  },
  travellers: { tripId: required(isId), name: required(text(60)), memberId: optional(isId), linkedAt: optional(isTimestamp) },
  stays: {
    tripId: required(isId),
    name: required(SHORT),
    kind: required(WORD),
    city: optional(SHORT),
    address: optional(text(500)),
    checkInDate: required(isDay),
    checkInTime: optional(isTime),
    checkOutDate: required(isDay),
    checkOutTime: optional(isTime),
    timeZone: required(ZONE),
    confirmation: optional(SHORT),
    phone: optional(text(40)),
    link: optional(URL_TEXT),
    notes: optional(LONG),
  },
  transports: {
    tripId: required(isId),
    mode: required(WORD),
    from: required(SHORT),
    to: required(SHORT),
    departDate: required(isDay),
    departTime: optional(isTime),
    departTimeZone: required(ZONE),
    arriveDate: optional(isDay),
    arriveTime: optional(isTime),
    arriveTimeZone: optional(ZONE),
    carrier: optional(SHORT),
    number: optional(text(40)),
    seat: optional(text(40)),
    confirmation: optional(SHORT),
    link: optional(URL_TEXT),
    notes: optional(LONG),
  },
  activities: {
    tripId: required(isId),
    title: required(SHORT),
    date: required(isDay),
    startTime: optional(isTime),
    endTime: optional(isTime),
    timeZone: required(ZONE),
    city: optional(SHORT),
    address: optional(text(500)),
    placeId: optional(isId),
    confirmation: optional(SHORT),
    link: optional(URL_TEXT),
    notes: optional(LONG),
  },
  places: {
    tripId: required(isId),
    name: required(SHORT),
    category: required(WORD),
    city: optional(SHORT),
    address: optional(text(500)),
    link: optional(URL_TEXT),
    notes: optional(LONG),
    mustSee: optional(bool),
    visited: optional(bool),
  },
  expenses: {
    tripId: required(isId),
    title: required(SHORT),
    amount: required(money),
    currency: required(currency),
    rate: optional(rate),
    paidWith: optional(WORD),
    date: required(isDay),
    category: required(WORD),
    paidBy: required(isId),
    split: required(split),
    transfer: optional(bool),
    notes: optional(LONG),
  },
  exchanges: {
    tripId: required(isId),
    date: required(isDay),
    currency: required(currency),
    amount: required(positive),
    cost: required(positive),
    costCurrency: required(currency),
    by: optional(isId),
    notes: optional(LONG),
  },
  attachments: {
    tripId: required(isId),
    kind: required(WORD),
    name: required(SHORT),
    caption: optional(LONG),
    type: required(mediaType),
    size: required(count(MAX_FILE_BYTES)),
    sha256: required(sha256),
    width: optional(count(100_000)),
    height: optional(count(100_000)),
    takenAt: optional(wallClock),
    itemTable: optional(WORD),
    itemId: optional(isId),
    wholeBooking: optional(bool),
    addedBy: optional(isId),
    private: optional(bool),
  },
}

/** Clock skew allowed between phones. Anything later is refused, or it would win every merge forever. */
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000

export function checkRecord<T extends RecordTable>(table: T, raw: unknown, now = Date.now()): asserts raw is TableRecords[T] {
  const invalid = () => new DataError(`It contains an invalid ${table.replace(/s$/, '')}.`)
  if (!isObject(raw) || !isId(raw.id) || !isTimestamp(raw.createdAt) || !isTimestamp(raw.updatedAt)) throw invalid()
  if (raw.deletedAt !== undefined && !isTimestamp(raw.deletedAt)) throw invalid()
  if (Date.parse(raw.updatedAt) > now + MAX_FUTURE_MS || (typeof raw.linkedAt === 'string' && Date.parse(raw.linkedAt) > now + MAX_FUTURE_MS)) {
    throw new DataError("It has changes dated in the future. Check the date and time on the phone that sent it.")
  }
  for (const [field, { check, required }] of Object.entries(SPECS[table])) {
    const value = raw[field]
    if (value === undefined ? required : !check(value)) throw invalid()
  }
}
