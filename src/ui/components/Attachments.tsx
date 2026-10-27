import { useState } from 'react'
import { Link } from 'react-router'
import { addAttachments, type AttachedTo } from '../../db/attachments'
import type { AttachableTable, Attachment, AttachmentKind, StoredFile } from '../../db/types'
import { FileProblem, prepareDocument, preparePhoto } from '../../lib/files'
import {
  attachableItems,
  byTimeTaken,
  isPhoto,
  ITEM_GROUPS,
  ownerFinder,
  parseTarget,
  photoTime,
  showsOn,
  sortDocuments,
  stateBadge,
  stateFinder,
  stateText,
  targetBooking,
  targetOf,
  useObjectUrl,
  useTripFiles,
  wholeByDefault,
  type Booking,
  type FileState,
  type ItemRef,
} from '../attachments'
import { fmtBytes, fmtDay, plural } from '../format'
import { usable, useServer } from '../hooks'
import { tripPath, useTrip } from '../tripData'
import { Notice } from './bits'
import { Field } from './fields'

export function PhotoTile({ a, file, state }: { a: Attachment; file?: StoredFile; state: FileState }) {
  const t = useTrip()
  const preview = file?.thumb ?? (isPhoto(a) ? file?.blob : undefined)
  const url = useObjectUrl(preview, `${a.id}:${file?.thumb ? 'thumb' : 'full'}`)
  const badge = stateBadge(state)
  return (
    <Link className="tile" to={tripPath(t.trip.id, 'files', a.id)} aria-label={a.caption || a.name}>
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="tile-icon">{isPhoto(a) ? '📷' : '📄'}</span>}
      {badge && <span className="tile-badge">{badge}</span>}
    </Link>
  )
}

const docEmoji = (a: Attachment) => (a.type === 'application/pdf' ? '📄' : a.type.startsWith('image/') ? '🖼️' : a.type.includes('pkpass') ? '🎫' : '📎')

export function DocumentRow({ a, file, state, item }: { a: Attachment; file?: StoredFile; state: FileState; item?: ItemRef }) {
  const t = useTrip()
  const url = useObjectUrl(file?.thumb, `${a.id}:thumb`)
  const status = state === 'shared' || state === 'local' ? undefined : stateText(state, a, t)
  return (
    <Link className="list-row" to={tripPath(t.trip.id, 'files', a.id)}>
      {url ? <img className="list-thumb" src={url} alt="" /> : <span className="list-emoji">{docEmoji(a)}</span>}
      <span className="list-text">
        <strong>{a.name}</strong>
        <small className="muted">{[item ? `${item.emoji} ${item.title}` : undefined, a.caption, fmtBytes(a.size)].filter(Boolean).join(' · ')}</small>
        {status && <small className="muted">{status}</small>}
      </span>
    </Link>
  )
}

/** Photos under their days, each day a grid of tiles. */
export function PhotosByDay({ photos }: { photos: Attachment[] }) {
  const t = useTrip()
  const files = useTripFiles(t.trip.id)
  const stateOf = stateFinder(t)
  const days = new Map<string, Attachment[]>()
  for (const a of photos) {
    const day = photoTime(a).slice(0, 10)
    days.set(day, [...(days.get(day) ?? []), a])
  }
  return (
    <>
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
    </>
  )
}

/** Documents first, then a grid of photos, of one item or of the whole trip. Those of a whole booking say so. */
export function AttachmentList({ attachments, showItems }: { attachments: Attachment[]; showItems?: boolean }) {
  const t = useTrip()
  const files = useTripFiles(t.trip.id)
  const ownerOf = ownerFinder(t)
  const stateOf = stateFinder(t)
  const docs = sortDocuments(attachments.filter((a) => !isPhoto(a)), ownerOf)
  const photos = attachments.filter(isPhoto).sort(byTimeTaken)
  return (
    <>
      {docs.length > 0 && (
        <ul className="list">
          {docs.map((a) => (
            <li key={a.id}>
              <DocumentRow a={a} file={files?.get(a.id)} state={stateOf(a, files?.get(a.id))} item={showItems || ownerOf(a)?.booking ? ownerOf(a) : undefined} />
            </li>
          ))}
        </ul>
      )}
      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((a) => (
            <PhotoTile key={a.id} a={a} file={files?.get(a.id)} state={stateOf(a, files?.get(a.id))} />
          ))}
        </div>
      )}
    </>
  )
}

