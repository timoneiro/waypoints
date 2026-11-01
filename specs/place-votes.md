# Votes on places

Status: shipped (0.16.0)
Issue: https://github.com/waypoints-pwa/waypoints/issues/20
Builds after: packing-lists (shipped in 0.14.0; it took Dexie version 6, this spec takes 7)

## Problem
A group collects places but has no light way to see which ones people actually want to see, so the
plan is decided in chat.

## Behavior
On a trip with two or more travellers (on a trip with one, none of this shows):
- Every place has an **I want to go** toggle: a 🙋 button on its row in the Places list, and a
  "🙋 I want to go" chip on the place page next to ✅ Been there. Visited places can be voted on too.
- A place's row shows "3 want to go" ("1 wants to go") in its muted line, after "⭐ Must see". The place
  page shows "3 want to go: Ana, Bo, Cy", names in the trip's traveller order. Zero shows nothing.
- Each traveller has one vote per place. Toggling off removes it.
- Only current travellers count. The votes of someone removed from the trip stay in the data but are
  not counted, named or used for sorting.
- Once any place has a vote, the Places list shows a **Most wanted first** chip with the existing
  filters. On: city groups stay, and inside each one unvisited places come first by vote count, ties in
  today's order (must-see, then name), then visited places. Off: today's order.
- If the app doesn't know which traveller this phone is (`t.me` undefined), tapping the toggle opens
  "Which one are you?" right under that row (or under the chips on the place page). Picking a name
  saves it for this phone and votes for that place.
- Voting works offline and merges: two people voting on the same place add up; the same person on
  two phones has one vote; the newest change to a person's vote wins.
- A sync server older than this version refuses votes ("update the server"); phones keep them in the
  outbox until it's updated. Links keep working.
- A failed save shows nothing, like the ✓ and ⭐ toggles beside it.

Example: in one city, Ana and Bo tap 🙋 on the castle and Cy on the market. With **Most wanted first**
on, the castle ("2 want to go") is above the market ("1 wants to go"), and places with no votes follow.

## Out of scope
- Down-votes, maybe/skip levels, comments, vote totals in the trip report.
- Voting on anything but places.
- Changes to the demo trip.

## Constraints
- A new synced table `votes`: follow `specs/new-table-checklist.md` exactly. Do not change `LINK_VERSION`.
- The id is derived (`derivedId('vote', tripId, placeId, by)`), so the same person on two phones
  ends up with one record. That recipe must never change afterwards (`CLAUDE.md`).
- Never hard-delete a vote: toggling off is a tombstone, and removing a traveller or a place leaves
  their votes as they are.

## Context for implementers
- Read `specs/new-table-checklist.md` and `CLAUDE.md` first.
- Copy the `reviews` implementation: `src/db/types.ts`, `src/domain/records.ts`, `reviewId` in
  `src/domain/reviews.ts`, `saveReview` in `src/db/actions.ts` (tombstone, revive, `markChanged`,
  skipping saves that change nothing).
- `packingItems` is the latest table added: search for it to see every place a table is listed.
- `votes` is left out of `SEGMENT` in `src/ui/items/save.ts`, like `reviews` and `packingItems`: votes
  have no page of their own.
- The server needs no code for the table: `RECORD_TABLES` is built from `LINK_TABLES`. It does need a
  new `VERSION` (`server/src/app.ts`).
- Places UI: `PlacesPage`, `PlaceRow` and `PlacePage` in `src/ui/items/places.tsx`. Filters go through
  `setFilter`, as URL params. The sort is `sort=wanted`. The picker is `WhoAreYou` in
  `src/ui/components/Reviews.tsx`. `t.travellers.length > 1` is how pages tell a group trip.
- Do not touch: Dexie versions 1–6, `LINK_VERSION`, the `src/lib/tripLink.ts` encoding, review logic,
  `scripts/guide/`.
- Decided already: one "I want to go" toggle per person and place; toggling off = tombstone; hidden on
  solo trips; sort inside city groups with visited places last; removed travellers don't count.

