import { Link, useSearchParams } from 'react-router'
import type { Attachment } from '../../db/types'
import { isPhoto, ownerFinder, sortDocuments, stateFinder, tripPhotos, useTripFiles } from '../attachments'
import { Notice } from '../components/bits'
import { AddAttachments, DocumentRow, PhotoTile } from '../components/Attachments'
import { groupFiles, type FileGroup } from '../fileGroups'
import { fmtBytes, plural } from '../format'
import { tripPath, useTrip } from '../tripData'

/** The trip's documents and photos: those of the whole trip and of each item, in one place. */
export function PhotosPage() {
  const t = useTrip()
  const files = useTripFiles(t.trip.id)
  const ownerOf = ownerFinder(t)
  const stateOf = stateFinder(t)
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'photos' ? 'photos' : 'documents'
  const groupOf = (a: Attachment): FileGroup => ownerOf(a)?.table ?? 'trip'
  const docGroups = groupFiles(sortDocuments(t.attachments.filter((a) => !isPhoto(a)), ownerOf), groupOf)
  const photoGroups = groupFiles(tripPhotos(t), groupOf)
  const states = t.attachments.map((a) => stateOf(a, files?.get(a.id)))
  const waiting = states.filter((s) => s === 'waiting').length
  const refused = states.filter((s) => s === 'refused').length
  const used = files ? [...files.values()].reduce((sum, f) => sum + (f.blob?.size ?? 0) + (f.thumb?.size ?? 0), 0) : 0

  return (
    <>
      <h2>Files</h2>
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

      <div className="segmented" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === 'documents'} className={view === 'documents' ? 'active' : ''} onClick={() => setParams({}, { replace: true })}>
          Documents
        </button>
        <button
          role="tab"
          aria-selected={view === 'photos'}
          className={view === 'photos' ? 'active' : ''}
          onClick={() => setParams({ view: 'photos' }, { replace: true })}
        >
          Photos
        </button>
      </div>

      {view === 'documents' ? (
        <section className="stack">
          {docGroups.length === 0 && <p className="muted small">Tickets, boarding passes, bookings, insurance… They open here without signal.</p>}
          {docGroups.map((g) => (
            <div key={g.group} className="stack" style={{ gap: 6 }}>
              <h3 className="group-title">{g.label}</h3>
              <ul className="list">
                {g.items.map((a) => (
                  <li key={a.id}>
                    <DocumentRow a={a} file={files?.get(a.id)} state={stateOf(a, files?.get(a.id))} item={ownerOf(a)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : (
        <section className="stack">
          {photoGroups.length === 0 && <p className="muted small">Photos of the trip, by day. Add them here, or to a stay, an activity or a place.</p>}
          {photoGroups.map((g) => (
            <div key={g.group} className="stack" style={{ gap: 6 }}>
              <div className="row spread">
                <h3 className="group-title">{g.label}</h3>
                {g.items.length > 3 && (
                  <Link className="link small" to={tripPath(t.trip.id, 'photos', g.group)}>
                    See all {g.items.length} ›
                  </Link>
                )}
              </div>
              <div className="photo-grid photo-row">
                {g.items.slice(0, 3).map((a) => (
                  <PhotoTile key={a.id} a={a} file={files?.get(a.id)} state={stateOf(a, files?.get(a.id))} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {used > 0 && <p className="muted small">They take {fmtBytes(used)} on this phone.</p>}
    </>
  )
}
