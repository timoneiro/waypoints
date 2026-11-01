import { useState } from 'react'
import { Link } from 'react-router'
import { saveReview, setMe, type ReviewInput } from '../../db/actions'
import { MAX_STARS, type Review, type Traveller } from '../../db/types'
import { averageStars, canReview, reviewsOf, type ReviewTarget } from '../../domain/reviews'
import { fmtDayTime } from '../format'
import { FormError } from './fields'
import { useNow } from '../hooks'
import { tripPath, useTrip, type TripData } from '../tripData'

const STEPS = Array.from({ length: MAX_STARS }, (_, i) => i + 1)

/** "★★★★☆". */
export function Stars({ value }: { value: number }) {
  const full = Math.round(value)
  return (
    <span className="stars" role="img" aria-label={`${Math.round(value * 10) / 10} of ${MAX_STARS} stars`}>
      {'★'.repeat(full)}
      <span className="stars-empty">{'☆'.repeat(MAX_STARS - full)}</span>
    </span>
  )
}

/** "★ 4.5": the average of a few reviews. */
export function AverageStars({ reviews }: { reviews: Review[] }) {
  const average = averageStars(reviews)
  if (average === undefined) return null
  return (
    <span className="stars" aria-label={`Average ${Math.round(average * 10) / 10} of ${MAX_STARS} stars`}>
      ★ <span className="stars-number">{Math.round(average * 10) / 10}</span>
    </span>
  )
}

