# Packing & to-do lists

Status: draft
Issue: none

## Problem
Groups plan what to bring and what to do before leaving in chat messages that get lost. The app has
no shared checklist, so nobody knows who is bringing the charger or the first-aid kit.

## Behavior
Each trip has one shared checklist of items, opened from a **Packing & to-do** card on the Trip tab.
- Add an item (text, required). Optionally set **Who's bringing it** to one traveller of the trip.
- Anyone ticks or unticks an item. There is one shared packed state per item.
- Items are shown unticked first, then ticked, each group in the order they were added. A header
  shows "2 of 9 packed".
- Add from a **template** (Beach, City, Hiking, Skiing): adds that template's items to the list,
  skipping any item whose text (case-insensitive) is already on the list. A template never removes or
  changes existing items.
- Edit text or assignee, and delete an item (a tombstone: it disappears for everyone).
- Empty state: "Nothing here yet" with the template buttons and an Add field.
- Offline: works fully; ticking on two phones merges per item (newest tick wins).
- A traveller who was removed from the trip but is still an item's assignee shows by name, as other
  records do (`names` in `TripData`).

Example: Ana ticks "Charger" while Bo adds "Sunscreen" offline. After a merge both are present and
the charger is ticked.

## Out of scope
- Personal (per-person) lists, quantities, categories, reminders, due dates.
- Per-person packed state.
- Reordering items by hand.
- Custom templates.

## Constraints
- Local-first, no external services. Data must merge record by record (`CLAUDE.md`).
- A new synced table: follow `specs/new-table-checklist.md` exactly. Do not change `LINK_VERSION`.
- Templates are plain data in the app; English only.

## Context for implementers
- Read `specs/new-table-checklist.md` and `CLAUDE.md` first.
- The pattern to copy end to end is `reviews`: `src/db/types.ts`, `src/domain/records.ts`,
  `src/domain/reviews.ts`, `src/ui/pages/ReviewsPage.tsx`, `src/db/actions.ts`.
- Writes use `saveRecord('packingItems', tripId, input, id?)`, `patchRecord`, `deleteRecord`.
- The page route goes in `src/App.tsx` under `trips/:tripId` (like `reviews`, route `packing`); the
  entry card goes on `src/ui/pages/TripInfoPage.tsx`. Not a new tab.
- Use existing form/UI helpers in `src/ui/components/fields.tsx` and `bits.tsx`.
- Do not touch: Dexie versions 1–5, `LINK_VERSION`, the `src/lib/tripLink.ts` encoding.
- Decided already: one shared list per trip; one shared packed state; assignee optional; ticking
  uses `patchRecord`.

## Tasks
1. **Record type and validation**
   - Change: add `PackingItem` (`text: string`, `packed?: boolean`, `bringer?: string` traveller id)
     in `src/db/types.ts`, as `packingItems` in `LINK_TABLES`/`TableRecords`/`emptyTables`; add its
     `SPECS` entry in `src/domain/records.ts` (`text` required `SHORT`, `packed` bool, `bringer`
     `isId`).
   - Depends on: none
   - Done when: `npm run typecheck` passes; a new test accepts a valid item and rejects a missing
     `text` and a 500-character `text`.
2. **Database version and server table**
   - Change: add the table and the next `db.version(n)` in `src/db/db.ts` per the checklist; extend
     `src/db/migrations.test.ts`; make `server/` accept the table via `RECORD_TABLES`.
   - Depends on: 1
   - Done when: `npm test` passes including the migration test (a 0.9.0-shaped database opens, the
     `packingItems` table is empty, `serverTrips` cursors reset to 0).
3. **Domain logic and templates**
   - Change: new `src/domain/packing.ts`: `TEMPLATES` (beach, city, hiking, skiing, ~10 common items
     each), `sortedItems(items)` (unpacked first, then by `createdAt` then `id`),
     `newFromTemplate(existing, template)` returning the texts to add (case-insensitive dedupe),
     `progress(items)`.
   - Depends on: 1
   - Done when: new `src/domain/packing.test.ts` covers ordering, dedupe, progress and the empty list.
4. **Load into the trip**
   - Change: `src/ui/tripData.ts` loads live `packingItems` into `TripData.packingItems`.
   - Depends on: 2
   - Done when: `npm run typecheck` passes; existing tests still pass.
5. **Page and entry card**
   - Change: `src/ui/pages/PackingPage.tsx` (list, add, tick, edit, delete, templates, assignee
     picker), route `packing` in `src/App.tsx`, card with progress on `TripInfoPage.tsx`.
   - Depends on: 3, 4
   - Done when: the manual check under Verification passes; `npm run lint` is clean.
6. **Sync tests, version and changelog**
   - Change: tests in `src/domain/sync.test.ts` and `server/src/sync.test.ts` for the new table; bump
     the `package.json` minor version and add the `CHANGELOG.md` entry.
   - Depends on: 5
   - Done when: `npm test` and `npm run build` pass, including the changelog test.

## Acceptance criteria
- [ ] A trip has a Packing & to-do page reachable from the Trip tab, with the empty state and templates.
- [ ] Adding, ticking, unticking, editing and deleting an item work and persist after reload.
- [ ] Adding a template twice does not duplicate items.
- [ ] Unticked items are listed before ticked ones; the header shows "N of M packed".
- [ ] Two copies of a trip with edits to different items merge to the union; the same item edited on
      both keeps the newest.
- [ ] A deleted item stays deleted after a merge with an older copy.
- [ ] A 0.9.0 database keeps every existing trip when opened by the new code.
- [ ] A link made by the new version opens in 0.9.0 (it ignores `packingItems`).

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`: all pass, no skipped tests added.
- Manual: `npm run dev`, create a trip with two travellers, add items, add the Beach template, tick
  one, reload, share the trip link into a second browser profile, tick another item there, import
  back; both ticks appear.

## Escalate when
- Anything would change a released Dexie version, `LINK_VERSION`, or the link/backup encoding.
- A merge or sync test fails and two attempts to fix it haven't worked.
- The change needs files outside those named under Context for implementers.
- The server needs changes beyond adding the table to `RECORD_TABLES`.

## Open questions
- None.

## Notes
- A Trip-tab card rather than a new tab keeps the tab bar as it is.
- One shared packed state, because the "who's bringing it" assignee already answers who packs.
- Template contents are the implementer's choice (~10 common items each); review in the PR.
- If another spec adding a table (`place-votes`) ships first, it takes the next Dexie version and
  this one takes the one after.
