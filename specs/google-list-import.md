# Import a shared Google Maps list

Status: ready
Issue: <issue link>
Builds after: google-maps-links (uses its server lookup, `GooglePlace`, nearest town, Photon reverse
lookup and the `lat`/`lng` fields)

## Problem
Friends plan a trip in a shared Google Maps list. Getting those places into waypoints means adding
them one by one. With a sync server, the whole list can come in at once from its share link.

## Behavior
**Who sees it.** Phones signed in to a waypoints server, on any trip (as in `google-maps-links`).

**Entry points.** On the 📍 Places tab, an **Import list** button before **+ Place**; in the empty
state, "Have a shared Google Maps list? **Import it**". Both open `/trips/<id>/places/import`. A
phone without a server sees neither.

**Step 1: the link.** A box **Shared Google Maps list link** with the hint "In Google Maps, open the
list, tap Share → Copy link.", and a **Look it up** button. "Looking it up…" while waiting.
Messages: as in `google-maps-links` for not-a-Google-link, can't reach, server too old, Google not
answering; plus "That's a single place: add it with **+ Place**." for a place link, and "This list
isn't shared, or doesn't exist." (the server's 422).

**Step 2: check and add.** Heading with the list's name and "37 places", then:
- **Kind**: the usual chips, starting on 🏛️ Sight; every place added gets it.
- A checklist in the list's order: tick box, name, and under it in muted text the town and the
  note's first line ("Huế · Go early"). The town is the nearest one (`cityAt`), worked out when the
  list arrives. A place already in the trip (same name ignoring case and accents, or same Google
  link) starts **unticked** with "Already in the trip". A place twice in the list shows once.
- **Add 35 places** (ticked count; "Add 1 place"; disabled at 0).
- Adding: each place gets name, link, note → notes, `lat`/`lng`, the chosen kind, its nearest town
  as city (empty if none), and Google's address if it had one. Places without one get an address from
  Photon afterwards, only when **online address search** is on: one lookup at a time, at most one a
  second, while "Finding addresses… 12 of 32" shows. Leaving the page stops it; the places are
  already saved, the rest just stay without an address.
- Then "Added 35 places." and **Done** (back to the Places tab).

**Example.** A shared list "Vietnam" of 37 places in Vietnam and Cambodia, 5 with addresses, into an empty trip,
kind 🏛️ Sight: 37 ticked rows; "Hue Imperial City" shows "Huế". After **Add 37 places**, the Places
tab groups them by town (Hanoi, Huế, Phnom Penh…), and "Thanh Toan Bridge" has Google's address
"Thanh Thuy, Hue, Vietname". With online address search on, the other 32 get Photon addresses.

**Sync.** Added places are ordinary places: unsent for the next link, in the outbox for the server.

