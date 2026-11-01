# Packing & to-do lists

Status: shipped (0.14.0)
Issue: https://github.com/waypoints-pwa/waypoints/issues/14
Builds after: none

## Problem
Groups plan what to bring and what to do before leaving in chat messages that get lost. The app has
no shared checklist, so nobody knows who is bringing the charger or the first-aid kit.

## Behavior
Each trip has one shared checklist of items, opened from a **Packing & to-do** card on the Trip tab.
The card shows "2 of 9 packed", or "Nothing here yet" for an empty list.
- Add an item (text, required, trimmed, up to 200 characters). Optionally set **Who's bringing it** to
  one traveller of the trip. On a trip with one traveller, this field isn't shown, except when editing
  an item that already has an assignee, so it can be seen and cleared. Typing text that's
  already on the list adds it anyway: two identical items can be intentional.
- Anyone ticks or unticks an item with one tap. There is one shared packed state per item.
- Items are shown unticked first, then ticked, each group in the order they were added. Items added
  together by a template have the same time, and among those the order is alphabetical. A header shows
  "2 of 9 packed", except on an empty list.
- Add from a **template** (Beach, City, Hiking, Skiing; the buttons are always on the page): adds that
  template's items to the list, skipping any item whose text (trimmed, case-insensitive) is already on
  the list, ticked or not. A template never removes or changes existing items. If nothing is new,
  nothing happens.
