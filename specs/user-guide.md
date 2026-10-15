# User guide

Status: building
Issue: https://github.com/waypoints-pwa/waypoints/issues/34
Builds after: none

## Problem
The only description of waypoints is the README: a long, dense feature list mixed with technical
detail (IndexedDB, CSP, Docker). Someone who isn't technical, such as a friend who gets a trip
link, has no plain explanation of what the app does or how to use it. The README is also too long for
people who just want to install the app or work on the code.

## Behavior
**1. `GUIDE.md` at the repo root**: a guide in plain language, with screenshots, that covers everything
the app does. It is written for someone who has never used the app and isn't technical. It is
organized around a trip, not around the code:

1. *What waypoints is*: 2 short paragraphs (your trips on your phone, no account, works offline,
   share with the people going).
2. *Install it*: iPhone (Safari → Share → **Add to Home Screen**) and Android (Chrome → ⋮ menu →
   **Add to Home screen** / **Install app**). Why it matters: offline use, and browsers may clear
   websites' data that isn't on the Home Screen.
3. *Your first trip*: new trip form (name, dates, currency, time zone), who's going, "which traveller
   are you".
4. *Before the trip*: stays, transport and activities (booking refs to copy, addresses, phones,
   links), city and airport search and how it sets time zones, journeys deciding later bookings' time
   zone, address suggestions and the optional online address search, photos and documents on a
   booking (whole-booking documents, "only on this phone"), places to see (grouped by city,
   must-see, been there, add to plan, maps links), calendar export (whole trip, single booking, and
   re-importing updates instead of duplicating).
5. *During the trip*: Plan tab (today, what's next, tonight's stay and directions), Bookings view,
   expenses (any currency, split equally or exact amounts, cash or card), exchanges and cash rates,
   "cost pending" card payments, cash left, balances and settling up (in full or in part), Photos tab.
6. *After the trip*: reviews (stars, notes, "Didn't go", the list to review), trip report (full and
   shareable version, print / PDF / file, one report for everyone on a sync server).
7. *Sharing with your group*: the 🔗 link (what it carries, merging, the reminder dot, long links →
   file, a link can't be taken back), and the sync server **as a traveller** (invite link, putting a
   trip on the server, what happens offline, leaving a trip). Running a server: one sentence linking
   to [server/README.md](server/README.md).
8. *Keeping your trips safe*: backups (export, import on another phone), safety copies, removing a
   trip from this phone, browser storage clearing.
