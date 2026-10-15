# Delete a trip for everyone, and clean up abandoned trips

Status: draft
Issue: https://github.com/waypoints-pwa/waypoints/issues/24
Builds after: trip-budget (both may add `patchTrip` to `src/db/actions.ts`)

## Problem
Removing a trip only removes it from one phone; the others keep it, and on a sync server it stays
forever, with its photos, even when nobody is on it any more.

## Behavior
**A. Delete for everyone.** On the Trip tab, **Delete for everyone** (next to the existing "remove
from this phone"). It explains: the trip disappears for all travellers once they sync or open a
link; photos and documents on the server are deleted; the trip can't be restored. Confirmation: type
the trip's name. A safety snapshot is taken first (`takeSnapshot`, as `removeTripFromPhone` does).
- It marks the trip record deleted (`deletedAt`), a tombstone that travels in links, files and
  server syncs like any record.
- A phone that receives the tombstone hides the trip (the trips list, `loadTrip` already returns
  null for a deleted trip) and offers nothing to restore it. Its data stays in the database until the
  person removes it (no automatic hard delete: `CLAUDE.md`).
- On a trip on the server, the server deletes all of the trip's files when it receives the tombstone.
- An older app version that doesn't know the tombstone still shows the trip from its own copy:
  there the person can use "remove from this phone".

**B. Server clean-up** (opt-in). Server env `PURGE_AFTER_DAYS` (default unset = never purge):
- A trip with a tombstoned trip record whose latest record change is older than `PURGE_AFTER_DAYS`,
  and
- a trip with no members linked to its live travellers (`tripMembers` empty) whose latest record
  change is older than `PURGE_AFTER_DAYS`,
is removed from the store along with its files, once per day and at start-up, logged one line per
trip (`purged trip <id>`; no names).
- Minimum value 30; a smaller number is refused at start-up with a clear message.

Example: Ana deletes "Japan 2027" for everyone. Bo's phone hides it at the next sync. The server
removes the photos at once; the records go 90 days later if `PURGE_AFTER_DAYS=90`.

## Out of scope
- Restoring a deleted trip, an admin UI for trips, per-trip storage limits.
- Deleting on phones that never sync (they keep their copy until they get the tombstone).
- Purging while any member is still linked to the trip (only B's two cases).

## Constraints
- `CLAUDE.md`: never hard-delete a shared record on a phone; the server may purge only under B.
- Server API/protocol stays backward compatible (`src/domain/serverProtocol.ts`): no new endpoint is
  needed (the tombstone is an ordinary record).
- A phone that was offline longer than the purge delay and still has the live trip will re-upload it
  (`resend`); document this in the README and accept it.

## Context for implementers
- Read `CLAUDE.md`, `server/src/sync.ts` (`merge`, `applySync`, `tripMembers`), `server/src/app.ts`
  (file removal near line 232 and 259), `server/src/store.ts`, `server/src/config.ts`,
  `server/src/main.ts`.
- Trip writes: add `patchTrip` to `src/db/actions.ts` if `trip-budget` hasn't added it yet (same
  shape: changes, skips no-ops, `markChanged('trips', …)`).
- Trip tab: `src/ui/pages/TripInfoPage.tsx` (existing remove button around line 32).
- Trips list: `src/ui/pages/TripsPage.tsx` must filter tombstoned trips (check `db.trips` queries;
  `backupIO.ts` and `snapshots.ts` already filter).
- Server file removal: `files.remove(tripId, id)` in `server/src/files.ts`; add a
  `files.removeTrip(tripId)` if absent.
- Do not touch: protocol shapes, Dexie versions, link format.
- Decided already: tombstone on the trip record; hide on phones, no hard delete there; purge opt-in.

## Tasks
1. **Delete action**
   - Change: `deleteTripForEveryone(trip)` in `src/db/actions.ts` (snapshot, then tombstone and
     `markChanged`); UI with typed-name confirmation on `TripInfoPage.tsx`.
   - Depends on: none
   - Done when: `actions.test.ts`: tombstone set, unsent/outbox noted, snapshot taken, records of the
     trip untouched; manual check passes.
   - Executor: sonnet
2. **Hide deleted trips**
   - Change: every list/query of trips filters `deletedAt`; opening a deleted trip's URL shows
     "This trip was deleted".
   - Depends on: 1
   - Done when: tests for `TripsPage`/`loadTrip`; a merged tombstone from a link hides the trip.
   - Executor: sonnet
3. **Server deletes files on tombstone**
   - Change: in `server/src/sync.ts` `merge`, a trip record that becomes deleted queues all the
     trip's attachment files for removal (reuse `removedFiles`).
   - Depends on: none
   - Done when: `server/src/sync.test.ts` covers it, including a sync that sends the tombstone twice.
   - Executor: sonnet
4. **Purge job**
   - Change: `purgeStaleTrips(data, now, days)` pure function in `server/src/sync.ts` (or a new
     `purge.ts`), called from `main.ts` at start and daily; env parsing in `config.ts`; deletes
     records and files, saves the store.
   - Depends on: 3
   - Done when: tests: tombstoned and old purged; tombstoned and recent kept; linked members keep
     it; unset env purges nothing; value under 30 refused; one log line per trip.
   - Executor: sonnet
5. **Docs, version and changelog**
   - Change: README section for `PURGE_AFTER_DAYS` and the re-upload caveat; bump
     `package.json` version and (server) version; `CHANGELOG.md`.
   - Depends on: 2, 4
   - Done when: `npm test` and `npm run build` pass.
   - Executor: sonnet

## Acceptance criteria
- [ ] Typing the wrong name does not delete; the right name does and hides the trip locally.
- [ ] After syncing (server or link), other phones no longer list the trip.
- [ ] The server's photo/document files for the trip are gone right after the tombstone arrives.
- [ ] With `PURGE_AFTER_DAYS=30`, a 31-day-old deleted trip is purged; a 29-day-old one is not.
- [ ] A trip with a linked member is never purged by the "abandoned" rule.
- [ ] With the variable unset, nothing is ever purged.
- [ ] A snapshot exists before deletion.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass (root and `server/`).
- Manual: run the server locally with a short custom clock in the purge test (not by waiting);
  delete a trip from phone A, sync phone B, confirm it disappears.

## Escalate when
- The purge could touch a trip a member is still linked to.
- The change seems to need a protocol, store-format or Dexie change.
- A test needs a real clock or a real wait.

## Open questions
- None.

## Notes
- Hiding rather than hard-deleting on phones follows the "never lose them" rule: a mistaken delete
  can be undone from the safety snapshot.
- Minimum 30 days gives phones time to receive the tombstone before the server forgets it.
