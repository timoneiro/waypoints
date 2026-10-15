import { emptyTables, type Day, type Expense, type Review, type Split, type Time } from '../../src/db/types.ts'
import { reviewId } from '../../src/domain/reviews.ts'
import { buildBackup, type Backup } from '../../src/domain/sync.ts'

/**
 * The fictional trip the user guide's screenshots show: "Japan in spring", three travellers, 8 to 15
 * April 2026. Fixed dates and timestamps, so the screenshots can be made again.
 */

const STAMP = '2026-04-01T09:00:00.000Z'
const meta = () => ({ id: crypto.randomUUID(), createdAt: STAMP, updatedAt: STAMP })

const LISBON = 'Europe/Lisbon'
const TOKYO = 'Asia/Tokyo'

// Async because review ids come from `reviewId`, which hashes with Web Crypto.
export async function demoBackup(): Promise<Backup> {
  const tables = emptyTables()
  const tripId = crypto.randomUUID()
  tables.trips.push({
    ...meta(), id: tripId, name: 'Japan in spring', emoji: '🌸', startDate: '2026-04-08', endDate: '2026-04-15', timeZone: TOKYO, currency: 'EUR',
  })

  const traveller = (name: string) => ({ ...meta(), tripId, name })
  const [ana, ben, chloe] = [traveller('Ana'), traveller('Ben'), traveller('Chloé')]
  tables.travellers.push(ana, ben, chloe)
  const everyone = [ana.id, ben.id, chloe.id]

  const stay = (name: string, kind: 'hotel' | 'apartment', city: string, address: string, inDate: Day, outDate: Day, confirmation: string) => ({
    ...meta(), tripId, name, kind, city, address, checkInDate: inDate, checkInTime: '15:00' as Time, checkOutDate: outDate, checkOutTime: '11:00' as Time,
    timeZone: TOKYO, confirmation,
  })
  const tokyoStay = stay('Hotel Sakura', 'hotel', 'Tokyo', '1-2-3 Asakusa, Taito City, Tokyo', '2026-04-09', '2026-04-12', 'SAKURA-48213')
  const kyotoStay = stay('Gion Machiya', 'apartment', 'Kyoto', '45 Gionmachi, Higashiyama Ward, Kyoto', '2026-04-12', '2026-04-15', 'MACHIYA-7731')
  tables.stays.push(tokyoStay, kyotoStay)

  const flight = {
    ...meta(), tripId, mode: 'flight' as const, from: 'Lisbon (LIS)', to: 'Tokyo (HND)', departDate: '2026-04-08', departTime: '10:30' as Time,
    departTimeZone: LISBON, arriveDate: '2026-04-09', arriveTime: '09:15' as Time, arriveTimeZone: TOKYO, carrier: 'Demo Air', number: 'DA 207',
    seat: '23A-C', confirmation: 'XK4T9Q',
  }
  const train = {
    ...meta(), tripId, mode: 'train' as const, from: 'Tokyo', to: 'Kyoto', departDate: '2026-04-12', departTime: '09:30' as Time, departTimeZone: TOKYO,
    arriveDate: '2026-04-12', arriveTime: '11:45' as Time, arriveTimeZone: TOKYO, carrier: 'Shinkansen', number: 'Nozomi 15', confirmation: 'JR-558120',
  }
  tables.transports.push(flight, train)

  const place = (
    name: string, category: 'sight' | 'museum' | 'nature' | 'food', city: string, address: string, extra: { mustSee?: boolean; visited?: boolean } = {},
  ) => ({ ...meta(), tripId, name, category, city, address, ...extra })
  const senso = place('Senso-ji Temple', 'sight', 'Tokyo', '2-3-1 Asakusa, Taito City', { mustSee: true, visited: true })
  const teamlab = place('teamLab Planets', 'museum', 'Tokyo', '6-1-16 Toyosu, Koto City', { mustSee: true })
  const ramen = place('Ichiran Ramen Shibuya', 'food', 'Tokyo', '1-22-7 Jinnan, Shibuya City', { visited: true })
  const fushimi = place('Fushimi Inari Shrine', 'sight', 'Kyoto', '68 Fukakusa Yabunouchicho, Fushimi Ward', { mustSee: true, visited: true })
  const bamboo = place('Arashiyama Bamboo Grove', 'nature', 'Kyoto', 'Sagaogurayama, Ukyo Ward', { visited: true })
  const nishiki = place('Nishiki Market', 'food', 'Kyoto', 'Nishikikoji-dori, Nakagyo Ward')
  tables.places.push(senso, teamlab, ramen, fushimi, bamboo, nishiki)

  const visit = (p: typeof senso, date: Day, startTime: Time, endTime: Time) => ({
    ...meta(), tripId, title: p.name, date, startTime, endTime, timeZone: TOKYO, city: p.city, address: p.address, placeId: p.id,
  })
  const sensoVisit = visit(senso, '2026-04-10', '09:00', '11:00')
  const teamlabVisit = visit(teamlab, '2026-04-10', '14:00', '16:30')
  const fushimiVisit = visit(fushimi, '2026-04-13', '08:00', '10:30')
  const bambooVisit = visit(bamboo, '2026-04-14', '09:30', '12:00')
  tables.activities.push(sensoVisit, teamlabVisit, fushimiVisit, bambooVisit)

  const exchange = (by: string, date: Day, amount: number, cost: number) => ({ ...meta(), tripId, date, currency: 'JPY', amount, cost, costCurrency: 'EUR', by })
  tables.exchanges.push(exchange(ana.id, '2026-04-09', 50000, 305), exchange(ben.id, '2026-04-12', 30000, 187))

  const expense = (
    title: string, amount: number, currency: string, date: Day, category: Expense['category'], paidBy: string, split: Split, extra: Partial<Expense> = {},
  ): Expense => ({ ...meta(), tripId, title, amount, currency, date, category, paidBy, split, ...extra })
  const equal: Split = { kind: 'equal', among: everyone }
  tables.expenses.push(
    expense('Flights Lisbon to Tokyo', 1650, 'EUR', '2026-03-20', 'transport', ana.id, equal, { paidWith: 'card' }),
    expense('Hotel Sakura', 540, 'EUR', '2026-04-09', 'stay', ben.id, equal, { paidWith: 'card' }),
    expense('Ramen dinner', 4800, 'JPY', '2026-04-09', 'food', chloe.id, equal, { paidWith: 'cash' }),
    expense('Subway cards', 6000, 'JPY', '2026-04-09', 'transport', ana.id, equal, { paidWith: 'cash' }),
    expense('teamLab tickets', 12600, 'JPY', '2026-04-10', 'activities', ben.id, equal, { paidWith: 'card', rate: 163.2 }),
    // A card payment with no rate yet: shows as "cost pending".
    expense('Shinkansen to Kyoto', 41400, 'JPY', '2026-04-12', 'transport', ana.id, equal, { paidWith: 'card' }),
    expense('Sushi lunch', 9300, 'JPY', '2026-04-13', 'food', ben.id, { kind: 'exact', amounts: { [ana.id]: 3500, [ben.id]: 3000, [chloe.id]: 2800 } }, { paidWith: 'cash' }),
    expense('Souvenirs', 7200, 'JPY', '2026-04-14', 'shopping', chloe.id, { kind: 'exact', amounts: { [chloe.id]: 7200 } }, { paidWith: 'cash' }),
  )

  const review = async (table: 'activities' | 'stays', itemId: string, by: string, fields: Pick<Review, 'stars' | 'note' | 'missed'>): Promise<Review> => ({
    id: await reviewId(tripId, itemId, by), createdAt: STAMP, updatedAt: STAMP, tripId, itemTable: table, itemId, by, ...fields,
  })
  tables.reviews.push(
    await review('activities', sensoVisit.id, ana.id, { stars: 5, note: 'Go early, before the crowds.' }),
    await review('activities', sensoVisit.id, ben.id, { stars: 4 }),
    await review('activities', sensoVisit.id, chloe.id, { stars: 5, note: 'The incense smoke was magical.' }),
    await review('activities', teamlabVisit.id, ana.id, { stars: 5 }),
    await review('activities', teamlabVisit.id, ben.id, { stars: 4, note: 'Wear shorts, you walk through water.' }),
    await review('activities', teamlabVisit.id, chloe.id, { missed: true }),
    await review('activities', fushimiVisit.id, ana.id, { stars: 5, note: 'Worth the climb.' }),
    await review('activities', fushimiVisit.id, ben.id, { stars: 5 }),
    await review('activities', fushimiVisit.id, chloe.id, { stars: 4 }),
    await review('stays', kyotoStay.id, ana.id, { stars: 5, note: 'Quiet street, lovely wooden house.' }),
    await review('stays', kyotoStay.id, ben.id, { stars: 4 }),
    await review('stays', kyotoStay.id, chloe.id, { stars: 5 }),
  )

  return buildBackup(tables, new Date(STAMP))
}
