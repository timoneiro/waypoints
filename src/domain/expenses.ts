import type { Day, Exchange, Expense, PaidWith } from '../db/types.ts'

/*
 * Shared expenses, Splitwise-style but offline. Expenses can be in any currency. Cash converts to the
 * trip's currency at the rate the trip's exchanges actually got (cash withdrawals, money changed),
 * fees included, so the totals say what things really cost. A card payment converts at what the bank
 * charged, once someone adds it. No exchange-rate API.
 */

export interface ExchangeRate {
  /** Units of the currency that one unit of the trip's currency bought. */
  rate: number
  /** How many exchanges it's averaged over. */
  count: number
}

/** Rate per currency: everything the exchanges got, over everything they cost in the trip's currency. */
export function exchangeRates(exchanges: Exchange[], tripCurrency: string): Map<string, ExchangeRate> {
  const sums = new Map<string, { amount: number; cost: number; count: number }>()
  for (const x of exchanges) {
    // Exchanges paid for in another currency (the trip's currency was changed since) can't say what this one buys.
    if (x.deletedAt || x.costCurrency !== tripCurrency || x.currency === tripCurrency || !(x.amount > 0) || !(x.cost > 0)) continue
    const sum = sums.get(x.currency) ?? { amount: 0, cost: 0, count: 0 }
    sum.amount += x.amount
    sum.cost += x.cost
    sum.count++
    sums.set(x.currency, sum)
  }
  return new Map([...sums].map(([currency, s]) => [currency, { rate: s.amount / s.cost, count: s.count }]))
}

/**
 * Cash left per foreign currency that has an exchange: everything the exchanges got, minus cash
 * expenses in it (group total, transfers and deleted records left out).
 */
export function cashLeft(exchanges: Exchange[], expenses: Expense[], tripCurrency: string): Map<string, number> {
  const left = new Map<string, number>()
  for (const x of exchanges) {
    if (x.deletedAt || x.currency === tripCurrency) continue
    left.set(x.currency, (left.get(x.currency) ?? 0) + x.amount)
  }
  for (const e of expenses) {
    if (e.deletedAt || e.transfer || !left.has(e.currency) || paidWithOf(e, tripCurrency) !== 'cash') continue
    left.set(e.currency, left.get(e.currency)! - e.amount)
  }
  return left
}

/** The rate an expense converts at, or undefined while its currency has none. */
export type RateOf = (expense: Pick<Expense, 'currency' | 'rate'>) => number | undefined

/** 1 for the trip's own currency, then the expense's own rate, then the exchanges'. */
export function rateFinder(tripCurrency: string, exchanges: Exchange[]): RateOf {
  const rates = exchangeRates(exchanges, tripCurrency)
  return (e) => (e.currency === tripCurrency ? 1 : (e.rate ?? rates.get(e.currency)?.rate))
}

/** An amount in an expense's currency, converted to the trip's currency. */
export const toTripCurrency = (amount: number, rate: number) => amount / rate

/** Expenses that can't be converted yet: their currency has no exchange, and they have no rate of their own. */
export const unconverted = (expenses: Expense[], rateOf: RateOf) => expenses.filter((e) => !e.deletedAt && !rateOf(e))

/**
 * A card payment still waiting for what the bank charged. Until then it converts at the exchanges'
 * rate, as an estimate (or not at all, while its currency has none).
 */
export const awaitingCost = (e: Pick<Expense, 'currency' | 'rate' | 'paidWith' | 'deletedAt'>, tripCurrency: string) =>
  !e.deletedAt && e.paidWith === 'card' && e.currency !== tripCurrency && !e.rate

/**
 * How an expense was paid, or undefined if it doesn't say. Older ones in another currency don't, but
 * convert as if they did: a rate of their own came from a card statement, else they're cash. In the
 * trip's own currency it changes nothing, so older ones there stay unsaid.
 */
export function paidWithOf(e: Pick<Expense, 'currency' | 'rate' | 'paidWith'>, tripCurrency: string): PaidWith | undefined {
  if (e.paidWith === 'cash' || e.paidWith === 'card') return e.paidWith
  if (e.currency === tripCurrency) return undefined
  return e.rate ? 'card' : 'cash'
}

/**
 * How a new expense in a currency was likely paid: like the last one in it that says, else cash once
 * money was changed for it, else card. Payments between travellers: cash abroad, card or bank at home.
 */
export function likelyPaidWith(
  expenses: Expense[],
  currency: string,
  { tripCurrency, exchanged, transfer }: { tripCurrency: string; exchanged: boolean; transfer?: boolean },
): PaidWith {
  if (transfer) return currency === tripCurrency ? 'card' : 'cash'
  const said = expenses.filter((e) => !e.deletedAt && !e.transfer && e.currency === currency && paidWithOf(e, tripCurrency))
  const last = said.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return (last && paidWithOf(last, tripCurrency)) ?? (exchanged ? 'cash' : 'card')
}

