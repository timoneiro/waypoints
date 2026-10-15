# Places from Google Maps links

Status: shipped (0.10.0)
Issue: https://github.com/waypoints-pwa/waypoints/issues/43
Builds after: none

## Problem
Adding a place from Google Maps means pasting its link and then typing the name, city and address by
hand: the app can't read a `maps.app.goo.gl` link, because Google doesn't let web pages read it. A
waypoints sync server can, so phones linked to one should fill places in from the link.

## Behavior
**Who sees it.** Phones signed in to a waypoints server (`getServerConfig()` has a token), on any
trip, server trip or not. Other phones see no change.

**New place.** The form opens with a **Paste a Google Maps link** box above **Name**, with a **Fill
in** button, and the hint "In Google Maps, tap Share → Copy link." Tapping **Fill in** (or pasting into
an empty box) shows "Looking it up…", then fills:
- **Name**: Google's name, always (e.g. "Torre dos Clérigos").
- **Link**: Google's link for the place, always.
- **City**: the nearest town of the built-in list (see below), only if City is empty.
- **Address**: Google's, if it gave one; else, if **online address search** is on in Settings,
  Photon's address for the place's coordinates; only if Address is empty.
- The place's coordinates, kept on save (not shown).
Everything stays editable. The box isn't on the edit form.

**Nearest town.** The built-in city list's town that is the biggest within 10 km of the place, else
the nearest within 30 km, else none (City stays empty). Examples: Torre dos Clérigos (41.1457,
-8.6146) → Porto; a point in Belém, Lisbon (38.6970, -9.2060) → Lisbon, not a smaller suburb next
to it; the middle of the Atlantic → none.

**Messages** (under the box; nothing else on the form changes):
- Not a Google Maps link: "That's not a Google Maps link."
- A list link: "That's a list, not a place."
- Offline, or the server can't be reached: "Can't reach your waypoints server. Paste the link into
  **Link** below and type the name." (the link is copied into Link if Link is empty).
- Server older than 0.5.0: "Your waypoints server needs updating to read Google Maps links."
- Google didn't answer or answered something unreadable: "Google Maps didn't give the place's
  details. Try again later, or fill it in by hand."

**The server lookup** (`POST /api/google-maps`, for signed-in phones only). It takes the link, follows
Google's redirects, and answers with the place, or with a list's places (the list import uses that,
see `google-list-import`). Only Google Maps addresses are ever fetched. The answer keeps only names,
notes, addresses, coordinates and links: never who made a list, their photo or account.

## Out of scope
- Importing a whole shared list (spec `google-list-import`). This spec builds the server lookup for
  lists too, so the server image changes once.
- Google Takeout zip/CSV files (dropped: Takeout has only your own lists, not shared ones).
- Opening hours, ratings, photos, place types from Google.
- Showing coordinates, a map, "near me".
- Re-filling an existing place from its link; filling from the Link field when typed by hand.
- Phones without a server.

## Constraints
- **Undocumented Google addresses.** Following a link and Google's list endpoint
  (`/maps/preview/entitylist/getlist`) aren't public APIs and may change: every failure is a message,
  never a crash, and the form always works by hand.
- **No new outside service on the phone**: Google is reached only by the server. Photon is used
  only when the phone's existing **online address search** setting is on (CSP already allows it).
- **Untrusted input** both ways: the server reads Google's answer with checks and size limits; the
  app checks the server's answer again (`checkGoogleMapsAnswer`) before using it.
- **The server fetches only Google**: every URL, including each redirect, must pass
  `isGoogleMapsUrl`. This stops the endpoint being used to reach other hosts (e.g. the NAS's own
  network).
- **Data**: a place gets two optional fields, `lat` and `lng`. Older app versions keep fields they
  don't know (`CLAUDE.md`, "Mixed versions"), so no link or backup version change and no Dexie
  version. The protocol stays at `PROTOCOL_VERSION = 1`: it's a new endpoint.