## Tasks
1. **Table, validation and database version**
   - Change: `Vote` (`placeId: string`, `by: string`) in `src/db/types.ts`, as `votes` in `LINK_TABLES`/
     `TableRecords`/`emptyTables`; `SPECS` entry in `src/domain/records.ts` (`tripId`, `placeId`, `by`,
     all required `isId`); `votes` on `db` and a new `db.version(7)` in `src/db/db.ts`, resetting
     `serverTrips` cursors exactly like version 6; exclude `votes` from `SEGMENT`. Extend
     `src/db/migrations.test.ts` and `src/domain/records.test.ts`. These go together: the types don't
     compile until `db` and `SEGMENT` know the table.
   - Depends on: none
   - Done when: `npm run typecheck` and `npm test` pass, with a new test accepting a valid vote and
     rejecting a missing `by` ("It contains an invalid vote."), and a migration test (a version 6
     database opens, every existing record is kept, `votes` is empty, `serverTrips` cursors reset to 0,
     the outbox is kept).
   - Executor: sonnet
2. **Domain**
   - Change: new `src/domain/votes.ts`: `voteId(tripId, placeId, by)`; `currentVotes(votes, travellers)`
     (not deleted, by a traveller in the list); `votesOf(votes, placeId)`; `rankByVotes(places, votes)`
     (a new array, unvisited before visited, then vote count high to low, otherwise keeping the given
     order); `wantLabel(count)` ("1 wants to go", "3 want to go"). `saveVote(tripId, placeId, by, want)`
     in `src/db/actions.ts`: off makes a tombstone, on revives it (no `deletedAt`, same `createdAt`),
     and a save that changes nothing writes nothing.
   - Depends on: 1
   - Done when: `npx vitest run src/domain/votes.test.ts src/db/actions.test.ts` passes, covering toggle
     on/off/on, turning off a vote that doesn't exist, two travellers, the same traveller on two phones
     (same id), a removed traveller's vote left out, a vote on a place not in the list having no
     effect, ties keeping their order, visited last, and both labels.
   - Executor: sonnet
3. **Load into the trip**
   - Change: `src/ui/tripData.ts` loads `votes` into `TripData.votes` through
     `currentVotes(votes, travellers)`, with the live travellers.
   - Depends on: 2
   - Done when: `npm run typecheck` and `npm test` pass.
   - Executor: haiku
4. **UI**
   - Change: as under Behavior. In `WhoAreYou` add optional props `hint` (replaces the small text) and
     `onPick(travellerId)` (called after `setMe`, only with a picked name); reviews pass neither and
     are unchanged. The votes hint: "So your votes are yours. Only on this phone: you can change it in
     the Trip tab." New `src/ui/components/Votes.tsx` holds the toggle, used by `PlaceRow` (`icon-btn`
     before the ✓ button, `aria-label` "I want to go to <name>", `aria-pressed`) and `PlacePage`
     (`toggle-chip`). Add a pressed style for the row button only, in `src/index.css`: other `icon-btn`s
     must not change. Sort chip: `toggle-chip`; call `rankByVotes` after the existing `.sort(...)`.
   - Depends on: 3
   - Done when: `npm run typecheck` and `npm test` pass; `npx oxlint src/ui/items/places.tsx
     src/ui/components/Reviews.tsx src/ui/components/Votes.tsx` reports nothing; `npm run smoke` passes
     (first run needs `npx playwright install chromium`; it checks the list and place page fit a small
     phone); the manual check under Verification passes.
   - Executor: sonnet
5. **Sync tests**
   - Change: in `src/domain/sync.test.ts`, votes merge (newest `updatedAt` wins, a newer tombstone
     wins and an older copy doesn't bring the vote back, different travellers' votes merge to the union)
     and go in links, in the shape of "carry packing items, in the version older apps read too": version
     1, and a link without `votes` still decodes. In `server/src/sync.test.ts`, the server accepts and
     returns a vote, and rejects an invalid one with "It contains an invalid vote."
   - Depends on: 1
   - Done when: `npm test` passes.
   - Executor: sonnet