## Out of scope
- Keeping a trip in step with the Google list later (re-import adds only what's missing, by hand).
- A kind or city per place inside the import (edit places afterwards).
- Lists over 500 places: the server asks Google for 500 (`!4i500`), so only the first 500 come in.
- Google Takeout files; phones without a server.

## Constraints
- Same as `google-maps-links` (Google only through the server, untrusted answers, Photon only with
  the setting on). Photon's public service asks for light use: hence one lookup a second, and only
  for places without Google's address.
- Writes go through `src/db/actions.ts`. No new table, no Dexie version, no format change.

## Context for implementers
- From `google-maps-links`: `lookUpGoogleMaps` (`src/sync/googleMaps.ts`), `GooglePlace`,
  `GoogleMapsAnswer`; `cityAt`, `reverseAddressOnline` (`src/lib/places.ts`); the messages it maps
  errors to. Read that spec's Behavior first.
- `src/ui/items/places.tsx`: `PlacesPage` (section head, `EmptyState`), `PlaceForm` (`ChoiceChips`
  with `PLACE_CATEGORIES`). `src/App.tsx` lines 49 and 67–69: places routes; add `places/import`.
- `src/db/actions.ts`: `saveRecord` (lines 50–62) shows a write: `compact`, `newId`, `nowISO`,
  `markChanged`, in one transaction with `db.unsent` and `db.outbox`; `patchRecord` for adding the
  address later (it skips places deleted meanwhile).
- `fold` (`src/domain/places.ts`) for name matching; `t.places` (`useTrip()`) holds live places only;
  `plural` in `src/ui/format.ts`; `Notice` in `src/ui/components/bits.tsx`; `getServerConfig()` in
  `src/db/serverState.ts`.
- Do not touch: `src/domain/records.ts`, `sync.ts`, `src/lib/tripLink.ts`, `src/db/db.ts`, `server/`.

## Tasks
1. **Matching against the trip**
   - Change: `markExisting(found: GooglePlace[], places: Place[])` in `src/domain/googleMaps.ts`:
     drops repeats within `found` (same link, else same folded name), returns `{ place, existing }[]`.
     Tests in `googleMaps.test.ts`: "Café Majestic" vs a trip's "cafe majestic" → existing; same link,
     other name → existing; deleted places aren't passed in, so not matched; a repeat kept once.
   - Depends on: none
   - Done when: `npx vitest run src/domain/googleMaps.test.ts` passes.
   - Executor: haiku
2. **Adding many places at once**
   - Change: `addRecords(table, tripId, inputs)` in `src/db/actions.ts`: one transaction over the table,
     `db.unsent`, `db.outbox`; each `compact`ed with `newId()` and the same `createdAt`/`updatedAt`;
     `bulkAdd`; one `markChanged` with all ids; returns the ids. Tests in `src/db/actions.test.ts`:
     three places added, all unsent and in the outbox; an empty list writes nothing.
   - Depends on: none
   - Done when: `npx vitest run src/db/actions.test.ts` passes.
   - Executor: sonnet
3. **Import page**
   - Change: new `src/ui/items/placesImport.tsx` (`PlacesImportPage`, steps, messages and address
     lookups exactly as in Behavior; addresses via `patchRecord('places', id, { address })`, stopped
     with an `AbortController` on unmount); route in `src/App.tsx`; **Import list** button and the
     empty-state line in `PlacesPage`, only with a server token.
   - Depends on: 1, 2
   - Done when: `npm run lint`, `npm run typecheck` clean; the manual check in Verification passes.
   - Executor: sonnet
4. **Guide**
   - Change: `GUIDE.md` "Places to see": a bullet: with a sync server, **Import list** brings in a
     shared Google Maps list. No screenshot change (the demo has no server, so the button doesn't
     show).
   - Depends on: 3
   - Done when: `grep -rn "Import list" src/ui` finds the button.
   - Executor: sonnet
5. **Release bookkeeping**
   - Change: next minor app version (`package.json`, `package-lock.json`); `CHANGELOG.md` entry: "With a
     sync server, bring a whole shared Google Maps list into a trip: 📍 Places → **Import list**."
   - Depends on: 4
   - Done when: `npm test` and `npm run build` pass.
   - Executor: haiku

## Acceptance criteria
- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass.
- [ ] With a local server, the Example in Behavior (with the test list Ricardo has; not in the repo) gives
      37 places grouped by town, "Thanh Toan Bridge" with Google's address.
- [ ] Importing the same list again shows every row unticked as "Already in the trip", and the button
      disabled.
- [ ] With online address search on, addresses fill in one by one; leaving the page midway leaves the
      added places and stops the lookups (no more Photon requests in DevTools → Network).
- [ ] A place link shows "That's a single place…"; a non-Google link shows "That's not a Google Maps link.".
- [ ] A phone without a server sees no **Import list** button.
- [ ] The places reach a second phone through a trip link and through the server.

## Verification
`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`: all exit 0.
Manual (task 3): local server and `npm run dev` as in `google-maps-links`, 📍 Places → **Import
list**, paste a shared list link, add, check the Places tab and one place page; repeat the import.

## Escalate when
- `google-maps-links` isn't shipped, or its functions differ from what Context names.
- The list answer from the server doesn't match `GoogleMapsAnswer`.
- Anything seems to need a change outside the files listed.
- A check fails twice after fixing.

## Open questions
(none)

## Notes
- One list per import; kind for the whole batch; city per place from coordinates (Ricardo's choice):
  a Google list often spans several towns, so one city for all would be wrong.
- Addresses come after adding, not before: Photon lookups for a long list take a while, and the places
  shouldn't wait on an optional extra.
- Ids are new, not derived from Google's place id: two people importing the same list on two phones
  get the places twice, which is rare; derived ids would be a recipe that can never change.
- Long lists with Google links make trip links longer; the existing "send a file instead" hint
  (`LONG_LINK_CHARS`) covers it.
- Overlaps (files only): `list-row-stars`, `place-votes` edit `src/ui/items/places.tsx`;
  `packing-lists`, `qr-join` add routes in `src/App.tsx`.
