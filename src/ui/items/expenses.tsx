import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { saveRecord } from '../../db/actions'
import type { Expense, ExpenseCategory, PaidWith, Split } from '../../db/types'
import {
  awaitingCost,
  balances,
  cashLeft,
  exchangeRates,
  likelyPaidWith,
  paidWithOf,
  parseAmount,
  paymentSplit,
  settleUp,
  sharesOf,
  toTripCurrency,
  totals,
  unconverted,
  type Payment,
} from '../../domain/expenses'
import { tripPhase } from '../../domain/itinerary'
import { isDay } from '../../domain/time'
import { DetailHead, EmptyState, Notice } from '../components/bits'
import { ChoiceChips, CurrencySelect, Field, NotesField, TextField } from '../components/fields'
import { UnsentNotice } from '../components/UnsentNotice'
import { fmtDay, fmtMoney, fmtPlain, plural } from '../format'
import { useToday } from '../hooks'
import { EXPENSE_CATEGORIES, labelOf } from '../labels'
import { nameOf, tripPath, useTrip, type TripData } from '../tripData'
import { AttachmentsCard } from '../components/Attachments'
import { ItemFooter, ItemForm, ItemGone } from './common'
import { opt, useSave } from './save'

/** An expense in the trip's currency, or undefined while its currency has no rate. */
const converted = (e: Expense, t: TripData) => {
  const rate = t.rateOf(e)
  return rate ? toTripCurrency(e.amount, rate) : undefined
}

/** Payments that settle everyone up, in the trip's currency. */
const settlePayments = (bal: ReturnType<typeof balances>) => settleUp(new Map([...bal].map(([id, b]) => [id, b.net])))

/** The payment form, filled in: who pays whom, and how much. */
const paymentPath = (t: TripData, p?: Payment) =>
  `${tripPath(t.trip.id, 'expenses', 'new')}?${new URLSearchParams({ transfer: '1', ...(p && { from: p.from, to: p.to, amount: String(p.amount) }) })}`

