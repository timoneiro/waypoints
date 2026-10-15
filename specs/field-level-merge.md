# Field-level merging

Status: draft
Issue: https://github.com/waypoints-pwa/waypoints/issues/22

## Problem
Merging is record by record: if Ana changes a stay's check-in time while Bo changes its notes, the
later save replaces the whole stay and one change is lost, silently.

## Behavior
When two copies of the same record differ, each **field** keeps its own newest value instead of the
whole record going to the newer copy.
- Ana (offline) sets a stay's `checkInTime` at 14:00; Bo (offline) adds notes to the same stay. After
  both share, the stay has Ana's time and Bo's notes on every phone.
- If both changed the same field, the later change to that field wins (as today for the whole record).
- A deletion still wins or loses as a whole record, by time, as today: a newer edit after a delete
  revives nothing and a delete after an edit removes the record.
- Users see no new screens. The "later edit wins" sentence on the Share page changes to say the
  later edit of the *same field* wins.
- Applies to the trip, stays, transports, activities, places and expenses. Not to travellers
  (they have their own link clock), reviews, exchanges, attachments, or reports.
- Phones on older versions keep working: they still merge by whole record; nothing breaks, they just
  don't get the finer merge.

## Out of scope
- Merging inside a text field (two edits to one notes field still pick one).
- Merging deletes, conflict UI, history of who changed what.
- Retrofitting field times onto records already stored (they merge as whole records until next edit).

## Constraints
- Highest-risk change to people's data: read `CLAUDE.md` first. A merge must be commutative,
  associative and idempotent, or phones in a group stop converging.
- Record shape: one new optional field `fieldsAt?: Record<string, ISODate>` (field name → time of its
  last change). Optional fields only; no Dexie version, no `LINK_VERSION`, no `BACKUP_VERSION` change.
- Old servers keep working: they ignore `fieldsAt` and merge whole records (see Notes).
- Links must not grow much: see the size criterion.

## Context for implementers
- Merge rule today: `planMerge` in `src/domain/sync.ts` (client) and `mergeRecord`/`merge` in
  `server/src/sync.ts` (server). Both must call one shared function in `src/domain/sync.ts` (the
  server already imports from there).
- Writes: `saveRecord`/`patchRecord` in `src/db/actions.ts` and the trip writes (`updateTrip`). Stamp
  only fields whose value changed against the existing record (`canonicalJSON` compare).
- Validation: add `fieldsAt` to each affected table in `SPECS` (`src/domain/records.ts`): object, at
  most 40 keys, `WORD` keys, `isTimestamp` values.
- Stamp rule for field f of record r (the *effective stamp*): `r.fieldsAt?.[f]` when present and
  `r.updatedAt <= max(fieldsAt values)`; otherwise (no `fieldsAt`, or the record was last saved by
  something that doesn't stamp) `r.updatedAt`.
- Merge of a and b (neither a tombstone): for each field in the union of keys (excluding `id`,
  `tripId`, `createdAt`, `updatedAt`, `fieldsAt`), take the value from the side with the larger
  effective stamp; ties go to the side with the larger `updatedAt`, then the smaller
  `canonicalJSON` of its value. Missing on the winner = field removed. Result `updatedAt` = max of
  the two; `fieldsAt` = per-field winning stamps (only for fields that appear in either `fieldsAt`).
- If either is a tombstone: the current whole-record rule.
- Tests: `src/domain/sync.test.ts`, `server/src/sync.test.ts`, `src/db/actions.test.ts`.
- Do not touch: Dexie versions, link/backup versions, traveller link merge (`withNewerLink`).

## Tasks
1. **Pure merge function**
   - Change: `mergeFields(a, b)` and `stampFields(existing, next, now)` in
     `src/domain/sync.ts` per the rules above.
   - Depends on: none
   - Done when: new unit tests pass, incl. a property test that, for 500 random pairs/triples of
     records, `merge(a,b) == merge(b,a)`, `merge(merge(a,b),c) == merge(a,merge(b,c))`, and
     `merge(a,a) == a`.
2. **Validation**
   - Change: `fieldsAt` in `SPECS` for the six tables.
   - Depends on: none
   - Done when: records tests accept valid, reject non-timestamp values and 41 keys.
3. **Stamp on write**
   - Change: `saveRecord`, `patchRecord`, `updateTrip` call `stampFields`.
   - Depends on: 1
   - Done when: `actions.test.ts`: changing one field stamps only it; an unchanged save writes
     nothing and stamps nothing.
4. **Use in client merge**
   - Change: `planMerge` uses `mergeFields` for the six tables; counts (`added/updated/removed`)
     stay meaningful (a record whose merge equals the local copy isn't "updated").
   - Depends on: 1, 2
   - Done when: `sync.test.ts` incl. the Ana/Bo example above passes and old whole-record cases still
     pass unchanged.
5. **Use in server merge**
   - Change: `mergeRecord` in `server/src/sync.ts` uses `mergeFields`; the returned winner/loser
     bookkeeping (`losers`) still lets phones converge.
   - Depends on: 4
   - Done when: `server/src/sync.test.ts` and `src/sync/sync.integration.test.ts` pass, with a new
     integration case: two phones edit different fields offline, sync via the server, both end equal.
6. **Link size and compatibility**
   - Change: test that a 60-record trip link grows by less than 10% compared with the same trip
     without `fieldsAt` where every record was edited once; a 0.9.0-shaped record with no
     `fieldsAt` merges as a whole record.
   - Depends on: 4
   - Done when: those tests pass; if the 10% limit fails, stop (Escalate).
7. **Wording, version, changelog**
   - Change: Share page sentence; version bump; `CHANGELOG.md` entry.
   - Depends on: 5, 6
   - Done when: `npm test` and `npm run build` pass.

## Acceptance criteria
- [ ] The Ana/Bo example ends with both changes on both phones, via link and via server.
- [ ] Same-field edits: the later change wins.
- [ ] Merge is order-independent and repeatable (property tests).
- [ ] A delete is never undone by an older edit, and a record edited after a delete is deleted as
      today.
- [ ] Records without `fieldsAt` merge exactly as before.
- [ ] Links grow by under 10% for a typical trip.
- [ ] A phone and a server on older versions still sync (no rejected records, no data loss).

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass; no existing test changed to
  make it pass (changed tests listed in the PR).
- Manual: two browser profiles, edit different fields of one stay offline, exchange links both ways.

## Escalate when
- Any merge property test fails, or an existing sync test must change.
- The size limit is exceeded, or the server needs a store format change (`migrate()`).
- Anything would need a Dexie version, link version or backup version.

## Open questions
- Approve the `fieldsAt` design in Notes before any executor starts (it is the only design with
  per-field times that fits the "optional fields only" rule).

## Notes
- Alternative considered: a three-way merge with a stored base copy. Rejected: needs a base per
  record on every phone, which doubles storage and links.
- With an older server, a phone's field-level merge result is not accepted by the server (its
  `updatedAt` equals the newer side's, so the server keeps its own copy); phones still converge on
  whole-record values through the server, and field-level merging works through links and with new
  servers. Updating the server restores full behaviour.
- `updatedAt` after a merge is the max of both, never "now", so merging never causes ping-pong.
