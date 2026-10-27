# Files per item, and deleting several at once

Status: ready
Issue: none yet
Builds after: none

## Problem
The 📎 Files tab (0.12.0) groups files only by kind. All the photos of every activity sit in one
"Activities" row, so you can't tell the Senso-ji photos from the teamLab ones. To delete many photos or
documents, you have to open them one by one.

## Behavior
**Sections per item.** Both views keep the kind headings in the same order (Whole trip, Stays, Journeys,
Activities, Places, Expenses). Under each kind heading, every item that has files gets its own
**section**. The section is titled with the item's emoji and name, as on its page. A journey's
whole-booking files get one section for the booking, titled with the route ("✈️ LIS → FRA → NRT"),
separate from the files of each journey. Inside a kind, sections go by the item's day and then by name;
items without a day (places) go by name. Files whose item was deleted stay under Whole trip, as now.
Whole trip is a single section with no item heading.

- **Documents view:** each section lists all its documents as `DocumentRow`s, by name. The row no
  longer repeats the item's name, because the section heading shows it.
- **Photos view:** each section shows its first 3 photos by time taken in one row of 3. When it has more
  than 3, **See all N ›** sits next to the section's heading.
  - **See all** for Whole trip opens `/trips/<id>/photos/trip`, as today.
  - For an item it opens `/trips/<id>/photos/<table>/<itemId>`.
  - For a whole booking it opens `/trips/<id>/photos/booking/<first leg's id>`.
  - That page's title is the section's emoji and name, with the photo count and all its photos by day.
  - An unknown item or booking shows `ItemGone`, with Back to `photos?view=photos`.
  - A known one whose photos were all deleted shows "No photos here any more." and a "Back to photos"
    link.

Example: Whole trip has 4 photos, the Senso-ji visit 2, teamLab 1, and the flight 1. The Photos view
shows:
- WHOLE TRIP: "See all 4 ›" and 3 tiles.
- JOURNEYS: "✈️ Lisbon (LIS) → Tokyo (HND)" with 1 tile.
- ACTIVITIES: "🎟️ Senso-ji Temple" with 2 tiles, then "🎟️ teamLab Planets" with 1 tile.

**Deleting several at once.** The Files tab (both views) and the See all pages (`photos/trip` and the
item pages) get a **Select** button. It shows only when that screen shows at least one file.
- Tapping **Select** starts select mode. Tiles and document rows no longer open the file: tapping one
  ticks it (a ✓ on the tile, a ✓ at the start of the row), and tapping again unticks it.
- A bar fixed above the tab bar shows "N selected", **Select all** (ticks every file shown on this
  screen: on the Photos view, only the tiles shown, at most 3 per section), **Delete** (disabled at 0)
  and **Cancel**.
- **Delete** asks once: "Delete 3 photos?" ("document"/"documents" on the Documents view).
  - It adds " Those of a whole booking go from every journey on it." when one of them is a
    whole-booking file.
  - It adds " They will be deleted for everyone on the trip." when the trip is on a server and one of
    them isn't private.
- On OK, all of them are deleted at once, select mode ends, and "Deleted 3 photos." shows above the
  sections until you leave the screen or start select mode again.
- Cancel, switching Documents/Photos, or leaving the screen ends select mode and clears the ticks.
- Offline: the deletes are saved on the phone and go to the server with the next sync, like a single
  delete today.

## Out of scope
- Bulk delete on an item's own page (`AttachmentList`) or on a photo's page; bulk move, share or caption.
- Collapsing sections, search, filters, sorting options.
- Removing or changing the `photos/:group` route for kinds other than `trip`. It keeps working but
  nothing links to it.
- Previous/Next on a photo's page still walks all the trip's photos.
- No change to records, Dexie versions, sync or the server.

## Constraints
- No new fields, tables or Dexie version. The only `src/db/` change is `deleteAttachments` (task 1),
  which uses the same per-file steps as `deleteAttachment`.
- User-facing: version bump, `CHANGELOG.md`, `GUIDE.md` and its screenshots (CLAUDE.md "Releases").
- `specs/smoke-test.md` visits `/trips/<id>/photos`: the path must keep working.

## Context for implementers
- `src/db/attachments.ts:91-100`: `deleteAttachment` (one transaction: set `deletedAt`, delete the file,
  `outboxFor`). Tests are in `src/db/attachments.test.ts:80-87`.
- `src/ui/attachments.ts`:
  - `ItemRef` (`table`, `id`, `emoji`, `title`, `day`, `path`, `booking`) is at :46-55.
  - `ownerFinder` (:117-128) returns, for a whole-booking file, the first leg's ref with
    `title: booking.route` and `booking` set. For a single journey's file, `booking` is unset.
  - `attachableItems` (:78), `bookingOf` (:101), `tripPhotos`, `sortDocuments`.
