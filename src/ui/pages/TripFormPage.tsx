import { useState } from 'react'
import { useNavigate } from 'react-router'
import { createTrip, updateTrip, type TravellerDraft } from '../../db/actions'
import { setSetting, SETTINGS } from '../../db/db'
import type { ServerConfig } from '../../db/serverState'
import { sharesOf } from '../../domain/expenses'
import type { MemberSummary } from '../../domain/serverProtocol'
import { daysBetween, deviceTimeZone, isDay } from '../../domain/time'
import { BackLink } from '../components/bits'
import { CurrencySelect, Field, FormError, NotesField, TextField, ZoneSelect } from '../components/fields'
import { usable, useServer, useSetting } from '../hooks'
import { TRIP_EMOJI } from '../labels'
import { tripPath, useOptionalTrip, type TripData } from '../tripData'

/** New trip (from the trip list) or editing one (inside a trip). */
export function TripFormPage() {
  const existing = useOptionalTrip()
  const myName = useSetting<string>(SETTINGS.myName)
  const lastCurrency = useSetting<string>(SETTINGS.lastCurrency)
  const server = useServer()
  if (!myName || !lastCurrency || server === undefined) return null
  return <TripForm existing={existing ?? undefined} myName={myName.value} lastCurrency={lastCurrency.value} server={usable(server)} />
}

/** Everyone on the server, this phone's member included even before the first sync lists them. */
const membersOf = (server: ServerConfig): MemberSummary[] =>
  server.members.some((m) => m.id === server.member.id) ? server.members : [server.member, ...server.members]

