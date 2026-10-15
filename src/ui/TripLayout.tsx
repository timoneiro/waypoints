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
import { TABS, tabOf } from './tripNav'

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
