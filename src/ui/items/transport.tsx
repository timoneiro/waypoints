import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { Transport, TransportMode } from '../../db/types'
import { transportEvent } from '../../domain/calendar'
import { transportDuration, tripPhase } from '../../domain/itinerary'
import { mapQuery } from '../../domain/links'
import { airportCode } from '../../domain/places'
import { isDay, zoneCity, zonedInstant } from '../../domain/time'
import { BackLink, CopyCode, DetailHead } from '../components/bits'
import { ChoiceChips, DateTimeField, NotesField, TextField, ZoneField } from '../components/fields'
import { AirportField, CityField } from '../components/PlaceFields'
import { CalendarLinks, MapLinks, WebLink } from '../components/ItemLinks'
import { fmtDayTime, fmtDuration } from '../format'
import { labelOf, TRANSPORT_MODES } from '../labels'
import { useToday } from '../hooks'
import { tripPath, useTrip } from '../tripData'
import { AttachmentsCard } from '../components/Attachments'
import { ReviewsCard } from '../components/Reviews'
import { ItemFooter, ItemForm, ItemGone } from './common'
import { opt, useSave } from './save'
import { useItemZone } from './zone'

export function TransportFormPage() {
  const t = useTrip()
  const { itemId } = useParams()
  const [params] = useSearchParams()
  const existing = itemId ? t.transports.find((r) => r.id === itemId) : undefined
  if (itemId && !existing) return <ItemGone backTo={tripPath(t.trip.id)} />
  return <TransportForm key={itemId ?? 'new'} existing={existing} date={params.get('date')} />
}

