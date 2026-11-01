import { Link } from 'react-router'
import type { Connection } from '../../domain/bookings'
import { fmtDayTime, fmtDuration } from '../format'
import { tripPath, useTrip } from '../tripData'

/** The journeys of one connection in order, with the layover and any warning between them. */
export function ConnectionCard({ connection, title }: { connection: Connection; title: string }) {
  const { trip } = useTrip()
  return (
    <section className="card">
      <h3>{title}</h3>
      {connection.legs.map((leg, i) => {
        const join = connection.joins[i - 1]
        return (
          <div key={leg.id}>
            {join && (
              <>
                {(join.layoverMinutes === undefined || join.layoverMinutes >= 0) && (
                  <p className="muted small">
                    {join.layoverMinutes === undefined ? 'Layover time unknown' : `Layover ${fmtDuration(join.layoverMinutes * 60_000)} in ${join.place}`}
                  </p>
                )}
                {join.warnings.map((w) => (
                  <p key={w} className="notice notice-warn small">
                    {w}
                  </p>
                ))}
              </>
            )}
            <p>
              <Link className="link" to={tripPath(trip.id, 'transport', leg.id)}>
                {leg.from} → {leg.to}
              </Link>{' '}
              <span className="muted small">{fmtDayTime(leg.departDate, leg.departTime)}</span>
            </p>
          </div>
        )
      })}
    </section>
  )
}