function StarPicker({ value, onPick }: { value?: number; onPick: (stars: number) => void }) {
  return (
    <div className="star-picker" role="group" aria-label="Stars">
      {STEPS.map((n) => (
        <button key={n} type="button" className={value !== undefined && n <= value ? 'on' : undefined} aria-pressed={value === n} aria-label={n === 1 ? '1 star' : `${n} stars`} onClick={() => onPick(n)}>
          {value !== undefined && n <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}

/** Reviews are by a traveller, so a phone that hasn't said whose it is asks first. */
export function WhoAreYou({ hint, onPick }: { hint?: string; onPick?: (travellerId: string) => void }) {
  const t = useTrip()
  return (
    <label className="field">
      <span>Which one are you?</span>
      <select className="input" value="" onChange={(e) => {
          const id = e.target.value || undefined
          void setMe(t.trip.id, id).then(() => {
            if (id) onPick?.(id)
          })
        }}
      >
        <option value="">Choose…</option>
        {t.travellers.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <small className="muted">{hint ?? 'So your reviews are yours. Only on this phone: you can change it in the Trip tab.'}</small>
    </label>
  )
}

/** This phone's traveller's review of something: stars, didn't go, and a note. Saves as it goes, telling `onSave`. */
export function MyReview({ target, onSave }: { target: ReviewTarget; onSave?: () => void }) {
  const t = useTrip()
  if (!t.me) return <WhoAreYou />
  const mine = reviewsOf(t.reviews, target).find((r) => r.by === t.me!.id)
  // Starts again from what's saved whenever it changes, here or on another phone.
  return <ReviewForm key={mine?.updatedAt ?? 'new'} target={target} me={t.me} mine={mine} onSave={onSave} />
}

function ReviewForm({ target, me, mine, onSave }: { target: ReviewTarget; me: Traveller; mine?: Review; onSave?: () => void }) {
  const t = useTrip()
  const [note, setNote] = useState(mine?.note ?? '')
  const [writing, setWriting] = useState(Boolean(mine?.note))
  const [error, setError] = useState<string>()

  // Whatever's typed in the note goes along with the stars.
  const save = async (changes: ReviewInput) => {
    setError(undefined)
    onSave?.()
    try {
      await saveReview(t.trip.id, { table: target.table, id: target.record.id }, me.id, { stars: mine?.stars, note, missed: mine?.missed, ...changes })
    } catch {
      setError("Couldn't save. Try again.")
    }
  }
  const remove = () => {
    if (mine?.note && !confirm('Remove your review and its note?')) return
    void save({ stars: undefined, note: undefined, missed: undefined })
  }

  return (
    <div className="stack">
      <div className="row">
        <StarPicker value={mine?.missed ? undefined : mine?.stars} onPick={(stars) => void save({ stars, missed: false })} />
        <button type="button" className="toggle-chip" aria-pressed={Boolean(mine?.missed)} onClick={() => void save({ missed: !mine?.missed })}>
          Didn't go
        </button>
      </div>
      {writing && (
        <textarea
          className="input"
          rows={3}
          value={note}
          maxLength={10_000}
          placeholder={mine?.missed ? 'Why not?' : 'Worth it? What to know for next time?'}
          aria-label="Your note"
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      <div className="row review-actions">
        {writing && note.trim() !== (mine?.note ?? '') && (
          <button type="button" className="btn btn-small btn-primary" onClick={() => void save({ note })}>
            Save note
          </button>
        )}
        {!writing && (
          <button type="button" className="link small" onClick={() => setWriting(true)}>
            + Add a note
          </button>
        )}
        {mine && (
          <button type="button" className="link small" onClick={remove}>
            Remove my review
          </button>
        )}
      </div>
      <FormError error={error} />
    </div>
  )
}

/** The trip's travellers first, in their order; anyone removed from the trip since, after them. */
function byTraveller(t: TripData) {
  const order = new Map(t.travellers.map((x, i) => [x.id, i]))
  return (a: Review, b: Review) => (order.get(a.by) ?? order.size) - (order.get(b.by) ?? order.size) || a.createdAt.localeCompare(b.createdAt)
}

/** Everyone's reviews of one thing: "Ana ★★★★☆" and her note, "Bo didn't go". */
export function ReviewList({ reviews, showMine = false }: { reviews: Review[]; showMine?: boolean }) {
  const t = useTrip()
  const shown = reviews.filter((r) => showMine || r.by !== t.me?.id).sort(byTraveller(t))
  if (!shown.length) return null
  return (
    <ul className="review-list">
      {shown.map((r) => (
        <li key={r.id}>
          <span className="row">
            <strong>{r.by === t.me?.id ? 'You' : (t.names.get(r.by) ?? 'Someone')}</strong>
            {r.missed ? <span className="muted small">didn't go</span> : r.stars !== undefined && <Stars value={r.stars} />}
          </span>
          {r.note && <span className="prewrap small">{r.note}</span>}
        </li>
      ))}
    </ul>
  )
}

/**
 * The reviews card of an activity, place, stay or journey: yours, and everyone else's. It shows up
 * once there's something to review (it has started, or the place was visited), or someone already
 * has. A place also shows the reviews of the activities planned from it.
 */
export function ReviewsCard({ target }: { target: ReviewTarget }) {
  const t = useTrip()
  const now = useNow()
  const reviews = reviewsOf(t.reviews, target)
  const visits =
    target.table === 'places'
      ? t.activities
          .filter((a) => a.placeId === target.record.id)
          .map((a) => ({ activity: a, reviews: reviewsOf(t.reviews, { table: 'activities', record: a }) }))
          .filter((v) => v.reviews.length)
          .sort((a, b) => a.activity.date.localeCompare(b.activity.date))
      : []
  const open = canReview(target, now) || reviews.length > 0
  if (!open && !visits.length) return null
  return (
    <section className="card">
      <div className="section-head">
        <h3>Reviews</h3>
        <AverageStars reviews={reviews} />
      </div>
      {open && <MyReview target={target} />}
      <ReviewList reviews={reviews} />
      {visits.map(({ activity, reviews }) => (
        <div key={activity.id} className="stack" style={{ gap: 6 }}>
          <Link className="link small" to={tripPath(t.trip.id, 'activities', activity.id)}>
            🎟️ {activity.title}, {fmtDayTime(activity.date, activity.startTime)}
          </Link>
          <ReviewList reviews={reviews} showMine />
        </div>
      ))}
    </section>
  )
}
