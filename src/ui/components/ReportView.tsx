import type { StoredFile } from '../../db/types'
import { bestAndWorst, type ReportItem, type TripReport } from '../../domain/report'
import { useObjectUrl } from '../attachments'
import { fmtDay, fmtDayRange, fmtDuration, fmtLongDay, fmtMoney, fmtMoneyShort, plural } from '../format'
import { EXPENSE_CATEGORIES, labelOf, PLACE_CATEGORIES, STAY_KINDS, TRANSPORT_MODES } from '../labels'
import { Stars } from './Reviews'

/*
 * A trip report as it shows, prints and goes into a file. The shareable version is for anyone: no
 * names, notes or photos, and what it cost only when asked for. It leaves them out of the page
 * altogether (not just hidden), as the file is made from what's on the page. For the same reason the
 * full one says everyone's name, never "you": it's printed and sent as it is.
 */

interface Props {
  report: TripReport
  shareable: boolean
  /** In the shareable version: include what it cost. */
  costs: boolean
  /** This phone's photo files, by attachment id. */
  files?: Map<string, StoredFile>
}

export function ReportView({ report, shareable, costs, files }: Props) {
  const { trip, money, journeys } = report
  const showMoney = !shareable || costs
  const nights = report.stays.reduce((sum, s) => sum + s.nights, 0)
  const reviews = report.reviewed.reduce((sum, i) => sum + i.reviews.filter((r) => r.stars !== undefined).length, 0)
  const photos = shareable ? [] : report.photos.highlights.filter((id) => files?.get(id)?.thumb ?? files?.get(id)?.blob)
  const priciest = money.byDay.reduce<(typeof money.byDay)[number] | undefined>((top, d) => (!top || d.amount > top.amount ? d : top), undefined)
  const longest = journeys.longest

  return (
    <>
      <header className="report-head">
        <p className="report-emoji" aria-hidden>
          {trip.emoji ?? '🧳'}
        </p>
        <h2>{trip.name}</h2>
        <p className="muted">
          {fmtDayRange(trip.startDate, trip.endDate)} · {plural(report.days, 'day')}
        </p>
        {report.cities.length > 0 && <p className="report-route">{report.cities.join(' → ')}</p>}
        <p className="muted small">{shareable ? plural(report.travellers.length, 'traveller') : report.travellers.join(', ')}</p>
      </header>

      <section className="card">
        <h3>The trip in numbers</h3>
        <dl className="tiles">
          <Tile label="Days" value={report.days} />
          {report.cities.length > 0 && <Tile label={report.cities.length === 1 ? 'City' : 'Cities'} value={report.cities.length} />}
          {nights > 0 && <Tile label={nights === 1 ? 'Night away' : 'Nights away'} value={nights} />}
          {report.activities > 0 && <Tile label={report.activities === 1 ? 'Activity' : 'Activities'} value={report.activities} />}
          {report.placesVisited > 0 && <Tile label="Places visited" value={report.placesVisited} />}
          {journeys.count > 0 && <Tile label={journeys.count === 1 ? 'Journey' : 'Journeys'} value={journeys.count} />}
          {journeys.minutes > 0 && <Tile label="Travelling" value={fmtDuration(journeys.minutes * 60_000)} />}
          {reviews > 0 && <Tile label={reviews === 1 ? 'Review' : 'Reviews'} value={reviews} />}
          {!shareable && report.photos.count > 0 && <Tile label={report.photos.count === 1 ? 'Photo' : 'Photos'} value={report.photos.count} />}
          {showMoney && money.total > 0 && <Tile label="Spent" value={fmtMoneyShort(money.total, trip.currency)} />}
        </dl>
        <ul className="report-facts">
          {report.busiestDay && (
            <Fact emoji="📅">
              Busiest day: {fmtDay(report.busiestDay.day)}, with {report.busiestDay.count} things on
            </Fact>
          )}
          {longest && (
            <Fact emoji={labelOf(TRANSPORT_MODES, longest.mode).emoji}>
              Longest journey: {longest.from} → {longest.to}, {fmtDuration(longest.minutes * 60_000)}
            </Fact>
          )}
          {showMoney && priciest && money.byDay.length > 1 && (
            <Fact emoji="💸">
              Priciest day: {fmtDay(priciest.day)}, {fmtMoney(priciest.amount, trip.currency)}
            </Fact>
          )}
          {showMoney && money.biggestMeal && (
            <Fact emoji="🍽️">
              Most expensive meal: {money.biggestMeal.title}, {fmtMoney(money.biggestMeal.amount, trip.currency)}
            </Fact>
          )}
          {showMoney && money.biggest && money.biggest.category !== 'food' && (
            <Fact emoji={labelOf(EXPENSE_CATEGORIES, money.biggest.category).emoji}>
              Biggest expense: {money.biggest.title}, {fmtMoney(money.biggest.amount, trip.currency)}
            </Fact>
          )}
        </ul>
      </section>

      {showMoney && <MoneySection report={report} shareable={shareable} />}
      <ReviewsSection report={report} shareable={shareable} />
      <StaysSection report={report} />
      {report.ideas.length > 0 && (
        <section className="card">
          <h3>Ideas for next time</h3>
          <p className="muted small">Saved, but never visited.</p>
          <ul className="report-list">
            {report.ideas.map((idea) => (
              <li key={idea.id}>
                <span className="list-emoji" aria-hidden>
                  {labelOf(PLACE_CATEGORIES, idea.category).emoji}
                </span>
                <span className="list-text">
                  <strong>{idea.name}</strong>
                  {idea.city && <span className="muted small">{idea.city}</span>}
                </span>
                {idea.mustSee && <span className="chip chip-must">must-see</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {photos.length > 0 && (
        <section className="card">
          <h3>Photos</h3>
          <div className="photo-grid">
            {photos.map((id) => (
              <ReportPhoto key={id} id={id} file={files!.get(id)!} />
            ))}
          </div>
        </section>
      )}
      <p className="report-foot muted small">📍 Made with waypoints · {fmtLongDay(report.madeAt.slice(0, 10))}</p>
    </>
  )
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="tile-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Fact({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <li className="status-line">
      <span aria-hidden>{emoji}</span>
      <span>{children}</span>
    </li>
  )
}

function MoneySection({ report, shareable }: { report: TripReport; shareable: boolean }) {
  const { money } = report
  const cur = report.trip.currency
  const people = Math.max(1, report.travellers.length)
  return (
    <section className="card">
      <h3>Money</h3>
      <div>
        <p className="big-number">{fmtMoney(money.total, cur)}</p>
        {money.total > 0 && (
          <p className="muted small">
            {fmtMoney(money.total / people / Math.max(1, report.days), cur)} a day{people > 1 && ' per person'}
          </p>
        )}
      </div>
      {money.byCategory.length > 0 && (
        <div className="bars">
          {money.byCategory.map(({ category, amount }) => {
            const label = labelOf(EXPENSE_CATEGORIES, category)
            return (
              <div key={category}>
                <div className="bar-label">
                  <span>
                    {label.emoji} {label.label}
                  </span>
                  <span className="money">{fmtMoney(amount, cur)}</span>
                </div>
                <div className="bar-track" aria-hidden>
                  <div className="bar-fill" style={{ width: `${money.total ? (amount / money.total) * 100 : 0}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      {money.byDay.length > 1 && <DayChart days={money.byDay} currency={cur} />}

      {!shareable && money.people.length > 1 && (
        <>
          <h4>Who paid what</h4>
          <ul className="history">
            {money.people.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <span className="money small">
                  paid {fmtMoney(p.paid, cur)} · their part {fmtMoney(p.share, cur)}
                </span>
              </li>
            ))}
          </ul>
          <h4>Settling up</h4>
          {money.toSettle.length ? (
            <ul className="history">
              {money.toSettle.map((p) => (
                <li key={`${p.from}-${p.to}`}>
                  <span>
                    <strong>{p.from}</strong> pays <strong>{p.to}</strong>
                  </span>
                  <span className="money">{fmtMoney(p.amount, cur)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small">Everyone is square. 🎉</p>
          )}
        </>
      )}
      {(money.uncounted > 0 || money.estimated > 0) && (
        <p className="muted small">
          {money.uncounted > 0 && `${plural(money.uncounted, 'expense')} in a currency without a rate yet ${money.uncounted === 1 ? "isn't" : "aren't"} counted. `}
          {money.estimated > 0 && `${plural(money.estimated, 'card payment')} ${money.estimated === 1 ? 'counts' : 'count'} at an estimate, until what the bank charged is added.`}
        </p>
      )}
    </section>
  )
}

/** Spending by day: one column a day, the priciest labelled; the list below has every day's amount. */
function DayChart({ days, currency }: { days: { day: string; amount: number }[]; currency: string }) {
  const max = Math.max(...days.map((d) => d.amount))
  const top = days.find((d) => d.amount === max)
  const labelEvery = days.length <= 10 ? 1 : Math.ceil(days.length / 7)
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h4>By day</h4>
      <div className="day-chart" aria-hidden>
        {days.map((d) => (
          <div key={d.day} className="day-col" title={`${fmtDay(d.day)}: ${fmtMoney(d.amount, currency)}`}>
            {d === top && <span className="day-cap">{fmtMoney(d.amount, currency)}</span>}
            <div className="day-bar" style={{ height: `${max ? Math.max(2, (d.amount / max) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="day-axis" aria-hidden>
        {days.map((d, i) => (
          <span key={d.day}>{i % labelEvery === 0 ? Number(d.day.slice(8)) : ''}</span>
        ))}
      </div>
      <details>
        <summary className="small muted">Every day's spending</summary>
        <ul className="history">
          {days.map((d) => (
            <li key={d.day}>
              <span className="small">{fmtDay(d.day)}</span>
              <span className="money small">{fmtMoney(d.amount, currency)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function ReviewsSection({ report, shareable }: { report: TripReport; shareable: boolean }) {
  const { best, worst, rest } = bestAndWorst(report.reviewed)
  return (
    <section className="card">
      <h3>Reviews</h3>
      {report.reviewed.length === 0 && <p className="muted small">Nobody reviewed anything.</p>}
      {best.length > 0 && (
        <>
          <h4>⭐ Best of the trip</h4>
          <ReviewedList items={best} shareable={shareable} />
        </>
      )}
      {worst.length > 0 && (
        <>
          <h4>👎 Not worth it</h4>
          <ReviewedList items={worst} shareable={shareable} />
        </>
      )}
      {rest.length > 0 &&
        (best.length || worst.length ? (
          <details>
            <summary>Everything else ({rest.length})</summary>
            <ReviewedList items={rest} shareable={shareable} />
          </details>
        ) : (
          <ReviewedList items={rest} shareable={shareable} />
        ))}
    </section>
  )
}

const itemEmoji = (item: ReportItem) =>
  item.table === 'places'
    ? labelOf(PLACE_CATEGORIES, item.kind).emoji
    : item.table === 'stays'
      ? labelOf(STAY_KINDS, item.kind).emoji
      : item.table === 'transports'
        ? labelOf(TRANSPORT_MODES, item.kind).emoji
        : '🎟️'

function Average({ value }: { value?: number }) {
  if (value === undefined) return null
  const rounded = Math.round(value * 10) / 10
  return (
    <span className="stars" aria-label={`Average ${rounded} of 5 stars`}>
      ★ <span className="stars-number">{rounded}</span>
    </span>
  )
}

function ReviewedList({ items, shareable }: { items: ReportItem[]; shareable: boolean }) {
  return (
    <ul className="report-list report-reviews">
      {items.map((item) => {
        const rated = item.reviews.filter((r) => r.stars !== undefined).length
        const missed = item.reviews.filter((r) => r.missed).length
        return (
          <li key={`${item.table}/${item.id}`}>
            <div className="row nowrap spread">
              <span className="row nowrap">
                <span className="list-emoji" aria-hidden>
                  {itemEmoji(item)}
                </span>
                <span className="list-text">
                  <strong>{item.title}</strong>
                  {(item.day || item.city) && <span className="muted small">{[item.day && fmtDay(item.day), item.city].filter(Boolean).join(' · ')}</span>}
                </span>
              </span>
              <Average value={item.average} />
            </div>
            {shareable ? (
              <p className="muted small">{[rated > 0 && plural(rated, 'review'), missed > 0 && `${missed} didn't go`].filter(Boolean).join(' · ')}</p>
            ) : (
              <ul className="review-list">
                {item.reviews.map((r) => (
                  <li key={r.by}>
                    <span className="row">
                      <strong>{r.name}</strong>
                      {r.missed ? <span className="muted small">didn't go</span> : r.stars !== undefined && <Stars value={r.stars} />}
                    </span>
                    {r.note && <span className="prewrap small">{r.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function StaysSection({ report }: { report: TripReport }) {
  const { stays, journeys } = report
  if (!stays.length && !journeys.count) return null
  return (
    <section className="card">
      <h3>Stays & journeys</h3>
      {stays.length > 0 && (
        <ul className="report-list">
          {stays.map((s) => (
            <li key={s.id}>
              <span className="list-emoji" aria-hidden>
                {labelOf(STAY_KINDS, s.kind).emoji}
              </span>
              <span className="list-text">
                <strong>{s.name}</strong>
                <span className="muted small">{[s.city, plural(s.nights, 'night')].filter(Boolean).join(' · ')}</span>
              </span>
              <Average value={s.average} />
            </li>
          ))}
        </ul>
      )}
      {journeys.count > 0 && (
        <>
          <p>
            {plural(journeys.count, 'journey')}
            {journeys.minutes > 0 && `, ${fmtDuration(journeys.minutes * 60_000)} travelling`}
            {journeys.untimed > 0 && journeys.minutes > 0 && <span className="muted small"> (and {journeys.untimed} without times)</span>}
          </p>
          <div className="chips">
            {journeys.byMode.map(({ mode, count }) => {
              const label = labelOf(TRANSPORT_MODES, mode)
              return (
                <span key={mode} className="chip">
                  {label.emoji} {label.label}
                  {count > 1 && ` × ${count}`}
                </span>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

function ReportPhoto({ id, file }: { id: string; file: StoredFile }) {
  const preview = file.thumb ?? file.blob
  const url = useObjectUrl(preview, `${id}:${file.thumb ? 'thumb' : 'full'}`)
  return <div className="tile">{url && <img src={url} alt="" data-photo={id} />}</div>
}
