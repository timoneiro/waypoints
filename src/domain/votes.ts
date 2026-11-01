import type { Place, Traveller, Vote } from '../db/types.ts'
import { derivedId } from './ids.ts'

/*
 * Votes on places: each traveller can say "I want to go" once per place. Turning it off is a
 * tombstone. Only current travellers count: a removed traveller's votes stay in the data.
 */

/**
 * The id of `by`'s vote on a place: the same on every phone, so voting on a second phone
 * replaces the vote instead of adding another. It must never change.
 */
export const voteId = (tripId: string, placeId: string, by: string): Promise<string> => derivedId('vote', tripId, placeId, by)

/** The votes that count: not turned off, and by someone still on the trip. */
export function currentVotes(votes: Vote[], travellers: Pick<Traveller, 'id'>[]): Vote[] {
  const ids = new Set(travellers.map((t) => t.id))
  return votes.filter((v) => !v.deletedAt && ids.has(v.by))
}

/** The votes on one place. */
export const votesOf = (votes: Vote[], placeId: string): Vote[] => votes.filter((v) => v.placeId === placeId)

/** Unvisited places before visited, then most votes first; otherwise the given order is kept. */
export function rankByVotes(places: Place[], votes: Vote[]): Place[] {
  const counts = new Map<string, number>()
  for (const v of votes) counts.set(v.placeId, (counts.get(v.placeId) ?? 0) + 1)
  const count = (p: Place) => counts.get(p.id) ?? 0
  return places
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(!!a.p.visited) - Number(!!b.p.visited) || count(b.p) - count(a.p) || a.i - b.i)
    .map((x) => x.p)
}

/** "1 wants to go", "3 want to go". */
export const wantLabel = (count: number): string => (count === 1 ? '1 wants to go' : `${count} want to go`)
