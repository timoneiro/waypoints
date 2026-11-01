import { useState } from 'react'
import { saveVote } from '../../db/actions'
import type { Place } from '../../db/types'
import { useTrip } from '../tripData'
import { WhoAreYou } from './Reviews'

const VOTES_HINT = 'So your votes are yours. Only on this phone: you can change it in the Trip tab.'

/**
 * The "I want to go" toggle of a place, as a button on its list row or a chip on its page. A phone that
 * hasn't said whose it is asks first, right under the toggle, then votes. Nothing on a trip with one traveller.
 */
export function WantToGo({ place, variant }: { place: Place; variant: 'row' | 'chip' }) {
  const t = useTrip()
  const [asking, setAsking] = useState(false)
  if (t.travellers.length < 2) return null

  const mine = t.me ? t.votes.some((v) => v.placeId === place.id && v.by === t.me!.id) : false
  // A failed save shows nothing, like the ✓ and ⭐ toggles.
  const vote = (by: string, want: boolean) => void saveVote(t.trip.id, place.id, by, want).catch(() => {})
  const toggle = () => {
    if (!t.me) return setAsking((a) => !a)
    vote(t.me.id, !mine)
  }

  return (
    <>
      {variant === 'row' ? (
        <button type="button" className="icon-btn vote-btn" aria-pressed={mine} aria-label={`I want to go to ${place.name}`} onClick={toggle}>
          <span aria-hidden>🙋</span>
        </button>
      ) : (
        <button type="button" className="toggle-chip" aria-pressed={mine} onClick={toggle}>
          🙋 I want to go
        </button>
      )}
      {asking && !t.me && (
        <div className="vote-ask">
          <WhoAreYou
            hint={VOTES_HINT}
            onPick={(id) => {
              setAsking(false)
              vote(id, true)
            }}
          />
        </div>
      )}
    </>
  )
}