6. **Version and changelog**
   - Change: the next minor version in `package.json` and `package-lock.json`, and in `VERSION` in
     `server/src/app.ts`; a `CHANGELOG.md` entry for app users, saying a sync server needs updating to
     that server version to share the votes.
   - Depends on: 5
   - Done when: `npm test` and `npm run build` pass, including the changelog test.
   - Executor: haiku
7. **User guide**
   - Change: in `GUIDE.md`'s `### Places to see`, a bullet on **I want to go** and **Most wanted first**,
     saying it's for trips with two or more travellers and that a sync server needs updating. The list
     row changed, so with `npm run dev` running, run `npm run guide:screenshots`, then keep only the
     new `docs/guide/places.png` (`git restore` the other pictures).
   - Depends on: 4
   - Done when: this prints nothing (every bold label is in the app):
     `sed -n '/^### Places to see/,/^### Packing/p' GUIDE.md | grep -o '\*\*[^*]*\*\*' | tr -d '*' | while read -r l; do grep -rqF "$l" src/ui || echo "MISSING $l"; done`;
     `grep -c 'Most wanted first' GUIDE.md` prints 1; `git status --short docs/guide` lists only
     `places.png`, and that picture shows the 🙋 buttons.
   - Executor: sonnet

## Acceptance criteria
- [ ] Toggling "I want to go" on and off changes the count and persists after reload.
- [ ] Two travellers voting on one place show "2 want to go", and names on the place page.
- [ ] The same traveller on two phones ends with one vote after a merge.
- [ ] A vote removed on one phone stays removed after merging with an older copy.
- [ ] Most wanted first orders each city's unvisited places by vote count, with visited places last.
- [ ] On a one-traveller trip, no toggle, count or sort chip shows.
- [ ] A removed traveller's vote is not counted or named.
- [ ] On a phone that hasn't said who it is, tapping the toggle asks, then votes.
- [ ] A database from before this version (Dexie version 6) keeps every existing trip when opened by the
      new code; a link from this version opens in an older app (it ignores `votes`).
- [ ] The server accepts votes and reports the new `VERSION`.
- [ ] `GUIDE.md` covers votes, and the changelog says a sync server needs updating.

## Verification
- `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`: all pass, no skipped tests added.
  `npm run lint` shows no new warnings.
- Manual: `npm run dev`, a trip with two travellers and places in two cities. Before saying who you are,
  tap 🙋 on a row and pick a name: it votes. Turn on Most wanted first. Share the trip link into a second
  browser profile as the other traveller, vote there, import back: the count is 2 and both names show.
  Toggle off, merge with the older copy: it stays off. Remove a traveller: their vote stops counting.

## Escalate when
- Anything would change a released Dexie version, `LINK_VERSION`, the link/backup encoding or the id
  recipe once set.
- A merge or sync test fails and two attempts to fix it haven't worked.
- The change needs files outside those named under Context for implementers and Tasks.
- The server needs changes beyond its `VERSION`.

## Open questions
- None.

## Notes
- Hidden on solo trips because voting alone tells nobody anything.
- Removed travellers are left out in `TripData`, so no page has to remember to. Their records stay.
- Votes lengthen trip links: an estimate of 150 votes (5 people, 30 places) adds about 6,000 characters,
  against the link's 300,000 limit. Tombstones stay in links too.
- `list-row-stars` also edits `PlaceRow`, but they share no data, so it isn't in `Builds after:`. Whichever
  ships second adds to the row as it finds it.
- As built:
  - App 0.16.0, server 0.7.0; the server's only non-test change is `VERSION`.
  - The row picker is `.vote-ask` (`flex-basis: 100%; order: 1`) in a wrapping row, so it sits under the whole row
    and ✓ stays on the first line. While it is open, Tab goes 🙋, picker, then back up to ✓.
  - On the place page, a phone that hasn't said who it is can show two "Which one are you?" pickers: the chip's,
    which votes, and the Reviews card's, which doesn't. Both work; raised for review in the PR.
  - **Most wanted first** shows when `t.votes` has any vote, so votes left on a deleted place keep it showing. It
    doesn't affect the sort.
  - The browser checks were throwaway scripts: the manual steps, the acceptance criteria and edge cases, and a real
    version 6 database upgraded by the new build. No real sync server was run: an older server refusing votes is untested.
