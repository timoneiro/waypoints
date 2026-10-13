import { describe, expect, it } from 'vitest'
import { ANA, BO, CY, exchange, expense, T1 } from '../test/fixtures'
import type { Expense, PaidWith } from '../db/types'
import { awaitingCost, balances, exchangeRates, likelyPaidWith, paidWithOf, parseAmount, rateFinder, settleUp, sharesOf, totals, unconverted } from './expenses'

/** A trip in EUR, without exchanges unless given. */
const inEuros = (exchanges = [exchange({ deletedAt: '2026-10-02T10:00:00.000Z' })]) => rateFinder('EUR', exchanges)
const nets = (b: ReturnType<typeof balances>) => Object.fromEntries([...b].map(([id, x]) => [id, Math.round(x.net * 100) / 100]))

describe('sharesOf', () => {
  it('splits equally, ignoring duplicates', () => {
    expect([...sharesOf(expense({ amount: 30, split: { kind: 'equal', among: [ANA, BO, BO, CY] } }))]).toEqual([
      [ANA, 10],
      [BO, 10],
      [CY, 10],
    ])
  })

  it('uses exact amounts', () => {
    expect([...sharesOf(expense({ amount: 30, split: { kind: 'exact', amounts: { [ANA]: 5, [BO]: 25, [CY]: 0 } } }))]).toEqual([
      [ANA, 5],
      [BO, 25],
    ])
  })
})

describe('exchange rates', () => {
  it('come from what the exchanges got for what they cost', () => {
    expect(exchangeRates([exchange()], 'EUR').get('JPY')).toEqual({ rate: 160, count: 1 })
  })

  it('average several exchanges by amount, fees included', () => {
    // 10,000 JPY for 62.50 EUR, then 20,000 JPY for 137.50 EUR: 30,000 JPY for 200 EUR in all.
    const rates = exchangeRates([exchange(), exchange({ id: 'cash0002', amount: 20_000, cost: 137.5 })], 'EUR')
    expect(rates.get('JPY')).toEqual({ rate: 150, count: 2 })
  })

  it('ignore deleted exchanges and ones paid in another currency', () => {
    const rates = exchangeRates([exchange({ deletedAt: '2026-10-02T10:00:00.000Z' }), exchange({ id: 'cash0002', costCurrency: 'USD' })], 'EUR')
    expect(rates.size).toBe(0)
  })

  it('convert expenses automatically, unless they have their own rate', () => {
    const rateOf = rateFinder('EUR', [exchange()])
    expect(rateOf({ currency: 'EUR' })).toBe(1)
    expect(rateOf({ currency: 'JPY' })).toBe(160)
    expect(rateOf({ currency: 'JPY', rate: 155 })).toBe(155)
    expect(rateOf({ currency: 'USD' })).toBeUndefined()
  })

  it('estimate card payments until what the bank charged is added', () => {
    const sushi = expense({ amount: 3_200, currency: 'JPY', paidWith: 'card', split: { kind: 'equal', among: [ANA] } })
    const rateOf = rateFinder('EUR', [exchange()])
    expect(awaitingCost(sushi, 'EUR')).toBe(true)
    expect(totals([sushi], rateOf).total).toBe(20)
    // The bank charged 21.33 EUR.
    const charged = { ...sushi, rate: 3_200 / 21.33 }
    expect(awaitingCost(charged, 'EUR')).toBe(false)
    expect(totals([charged], rateOf).total).toBeCloseTo(21.33, 10)
  })

  it('wait for what the bank charged only on card payments in another currency', () => {
    expect(awaitingCost(expense({ currency: 'JPY', paidWith: 'cash' }), 'EUR')).toBe(false)
    expect(awaitingCost(expense({ currency: 'JPY' }), 'EUR')).toBe(false)
    expect(awaitingCost(expense({ currency: 'EUR', paidWith: 'card' }), 'EUR')).toBe(false)
    expect(awaitingCost(expense({ currency: 'JPY', paidWith: 'card', deletedAt: T1 }), 'EUR')).toBe(false)
  })

  it('say how older expenses in another currency were paid, from how they convert', () => {
    expect(paidWithOf(expense({ currency: 'JPY' }), 'EUR')).toBe('cash')
    expect(paidWithOf(expense({ currency: 'JPY', rate: 155 }), 'EUR')).toBe('card')
    expect(paidWithOf(expense({ currency: 'JPY', paidWith: 'card' }), 'EUR')).toBe('card')
  })

  it("leave older expenses in the trip's currency unsaid", () => {
    expect(paidWithOf(expense({ currency: 'EUR' }), 'EUR')).toBeUndefined()
    expect(paidWithOf(expense({ currency: 'EUR', paidWith: 'cash' }), 'EUR')).toBe('cash')
    expect(paidWithOf(expense({ currency: 'EUR', paidWith: 'card' }), 'EUR')).toBe('card')
    // A newer app's way of paying isn't one this one knows.
    expect(paidWithOf(expense({ currency: 'EUR', paidWith: 'voucher' as PaidWith }), 'EUR')).toBeUndefined()
  })

  it('apply to expenses added before the exchange, too', () => {
    const ramen = expense({ amount: 1_600, currency: 'JPY', split: { kind: 'equal', among: [ANA] } })
    expect(unconverted([ramen], inEuros())).toEqual([ramen])
    expect(totals([ramen], inEuros()).total).toBe(0)
    expect(unconverted([ramen], rateFinder('EUR', [exchange()]))).toEqual([])
    expect(totals([ramen], rateFinder('EUR', [exchange()])).total).toBe(10)
  })
})

