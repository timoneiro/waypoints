# Connections in the plan

Status: shipped (0.15.0)
Issue: https://github.com/waypoints-pwa/waypoints/issues/18
Builds after: none

## Problem
Journeys on one booking (LIS → FRA → NRT) are listed as unrelated rows, with no layover time. A typo
in a booking ref silently joins unrelated journeys, and nothing says when legs don't connect.

## Behavior
On the Plan tab's **Bookings** view, a **Connections** group appears above Transport, whose rows stay
as they are. The group is left out when there are no connections.

A **connection** is two or more live journeys in a row on one booking ref (as matched by `bookingKey`),
in the order `bookingLegs` gives. A gap of over 24 h between two journeys ends the connection, without a
warning: a flight there and back on one ref is normal. If either time is missing, a gap of 2 or more
calendar days ends it instead. So LIS→FRA on 10 March and FRA→LIS on 20 March show no card, and
LIS→FRA→NRT with NRT→FRA→LIS two weeks later show two cards.

Each connection has one card:
- Title: the route from `route(legs)` and the stop count: "LIS → FRA → NRT · 1 stop", "· 2 stops".
- The legs in order, each a link to its journey page, showing "from → to" and when it leaves.
- Between two legs, one line: "Layover 2h 10m in FRA" (`fmtDuration`), from the first leg's arrival to
  the next leg's departure on the real timeline, each in its own time zone. If the arrival or departure
  time is missing: "Layover time unknown". If the next leg leaves before the previous one arrives: no
  layover line, only the warning.
- Under that line, every warning that applies to this join, each in the existing warning style
  (`notice notice-warn small`). A join can show both:
  - "Leg 2 leaves from MUC but leg 1 arrives in FRA": the places differ, compared just as `route` does
    (`fold`, with airport codes for flights). The title has a comma at the same spot.
  - "Leg 2 leaves before leg 1 arrives": only when both times are known.

Each journey in a connection shows the same card on its own page, titled
"Part of a connection: LIS → FRA → NRT", right after the card with its times. Its stop count is left out.

Journeys with no booking ref, or alone in their part of a booking, get no card and no warning. The
day-by-day view is unchanged. Warnings are advisory and never block saving. It all works offline, as it
only reads the trip's journeys.

Example: LIS 08:10 → FRA 10:40 and FRA 12:50 → NRT 07:30 next day: "LIS → FRA → NRT · 1 stop",
"Layover 2h 10m in FRA", no warning.

## Out of scope
- Showing the connection in the day-by-day view, grouping journeys by anything but booking ref.
- Fixing or merging bookings automatically, minimum-connection-time rules per airport.
- Warning about a long gap or a mistyped ref on journeys over 24 h apart.
- Changing what `bookingKey`, `bookingLegs` or `route` return, or any record.

## Constraints
- Pure presentation from existing data: no new fields, tables or migration, and nothing is written.
- Time maths uses `zonedInstant` (`src/domain/time.ts`), never the phone's zone.
- `src/domain/` stays free of `src/db/` code at runtime (the server runs it directly): filter deleted
  journeys with `!r.deletedAt`, not `isLive` from `src/db/db.ts`.

## Context for implementers
- `src/domain/bookings.ts`: `bookingKey`, `bookingLegs`, `route`, `legNoun`. Add new logic here.
- `src/domain/places.ts`: `airportCode`, `fold`. `src/domain/time.ts`: `zonedInstant`, `daysBetween`.
- `transportDuration` (`src/domain/itinerary.ts`): how arrival defaults work. `arriveDate` falls back to
  `departDate`, `arriveTimeZone` to `departTimeZone`.
- `src/ui/pages/PlanPage.tsx`: `Bookings`. Journey page: `TransportPage` in `src/ui/items/transport.tsx`.
- `src/ui/format.ts`: `fmtDuration` (takes ms), `fmtDayTime`, `plural`. `tripPath`: `src/ui/tripData.ts`.
- `bookingOf` in `src/ui/attachments.ts` groups legs for documents from the same helpers. Don't change
  or reuse it: it counts deleted journeys' refs and doesn't split at gaps.