function TripForm(props: { existing?: TripData; myName?: string; lastCurrency?: string; server?: ServerConfig }) {
  const { existing, myName, lastCurrency, server } = props
  const navigate = useNavigate()
  const trip = existing?.trip
  const [name, setName] = useState(trip?.name ?? '')
  const [emoji, setEmoji] = useState(trip?.emoji ?? '')
  const [startDate, setStartDate] = useState(trip?.startDate ?? '')
  const [endDate, setEndDate] = useState(trip?.endDate ?? '')
  const [currency, setCurrency] = useState(trip?.currency ?? lastCurrency ?? 'EUR')
  const [timeZone, setTimeZone] = useState(trip?.timeZone ?? deviceTimeZone())
  const [notes, setNotes] = useState(trip?.notes ?? '')
  // A new trip goes on the server when there is one; an existing one is moved there from the Trip tab.
  const [onServer, setOnServer] = useState(existing ? Boolean(existing.server) : Boolean(server))
  const [people, setPeople] = useState<TravellerDraft[]>(() =>
    existing
      ? existing.travellers.map((t) => ({ id: t.id, name: t.name, memberId: t.memberId }))
      : server
        ? [{ name: server.member.name, memberId: server.member.id }]
        : [{ name: myName ?? '' }, { name: '' }],
  )
  const linking = onServer && server ? server : undefined
  const members = linking ? membersOf(linking) : []
  const linked = new Set(people.map((p) => p.memberId).filter(Boolean))
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  // Travellers with expenses can't be removed: their balances would be lost.
  const inExpenses = new Set(existing?.expenses.flatMap((e) => [e.paidBy, ...sharesOf(e).keys()]) ?? [])

  const setPerson = (index: number, value: string) => setPeople((list) => list.map((p, i) => (i === index ? { ...p, name: value } : p)))
  const setLink = (index: number, memberId: string) =>
    setPeople((list) =>
      list.map((p, i) => {
        if (i !== index) return p
        const member = members.find((m) => m.id === memberId)
        return { ...p, memberId: member?.id, name: p.name.trim() || member?.name || '' }
      }),
    )
  const addPerson = (person: TravellerDraft) => setPeople((list) => [...list.filter((p) => p.name.trim() || p.id), person])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const travellers = people
      .map((p) => ({ ...p, name: p.name.trim(), memberId: linking || existing ? p.memberId : undefined }))
      .filter((p) => p.name)
    if (!name.trim()) return setError('Give the trip a name.')
    if (!isDay(startDate) || !isDay(endDate)) return setError('Choose when the trip starts and ends.')
    if (endDate < startDate) return setError('The trip ends before it starts.')
    if (daysBetween(startDate, endDate) > 365) return setError('A trip can be up to a year long.')
    if (!travellers.length) return setError(existing ? 'A trip needs at least one traveller.' : 'Add your name as the first traveller.')
    if (linking && !travellers.some((p) => p.memberId === linking.member.id)) {
      return setError(
        existing
          ? "You can't take yourself off the trip here. To leave it, use Leave the trip on the Trip tab."
          : 'Choose which traveller you are on the server: it only shows the trip to the people on it.',
      )
    }

    const input = { name: name.trim(), emoji: emoji || undefined, startDate, endDate, timeZone, currency, notes: notes.trim() || undefined }
    setBusy(true)
    try {
      if (trip) {
        await updateTrip(trip.id, input, travellers)
        navigate(tripPath(trip.id, 'trip'))
      } else {
        // You come first: the first traveller is the one using this phone.
        const mine = linking ? travellers.findIndex((p) => p.memberId === linking.member.id) : 0
        const ordered = [travellers[mine], ...travellers.filter((_, i) => i !== mine)]
        const id = await createTrip(input, ordered, { onServer: Boolean(linking) })
        if (!myName) await setSetting(SETTINGS.myName, travellers[0].name)
        navigate(tripPath(id), { replace: true })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={(e) => void onSubmit(e)} noValidate>
      {trip ? <BackLink to={tripPath(trip.id, 'trip')}>Trip</BackLink> : <BackLink to="/">Your trips</BackLink>}
      <h2>{trip ? 'Edit trip' : 'New trip'}</h2>

      <TextField label="Name" value={name} onChange={setName} placeholder="Japan in spring" maxLength={200} autoFocus={!trip} />

      <div className="field" role="radiogroup" aria-label="Icon">
        <span>Icon</span>
        <div className="chips">
          {TRIP_EMOJI.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={emoji === e} className="toggle-chip emoji-chip" onClick={() => setEmoji(emoji === e ? '' : e)}>
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="field-pair">
        <Field label="Starts">
          <input className="input" type="date" value={startDate} onChange={(e) => {
            setStartDate(e.target.value)
            if (!endDate || endDate < e.target.value) setEndDate(e.target.value)
          }} />
        </Field>
        <Field label="Ends">
          <input className="input" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>

      {!existing && server && (
        <div className="field" role="group" aria-label="Where it's kept">
          <span>Where it's kept</span>
          <div className="segmented">
            <button type="button" className={onServer ? 'active' : ''} aria-pressed={onServer} onClick={() => setOnServer(true)}>
              🌐 On the server
            </button>
            <button type="button" className={onServer ? '' : 'active'} aria-pressed={!onServer} onClick={() => setOnServer(false)}>
              📱 Only on this phone
            </button>
          </div>
          <small className="muted">
            {onServer
              ? 'People on the server get the trip, and every change, by themselves. Anyone else gets links, as usual.'
              : 'Share it with links. You can put it on the server later.'}
          </small>
        </div>
      )}

      <div className="field" role="group" aria-label="Who's going">
        <span>Who's going</span>
        {people.map((person, index) => {
          const isMe = linking ? person.memberId === linking.member.id : existing ? existing.me?.id === person.id && Boolean(person.id) : index === 0
          const locked = Boolean(person.id && inExpenses.has(person.id))
          return (
            <div key={person.id ?? `new-${index}`} className="traveller">
              <div className="traveller-row">
                <input
                  className="input"
                  value={person.name}
                  maxLength={60}
                  placeholder={index === 0 && !existing ? 'Your name' : 'Name'}
                  aria-label={isMe ? 'Your name' : `Traveller ${index + 1}`}
                  onChange={(e) => setPerson(index, e.target.value)}
                />
                {isMe && <span className="chip">you</span>}
                <button
                  type="button"
                  className="icon-btn"
                  disabled={locked || people.length === 1}
                  title={locked ? 'Has expenses, so can’t be removed' : 'Remove'}
                  aria-label={`Remove ${person.name || 'traveller'}`}
                  onClick={() => setPeople((list) => list.filter((_, i) => i !== index))}
                >
                  ✕
                </button>
              </div>
              {linking && (
                <select
                  className="input input-link"
                  value={person.memberId ?? ''}
                  aria-label={`${person.name || 'Traveller'} on the server`}
                  onChange={(e) => setLink(index, e.target.value)}
                >
                  <option value="">Not on the server: gets links</option>
                  {members
                    .filter((m) => m.id === person.memberId || !linked.has(m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        🌐 {m.name} on the server
                      </option>
                    ))}
                </select>
              )}
            </div>
          )
        })}
        {linking && members.some((m) => !linked.has(m.id)) && (
          <div className="chips" role="group" aria-label="Add from the server">
            {members
              .filter((m) => !linked.has(m.id))
              .map((m) => (
                <button key={m.id} type="button" className="toggle-chip" onClick={() => addPerson({ name: m.name, memberId: m.id })}>
                  + 🌐 {m.name}
                </button>
              ))}
          </div>
        )}
        <button type="button" className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => setPeople((list) => [...list, { name: '' }])}>
          {linking ? '+ Someone not on the server' : '+ Add someone'}
        </button>
        <small className="muted">
          {linking
            ? 'Tap the people from the server who are going. Anyone else can be added by name and gets the trip by link. Expenses are split between the people here.'
            : "Just you? That's fine: leave the others empty. Expenses are split between the people here."}
        </small>
      </div>

      <Field label="Currency" hint="Totals and balances are shown in it. Expenses can be in any currency.">
        <CurrencySelect value={currency} onChange={setCurrency} suggestions={[currency]} label="Currency" />
      </Field>
      {trip && currency !== trip.currency && existing.expenses.length > 0 && (
        <p className="notice notice-warn small">
          Expenses and exchanges so far were counted in {trip.currency}. After the change, expenses in {trip.currency} need an
          exchange rate to {currency} (Money → Exchange rates) before they're counted again.
        </p>
      )}

      <Field label="Time zone" hint="Where the trip happens. New bookings follow your journeys: after a flight to Tokyo, they're in Tokyo time.">
        <ZoneSelect value={timeZone} onChange={setTimeZone} suggestions={[...new Set([timeZone, deviceTimeZone(), ...(existing?.zones ?? [])])]} label="Time zone" />
      </Field>

      <NotesField value={notes} onChange={setNotes} placeholder="Anything useful for everyone: emergency numbers, plans, ideas…" />

      <FormError error={error} />
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(trip ? tripPath(trip.id, 'trip') : '/')}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {trip ? 'Save' : 'Create trip'}
        </button>
      </div>
    </form>
  )
}
