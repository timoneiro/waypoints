import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import type { Activity } from '../../db/types'
import { activityEvent } from '../../domain/calendar'
import { tripPhase } from '../../domain/itinerary'
import { mapQuery } from '../../domain/links'
import { isDay, zoneCity } from '../../domain/time'
import { CopyCode, DetailHead } from '../components/bits'
import { DateTimeField, Field, NotesField, TextField, ZoneField } from '../components/fields'
import { AddressField, CityField } from '../components/PlaceFields'
import { CalendarLinks, MapLinks, WebLink } from '../components/ItemLinks'
import { fmtDayTime, fmtTime } from '../format'
import { labelOf, PLACE_CATEGORIES } from '../labels'
import { useToday } from '../hooks'
import { tripPath, useTrip } from '../tripData'
import { AttachmentsCard } from '../components/Attachments'
import { ReviewsCard } from '../components/Reviews'
import { ItemFooter, ItemForm, ItemGone } from './common'
import { opt, useSave } from './save'
import { useItemZone } from './zone'

export function ActivityFormPage() {
  const t = useTrip()
  const { itemId } = useParams()
  const [params] = useSearchParams()
  const existing = itemId ? t.activities.find((a) => a.id === itemId) : undefined
  if (itemId && !existing) return <ItemGone backTo={tripPath(t.trip.id)} />
  const from = t.places.find((p) => p.id === params.get('place'))
  return <ActivityForm key={itemId ?? 'new'} existing={existing} date={params.get('date')} placeId={from?.id} />
}

function ActivityForm({ existing, date, placeId }: { existing?: Activity; date: string | null; placeId?: string }) {
  const t = useTrip()
  const { trip } = t
  const place = t.places.find((p) => p.id === placeId)
  const today = useToday()
  const firstDay = date && isDay(date) ? date : tripPhase(trip, today).phase === 'ongoing' ? today : trip.startDate
  const [title, setTitle] = useState(existing?.title ?? place?.name ?? '')
  const [day, setDay] = useState(existing?.date ?? firstDay)
  const [startTime, setStartTime] = useState(existing?.startTime ?? '')
  const [endTime, setEndTime] = useState(existing?.endTime ?? '')
  const [timeZone, setTimeZone] = useItemZone(existing?.timeZone, day)
  const [city, setCity] = useState(existing?.city ?? place?.city ?? '')
  const [address, setAddress] = useState(existing?.address ?? place?.address ?? '')
  const [confirmation, setConfirmation] = useState(existing?.confirmation ?? '')
  const [link, setLink] = useState(existing?.link ?? place?.link ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const { save, busy, error, setError } = useSave('activities', existing?.id)

  const onSubmit = () => {
    if (!title.trim()) return setError('What are you doing?')
    if (!isDay(day)) return setError('Choose a day.')
    if (startTime && endTime && endTime <= startTime) return setError('It ends before it starts.')
    void save({
      title: title.trim(),
      date: day,
      startTime: startTime || undefined,
      endTime: startTime ? endTime || undefined : undefined,
      timeZone,
      city: opt(city),
      address: opt(address),
      placeId: existing?.placeId ?? placeId,
      confirmation: opt(confirmation),
      link: opt(link),
      notes: opt(notes),
    })
  }

  return (
    <ItemForm title={existing ? 'Edit activity' : 'New activity'} error={error} busy={busy} onSubmit={onSubmit}>
      <TextField label="What" value={title} onChange={setTitle} placeholder="Fado show, cooking class, day trip to Sintra…" maxLength={200} autoFocus={!existing && !place} />
      <DateTimeField label="When" date={day} time={startTime} required onDate={setDay} onTime={setStartTime} hint="Leave the time empty for all-day plans." />
      {startTime && (
        <Field label="Ends at">
          <input className="input input-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
      )}
      <ZoneField value={timeZone} onChange={setTimeZone} suggestions={t.zones} />
      <CityField value={city} onChange={setCity} onZone={setTimeZone} />
      <AddressField
        label="Address or meeting point"
        value={address}
        onChange={setAddress}
        city={city}
        onPlace={(p) => {
          if (city.trim()) return
          setCity(p.city)
          if (p.zone) setTimeZone(p.zone)
        }}
      />
      <TextField label="Booking reference" value={confirmation} onChange={setConfirmation} maxLength={200} autoComplete="off" />
      <TextField label="Link" type="url" value={link} onChange={setLink} placeholder="Tickets, the venue's website…" maxLength={2000} />
      <NotesField value={notes} onChange={setNotes} />
    </ItemForm>
  )
}

export function ActivityPage() {
  const t = useTrip()
  const { itemId } = useParams()
  const a = t.activities.find((x) => x.id === itemId)
  const back = tripPath(t.trip.id)
  if (!a) return <ItemGone backTo={back} />
  const place = t.places.find((p) => p.id === a.placeId)
  return (
    <article className="stack">
      <DetailHead emoji="🎟️" title={a.title} subtitle={a.city} />
      <section className="card">
        <dl className="facts">
          <dt>When</dt>
          <dd>
            {fmtDayTime(a.date, a.startTime)}
            {a.endTime && ` – ${fmtTime(a.endTime)}`}
            {!a.startTime && ' (all day)'}
          </dd>
          {a.confirmation && (
            <>
              <dt>Booking</dt>
              <dd>
                <CopyCode code={a.confirmation} />
              </dd>
            </>
          )}
          {place && (
            <>
              <dt>Place</dt>
              <dd>
                <Link className="link" to={tripPath(t.trip.id, 'places', place.id)}>
                  {labelOf(PLACE_CATEGORIES, place.category).emoji} {place.name}
                </Link>
              </dd>
            </>
          )}
        </dl>
        {a.startTime && a.timeZone !== t.trip.timeZone && <p className="muted small">Times are {zoneCity(a.timeZone)} time.</p>}
        <div className="actions">
          <WebLink url={a.link}>Website</WebLink>
        </div>
      </section>
      {(a.address || a.city) && (
        <section className="card">
          <h3>Where</h3>
          {a.address && <p className="prewrap">{a.address}</p>}
          <MapLinks query={mapQuery(a.address ?? a.title, a.city)} />
        </section>
      )}
      {a.notes && (
        <section className="card">
          <h3>Notes</h3>
          <p className="prewrap">{a.notes}</p>
        </section>
      )}
      <ReviewsCard target={{ table: 'activities', record: a }} />
      <AttachmentsCard table="activities" id={a.id} />
      <section className="card">
        <h3>Calendar</h3>
        <CalendarLinks event={activityEvent(a)} calendarName={t.trip.name} />
      </section>
      <ItemFooter table="activities" id={a.id} what="activity" backTo={back} />
    </article>
  )
}