- `src/ui/fileGroups.ts`: `FileGroup`, `FILE_GROUPS`, `isFileGroup`, `groupFiles`. Its test file must
  stay free of Dexie, so import `ItemRef` as a type only (`import type`).
- `src/ui/pages/PhotosPage.tsx`: the tab. `src/ui/pages/PhotoGroupPage.tsx`: the See all page for a kind.
- `src/ui/components/Attachments.tsx`: `PhotoTile` (a `Link.tile`), `DocumentRow` (a `Link.list-row`),
  `PhotosByDay`.
- `src/App.tsx:53-54`: the `photos` and `photos/:group` routes.
- `src/ui/tripData.ts:177`: `tripPath(tripId, ...parts)`. `src/ui/format.ts:69`: `plural(n, one)`.
- `src/ui/items/common.tsx:56`: `ItemGone`.
- `src/index.css`: `.tabbar` (:116) and `.update-banner` (:142), whose fixed position above the tab bar
  the select bar copies. `.tile` is at :464 and `.list-row` at :340.
- `src/ui/tripNav.ts` `topBarBack`: `/trips/t1/photos/activities/x` falls back to `/trips/t1/photos`.
  It already does: only add a test case.
- `scripts/guide/screenshots.ts`: the demo trip import, photos at :95-99, the flight's photo and
  e-ticket at :109-118, and the `documents`/`photos` shots at :148-151. In
  `scripts/guide/demo-trip.ts:66`, `backup.activities[0]` is the Senso-ji visit and `[1]` is teamLab.
- `GUIDE.md:197-206`: the "### Files tab" section.

## Tasks

1. **Delete several in one go**
   - Change: in `src/db/attachments.ts`, add `export async function deleteAttachments(ids: string[])`.
     Run one transaction over `db.attachments, db.files, db.outbox` that applies `deleteAttachment`'s
     steps to each id and skips missing or already-deleted ones. Make `deleteAttachment(id)` call
     `deleteAttachments([id])`. In `src/db/attachments.test.ts`, add a test: two attachments and one
     already deleted. After `deleteAttachments` of all three ids, both have `deletedAt`, their files
     are gone, and the outbox holds exactly the two ids. Keep the existing delete test unchanged.
   - Depends on: none
   - Done when: `npx vitest run src/db/attachments.test.ts` passes and `npm run typecheck` passes.
   - Executor: sonnet

2. **Sections helper**
   - Change: in `src/ui/fileGroups.ts` (type-only import of `ItemRef` from `./attachments`), add:
     ```ts
     export interface FileSection<T> { key: string; title: string; emoji?: string; seeAll: string[]; items: T[] }
     export interface KindSections<T> { group: FileGroup; label: string; sections: FileSection<T>[] }
     export function sectionFiles<T>(list: T[], ownerOf: (x: T) => ItemRef | undefined): KindSections<T>[]
     ```
     - Kind: `owner?.table ?? 'trip'`. Kinds come in `FILE_GROUPS` order, and empty ones are left out.
     - Section `key`: `'trip'` with no owner, `booking:<owner.id>` when `owner.booking` is set, else
       `<table>:<id>`.
     - `title`: `'Whole trip'` or `owner.title`. `emoji`: `owner.emoji`, or undefined for the trip.
     - `seeAll`: `['photos', 'trip']`, `['photos', 'booking', owner.id]`, or `['photos', table, id]`.
     - Sections inside a kind are sorted by `owner.day` (no day last), then `title`, then `key`. Items
       keep their input order.
     - Keep `groupFiles` (PhotoGroupPage uses `FILE_GROUPS`).
     - Tests in `src/ui/fileGroups.test.ts` with plain `ItemRef` objects:
       - empty gives `[]`;
       - two activities on different days come out as two sections, earlier day first, even when the
         later one is first in the input;
       - a place without a day sorts after a dated one and by name among undated ones;
       - a whole-booking ref (with `booking`) and a single-journey ref with the same `id` are two
         sections with keys `booking:<id>` and `transports:<id>`;
       - an `undefined` owner goes to kind `trip`, section `trip`, `seeAll` `['photos','trip']`;
       - input order is kept inside a section.
   - Depends on: none
   - Done when: `npx vitest run src/ui/fileGroups.test.ts` and `npm run typecheck` pass.
   - Executor: sonnet