- Tests: `src/domain/bookings.test.ts` (exists), fixtures in `src/test/fixtures.ts`.
- Do not touch: record shapes, sync, `src/domain/itinerary.ts`, `src/index.css`.
- Decided already: placed in Bookings view and on journey pages only.

## Tasks
1. **connections()**
   - Change: in `src/domain/bookings.ts`, move `stop` out of `route`, unchanged, so both can use it, and
     add:
     ```ts
     export type ConnectionJoin = { layoverMinutes?: number; place: string; warnings: string[] }
     export type Connection = { key: string; legs: Transport[]; route: string; stops: number; joins: ConnectionJoin[] }
     export function connections(transports: Transport[]): Connection[]
     ```
     Leave out journeys with `deletedAt`. For each booking key, walk `bookingLegs` in pairs (prev, next).
     `layoverMinutes` is `(zonedInstant(next.departDate, next.departTime, next.departTimeZone) -
     zonedInstant(prev.arriveDate ?? prev.departDate, prev.arriveTime, prev.arriveTimeZone ??
     prev.departTimeZone)) / 60_000` when `prev.arriveTime` and `next.departTime` are set, otherwise
     undefined; it can be negative. A pair is split when `layoverMinutes > 1440`, or, with it undefined,
     when `daysBetween(prev.arriveDate ?? prev.departDate, next.departDate) >= 2`. Each unsplit run of 2+
     legs is one `Connection`: `stops` is `legs.length - 1`, `joins` has `legs.length - 1` entries, `place`
     is `stop(prev, prev.to)`, `key` is `legs[0].id`. Leg numbers in warnings count within the run; the exact texts are under
     Behavior, using `stop` for the places. Sort the result by first leg's departure.
   - Depends on: none
   - Done when: `npx vitest run src/domain/bookings.test.ts` passes, with existing tests unchanged and new
     cases for: a pair with its layover; layover across zones (arrives 10:40 `Europe/London`, leaves 12:50
     `Europe/Berlin` on 2027-03-10 = 70); missing arrival time (undefined, no warning); leaves before
     arrival (negative, its warning); different place (its warning, with airport codes); both warnings on
     one join; exactly 1440 minutes (one connection); 1441 minutes (none); there and back 10 days apart
     with no times (none); there and back with a connection each way (two, each with its own `route`);
     three legs (2 stops, 2 joins); single leg (none); no ref (none); deleted leg ignored; ref differing
     only in case, spacing or hyphen (one connection).
   - Executor: haiku
2. **Connection card and group**
   - Change: new `src/ui/components/ConnectionCard.tsx`, props `{ connection: Connection; title: string }`:
     a `section.card` with `<h3>{title}</h3>`, then the legs and joins as under Behavior, each leg in a `div.stack`. Legs link with
     `tripPath(useTrip().trip.id, 'transport', leg.id)` and class `link`, the time in `muted small`, layover
     lines `muted small`, warnings `<p className="notice notice-warn small">`. Layover text is
     `fmtDuration(layoverMinutes * 60_000)`. In `Bookings` in `PlanPage.tsx`, above the Transport group,
     when `connections(t.transports)` isn't empty: `<section>` with `<h3 className="group-title">Connections</h3>`
     and one card per connection (not `BookingGroup`, which wraps children in a `ul`), keyed on
     `legs[0].id`, titled `` `${route} · ${plural(stops, 'stop')}` ``.
   - Depends on: 1
   - Done when: `npm run typecheck` passes; `npx oxlint src/ui/components/ConnectionCard.tsx src/ui/pages/PlanPage.tsx`
     reports nothing new; `npm run smoke` passes (first run needs `npx playwright install chromium`); the
     card steps of the manual check under Verification pass.
   - Executor: sonnet
3. **Journey page card**
   - Change: in `TransportPage` in `src/ui/items/transport.tsx`, find
     `connections(t.transports).find((c) => c.legs.some((l) => l.id === r.id))`, and when there is one render
     `ConnectionCard` titled `` `Part of a connection: ${route}` `` right after the first `section.card`
     (the facts).
   - Depends on: 2
   - Done when: `npm run typecheck` passes; `npx oxlint src/ui/items/transport.tsx` reports nothing new;
     `npm run smoke` passes; the journey page steps of the manual check pass.
   - Executor: sonnet
