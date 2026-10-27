# Files tab: documents and photos apart, grouped by type

Status: ready
Issue: https://github.com/waypoints-pwa/waypoints/issues/51
Builds after: none

## Problem
The 📷 Photos tab shows every document in one list on top and every photo by day below it. Once a trip has
documents for the whole trip and for its items, the tab is hard to scan. Finding the trip-wide documents
(insurance, visas) means reading the whole list.

## Behavior
The tab becomes **📎 Files**. Its path stays `photos`. At the top, below the add buttons, a switch picks
**Documents** (the default) or **Photos**. The switch is kept in the URL (`?view=photos` for photos, no
parameter for documents), like the Plan tab's "Day by day | Bookings". Back returns to the view you left.

Both views group files by **what they belong to**, in this order. Groups with nothing in them don't show.

| Group | Holds |
|---|---|
| Whole trip | files of the whole trip, and files whose item was deleted (as now: `ownerFinder` returns nothing) |
| Stays | files of a stay |
| Journeys | files of a journey, including whole-booking ones |
| Activities | files of an activity |
| Places | files of a place |
| Expenses | files of an expense |

**Documents view.** Each group has a heading and then **all** its documents as the rows they are today
(`DocumentRow`, showing the item's name). The order inside a group stays as today: by the item's day, then
by name (`sortDocuments`). With no documents at all, the tab shows today's empty text.

**Photos view.** Each group has a heading row: the group name on the left and, when the group has more
than 3 photos, a **See all N ›** link on the right. Below it is **one row of 3 tiles**: the group's first
3 photos by time taken (`byTimeTaken`), in a 3-column grid. A group with 1 to 3 photos shows them all and
no link. **See all** opens `/trips/<id>/photos/<group>` (`trip`, `stays`, `transports`, `activities`,
`places`, `expenses`). That page has the group's name as its title, its photo count, and all its photos by
day, laid out like the Photos tab today. With no photos at all, the view shows today's empty text.

Example: a trip with 14 whole-trip photos, 2 photos of the Senso-ji visit and 1 of the hotel. The Photos
view shows "Whole trip" with "See all 14 ›" and 3 tiles, then "Stays" with 1 tile, then "Activities" with
2 tiles. Tapping "See all 14 ›" shows the 14 photos under their days.

Unchanged: the server and storage notices (shown above the switch, in both views), the add buttons and
their "Belongs to" picker, the photo/document page and its Previous/Next (still across all the trip's
photos). Offline and sync behave as today; this is display only.

A group page with an unknown group in its URL shows `ItemGone` with Back to `photos?view=photos`. A known
group with no photos left (deleted since) shows "No photos here any more." and a link back to the
Photos view.

## Out of scope
- No new tab in the bottom bar; no route renames (`photos`, `files/:id` stay).
- No change to records, Dexie, sync, links, backups or the server.
- No change to Previous/Next or the "N of M" counter on a photo's page.
- No groups per item (one group per activity), no collapsing, no search or filters.
- No change to how documents and photos show on an item's own page (`AttachmentList`).

## Constraints
- Display only: nothing here touches `src/db/`, `src/domain/sync.ts` or the server.
- User-facing: version bump, `CHANGELOG.md` entry, `GUIDE.md` and the guide screenshots (CLAUDE.md, "Releases").
- `specs/smoke-test.md` (ready) visits `/trips/<id>/photos`: the path must keep working.

## Context for implementers
- `src/ui/pages/PhotosPage.tsx`: the tab today. It builds documents with `sortDocuments` and photos by day
  with `tripPhotos` and `photoTime(a).slice(0, 10)`. Keep its notices and `AddAttachments choose`.
- `src/ui/attachments.ts`: `ownerFinder` (an item's `ItemRef` has `table`; undefined means the whole trip),
  `ITEM_GROUPS` (the item group labels and order), `sortDocuments`, `byTimeTaken`, `tripPhotos`. It imports
  `db`, so don't put the pure grouping helper there (task 1 gives it its own file so its test stays plain).
- `src/ui/components/Attachments.tsx`: `PhotoTile`, `DocumentRow`, `AttachmentList`.
- `src/ui/pages/PlanPage.tsx:21-44`: the `segmented` switch with `useSearchParams` to copy.
- `src/ui/tripNav.ts`: `TABS` (tab label and icon), `tabOf`, `topBarBack`; tests in `src/ui/tripNav.test.ts`.
  `/trips/t1/photos/stays` already maps to the photos tab and falls back to `/trips/t1/photos`. Only a test is added.
- `src/App.tsx:52`: the `photos` route. Add `photos/:group` next to it.
- `src/ui/items/common.tsx:56`: `ItemGone`.
- `src/index.css:462`: `.photo-grid` (auto-fill). The preview row needs a fixed 3-column variant.
- `scripts/guide/screenshots.ts`: makes `docs/guide/*.png`. Photos are added at lines 94-98, the flight
  page is at `/trips/${tripId}/transport/${flightId}`, and the `photos` shot is at lines 128-129. The add result reads
  "Added N photos" / "Added 1 document" (`src/ui/components/Attachments.tsx:206`).
- `GUIDE.md:71` (the tab list) and `GUIDE.md:197-202` ("### Photos tab" and its image).

## Tasks

1. **Grouping helper**
   - Change: new `src/ui/fileGroups.ts` with
     `export type FileGroup = 'trip' | AttachableTable` (type import from `../db/types`),
     `export const FILE_GROUPS: { key: FileGroup; label: string }[]` in the order `trip` "Whole trip",
     `stays` "Stays", `transports` "Journeys", `activities` "Activities", `places` "Places", `expenses`
     "Expenses", `export const isFileGroup = (s: string | undefined): s is FileGroup`, and
     `export function groupFiles<T>(list: T[], groupOf: (x: T) => FileGroup): { group: FileGroup; label: string; items: T[] }[]`.
     The result is in `FILE_GROUPS` order, empty groups are left out, and each group keeps the input order.
     Test in `src/ui/fileGroups.test.ts`: empty list gives `[]`; mixed input comes out in group order with
     input order kept inside; groups without items are absent; `isFileGroup('trip')`,
     `isFileGroup('transports')` are true, `isFileGroup('photos')` and `isFileGroup(undefined)` false.
   - Depends on: none
   - Done when: `npx vitest run src/ui/fileGroups.test.ts` passes.
   - Executor: haiku

2. **Group page for photos**
   - Change: in `src/ui/components/Attachments.tsx`, add `PhotosByDay({ photos })`, which renders the
     by-day blocks that `PhotosPage` renders today (`h4` day heading + `photo-grid` of `PhotoTile`), taking
     the files and states itself (`useTripFiles`, `stateFinder`). New `src/ui/pages/PhotoGroupPage.tsx`:
     reads `group` from `useParams`. If `!isFileGroup(group)`, render
     `<ItemGone backTo={tripPath(t.trip.id, 'photos') + '?view=photos'} />`. Otherwise take `tripPhotos(t)`
     filtered by `(ownerFinder(t)(a)?.table ?? 'trip') === group`. Render an `h2` with the group's label, a
     `muted small` line with `plural(n, 'photo')`, then `PhotosByDay`. With none, render "No photos here any
     more." and a `Link` "Back to photos" to `photos?view=photos`. Add
     `<Route path="photos/:group" element={<PhotoGroupPage />} />` after the `photos` route in `src/App.tsx`.
     Add `['/trips/t1/photos/activities', '/trips/t1/photos']` to the fallback cases in `src/ui/tripNav.test.ts`.
   - Depends on: task 1
   - Done when: `npm run typecheck`, `npm run lint` and `npx vitest run src/ui/tripNav.test.ts` pass; in
     `npm run dev`, `/#/trips/<id>/photos/trip` shows that trip's whole-trip photos by day and
     `/#/trips/<id>/photos/nope` shows "This isn't in the trip any more".
   - Executor: sonnet

3. **Files tab with the switch and groups**
   - Change: in `src/ui/tripNav.ts`, change the `photos` entry's icon to `'📎'` and label to `'Files'` (key
     and path unchanged). In `src/ui/pages/PhotosPage.tsx`: the `h2` becomes "Files". Keep the notices and
     `AddAttachments choose`, then add a `segmented` switch "Documents" / "Photos" exactly as in `PlanPage`
     (`setParams({}, { replace: true })` / `setParams({ view: 'photos' }, { replace: true })`). Documents view:
     `groupFiles(sortDocuments(docs, ownerOf), (a) => ownerOf(a)?.table ?? 'trip')`, with each group as an
     `h3.group-title` plus today's `ul.list` of `DocumentRow`. Photos view: `groupFiles(tripPhotos(t), …)`,
     with each group as a `div.row.spread` holding an `h3.group-title` with the label and, when `items.length > 3`, a
     `Link className="link small"` "See all {n} ›" to `tripPath(t.trip.id, 'photos', group)`, then a
     `div.photo-grid.photo-row` with the first 3 as `PhotoTile`. Keep both empty texts and the
     "They take … on this phone" line (both views). Add `.photo-row { grid-template-columns: repeat(3, 1fr); }`
     after `.photo-grid` in `src/index.css`. Fix the two comments that say "Photos tab"
     (`src/ui/attachments.ts:149`, `src/ui/components/Attachments.tsx:154`) to say "Files tab".
   - Depends on: tasks 1, 2
   - Done when: `npm run typecheck`, `npm run lint`, `npm test` pass; `grep -rn "Photos tab" src` prints
     nothing; manual check in `npm run dev` on a trip with a whole-trip document, a journey document and 4
     whole-trip photos: the tab bar says "📎 Files"; the tab opens on Documents with "Whole trip" above
     "Journeys"; Photos shows 3 tiles and "See all 4 ›" under "Whole trip"; after you open See all and go back, the
     Photos view is still selected.
   - Executor: sonnet

4. **Guide and screenshots**
   - Change: in `scripts/guide/screenshots.ts`, add a 4th scene `['#fde2b8', '⛩️']` (so "Added 4 photos";
     update the wait regex). Write a small text file `travel-insurance.txt` to `tmp` and add it with
     "Add documents" on the photos page (wait for `/^Added 1 document/`). On the flight page, add
     `photo-1.jpg` with "Add photos" and an `e-ticket.txt` with "Add documents", waiting for each result. Replace
     the `photos` shot with `documents` (at `/trips/${tripId}/photos`) and `photos` (at
     `/trips/${tripId}/photos?view=photos`). In `GUIDE.md`: in the tab list (line 71), change
     "📷 Photos" to "📎 Files". Rename "### Photos tab" to "### Files tab" and rewrite its paragraph: the
     Documents/Photos switch, groups by what they belong to (whole trip first), 3 photos per group with
     **See all**. Show both images (`documents.png`, then `photos.png`) with alt texts describing them.
     Every **bold** label you write must exist in `src/`. Regenerate with `npm run dev` running, then
     `npm run guide:screenshots`.
   - Depends on: task 3
   - Done when: `grep -c "📷 Photos" GUIDE.md` prints 0; `grep -c "📎 Files" GUIDE.md` prints at least 2;
     each **bold** label in the new section is found by `grep -rn "<label>" src/ui`; `docs/guide/documents.png` exists and
     `cmp -s docs/guide/documents.png docs/guide/photos.png` exits non-zero; opening `documents.png`
     shows "Whole trip" and "Journeys" document groups, and `photos.png` shows "See all 4 ›" and a
     "Journeys" group with one tile.
   - Executor: sonnet

5. **Release**
   - Change: bump the minor version in `package.json` and `package-lock.json` (the next minor above
     `main` at build time), and add the `CHANGELOG.md` entry, written for people who use the app: the
     📷 Photos tab is now 📎 Files, documents and photos each have their own view, both grouped by what they
     belong to (whole trip first), and photos show 3 per group with "See all".
   - Depends on: tasks 1-4
   - Done when: `npx vitest run src/domain/changelog.test.ts` passes.
   - Executor: haiku

## Acceptance criteria
- [ ] The tab bar shows "📎 Files". `/trips/<id>/photos` opens it on Documents. `?view=photos` opens Photos.
- [ ] Documents view: whole-trip documents are under "Whole trip", the first group. Each other group lists all
      its documents, ordered by item day then name.
- [ ] Photos view: each group shows at most 3 tiles in one row. "See all N ›" appears only when N > 3.
- [ ] "See all" opens `/trips/<id>/photos/<group>` with exactly that group's photos by day. Back returns to the Photos view.
- [ ] A photo or document whose item was deleted shows under "Whole trip".
- [ ] `/trips/<id>/photos/nope` shows "This isn't in the trip any more".
- [ ] `npm test`, `npm run lint`, `npm run build` pass. `fileGroups.test.ts` and the new `tripNav` case are included.
- [ ] GUIDE.md and both screenshots show the new tab. The changelog entry is present.

## Verification
`npm run lint && npm test && npm run build`: all green. Then manual: `npm run dev` and the checks under task 3.

## Escalate when
- Any change seems needed in `src/db/`, `src/domain/`, `server/` or the records' fields.
- The `photos` path or `files/:id` routes would have to change.
- The screenshot script can't add a file on the flight page with the existing buttons.
- A check fails twice after a fix attempt.

## Open questions
- none

## Notes
- One tab with a switch, not a sixth tab: five tabs already fill a small phone's bar (decided with the user).
- Documents open first: tickets are what's needed fast during the trip (decided with the user).
- Groups are by type, not per item: fewer headings, and the item's name is already on each document row.
- The preview row shows the **first** 3 photos by time taken, so that it matches the See all page's order.
- Previous/Next on a photo still walks all the trip's photos, to keep this change display-only. It can be
  done later if it feels odd from a group page.
- Overlap scan: `journey-connections.md` only reads `src/ui/attachments.ts` (booking summary), and
  `smoke-test.md` visits `photos` (kept). No shared Dexie version, table or helper change, so `Builds after: none`.