3. **Files tab in sections, and the item photos page**
   - Change: in `src/ui/pages/PhotosPage.tsx`, build both views with `sectionFiles(...)` over the lists
     used today (`sortDocuments(docs, ownerOf)` and `tripPhotos(t)`), with `ownerOf`.
     - Per kind: an `h3.group-title` with the kind label. For `trip`, the `h3` reads "Whole trip" and
       there's no section heading.
     - Per section of other kinds: a `div.row.spread` with an `h4` "{emoji} {title}".
     - Photos view: the "See all {n} ›" link (`tripPath(t.trip.id, ...section.seeAll)`) sits in the
       section's heading row when `items.length > 3`. For `trip` it sits in the `h3` row. Then
       `div.photo-grid.photo-row` with the first 3 `PhotoTile`s.
     - Documents view: `ul.list` of `DocumentRow` without the `item` prop.
     - Keep the notices, `AddAttachments choose`, the switch, both empty texts and the storage line.
   - Also add `PhotoItemPage` in `src/ui/pages/PhotoGroupPage.tsx`, on route
     `photos/:group/:itemId` (after `photos/:group` in `src/App.tsx`):
     - `group === 'booking'`: the photos whose owner has `booking` and `owner.id === itemId`. The
       heading is `bookingOf(t, itemId)` (emoji of its first leg, `route` as title). When `bookingOf`
       returns undefined, show `ItemGone`.
     - `group` an `AttachableTable`: the photos whose owner has no `booking`, `table === group` and
       `id === itemId`. The heading is `attachableItems(t).get(`${group}:${itemId}`)`. When there is
       none, show `ItemGone`.
     - Any other `group` (including `trip`): `ItemGone`.
     - Otherwise: `h2` "{emoji} {title}", the `muted small` count, then `PhotosByDay`. With no photos,
       show "No photos here any more." and the "Back to photos" link, as in `PhotoGroupPage`.
     - `ItemGone` goes back to `photos?view=photos`.
   - In `src/ui/tripNav.test.ts`, add `['/trips/t1/photos/activities/x', '/trips/t1/photos']` to the
     fallback cases.
   - Depends on: task 2
   - Done when: `npm run typecheck`, `npm run lint` and `npm test` pass.
   - Executor: sonnet