/** What a photo or document belongs to: the whole trip, or one of its items. */
export function BelongsToField({ value, onChange }: { value: string; onChange: (target: string) => void }) {
  const t = useTrip()
  const items = [...attachableItems(t).values()]
  return (
    <Field label="Belongs to">
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.trip.emoji ?? '🧳'} The whole trip</option>
        {(Object.entries(ITEM_GROUPS) as [AttachableTable, string][]).map(([table, label]) => {
          const list = items.filter((i) => i.table === table).sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || a.title.localeCompare(b.title))
          if (!list.length) return null
          return (
            <optgroup key={table} label={label}>
              {list.map((i) => (
                <option key={i.id} value={targetOf({ itemTable: i.table, itemId: i.id })}>
                  {i.emoji} {i.title}
                  {i.day ? ` · ${fmtDay(i.day)}` : ''}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
    </Field>
  )
}

/**
 * For a journey on one booking with others: whether it's for all of them (an e-ticket for connecting
 * flights) or for this one only. For a journey on its own, how to put it on one booking with others.
 */
export function WholeBookingField(props: { target: string; booking?: Booking; kind: AttachmentKind; value: boolean; onChange: (whole: boolean) => void }) {
  const t = useTrip()
  const { itemTable, itemId } = parseTarget(props.target)
  if (itemTable !== 'transports') return null
  if (!props.booking) {
    if (props.kind !== 'document') return null
    const what = t.transports.find((r) => r.id === itemId)?.mode === 'flight' ? 'Connecting flights' : 'Bought with other journeys'
    return <p className="muted small">{what}? Give them all the same booking ref, and a document can show on each of them.</p>
  }
  const others = props.booking.legs.filter((l) => l.id !== itemId)
  return (
    <label className="check">
      <input type="checkbox" checked={props.value} onChange={(e) => props.onChange(e.target.checked)} />
      <span>
        For every {props.booking.noun} on booking {props.booking.ref}
        <small>Also shows on {others.map((l) => l.title).join(', ')}.</small>
      </span>
    </label>
  )
}

const PICK: Record<AttachmentKind, { label: string; accept?: string }> = {
  photo: { label: '📷 Add photos', accept: 'image/*' },
  // Any file: PDFs, screenshots, wallet passes…
  document: { label: '📄 Add documents' },
}

/**
 * Buttons to add photos or documents, then what to add them as. On an item's page they belong to it;
 * on the Photos tab (`choose`), to whatever is picked, the whole trip by default.
 */
export function AddAttachments({ to, choose = false }: { to?: AttachedTo; choose?: boolean }) {
  const t = useTrip()
  const server = usable(useServer())
  const [picked, setPicked] = useState<{ kind: AttachmentKind; files: File[] }>()
  const [target, setTarget] = useState(to ? targetOf(to) : '')
  const [caption, setCaption] = useState('')
  const [onlyHere, setOnlyHere] = useState(false)
  const [wholeBooking, setWholeBooking] = useState<boolean>()
  const [progress, setProgress] = useState<string>()
  const [result, setResult] = useState<{ added: string; problems: string[] }>()
  // Whether it goes to the server is a question only where there's a server.
  const askPrivacy = Boolean(t.server || server)
  const limit = t.server ? server?.fileLimit : undefined
  const booking = targetBooking(t, target)
  const whole = wholeBooking ?? (picked ? wholeByDefault(picked.kind) : false)

  const pick = (kind: AttachmentKind, list: FileList | null) => {
    if (!list?.length) return
    setPicked({ kind, files: [...list] })
    setCaption('')
    setOnlyHere(false)
    setWholeBooking(undefined)
    setResult(undefined)
  }

  const add = async () => {
    if (!picked) return
    const problems: string[] = []
    let added = 0
    for (const [i, file] of picked.files.entries()) {
      setProgress(picked.files.length > 1 ? `Adding ${i + 1} of ${picked.files.length}…` : 'Adding…')
      try {
        const ready = picked.kind === 'photo' ? await preparePhoto(file) : await prepareDocument(file)
        if (limit && !onlyHere && ready.blob.size > limit) {
          throw new FileProblem(`${file.name} is larger than the sync server takes (${fmtBytes(limit)}). Keep it only on this phone, or make it smaller.`)
        }
        // One at a time: what's added stays added, even if a later file fails.
        await addAttachments(t.trip.id, [ready], {
          to: { ...parseTarget(target), wholeBooking: Boolean(booking) && whole },
          private: onlyHere,
          addedBy: t.me?.id,
          caption: picked.files.length === 1 ? caption.trim() || undefined : undefined,
        })
        added++
      } catch (err) {
        problems.push(err instanceof FileProblem ? err.message : `${file.name} couldn't be added.`)
      }
    }
    setProgress(undefined)
    setPicked(undefined)
    setResult({ added: added ? plural(added, picked.kind === 'photo' ? 'photo' : 'document') : '', problems })
  }

  return (
    <>
      {!picked && (
        <div className="actions">
          {(Object.entries(PICK) as [AttachmentKind, (typeof PICK)[AttachmentKind]][]).map(([kind, { label, accept }]) => (
            <label key={kind} className="btn btn-small">
              {label}
              <input
                type="file"
                accept={accept}
                multiple
                hidden
                onChange={(e) => {
                  pick(kind, e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          ))}
        </div>
      )}
      {result && result.added && !result.problems.length && <Notice kind="ok">Added {result.added}.</Notice>}
      {result && result.problems.length > 0 && (
        <Notice kind="error">
          {result.added && `Added ${result.added}. `}
          {result.problems.join(' ')}
        </Notice>
      )}
      {picked && (
        <div className="add-panel stack">
          <strong>
            Add {plural(picked.files.length, picked.kind === 'photo' ? 'photo' : 'document')}
            {picked.files.length <= 3 && <span className="muted small"> · {picked.files.map((f) => f.name).join(', ')}</span>}
          </strong>
          {choose && <BelongsToField value={target} onChange={setTarget} />}
          <WholeBookingField target={target} booking={booking} kind={picked.kind} value={whole} onChange={setWholeBooking} />
          {picked.files.length === 1 && (
            <Field label="Caption">
              <input className="input" value={caption} maxLength={10_000} placeholder="Optional" onChange={(e) => setCaption(e.target.value)} />
            </Field>
          )}
          {askPrivacy && (
            <label className="check">
              <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} />
              <span>
                Only on this phone
                <small>
                  {t.server
                    ? "Not sent to the server, so the others don't see it: for a passport, say."
                    : 'It stays here even if the trip goes on the sync server later: for a passport, say.'}
                </small>
              </span>
            </label>
          )}
          {progress ? (
            <p className="muted small">{progress}</p>
          ) : (
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPicked(undefined)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void add()}>
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

/** On an item's page: its photos and documents (a journey's include those of its whole booking), and adding more. */
export function AttachmentsCard({ table, id }: { table: AttachableTable; id: string }) {
  const t = useTrip()
  const ownerOf = ownerFinder(t)
  const mine = t.attachments.filter((a) => showsOn(ownerOf(a), table, id))
  return (
    <section className="card">
      <h3>Photos & documents</h3>
      <AttachmentList attachments={mine} />
      {/* Afresh for each item: going from one item's page straight to another's keeps this card. */}
      <AddAttachments key={`${table}:${id}`} to={{ itemTable: table, itemId: id }} />
    </section>
  )
}
