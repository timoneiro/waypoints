# Adding a new synced record table — checklist

Shared by every spec that adds a table (like `reviews` in 0.8.0, PR #11). A spec that adds a table
refers here instead of repeating this. Read `CLAUDE.md` ("People's trips — never lose them") first.

Find every place `reviews` appears and mirror each one that is about the list of tables, not about
reviews themselves: `grep -rn "reviews" src server/src --include=*.ts --include=*.tsx`. The known ones:

1. `src/db/types.ts`: the record interface (extends `TripRecord`), add to `LINK_TABLES`,
   `TableRecords`, `emptyTables`.
2. `src/domain/records.ts`: an entry in `SPECS` with a shape check for every field. Fields have length
   caps; ids use `isId`; free text uses `SHORT`/`LONG`.
3. `src/db/db.ts`: add the typed table to `db`, and a **new** `db.version(n)` that adds the store
   (`'id, tripId'`) and resets every `serverTrips` cursor to 0, exactly like version 4. Never edit an
   existing version. Use the next free number (`6` at time of writing: check the file).
4. `src/ui/tripData.ts`: load the live records into `TripData` (`loadTrip`).
5. `src/db/migrations.test.ts`: extend so a database from before this version still opens.
6. `src/domain/sync.test.ts` and `server/src/sync.test.ts`: the table merges (newest `updatedAt` wins,
   tombstone wins when newer) and the server accepts it.
7. `server/`: the server reads its tables from `RECORD_TABLES`, so it needs a new image; older servers
   refuse the records ("update the server") and phones keep them in the outbox.
8. `package.json` version bump (minor) and a `CHANGELOG.md` entry written for app users; a test
   enforces both.
9. Writes only through `saveRecord`/`patchRecord`/`deleteRecord` in `src/db/actions.ts`. Never
   hard-delete: a delete is a tombstone.
10. Phones on an older version ignore the new records and, because unknown fields are kept, don't
    destroy them. Do not change `LINK_VERSION`.
