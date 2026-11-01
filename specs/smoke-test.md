# Smoke test

Status: shipped
Issue: https://github.com/waypoints-pwa/waypoints/issues/38
Builds after: none

## Problem
Checks that need the app running in a real browser are done by hand today: that every screen opens,
that outside links open in a new tab, that the app requests nothing from other sites, that screens fit a
small phone, and that sharing a trip by link and merging it back works. Specs leave them as manual
acceptance criteria. They get skipped (the user guide was merged without them), and nothing in CI
catches a screen that crashes or a request that sneaks in.

## Behavior
**1. `npm run smoke`** builds the app exactly as GitHub Pages serves it (base `/waypoints/`), serves the build
locally, and runs Playwright tests in a fresh, phone-sized Chromium (360×780, light theme). It prints
one line per test and exits non-zero if any fails, saying what failed. Nobody has to start the app first.

**2. Guards on every page, in every test.** A test fails if, at any point:
- the page throws an uncaught error, or logs a `console.error`;
- the browser requests any `http(s)` address that isn't the local app (no other site, ever: the app
  makes no requests without a sync server or online address search, and the smoke test uses neither).

**3. Screens.** With the fictional demo trip (`scripts/guide/demo-trip.ts`) imported and the clock on day 4
of the trip, every main screen opens and:
- shows what it should (not "There's nothing here." or "This isn't in the trip any more.");
- fits 360px: no sideways scrolling;
- every link to another site has `target="_blank"` and a `rel` containing `noreferrer`.
The Welcome screen (before the import) and Settings → About show the guide links, pointing at `LINKS.guide`.

**4. Share and merge, two phones.** Two separate browsers stand in for two phones (separate storage):
1. Ana's phone imports the demo trip, picks **Ana**, taps **🔗 Share trip link** and sees **✓ Link copied**.
2. Ben's phone opens that link, taps **+ Add to my trips**, picks **Ben**.
3. Ben adds the place *Kinkaku-ji*; Ana, meanwhile, adds *Nara Park*.
4. Ben shares; Ana opens his link, sees **Update my copy**, taps it, and sees "Your copy is up to date".
   Ana's 📍 Places now has both places, and her trip list still has one *Japan in spring*.
5. Ana shares back; Ben updates and has both places. Opening the same link again says
   "Your copy already has everything in this link."

**5. CI.** The CI & deploy workflow runs `npm run smoke` on every PR and push to `main`, in the same
job as the other checks, so a failure blocks the merge and the deploy.

Example: a later spec adds a screen whose table is too wide on a small phone. The screens test fails
in the PR with "/trips/…/money is 412px wide at 360px", before anyone merges it.

States:
- Chromium not installed locally: Playwright's own message says to run `npx playwright install chromium`.
- A guard failure lists every offending error or URL, not just the first.

## Out of scope
- Fixing app bugs the smoke test finds (escalate them; see Escalate when).
- Sync server tests in the browser, photos and documents, calendar export, offline use, dark theme,
  iPhone Safari or other browsers.
- Visual comparison of screenshots.
- Changing `scripts/guide/screenshots.ts` or the demo trip's content.
- Any change to app code under `src/`.

## Constraints
- `@playwright/test` is a **devDependency** at the same version as `playwright` (1.64.1); nothing new in
  `dependencies`. No app code changes, no CSP change.
- Internal change: no version bump, no CHANGELOG entry (CLAUDE.md "Releases & changelog").
- Smoke files must not be picked up by Vitest: name them `*.e2e.ts`.
- CI: keep `permissions: contents: read`; add steps to the existing `build` job (the check `main` requires),
  no new job and no new secrets.
- Fictional data only (public repo): the demo trip and the two place names above.

## Context for implementers
- Read first: `CLAUDE.md`; `scripts/guide/screenshots.ts` (the patterns to copy: importing the demo trip
  through `/open` with `setInputFiles`, picking yourself with `getByLabel('Which one are you?')` on the
  🧳 Trip tab, `page.clock.setFixedTime`, dismissing **Got it** / **Later**); `scripts/guide/demo-trip.ts`
  (`demoBackup()` is async and returns the backup; ids are random per call, so read them from it).
- Routes: `src/App.tsx`. Not-found text: `NotFound` in `src/App.tsx`; missing item: `ItemGone` in
  `src/ui/items/common.tsx`. Outside links: `ExternalLink` in `src/ui/components/bits.tsx`.
- Sharing: `src/ui/pages/SharePage.tsx` calls `shareUrl` (`src/lib/shareSheet.ts`), which uses
  `navigator.share` if present and the clipboard otherwise. In the share test, remove `navigator.share`
  with `context.addInitScript` and grant `clipboard-read` and `clipboard-write`, then read the link with
  `navigator.clipboard.readText()` in the page. Opening a link: `src/ui/pages/TripLinkPage.tsx`
  (`LinkPreview`, `WhoAreYou`: travellers are buttons with their names).
