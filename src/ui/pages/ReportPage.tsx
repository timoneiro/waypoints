import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { saveReport } from '../../db/actions'
import { tripPhase } from '../../domain/itinerary'
import { buildReport, changedSince, readReport, type ReportInput } from '../../domain/report'
import { fileSlug } from '../../lib/download'
import { reportFile } from '../../lib/reportFile'
import { shareFile } from '../../lib/shareSheet'
import { photoTime, tripPhotos, useTripFiles } from '../attachments'
import { BackLink, Notice } from '../components/bits'
import { ReportView } from '../components/ReportView'
import { fmtTimestamp, plural } from '../format'
import { useNow, useToday } from '../hooks'
import { nameOf, tripPath, useTrip, type TripData } from '../tripData'

/** What the report is made from: the trip as it is on this phone, and the photos anyone may see. */
const reportInput = (t: TripData): ReportInput => ({
  ...t,
  photos: tripPhotos(t)
    .filter((a) => !a.private)
    .map((a) => ({ id: a.id, day: photoTime(a).slice(0, 10) })),
})

/** Trips whose report this page is keeping right now: effects run twice while developing. */
const keeping = new Set<string>()

/**
 * The trip report. Once a trip on the sync server is over, the first phone to open it keeps it there
 * for everyone, and from then on everyone opens that one, until someone makes it again. Otherwise
 * (before the end, or a trip only on this phone) it's made afresh from the trip as it is here.
 */
export function ReportPage() {
  const t = useTrip()
  const today = useToday()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const shareable = params.get('view') === 'shareable'
  const [costs, setCosts] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const files = useTripFiles(t.trip.id)
  const page = useRef<HTMLDivElement>(null)
  const tripId = t.trip.id

  const over = tripPhase(t.trip, today).phase === 'past'
  const fresh = useMemo(() => buildReport(reportInput(t), now), [t, now])
  const kept = t.report ? readReport(t.report.data) : undefined
  // Only once this phone has had the group's changes from the server, so it isn't kept half made.
  const synced = Boolean(t.server?.uploaded && t.server.cursor > 0 && !t.serverGone)
  const keepable = over && synced

  useEffect(() => {
    if (!keepable || t.report || keeping.has(tripId)) return
    keeping.add(tripId)
    saveReport(tripId, fresh, t.me?.id)
      .catch(() => setError("Couldn't keep the report. It's shown as it is on this phone."))
      .finally(() => keeping.delete(tripId))
  }, [keepable, t.report, tripId, fresh, t.me?.id])

  // Printing shows everything, folded parts too.
  useEffect(() => {
    const open = () => page.current?.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''))
    window.addEventListener('beforeprint', open)
    return () => window.removeEventListener('beforeprint', open)
  }, [])

  const report = kept ?? fresh
  const changes = t.report ? changedSince([t.travellers, t.stays, t.transports, t.activities, t.places, t.expenses, t.exchanges, t.reviews, t.attachments], t.report.updatedAt) : 0

  const makeAgain = async () => {
    setError(undefined)
    try {
      await saveReport(tripId, buildReport(reportInput(t), Date.now()), t.me?.id)
    } catch {
      setError("Couldn't make it again. Try again.")
    }
  }

  const saveFile = async () => {
    if (!page.current) return
    setBusy(true)
    setError(undefined)
    try {
      const photos = new Map([...(files ?? [])].flatMap(([id, f]) => (f.thumb ?? f.blob ? [[id, (f.thumb ?? f.blob)!] as const] : [])))
      const title = `${report.trip.name} · trip report`
      const blob = await reportFile(page.current, title, photos)
      await shareFile(blob, `${fileSlug(report.trip.name)}-report${shareable ? '-shareable' : ''}.html`)
    } catch {
      setError("Couldn't make the file. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="stack no-print">
        <BackLink to={tripPath(tripId, over ? '' : 'trip')}>{over ? 'Plan' : 'Trip'}</BackLink>
        <h2>Trip report</h2>
        <Status over={over} kept={Boolean(kept)} unreadable={Boolean(t.report && !kept)} synced={synced} changes={changes} onMakeAgain={() => void makeAgain()} />
        <div className="segmented" role="tablist" aria-label="Version">
          <button role="tab" aria-selected={!shareable} className={shareable ? '' : 'active'} onClick={() => setParams({}, { replace: true })}>
            Full report
          </button>
          <button role="tab" aria-selected={shareable} className={shareable ? 'active' : ''} onClick={() => setParams({ view: 'shareable' }, { replace: true })}>
            Shareable
          </button>
        </div>
        {shareable ? (
          <>
            <p className="muted small">For anyone: the trip and its reviews, without names, notes or photos.</p>
            <label className="check">
              <input type="checkbox" checked={costs} onChange={(e) => setCosts(e.target.checked)} />
              <span>
                Include what it cost
                <small>The total, by category and by day. Not who paid what.</small>
              </span>
            </label>
          </>
        ) : (
          <p className="muted small">For the group: everyone's spending, reviews and notes, and the photos.</p>
        )}
        <div className="actions">
          <button className="btn btn-small" onClick={() => window.print()}>
            🖨️ Print or save as PDF
          </button>
          <button className="btn btn-small" disabled={busy} onClick={() => void saveFile()}>
            {busy ? 'Making the file…' : '📄 Save or send as a file'}
          </button>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
      </div>
      <div ref={page} className="report">
        <ReportView report={report} shareable={shareable} costs={costs} files={files} />
      </div>
    </>
  )
}

function Status(props: { over: boolean; kept: boolean; unreadable: boolean; synced: boolean; changes: number; onMakeAgain: () => void }) {
  const t = useTrip()
  const { over, kept, unreadable, synced, changes, onMakeAgain } = props
  if (unreadable) {
    return <Notice kind="warn">The report kept for everyone was made by a newer version of waypoints: update the app to see it. This one is made from the trip as it is on this phone.</Notice>
  }
  if (kept && t.report) {
    const by = t.report.madeBy && (t.report.madeBy === t.me?.id ? 'you' : nameOf(t, t.report.madeBy))
    return (
      <div className="stack" style={{ gap: 6 }}>
        <p className="muted small">
          🌐 Kept for everyone on the sync server: made {fmtTimestamp(t.report.updatedAt)}
          {by && ` by ${by}`}.
          {changes > 0 && ` The trip has changed since (${plural(changes, 'change')}).`}
        </p>
        <button className={`btn btn-small${changes > 0 ? ' btn-primary' : ''}`} style={{ alignSelf: 'flex-start' }} onClick={onMakeAgain}>
          ↻ Make it again
        </button>
      </div>
    )
  }
  if (!over) {
    return (
      <p className="muted small">
        The trip so far.{t.server && ' Once it’s over, the report is kept on the sync server, the same for everyone.'}
      </p>
    )
  }
  if (t.server && !t.serverGone) {
    return <p className="muted small">{synced ? '🌐 Keeping it on the sync server for everyone…' : '🌐 Once this phone has synced the trip, the report is kept on the sync server for everyone.'}</p>
  }
  return <p className="muted small">Made from the trip as it is on this phone.</p>
}
