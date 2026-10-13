import { isPhoto, ownerFinder, photoTime, sortDocuments, stateFinder, tripPhotos, useTripFiles } from '../attachments'
import { Notice } from '../components/bits'
import { AddAttachments, DocumentRow, PhotoTile } from '../components/Attachments'
import { fmtBytes, fmtDay, plural } from '../format'
import { useTrip } from '../tripData'

/** The trip's documents and photos: those of the whole trip and of each item, in one place. */
export function PhotosPage() {
  const t = useTrip()
  const files = useTripFiles(t.trip.id)
  const ownerOf = ownerFinder(t)
  const stateOf = stateFinder(t)
  const docs = sortDocuments(t.attachments.filter((a) => !isPhoto(a)), ownerOf)
  const photos = tripPhotos(t)
  const days = new Map<string, typeof photos>()
  for (const a of photos) {
    const day = photoTime(a).slice(0, 10)
    days.set(day, [...(days.get(day) ?? []), a])
  }
  const states = t.attachments.map((a) => stateOf(a, files?.get(a.id)))
  const waiting = states.filter((s) => s === 'waiting').length
  const refused = states.filter((s) => s === 'refused').length
  const used = files ? [...files.values()].reduce((sum, f) => sum + (f.blob?.size ?? 0) + (f.thumb?.size ?? 0), 0) : 0

  return (
    <>
      <h2>Photos & documents</h2>
      {!t.server && t.travellers.length > 1 && (
        <p className="muted small">
          They stay on this phone: links can't carry them. To share them with the group, put the trip on a sync server (Trip tab).
        </p>
      )}
      {t.oldServer && (
        <Notice kind="warn">The sync server is too old to keep photos and documents. Update it to share them: until then they stay on this phone.</Notice>
      )}
      {t.server && !t.oldServer && (waiting > 0 || refused > 0) && (
        <p className="muted small">
          {waiting > 0 && `⏳ ${plural(waiting, 'file')} waiting to go up to the server. `}
          {refused > 0 && `⚠️ The server didn't take ${plural(refused, 'file')}: open ${refused === 1 ? 'it' : 'them'} to see why.`}
        </p>
      )}

      <AddAttachments choose />

      <section className="stack">
        <h3 className="group-title">Documents</h3>
        {docs.length > 0 ? (
          <ul className="list">
            {docs.map((a) => (
              <li key={a.id}>
                <DocumentRow a={a} file={files?.get(a.id)} state={stateOf(a, files?.get(a.id))} item={ownerOf(a)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Tickets, boarding passes, bookings, insurance… They open here without signal.</p>
        )}
      </section>

      <section className="stack">
        <h3 className="group-title">Photos</h3>
        {photos.length === 0 && <p className="muted small">Photos of the trip, by day. Add them here, or to a stay, an activity or a place.</p>}
        {[...days].map(([day, list]) => (
          <div key={day} className="stack" style={{ gap: 6 }}>
            <h4 className="small muted">{fmtDay(day)}</h4>
            <div className="photo-grid">
              {list.map((a) => (
                <PhotoTile key={a.id} a={a} file={files?.get(a.id)} state={stateOf(a, files?.get(a.id))} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {used > 0 && <p className="muted small">They take {fmtBytes(used)} on this phone.</p>}
    </>
  )
}
