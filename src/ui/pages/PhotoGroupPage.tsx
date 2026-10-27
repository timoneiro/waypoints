import { Link, useParams } from 'react-router'
import { ownerFinder, tripPhotos } from '../attachments'
import { PhotosByDay } from '../components/Attachments'
import { FILE_GROUPS, isFileGroup } from '../fileGroups'
import { plural } from '../format'
import { ItemGone } from '../items/common'
import { tripPath, useTrip } from '../tripData'

/** All the trip's photos of one kind of thing (the whole trip, its stays…), by day. */
export function PhotoGroupPage() {
  const t = useTrip()
  const { group } = useParams()
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
          <p className="muted small">{plural(photos.length, 'photo')}</p>
          <PhotosByDay photos={photos} />
        </>
      )}
    </>
  )
}