/** Each traveller's part of an expense, in the expense's own currency. */
export function sharesOf(expense: Pick<Expense, 'amount' | 'split'>): Map<string, number> {
  const shares = new Map<string, number>()
  if (expense.split.kind === 'equal') {
    const among = [...new Set(expense.split.among)]
    for (const id of among) shares.set(id, expense.amount / among.length)
  } else {
    for (const [id, amount] of Object.entries(expense.split.amounts)) if (amount > 0) shares.set(id, amount)
  }
  return shares
}

export interface Balance {
  /** Spending this traveller paid for. */
  paid: number
  /** This traveller's part of the spending. */
  share: number
  /** Positive: the others owe them this much. Negative: they owe it. Includes settle-up payments. */
  net: number
}

/** Balances in the trip's currency. Expenses that can't be converted yet are left out. */
export function balances(expenses: Expense[], rateOf: RateOf, travellerIds: string[] = []): Map<string, Balance> {
  const result = new Map<string, Balance>(travellerIds.map((id) => [id, { paid: 0, share: 0, net: 0 }]))
  const of = (id: string) => {
    let balance = result.get(id)
    if (!balance) result.set(id, (balance = { paid: 0, share: 0, net: 0 }))
    return balance
  }
  for (const expense of expenses) {
    const rate = rateOf(expense)
    if (expense.deletedAt || !rate) continue
    const payer = of(expense.paidBy)
    const value = toTripCurrency(expense.amount, rate)
    payer.net += value
    if (!expense.transfer) payer.paid += value
    for (const [id, amount] of sharesOf(expense)) {
      const part = toTripCurrency(amount, rate)
      of(id).net -= part
      if (!expense.transfer) of(id).share += part
    }
  }
  return result
}

export interface Payment {
  from: string
  to: string
  amount: number
}

/**
 * Payments that bring every balance to zero, in whole cents: whoever owes most pays whoever is owed
 * most, until everyone is square. At most one payment fewer than there are travellers.
 */
export function settleUp(nets: Map<string, number>): Payment[] {
  const inCents = [...nets].map(([id, net]) => ({ id, cents: Math.round(net * 100) }))
  const byCents = (a: { id: string; cents: number }, b: { id: string; cents: number }) => b.cents - a.cents || a.id.localeCompare(b.id)
  const owed = inCents.filter((x) => x.cents > 0).sort(byCents)
  const owing = inCents.filter((x) => x.cents < 0).map((x) => ({ id: x.id, cents: -x.cents })).sort(byCents)
  const payments: Payment[] = []
  for (let i = 0, j = 0; i < owing.length && j < owed.length; ) {
    const cents = Math.min(owing[i].cents, owed[j].cents)
    payments.push({ from: owing[i].id, to: owed[j].id, amount: cents / 100 })
    owing[i].cents -= cents
    owed[j].cents -= cents
    if (!owing[i].cents) i++
    if (!owed[j].cents) j++
  }
  return payments
}

export interface Totals {
  total: number
  byCategory: Map<string, number>
  byDay: Map<Day, number>
}

/** Spending in the trip's currency. Settle-up payments aren't spending; unconverted expenses are left out. */
export function totals(expenses: Expense[], rateOf: RateOf): Totals {
  const result: Totals = { total: 0, byCategory: new Map(), byDay: new Map() }
  for (const e of expenses) {
    const rate = rateOf(e)
    if (e.deletedAt || e.transfer || !rate) continue
    const value = toTripCurrency(e.amount, rate)
    result.total += value
    result.byCategory.set(e.category, (result.byCategory.get(e.category) ?? 0) + value)
    result.byDay.set(e.date, (result.byDay.get(e.date) ?? 0) + value)
  }
  return result
}

export interface PaymentSplit {
  card: number
  cash: number
  /** Expenses that don't say how they were paid. */
  unsaid: number
}

/** Spending in the trip's currency by how it was paid. Same expenses as `totals`, so the three add up to its total. */
export function paymentSplit(expenses: Expense[], rateOf: RateOf, tripCurrency: string): PaymentSplit {
  const result: PaymentSplit = { card: 0, cash: 0, unsaid: 0 }
  for (const e of expenses) {
    const rate = rateOf(e)
    if (e.deletedAt || e.transfer || !rate) continue
    result[paidWithOf(e, tripCurrency) ?? 'unsaid'] += toTripCurrency(e.amount, rate)
  }
  return result
}

/** "12,50" or "12.50" → 12.5. Undefined for anything that isn't a plain positive number. */
export function parseAmount(text: string): number | undefined {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) return undefined
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : undefined
}