describe('likelyPaidWith', () => {
  const at = (id: string, minute: number, over: Partial<Expense>) => expense({ id, createdAt: `2027-03-10T10:${String(minute).padStart(2, '0')}:00.000Z`, ...over })
  const inEur = { tripCurrency: 'EUR', exchanged: false }

  it('follows the last expense in that currency that says', () => {
    const list = [at('cost0001', 1, { paidWith: 'cash' }), at('cost0002', 2, {}), at('cost0003', 3, { currency: 'JPY', paidWith: 'card' })]
    expect(likelyPaidWith(list, 'EUR', inEur)).toBe('cash')
    expect(likelyPaidWith([...list, at('cost0004', 4, { paidWith: 'card' })], 'EUR', inEur)).toBe('card')
  })

  it('skips payments between travellers and deleted expenses', () => {
    const list = [at('cost0001', 1, { paidWith: 'cash' }), at('cost0002', 2, { paidWith: 'card', transfer: true }), at('cost0003', 3, { paidWith: 'card', deletedAt: T1 })]
    expect(likelyPaidWith(list, 'EUR', inEur)).toBe('cash')
  })

  it('is cash once money was changed for the currency, else card', () => {
    expect(likelyPaidWith([], 'JPY', { tripCurrency: 'EUR', exchanged: true })).toBe('cash')
    expect(likelyPaidWith([], 'JPY', inEur)).toBe('card')
    // Older expenses in the trip's currency don't say, so they don't count.
    expect(likelyPaidWith([at('cost0001', 1, {})], 'EUR', inEur)).toBe('card')
  })

  it('is cash for payments between travellers abroad, card or bank at home', () => {
    const list = [at('cost0001', 1, { paidWith: 'cash' }), at('cost0002', 2, { currency: 'JPY', paidWith: 'card' })]
    expect(likelyPaidWith(list, 'EUR', { ...inEur, transfer: true })).toBe('card')
    expect(likelyPaidWith(list, 'JPY', { ...inEur, transfer: true })).toBe('cash')
  })
})

