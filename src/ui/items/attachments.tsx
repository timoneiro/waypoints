import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { deleteAttachment, keepOnlyHere, shareAttachment, updateAttachment } from '../../db/attachments'
import { db } from '../../db/db'
import type { Attachment } from '../../db/types'
import { openFile, shareFile } from '../../lib/shareSheet'
import { fetchFull, retryUpload } from '../../sync/files'
import { attachableItems, isPhoto, ownerFinder, parseTarget, photoTime, stateFinder, stateText, targetBooking, targetOf, tripPhotos, useObjectUrl } from '../attachments'
import { BelongsToField, WholeBookingField } from '../components/Attachments'
import { DetailHead, Notice } from '../components/bits'
import { NotesField, TextField } from '../components/fields'
import { fmtBytes, fmtDayTime, fmtTimestamp } from '../format'
import { usable, useServer } from '../hooks'
import { nameOf, tripPath, useTrip } from '../tripData'
import { ItemForm, ItemGone } from './common'
import { opt } from './save'

const what = (a: Attachment) => (isPhoto(a) ? 'photo' : 'document')

export function AttachmentPage() {
  const t = useTrip()
  const { itemId } = useParams()
  const a = t.attachments.find((x) => x.id === itemId)
  if (!a) return <ItemGone backTo={tripPath(t.trip.id, 'photos')} />
  return <AttachmentView key={a.id} a={a} />
}

