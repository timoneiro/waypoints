import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Day } from '../../db/types'
import { buildPlan, nextUp, planEntries, tripPhase, type PlanDay, type PlanEntry } from '../../domain/itinerary'
import { mapQuery } from '../../domain/links'
import { daysBetween } from '../../domain/time'
import { CopyCode } from '../components/bits'
import { MapLinks } from '../components/ItemLinks'
import { UnsentNotice } from '../components/UnsentNotice'
import { describeEntry } from '../entries'
import { fmtDay, fmtDayRange, fmtDayTime, fmtTime, plural } from '../format'
import { useNow, useToday } from '../hooks'
import { labelOf, STAY_KINDS, TRANSPORT_MODES } from '../labels'
import { tripPath, useTrip } from '../tripData'
import { ReviewsLink } from './ReviewsPage'

export function PlanPage() {
  const t = useTrip()
  const today = useToday()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'bookings' ? 'bookings' : 'days'
  const plan = useMemo(() => buildPlan(t.trip, t.stays, t.transports, t.activities), [t])
  const entries = useMemo(() => planEntries(t.stays, t.transports, t.activities), [t])
  const id = t.trip.id

  return (
    <>
      <StatusCard plan={plan} entries={entries} today={today} now={now} />
      <ReviewsLink now={now} />
      <UnsentNotice />
      <div className="segmented" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === 'days'} className={view === 'days' ? 'active' : ''} onClick={() => setParams({}, { replace: true })}>
          Day by day
        </button>
        <button
          role="tab"
          aria-selected={view === 'bookings'}
          className={view === 'bookings' ? 'active' : ''}
          onClick={() => setParams({ view: 'bookings' }, { replace: true })}
        >
          Bookings
        </button>
      </div>
      <div className="actions">
        <Link className="btn btn-small" to={tripPath(id, 'stays', 'new')}>
          + Stay
        </Link>
        <Link className="btn btn-small" to={tripPath(id, 'transport', 'new')}>
          + Transport
        </Link>
        <Link className="btn btn-small" to={tripPath(id, 'activities', 'new')}>
          + Activity
        </Link>
      </div>
      {view === 'days' ? <Days plan={plan} today={today} /> : <Bookings />}
    </>
  )
}

function StatusCard({ plan, entries, today, now }: { plan: PlanDay[]; entries: PlanEntry[]; today: Day; now: number }) {
  const t = useTrip()
  const { trip } = t
  const phase = tripPhase(trip, today)

  if (phase.phase === 'upcoming') {
    const first = entries.find((e) => e.day >= trip.startDate) ?? entries[0]
    return (
      <section className="card status">
        <h3>{phase.daysToGo === 1 ? 'Tomorrow!' : `${phase.daysToGo} days to go`}</h3>
        <p className="muted small">
          {fmtDayRange(trip.startDate, trip.endDate)} · {plural(daysBetween(trip.startDate, trip.endDate) + 1, 'day')} ·{' '}
          {plural(t.travellers.length, 'traveller')}
        </p>
        {first && <EntryLine label="First up" entry={first} />}
      </section>
    )
  }
  if (phase.phase === 'past') {
    return (
      <section className="card status">
        <div className="section-head">
          <h3>Trip over</h3>
          <Link className="btn btn-small btn-primary" to={tripPath(trip.id, 'report')}>
            📊 Trip report
          </Link>
        </div>
        <p className="muted small">
          It ended {plural(phase.daysAgo, 'day')} ago.{' '}
          {t.travellers.length > 1 && (
            <>
              See who owes whom in{' '}
              <Link className="link" to={tripPath(trip.id, 'money')}>
                Money
              </Link>
              .
            </>
          )}
        </p>
      </section>
    )
  }

  const night = plan.find((d) => d.day === today)?.night
  const next = nextUp(entries, today, now)
  return (
    <section className="card card-accent status">
      <h3>
        Day {phase.day} of {phase.length}
      </h3>
      {next ? <EntryLine label="Next" entry={next} /> : <p className="muted small">Nothing else with a time today.</p>}
      {night && (
        <>
          <p className="status-line">
            <span aria-hidden>🌙</span>
            <span>
              Tonight:{' '}
              <Link className="link" to={tripPath(trip.id, 'stays', night.id)}>
                {night.name}
              </Link>
              {night.address && <span className="muted"> · {night.address}</span>}
            </span>
          </p>
          <MapLinks query={mapQuery(night.address ?? night.name, night.city)} />
        </>
      )}
    </section>
  )
}

function EntryLine({ label, entry }: { label: string; entry: PlanEntry }) {
  const t = useTrip()
  const view = describeEntry(entry, t)
  return (
    <p className="status-line">
      <span aria-hidden>{view.emoji}</span>
      <span>
        {label}:{' '}
        <Link className="link" to={view.to}>
          {view.title}
        </Link>{' '}
        <span className="muted">· {fmtDayTime(entry.day, entry.time)}</span>
      </span>
    </p>
  )
}