describe('balances', () => {
  it('credits the payer and debits everyone sharing', () => {
    const b = balances([expense({ amount: 30, paidBy: ANA })], inEuros(), [ANA, BO, CY])
    expect(nets(b)).toEqual({ [ANA]: 20, [BO]: -10, [CY]: -10 })
    expect(b.get(ANA)).toMatchObject({ paid: 30, share: 10 })
  })

  it('converts other currencies at the exchange rate', () => {
    const b = balances([expense({ amount: 3_200, currency: 'JPY', paidBy: BO, split: { kind: 'equal', among: [ANA, BO] } })], rateFinder('EUR', [exchange()]))
    expect(nets(b)).toEqual({ [BO]: 10, [ANA]: -10 })
  })

  it('leaves out expenses that cannot be converted yet', () => {
    const b = balances([expense({ amount: 3_200, currency: 'JPY', paidBy: BO })], inEuros(), [ANA, BO])
    expect(nets(b)).toEqual({ [ANA]: 0, [BO]: 0 })
  })

  it('counts settle-up payments in balances but not in spending', () => {
    const dinner = expense({ id: 'cost0001', amount: 30, paidBy: ANA })
    const payBack = expense({ id: 'cost0002', title: 'Payment', amount: 10, paidBy: BO, transfer: true, split: { kind: 'equal', among: [ANA] } })
    const b = balances([dinner, payBack], inEuros(), [ANA, BO, CY])
    expect(nets(b)).toEqual({ [ANA]: 10, [BO]: 0, [CY]: -10 })
    expect(b.get(BO)).toMatchObject({ paid: 0, share: 10 })
    expect(totals([dinner, payBack], inEuros()).total).toBe(30)
  })

  it('takes part payments off what is owed', () => {
    const dinner = expense({ id: 'cost0001', amount: 200, paidBy: ANA, split: { kind: 'equal', among: [ANA, BO] } })
    const part = expense({ id: 'cost0002', title: 'Payment', amount: 35, paidBy: BO, transfer: true, split: { kind: 'equal', among: [ANA] } })
    const b = balances([dinner, part], inEuros(), [ANA, BO])
    expect(settleUp(new Map([...b].map(([id, x]) => [id, x.net])))).toEqual([{ from: BO, to: ANA, amount: 65 }])
  })

  it('ignores deleted expenses', () => {
    expect(nets(balances([expense({ deletedAt: '2026-10-02T10:00:00.000Z' })], inEuros(), [ANA]))).toEqual({ [ANA]: 0 })
  })
})

describe('settleUp', () => {
  it('pays the biggest debts to the biggest credits', () => {
    expect(settleUp(new Map([[ANA, 20], [BO, -10], [CY, -10]]))).toEqual([
      { from: BO, to: ANA, amount: 10 },
      { from: CY, to: ANA, amount: 10 },
    ])
    const payments = settleUp(new Map([['a0000001', 50], ['b0000001', -30], ['c0000001', -15], ['d0000001', -5]]))
    expect(payments).toHaveLength(3)
    expect(payments.reduce((sum, p) => sum + p.amount, 0)).toBe(50)
  })

  it('needs no payments when everyone is square', () => {
    expect(settleUp(new Map([[ANA, 0], [BO, 0.004]]))).toEqual([])
  })

  it('works in whole cents when a split leaves fractions', () => {
    const b = balances([expense({ amount: 10, paidBy: ANA })], inEuros(), [ANA, BO, CY])
    expect(settleUp(new Map([...b].map(([id, x]) => [id, x.net])))).toEqual([
      { from: BO, to: ANA, amount: 3.33 },
      { from: CY, to: ANA, amount: 3.33 },
    ])
  })
})

describe('totals', () => {
  it('adds up spending by category and day', () => {
    const t = totals(
      [
        expense({ id: 'cost0001', amount: 30, category: 'food', date: '2027-03-10' }),
        expense({ id: 'cost0002', amount: 3_200, currency: 'JPY', category: 'transport', date: '2027-03-11' }),
        expense({ id: 'cost0003', amount: 12, category: 'food', date: '2027-03-11' }),
      ],
      rateFinder('EUR', [exchange()]),
    )
    expect(t.total).toBe(62)
    expect(Object.fromEntries(t.byCategory)).toEqual({ food: 42, transport: 20 })
    expect(Object.fromEntries(t.byDay)).toEqual({ '2027-03-10': 30, '2027-03-11': 32 })
  })
})

describe('parseAmount', () => {
  it('reads amounts with a comma or a point', () => {
    expect(parseAmount('12,50')).toBe(12.5)
    expect(parseAmount(' 12.5 ')).toBe(12.5)
    expect(parseAmount('1 000')).toBe(1000)
    expect(parseAmount('.5')).toBe(0.5)
    expect(parseAmount('7')).toBe(7)
  })

  it('rejects anything else', () => {
    for (const text of ['', 'abc', '-5', '1.234,56', '12e3', '€12']) expect(parseAmount(text), text).toBeUndefined()
  })
})
