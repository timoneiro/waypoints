import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { moveTripToServer } from '../../db/actions'
import type { ServerConfig } from '../../db/serverState'
import { EmptyState } from '../components/bits'
import { Field, FormError } from '../components/fields'
import { usable, useServer } from '../hooks'
import { tripPath, useTrip, type TripData } from '../tripData'

/** Puts a phone-only trip on the sync server, saying which traveller is which server member. */
export function MoveToServerPage() {
  const t = useTrip()
  const server = useServer()
  if (server === undefined) return null
  const connected = usable(server)
  if (t.server) {
    return (
      <EmptyState>
        <p>🌐 “{t.trip.name}” is on the server.</p>
        <Link className="btn" to={tripPath(t.trip.id, 'trip')}>
          Back to the trip
        </Link>
      </EmptyState>
    )
  }
  if (!connected) {
    return (
      <EmptyState>
        <p>Connect this phone to a sync server first.</p>
        <Link className="btn btn-primary" to="/server">
          Sync server
        </Link>
      </EmptyState>
    )
  }
  return <MoveForm t={t} server={connected} />
}

/** Each traveller's member: you for "you", then anyone on the server with the same name. */
function guessLinks(t: TripData, server: ServerConfig): Record<string, string> {
  const links: Record<string, string> = {}
  const taken = new Set<string>()
  const link = (travellerId: string, memberId: string) => {
    links[travellerId] = memberId
    taken.add(memberId)
  }
  if (t.me) link(t.me.id, server.member.id)
  for (const traveller of t.travellers) {
    if (links[traveller.id]) continue
    const known = traveller.memberId && server.members.find((m) => m.id === traveller.memberId && !taken.has(m.id))
    const sameName = server.members.find((m) => !taken.has(m.id) && m.name.toLocaleLowerCase() === traveller.name.trim().toLocaleLowerCase())
    const match = known || sameName
    if (match) link(traveller.id, match.id)
  }
  return links
}

function MoveForm({ t, server }: { t: TripData; server: ServerConfig }) {
  const navigate = useNavigate()
  const [links, setLinks] = useState<Record<string, string | undefined>>(() => guessLinks(t, server))
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const members = server.members.some((m) => m.id === server.member.id) ? server.members : [server.member, ...server.members]
  const used = new Set(Object.values(links).filter(Boolean))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!used.has(server.member.id)) return setError('Choose which traveller you are: the server only shows the trip to the people on it.')
    setBusy(true)
    try {
      await moveTripToServer(t.trip.id, Object.fromEntries(t.travellers.map((x) => [x.id, links[x.id]])))
      navigate(tripPath(t.trip.id, 'trip'), { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={(e) => void onSubmit(e)}>
      <h2>Put “{t.trip.name}” on the server</h2>
      <p className="muted">
        Say who each traveller is on the server. They get the trip, and every change after it, by themselves. Anyone not on the server
        keeps getting links, and links already sent keep working.
      </p>

      <div className="stack" role="group" aria-label="Who's who">
        {t.travellers.map((traveller) => (
          <Field key={traveller.id} label={traveller.name + (traveller.id === t.me?.id ? ' (you)' : '')}>
            <select
              className="input"
              value={links[traveller.id] ?? ''}
              onChange={(e) => setLinks((current) => ({ ...current, [traveller.id]: e.target.value || undefined }))}
            >
              <option value="">Not on the server: gets links</option>
              {members
                .filter((m) => m.id === links[traveller.id] || !used.has(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    🌐 {m.name}
                    {m.id === server.member.id ? ' (you)' : ''}
                  </option>
                ))}
            </select>
          </Field>
        ))}
      </div>

      <p className="muted small">
        Only the people linked here can see the trip on the server. If the server can't be reached right now, the trip goes up the
        next time it can.
      </p>
      {t.attachments.some((a) => !a.private) && (
        <p className="muted small">
          Its photos and documents go up too, and the others on the server see them. Those marked “only on this phone” stay here.
        </p>
      )}
      <FormError error={error} />
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(tripPath(t.trip.id, 'trip'))}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          🌐 Put it on the server
        </button>
      </div>
    </form>
  )
}
