import { describe, expect, it } from 'vitest'
import { ANA, BO, place, T1 } from '../test/fixtures'
import type { Vote } from '../db/types'
import { currentVotes, rankByVotes, voteId, votesOf, wantLabel } from './votes'

const TRIP = 'trip0001'
const vote = (placeId: string, by: string, over: Partial<Vote> = {}): Vote => ({
  id: `${placeId}-${by}`,
  tripId: TRIP,
  placeId,
  by,
  createdAt: T1,
  updatedAt: T1,
  ...over,
})

describe('vote ids', () => {
  it('are the same for the same traveller and place, and differ otherwise', async () => {
    expect(await voteId(TRIP, 'p1', ANA)).toBe(await voteId(TRIP, 'p1', ANA))
    expect(await voteId(TRIP, 'p1', ANA)).not.toBe(await voteId(TRIP, 'p1', BO))
    expect(await voteId(TRIP, 'p1', ANA)).not.toBe(await voteId(TRIP, 'p2', ANA))
  })
})

describe('current votes', () => {
  it('leave out turned-off votes and those of travellers no longer on the trip', () => {
    const votes = [vote('p1', ANA), vote('p1', BO, { deletedAt: T1 }), vote('p1', 'gone0001')]
    expect(currentVotes(votes, [{ id: ANA }, { id: BO }])).toEqual([votes[0]])
  })

  it('are found by place', () => {
    const votes = [vote('p1', ANA), vote('p2', ANA), vote('p1', BO)]
    expect(votesOf(votes, 'p1')).toHaveLength(2)
    expect(votesOf(votes, 'none')).toEqual([])
  })
})

describe('ranking by votes', () => {
  const a = place({ id: 'a', name: 'A' })
  const b = place({ id: 'b', name: 'B' })
  const c = place({ id: 'c', name: 'C' })

  it('puts the most wanted first, ties keeping their order, without changing the list', () => {
    const list = [a, b, c]
    const ranked = rankByVotes(list, [vote('c', ANA), vote('c', BO), vote('b', ANA)])
    expect(ranked.map((p) => p.id)).toEqual(['c', 'b', 'a'])
    expect(rankByVotes(list, [vote('a', ANA), vote('b', ANA)]).map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(list.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('puts visited places last, however wanted', () => {
    const seen = place({ id: 'v', name: 'V', visited: true })
    expect(rankByVotes([seen, a], [vote('v', ANA), vote('v', BO)]).map((p) => p.id)).toEqual(['a', 'v'])
  })

  it('ignores votes on places not in the list', () => {
    expect(rankByVotes([a, b], [vote('zzz', ANA), vote('zzz', BO)]).map((p) => p.id)).toEqual(['a', 'b'])
  })
})

describe('wantLabel', () => {
  it('reads right for one and for more', () => {
    expect(wantLabel(1)).toBe('1 wants to go')
    expect(wantLabel(3)).toBe('3 want to go')
  })
})