4. **Version and changelog**
   - Change: the next minor version in `package.json` and `package-lock.json`; a `CHANGELOG.md` entry for
     app users. The server doesn't change.
   - Depends on: 3
   - Done when: `npm test` and `npm run build` pass, including the changelog test.
   - Executor: haiku
5. **User guide**
   - Change: in `GUIDE.md`, under `### Plan and Bookings` after the `bookings.png` image, a short paragraph:
     journeys on one booking reference show together under **Connections**, with the layover between them
     and a warning if they don't connect; journeys over a day apart, like a flight there and back, stay
     separate. No picture. The demo trip's journeys have different refs, so no pictured screen changes:
     don't run `guide:screenshots`.
   - Depends on: 3
   - Done when: this prints nothing (every bold label is in the app):
     `sed -n '/^### Plan and Bookings/,/^### /p' GUIDE.md | grep -o '\*\*[^*]*\*\*' | tr -d '*' | while read -r l; do grep -rqF "$l" src/ui || echo "MISSING $l"; done`,
     and `grep -c '\*\*Connections\*\*' GUIDE.md` prints 1.
   - Executor: sonnet

## Acceptance criteria
- [ ] Two flights with the same ref show one card with route, stop count and layover.
- [ ] Changing the second flight's ref removes the card and the warning.
- [ ] A leg that departs from another airport shows the mismatch warning.
- [ ] A leg departing before the previous arrives shows the warning.
- [ ] Layover maths is right: arrive FRA 10:40, depart 12:50 shows 2h 10m; across zones (arrive 10:40 London, depart 12:50 Berlin, March) gives 70 minutes.
- [ ] A flight there and back 10 days apart on one ref shows no card and no warning.
- [ ] A connection each way on one ref shows two cards.
- [ ] A journey in a connection shows the card on its page; a journey in none doesn't.
- [ ] Journeys with no ref show no card; nothing is written to the database.

## Verification
- `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke` pass. `npm run lint` shows no new warnings.
- Manual (`npm run dev`), on a trip with LIS→FRA and FRA→NRT on one ref, an hour or two apart, times and
  zones set:
  1. Bookings shows the card with the layover; both legs link to their pages; Transport still lists both.
  2. Each journey page shows "Part of a connection" with the same content.
  3. Edit the second to MUC→NRT: the mismatch warning shows. Set it back.
  4. Set its departure before the first's arrival: the warning shows and the layover line goes. Set it back.
  5. Change its ref: the card goes from Bookings and both journey pages. Set it back.
  6. Move it 10 days later: the card goes, no warning.

## Escalate when
- A needed value isn't derivable from existing records.
- Existing `bookings.test.ts` expectations would have to change.
- The card can't be laid out with existing CSS classes.
- The change needs files outside those named under Tasks.

## Open questions
- None.

## Notes
- Bookings view rather than the day list: the day list is already dense and entries there are
  per-event, not per-booking.
- Splitting at 24 h instead of warning: `src/domain/bookings.ts` treats a flight there and back on one
  ref as normal, so a warning would fire on most return tickets. A typo joining journeys days apart stays
  silent; one joining nearby journeys is still caught by the place and time warnings.
- The place check matches `route` on purpose, so title and warning always agree. A flight to
  "Frankfurt (FRA)" then a train from "Frankfurt" warns; accepted, as warnings are advisory.
- The 24 h threshold is a heuristic; adjust in review.
- As built:
  - App 0.15.0; the server is unchanged.
  - If a leg leaves before the previous one has even departed, `bookingLegs` swaps them, so the card lists
    them in departure order and warns on that order ("FRA → NRT, LIS → FRA"). It follows the rule; raised for review in the PR.
  - The browser checks were a throwaway script: the manual steps, all acceptance criteria and edge cases. The
    smoke test does not open a connection card, so no automated check covers the rendered card.