- Tap an item's text to edit it in its row: text and **Who's bringing it**, with **Save**, **Cancel** and
  **Delete**. One row at a time. Delete asks first, like other items ("Delete this item?", plus "It will
  also be deleted for the others when you share the trip." on a group trip), and is a tombstone: it
  disappears for everyone.
- Empty state: "Nothing here yet" with the template buttons and an Add field.
- Offline: works fully; ticking on two phones merges per item (newest tick wins).
- Known limit: two phones adding the same template offline each create their own items, so a merge
  shows them twice. Someone deletes the extras.
- A traveller who was removed from the trip but is still an item's assignee shows by name, as other
  records do (`names` in `TripData`, `nameOf`), and stays selected when that row is edited.
- A sync server older than this version refuses the items ("update the server"); phones keep them in
  the outbox until it's updated. Links keep working.

Example: Ana ticks "Charger" while Bo adds "Sunscreen" offline. After a merge both are present and
the charger is ticked.

## Out of scope
- Personal (per-person) lists, quantities, categories, reminders, due dates.
- Per-person packed state.
- Reordering items by hand.
- Custom templates.
- Preventing the offline template duplicates above.
- A guide screenshot, and changes to the demo trip.

## Constraints
- Local-first, no external services. Data must merge record by record (`CLAUDE.md`).
- A new synced table: follow `specs/new-table-checklist.md` exactly. Do not change `LINK_VERSION`.
- Templates are plain data in the app; English only.

## Context for implementers
- Read `specs/new-table-checklist.md` and `CLAUDE.md` first.
- The pattern to copy end to end is `reviews`: `src/db/types.ts`, `src/domain/records.ts`,
  `src/domain/reviews.ts`, `src/ui/pages/ReviewsPage.tsx`, `src/db/actions.ts`.
- Writes, all in `src/db/actions.ts`: `saveRecord('packingItems', tripId, input)` to add one item;
  `addRecords('packingItems', tripId, inputs)` for a template, unchanged; `patchRecord` to tick
  (`{ packed: checked }`) and to edit (`{ text, bringer: value || undefined }`: `compact` drops the
  undefined, which clears the assignee); `deleteRecord` to delete.
- The page route goes in `src/App.tsx` under `trips/:tripId` (like `reviews`, route `packing`); the
  entry card goes on `src/ui/pages/TripInfoPage.tsx`, just before the 📊 Trip report card. Not a new tab.
- Items have no page of their own, so `packingItems` is left out of `SEGMENT` in `src/ui/items/save.ts`
  (like `reviews`), and `ItemFooter` doesn't apply: copy its confirm text.
- `src/ui/tripNav.ts`: `tabOf` must return `trip` for `packing`, or the page sits under the Plan tab.
- Use `TextField` (it passes `maxLength` on), `EmptyState`, the `.check` and `.list-row` CSS classes
  (`src/index.css`), and the traveller `<select>` in `TripInfoPage.tsx` as the picker's pattern, with a
  first option "Nobody yet". `t.travellers.length > 1` is how pages tell a group trip.
- The server needs no code for the table: `RECORD_TABLES` is built from `LINK_TABLES`. It does need a
  new `VERSION` (`server/src/app.ts`), as 0.8.0 did when it added `reviews`.
- Do not touch: Dexie versions 1–5, `LINK_VERSION`, the `src/lib/tripLink.ts` encoding, `addRecords`,
  `scripts/guide/`.
- Decided already: one shared list per trip; one shared packed state; assignee optional; ticking
  uses `patchRecord`; editing happens in the row.

## Tasks
1. **Record type, validation and database version**
   - Change: add `PackingItem` (`text: string`, `packed?: boolean`, `bringer?: string` traveller id)
     in `src/db/types.ts`, as `packingItems` in `LINK_TABLES`/`TableRecords`/`emptyTables`; add its
     `SPECS` entry in `src/domain/records.ts` (`tripId` required `isId`, `text` required `SHORT`,
     `packed` optional `bool`, `bringer` optional `isId`). In `checkRecord`, make `invalid` split
     camelCase, so the message reads "It contains an invalid packing item." Add `packingItems` to
     `db` and a new `db.version(6)` in `src/db/db.ts`, resetting `serverTrips` cursors exactly like
     version 5. Exclude `packingItems` from `SEGMENT` in `src/ui/items/save.ts`. Extend
     `src/db/migrations.test.ts` and `src/domain/records.test.ts`. These all go together: the types
     don't compile until `db` and `SEGMENT` know the table, and sync tests fail until the store exists.
   - Depends on: none
   - Done when: `npm run typecheck` and `npm test` pass, with a new test accepting a valid item and
     rejecting a missing `text` and a 500-character `text` (expecting the message above), and a
     migration test (a version 5 database opens, every existing record is kept, the `packingItems`
     table is empty, `serverTrips` cursors reset to 0, the outbox is kept).
   - Executor: sonnet
2. **Domain logic and templates**
   - Change: new `src/domain/packing.ts`: `TEMPLATES` (beach, city, hiking, skiing, each with a label
     and ~10 common items, no repeats), `sortedItems(items)` (unpacked first, then by `createdAt`, then
     lowercased `text`, then `id`), `newFromTemplate(existing, template)` returning the texts to add
     (trimmed, case-insensitive dedupe, ticked items count), `progress(items)` returning
     `{ packed, total }`.
   - Depends on: 1
   - Done when: `npx vitest run src/domain/packing.test.ts` passes, covering ordering (including items
     with the same `createdAt`), dedupe, progress and the empty list.
   - Executor: haiku
3. **Load into the trip**
   - Change: `src/ui/tripData.ts` loads live `packingItems` into `TripData.packingItems`.
   - Depends on: 1
   - Done when: `npm run typecheck` and `npm test` pass.
   - Executor: haiku
4. **Page, entry card, navigation and smoke test**
   - Change: `src/ui/pages/PackingPage.tsx` with a heading, as under Behavior; route `packing` in
     `src/App.tsx`; card on `TripInfoPage.tsx`; `packing` in `tabOf` (`src/ui/tripNav.ts`), with a
     `['/trips/t1/packing', '/trips/t1/trip']` row in `src/ui/tripNav.test.ts`; `/trips/${trip}/packing`
     in the routes of `e2e/screens.e2e.ts`, whose `toHaveLength` goes up by one.
   - Depends on: 2, 3
   - Done when: `npm run typecheck` and `npm test` pass; `npx oxlint src/ui/pages/PackingPage.tsx`
     reports nothing; `npm run smoke` passes (first run needs `npx playwright install chromium`); the
     manual check under Verification passes.
   - Executor: sonnet
5. **Sync tests**
   - Change: in `src/domain/sync.test.ts`, the table merges (newest `updatedAt` wins, a newer tombstone
     wins, different items merge to the union) and goes in links, in the shape of "carry reviews, in the
     version older apps read too": version 1, and a link without `packingItems` still decodes. In
     `server/src/sync.test.ts`, the server accepts and returns an item, and rejects an invalid one with
     "It contains an invalid packing item."
   - Depends on: 1
   - Done when: `npm test` passes.
   - Executor: sonnet
6. **Version and changelog**
   - Change: the next minor version in `package.json` and `package-lock.json`, and in `VERSION` in
     `server/src/app.ts`; a `CHANGELOG.md` entry for app users, saying a sync server needs updating to
     that server version to share the lists.
   - Depends on: 5
   - Done when: `npm test` and `npm run build` pass, including the changelog test.
   - Executor: haiku
7. **User guide**
   - Change: a `### Packing & to-do` section in `GUIDE.md`, just before `### Calendar`: where to open
     it, adding, ticking, **Who's bringing it**, templates, editing and deleting, and that a sync server
     needs updating. No picture. No pictured screen changes, so don't run `guide:screenshots`.
   - Depends on: 4
   - Done when: this prints nothing (every bold label is in the app):
     `sed -n '/^### Packing & to-do/,/^### /p' GUIDE.md | grep -o '\*\*[^*]*\*\*' | tr -d '*' | while read -r l; do grep -rqF "$l" src/ui || echo "MISSING $l"; done`,
     and `grep -c '^### Packing & to-do' GUIDE.md` prints 1.
   - Executor: sonnet

## Acceptance criteria
- [ ] A trip has a Packing & to-do page reachable from the Trip tab, with the empty state and templates;
      the page sits under the Trip tab and its back arrow returns there.
- [ ] Adding, ticking, unticking, editing and deleting an item work and persist after reload.
- [ ] Clearing an item's assignee sticks; an item whose assignee left the trip shows their name.
- [ ] Adding a template twice does not duplicate items.
- [ ] Unticked items are listed before ticked ones; the header shows "N of M packed".
- [ ] Two copies of a trip with edits to different items merge to the union; the same item edited on
      both keeps the newest.
- [ ] A deleted item stays deleted after a merge with an older copy.
- [ ] A database from before this version (Dexie version 5) keeps every existing trip when opened by the new code.
- [ ] A link made by the new version opens in an older app (it ignores `packingItems`).
- [ ] The server accepts the items, and reports the new `VERSION`.
- [ ] `GUIDE.md` has the section, and the changelog says a sync server needs updating.

## Verification
- `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`: all pass, no skipped tests added.
  `npm run lint` shows no new warnings.
- Manual: `npm run dev`, create a trip with two travellers, add items, add the Beach template, tick
  one, edit one, delete one, reload, share the trip link into a second browser profile, tick another
  item there, import back; both ticks appear and the deleted item stays gone.

## Escalate when
- Anything would change a released Dexie version, `LINK_VERSION`, or the link/backup encoding.
- A merge or sync test fails and two attempts to fix it haven't worked.
- The change needs files outside those named under Context for implementers and Tasks.
- The server needs changes beyond its `VERSION`.
- `addRecords` seems to need changing.

## Open questions
- None.

## Notes
- A Trip-tab card rather than a new tab keeps the tab bar as it is.
- One shared packed state, because the "who's bringing it" assignee already answers who packs.
- Template contents are the implementer's choice (~10 common items each); review in the PR.
- Alphabetical order within a template, rather than spacing `addRecords` timestamps apart: it leaves
  the helper the Google list import uses alone, and every phone shows the same order.
- `place-votes` builds after this spec and takes the Dexie version after this one.
- As built:
  - App 0.14.0, server 0.6.0, Dexie version 6.
  - Long items cut off with an ellipsis on their row, and show in full in the edit row. A `button.list-text`
    reset in `src/index.css` keeps a 200-character item inside a 320px screen (review of task 4 fixed this).
  - The tap area of a row's checkbox is larger, through `.list-row > .check`. That rule also applies to the
    Google list import rows, whose checkboxes should now be vertically centred (read from the CSS, not rendered).
  - Domain helpers in `src/domain/packing.ts` also ignore tombstones, as a safety net: `TripData` only holds live items.
  - The smoke test opens an empty list, so no automated check covers a filled row at phone width. The filled
    list was checked with a throwaway browser script, including the two-profile flow under Verification.