- **City data**: town coordinates go in a separate file, `src/data/city-points.tsv`, loaded only by
  this feature through a plain `fetch` (`?url` import), so it's not precached and city search doesn't
  get bigger (`vite.config.ts` precaches `**/*.{js,css,html,svg,png,ico,webmanifest}` only).

## Context for implementers
- **Google's link for a place.** `https://maps.app.goo.gl/bAMnDcGU6G1qgZFU8` answers 302 to
  `https://www.google.com/maps/place/Torre+dos+Cl%C3%A9rigos/@41.1457911,-8.6168211,17z/data=!4m7!3m6!1s0xd2464e251ced649:0x425ec51327127c21!8m2!3d41.1456705!4d-8.6145977!15s…!16s%2Fg%2F120l7r57!18m1!1e1?entry=tts&…`.
  Name: the path segment after `/maps/place/` (`+` → space, then `decodeURIComponent`). Coordinates:
  `!3d<lat>!4d<lng>` (the place), else the `@<lat>,<lng>` (the map view). Place id: `!1s0x…:0x…`.
  The place's link is rebuilt as `https://www.google.com/maps/place/<name segment>/data=!4m2!3m1!1s<0x…:0x…>`
  (the form Takeout uses; it opens the place).
- **Google's link for a list.** A shared list's `https://maps.app.goo.gl/…` link answers 302 to
  `https://www.google.com/maps/@/data=!3m1!4b1!4m3!11m2!2s<LIST_ID>!3e3?entry=tts&…`; also
  `https://www.google.com/maps/placelists/list/<LIST_ID>`. The list id is `[A-Za-z0-9_-]{10,40}`.
  Its places: `GET https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m4!1s<LIST_ID>!2e1!3m1!1e1!2e2!3e2!4i500!16b1`
  (500 = most places returned). The body starts with `)]}'` and a line break, then JSON. Layout
  (checked 2026-10-15, people and ids below made up):
  ```
  [[["<LIST_ID>",1,null,1,1],4,[2,1,"https://www.google.com/maps/placelists/list/<LIST_ID>"],
    ["<owner name>","<owner photo>","<owner account id>"],   ← never read
    "Porto",                                                    ← [0][4] list name
    "",                                                         ← [0][5] list description
    null,null,
    [ [null,                                                    ← [0][8] places, each:
       [null,null,"",null,"R. das Carmelitas 144, Porto",       ←   [1][4] address ("" when none)
        [null,null,41.1469,-8.6149],                            ←   [1][5][2], [1][5][3] lat, lng
        ["964166591612806729","-6017264553893446605"],          ←   [1][6] place id, two signed 64-bit decimals
        "/g/11b6d5c1kx"],
       "Livraria Lello",                                        ←   [2] name
       "Book tickets online",                                   ←   [3] note ("" when none; see Open questions)
       null,null,null,[],[[1],["964166591612806729","-6017264553893446605"]],
       [1785070214,580487000],[1785070214,580487000],null,
       ["<owner name>","<owner photo>","<owner account id>"]]   ← never read
    , …], …]]
  ```
  The place id as hex: `0x${BigInt.asUintN(64, BigInt(s)).toString(16)}` for each half, joined by `:`
  (the example → `0xd6168681d616649:0xac7e61c4e1a1bc33`). A real 37-place list had addresses for 5.
- **Server**: `server/src/app.ts`: `routes` (signed-in, `(req, session)`) and the dispatcher at line
  ~347; `HttpError`, `BadRequest`; `VERSION = '0.4.0'` at line 26; tests in `server/src/app.test.ts`
  (`ok`, `call` helpers, `registerAdmin`). The server runs `src/domain` files directly (Node type
  stripping, `.ts` imports, no dependencies). Node's own `fetch` is available.
- **Protocol**: `src/domain/serverProtocol.ts`: add the request/answer types with a comment like the
  others.