export function MoneyPage() {
  const t = useTrip()
  const { trip } = t
  const cur = trip.currency
  const spent = totals(t.expenses, t.rateOf)
  const bal = balances(t.expenses, t.rateOf, t.travellers.map((x) => x.id))
  const payments = settlePayments(bal)
  const estimated = t.expenses.filter((e) => awaitingCost(e, cur) && t.rateOf(e)).length
  const group = t.travellers.length > 1
  const categories = [...spent.byCategory].sort((a, b) => b[1] - a[1])
  const byDay = new Map<string, Expense[]>()
  for (const e of [...t.expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))) {
    byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  }
  const foreign = t.exchanges.length > 0 || t.expenses.some((e) => e.currency !== cur)
  const split = paymentSplit(t.expenses, t.rateOf, cur)

  return (
    <>
      <UnsentNotice />
      <section className="card">
        <div className="section-head">
          <h3>Spent so far</h3>
          <Link className="btn btn-small btn-primary" to={tripPath(trip.id, 'expenses', 'new')}>
            + Expense
          </Link>
        </div>
        <p className="big-number">{fmtMoney(spent.total, cur)}</p>
        {group && t.me && <p className="muted small">Your part: {fmtMoney(bal.get(t.me.id)?.share ?? 0, cur)}</p>}
        {categories.length > 0 && (
          <div className="bars">
            {categories.map(([key, value]) => {
              const label = labelOf(EXPENSE_CATEGORIES, key)
              return (
                <div key={key}>
                  <div className="bar-label">
                    <span>
                      {label.emoji} {label.label}
                    </span>
                    <span className="money">{fmtMoney(value, cur)}</span>
                  </div>
                  <div className="bar-track" aria-hidden>
                    <div className="bar-fill" style={{ width: `${spent.total ? (value / spent.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {categories.length > 0 && (
          <p className="muted small">
            Card <span className="money">{fmtMoney(split.card, cur)}</span> · Cash <span className="money">{fmtMoney(split.cash, cur)}</span>
            {split.unsaid > 0 && (
              <>
                {' '}
                · Not noted <span className="money">{fmtMoney(split.unsaid, cur)}</span>
              </>
            )}
          </p>
        )}
        {!foreign && (
          <Link className="link small" to={tripPath(trip.id, 'exchanges', 'new')}>
            💱 Changed money or withdrew cash abroad? Add the rate you got
          </Link>
        )}
      </section>

      {foreign && <RatesCard />}

      {group && (
        <section className="card">
          <div className="section-head">
            <h3>Balances</h3>
            <Link className="btn btn-small" to={paymentPath(t)}>
              + Payment
            </Link>
          </div>
          {!t.me && (
            <p className="small muted">
              Which one are you? Choose on the{' '}
              <Link className="link" to={tripPath(trip.id, 'trip')}>
                Trip
              </Link>{' '}
              tab.
            </p>
          )}
          <ul className="history">
            {t.travellers.map((x) => {
              const net = bal.get(x.id)?.net ?? 0
              const cents = Math.round(net * 100)
              return (
                <li key={x.id}>
                  <span>
                    {x.name}
                    {t.me?.id === x.id && <span className="muted"> (you)</span>}
                  </span>
                  <span className={`money ${cents > 0 ? 'plus' : cents < 0 ? 'minus' : 'muted'}`}>
                    {cents > 0 ? `gets back ${fmtMoney(net, cur)}` : cents < 0 ? `owes ${fmtMoney(-net, cur)}` : 'square'}
                  </span>
                </li>
              )
            })}
          </ul>
          <h4>Settle up</h4>
          {payments.length ? (
            <ul className="list">
              {payments.map((p) => (
                <SettleRow key={`${p.from}-${p.to}`} payment={p} />
              ))}
            </ul>
          ) : (
            <p className="muted small">Everyone is square. 🎉</p>
          )}
          {estimated > 0 && (
            <p className="muted small">
              {plural(estimated, 'card payment')} {estimated === 1 ? 'is an estimate' : 'are estimates'} until what the bank charged is added, so these
              amounts can still change a little.
            </p>
          )}
        </section>
      )}

      <section>
        <h3 className="group-title">Expenses</h3>
        {t.expenses.length === 0 ? (
          <EmptyState>
            <p className="big-emoji">💶</p>
            <p>Note what you spend, in any currency.{group && ' waypoints works out who owes whom.'}</p>
          </EmptyState>
        ) : (
          [...byDay].map(([day, list]) => (
            <div key={day} className="stack">
              <h4 className="muted">{fmtDay(day)}</h4>
              <ul className="list">
                {list.map((e) => (
                  <ExpenseRow key={e.id} expense={e} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </>
  )
}

/** The rate each currency converts at, the exchanges behind it, and what can't be converted yet. */
function RatesCard() {
  const t = useTrip()
  const { trip } = t
  const rates = exchangeRates(t.exchanges, trip.currency)
  const left = cashLeft(t.exchanges, t.expenses, trip.currency)
  const cardsWaiting = t.expenses.filter((e) => awaitingCost(e, trip.currency))
  const yours = t.me ? cardsWaiting.filter((e) => e.paidBy === t.me?.id).length : 0
  // Card payments wait for the bank, not for an exchange.
  const waiting = unconverted(t.expenses, t.rateOf).filter((e) => !awaitingCost(e, trip.currency))
  const missing = [...new Set(waiting.map((e) => e.currency))]
  const exchanges = [...t.exchanges].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <section className="card">
      <div className="section-head">
        <h3>💱 Exchange rates</h3>
        <Link className="btn btn-small" to={`${tripPath(trip.id, 'exchanges', 'new')}${missing[0] ? `?currency=${missing[0]}` : ''}`}>
          + Exchange
        </Link>
      </div>
      {missing.length > 0 && (
        <Notice kind="warn">
          <span className="small">
            {plural(waiting.length, 'expense')} in {missing.join(', ')} can't be counted yet. Add what you got for your money (a cash
            withdrawal, say) and they're converted.
          </span>
        </Notice>
      )}
      {cardsWaiting.length > 0 && (
        <Notice kind="warn">
          <span className="small">
            {plural(cardsWaiting.length, 'card payment')} {cardsWaiting.length === 1 ? 'is' : 'are'} waiting for what the bank charged
            {yours > 0 && ` (${yours === cardsWaiting.length ? (yours === 1 ? "it's yours" : 'all yours') : `${yours} of them yours`})`}. Until then,{' '}
            {cardsWaiting.length === 1 ? 'it counts' : 'they count'} at your cash rate, if there is one. Look for{' '}
            <span className="chip chip-must">cost pending</span> below.
          </span>
        </Notice>
      )}
      {[...rates].map(([currency, { rate, count }]) => (
        <p key={currency}>
          <strong className="money">
            1 {trip.currency} = {fmtPlain(rate, 4)} {currency}
          </strong>{' '}
          <span className="muted small">{count > 1 ? `· average of ${count} exchanges` : '· what you got'}</span>
        </p>
      ))}
      {[...left].map(([currency, amount]) =>
        Math.round(amount * 100) < 0 ? (
          <p key={currency} className="notice notice-warn small">
            Cash left: <span className="money">−{fmtMoney(-amount, currency)}</span> (more cash spent than changed: an exchange may be
            missing)
          </p>
        ) : (
          <p key={currency} className="small">
            Cash left: <strong className="money">{fmtMoney(Math.max(amount, 0), currency)}</strong>
          </p>
        ),
      )}
      {exchanges.length > 0 && (
        <ul className="history">
          {exchanges.map((x) => (
            <li key={x.id}>
              <Link className="link small" to={tripPath(trip.id, 'exchanges', x.id, 'edit')}>
                {fmtDay(x.date)}
                {t.travellers.length > 1 && x.by ? ` · ${nameOf(t, x.by)}` : ''}
              </Link>
              <span className="money small">
                {fmtMoney(x.amount, x.currency)} for {fmtMoney(x.cost, x.costCurrency)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Cash converts at the rate you actually got, fees included. Card payments convert at what the bank charged.</p>
    </section>
  )
}

/** A payment that settles up: recording it opens the payment form, where it can be part of the amount. */
function SettleRow({ payment }: { payment: Payment }) {
  const t = useTrip()
  return (
    <li className="list-row">
      <span className="list-text">
        <span>
          <strong>{nameOf(t, payment.from)}</strong> pays <strong>{nameOf(t, payment.to)}</strong>
        </span>
        <span className="money">{fmtMoney(payment.amount, t.trip.currency)}</span>
      </span>
      <Link className="btn btn-small" to={paymentPath(t, payment)}>
        Record payment
      </Link>
    </li>
  )
}

function splitSummary(e: Expense, t: TripData): string {
  if (e.transfer) return `${nameOf(t, e.paidBy)} paid ${[...sharesOf(e).keys()].map((id) => nameOf(t, id)).join(', ')}`
  if (t.travellers.length < 2) return labelOf(EXPENSE_CATEGORIES, e.category).label
  const parts = sharesOf(e)
  const forWhom = parts.size === 1 ? `for ${nameOf(t, [...parts.keys()][0])}` : parts.size === t.travellers.length ? 'split by everyone' : `split ${parts.size} ways`
  return `${nameOf(t, e.paidBy)} paid · ${forWhom}`
}

function ExpenseRow({ expense: e }: { expense: Expense }) {
  const t = useTrip()
  const label = labelOf(EXPENSE_CATEGORIES, e.category)
  const inTrip = converted(e, t)
  const foreign = e.currency !== t.trip.currency
  const waiting = awaitingCost(e, t.trip.currency)
  const paidWith = paidWithOf(e, t.trip.currency)
  return (
    <li>
      <Link to={tripPath(t.trip.id, 'expenses', e.id)} className="list-row">
        <span className="list-emoji" aria-hidden>
          {e.transfer ? '🤝' : label.emoji}
        </span>
        <span className="list-text">
          <strong>{e.title}</strong>
          <span className="muted small">{splitSummary(e, t)}</span>
        </span>
        <span className="list-end">
          <strong className="money">{fmtMoney(e.amount, e.currency)}</strong>
          {foreign && inTrip !== undefined && (
            <span className="muted small money">
              {waiting && '≈ '}
              {fmtMoney(inTrip, t.trip.currency)}
            </span>
          )}
          {foreign && (waiting ? <span className="chip chip-must">cost pending</span> : inTrip === undefined && <span className="chip chip-must">no rate yet</span>)}
          {paidWith && <span className="muted small">{paidWith === 'cash' ? 'Cash' : 'Card'}</span>}
        </span>
      </Link>
    </li>
  )
}

export function ExpenseFormPage() {
  const t = useTrip()
  const { itemId } = useParams()
  const [params] = useSearchParams()
  const existing = itemId ? t.expenses.find((e) => e.id === itemId) : undefined
  if (itemId && !existing) return <ItemGone backTo={tripPath(t.trip.id, 'money')} />
  const transfer = existing?.transfer ?? params.get('transfer') === '1'
  // A settle-up payment comes filled in (see paymentPath): who pays whom, and how much.
  const traveller = (key: string) => t.travellers.find((x) => x.id === params.get(key))?.id
  const settle = existing || !transfer ? undefined : { from: traveller('from'), to: traveller('to'), amount: parseAmount(params.get('amount') ?? '') }
  return <ExpenseForm key={itemId ?? `new?${params}`} existing={existing} transfer={transfer} settle={settle} />
}

interface SettlePrefill {
  from?: string
  to?: string
  amount?: number
}

function ExpenseForm({ existing, transfer, settle }: { existing?: Expense; transfer: boolean; settle?: SettlePrefill }) {
  const t = useTrip()
  const { trip } = t
  const ids = t.travellers.map((x) => x.id)
  const group = ids.length > 1
  const defaultPayer = settle?.from ?? t.me?.id ?? ids[0]
  const today = useToday()
  const rates = exchangeRates(t.exchanges, trip.currency)
  // The currency used last is likely the one in your wallet now.
  const lastCurrency = [...t.expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.currency
  const likely = (code: string) => likelyPaidWith(t.expenses, code, { tripCurrency: trip.currency, exchanged: rates.has(code), transfer })
  // An older expense in the trip's currency doesn't say how it was paid until someone picks it.
  const paidWithBefore = existing && paidWithOf(existing, trip.currency)
  // What the bank charged for a card payment, in the trip's currency, as the form opened.
  const chargedBefore = existing?.rate ? fmtPlain(existing.amount / existing.rate) : ''

  const [title, setTitle] = useState(existing?.title ?? '')
  const [amountText, setAmountText] = useState(existing ? fmtPlain(existing.amount) : settle?.amount ? fmtPlain(settle.amount) : '')
  const [currency, setCurrency] = useState(existing?.currency ?? (transfer ? trip.currency : (lastCurrency ?? trip.currency)))
  const [paidWith, setPaidWith] = useState<PaidWith | undefined>(() => (existing ? paidWithBefore : likely(currency)))
  const [chargedText, setChargedText] = useState(chargedBefore)
  const [gotText, setGotText] = useState('')
  const [costText, setCostText] = useState('')
  const [date, setDate] = useState(existing?.date ?? (tripPhase(trip, today).phase === 'past' ? trip.endDate : today))
  const [category, setCategory] = useState<string>(existing?.category ?? 'food')
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? defaultPayer)
  const [splitKind, setSplitKind] = useState<Split['kind']>(existing?.split.kind ?? 'equal')
  const [among, setAmong] = useState<Set<string>>(() => new Set(existing?.split.kind === 'equal' ? existing.split.among : ids))
  const [exact, setExact] = useState<Record<string, string>>(() =>
    existing?.split.kind === 'exact' ? Object.fromEntries(Object.entries(existing.split.amounts).map(([id, a]) => [id, fmtPlain(a)])) : {},
  )
  const [to, setTo] = useState(() => settle?.to ?? (existing?.transfer ? [...sharesOf(existing).keys()][0] : ids.find((id) => id !== defaultPayer)) ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const { save, busy, error, setError } = useSave('expenses', existing?.id, transfer)

  const amount = parseAmount(amountText)
  const foreign = currency !== trip.currency
  const exchangeRate = rates.get(currency)?.rate
  const card = foreign && paidWith === 'card'
  // Cash in a currency without an exchange yet: the form can add one.
  const newExchange = foreign && !card && !exchangeRate
  const charged = parseAmount(chargedText)
  const got = parseAmount(gotText)
  const cost = parseAmount(costText)
  // An untouched card payment keeps its exact rate: re-deriving it from the rounded charge would save a change nobody made.
  const unchanged = existing?.rate && currency === existing.currency && amount === existing.amount && chargedText === chargedBefore
  const cardRate = !card || !amount || !charged ? undefined : unchanged ? existing.rate : amount / charged
  // A card payment without what the bank charged is estimated at the exchanges' rate meanwhile.
  const rate = !foreign ? 1 : card ? (cardRate ?? exchangeRate) : newExchange ? (got && cost ? got / cost : undefined) : exchangeRate
  const exactTotal = ids.reduce((sum, id) => sum + (parseAmount(exact[id] ?? '') ?? 0), 0)
  // For a new payment between two travellers: what settling up says one owes the other.
  const owed = transfer && !existing ? settlePayments(balances(t.expenses, t.rateOf, ids)).find((p) => p.from === paidBy && p.to === to)?.amount : undefined

  const onSubmit = async () => {
    if (!transfer && !title.trim()) return setError('What was it for?')
    if (amount === undefined || amount <= 0) return setError('Enter the amount, like 12.50.')
    if (!isDay(date)) return setError('Choose the day.')
    if (card && chargedText.trim() && !(cardRate && cardRate <= 1e9)) return setError(`Check what the bank charged in ${trip.currency}, like 12.50.`)
    if (newExchange && Boolean(gotText.trim()) !== Boolean(costText.trim())) {
      return setError('Fill in both what you got and what it cost, or leave both empty to add the rate later.')
    }
    if (newExchange && gotText.trim() && !(got && cost)) return setError('Check the exchange amounts.')

    let split: Split
    if (transfer) {
      if (!to || to === paidBy) return setError('Choose who received the money.')
      split = { kind: 'equal', among: [to] }
    } else if (!group) {
      split = { kind: 'equal', among: [paidBy] }
    } else if (splitKind === 'equal') {
      if (!among.size) return setError('Choose who it was for.')
      split = { kind: 'equal', among: ids.filter((id) => among.has(id)) }
    } else {
      if (Math.abs(exactTotal - amount) > 0.005) return setError(`The amounts add up to ${fmtPlain(exactTotal)}, not ${fmtPlain(amount)}.`)
      split = { kind: 'exact', amounts: Object.fromEntries(ids.map((id) => [id, parseAmount(exact[id] ?? '') ?? 0] as const).filter(([, a]) => a > 0)) }
    }

    // A rate given here for a currency without one is saved for the whole trip, as an exchange.
    if (newExchange && got && cost) {
      await saveRecord('exchanges', trip.id, { date, currency, amount: got, cost, costCurrency: trip.currency, by: paidBy })
    }
    // An older expense that doesn't say how it was paid stays that way while it converts as before.
    const convertsAsBefore = existing && existing.currency === currency && paidWithBefore === paidWith && existing.rate === cardRate
    void save({
      title: transfer ? 'Payment' : title.trim(),
      amount,
      currency,
      rate: cardRate,
      paidWith: convertsAsBefore ? existing.paidWith : paidWith,
      date,
      category: (transfer ? 'other' : category) as ExpenseCategory,
      paidBy,
      split,
      transfer: transfer || undefined,
      notes: opt(notes),
    })
  }

  const approx = amount && rate ? `≈ ${fmtMoney(amount / rate, trip.currency)}` : undefined

  return (
    <ItemForm
      title={transfer ? (existing ? 'Edit payment' : 'New payment') : existing ? 'Edit expense' : 'New expense'}
      error={error}
      busy={busy}
      onSubmit={() => void onSubmit()}
    >
      {!transfer && <TextField label="What for" value={title} onChange={setTitle} placeholder="Dinner, tickets, taxi…" maxLength={200} autoFocus={!existing} />}
      <div className="field" role="group" aria-label="Amount">
        <span>Amount</span>
        <div className="row nowrap">
          <input
            className="input input-amount"
            inputMode="decimal"
            value={amountText}
            placeholder="0.00"
            aria-label="Amount"
            autoFocus={transfer && !existing}
            onChange={(e) => setAmountText(e.target.value)}
          />
          <CurrencySelect
            compact
            value={currency}
            onChange={(code) => {
              // Amounts typed for the old currency mean nothing for the new one.
              const back = existing?.currency === code
              setCurrency(code)
              setPaidWith(back ? paidWithBefore : likely(code))
              setChargedText(back ? chargedBefore : '')
              setGotText('')
              setCostText('')
            }}
            suggestions={[trip.currency, ...rates.keys(), ...new Set(t.expenses.map((e) => e.currency))]}
            label="Currency"
          />
        </div>
        {owed !== undefined && (
          <small className="muted">
            {nameOf(t, paidBy)} owes {nameOf(t, to)} {fmtMoney(owed, trip.currency)}.{' '}
            {amount && !foreign && owed - amount > 0.005
              ? `${fmtMoney(owed - amount, trip.currency)} will still be owed after this.`
              : 'Paying part of it is fine: the rest stays owed.'}
          </small>
        )}
      </div>

      <div className="field" role="group" aria-label="Paid with">
        <span>Paid with</span>
        <div className="segmented">
          <button type="button" className={paidWith === 'cash' ? 'active' : ''} onClick={() => setPaidWith('cash')}>
            💵 Cash
          </button>
          <button type="button" className={paidWith === 'card' ? 'active' : ''} onClick={() => setPaidWith('card')}>
            💳 {transfer ? 'Card or bank' : 'Card'}
          </button>
        </div>
        {!paidWith && <small className="muted">Not noted for this {transfer ? 'payment' : 'expense'}.</small>}
      </div>
      {foreign && !card && exchangeRate && (
        <div className="notice notice-info small">
          Converted at <strong className="money">1 {trip.currency} = {fmtPlain(exchangeRate, 4)} {currency}</strong>, what your exchanges got
          {approx && <>: {approx}</>}.
        </div>
      )}
      {card && (
        <Field
          label={`What the bank charged (${trip.currency}, fees included)`}
          hint={
            cardRate
              ? `1 ${trip.currency} = ${fmtPlain(cardRate, 4)} ${currency}`
              : `Not in your bank app yet? Leave it empty and add it later: it's marked "cost pending" until then${approx ? `, and counts at your cash rate (${approx})` : ''}.`
          }
        >
          <input className="input" inputMode="decimal" placeholder="Not known yet" value={chargedText} onChange={(e) => setChargedText(e.target.value)} />
        </Field>
      )}
      {newExchange && (
        <div className="field" role="group" aria-label={`Exchange rate for ${currency}`}>
          <span>What did you get for your money?</span>
          <div className="row nowrap">
            <span className="muted">You got</span>
            <input className="input input-amount" inputMode="decimal" placeholder="10000" aria-label={`${currency} you got`} value={gotText} onChange={(e) => setGotText(e.target.value)} />
            <span className="muted">{currency}</span>
          </div>
          <div className="row nowrap">
            <span className="muted">for</span>
            <input className="input input-amount" inputMode="decimal" placeholder="62.50" aria-label={`What it cost in ${trip.currency}`} value={costText} onChange={(e) => setCostText(e.target.value)} />
            <span className="muted">{trip.currency}</span>
          </div>
          <small className="muted">
            {approx ? `${approx}. ` : ''}A cash withdrawal or money changed, fees included. It's saved as the {currency} rate for the whole trip, so
            you only enter it once. Leave it empty to add it later in Money.
          </small>
        </div>
      )}

      <Field label="Day">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {!transfer && <ChoiceChips label="Category" options={EXPENSE_CATEGORIES} value={category} onChange={setCategory} />}
      {group && (
        <Field label={transfer ? 'From' : 'Paid by'}>
          <select className="input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {t.travellers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.id === t.me?.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      {transfer && (
        <Field label="To">
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            {t.travellers
              .filter((x) => x.id !== paidBy)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      {group && !transfer && (
        <div className="field" role="group" aria-label="Split">
          <span>For whom</span>
          <div className="segmented">
            <button type="button" className={splitKind === 'equal' ? 'active' : ''} onClick={() => setSplitKind('equal')}>
              Split equally
            </button>
            <button type="button" className={splitKind === 'exact' ? 'active' : ''} onClick={() => setSplitKind('exact')}>
              Exact amounts
            </button>
          </div>
          {splitKind === 'equal' ? (
            <>
              <div className="chips">
                {t.travellers.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className="toggle-chip"
                    aria-pressed={among.has(x.id)}
                    onClick={() =>
                      setAmong((set) => {
                        const next = new Set(set)
                        if (!next.delete(x.id)) next.add(x.id)
                        return next
                      })
                    }
                  >
                    {x.name}
                  </button>
                ))}
              </div>
              {amount !== undefined && among.size > 0 && (
                <small className="muted">
                  {fmtMoney(amount / among.size, currency)} each, for {plural(among.size, 'person', 'people')}.
                </small>
              )}
            </>
          ) : (
            <>
              {t.travellers.map((x) => (
                <div key={x.id} className="split-row">
                  <span>{x.name}</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`${x.name}'s part`}
                    value={exact[x.id] ?? ''}
                    onChange={(e) => setExact((m) => ({ ...m, [x.id]: e.target.value }))}
                  />
                </div>
              ))}
              {amount !== undefined && (
                <small className={Math.abs(exactTotal - amount) > 0.005 ? 'minus' : 'muted'}>{fmtMoney(amount - exactTotal, currency)} left to assign.</small>
              )}
            </>
          )}
        </div>
      )}
      <NotesField value={notes} onChange={setNotes} />
    </ItemForm>
  )
}

export function ExpensePage() {
  const t = useTrip()
  const { itemId } = useParams()
  const e = t.expenses.find((x) => x.id === itemId)
  const back = tripPath(t.trip.id, 'money')
  if (!e) return <ItemGone backTo={back} />
  const label = labelOf(EXPENSE_CATEGORIES, e.category)
  const parts = [...sharesOf(e)]
  const rate = t.rateOf(e)
  const cur = t.trip.currency
  const foreign = e.currency !== cur
  const paidWith = paidWithOf(e, cur)
  return (
    <article className="stack">
      <DetailHead emoji={e.transfer ? '🤝' : label.emoji} title={e.title} subtitle={e.transfer ? 'Settle-up payment' : label.label} />
      <section className="card">
        <p className="big-number">{fmtMoney(e.amount, e.currency)}</p>
        {foreign &&
          (awaitingCost(e, cur) ? (
            <Notice kind="warn">
              <span className="small">
                Waiting for what the bank charged.{' '}
                {rate ? `Until then it counts at your cash rate: ≈ ${fmtMoney(toTripCurrency(e.amount, rate), cur)}.` : "It isn't counted until then."}{' '}
                <Link className="link" to={tripPath(t.trip.id, 'expenses', e.id, 'edit')}>
                  Add it
                </Link>
              </span>
            </Notice>
          ) : rate && e.paidWith === 'card' ? (
            <p className="muted small">
              {fmtMoney(toTripCurrency(e.amount, rate), cur)} charged by the bank (1 {cur} = {fmtPlain(rate, 4)} {e.currency})
            </p>
          ) : rate ? (
            <p className="muted small">
              ≈ {fmtMoney(toTripCurrency(e.amount, rate), cur)} at 1 {cur} = {fmtPlain(rate, 4)} {e.currency}
              {e.rate ? ' (its own rate)' : ', what your exchanges got'}
            </p>
          ) : (
            <Notice kind="warn">
              <span className="small">
                Not counted yet: there's no rate for {e.currency}.{' '}
                <Link className="link" to={`${tripPath(t.trip.id, 'exchanges', 'new')}?currency=${e.currency}`}>
                  Add what you got for your money
                </Link>
              </span>
            </Notice>
          ))}
        <dl className="facts">
          <dt>Day</dt>
          <dd>{fmtDay(e.date)}</dd>
          {paidWith && (
            <>
              <dt>Paid with</dt>
              <dd>{paidWith === 'cash' ? 'Cash' : e.transfer ? 'Card or bank' : 'Card'}</dd>
            </>
          )}
          {t.travellers.length > 1 && (
            <>
              <dt>{e.transfer ? 'From' : 'Paid by'}</dt>
              <dd>{nameOf(t, e.paidBy)}</dd>
            </>
          )}
        </dl>
      </section>
      {t.travellers.length > 1 && (
        <section className="card">
          <h3>{e.transfer ? 'To' : 'Split'}</h3>
          <ul className="history">
            {parts.map(([id, amount]) => (
              <li key={id}>
                <span>{nameOf(t, id)}</span>
                <span className="money">{fmtMoney(amount, e.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {e.notes && (
        <section className="card">
          <h3>Notes</h3>
          <p className="prewrap">{e.notes}</p>
        </section>
      )}
      <AttachmentsCard table="expenses" id={e.id} />
      <ItemFooter table="expenses" id={e.id} what={e.transfer ? 'payment' : 'expense'} backTo={back} />
    </article>
  )
}