4. **Select mode**
   - Change: in `src/ui/components/Attachments.tsx`, give `PhotoTile` and `DocumentRow` an optional
     `select?: { on: boolean; toggle: () => void }`. With it, render a `<button type="button">` with
     the same class plus `selected` when on, `aria-pressed={on}`, and the same label. It doesn't
     navigate. Show `<span className="tile-check">✓</span>` (tile) or `<span className="row-check">✓</span>`
     (row, before the icon) when on.
   - Add, in the same file:
     - `useSelection()` returns `{ active, ids: Set<string>, start, stop, toggle(id), setAll(ids) }`.
     - `SelectBar({ shown, noun, selection, onDeleted })` renders `div.select-bar` with "N selected",
       **Select all** (`setAll(shown ids)`), **Delete** (`btn btn-danger`, disabled at 0) and
       **Cancel**.
     - Delete builds the confirm text exactly as in Behavior (`plural(n, noun)`; the booking sentence
       when any selected one's owner has `booking`; the everyone sentence when `t.server` and any isn't
       `private`), calls `deleteAttachments`, then `stop()` and `onDeleted(n)`.
   - In `PhotosPage`, put a **Select** button (`btn btn-small`) next to the switch when the current
     view has files and select mode is off. Pass `select` to the shown tiles or rows only while
     active. Show `SelectBar` while active, and "Deleted {plural(n, noun)}." in a `Notice` above the
     sections after a delete. Switching views calls `stop()` and clears the message. Do the same in
     `PhotoGroupPage` and `PhotoItemPage` (noun `photo`, shown = all the page's photos).
   - In `src/index.css`:
     - `.select-bar` is fixed like `.update-banner`, above the tab bar: row, spread, gap 8px,
       `z-index: 6`.
     - `.tile.selected` gets `outline: 3px solid var(--accent); outline-offset: -3px`.
     - `.tile-check` is the round ✓ at top left, styled like `.tile-badge`.
     - `.list-row.selected` gets `border-color: var(--accent)`.
     - `.row-check` is accent-coloured and bold.
     - Button tiles and rows look like the link ones: add `button.tile`, `button.list-row` with
       `font: inherit; text-align: left; width: 100%; cursor: pointer`.
   - Depends on: tasks 1, 3
   - Done when: `npm run typecheck`, `npm run lint`, `npm test` pass; manual check in the running app
     (see Verification).
   - Executor: sonnet

5. **Guide and screenshots**
   - Change: in `scripts/guide/screenshots.ts`, after the flight's uploads, add `photo-2.jpg` and
     `photo-3.jpg` on `/trips/${tripId}/activities/${backup.activities[0].id}`. Then add `photo-4.jpg`
     on `backup.activities[1]`, waiting for each "Added" text. Then return to `/trips/${tripId}/photos`
     as today. After the `photos` shot, add a `select` shot: on the Photos view, tap **Select**, then
     tap the first two tiles. Write the "### Files tab" paragraph of `GUIDE.md` again:
     - each item has its own section under its kind (whole trip first);
     - photos show 3 per section, with **See all**;
     - to delete several, tap **Select**, tick them and tap **Delete**.
     Add `docs/guide/select.png` after `photos.png`, with an alt text. Every **bold** label must exist
     in `src/ui`. Regenerate with `npm run dev` running, then `npm run guide:screenshots`.
   - Depends on: task 4
   - Done when:
     - each **bold** label in the section is found by `grep -rn "<label>" src/ui`;
     - `docs/guide/select.png` exists, and `cmp -s` of each pair of `documents.png`, `photos.png` and
       `select.png` exits non-zero;
     - `photos.png` shows the "Activities" heading with two sections (Senso-ji with 2 tiles, teamLab
       with 1);
     - `select.png` shows 2 ticked tiles and the bar with "2 selected".
   - Executor: sonnet

6. **Release**
   - Change: bump the minor version in `package.json` and `package-lock.json` (the next minor above
     `main` at build time). Add the `CHANGELOG.md` entry, written for people who use the app:
     - in 📎 Files, each stay, journey, activity, place and expense has its own section;
     - **Select** deletes several photos or documents at once.
   - Depends on: tasks 1-5
   - Done when: `npx vitest run src/domain/changelog.test.ts` passes.
   - Executor: haiku

## Acceptance criteria
- [ ] Photos view: two activities with photos show as two sections under "Activities", each titled
      with its emoji and name, earlier day first. The same holds for places, stays, journeys and
      expenses.
- [ ] A whole booking's files show in their own section titled with the route, apart from the
      journey's own files.
- [ ] Documents view: the same sections; rows don't repeat the item's name.
- [ ] "See all N ›" shows only when a section has more than 3 photos. It opens
      `/trips/<id>/photos/<table>/<itemId>` with exactly that item's photos by day, and Back returns to
      the Photos view.
- [ ] `/trips/<id>/photos/activities/nope` and `/trips/<id>/photos/trip/x` show "This isn't in the trip
      any more".
- [ ] Select mode: tapping ticks without opening. **Select all** ticks every shown file. **Delete** asks
      once with the right count and noun; on OK the files disappear and "Deleted N photos." shows.
      **Cancel** and switching views clear the ticks.
- [ ] A file whose item was deleted shows under Whole trip.
- [ ] `npm test`, `npm run lint` and `npm run build` pass, including the new `attachments`,
      `fileGroups` and `tripNav` tests.
- [ ] GUIDE.md shows the three screenshots, and the changelog entry is present.

## Verification
`npm run lint && npm test && npm run build`: all green. Then run the app with `npm run dev`. On a trip
with 4 whole-trip photos, 2 photos on one activity, 1 on another and a whole-booking document:
- check the sections and See all;
- check an unknown item URL;
- select 2 photos and delete them (they're gone, and the message shows);
- select all on Documents and cancel (nothing is deleted).

## Escalate when
- A Dexie version, a new field or table, or any change in `src/domain/`, `src/sync/` or `server/` seems
  needed.
- `ownerFinder` would have to change to tell a booking's files from a journey's own.
- The `photos` or `files/:id` routes, or `photos/:group`, would have to change.
- A check fails twice after a fix attempt.

## Open questions
- none

## Notes
- Follow-up to `files-tab` (shipped 0.12.0), after Ricardo tried it on his phone. Kind headings stay;
  the per-item sections are under them, and every kind gets them (decided with the user).
- Documents use the same sections as photos (decided with the user).
- Bulk delete is a select mode on the Files tab and the See all pages only, not on item pages (decided
  with the user).
- `deleteAttachments` runs in one transaction, so the live queries update once and a failure deletes
  nothing.
- **Select all** ticks only what's shown. On the Photos view that's at most 3 per section, so nothing
  hidden is deleted by surprise. To delete a whole item's photos, use its See all page.
- Whole-booking files get their own section keyed by the first leg's id, the same id `ownerFinder`
  gives them. Its See all page uses the `booking` segment, so it can't clash with that leg's own page.
- Overlap scan: `journey-connections` (draft) only reads `src/ui/attachments.ts`. `smoke-test` (ready)
  visits `photos`, which is kept, and doesn't touch the screenshot script. Nothing shared, so
  `Builds after: none`.
