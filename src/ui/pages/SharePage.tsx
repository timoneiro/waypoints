import { useEffect, useState } from 'react'
import { clearUnsent } from '../../db/actions'
import { exportTripFile, readTables } from '../../db/backupIO'
import { downloadJSON, fileSlug } from '../../lib/download'
import { shareUrl } from '../../lib/shareSheet'
import { LONG_LINK_CHARS, tripLink } from '../../lib/tripLink'
import { Notice } from '../components/bits'
import { Field } from '../components/fields'
import { plural } from '../format'
import { needsLinks, useTrip } from '../tripData'

export function SharePage() {
  const t = useTrip()
  const { trip } = t
  const [sentBy, setSentBy] = useState(t.me?.name ?? '')
  const [link, setLink] = useState<string>()
  const [result, setResult] = useState<'shared' | 'copied'>()
  const [busy, setBusy] = useState(false)

  // The link is rebuilt whenever the trip changes, so it always holds the latest version.
  useEffect(() => {
    let cancelled = false
    readTables(trip.id)
      .then((tables) => tripLink(tables, sentBy))
      .then((url) => !cancelled && setLink(url))
    return () => {
      cancelled = true
    }
  }, [t, trip.id, sentBy])

  const onShare = async () => {
    if (!link) return
    setBusy(true)
    try {
      const who = sentBy.trim()
      const text = `${who ? `${who} shared` : 'Here’s'} “${trip.name}” on waypoints. Open the link to add the trip, or to update your copy:`
      const outcome = await shareUrl(link, trip.name, text)
      setResult(outcome)
      if (outcome) await clearUnsent(trip.id)
    } finally {
      setBusy(false)
    }
  }

  const onSaveFile = async () => downloadJSON(await exportTripFile(trip.id), `${fileSlug(trip.name)}.waypoints.json`)

  const counts = [
    plural(t.stays.length, 'stay'),
    plural(t.transports.length, 'journey', 'journeys'),
    plural(t.activities.length, 'activity', 'activities'),
    plural(t.places.length, 'place'),
    plural(t.expenses.length, 'expense'),
  ]

  return (
    <>
      <h2>Share with the group</h2>
      {t.server && <ServerNote />}
      <p className="muted">
        Everyone keeps their own copy of the trip on their phone. Send this link in your group chat: opening it adds the trip,
        or brings an existing copy up to date. When someone else changes something, they send a link back the same way.
      </p>
      <ul className="steps small muted">
        <li>No server is involved: the whole trip travels inside the link.</li>
        <li>Changes are merged item by item, so nothing anyone adds gets lost. If two people edit the same item, the later edit wins.</li>
      </ul>

      <Field label="Your name" hint="Shown to the others as who sent it.">
        <input className="input" value={sentBy} maxLength={60} placeholder="Optional" onChange={(e) => setSentBy(e.target.value)} />
      </Field>

      <section className="card">
        <p className="small">
          <strong>{counts.join(' · ')}</strong>
        </p>
        {needsLinks(t) && <p className="small muted">Includes {plural(t.unsent, 'change')} the others haven't seen yet.</p>}
        <button className="btn btn-primary" disabled={!link || busy} onClick={() => void onShare()}>
          {result === 'copied' ? '✓ Link copied' : result === 'shared' ? '✓ Shared' : '🔗 Share trip link'}
        </button>
        {result === 'copied' && <p className="small muted">Paste it into your group chat.</p>}
        {link && link.length > LONG_LINK_CHARS && (
          <Notice kind="warn">
            <span className="small">
              This trip makes a long link ({link.length.toLocaleString()} characters). Some chat apps cut long links short: if
              it doesn't open for someone, send them the file instead.
            </span>
          </Notice>
        )}
        <button className="btn" onClick={() => void onSaveFile()}>
          ⬇️ Save as a file
        </button>
        <p className="muted small">
          Anyone with the link or file can see everything in this trip, including expenses and notes, and a sent link can't be
          taken back. Files open with <strong>Open a trip link or file</strong> on the trip list.
        </p>
      </section>
    </>
  )
}

/** On a trip on the server, links are only needed for the people who aren't on it. */
function ServerNote() {
  const t = useTrip()
  const onServer = t.linked.map((x) => x.name)
  const others = t.viaLinks.filter((x) => x.id !== t.me?.id).map((x) => x.name)
  return (
    <p className="notice notice-info small">
      🌐 This trip is on the sync server, so {onServer.join(', ')} get every change by themselves.{' '}
      {others.length
        ? `Send this link to ${others.join(', ')}, who ${others.length === 1 ? "isn't" : "aren't"} on it.`
        : "A link is still handy for someone who isn't on the server."}
    </p>
  )
}
