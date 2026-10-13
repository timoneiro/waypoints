import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Review } from '../../db/types'
import { averageStars, plannedPlaces, reviewsOf, reviewTargets, toReview, whenOver, type ReviewTarget } from '../../domain/reviews'
import { BackLink, EmptyState } from '../components/bits'
import { AverageStars, MyReview, ReviewList, WhoAreYou } from '../components/Reviews'
import { describeTarget } from '../entries'
import { plural } from '../format'
import { useNow } from '../hooks'
import { tripPath, useTrip } from '../tripData'

const keyOf = (target: ReviewTarget) => `${target.table}/${target.record.id}`

/** What's left for you to review, and everyone's reviews so far. */
export function ReviewsPage() {
  const t = useTrip()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const sort = params.get('sort') === 'stars' ? 'stars' : 'latest'
  // What you review here stays where it is until you leave the page, so a note can follow the stars.
  const [kept, setKept] = useState<string[]>([])
  const targets = useMemo(() => reviewTargets(t), [t])

  const pending = toReview(targets, t.reviews, t.me?.id, now)
  const pendingKeys = new Set(pending.map(keyOf))
  const listed = [...pending, ...targets.filter((x) => kept.includes(keyOf(x)) && !pendingKeys.has(keyOf(x)))].sort((a, b) => whenOver(b) - whenOver(a))
  const keep = (target: ReviewTarget) => setKept((k) => (k.includes(keyOf(target)) ? k : [...k, keyOf(target)]))

  const planned = plannedPlaces(t.activities)
  const reviewed = targets
    .map((target) => ({ target, reviews: reviewsOf(t.reviews, target) }))
    .filter((x) => x.reviews.length && !kept.includes(keyOf(x.target)))
    .sort((a, b) =>
      sort === 'stars'
        ? (averageStars(b.reviews) ?? 0) - (averageStars(a.reviews) ?? 0) || whenOver(b.target) - whenOver(a.target)
        : whenOver(b.target) - whenOver(a.target),
    )

  return (
    <article className="stack">
      <BackLink to={tripPath(t.trip.id)}>Plan</BackLink>
      <h2>Reviews</h2>
      {!t.me && <WhoAreYou />}

      {listed.length === 0 && reviewed.length === 0 ? (
        <EmptyState>
          <p className="big-emoji">⭐</p>
          <p>Nothing to review yet.</p>
          <p className="muted small">
            Activities, stays and journeys show up here once they're over, and places once someone ticks them as “Been there”.
          </p>
        </EmptyState>
      ) : (
        <>
          <section className="stack">
            <h3 className="group-title">
              To review <span className="count">{pending.length}</span>
            </h3>
            {listed.length ? (
              <ul className="list">
                {listed.map((target) => (
                  <ToReviewRow key={keyOf(target)} target={target} done={!pendingKeys.has(keyOf(target))} onReview={() => keep(target)} />
                ))}
              </ul>
            ) : (
              <p className="muted small">You're all caught up. New things show up here once they're over.</p>
            )}
          </section>

          {reviewed.length > 0 && (
            <section className="stack">
              <div className="section-head">
                <h3 className="group-title">Reviewed</h3>
                <div className="chips" aria-label="Order">
                  <button className="toggle-chip" aria-pressed={sort === 'latest'} onClick={() => setParams({}, { replace: true })}>
                    Latest
                  </button>
                  <button className="toggle-chip" aria-pressed={sort === 'stars'} onClick={() => setParams({ sort: 'stars' }, { replace: true })}>
                    Top rated
                  </button>
                </div>
              </div>
              <ul className="list">
                {reviewed.map(({ target, reviews }) => (
                  <ReviewedRow key={keyOf(target)} target={target} reviews={reviews} />
                ))}
              </ul>
            </section>
          )}
          {targets.some((x) => x.table === 'places' && planned.has(x.record.id)) && (
            <p className="muted small">Places in the plan are reviewed through their activities.</p>
          )}
        </>
      )}
    </article>
  )
}

function Heading({ target }: { target: ReviewTarget }) {
  const t = useTrip()
  const view = describeTarget(target, t)
  return (
    <Link to={view.to} className="row-link">
      <span className="list-emoji" aria-hidden>
        {view.emoji}
      </span>
      <span className="list-text">
        <strong>{view.title}</strong>
        {view.detail && <span className="muted small">{view.detail}</span>}
      </span>
    </Link>
  )
}

function ToReviewRow({ target, done, onReview }: { target: ReviewTarget; done: boolean; onReview: () => void }) {
  const t = useTrip()
  return (
    <li className="card review-row">
      <div className="row nowrap spread">
        <Heading target={target} />
        {done && <span className="chip">✓ Saved</span>}
      </div>
      {t.me && <MyReview target={target} onSave={onReview} />}
    </li>
  )
}

function ReviewedRow({ target, reviews }: { target: ReviewTarget; reviews: Review[] }) {
  return (
    <li className="card review-row">
      <div className="row nowrap spread">
        <Heading target={target} />
        <AverageStars reviews={reviews} />
      </div>
      <ReviewList reviews={reviews} showMine />
    </li>
  )
}

/** The Plan tab's way in: how many things are waiting for your review. */
export function ReviewsLink({ now }: { now: number }) {
  const t = useTrip()
  const targets = useMemo(() => reviewTargets(t), [t])
  const pending = toReview(targets, t.reviews, t.me?.id, now)
  const reviewed = targets.filter((x) => reviewsOf(t.reviews, x).length).length
  if (!pending.length && !reviewed) return null
  const names = pending.map((x) => describeTarget(x, t).title)
  const detail = pending.length
    ? names.length > 2
      ? `${names.slice(0, 2).join(', ')} and ${plural(names.length - 2, 'more', 'more')}`
      : names.join(' and ')
    : `All caught up · ${plural(reviewed, 'thing')} reviewed`
  return (
    <Link className={`list-row${pending.length ? ' list-row-nudge' : ''}`} to={tripPath(t.trip.id, 'reviews')}>
      <span className="list-emoji" aria-hidden>
        ⭐
      </span>
      <span className="list-text">
        <strong>{pending.length ? `${pending.length} to review` : 'Reviews'}</strong>
        <span className="muted small">{detail}</span>
      </span>
      <span className="muted" aria-hidden>
        ›
      </span>
    </Link>
  )
}