- **App ↔ server**: `api(cfg, path, body)` in `src/sync/client.ts` (throws `SyncError` with `.status`);
  `current()` in `src/sync/account.ts` (not exported: copy its 5 lines or export it);
  `getServerConfig()` in `src/db/serverState.ts`. An old server answers `404 {"error":"Not found"}`.
- **City list**: `scripts/places-data.mjs` lines 115–153 build `cities.tsv` from GeoNames (towns have
  `lat`, `lon`); `parseCities` in `src/domain/places.ts` lines 74–93 (sorts by size after reading,
  so pair points with cities **in file order, before the sort**); `loadCities` in `src/lib/places.ts`;
  `src/domain/places.test.ts` reads the real `src/data/*.tsv`.
- **Photon**: `src/domain/addresses.ts` (`PHOTON`, `photonUrl`, `photonAddresses`);
  `searchAddressesOnline` in `src/lib/places.ts` (cache, `credentials: 'omit'`); the setting is
  `SETTINGS.addressSearch` (`src/db/db.ts` line 158). Photon's reverse lookup:
  `https://photon.komoot.io/reverse?lat=41.1456705&lon=-8.6145977&lang=en` answers the same GeoJSON
  (`name` "Clérigos Tower", `street`, `postcode`, `city` "Porto"), so `photonAddresses` reads it.
