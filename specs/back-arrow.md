# Back arrow goes back one screen

Status: building
Issue: https://github.com/waypoints-pwa/waypoints/issues/40
Builds after: none

## Problem
Inside a trip, the **‹** arrow at the top left always goes to the trip list. People expect it to go
back one screen: after tapping "Add an activity" on a day, the arrow should return to the Plan, not
leave the trip.

## Behavior
- **Tab pages** (Plan, Places, Money, Photos, Trip): no change. The arrow goes to the trip list, and is
  labelled "All trips" for screen readers.
- **Every other trip page** (forms for new and edited items, item pages, photo/document pages, Edit
  trip, Share, Put on the server, Reviews, Report): the arrow is labelled "Back" and goes back one
  screen, like the phone's own back button.
- **Nothing to go back to** (the page was the first one opened in this browser tab, e.g. from a link or
  a bookmark): the arrow goes to the page's tab instead, replacing the page in history, so the
  browser's back button doesn't return to it. Tab per page: stays, journeys, activities and Reviews →
  Plan; places → Places; expenses and exchanges → Money; photos and documents → Photos; Edit trip,
  Share and Put on the server → Trip; Report → Plan once the trip is over, Trip before that (as today).
- The small "← Plan", "← Places", "← Money", "← Trip" and "← Back" links under the top bar on trip
  pages are removed: the arrow does their job. Pages outside a trip keep theirs ("← Your trips" on New
  trip and Open, "← Settings" on the server and What's new pages).
- Forms keep their **Cancel** button. The arrow on a form does the same as Cancel: unsaved input is
  dropped, without asking (as Cancel does today).

Examples:
- Plan → "Add an activity" on an empty day → the new activity form → **‹** → the Plan.
- Plan → "Add an activity" → fill in, **Save** → the new activity's page (the form is replaced, as today)
  → **‹** → the Plan.
- Places → a place → "🗓️ Add to the plan" → the form → **‹** → the place's page → **‹** → Places
  → **‹** → the trip list.
- An expense link opened in a new browser tab → **‹** → the Money tab.

Offline, sync and empty states are unaffected: this only changes navigation.

## Out of scope
- Changing what Cancel, Save or Delete navigate to.
- An "unsaved changes" warning on forms.
- Restoring the scroll position after going back (it stays whatever the browser does today).
- The top bar outside a trip (trip list, Settings, Open, New trip): it has no arrow.
- Swipe-back gestures or the phone's own back button.
- The "Back" button on the "This isn't in the trip any more." page (`ItemGone`): it stays.

## Constraints
- No data, Dexie, link-format, backup or sync changes.
- User-facing: version bump, `CHANGELOG.md` entry, and `GUIDE.md` update with re-taken screenshots
  (CLAUDE.md, "Releases & changelog").
- The guide's screenshot script clicks the link named "All trips" on the Photos tab
  (`scripts/guide/screenshots.ts:101`): tab pages must keep that label.

## Context for implementers
- `src/ui/TripLayout.tsx`: the top bar. Line 64 is the arrow (`<Link className="icon-btn back" to="/"
  aria-label="All trips">‹</Link>`). `TABS` (lines 12-18) and `tabOf` (lines 21-29) map a page to its
  tab; `active` (line 58) uses `tabOf(pathname.split('/')[3], over)`. The component returns early
  (lines 42-54), so any hook (e.g. `useNavigate`) must be called before line 42.
- `src/ui/tripData.ts:177`: `tripPath(tripId, ...parts)` drops empty parts, so `tripPath('t1', '')` is
  `/trips/t1`.
- "Nothing to go back to": copy the check in `src/ui/items/attachments.tsx:30-38` (`Back`):
  `Boolean((window.history.state as { idx?: number } | null)?.idx)`. React Router's hash history
  stores `idx` (0 for the first page of the browser tab; kept across reloads). Read it in the click
  handler, not during render.
- `.icon-btn` in `src/index.css:83-100` already resets `border`, `background` and `font`, so a
  `<button type="button" className="icon-btn back">` looks the same as the link.
- In-page back links on trip pages (all from `BackLink` in `src/ui/components/bits.tsx:8`, except the
  attachment page's own `Back`):
  `src/ui/items/activities.tsx:107`, `stays.tsx:130`, `transport.tsx:131`, `places.tsx:221`,
  `expenses.tsx:653`, `attachments.tsx:30-38` (the `Back` component) and `:86` (its use),
  `src/ui/pages/MoveToServerPage.tsx:80`, `ReportPage.tsx:98`, `ReviewsPage.tsx:41`, `SharePage.tsx:57`,
  `TripFormPage.tsx:108` (only the `trip ?` branch; New trip keeps "← Your trips").
  The `back` variables in the item pages are also used by `ItemGone` and `ItemFooter`: keep them.
- Keep `BackLink` and the `.back-link` CSS: pages outside a trip still use them.
- Tests: Vitest, `environment: 'node'` (`vite.config.ts:72`), no DOM. Test pure logic only.
- Decisions already made: tab pages keep going to the trip list; in-page back links go; fresh pages
  fall back to their tab with `replace: true`.

## Tasks

1. **Pure helper for the arrow's target**
   - Change: create `src/ui/tripNav.ts`. Move `TABS` and `tabOf` there from `src/ui/TripLayout.tsx`
     (export both; `TripLayout.tsx` imports them; no other change to it). Add
     `export function topBarBack(pathname: string, over: boolean): { to: '/' } | { fallback: string }`.
     Split `pathname` on `/`: the trip id is part 2, the rest is parts 3+ with empty parts dropped. If
     the rest is empty, or is one part equal to a `TABS` `path` (`places`, `money`, `photos`, `trip`),
     return `{ to: '/' }`. Otherwise return
     `{ fallback: tripPath(tripId, TABS.find((t) => t.key === tabOf(rest[0], over))!.path) }`.
     Import `tripPath` from `./tripData`. Add `src/ui/tripNav.test.ts` with these cases:
     `/trips/t1`, `/trips/t1/`, `/trips/t1/places`, `/trips/t1/money`, `/trips/t1/photos`,
     `/trips/t1/trip` → `{ to: '/' }`;
     `/trips/t1/activities/new`, `/trips/t1/stays/s1`, `/trips/t1/transport/r1/edit`,
     `/trips/t1/reviews` → `{ fallback: '/trips/t1' }`;
     `/trips/t1/places/p1`, `/trips/t1/places/new` → `/trips/t1/places`;
     `/trips/t1/expenses/e1`, `/trips/t1/exchanges/new` → `/trips/t1/money`;
     `/trips/t1/files/f1` → `/trips/t1/photos`;
     `/trips/t1/share`, `/trips/t1/edit`, `/trips/t1/server` → `/trips/t1/trip`;
     `/trips/t1/report` → `/trips/t1` with `over` true, `/trips/t1/trip` with `over` false.
     If importing `./tripData` fails under Vitest (it imports the database), escalate.
   - Depends on: none
   - Done when: `npx vitest run src/ui/tripNav.test.ts` passes, and `npm run typecheck` and
     `npm run lint` pass.
   - Executor: sonnet

2. **The arrow goes back on deeper pages**
   - Change: in `src/ui/TripLayout.tsx`, call `useNavigate()` before the early returns. Compute
     `const over = tripPhase(trip, today).phase === 'past'`, use it in `active` (line 58) and in
     `const back = topBarBack(pathname, over)`. If `'to' in back`, render
     the arrow exactly as today (`Link`, `to="/"`, `aria-label="All trips"`). Otherwise render
     `<button type="button" className="icon-btn back" aria-label="Back" onClick={...}>‹</button>`;
     the click calls `navigate(-1)` when `window.history.state?.idx` is truthy (the check from
     `attachments.tsx:32`), else `navigate(back.fallback, { replace: true })`.
   - Depends on: task 1
   - Done when: `npm run typecheck`, `npm run lint` and `npm test` pass, and
     `grep -c 'aria-label="Back"' src/ui/TripLayout.tsx` prints 1.
   - Executor: sonnet

3. **Remove the in-page back links on trip pages**
   - Change: delete each in-page back link listed in *Context for implementers* (11 places in 11
     files), and the `Back` component in `src/ui/items/attachments.tsx`. In `TripFormPage.tsx`, keep
     `<BackLink to="/">Your trips</BackLink>` for a new trip only (`{!trip && ...}`). Remove imports
     left unused. Keep the `back` variables, `ItemGone`, `ItemFooter` and every other element.
   - Depends on: task 2
   - Done when: `grep -rln "BackLink" src/ui` lists exactly `src/ui/components/bits.tsx`,
     `src/ui/pages/OpenPage.tsx`, `src/ui/pages/ServerPage.tsx`, `src/ui/pages/TripFormPage.tsx`,
     `src/ui/pages/WhatsNewPage.tsx`; `grep -c "BackLink to=" src/ui/pages/TripFormPage.tsx` prints 1;
     `grep -n "function Back" src/ui/items/attachments.tsx` prints nothing; `npm run typecheck`,
     `npm run lint` and `npm test` pass.
   - Executor: sonnet

4. **Guide text and screenshots**
   - Change: in `GUIDE.md`, at the end of section "## 3. Your first trip", add one paragraph:
     "Inside a trip, **‹** at the top left goes back one screen. On the five tabs at the bottom, it
     takes you back to your trips." Then run `npm run guide:screenshots` (it builds and serves the
     app itself; if Chromium is missing, run `npx playwright install chromium` first). Commit only the
     changed images.
   - Depends on: task 3
   - Done when: `grep -c "goes back one screen" GUIDE.md` prints 1; `grep -c "‹" src/ui/TripLayout.tsx`
     is at least 1; `git diff --name-only HEAD~1 -- docs/guide` (after committing) includes
     `flight.png`, `expense.png`, `share.png`, `reviews.png` and `report.png` (each pictured a removed
     back link); opened, none of the five shows a "← Plan"/"← Money"/"← Trip" link under the top bar.
   - Executor: sonnet

5. **Release bookkeeping**
   - Change: bump `version` in `package.json` and `package-lock.json` to the next patch version (0.9.4
     if it is 0.9.3). Add at the top of `CHANGELOG.md`: `## <version> — <today's date>` and "The **‹**
     arrow at the top of a trip now goes back one screen, like your phone's back button. On the
     trip's tabs it still takes you back to your trips."
   - Depends on: task 4
   - Done when: `npx vitest run src/domain/changelog.test.ts` passes.
   - Executor: haiku

## Acceptance criteria
- [ ] `npx vitest run src/ui/tripNav.test.ts` passes with every case listed in task 1.
- [ ] On each of Plan, Places, Money, Photos and Trip, **‹** goes to the trip list.
- [ ] Plan → "Add an activity" on an empty day → **‹** shows the Plan, not the trip list.
- [ ] Plan → "Add an activity" → fill in a title → **Save** → the activity's page → **‹** shows the Plan.
- [ ] Plan → an activity → **✏️ Edit** → **‹** shows the activity's page → **‹** shows the Plan.
- [ ] Places → a place → "🗓️ Add to the plan" → **‹** shows the place's page → **‹** shows Places.
- [ ] Money → an expense → **‹** shows Money; Trip → Share → **‹** shows the Trip tab.
- [ ] Copy an expense page's address, open it in a new browser tab → **‹** shows the Money tab; the
      browser's back button then does not show the expense again.
- [ ] No "← Plan", "← Places", "← Money", "← Trip" or "← Back" link appears under the top bar on any
      trip page; New trip still shows "← Your trips".
- [ ] `npm run guide:screenshots` still finishes (it clicks "All trips" on the Photos tab).
- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass.

## Verification
- `npm test`: all suites pass, including `src/ui/tripNav.test.ts` and `src/domain/changelog.test.ts`.
- `npm run lint`, `npm run typecheck`, `npm run build`: no errors.
- Manual: `npm run dev`, open the app at phone width (360px), create or import a trip, and walk the
  acceptance criteria.

## Escalate when
- Importing `src/ui/tripData.ts` from a Vitest test fails or needs a DOM or IndexedDB.
- A trip page not listed in *Context for implementers* has an in-page back link, or a listed line
  doesn't hold one.
- `npm run guide:screenshots` fails for a reason other than a missing Chromium, or changes images other
  than ones whose screen changed in a way you can't explain.
- Any change seems needed outside the files named in the tasks.
- A check fails twice after fixing attempts.

## Open questions
- None.

## Notes
- Tab pages keep the arrow to the trip list so a trip can always be left in one tap; tabs don't add a
  "back" step between each other.
- The in-page back links are removed (not kept, not turned into "← Back") so there is one way back.
- A fresh page falls back to its tab with `replace: true`: pushing would leave the fresh page behind
  the tab in history, and the phone's back button would return to it.
- `tabOf` already holds the page-to-tab mapping (also used for the highlighted tab), so the fallback
  reuses it rather than a second table.
- No overlap with other specs: none touch `TripLayout.tsx` or the back links. The smoke test
  (`specs/smoke-test.md`) checks headings and item titles, not back links.
