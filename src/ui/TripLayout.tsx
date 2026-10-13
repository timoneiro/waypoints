import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router'
import { setSetting, SETTINGS } from '../db/db'
import { tripPhase } from '../domain/itinerary'
import { EmptyState } from './components/bits'
import { ServerGoneNotice } from './components/ServerGoneNotice'
import { fmtDayRange } from './format'
import { useToday } from './hooks'
import { loadTrip, needsLinks, TripContext, tripPath } from './tripData'

const TABS = [
  { key: 'plan', path: '', icon: '🗓️', label: 'Plan' },
  { key: 'places', path: 'places', icon: '📍', label: 'Places' },
  { key: 'money', path: 'money', icon: '💶', label: 'Money' },
  { key: 'photos', path: 'photos', icon: '📷', label: 'Photos' },
  { key: 'trip', path: 'trip', icon: '🧳', label: 'Trip' },
] as const

/** Which tab a page belongs to, from the part of the path after /trips/<id>/. */
function tabOf(section: string | undefined, over: boolean): (typeof TABS)[number]['key'] {
  if (section === 'places') return 'places'
  // The Plan tab leads to the report once the trip is over; before that, the Trip tab.
  if (section === 'report') return over ? 'plan' : 'trip'
  if (section === 'money' || section === 'expenses' || section === 'exchanges') return 'money'
  if (section === 'photos' || section === 'files') return 'photos'
  if (section === 'trip' || section === 'edit' || section === 'share' || section === 'server') return 'trip'
  return 'plan'
}

export function TripLayout() {
  const { tripId = '' } = useParams()
  const data = useLiveQuery(() => loadTrip(tripId), [tripId])
  const { pathname } = useLocation()
  const today = useToday()
  const found = Boolean(data)

  useEffect(() => {
    if (found) void setSetting(SETTINGS.lastTrip, tripId)
  }, [found, tripId])

  if (data === undefined) return null
  if (data === null) {
    return (
      <main className="page page-plain">
        <EmptyState>
          <p className="big-emoji">🧭</p>
          <p>This trip isn't on this phone.</p>
          <Link className="btn btn-primary" to="/">
            See your trips
          </Link>
        </EmptyState>
      </main>
    )
  }

  const { trip } = data
  const active = tabOf(pathname.split('/')[3], tripPhase(trip, today).phase === 'past')
  const showUnsent = needsLinks(data)
  return (
    <TripContext.Provider value={data}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="icon-btn back" to="/" aria-label="All trips">
            ‹
          </Link>
          <div className="topbar-title">
            <strong>
              {trip.emoji ?? '🧳'} {trip.name}
            </strong>
            <small>{fmtDayRange(trip.startDate, trip.endDate)}</small>
          </div>
          <Link
            className="icon-btn"
            to={tripPath(trip.id, 'share')}
            aria-label={showUnsent ? 'Share with the group (you have changes they haven’t seen)' : 'Share with the group'}
          >
            🔗
            {showUnsent && <span className="dot" />}
          </Link>
        </div>
      </header>
      <main className="page">
        <ServerGoneNotice />
        <Outlet />
      </main>
      <nav className="tabbar">
        {TABS.map((tab) => (
          <Link key={tab.key} to={tripPath(trip.id, tab.path)} className={active === tab.key ? 'active' : undefined} aria-current={active === tab.key ? 'page' : undefined}>
            <span aria-hidden>{tab.icon}</span>
            {tab.label}
          </Link>
        ))}
      </nav>
    </TripContext.Provider>
  )
}
