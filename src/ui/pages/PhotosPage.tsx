import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { isPhoto, ownerFinder, sortDocuments, stateFinder, tripPhotos, useTripFiles } from '../attachments'
import { Notice } from '../components/bits'
import { AddAttachments, DocumentRow, PhotoTile, SelectBar, selectOf, useSelection } from '../components/Attachments'
import { sectionFiles } from '../fileGroups'
import { fmtBytes, plural } from '../format'
import { tripPath, useTrip } from '../tripData'

/** The trip's documents and photos: those of the whole trip and of each item, in one place. */
export function PhotosPage() {
  const t = useTrip()
  const files = useTripFiles(t.trip.id)
  const ownerOf = ownerFinder(t)
  const stateOf = stateFinder(t)
  const [params, setParams] = useSearchParams()
  const selection = useSelection()
  const [deleted, setDeleted] = useState<string>()
  const view = params.get('view') === 'photos' ? 'photos' : 'documents'
  const docGroups = sectionFiles(sortDocuments(t.attachments.filter((a) => !isPhoto(a)), ownerOf), ownerOf)
  const photoGroups = sectionFiles(tripPhotos(t), ownerOf)
  const shownDocs = docGroups.flatMap((g) => g.sections.flatMap((s) => s.items))
  const shownPhotos = photoGroups.flatMap((g) => g.sections.flatMap((s) => s.items.slice(0, 3)))
  const shown = view === 'documents' ? shownDocs : shownPhotos
  const noun = view === 'documents' ? 'document' : 'photo'
  const switchView = (next: Record<string, string>) => {
    selection.stop()
    setDeleted(undefined)
    setParams(next, { replace: true })
  }
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
        <button role="tab" aria-selected={view === 'documents'} className={view === 'documents' ? 'active' : ''} onClick={() => switchView({})}>
          Documents
        </button>
        <button
          role="tab"
          aria-selected={view === 'photos'}
          className={view === 'photos' ? 'active' : ''}
          onClick={() => switchView({ view: 'photos' })}
        >
          Photos
        </button>
      </div>

      {shown.length > 0 && !selection.active && (
        <div className="actions">
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              setDeleted(undefined)
              selection.start()
            }}
          >
            Select
          </button>
        </div>
      )}
      {deleted && <Notice kind="ok">{deleted}</Notice>}

      {view === 'documents' ? (
        <section className="stack">
          {docGroups.length === 0 && <p className="muted small">Tickets, boarding passes, bookings, insurance… They open here without signal.</p>}
          {docGroups.map((g) => (
            <div key={g.group} className="stack" style={{ gap: 6 }}>
              <h3 className="group-title">{g.label}</h3>
              {g.sections.map((s) => (
                <div key={s.key} className="stack" style={{ gap: 6 }}>
                  {g.group !== 'trip' && (
                    <div className="row spread">
                      <h4>
                        {s.emoji} {s.title}
                      </h4>
                    </div>
                  )}
                  <ul className="list">
                    {s.items.map((a) => (
                      <li key={a.id}>
                        <DocumentRow a={a} file={files?.get(a.id)} state={stateOf(a, files?.get(a.id))} select={selectOf(selection, a.id)} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </section>
      ) : (
        <section className="stack">
          {photoGroups.length === 0 && <p className="muted small">Photos of the trip, by day. Add them here, or to a stay, an activity or a place.</p>}
          {photoGroups.map((g) => (
            <div key={g.group} className="stack" style={{ gap: 6 }}>
              {g.sections.map((s) => {
                const seeAll = s.items.length > 3 && (
                  <Link className="link small" to={tripPath(t.trip.id, ...s.seeAll)}>
                    See all {s.items.length} ›
                  </Link>
                )
                return (
                  <div key={s.key} className="stack" style={{ gap: 6 }}>
                    {g.group === 'trip' ? (
                      <div className="row spread">
                        <h3 className="group-title">{g.label}</h3>
                        {seeAll}
                      </div>
                    ) : (
                      <>
                        {s === g.sections[0] && <h3 className="group-title">{g.label}</h3>}
                        <div className="row spread">
                          <h4>
                            {s.emoji} {s.title}
                          </h4>
                          {seeAll}
                        </div>
                      </>
                    )}
                    <div className="photo-grid photo-row">
                      {s.items.slice(0, 3).map((a) => (
                        <PhotoTile key={a.id} a={a} file={files?.get(a.id)} state={stateOf(a, files?.get(a.id))} select={selectOf(selection, a.id)} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      )}

      {selection.active && <SelectBar shown={shown} noun={noun} selection={selection} onDeleted={(n) => setDeleted(`Deleted ${plural(n, noun)}.`)} />}

      {used > 0 && <p className="muted small">They take {fmtBytes(used)} on this phone.</p>}
    </>
  )
}