9. *Privacy, in plain words*: what stays on the phone, what leaves it and when.
10. *Settings at a glance*: one line per Settings card (Your name, Address search, Sync server, Backup
    & transfer, Storage, Updates / What's new, About).
11. *Questions*: at least 5 short Q&As, including: "Two of us changed the same thing, whose wins?",
    "I'm offline, does it work?", "My link got cut off in the chat", "I lost my phone",
    "How do I get updates?".

Each screenshot is a phone-sized image (`<img src="docs/guide/<name>.png" alt="…" width="300">`) next
to the step it shows. Button, tab and card names are written exactly as the app shows them, with
their icons (🗓️ Plan, 📍 Places, 💶 Money, 📷 Photos, 🧳 Trip, 🔗).

**2. Screenshots made by a script**, so they can be made again when screens change:
`npm run guide:screenshots` (with `npm run dev` running) loads a demo trip into a fresh browser at
phone size and saves the images to `docs/guide/`. The demo trip is fictional: *Japan in spring*,
three travellers (Ana, Ben, Chloé), a flight Lisbon → Tokyo, a train Tokyo → Kyoto, two stays,
activities, places in both cities, expenses in EUR and JPY (cash and card, one "cost pending"), two
cash exchanges, and reviews from all three after the trip.

**3. A shorter README.** In this order:
1. Title and a one-sentence description.
2. **Get started**: the app link, one line each for iPhone and Android install, and
   "**New here? Read the [user guide](GUIDE.md)**", all before any other section.
3. **What it does**: at most 6 one-line bullets, each linking to its guide section. No long feature list.
4. **Privacy**: at most 5 lines, the technical facts (stored in IndexedDB; no requests without a
   sync server or online address search; CSP `connect-src`; Photon), linking to the guide's plain
   version.
5. **Sync server**: 2–3 lines linking to [server/README.md](server/README.md).
6. **Updates & security** (changelog, SECURITY.md), and the Ko-fi line, both kept as they are, only shortened.
7. **Development** (as now, plus the screenshots command) and **License** (unchanged, credits kept).

The "Sharing a trip without a server" section and the feature list move into the guide and are
removed from the README. Each fact lives in one place: user how-to in the guide, technical detail in
the README, server setup in `server/README.md`. The only repeat is the two install lines (short in
the README, in full in the guide).

**4. In-app links to the guide** (opening GitHub's rendering of `GUIDE.md` in a new tab):
- Settings → About: a paragraph `📖 How to use waypoints` (link) as the first paragraph after the
  version line.
- Welcome screen (no trips yet): a small muted line under the two buttons,
  "New here? **Read the guide**".

Example: a friend opens the app for the first time, sees the Welcome screen, taps *Read the guide*,
and reads on GitHub how to open the trip link they were sent and pick which traveller they are,
with a screenshot of that screen.

States:
- Offline: the in-app links are plain links; they fail to load in the new tab and the app is unchanged.
- The guide describes the app as on `main` when this ships. Later features update it (CLAUDE.md rule).

## Out of scope
- An in-app help page, translations, video, GIFs, or hosting the guide on GitHub Pages.
- Screenshots of the browser's own install menus (they can't be captured; text only).
- Running the screenshot script in CI, or end-to-end tests built on it.
- Changing app behavior or wording other than the two new links.
- Rewriting `server/README.md` (only linked to), or `SECURITY.md`.
- Documenting features of specs not shipped yet.

## Constraints
- No personal information in the guide, screenshots or demo trip: fictional names and bookings only
  (public repo).
- Links shown in the app live in `src/lib/links.ts` only. No CSP change (plain links).
- Playwright is a **devDependency** only; nothing new in `dependencies`, nothing fetched by the app.
- No data, Dexie, link-format, backup-format or sync changes. The demo trip goes in through the
  app's normal file import.
- User-facing change (the links): bump `version` and add a CHANGELOG entry.
- English only, like the app.

## Context for implementers
- Read first: `CHANGELOG.md` (the user-facing description of every feature, best source for the
  guide), the current `README.md` (feature list and sharing section to move), `server/README.md`
  "Run it" steps 1–3 (the traveller side of the server), `CLAUDE.md`.
- Screens and their names: `src/ui/TripLayout.tsx` (`TABS`, 🔗 share button), `src/ui/pages/`
  (one file per page; `SettingsPage.tsx` cards by `<h3>`, `TripInfoPage.tsx` = Trip tab,
  `TripsPage.tsx` `Welcome`), `src/ui/items/` (one form + detail page per kind). Copy labels from there.
- Demo trip: record shapes in `src/db/types.ts`; `buildBackup` in `src/domain/sync.ts` turns
  `Tables` (`emptyTables()` from `src/db/types.ts`) into a backup file; `parseBackup` /
  `src/domain/records.ts` validate it on import, so a wrong field fails loudly. Both modules run
  directly under Node 24 (type stripping, `.ts` imports), as `server/` does. Review ids must come from
  `reviewId` (`src/domain/reviews.ts`), the report is not needed in the file (built on the phone).
- Import path in the UI: `/open` (`src/ui/pages/OpenPage.tsx`, file `<input type="file">`), then
  `TripLinkPage.tsx` may ask "which traveller are you" (pick Ana). Photos: the hidden file input in
  `src/ui/components/Attachments.tsx` (use `setInputFiles` on it).
- Time: use Playwright's `page.clock.setFixedTime` so the trip is "now" (during-trip shots) or over
  (reviews, report). Use `colorScheme: 'light'`, viewport 390×844, `deviceScaleFactor: 2`.
- Patterns to copy: `src/ui/components/SupportLine.tsx` and the Ko-fi link in the About card (links
  with `className="link" target="_blank" rel="noreferrer"`); `src/lib/links.test.ts`.
- Not to touch: `src/db/`, `src/domain/`, `src/sync/`, `server/`, `vite.config.ts`, `.github/`.
- Decisions made (see Notes): `GUIDE.md` at root, images in `docs/guide/`, guide opened on GitHub,
  links in About and Welcome, script-made screenshots, install lines repeated once.

## Tasks
1. **Demo trip**
   - Change: create `scripts/guide/demo-trip.ts` exporting `demoBackup(): Backup` (via `buildBackup`)
     for the trip in Behavior, with fixed dates 2026-04-08 to 2026-04-15, trip currency EUR, ids
     from `crypto.randomUUID()` and timestamps from a fixed date. Add `scripts/guide/demo-trip.test.ts`
     asserting `parseBackup(JSON.stringify(demoBackup()))` succeeds and has 1 trip, 3 travellers,
     ≥2 stays, ≥2 transport, ≥3 activities, ≥4 places, ≥6 expenses, 2 exchanges, ≥6 reviews. Vitest's
     default `include` (no `include` in `vite.config.ts`) already picks up `scripts/**/*.test.ts`.
   - Depends on: none
   - Done when: `npx vitest run scripts/guide` passes and `npm test` passes.
   - Executor: sonnet

2. **Screenshot script and images**
   - Change: `npm install -D playwright`; add `"guide:screenshots": "node scripts/guide/screenshots.ts"`
     to `package.json`. Create `scripts/guide/screenshots.ts`: fails with a clear message if
     `http://localhost:5173` isn't up; new browser context per run (empty storage); imports the demo
     trip through `/open`; dismisses any What's new card or update banner; uploads 3 generated
     photos (render a coloured page with an emoji in Playwright, screenshot it as JPEG to a temp
     folder); writes these PNGs to `docs/guide/` (viewport only, not full page): `welcome`,
     `trips`, `new-trip`, `plan-today`, `bookings`, `flight`, `city-search` (typing "Kyo" in the City
     field of a new activity, list open), `places`, `money`, `expense`, `exchanges`, `photos`, `share`,
     `reviews`, `report`, `settings`. `welcome` is taken before the import. The clock is fixed at
     2026-04-11T10:00:00+09:00 for all shots except `reviews` and `report` (2026-04-20T10:00:00+01:00). Add `scripts/` to `tsconfig.node.json` `include`; if that makes `npm run typecheck`
     fail on files under `src/`, remove it again and say so in the commit message. Run it and commit
     the images.
   - Depends on: tasks 1 and 5 (so `welcome` shows the new guide link)
   - Done when: `npm run guide:screenshots` writes all 16 files, each under 400 KB; `npm run lint`
     and `npm run typecheck` pass.
   - Executor: sonnet

3. **Write GUIDE.md**
   - Change: create `GUIDE.md` with the 11 sections in Behavior, a short table of contents at the top,
     and the screenshots from task 2 where they belong (each with a descriptive `alt`). Second person,
     short sentences, no developer words.
   - Depends on: task 2
   - Done when: every item in the coverage list (Acceptance criteria) has a section or paragraph;
     every `docs/guide/*.png` is referenced; and
     `grep -niwE "indexeddb|pwa|csp|dexie|fragment|iana|tombstone|json|api|outbox" GUIDE.md`
     prints nothing.
   - Executor: sonnet

4. **Shorter README**
   - Change: rewrite `README.md` to the 7 parts in Behavior. Keep every link and credit currently in
     the License section, the Ko-fi link and the Development commands; add
     `npm run guide:screenshots` to Development with one line on when to run it.
   - Depends on: task 3
   - Done when: `wc -w README.md` is at most 650 (now 1318); no `## Features` or
     `## Sharing a trip without a server` heading; the app URL, both install lines and the
     `GUIDE.md` link come before the second `##` heading.
   - Executor: sonnet

5. **Links to the guide in the app**
   - Change: add `guide: 'https://github.com/waypoints-pwa/waypoints/blob/main/GUIDE.md'` to `LINKS`
     in `src/lib/links.ts` and assert it in `src/lib/links.test.ts`. In `SettingsPage.tsx` About card,
     add `<p className="muted small">📖 <a className="link" href={LINKS.guide} target="_blank"
     rel="noreferrer">How to use waypoints</a></p>` right after the version paragraph. In `TripsPage.tsx`
     `Welcome`, add `<p className="muted small">New here? <a …>Read the guide</a></p>` after the
     second button.
   - Depends on: none
   - Done when: `npm test`, `npm run typecheck` and `npm run lint` pass; with `npm run dev` and no
     trips, the Welcome line shows; Settings → About shows the link; both open GitHub in a new tab.
   - Executor: sonnet

6. **Version, changelog, CLAUDE.md**
   - Change: bump `version` in `package.json` to the next patch (0.9.3, or the next free one). Top
     `CHANGELOG.md` entry: a new guide explains everything waypoints does, linked from Settings →
     About and the welcome screen. In `CLAUDE.md` "Releases & changelog", add: a user-facing change
     also updates `GUIDE.md`, and re-runs `npm run guide:screenshots` when a pictured screen changed.
   - Depends on: tasks 4 and 5
   - Done when: `npx vitest run src/domain/changelog.test.ts` passes.
   - Executor: sonnet

## Acceptance criteria
- [ ] `GUIDE.md` exists at the root, has a table of contents and the 11 sections, and covers each of:
      trips and travellers; stays, transport, activities and booking refs; city/airport search and
      time zones; address suggestions and online address search; photos and documents (whole booking,
      only on this phone); places (must-see, been there, add to plan, maps links); day-by-day plan and
      Bookings view; calendar export and re-import; expenses, splits, cash/card, cost pending;
      exchanges, cash rates and cash left; balances and settling up; reviews and the to-review list;
      trip report (full, shareable, print/PDF/file, one per trip on a server); sharing by link or file
      and merging; sync server as a traveller (invite, put a trip on it, offline, leave); backups,
      safety copies, removing a trip; privacy; Settings; What's new and updates.
- [ ] The jargon grep in task 3 prints nothing.
- [ ] 16 screenshots in `docs/guide/`, each under 400 KB, all referenced from `GUIDE.md` with alt text,
      showing only the fictional demo trip, in the light theme at phone size.
- [ ] `npm run guide:screenshots` (with `npm run dev` running) re-creates them from an empty browser.
- [ ] `README.md` is at most 650 words, starts with the app link, iPhone and Android install lines and
      the guide link before any other section, has no feature list longer than 6 one-line bullets, and
      has no section that repeats the guide (no "Sharing a trip without a server").
- [ ] No README link is lost: every URL in the old README is in the new README, `GUIDE.md` or
      `server/README.md`.
- [ ] Settings → About shows "📖 How to use waypoints"; the Welcome screen shows "New here? Read the
      guide"; both open `LINKS.guide` in a new tab, and the links test asserts its value.
- [ ] `playwright` is only in `devDependencies`; the built app makes no new request (DevTools Network tab
      on load shows none).
- [ ] Version bumped, CHANGELOG entry present, CLAUDE.md has the guide rule.

## Verification
`npm test`, `npm run lint`, `npm run typecheck`, `npm run build` all pass. `npx playwright install
chromium` once, then `npm run dev` and `npm run guide:screenshots`. Read `GUIDE.md` on the PR's GitHub
page ("Files changed" → view file) on a phone-width window: images show, the table of contents links work.

## Escalate when
- The demo trip can't be imported through `/open` without changing app code.
- A screen in the list can't be reached or captured as described.
- Something in the app behaves differently from what `CHANGELOG.md` or the old README says (the guide
  must describe the real app; report the mismatch instead of guessing).
- Any change seems needed under `src/db/`, `src/domain/`, `src/sync/`, `server/` or `vite.config.ts`.
- A check fails after two attempts.

## Open questions
(none)

## Notes
- `GUIDE.md` at the root, not an in-app page: GitHub renders it with images and needs no build step;
  an in-app page would keep the text in code. Images in `docs/guide/` so the root stays tidy.
- The app links to GitHub's rendering of the guide. It needs a connection, which is fine for reading
  a guide; hosting it on Pages would need markdown tooling for little gain.
- Screenshots come from a committed script (not taken by hand) so they can be made again when
  screens change. Playwright is a dev tool only; it may later serve the backlog's end-to-end check.
- Demo trip imported through the normal file import: it exercises the real validation and needs no
  test-only code in the app. Fixed dates plus a fixed clock make screenshots repeatable.
- Install lines repeated in README and guide on purpose: both audiences need them first.
- Ko-fi stays in the README and the app, not in the guide.
- `specs/server-trip-cleanup.md` (draft) adds a README section for `PURGE_AFTER_DAYS`. Not a
  dependency: whichever is built second puts that server setting in `server/README.md` (the README
  only links there after this spec).
- Specs still in draft, when they ship, must update `GUIDE.md` (the CLAUDE.md rule from task 6).
