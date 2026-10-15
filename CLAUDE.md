# waypoints — notes for Claude

Trip companion PWA. Local-first: all data in IndexedDB via Dexie; hosted as a static site on GitHub
Pages (https://waypoints-pwa.github.io/waypoints/). Trips move between phones as links (`#/t/<data>`, the
trip compressed into the URL fragment) or files, and are merged record by record. An optional self-hosted
sync server (`server/`) keeps trips put on it in sync for the travellers linked to it; links keep working
alongside, also for people who aren't on the server.

## People's trips — never lose them
Once people use the app, their only copy of a trip may be in their browser. Every change must be
non-destructive for existing data:
- **Dexie versions are append-only** (`src/db/db.ts`): never edit/delete a released `db.version(n)`,
  never change a primary key, never drop a table holding user data. Add a new version, and extend
  `src/db/migrations.test.ts` (it opens a v0.1-shaped database with the current code).
- **Never change the app's origin/base path** (`waypoints-pwa.github.io` + `/waypoints/`). Browser storage is
  per origin: moving the app would show everyone an empty app.
- **waypoints has an origin of its own** (the `waypoints-pwa` GitHub org) on purpose: apps on one origin share
  storage, permissions and eviction, so clearing or uninstalling one with its data would wipe the other.
  Never host it, or another app, on the same origin as fronds (`timoneiro.github.io`).
- **Trip links live forever in group chats** (`src/domain/sync.ts`, `src/lib/tripLink.ts`): every
  `LINK_VERSION` ever shipped must keep decoding. Add a version instead of changing one. A new table can
  join version 1 (as `reviews` did in 0.8.0): older apps read only the tables they know, and still open it.
- **Sync protocol** (`src/domain/serverProtocol.ts`): backward compatible both ways (old apps with new
  servers and vice versa). **Server store** (`server/src/store.ts`): upgrade old formats in `migrate()`;
  never regenerate the server code. Who may see a server trip follows from its travellers' `memberId`,
  checked by the server on every request. That link merges on its own clock (`linkedAt`, see
  `withNewerLink` in `src/domain/sync.ts`) so an edit from an older copy can't undo it, and links and
  files never change it on trips the phone keeps on the server: only the server does.
- **Backup format**: add optional fields only; bumping `BACKUP_VERSION` makes older app versions reject
  new files, so it needs a migration in `parseBackup`.
- **Mixed versions in a group**: records keep fields and kinds/categories they don't know
  (`src/domain/records.ts`), and unknown kinds show as "other". Don't strip unknown fields.