- Adding a place: `/trips/<id>/places/new`, field **Name**, button **Save** (`ItemForm` in `src/ui/items/common.tsx`).
- Build and serve: `BASE_PATH` sets the base (`vite.config.ts`); pass it through Playwright's
  `webServer.env` (not the shell, so Git Bash path conversion doesn't apply). Base URL
  `http://localhost:4173/waypoints/`.
- Clock: `2026-04-11T10:00:00+09:00` (day 4 of the demo trip), as in the screenshot script.
- Not to touch: `src/`, `server/`, `vite.config.ts`, `scripts/guide/`, other workflows.

## Tasks
1. **Playwright setup, guards and the Welcome test**
   - Change: `npm install -D @playwright/test@1.64.1`. Add `"smoke": "playwright test"` to `package.json`.
     Create `playwright.config.ts`: `testDir: 'e2e'`, `testMatch: '**/*.e2e.ts'`, `workers: 1`,
     `retries: 0`, `forbidOnly: !!process.env.CI`, reporter `list`; `use`: `baseURL`
     `http://localhost:4173/waypoints/`, viewport 360×780, `colorScheme: 'light'`, `locale: 'en-GB'`,
     `timezoneId: 'Europe/Lisbon'`; `webServer`: command `npx vite build && npx vite preview --port 4173 --strictPort`,
     `env: { BASE_PATH: '/waypoints/' }`, `url` = the base URL, `reuseExistingServer: false`, timeout 180 s.
     Create `e2e/fixtures.ts` exporting a `test` (extended from `@playwright/test`) whose `page` and a
     `newPhone()` fixture (a second context with the same `use` options, returning its page) both attach
     the guards from Behavior 2 and fail the test at the end listing every offence; plus helpers
     `importDemoTrip(page): Promise<Backup>` (writes `await demoBackup()` to a temp file, imports it via
     `/open`, waits for the trip page, returns the backup), `pickMe(page, tripId, name)` and
     `dismissNotices(page)`. Create `e2e/welcome.e2e.ts`: a fresh phone shows the Welcome screen with
     "New here? Read the guide" linking to `LINKS.guide` (import it from `src/lib/links.ts`) with
     `target="_blank"`. Add `e2e` and `playwright.config.ts` to `tsconfig.node.json` `include`; add
     `test-results/` and `playwright-report/` to `.gitignore`.
   - Depends on: none
   - Done when: `npm run smoke` passes (1 test); `npx vitest list --filesOnly` lists the same files as
     before and none under `e2e/`; `npm test`, `npm run typecheck` and `npm run lint` pass.
   - Executor: sonnet

2. **Screens test**
   - Change: create `e2e/screens.e2e.ts`. Fix the clock, import the demo trip, pick Ana, then visit each
     route below; on each: `dismissNotices`, check the expected text is visible, check
     `document.documentElement.scrollWidth <= window.innerWidth` (failure message names the route and
     the width), and check every `a[href^="http"]` not on the app's origin has `target="_blank"` and a
     `rel` containing `noreferrer`. Routes (ids from the returned backup, `[0]` of each table):
     `/new`, `/open`, `/settings` (also: "How to use waypoints" links to `LINKS.guide`), `/server`,
     `/whats-new`; and under `/trips/<id>`: `` (Plan), `?view=bookings`, `places`, `money`, `photos`,
     `trip`, `share`, `reviews`, `report`, `edit`, `server`, `stays/<id>`, `transport/<id>`,
     `activities/<id>`, `places/<id>`, `expenses/<id>`, and `new` for `stays`, `transport`,
     `activities`, `places`, `expenses`, `exchanges`. Expected text: on item pages the record's
     title as the detail page shows it (stays and places: `name`; activities and expenses: `title`;
     transport: `` `${from} → ${to}` ``, `DetailHead` in `src/ui/items/transport.tsx`); on `/trips/<id>/server`
     with no server connected, "Connect this phone to a sync server first." (it has no heading); elsewhere a
     visible heading. On every route, "There's nothing here." and "This isn't in the trip any more."
     are absent.
   - Depends on: task 1
   - Done when: `npm run smoke` passes; the screens test visits all 27 routes (the test lists them in one array).
   - Executor: sonnet

3. **Share and merge test**
   - Change: create `e2e/share-merge.e2e.ts` doing Behavior 4 step by step with `page` as Ana and
     `newPhone()` as Ben, both with the fixed clock, `navigator.share` removed and clipboard permissions.
     Assert each visible text named in Behavior 4, both places on both phones, and exactly one
     *Japan in spring* on each trip list.
   - Depends on: task 1
   - Done when: `npm run smoke` passes, including this test.
   - Executor: sonnet

4. **Run it in CI**
   - Change: in `.github/workflows/deploy.yml`, job `build`, add two steps right before the
     `npx vite build` step: `run: npx playwright install --with-deps chromium` and `run: npm run smoke`.
     The existing build step stays last, so the deployed `dist/` is the one it makes.
   - Depends on: tasks 2 and 3
   - Done when: `git diff origin/main -- .github/workflows/deploy.yml` shows only the two added steps,
     indented like the steps around them. The CI run on the PR shows the smoke step passing; that is
     checked once the PR is open, not by the executor.
   - Executor: sonnet

5. **Docs and the rule**
   - Change: `CLAUDE.md` `## Commands`: add `npm run smoke` (built app in Chromium; first run needs
     `npx playwright install chromium`). `CLAUDE.md` "Releases & changelog", after the guide line: "A new
     screen or link to another site adds to the smoke test (`e2e/`); specs write '`npm run smoke` passes'
     for what it covers instead of manual checks." `README.md` Development block: add
     `npm run smoke         # builds the app and checks it in a real browser (Playwright)`.
     `specs/BACKLOG.md` Quality line: say the browser check exists (`npm run smoke`) with two phones,
     share and merge; calendar export is still to add.
   - Depends on: task 4
   - Done when: `grep -c "npm run smoke" CLAUDE.md README.md` prints at least 1 for each; `npm test` passes.
   - Executor: sonnet

## Acceptance criteria
- [ ] `npm run smoke` builds with base `/waypoints/`, serves it and runs 3 test files in Chromium at 360×780; no setup beyond `npx playwright install chromium`.
- [ ] Every test fails on an uncaught page error, a `console.error`, or a request to another site, listing them all.
- [ ] The screens test opens all 27 routes with the demo trip; each shows its expected text, fits 360px, and its outside links open in a new tab with `noreferrer`.
- [ ] Welcome and Settings → About guide links point at `LINKS.guide`.
- [ ] Share and merge passes on two separate browser contexts, both ways, ending with both places on both phones (exact text match) and one trip each.
- [ ] CI runs `npm run smoke` in the `build` job before the build step; the PR's run shows it passing.
- [ ] The guards really catch problems: a temporary `fetch('https://example.com')` in `src/main.tsx` makes `npm run smoke` fail naming that URL (not committed).
- [ ] `@playwright/test` only in devDependencies; Vitest doesn't pick up `e2e/`; no file under `src/` changed.
- [ ] CLAUDE.md has the command and the rule; README Development lists `npm run smoke`; BACKLOG updated.

## Verification
`npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass. `npx playwright install chromium`
once, then `npm run smoke`: 3 test files pass. Guard check by hand: add `fetch('https://example.com')` as the
last line of `src/main.tsx`, run `npm run smoke`, see it fail naming `https://example.com`, then
`git checkout src/main.tsx`. On the PR: the CI & deploy run shows the smoke step green.

## Escalate when
- A check fails on current `main` because of the app (a crash, a console error, a screen wider than
  360px, a link without `target="_blank"`, a request to another site). Report the route and the failure;
  don't change app code and don't loosen or skip the check.
- The clipboard can't be read in headless Chromium, or a link can't be opened in the second context.
- The demo trip can't be imported, or `demo-trip.ts` can't be imported by Playwright's loader.
- Any change seems needed under `src/`, `server/`, `vite.config.ts` or `scripts/guide/`.
- A check fails after two attempts, or CI needs a new secret, permission or job.

## Open questions
(none)

## Notes
- Built app, not the dev server: it's what people get, with the CSP and the service worker, and with
  the `/waypoints/` base Pages uses. Serving it from the test run itself means no "start the app first" step,
  which also makes it work in CI unchanged.
- `@playwright/test` (not plain `playwright` like the screenshot script): it gives fixtures, per-test
  failure reports and the `webServer` lifecycle. Same version so both share one browser download.
- In the `build` job, not a new job: `main` requires that check, so a failing smoke test blocks the merge
  and the deploy. Costs about 2 minutes per run (browser download). Dependabot PRs run it too.
- One phone size (360 wide, the smallest common Android); the guide's screenshots stay at 390.
- `navigator.share` is removed only inside the test browser, so the app's real clipboard path is tested
  without a share sheet; no test-only code in the app.
- Chosen with the user: CI on every PR; the extra check is share and merge (calendar export, offline and
  dark theme were offered and left out); a CLAUDE.md rule so future specs use the smoke test instead of
  manual checks.
- As built:
  - The app uses `HashRouter`, so the helpers go to `#/open` and `#/trips/<id>/trip` (review of task 2 fixed
    what task 1 had).
  - `evaluate` calls in the e2e files use string expressions, because `tsconfig.node.json` has no DOM types.
  - Vitest listed 26 files when this was built, not the 21 in the first draft: `main` had moved on.
  - Checked by the reviewer: the fetch guard check by hand, ten deliberate faults in scratch copies (each one
    caught), and the suite passing 15 of 15 with `--repeat-each=5`.
