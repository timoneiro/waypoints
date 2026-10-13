import {
  emptyTables,
  type Activity,
  type Attachment,
  type Exchange,
  type Expense,
  type Place,
  type Review,
  type Stay,
  type Tables,
  type Transport,
  type Traveller,
  type Trip,
} from '../db/types.ts'

/** Test records: a four-day trip to Lisbon and Porto for Ana, Bo and Cy. */

export const T0 = '2026-10-01T10:00:00.000Z'
export const T1 = '2026-10-02T10:00:00.000Z'
export const T2 = '2026-10-03T10:00:00.000Z'

const meta = (id: string) => ({ id, createdAt: T0, updatedAt: T0 })
const TRIP = 'trip0001'
export const ANA = 'ana00001'
export const BO = 'bo000001'
export const CY = 'cy000001'

export const trip = (over: Partial<Trip> = {}): Trip => ({
  ...meta(TRIP),
  name: 'Lisbon & Porto',
  startDate: '2027-03-10',
  endDate: '2027-03-13',
  timeZone: 'Europe/Lisbon',
  currency: 'EUR',
  ...over,
})

export const traveller = (id: string, name: string, over: Partial<Traveller> = {}): Traveller => ({ ...meta(id), tripId: TRIP, name, ...over })

export const stay = (over: Partial<Stay> = {}): Stay => ({
  ...meta('stay0001'),
  tripId: TRIP,
  name: 'Casa Azul',
  kind: 'apartment',
  checkInDate: '2027-03-10',
  checkOutDate: '2027-03-12',
  timeZone: 'Europe/Lisbon',
  ...over,
})

export const transport = (over: Partial<Transport> = {}): Transport => ({
  ...meta('move0001'),
  tripId: TRIP,
  mode: 'train',
  from: 'Lisbon',
  to: 'Porto',
  departDate: '2027-03-12',
  departTimeZone: 'Europe/Lisbon',
  ...over,
})

export const activity = (over: Partial<Activity> = {}): Activity => ({
  ...meta('todo0001'),
  tripId: TRIP,
  title: 'Fado night',
  date: '2027-03-11',
  timeZone: 'Europe/Lisbon',
  ...over,
})

export const place = (over: Partial<Place> = {}): Place => ({
  ...meta('spot0001'),
  tripId: TRIP,
  name: 'Livraria Lello',
  category: 'sight',
  city: 'Porto',
  ...over,
})

export const expense = (over: Partial<Expense> = {}): Expense => ({
  ...meta('cost0001'),
  tripId: TRIP,
  title: 'Dinner',
  amount: 30,
  currency: 'EUR',
  date: '2027-03-10',
  category: 'food',
  paidBy: ANA,
  split: { kind: 'equal', among: [ANA, BO, CY] },
  ...over,
})

/** 10,000 JPY from a cash machine for 62.50 EUR, fees included: 160 JPY per EUR. */
export const exchange = (over: Partial<Exchange> = {}): Exchange => ({
  ...meta('cash0001'),
  tripId: TRIP,
  date: '2027-03-10',
  currency: 'JPY',
  amount: 10_000,
  cost: 62.5,
  costCurrency: 'EUR',
  by: ANA,
  ...over,
})

/** A photo of the fado night; its file is the three bytes FILE. */
export const FILE = new Uint8Array([1, 2, 3])
export const FILE_SHA256 = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'

export const attachment = (over: Partial<Attachment> = {}): Attachment => ({
  ...meta('file0001'),
  tripId: TRIP,
  kind: 'photo',
  name: 'Fado.jpg',
  type: 'image/jpeg',
  size: FILE.length,
  sha256: FILE_SHA256,
  takenAt: '2027-03-11T21:04',
  itemTable: 'activities',
  itemId: 'todo0001',
  addedBy: ANA,
  ...over,
})

export const tables = (over: Partial<Tables> = {}): Tables => ({ ...emptyTables(), ...over })

/** Ana's four stars for the fado night. */
export const review = (over: Partial<Review> = {}): Review => ({
  ...meta('rate0001'),
  tripId: TRIP,
  itemTable: 'activities',
  itemId: 'todo0001',
  by: ANA,
  stars: 4,
  ...over,
})