- **Place form**: `PlaceForm` in `src/ui/items/places.tsx` lines 150–208 (`useState` per field,
  `save({...})` via `useSave`; `compact({...existing, ...input})` in `saveRecord` keeps fields the form
  doesn't send, so `lat`/`lng` survive edits). `Notice` in `src/ui/components/bits.tsx`.
- **Records**: `Place` in `src/db/types.ts` line 119; checks in `src/domain/records.ts` (`places`
  at line 131; `money`, `rate` show how number checks are written).
- Do not touch: `src/domain/sync.ts`, `src/lib/tripLink.ts`, `src/db/db.ts`, `server/src/store.ts`.

## Tasks
1. **Reading Google's links and lists**
   - Change: new `src/domain/googleMaps.ts` + `googleMaps.test.ts`, no imports outside `src/domain`.
     `GooglePlace = { name; link; lat; lng; address?; note? }`. `isGoogleMapsUrl(url)`: `https:` and
     host `maps.app.goo.gl`, or `goo.gl` with path `/maps/…`, or `google.<tld>`/`www.google.<tld>`
     (`<tld>` = `com` or `co.xx`/`com.xx`/`xx`) with path `/maps…`, or `maps.google.<tld>`.
     `placeFromUrl(url): GooglePlace | null` and `listIdFromUrl(url): string | null` per Context.
     `placesFromList(body: string): { name: string; places: GooglePlace[] } | null` per the layout
     (strip `)]}'`; skip entries without a name or valid coordinates; `null` when the shape is wrong).
     Field limits: name 200 (cut), note 10,000 (cut), address 500 (cut), `-90 ≤ lat ≤ 90`,
     `-180 ≤ lng ≤ 180`; at most 1,000 places. `checkGoogleMapsAnswer(v: unknown)` validates the
     server's answer (types below) with the same limits and `isGoogleMapsUrl` on every link.
   - Test cases: the place URL above (name "Torre dos Clérigos", lat 41.1456705, lng -8.6145977, link
     `…/maps/place/Torre+dos+Cl%C3%A9rigos/data=!4m2!3m1!1s0xd2464e251ced649:0x425ec51327127c21`);
     a place URL with only `@lat,lng`; the list URL above and the `placelists/list` form → list id;
     the layout example (as a fixture string, 3 made-up places in Porto, one with an address and a
     note) → name "Porto", places with hex links; a list body with the owner fields → no owner text
     anywhere in the result (`JSON.stringify` doesn't contain it); wrong shape → `null`;
     `isGoogleMapsUrl` true for the hosts above, false for `http://maps.app.goo.gl/x`,
     `https://maps.app.goo.gl.evil.com/x`, `https://evil.com/maps`, `https://192.168.1.1/maps`,
     `https://www.google.com/search`.
   - Depends on: none
   - Done when: `npx vitest run src/domain/googleMaps.test.ts` passes.
   - Executor: sonnet
2. **Server lookup**
   - Change: types in `src/domain/serverProtocol.ts`:
     `GoogleMapsRequest = { url: string }`, `GoogleMapsAnswer = { kind: 'place'; place: GooglePlace } | { kind: 'list'; name: string; places: GooglePlace[] }`.
     New `server/src/googleMaps.ts`: `lookUp(url, fetchFn = fetch)`: refuse unless `isGoogleMapsUrl`
     (400 "That's not a Google Maps link."); follow redirects by hand (`redirect: 'manual'`), at most 5,
     each `Location` checked with `isGoogleMapsUrl` (else 400); 10 s timeout for the whole lookup;
     read at most 5 MB. Final URL with a list id → fetch the list endpoint → `placesFromList`; no
     list (empty or `null` shape) → 422 "This list isn't shared, or doesn't exist."; else
     `placeFromUrl` → place; neither → 422 "That link isn't a place or a list.". Network failure or
     timeout → 502 "Google Maps didn't answer."; unreadable answer → 502 "Google Maps answered
     something this server can't read.". Never logs URLs or answers. Route `POST /api/google-maps`
     in `routes` (signed-in). `VERSION = '0.5.0'`; `server/README.md` mentions the server now
     reaches `www.google.com` and `maps.app.goo.gl` when someone uses this.
     Tests in `server/src/app.test.ts` with a fake `fetchFn` (pass it through `createApp`'s options or
     a module setter; no real network in tests): place link via one redirect; list link; 401 without
     a token; a redirect to `https://evil.com` refused and not fetched; 6 redirects refused; a slow
     fake times out (use a short timeout option in tests).
   - Depends on: 1
   - Done when: `npm test` passes (it runs the server tests).
   - Executor: sonnet
3. **Coordinates on places**
   - Change: `lat?: number`, `lng?: number` on `Place` (`src/db/types.ts`, with a doc comment:
     "Where it is, from Google Maps. Not shown yet."); in `src/domain/records.ts` `places`:
     `lat: optional(latitude)`, `lng: optional(longitude)` with `latitude`/`longitude` checks
     (finite numbers in range). Tests in a new `src/domain/records.test.ts` calling `checkRecord('places',
     …)` (no file tests it directly yet): a place with both accepted; `lat: 91` or `lat: "41"`
     rejected (throws); a place without them still accepted.
   - Depends on: none
   - Done when: `npm test` passes.
   - Executor: sonnet
4. **Nearest town**
   - Change: `scripts/places-data.mjs` also writes `src/data/city-points.tsv`: one line per city line
     of `cities.tsv` in the same order, `lat<TAB>lon` with 2 decimals (no header). Run it
     (`node scripts/places-data.mjs`, downloads GeoNames) and commit both files, not `airports.tsv`, which it rewrites too (`cities.tsv` may
     change a little: GeoNames updates). In `src/domain/places.ts`: `City` gets `lat?`, `lon?`;
     `parseCities(text, points?)` pairs them in file order before sorting; `nearestCity(index, lat,
     lng): City | undefined` per the rule in Behavior (equirectangular distance is enough). In
     `src/lib/places.ts`: `loadCityPoints()` (a static `import url from '../data/city-points.tsv?url'` at the top of the file, then
     `fetch`, `once` like the others; a dynamic `import()` of it builds a small JS chunk that gets precached) and `cityAt(lat, lng): Promise<string | undefined>`.
     Tests in `places.test.ts` with the real files: same count of points and cities; the three
     examples in Behavior; Hue Imperial City (16.4695, 107.5774) → "Huế".
   - Depends on: none
   - Done when: `npx vitest run src/domain/places.test.ts` passes, and after `npm run build`,
     `grep -q city-points dist/sw.js && echo precached || echo ok` prints `ok`.
   - Executor: sonnet
5. **Photon reverse lookup**
   - Change: `photonReverseUrl(lat, lng)` in `src/domain/addresses.ts`
     (`https://photon.komoot.io/reverse?lat=…&lon=…&lang=en`, numbers rounded to 6 decimals). Test
     in a new `src/domain/addresses.test.ts` (none exists yet): the URL for (41.1456705,
     -8.6145977); `photonAddresses` on the reverse answer in Context gives
     "Clérigos Tower, Rua da Assunção, 4050-546 Porto".
   - Depends on: none
   - Done when: `npx vitest run src/domain/addresses` passes.
   - Executor: haiku
6. **Paste box on New place**
   - Change: new `src/sync/googleMaps.ts`: `lookUpGoogleMaps(url)` → `api(…, '/api/google-maps',
     { url })` then `checkGoogleMapsAnswer` (failure → the "didn't give the place's details"
     message); `SyncError` 404 with "Not found" → the "needs updating" message; other `SyncError`s or
     network errors → the "Can't reach" message. In `src/lib/places.ts`: `reverseAddressOnline(lat,
     lng)` like `searchAddressesOnline` (first result's `address`). In `PlaceForm`
     (`src/ui/items/places.tsx`): the box, button, hint, filling rules and messages exactly as in
     Behavior, only for new places on a phone with a server token; `lat`/`lng` kept in state and
     passed to `save`.
   - Depends on: 1, 2, 3, 4, 5
   - Done when: `npm run lint`, `npm run typecheck` clean; the manual check in Verification passes.
   - Executor: sonnet
7. **Guide**
   - Change: `GUIDE.md`: in "Places to see", a bullet: with a sync server, **Paste a Google Maps link**
     on a new place and tap **Fill in**; and a line in the sync server section that the server reads
     Google Maps links for its members. No screenshot changes (the demo has no server).
   - Depends on: 6
   - Done when: `grep -rn "Paste a Google Maps link" src/ui` and `grep -rn "Fill in" src/ui` each find
     the form.
   - Executor: sonnet
8. **Release bookkeeping**
   - Change: app version `0.10.0` (`package.json`, `package-lock.json`); `CHANGELOG.md` entry
     `## 0.10.0 — <date>`: "With a sync server, a new place fills itself in from a Google Maps link:
     paste it and tap **Fill in**. Your server needs updating to 0.5.0." Server version is task 2's.
   - Depends on: 7
   - Done when: `npm test` and `npm run build` pass.
   - Executor: haiku

## Acceptance criteria
- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass.
- [ ] With a local server, pasting `https://maps.app.goo.gl/bAMnDcGU6G1qgZFU8` into a new place fills
      Name "Torre dos Clérigos", City "Porto", and a Google link that opens the place; saved, the
      record has `lat` ≈ 41.1457, `lng` ≈ -8.6146.
- [ ] With **online address search** on, Address fills with a Porto address; off, Address stays empty.
- [ ] Pasting a shared list link (Ricardo has one to test with; not in the repo) shows "That's a list, not a
      place."; `https://example.com` shows "That's not a Google Maps link." without any request to
      example.com (server test).
- [ ] With the server stopped, the "Can't reach" message shows and the link lands in **Link**.
- [ ] Against a 0.4.0 server (a checkout of `main` before this work, `node server/src/main.ts`), the
      "needs updating" message shows.
- [ ] A phone without a server sees the New place form unchanged.
- [ ] A place with `lat`/`lng` sent by link to an older app build (0.9.4) and back keeps them.
- [ ] `dist/sw.js` doesn't list `city-points`.

## Verification
`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`: all exit 0.
Manual (task 6): run the server locally
(`DATA_DIR=./server/data FILES_DIR=./server/files node server/src/main.ts`), `npm run dev`, connect in
Settings → Sync server, open a trip, 📍 Places → **+ Place**, paste the place link from the acceptance
criteria, tap **Fill in**, save, then check the place page.

## Escalate when
- Google answers the two Context links differently from what's described (it may have changed).
- The fake-fetch seam in task 2 needs more than an optional parameter or setter in `createApp`.
- Anything seems to need a change to `sync.ts`, `tripLink.ts`, `db.ts`, `store.ts` or the protocol
  version.
- `parseCities` can't pair points with cities by file order (counts differ).
- A check fails twice after fixing.

## Open questions
(none)

## Notes
- A list place's note at `[3]` is unverified (the tested list had none) and not needed: read it when
  it's a string, else no note. Don't escalate over notes.
- Tested 2026-10-15: both links in Context answered as described with no key or sign-in; Google's
  list endpoint has no CORS header, so the phone can't call it: that's why it goes through the server.
- Google's place page builds itself with JavaScript, so a place's address isn't in what the server
  downloads; lists give one for some places only. Photon fills the gap where the phone allows it.
- Coordinates are kept although nothing shows them yet: they can only be got now, and a map view is
  parked in the backlog.
- The link saved is Google's long form, not the pasted short link: it's what lists give too, and it
  says which place it is.
- Overlaps (files only, no shared data): `list-row-stars`, `place-votes` edit
  `src/ui/items/places.tsx`; `place-votes` and `packing-lists` add Dexie versions, this spec doesn't.
- As built:
  - The test seam is an optional 4th parameter of `createApp`, `{ fetchFn, lookupTimeoutMs }`.
  - More than 5 redirects answers 400 "That's not a Google Maps link.". A non-200 list answer or a
    body over 5 MB answers 502 "Google Maps answered something this server can't read.".
  - The server stops following redirects once the address is a place or list, so a place costs one
    fetch and Google's place page is never downloaded.
  - `checkGoogleMapsAnswer` returns `null` for a bad answer. The app also shows "Google Maps didn't
    give the place's details" for the server's 422 and 502. Other errors (including the server's 400
    and a 401) still show "Can't reach", as specified; Ricardo chose to keep that.
  - A place without a `0x…:0x…` id gets the link `…/maps/place/<name>/@<lat>,<lng>,17z`.
  - `isGoogleMapsUrl` also refuses addresses with a port or a user name/password.
  - Pasting fills in at once only into an empty box; otherwise **Fill in** does it.
  - `scripts/places-data.mjs` also rewrites `airports.tsv`; the regenerated one dropped Moroni (HAH),
    so it was restored from main.
- Fixed in 0.11.1 (server 0.5.1), after "Can't reach your waypoints server" showed with the server up:
  - Google redirects EU addresses to `consent.google.com/ml?continue=…` before any Maps page that
    isn't already `/maps/place/…`. The server took that for a redirect leaving Google Maps (400), and
    the app showed 400 as "Can't reach". The server now sends `Cookie: SOCS=CAI` ("reject all") on
    every fetch, and follows a consent redirect's `continue` once (`pastConsent`); a second one is 502.
  - Links naming a place only by id (`/maps?q=…&ftid=0x…:0x…`, where Android share links lead, and
    `?cid=<n>`, read as `0x0:<n in hex>`) are read from `/maps/preview/place?…&pb=!1m1!1s<id>`
    (`placeIdFromUrl`, `placeFromDetails`: name `[6][11]`, coordinates `[6][9][2..3]`, id `[6][10]`,
    address `[6][39]`). An unknown id answers 422.
  - Replacing the choice above: the app shows the server's own message for its other 4xx answers
    (400, 401), and copies the link into **Link** on every failed lookup. Network errors, timeouts and
    other 5xx still show "Can't reach".
