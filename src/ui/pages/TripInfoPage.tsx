import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { removeTripFromPhone, setMe } from '../../db/actions'
import { buildICS, tripEvents } from '../../domain/calendar'
import { daysBetween, timeZoneName, zoneCity } from '../../domain/time'
import { downloadBlob, fileSlug } from '../../lib/download'
import { leaveTrip } from '../../sync/account'
import { Notice } from '../components/bits'
import { ServerStatus } from '../components/ServerStatus'
import { currencyName, fmtDayRange, plural } from '../format'
import { usable, useNow, useServer } from '../hooks'
import { tripPath, useTrip, type TripData } from '../tripData'

export function TripInfoPage() {
  const t = useTrip()
  const navigate = useNavigate()
  const now = useNow()
  const { trip } = t
  const group = t.travellers.length > 1
  const events = tripEvents(t.stays, t.transports, t.activities)

  const downloadCalendar = () =>
    downloadBlob(new Blob([buildICS(events, trip.name)], { type: 'text/calendar' }), `${fileSlug(trip.name)}.ics`)

  const server = usable(useServer())

  const remove = async () => {
    const others = group ? ' The others keep their copy, and a link from them brings it back.' : ''
    if (!confirm(`Remove “${trip.name}” from this phone?${others} A safety copy is kept in Settings.${filesGo(t)}`)) return
    await removeTripFromPhone(trip)
    navigate('/', { replace: true })
  }

  return (
    <>
      <section className="card">
        <div className="section-head">
          <h3>
            {trip.emoji ?? '🧳'} {trip.name}
          </h3>
          <Link className="btn btn-small" to={tripPath(trip.id, 'edit')}>
            ✏️ Edit
          </Link>
        </div>
        <dl className="facts">
          <dt>Dates</dt>
          <dd>
            {fmtDayRange(trip.startDate, trip.endDate)} · {plural(daysBetween(trip.startDate, trip.endDate) + 1, 'day')}
          </dd>
          <dt>Time zone</dt>
          <dd>
            {zoneCity(trip.timeZone)} ({timeZoneName(trip.timeZone, now)})
          </dd>
          <dt>Currency</dt>
          <dd>
            {trip.currency} · {currencyName(trip.currency)}
          </dd>
        </dl>
        {trip.notes && <p className="prewrap">{trip.notes}</p>}
      </section>

      <section className="card">
        <h3>Who's going</h3>
        <p>{t.travellers.map((x) => (t.server && t.linked.includes(x) ? '🌐 ' : '') + x.name + (x.id === t.me?.id ? ' (you)' : '')).join(', ')}</p>
        {t.server && <p className="muted small">🌐 On the sync server: they get changes by themselves.</p>}
        {group && (
          <label className="field">
            <span>Which one are you?</span>
            <select className="input" value={t.me?.id ?? ''} onChange={(e) => void setMe(trip.id, e.target.value || undefined)}>
              {!t.me && <option value="">Choose…</option>}
              {t.travellers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <small className="muted">Only on this phone: who “paid by” starts as, your part of the spending, and whose reviews you write.</small>
          </label>
        )}
      </section>

      {t.server ? (
        <OnServerCard t={t} />
      ) : (
        <section className="card">
          <h3>Share with the group</h3>
          <p className="muted small">
            {group
              ? t.unsent
                ? `You have ${plural(t.unsent, 'change')} the others haven't seen yet.`
                : "The others have had everything you've changed."
              : 'Send the trip to the people going: they get their own copy, and can add places and expenses too.'}
          </p>
          <Link className="btn btn-primary" to={tripPath(trip.id, 'share')}>
            🔗 Share the trip
          </Link>
          {server && <ServerOffer t={t} />}
        </section>
      )}

      <section className="card">
        <h3>Calendar</h3>
        <p className="muted small">
          A calendar file with every stay, journey and activity ({events.length}). Open it on your phone to add them to Google or
          Apple Calendar. Downloading it again after changes updates the events instead of copying them.
        </p>
        <button className="btn" disabled={!events.length} onClick={downloadCalendar}>
          📅 Download calendar (.ics)
        </button>
      </section>

      {t.server ? (
        <LeaveCard t={t} />
      ) : (
        <section className="card">
          <h3>Remove from this phone</h3>
          <p className="muted small">
            Deletes the trip from this phone only.{group && ' The others keep their copy.'} A safety copy is kept in Settings → Backup.
          </p>
          <button className="btn btn-danger" onClick={() => void remove()}>
            Remove from this phone
          </button>
        </section>
      )}
    </>
  )
}

/** Photos and documents that exist only on this phone are lost with the trip: safety copies can't keep files. */
function filesGo(t: TripData): string {
  const onlyHere = t.attachments.filter((a) => !t.server || a.private).length
  if (!onlyHere) return ''
  const these = onlyHere === 1 ? 'a photo or document that is only on this phone: it' : `${onlyHere} photos and documents that are only on this phone: they`
  return `\n\nIt has ${these} won't be kept, as safety copies can't hold them. Save any you want first (open one → Share or save).`
}

function OnServerCard({ t }: { t: TripData }) {
  const others = t.viaLinks.filter((x) => x.id !== t.me?.id)
  return (
    <section className="card">
      <h3>🌐 On the sync server</h3>
      <p className="muted small">Changes reach everyone on the server by themselves, usually within a minute while their app is open.</p>
      <ServerStatus waiting={t.waiting} />
      {others.length > 0 && (
        <>
          <p className="small">
            {others.map((x) => x.name).join(', ')} {others.length === 1 ? "isn't" : "aren't"} on the server, so they get changes by
            link{t.unsent > 0 ? `: you have ${plural(t.unsent, 'change')} they haven't seen yet.` : '.'}
          </p>
          <Link className="btn btn-primary" to={tripPath(t.trip.id, 'share')}>
            🔗 Send them a link
          </Link>
        </>
      )}
      {others.length === 0 && (
        <Link className="btn" to={tripPath(t.trip.id, 'share')}>
          🔗 Share a link
        </Link>
      )}
      <p className="muted small">To add people from the server, or take someone off it, edit the trip.</p>
    </section>
  )
}

function LeaveCard({ t }: { t: TripData }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const leave = async () => {
    const msg = `Leave “${t.trip.name}”? You're taken off it on the server and it's removed from this phone. The others keep it, and your expenses stay in it. A safety copy is kept in Settings.${filesGo(t)}`
    if (!confirm(msg)) return
    setBusy(true)
    setError(undefined)
    try {
      await leaveTrip(t.trip.id)
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h3>Leave the trip</h3>
      <p className="muted small">
        Takes you off this trip on the server, and removes it from this phone. The others keep it, and you stay in its expenses. It
        needs the server, so do it while you can reach it.
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn btn-danger" disabled={busy} onClick={() => void leave()}>
        {busy ? 'Leaving…' : 'Leave the trip'}
      </button>
    </section>
  )
}

/**
 * A trip that's only on this phone can go on the server, unless others already have it there (this
 * phone was taken off it, or never added): then only someone on it can add you.
 */
function ServerOffer({ t }: { t: TripData }) {
  const there = t.linked.filter((x) => x.id !== t.me?.id)
  if (there.length) {
    return (
      <p className="muted small">
        🌐 {there.map((x) => x.name).join(', ')} {there.length === 1 ? 'has' : 'have'} this trip on the sync server. To get its
        changes by yourself too, ask {there.length === 1 ? 'them' : 'one of them'} to add you to it (Edit trip).
      </p>
    )
  }
  return (
    <>
      <p className="muted small">Or put it on your sync server: the people on it then get every change by themselves, without links.</p>
      <Link className="btn" to={tripPath(t.trip.id, 'server')}>
        🌐 Put it on the server
      </Link>
    </>
  )
}
