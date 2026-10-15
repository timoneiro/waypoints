# Connections in the plan

Status: draft
Issue: https://github.com/waypoints-pwa/waypoints/issues/18

## Problem
Journeys on one booking (LIS → FRA → NRT) are listed as unrelated rows, with no layover time. A typo
in a booking ref silently joins unrelated journeys, and nothing says when legs don't connect.

## Behavior
On the Plan tab's **Bookings** view, a **Connections** group appears above Transport. It has one card
for every booking ref (as matched by `bookingKey`) with two or more live journeys:
- Title: the route from `route(legs)`, e.g. "LIS → FRA → NRT", and "1 stop" / "2 stops" / "Direct"
  is not shown (a card needs 2+ legs).
- One line per join: "Layover 2 h 10 min in FRA", computed from the first leg's arrival and the next
  leg's departure on the real timeline (each in its own time zone). If a time is missing the line
  says "Layover time unknown".
- A **warning** line in the existing warning style, shown on the card, when a join is suspicious:
  - the next leg leaves from a different place than the previous one reached
    ("Leg 2 leaves from MUC but leg 1 arrives in FRA"), compared with `fold` and, for flights,
    airport codes;
  - the next leg leaves before the previous one arrives;
  - a layover longer than 24 h (probably two separate trips under one ref: "Check the booking ref").
- Each leg on the card links to its journey page. The card also appears on each journey's own page
  ("Part of a connection: LIS → FRA → NRT").
- Journeys with no booking ref, or the only one with that ref, get no card and no warning.
- Day-by-day view is unchanged.

Example: LIS 08:10 → FRA 10:40 and FRA 12:50 → NRT 07:30 next day: "LIS → FRA → NRT · 1 stop",
"Layover 2 h 10 min in FRA", no warning.

## Out of scope
- Showing the connection in the day-by-day view, grouping journeys by anything but booking ref.
- Fixing or merging bookings automatically, minimum-connection-time rules per airport.
- Changing `bookingLegs`, `route` or any record.

## Constraints
- Pure presentation from existing data: no new fields, tables or migration.
- Time maths uses `zonedInstant` (`src/domain/time.ts`), never the phone's zone.

## Context for implementers
- `src/domain/bookings.ts`: `bookingKey`, `bookingLegs`, `route`, `legNoun`. Add new logic here.
- `src/domain/places.ts`: `airportCode`, `fold`.
- `src/ui/pages/PlanPage.tsx`: `Bookings` and `BookingGroup`. Journey page: `src/ui/items/transport.tsx`.
- `src/ui/attachments.ts:104` already builds a booking summary for documents: read it for how legs
  are grouped, and reuse rather than re-derive.
- Tests: `src/domain/bookings.test.ts` (exists).
- Do not touch: record shapes, sync, `src/domain/itinerary.ts`.
- Decided already: placed in Bookings view only; warnings are advisory and never block saving.

## Tasks
1. **connections()**
   - Change: in `src/domain/bookings.ts`, `connections(transports): Connection[]` returning, per
     booking key with 2+ live legs: `{ key, legs, route, stops, joins: { from, to, layoverMinutes?,
     place, warning? }[] }`.
   - Depends on: none
   - Done when: new cases in `bookings.test.ts` pass: direct pair with layover, missing time, leaves
     before arrival, different place, over 24 h, three legs, single leg (no connection), deleted leg
     ignored, ref differing only in case/spacing/hyphen (one booking).
2. **Connections group**
   - Change: render the group in `Bookings` in `PlanPage.tsx`.
   - Depends on: 1
   - Done when: manual check passes; `npm run lint` clean.
3. **Journey page note**
   - Change: show the "Part of a connection" line with warnings on `transport.tsx` detail.
   - Depends on: 1
   - Done when: manual check passes.
4. **Version and changelog**
   - Change: bump the `package.json` version and add the `CHANGELOG.md` entry.
   - Depends on: 3
   - Done when: `npm test` and `npm run build` pass.

## Acceptance criteria
- [ ] Two flights with the same ref show one card with route, stop count and layover.
- [ ] Changing the second flight's ref removes the card and the warning.
- [ ] A leg that departs from another airport shows the mismatch warning.
- [ ] A leg departing before the previous arrives shows the warning.
- [ ] Layover maths is right across time zones (arrive FRA 10:40 CEST, depart 12:50 CEST = 2 h 10).
- [ ] Journeys with no ref show no card; nothing is written to the database.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- Manual: trip with LIS→FRA and FRA→NRT on one ref, then edit to MUC→NRT, then fix the ref.

## Escalate when
- A needed value isn't derivable from existing records.
- Existing `bookings.test.ts` expectations would have to change.

## Open questions
- None.

## Notes
- Bookings view rather than the day list: the day list is already dense and entries there are
  per-event, not per-booking.
- The 24 h threshold is a heuristic; adjust in review.
