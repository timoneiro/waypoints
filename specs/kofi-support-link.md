# Ko-fi support link

Status: building (agent-ready label on the issue)
Issue: https://github.com/waypoints-pwa/waypoints/issues/29
Builds after: none

## Problem
waypoints has no way for someone who likes it to support it, while fronds has a "Support it on Ko-fi"
link. The link should be seen, but never nag.

## Behavior
A single quiet line, worded like fronds:

> ☕ Enjoying waypoints? It's free and always will be. **Support it on Ko-fi**

"Support it on Ko-fi" is a link to `LINKS.donate` (`https://ko-fi.com/ricardoalmeida59690`) that opens in a
new tab. The rest is small, muted text (the `muted small` classes), with no button, card, icon badge or
banner.

It appears in two places:
1. **Trips list** (`TripsPage`): centered under the last element of the list (below "🔗 Open a trip link or
   file"), only when the person has at least one trip. Not on the first-run Welcome screen.
2. **Settings → About**: as the last paragraph of the About card, left-aligned like the other paragraphs
   (the same place and form fronds uses).

Example: a person with two trips opens the app, sees their trips, the "Open a trip link or file" button,
and below it the small centered line. Tapping the link opens Ko-fi in a new tab; the app is unchanged.

States:
- No trips (Welcome screen): no line there. It is still in Settings → About.
- Offline: the line shows as normal. The link just fails to load in the new tab; the app makes no request
  itself.
- Not dismissible and not remembered: no new setting, no state.

## Out of scope
- Dismiss button, "seen" flags, new settings keys, counters or timed prompts.
- Showing it on any other page (trip pages, report, shareable report, exported report file).
- Any Ko-fi widget, script or iframe, and any CSP change (it is a plain link).
- Changing the README beyond the one line below.

## Constraints
- No APIs, accounts or third parties: it is a plain `<a href>`, nothing is fetched. The CSP is untouched
  (`connect-src` does not cover link navigation).
- Links shown in the app live in `src/lib/links.ts` only.
- No data, Dexie, link-format, backup or sync changes.
- User-facing change: bump `version` and add a CHANGELOG entry (CLAUDE.md "Releases & changelog").

## Context for implementers
- Pattern to copy: fronds `C:\Repos\fronds\src\lib\links.ts` (`donate`) and the last paragraph of
  `C:\Repos\fronds\src\ui\pages\SettingsPage.tsx` (the `☕ Enjoying fronds?` paragraph).
- `src/lib/links.ts`: `LINKS` const, `as const`. Add `donate` there, same URL as fronds.
- `src/ui/pages/SettingsPage.tsx`: About card (`<h3>About</h3>`), `LINKS` already imported. Links there use
  `className="link" target="_blank" rel="noreferrer"`.
- `src/ui/pages/TripsPage.tsx`: the non-empty return renders `WhatsNewCard`, the "Your trips" header, three
  `TripGroup`s, then the "Open a trip link or file" `Link`. The empty case returns `<Welcome />` earlier, so
  placing the line in the final return already meets "only with 1+ trips".
- `src/index.css`: `.muted`, `.small`, `.link` exist. Add at most one small rule for the centered footer.
- Make one shared component `SupportLine` in `src/ui/components/SupportLine.tsx` (it holds the sentence and
  link) used by both pages, so the wording lives in one place.
- Not to touch: `src/db/`, `src/domain/`, `server/`, `vite.config.ts`.
- Decisions made: placement, show-only-with-trips, no dismiss, fronds wording (see Notes).
- `specs/server-trip-cleanup.md` also edits `TripsPage.tsx` (trip filtering). Different region, no shared
  helper; just keep the diff here to the new import and the one added element.

## Tasks
1. **Add the donate link**
   - Change: add `donate: 'https://ko-fi.com/ricardoalmeida59690'` to `LINKS` in `src/lib/links.ts`. Add
     `src/lib/links.test.ts` asserting every `LINKS` value starts with `https://` and
     `LINKS.donate === 'https://ko-fi.com/ricardoalmeida59690'`.
   - Depends on: none
   - Done when: `npx vitest run src/lib/links.test.ts` passes.
   - Executor: haiku

2. **SupportLine component and both placements**
   - Change: create `src/ui/components/SupportLine.tsx` exporting `SupportLine({ className }: { className?: string })`
     rendering `<p className={...}>☕ Enjoying waypoints? It's free and always will be.{' '}<a className="link"
     href={LINKS.donate} target="_blank" rel="noreferrer">Support it on Ko-fi</a></p>` with `muted small`
     classes. In `TripsPage.tsx`, render `<SupportLine className="support-line" />` as the last child of the
     final return (after the "Open a trip link or file" link). In `SettingsPage.tsx`, render `<SupportLine />`
     as the last paragraph in the About card. In `src/index.css` add
     `.support-line { text-align: center; margin: 8px 0 0; }`.
   - Depends on: task 1
   - Done when: `npm run typecheck && npm run lint` pass; with `npm run dev` and one trip created, the line
     shows centered under the trip list and in Settings → About, and not on the empty Welcome screen.
   - Executor: sonnet

3. **Changelog, version, README**
   - Change: bump `version` in `package.json` to the next patch (0.9.2, or the next free number if another
     spec shipped first). Add the top `CHANGELOG.md` entry `## <version> — <date>` with one sentence: a small
     "Support it on Ko-fi" link on the trips list and in Settings → About; waypoints stays free. Add one
     sentence with the Ko-fi link to the README, same wording as fronds' README (see
     `C:\Repos\fronds\README.md` near line 213).
   - Depends on: task 2
   - Done when: `npx vitest run src/domain/changelog.test.ts` passes.
   - Executor: haiku

## Acceptance criteria
- [ ] `LINKS.donate` is `https://ko-fi.com/ricardoalmeida59690` and the links test passes.
- [ ] With at least one trip, the trips list ends with a centered muted line "☕ Enjoying waypoints? It's free
      and always will be. Support it on Ko-fi", the link opening Ko-fi in a new tab.
- [ ] With no trips, the Welcome screen has no such line.
- [ ] Settings → About ends with the same line, left-aligned.
- [ ] The line is a plain link: no new network request on page load (DevTools Network tab shows none), and
      no change to the CSP in the build.
- [ ] No other page shows it (trip pages, report).
- [ ] `package.json` version bumped, CHANGELOG entry present, changelog test passes.
- [ ] The line is legible in light and dark themes and does not push the "Open a trip link or file" button or
      the trip rows around on a narrow (360px) screen.

## Verification
`npm test`, `npm run lint`, `npm run typecheck`, `npm run build` all pass. Then the manual checks in the
acceptance criteria with `npm run dev` (create a trip; clear site data for the empty case).

## Escalate when
- A new setting, storage key, or Dexie version seems needed.
- The CSP or `vite.config.ts` seems to need changing.
- The line can't be placed without moving existing elements on `TripsPage`.
- A check fails after two attempts.

## Open questions
(none)

## Notes
- Placement: trips list footer plus Settings → About. The footer is where people see it every time without
  it competing with "+ New trip" or the trip rows; About keeps parity with fronds and a place to find it
  deliberately.
- Hidden on Welcome so a first-time user isn't asked for support before using the app.
- Not dismissible: one muted line needs no state, and avoiding a settings key avoids any storage change.
- Wording copied from fronds so both apps sound the same.
- Repo is public, so a GitHub issue would be public text.