- **Merges** are record-level: newest `updatedAt` wins, tombstones (`deletedAt`) are records too. Never
  hard-delete a shared record. All writes go through `src/db/actions.ts` (photos and documents:
  `attachments.ts`), which marks them unsent (for links) and in the outbox (for the server), and skips
  saves that change nothing (an unchanged save would override someone else's newer edit). Merges from
  links go into the outbox too.
- **Photos and documents** (`src/db/attachments.ts`): their records sync like the others, but only
  through the server: links and trip files leave them out (`LINK_TABLES`, `forSending`). Their files
  are kept apart (`db.files`; `FILES_DIR/trips/` on the server) and are in no backup or snapshot, so a
  file is deleted only with its attachment's tombstone or with its whole trip, and removing a trip
  warns about files that exist only on this phone. Private ones never leave the phone (the client
  leaves them out, the server refuses them). A file never changes once added: the server only takes
  bytes matching the record's `size` and `sha256`, and phones check what they download. One added
  to a journey can be for its whole booking (`wholeBooking`): it shows on every journey with the same
  booking ref (`src/domain/bookings.ts`), and stays with them if its own journey is deleted.
- **A new table the server syncs**: its Dexie version resets `serverTrips` cursors to 0 (see v3 to v5 in
  `src/db/db.ts`), because older app versions skipped those records while moving past them. The server
  takes its tables from `RECORD_TABLES`, so it needs a new image too: older servers refuse the records
  ("update the server"), and phones keep them in the outbox until it's updated.
- **Reviews** (`src/domain/reviews.ts`, `saveReview` in `src/db/actions.ts`): one record per traveller and
  item, with an id made from both (`reviewId`), so the same person on two phones ends up with one review.
  Such ids come from `derivedId` (`src/domain/ids.ts`), which must never change: records would split in two.
  A review left empty becomes a tombstone (the item is theirs to review again).
- **Trip reports** (`src/domain/report.ts`, `saveReport` in `src/db/actions.ts`, `src/ui/pages/ReportPage.tsx`): built
  from the trip's records on the phone (`buildReport`). On a trip on the server, once it's over and the
  phone has synced, the first phone to open the report keeps it in the `reports` table: one record per trip
  (`reportId`, derived from the trip id), synced only through the server like attachments (`forSending`
  and links leave it out, it's never "unsent"), and everyone opens that one until someone makes it again.
  Its `data` comes from other phones and versions, so it's only shown through `readReport`, which checks
  every field; `records.ts` checks just its shape and size. `REPORT_FORMAT` goes up only when a field's
  meaning changes (new fields can join the current one). The shareable version leaves names, notes,
  photos and per-person money out of the page itself, as the exported file (`src/lib/reportFile.ts`) is
  made from the page.
- Take a snapshot (`takeSnapshot`) before any operation that removes or overwrites local data.
- Ship through a PR (CI runs lint, types, tests, build); merging to `main` deploys to users immediately.

## Releases & changelog
Every user-facing change bumps `version` in `package.json` and adds a `## x.y.z — YYYY-MM-DD` entry at the
top of `CHANGELOG.md`, written for people who use the app (`src/domain/changelog.test.ts` fails CI if the
entry is missing). The entry is the app's "What's new" card. Internal changes skip the bump.

## Content-Security-Policy
The built app ships a CSP `<meta>` (in `vite.config.ts`, build only) with `connect-src 'self' https:` (plus
localhost): the only requests are to the sync server whose address people type in, and to Photon
(`photon.komoot.io`, `src/domain/addresses.ts`) for online address search, an opt-in setting that's off
by default. Without either, the app makes none. Maps, calendars and booking sites are plain links. Photos and documents show from the
phone's own storage (`img-src blob:`), never from the server directly. Anything else that fetches from
another host (an exchange-rate API, map tiles) needs adding there, and must stay an optional add-on.

## Principles
- **No accounts, no API keys.** Core features work without any, and without the sync server, which is an
  optional, self-hosted add-on (no third parties). A server that can't be reached is normal, not an error:
  changes wait in the outbox.
- **Local-first.** Fully usable offline.
- **Links and files are untrusted input**: validated in `src/domain/records.ts` and size-limited; only
  `http(s)` addresses ever become a clickable href (`safeHttpUrl` in `src/domain/links.ts`).
- **Time**: a new item's zone follows the plan (`zoneOnDay`: where the journeys and stays have you by
  then), and picking a city or an airport sets it; records keep the wall-clock day/time plus the place's IANA zone; `zonedInstant` puts them on the
  real timeline; calendar export is in UTC.
- **Money**: cash expenses convert at the average rate the trip's exchanges actually got (fees included);
  card payments at what the bank charged (their own `rate`), estimated at the cash average and flagged
  "cost pending" until someone adds it (`paidWith`, `awaitingCost`). Rates are typed in, never fetched.
  Expenses in the trip's own currency say cash or card too, which changes nothing in the sums; older
  ones there don't say, and stay unsaid until someone picks (`paidWithOf`).
- Target scale: a few trips per phone, up to a few hundred items each, groups of 2–10. English only.

## Layout
- `src/data/` — the built-in city and airport lists (`scripts/places-data.mjs` rebuilds them from GeoNames,
  OurAirports and mwgg/Airports; credited in Settings and the README). Loaded on first use as separate
  chunks, precached for offline. Searched in `src/domain/places.ts`.
- `src/domain/` — pure, unit-tested logic. Relative imports use explicit `.ts` extensions. No runtime deps.
- `src/db/` — Dexie schema, write actions, backup/merge IO, snapshots, local settings.
- `src/lib/` — browser helpers: trip link codec, share sheet, update prompt, downloads.
- `src/sync/` — sync server client (`client.ts`: the sync itself; `files.ts`: moving photos and documents
  after it; `account.ts`: joining, invites, leaving).
- `server/` — the sync server: Node HTTP, JSON-file store, no dependencies; runs `src/domain` directly
  (Node type stripping). Image: `ghcr.io/waypoints-pwa/waypoints-server`. `DATA_DIR` holds the database,
  `FILES_DIR` (another disk is fine) photos and documents (`trips/`) and the database's daily copies.
- `src/ui/` — React. `tripData.ts` loads a trip once for all its pages (`useTrip()`), `TripLayout.tsx`
  has its top bar and tabs, `items/` has one file per kind (form + detail page), `pages/` the rest;
  plain CSS tokens in `src/index.css` (light + dark).

## Commands
`npm run dev` · `npm test` (app, server, app↔server) · `npm run lint` · `npm run typecheck` · `npm run build`.
Server locally: `DATA_DIR=./server/data FILES_DIR=./server/files node server/src/main.ts`.

On Windows Git Bash, set `MSYS_NO_PATHCONV=1` when passing `BASE_PATH=/waypoints/` to a local build.

## Ideas
Future ideas live in `specs/`: `specs/BACKLOG.md` for parked ideas, and one `specs/<feature>.md` per specced feature (see the `/spec` skill). Build only specs whose issue has the `agent-ready` label (`/build` checks it); update a spec to match what shipped. Adding a synced table: `specs/new-table-checklist.md`.
