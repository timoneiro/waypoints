# Plan editing: move activities, duplicate a trip

Status: draft
Issue: none

## Problem
Changing an activity's day means opening its form and editing the date; ordering untimed activities
within a day isn't possible; and repeating a trip means re-entering every place and stay.

## Behavior
**A. Move to another day.** Each activity on its detail page and in the day list gets a **Move**
action. It opens a day picker (the trip's days, plus the current one marked) and moves the activity
in one tap: `date` changes, `timeZone` becomes `zoneOnDay(newDay, stays, transports)` when that is
defined, otherwise it stays. Times are kept. Undo toast: "Moved to Tue 5 Apr · Undo" for 6 seconds.

**B. Order untimed activities.** On one day, activities without a start time show ▲ ▼ buttons that
swap them with the neighbouring untimed activity. Timed activities keep time order and show no
buttons. Order is saved in a new optional `order` number on the activity; untimed ones sort by
`order`, then `createdAt`, then `id`.

**C. Duplicate a trip.** On the Trip tab, **Duplicate trip** asks for a new name (default "<name>
(copy)") and a new start date; the end date keeps the same length. It creates a new, separate trip
with new ids containing:
- travellers copied by name (the person using this phone becomes "me");
- places (not marked visited, no mustSee change);
- stays and activities, every date shifted by the same offset (new start − old start), with
  `placeId` re-pointed to the copied places;
- stays and activities do not keep their `confirmation` (a booking ref belongs to the old trip);
  everything else, `link` included, is kept.
Not copied: transport, expenses, exchanges, reviews, attachments, report, budget, notes.
Empty source trip: allowed, just creates the trip.

Example: Trip 10–17 Apr, duplicate to start 3 Jul: a stay 12–15 Apr becomes 5–8 Jul.

## Out of scope
- Drag and drop. Moving stays or transport between days (they have fixed dates).
- Copying travellers' server links (`memberId`): the copy is a new local trip.
- Duplicating onto the sync server (the copy starts local; moving it is the existing flow).

## Constraints
- `order` is an optional field on `Activity`: older apps keep unknown fields; no Dexie version, no
  `LINK_VERSION` change, no new table.
- Duplicate is new records with new ids; it never edits the source trip. Dates use `src/domain/time.ts`
  helpers, never the phone's zone.

## Context for implementers
- Read `CLAUDE.md` first. Writes through `patchRecord`/`saveRecord`/`createTrip` in
  `src/db/actions.ts`; undo is a second `patchRecord` restoring the old values.
- Sorting lives in `planEntries` (`src/domain/itinerary.ts`): extend the tie-break only.
- `zoneOnDay` is in `src/domain/itinerary.ts`. Day-list rows: `EntryRow` in
  `src/ui/pages/PlanPage.tsx`; activity page: `src/ui/items/activities.tsx`.
- Trip tab: `src/ui/pages/TripInfoPage.tsx`. Validation: `activities` entry in `SPECS`,
  `src/domain/records.ts` (add `order` as optional number, integer, |value| ≤ 1e6).
- Date shifting: use `daysBetween` and a day-add helper in `src/domain/time.ts` (add one if absent,
  with tests).
- Do not touch: Dexie versions, link encoding, server.
- Decided already: day picker not drag; untimed only; confirmations dropped on duplicate.

## Tasks
1. **Order field and sorting**
   - Change: `order?: number` on `Activity` (`src/db/types.ts`), validation in `records.ts`, tie-break
     in `planEntries`.
   - Depends on: none
   - Done when: new `itinerary.test.ts` cases (untimed sorted by order then createdAt; timed ignore
     order) and a `records` test pass.
2. **Move and reorder actions**
   - Change: `moveActivity(id, day)` and `swapActivityOrder(idA, idB)` helpers in
     `src/db/actions.ts`; each a single transaction, skipping a no-op.
   - Depends on: 1
   - Done when: `actions.test.ts` covers moving, zone choice, swap, and no-op.
3. **Move and reorder UI**
   - Change: Move picker with undo toast; ▲▼ on untimed activities in `EntryRow`.
   - Depends on: 2
   - Done when: manual check passes.
4. **Shift helper**
   - Change: `shiftDay(day, offsetDays)` (and `offsetBetween`) in `src/domain/time.ts`.
   - Depends on: none
   - Done when: `time.test.ts` covers month/year ends and leap day.
5. **duplicateTrip**
   - Change: `duplicateTrip(tripId, {name, startDate}): Promise<string>` in `src/db/actions.ts`,
     one transaction, marking every new record changed.
   - Depends on: 4
   - Done when: `actions.test.ts`: counts per table, shifted dates, `placeId` remapped, source
     untouched, excluded tables empty, confirmations dropped.
6. **Duplicate UI**
   - Change: button and small form (name, start date) on the Trip tab; navigate to the new trip.
   - Depends on: 5
   - Done when: manual check passes; `npm run lint` clean.
7. **Version and changelog**
   - Change: bump `package.json` version and add the `CHANGELOG.md` entry.
   - Depends on: 3, 6
   - Done when: `npm test` and `npm run build` pass.

## Acceptance criteria
- [ ] Moving an activity changes only its day (and zone when the new day's zone differs) and appears
      on the new day; Undo restores it.
- [ ] ▲▼ reorder untimed activities and the order survives reload and a link merge.
- [ ] Timed activities show no ▲▼ and stay in time order.
- [ ] Duplicate creates a separate trip with shifted places, stays and activities and none of the
      excluded data; the source trip is unchanged.
- [ ] Activities in the copy keep their link to the copied place, not the source's.
- [ ] A 0.9.0 phone opening a link with `order` keeps working.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- Manual: trip with three untimed and one timed activity on a day: reorder, move one to another
  day, undo; duplicate to a new start date and compare dates.

## Escalate when
- Anything needs a new table, Dexie version or link change.
- Zone selection for a moved activity behaves unexpectedly across a DST or zone boundary.
- Duplicate would need to copy transport or money to make sense.

## Open questions
- None.

## Notes
- Transport is not copied because it carries booking refs and real-world times; the user chose
  places, activities and stays.
- Whether the copy should keep `mustSee` is decided: keep it, reset only `visited`.
