import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ATTACHABLE_TABLES } from '../../db/types'
import { attachableItems, bookingOf, ownerFinder, tripPhotos } from '../attachments'
import { Notice } from '../components/bits'
import { PhotosByDay, SelectBar, useSelection } from '../components/Attachments'
import { FILE_GROUPS, isFileGroup } from '../fileGroups'
import { plural } from '../format'
import { ItemGone } from '../items/common'
import { tripPath, useTrip } from '../tripData'

/** All the trip's photos of one kind of thing (the whole trip, its stays…), by day. */
export function PhotoGroupPage() {
  const t = useTrip()
  const { group } = useParams()
  const selection = useSelection()
  const [deleted, setDeleted] = useState<string>()
  const back = tripPath(t.trip.id, 'photos') + '?view=photos'
  if (!isFileGroup(group)) return <ItemGone backTo={back} />
  const ownerOf = ownerFinder(t)
  const photos = tripPhotos(t).filter((a) => (ownerOf(a)?.table ?? 'trip') === group)
  const label = FILE_GROUPS.find((g) => g.key === group)?.label
  return (
    <>
      <h2>{label}</h2>
      {photos.length === 0 ? (
        <>
          <p className="muted small">No photos here any more.</p>
          <Link className="link small" to={back}>
            Back to photos
          </Link>
        </>
      ) : (
        <>
          <div className="row spread">
            <p className="muted small">{plural(photos.length, 'photo')}</p>
            {!selection.active && (
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
            )}
          </div>
          {deleted && <Notice kind="ok">{deleted}</Notice>}
          <PhotosByDay photos={photos} selection={selection} />
          {selection.active && <SelectBar shown={photos} noun="photo" selection={selection} onDeleted={(n) => setDeleted(`Deleted ${plural(n, 'photo')}.`)} />}
        </>
      )}
    </>
  )
}

/** All the photos of one item, or of one whole booking, by day. */
export function PhotoItemPage() {
  const t = useTrip()
  const { group, itemId } = useParams()
  const selection = useSelection()
  const [deleted, setDeleted] = useState<string>()
  const back = tripPath(t.trip.id, 'photos') + '?view=photos'
  const ownerOf = ownerFinder(t)
  const isTable = (ATTACHABLE_TABLES as readonly string[]).includes(group ?? '')
  const heading =
    group === 'booking'
      ? (() => {
          const b = bookingOf(t, itemId)
          return b && { emoji: b.legs[0].emoji, title: b.route }
        })()
      : isTable
        ? attachableItems(t).get(`${group}:${itemId}`)
        : undefined
  if (!heading) return <ItemGone backTo={back} />
  const photos = tripPhotos(t).filter((a) => {
    const owner = ownerOf(a)
    if (!owner) return false
    return group === 'booking' ? !!owner.booking && owner.id === itemId : !owner.booking && owner.table === group && owner.id === itemId
  })
  return (
    <>
      <h2>
        {heading.emoji} {heading.title}
      </h2>
      {photos.length === 0 ? (
        <>
          <p className="muted small">No photos here any more.</p>
          <Link className="link small" to={back}>
            Back to photos
          </Link>
        </>
      ) : (
        <>
          <div className="row spread">
            <p className="muted small">{plural(photos.length, 'photo')}</p>
            {!selection.active && (
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
            )}
          </div>
          {deleted && <Notice kind="ok">{deleted}</Notice>}
          <PhotosByDay photos={photos} selection={selection} />
          {selection.active && <SelectBar shown={photos} noun="photo" selection={selection} onDeleted={(n) => setDeleted(`Deleted ${plural(n, 'photo')}.`)} />}
        </>
      )}
    </>
  )
}
