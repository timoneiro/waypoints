# Stars on list rows

Status: draft
Issue: https://github.com/waypoints-pwa/waypoints/issues/23

## Problem
Reviews (0.8.0) show on item pages and in the trip report, but rows in the places list, the plan and
the bookings view give no hint of how good something was.

## Behavior
- Where an item has at least one review with stars, its row shows the average as "★ 4.3" after the
  title, the same compact style as `AverageStars` on item pages. No reviews, or only "didn't go" /
  note-only reviews: nothing shown.
- Rows covered: Places list; Plan day list (activity, check-in/out, transport entries); Bookings
  view (transport, stays, activities).
- A place in the plan is reviewed through its activities: its places-list row shows the average of
  the stars of the activities planned from it (`plannedPlaces`) combined with reviews of the place
  itself, if any, as one average over all those reviews.
- Rows do not change size on narrow screens: the figure truncates the title before wrapping.
- Nothing changes for items without reviews; no new data.

## Out of scope
- Filtering or sorting by stars on those lists (the Reviews page has it).
- Showing individual reviewers or notes on rows.

## Constraints
- Read-only: derived from `t.reviews`; no records, no migration.

## Context for implementers
- `averageStars`, `reviewsOf`, `plannedPlaces` in `src/domain/reviews.ts`; `AverageStars` in
  `src/ui/components/Reviews.tsx`.
- Rows: `EntryRow` and `BookingRow` in `src/ui/pages/PlanPage.tsx`; the place row in
  `src/ui/items/places.tsx`; `describeEntry`/`describeTarget` in `src/ui/entries.ts` map entries to
  review targets.
- Styles in `src/index.css`; reuse the `stars` classes.
- Do not touch: review logic or records.
- Decided already: average of stars only; planned-place combination rule above.

## Tasks
1. **starsFor helper**
   - Change: `starsFor(target, reviews, activities)` in `src/domain/reviews.ts` returning the
     average and count, implementing the planned-place rule.
   - Depends on: none
   - Done when: `reviews.test.ts` covers none, one, mixed stars/missed, planned place, deleted
     reviews ignored.
2. **Rows**
   - Change: render the figure in the three row types.
   - Depends on: 1
   - Done when: manual check passes; `npm run lint` clean.
3. **Version and changelog**
   - Change: bump `package.json` version, add `CHANGELOG.md` entry.
   - Depends on: 2
   - Done when: `npm test` and `npm run build` pass.

## Acceptance criteria
- [ ] A reviewed activity shows its average in the day list and the bookings view.
- [ ] A place used by an activity shows the combined average on the places list.
- [ ] Unreviewed and "didn't go"-only items show no figure.
- [ ] Rows keep one line on a 360 px wide screen with a long title.
- [ ] No database writes.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- Manual: review an activity 5★ and 3★ from two travellers and check the row says 4.

## Escalate when
- A row needs data not already in `TripData`.

## Open questions
- None.

## Notes
- The 0.8.0 changelog says a planned place is reviewed through its activities; this keeps that and
  only surfaces the result.