function AttachmentView({ a }: { a: Attachment }) {
  const t = useTrip()
  const navigate = useNavigate()
  const server = usable(useServer())
  const loaded = useLiveQuery(async () => ({ file: await db.files.get(a.id) }), [a.id])
  const file = loaded?.file
  const state = stateFinder(t)(a, file)
  const item = ownerFinder(t)(a)
  const image = a.type.startsWith('image/')
  const full = useObjectUrl(image ? file?.blob : undefined, `${a.id}:full`)
  const preview = useObjectUrl(image ? file?.thumb : undefined, `${a.id}:thumb`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const back = item?.path ?? tripPath(t.trip.id, 'photos')

  // Someone else's photo comes in full from the server once it's opened, and is kept.
  const auto = useFetchedNow(a.id, loaded !== undefined && state === 'remote' && isPhoto(a))

  const download = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await fetchFull(a.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const photos = isPhoto(a) ? tripPhotos(t) : []
  const index = photos.findIndex((p) => p.id === a.id)
  const [prev, next] = [photos[index - 1], photos[index + 1]]
  const taken = photoTime(a)

  const onDelete = async () => {
    const forEveryone = t.server && !a.private ? ' It will be deleted for everyone on the trip.' : ''
    const everyLeg = item?.booking ? ` It goes from every ${item.booking.noun} on booking ${item.booking.ref}.` : ''
    if (!confirm(`Delete this ${what(a)}?${everyLeg}${forEveryone}`)) return
    await deleteAttachment(a.id)
    navigate(back, { replace: true })
  }

  return (
    <article className="stack">
      {!isPhoto(a) && <DetailHead emoji="📄" title={a.name} subtitle={fmtBytes(a.size)} />}
      {image &&
        (full || preview ? (
          <img
            className="photo-full"
            src={full ?? preview}
            alt={a.caption ?? a.name}
            style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
          />
        ) : (
          <div className="photo-missing" aria-hidden>
            {isPhoto(a) ? '📷' : '🖼️'}
          </div>
        ))}
      {(busy || auto.busy) && <p className="muted small">Getting it from the server…</p>}
      {(error ?? auto.error) && <Notice kind="error">{error ?? auto.error}</Notice>}
      {photos.length > 1 && (
        <div className="row spread">
          {prev ? (
            <Link className="btn btn-small" to={tripPath(t.trip.id, 'files', prev.id)} replace>
              ‹ Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="muted small">
            {index + 1} of {photos.length}
          </span>
          {next ? (
            <Link className="btn btn-small" to={tripPath(t.trip.id, 'files', next.id)} replace>
              Next ›
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
      {a.caption && <p className="prewrap">{a.caption}</p>}

      <div className="actions">
        {file?.blob && !isPhoto(a) && (
          <button type="button" className="btn btn-primary" onClick={() => openFile(file.blob!)}>
            Open
          </button>
        )}
        {file?.blob && (
          <button type="button" className="btn" onClick={() => void shareFile(file.blob!, a.name)}>
            📤 Share or save
          </button>
        )}
        {!file?.blob && state === 'remote' && !busy && !auto.busy && (
          <button type="button" className="btn btn-primary" onClick={() => void download()}>
            ⬇️ Download
          </button>
        )}
      </div>

      <section className="card">
        <dl className="facts">
          <dt>For</dt>
          <dd>
            {item?.booking ? (
              <>
                Every {item.booking.noun} on booking {item.booking.ref}:
                {item.booking.legs.map((leg) => (
                  <Link key={leg.id} className="link" style={{ display: 'block' }} to={leg.path}>
                    {leg.emoji} {leg.title}
                  </Link>
                ))}
              </>
            ) : item ? (
              <Link className="link" to={item.path}>
                {item.emoji} {item.title}
              </Link>
            ) : (
              'The whole trip'
            )}
          </dd>
          {isPhoto(a) && (
            <>
              <dt>Taken</dt>
              <dd>{fmtDayTime(taken.slice(0, 10), taken.slice(11))}</dd>
            </>
          )}
          <dt>Added</dt>
          <dd>
            {a.addedBy && `${nameOf(t, a.addedBy)}, `}
            {fmtTimestamp(a.createdAt)}
          </dd>
          <dt>Size</dt>
          <dd>
            {fmtBytes(a.size)}
            {a.width && a.height ? ` · ${a.width} × ${a.height}` : ''}
          </dd>
        </dl>
        {stateText(state, a, t) && <p className="small">{stateText(state, a, t)}</p>}
        {state === 'refused' && (
          <>
            <p className="muted small">{file?.uploadError}</p>
            <button type="button" className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => void retryUpload(a.id)}>
              Try again
            </button>
          </>
        )}
        {(t.server || server) && <Privacy a={a} hasFile={Boolean(file?.blob)} />}
      </section>

      <div className="actions">
        <Link className="btn btn-primary" to={tripPath(t.trip.id, 'files', a.id, 'edit')}>
          ✏️ Edit
        </Link>
        <button type="button" className="btn btn-danger" onClick={() => void onDelete()}>
          Delete
        </button>
      </div>
    </article>
  )
}

/** Fetches the full file from the server while `wanted`: busy until it's here, or until it fails. */
function useFetchedNow(id: string, wanted: boolean): { busy: boolean; error?: string } {
  const [failed, setFailed] = useState<{ id: string; error: string }>()
  useEffect(() => {
    if (!wanted) return
    let current = true
    fetchFull(id).catch((err: Error) => current && setFailed({ id, error: err.message }))
    return () => {
      current = false
    }
  }, [id, wanted])
  const error = failed?.id === id ? failed.error : undefined
  return { busy: wanted && !error, error }
}

/** Shared with the trip on the server, or kept only on this phone: either way round. */
function Privacy({ a, hasFile }: { a: Attachment; hasFile: boolean }) {
  const t = useTrip()
  const navigate = useNavigate()

  if (a.private) {
    return (
      <button type="button" className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => void shareAttachment(a.id)}>
        🌐 Share it with the trip
      </button>
    )
  }
  // Keeping it here deletes it for everyone else: only for what you added yourself.
  if (!hasFile || (a.addedBy && a.addedBy !== t.me?.id)) return null
  const keep = async () => {
    const others = t.server ? " It's deleted from the server and from the others' phones." : ''
    if (!confirm(`Keep this ${what(a)} only on this phone?${others}`)) return
    const id = await keepOnlyHere(a.id)
    if (id) navigate(tripPath(t.trip.id, 'files', id), { replace: true })
  }
  return (
    <button type="button" className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => void keep()}>
      🔒 Keep it only on this phone
    </button>
  )
}

export function AttachmentFormPage() {
  const t = useTrip()
  const { itemId } = useParams()
  const a = t.attachments.find((x) => x.id === itemId)
  if (!a) return <ItemGone backTo={tripPath(t.trip.id, 'photos')} />
  return <AttachmentForm key={a.id} a={a} />
}

function AttachmentForm({ a }: { a: Attachment }) {
  const t = useTrip()
  const navigate = useNavigate()
  const items = attachableItems(t)
  const owner = ownerFinder(t)(a)
  const [name, setName] = useState(a.name)
  const [caption, setCaption] = useState(a.caption ?? '')
  // An item deleted since shows as the whole trip; a journey deleted since, as the rest of its booking.
  const [target, setTarget] = useState(items.has(targetOf(a)) ? targetOf(a) : owner ? targetOf({ itemTable: owner.table, itemId: owner.id }) : '')
  const [wholeBooking, setWholeBooking] = useState(Boolean(a.wholeBooking))
  const booking = targetBooking(t, target)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const onSubmit = async () => {
    if (!name.trim()) return setError('It needs a name.')
    setBusy(true)
    try {
      // Kept as it was when there's no choice to make: its journey's booking may get others again.
      const whole = booking ? wholeBooking : target === targetOf(a) && a.wholeBooking
      await updateAttachment(a.id, { name: name.trim(), caption: opt(caption), ...parseTarget(target), wholeBooking: whole })
      navigate(-1)
    } catch {
      setError("Couldn't save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <ItemForm title={`Edit ${what(a)}`} error={error} busy={busy} onSubmit={() => void onSubmit()}>
      {!isPhoto(a) && <TextField label="Name" value={name} onChange={setName} maxLength={200} />}
      <NotesField label="Caption" value={caption} onChange={setCaption} />
      <BelongsToField value={target} onChange={setTarget} />
      <WholeBookingField target={target} booking={booking} kind={a.kind} value={wholeBooking} onChange={setWholeBooking} />
    </ItemForm>
  )
}
