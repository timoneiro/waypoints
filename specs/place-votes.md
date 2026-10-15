# Votes on places

Status: draft
Issue: https://github.com/waypoints-pwa/waypoints/issues/20

## Problem
A group collects places but has no light way to see which ones people actually want to see, so the
plan is decided in chat.

## Behavior
- Every place has an **I want to go** toggle, on the places list row and on the place page.
- A place shows "3 want to go" (names on the place page: "Ana, Bo, Cy"). Zero shows nothing.
- Each traveller has one vote per place. Toggling off removes it.
- The Places list can be sorted **Most wanted first** (new option next to the existing filters);
  ties keep the current order.
- If the app doesn't know which traveller this phone is (`t.me` undefined), the toggle asks "Which
  one are you?" the same way reviews do, then votes.
- Voting works offline and merges: two people voting on the same place add up; the same person on
  two phones has one vote.

## Out of scope
- Down-votes, maybe/skip levels, comments, vote totals in the trip report.
- Voting on anything but places.

## Constraints
- A new synced table `votes`: follow `specs/new-table-checklist.md` exactly.
- The id is derived (`derivedId('vote', tripId, placeId, by)`), so the same person on two phones
  ends up with one record. That recipe must never change afterwards (`CLAUDE.md`).

## Context for implementers
- Copy the `reviews` implementation: `src/db/types.ts`, `src/domain/reviews.ts` (`reviewId`),
  `saveReview` in `src/db/actions.ts` (tombstone when emptied), `src/ui/components/Reviews.tsx`
  (asks who you are).
- Places UI: `src/ui/items/places.tsx` (list and page).
- Do not touch: Dexie versions 1–5, `LINK_VERSION`, reviews code.
- Decided already: one "I want to go" toggle per person and place; toggling off = tombstone.

## Tasks
1. **Table and validation**
   - Change: `Vote` (`placeId: string`, `by: string`) in `types.ts`, `LINK_TABLES`/`TableRecords`/
     `emptyTables`; `SPECS` entry (`placeId`, `by` both `isId` and required).
   - Depends on: none
   - Done when: `npm run typecheck` passes; records test accepts a vote and rejects missing `by`.
   - Executor: sonnet
2. **Dexie version and server**
   - Change: per the checklist (`db.ts`, `migrations.test.ts`, server `RECORD_TABLES`).
   - Depends on: 1
   - Done when: `npm test` passes incl. migration from a 0.9.0-shaped database.
   - Executor: sonnet
3. **Domain**
   - Change: `src/domain/votes.ts`: `voteId`, `votesOf(votes, placeId)`, `rankByVotes(places,
     votes)`; `saveVote(tripId, placeId, by, want)` in `actions.ts` (tombstone when off, revive when
     on).
   - Depends on: 1
   - Done when: `votes.test.ts` and `actions.test.ts` cover toggle on/off/on, two travellers,
     same traveller on two phones (same id), deleted place's votes ignored.
   - Executor: sonnet
4. **Load into the trip**
   - Change: `TripData.votes` in `src/ui/tripData.ts`.
   - Depends on: 2
   - Done when: `npm run typecheck` passes.
   - Executor: haiku
5. **UI**
   - Change: toggle and count on list and page; sort option; "who are you" path.
   - Depends on: 3, 4
   - Done when: manual check passes; `npm run lint` clean.
   - Executor: sonnet
6. **Sync tests, version, changelog**
   - Change: sync tests (client and server), version bump, `CHANGELOG.md`.
   - Depends on: 5
   - Done when: `npm test` and `npm run build` pass.
   - Executor: sonnet

## Acceptance criteria
- [ ] Toggling "I want to go" on and off changes the count and persists after reload.
- [ ] Two travellers voting on one place show 2, and names on the place page.
- [ ] The same traveller on two phones ends with one vote after a merge.
- [ ] A vote removed on one phone stays removed after merging with an older copy.
- [ ] Sort by most wanted orders places by vote count.
- [ ] A 0.9.0 database opens; a link from this version opens in 0.9.0.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- Manual: two travellers, vote from both, share link into a second profile, toggle there, import
  back.

## Escalate when
- Anything would change a released Dexie version, link version or the id recipe once set.
- Two attempts at a failing merge test don't fix it.

## Open questions
- None.

## Notes
- Shares a Dexie version number with `packing-lists` if shipped together: one `db.version` may add
  both tables (decide at implementation; they must not conflict).