function Days({ plan, today }: { plan: PlanDay[]; today: Day }) {
  // During the trip, the days already behind you fold away.
  const earlier = plan.some((d) => d.day === today) ? plan.filter((d) => d.day < today) : []
  const rest = plan.filter((d) => !earlier.includes(d))
  return (
    <>
      {earlier.length > 0 && (
        <details className="earlier">
          <summary>{plural(earlier.length, 'earlier day')}</summary>
          {earlier.map((d) => (
            <DayView key={d.day} day={d} today={today} />
          ))}
        </details>
      )}
      {rest.map((d) => (
        <DayView key={d.day} day={d} today={today} />
      ))}
    </>
  )
}

function DayView({ day, today }: { day: PlanDay; today: Day }) {
  const t = useTrip()
  return (
    <section className={`day${day.day === today ? ' day-today' : ''}`}>
      <div className="day-head">
        <h3>{fmtDay(day.day)}</h3>
        <span className="muted small">{day.inTrip ? `Day ${day.number}` : day.number < 1 ? 'Before the trip' : 'After the trip'}</span>
      </div>
      {day.entries.length > 0 ? (
        <ul className="list">
          {day.entries.map((e) => (
            <EntryRow key={`${e.kind}-${e.record.id}`} entry={e} />
          ))}
        </ul>
      ) : (
        <p className="muted small">
          Nothing planned.{' '}
          <Link className="link" to={`${tripPath(t.trip.id, 'activities', 'new')}?date=${day.day}`}>
            Add an activity
          </Link>
        </p>
      )}
      {day.night && (
        <p className="night">
          🌙 Night at <Link to={tripPath(t.trip.id, 'stays', day.night.id)}>{day.night.name}</Link>
        </p>
      )}
    </section>
  )
}

function EntryRow({ entry }: { entry: PlanEntry }) {
  const t = useTrip()
  const view = describeEntry(entry, t)
  return (
    <li>
      <Link to={view.to} className="list-row">
        <span className="entry-time">
          {entry.time ? fmtTime(entry.time) : ''}
          {view.zone && <small>{view.zone}</small>}
        </span>
        <span className="list-emoji" aria-hidden>
          {view.emoji}
        </span>
        <span className="list-text">
          <strong>{view.title}</strong>
          {view.detail && <span className="muted small">{view.detail}</span>}
        </span>
      </Link>
    </li>
  )
}

function Bookings() {
  const t = useTrip()
  const id = t.trip.id
  const transports = [...t.transports].sort((a, b) => (a.departDate + (a.departTime ?? '')).localeCompare(b.departDate + (b.departTime ?? '')))
  const stays = [...t.stays].sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))
  const activities = [...t.activities].sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')))
  return (
    <>
      <BookingGroup title="Transport" empty="No transport yet.">
        {transports.map((r) => (
          <BookingRow
            key={r.id}
            to={tripPath(id, 'transport', r.id)}
            emoji={labelOf(TRANSPORT_MODES, r.mode).emoji}
            title={`${r.from} → ${r.to}`}
            detail={[fmtDayTime(r.departDate, r.departTime), [r.carrier, r.number].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
            code={r.confirmation}
          />
        ))}
      </BookingGroup>
      <BookingGroup title="Stays" empty="No stays yet.">
        {stays.map((r) => (
          <BookingRow
            key={r.id}
            to={tripPath(id, 'stays', r.id)}
            emoji={labelOf(STAY_KINDS, r.kind).emoji}
            title={r.name}
            detail={`${fmtDay(r.checkInDate)} → ${fmtDay(r.checkOutDate)} · ${plural(daysBetween(r.checkInDate, r.checkOutDate), 'night')}`}
            code={r.confirmation}
          />
        ))}
      </BookingGroup>
      <BookingGroup title="Activities" empty="No activities yet.">
        {activities.map((r) => (
          <BookingRow
            key={r.id}
            to={tripPath(id, 'activities', r.id)}
            emoji="🎟️"
            title={r.title}
            detail={[fmtDayTime(r.date, r.startTime), r.endTime && `until ${fmtTime(r.endTime)}`, r.city].filter(Boolean).join(' · ')}
            code={r.confirmation}
          />
        ))}
      </BookingGroup>
    </>
  )
}

function BookingGroup({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h3 className="group-title">{title}</h3>
      {children.length ? <ul className="list">{children}</ul> : <p className="muted small">{empty}</p>}
    </section>
  )
}

function BookingRow({ to, emoji, title, detail, code }: { to: string; emoji: string; title: string; detail: string; code?: string }) {
  return (
    <li className="list-row">
      <Link to={to} className="row-link">
        <span className="list-emoji" aria-hidden>
          {emoji}
        </span>
        <span className="list-text">
          <strong>{title}</strong>
          <span className="muted small">{detail}</span>
        </span>
      </Link>
      {code && <CopyCode code={code} />}
    </li>
  )
}