function TransportForm({ existing, date }: { existing?: Transport; date: string | null }) {
  const t = useTrip()
  const { trip } = t
  const today = useToday()
  const firstDay = date && isDay(date) ? date : tripPhase(trip, today).phase === 'ongoing' ? today : trip.startDate
  const [mode, setMode] = useState<string>(existing?.mode ?? 'flight')
  const [from, setFrom] = useState(existing?.from ?? '')
  const [to, setTo] = useState(existing?.to ?? '')
  const [departDate, setDepartDate] = useState(existing?.departDate ?? firstDay)
  const [departTime, setDepartTime] = useState(existing?.departTime ?? '')
  const [departTimeZone, setDepartTimeZone] = useItemZone(existing?.departTimeZone, departDate)
  const [arriveDate, setArriveDate] = useState(existing?.arriveDate ?? '')
  const [arriveTime, setArriveTime] = useState(existing?.arriveTime ?? '')
  const [arriveTimeZone, setArriveTimeZone] = useState(existing?.arriveTimeZone ?? '')
  const [carrier, setCarrier] = useState(existing?.carrier ?? '')
  const [number, setNumber] = useState(existing?.number ?? '')
  const [seat, setSeat] = useState(existing?.seat ?? '')
  const [confirmation, setConfirmation] = useState(existing?.confirmation ?? '')
  const [link, setLink] = useState(existing?.link ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const { save, busy, error, setError } = useSave('transports', existing?.id)
  const flight = mode === 'flight'
  // Picking an airport or a city sets the time zone its times are in.
  const PlaceField = flight ? AirportField : CityField

  const onSubmit = () => {
    if (!from.trim() || !to.trim()) return setError('Fill in where it leaves from and where it goes.')
    if (!isDay(departDate)) return setError('Choose the day it leaves.')
    if (arriveDate && !isDay(arriveDate)) return setError('Check the arrival day.')
    const arrivalZone = arriveTimeZone && arriveTimeZone !== departTimeZone ? arriveTimeZone : undefined
    if (arriveDate && arriveDate < departDate) return setError('It arrives before it leaves.')
    if (departTime && arriveTime) {
      const leaves = zonedInstant(departDate, departTime, departTimeZone)
      const arrives = zonedInstant(arriveDate || departDate, arriveTime, arrivalZone ?? departTimeZone)
      if (arrives <= leaves) return setError('It arrives before it leaves. Check the arrival day and time zone.')
    }
    void save({
      mode: mode as TransportMode,
      from: from.trim(),
      to: to.trim(),
      departDate,
      departTime: departTime || undefined,
      departTimeZone,
      arriveDate: arriveDate && arriveDate !== departDate ? arriveDate : undefined,
      arriveTime: arriveTime || undefined,
      arriveTimeZone: arrivalZone,
      carrier: opt(carrier),
      number: opt(number),
      seat: opt(seat),
      confirmation: opt(confirmation),
      link: opt(link),
      notes: opt(notes),
    })
  }

  return (
    <ItemForm title={existing ? 'Edit transport' : 'New transport'} error={error} busy={busy} onSubmit={onSubmit}>
      <ChoiceChips label="How" options={TRANSPORT_MODES} value={mode} onChange={setMode} />
      <div className="field-pair">
        <PlaceField label="From" value={from} onChange={setFrom} onZone={setDepartTimeZone} placeholder={flight ? 'City or code' : 'Lisbon'} />
        <PlaceField label="To" value={to} onChange={setTo} onZone={setArriveTimeZone} placeholder={flight ? 'City or code' : 'Porto'} />
      </div>
      <DateTimeField label="Leaves" date={departDate} time={departTime} required onDate={setDepartDate} onTime={setDepartTime} />
      <ZoneField label="Departure time is local to" value={departTimeZone} onChange={setDepartTimeZone} suggestions={t.zones} />
      <DateTimeField
        label="Arrives"
        date={arriveDate || departDate}
        time={arriveTime}
        onDate={setArriveDate}
        onTime={setArriveTime}
        hint="Change the day for overnight journeys."
      />
      <ZoneField label="Arrival time is local to" value={arriveTimeZone || departTimeZone} onChange={setArriveTimeZone} suggestions={t.zones} />
      <div className="field-pair">
        <TextField label={flight ? 'Airline' : 'Company'} value={carrier} onChange={setCarrier} maxLength={200} />
        <TextField label={flight ? 'Flight no.' : 'Number'} value={number} onChange={setNumber} maxLength={40} autoCapitalize="characters" />
      </div>
      <div className="field-pair">
        <TextField label="Seat" value={seat} onChange={setSeat} maxLength={40} />
        <TextField label="Booking ref." value={confirmation} onChange={setConfirmation} maxLength={200} autoCapitalize="characters" autoComplete="off" />
      </div>
      <TextField label="Link" type="url" value={link} onChange={setLink} placeholder="Booking, check-in or ticket page" maxLength={2000} />
      <NotesField value={notes} onChange={setNotes} placeholder="Terminal, baggage, pick-up point…" />
    </ItemForm>
  )
}

export function TransportPage() {
  const t = useTrip()
  const { itemId } = useParams()
  const r = t.transports.find((x) => x.id === itemId)
  const back = tripPath(t.trip.id)
  if (!r) return <ItemGone backTo={back} />
  const mode = labelOf(TRANSPORT_MODES, r.mode)
  const duration = transportDuration(r)
  const arriveZone = r.arriveTimeZone ?? r.departTimeZone
  const zones = r.departTimeZone === arriveZone ? [r.departTimeZone] : [r.departTimeZone, arriveZone]
  return (
    <article className="stack">
      <BackLink to={back}>Plan</BackLink>
      <DetailHead emoji={mode.emoji} title={`${r.from} → ${r.to}`} subtitle={[mode.label, r.carrier, r.number].filter(Boolean).join(' · ')} />
      <section className="card">
        <dl className="facts">
          <dt>Leaves</dt>
          <dd>{fmtDayTime(r.departDate, r.departTime)}</dd>
          {(r.arriveDate || r.arriveTime) && (
            <>
              <dt>Arrives</dt>
              <dd>{fmtDayTime(r.arriveDate ?? r.departDate, r.arriveTime)}</dd>
            </>
          )}
          {duration !== undefined && (
            <>
              <dt>Takes</dt>
              <dd>{fmtDuration(duration)}</dd>
            </>
          )}
          {r.seat && (
            <>
              <dt>Seat</dt>
              <dd>{r.seat}</dd>
            </>
          )}
          {r.confirmation && (
            <>
              <dt>Booking</dt>
              <dd>
                <CopyCode code={r.confirmation} />
              </dd>
            </>
          )}
        </dl>
        {(zones.length > 1 || zones[0] !== t.trip.timeZone) && (
          <p className="muted small">Local times: {zones.map(zoneCity).join(' → ')}.</p>
        )}
        <div className="actions">
          <WebLink url={r.link}>Booking page</WebLink>
        </div>
      </section>
      <section className="card">
        <h3>Getting there</h3>
        <p className="muted small">Directions to {r.from}.</p>
        <MapLinks query={mapQuery(r.mode === 'flight' && airportCode(r.from) ? `${airportCode(r.from)} airport` : r.from)} />
      </section>
      {r.notes && (
        <section className="card">
          <h3>Notes</h3>
          <p className="prewrap">{r.notes}</p>
        </section>
      )}
      <ReviewsCard target={{ table: 'transports', record: r }} />
      <AttachmentsCard table="transports" id={r.id} />
      <section className="card">
        <h3>Calendar</h3>
        <CalendarLinks event={transportEvent(r)} calendarName={t.trip.name} />
      </section>
      <ItemFooter table="transports" id={r.id} what="journey" backTo={back} />
    </article>
  )
}
