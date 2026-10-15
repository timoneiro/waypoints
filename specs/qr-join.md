# QR code to join a trip in person

Status: draft
Issue: https://github.com/waypoints-pwa/waypoints/issues/21

## Problem
Sharing a trip when people are in the same room means sending a link through a chat app. A QR code
would let someone scan it from your screen.

## Behavior
- On the Share page, for a trip whose link is short enough, a **Show QR code** button opens a large
  QR code of the trip link, with "Scan with the camera app to open the trip".
- "Short enough": the link is at most 2,300 characters. Otherwise the button is replaced by "This trip
  is too big for a QR code. Use the link or the file." The link length already shown by the page is
  the same string.
- The code is generated on the phone; nothing is sent anywhere. It always reflects the current trip
  (as the link does) and is shown on a white background with a quiet zone.
- Scanning with the camera opens the trip link in the phone's browser like any link. On iPhone it
  opens in Safari rather than the Home Screen app (separate storage); the QR sheet says so in one
  line and points to the existing **Open a shared link** flow (`src/ui/pages/OpenPage.tsx`).
- Closing the sheet returns to the Share page. Showing the QR does not mark changes as sent
  (it is not a hand-off the way sharing a link is).

## Out of scope
- Scanning QR codes inside the app (the camera app does it).
- QR for the sync server's invites (belongs to the server's own page).
- Splitting a big trip across several codes.

## Constraints
- No network, no service, no analytics. The encoder is code in the repo.
- The encoder is vendored with its licence header: Project Nayuki's MIT-licensed "QR Code generator
  library" (TypeScript, single file `qrcodegen.ts`) in `src/lib/vendor/qrcodegen.ts`, with
  `src/lib/vendor/README.md` naming the source URL, version and licence. Do not modify the library.
- Error correction level **L**, byte mode, automatic version up to 40.

## Context for implementers
- `src/ui/pages/SharePage.tsx` builds `link` with `tripLink(...)`; add the button beside it.
- Render the matrix as an inline SVG (`<rect>` per dark module, or one `<path>`) in a small component
  `src/ui/components/QrCode.tsx`; no canvas, no images.
- Link length limit constant belongs next to `LONG_LINK_CHARS` in `src/lib/tripLink.ts`.
- Styling in `src/index.css` using existing tokens; the QR itself is always black on white even in
  dark mode.
- Do not touch: link encoding, sync, records, `LINK_VERSION`.
- Decided already: vendored Nayuki encoder; level L; 2,300-char cut-off; iPhone note.

## Tasks
1. **Vendor the encoder**
   - Change: add `src/lib/vendor/qrcodegen.ts` and `README.md` (source, version, MIT licence text).
   - Depends on: none
   - Done when: `npm run typecheck` and `npm run lint` pass; lint config excludes the vendored file
     only if needed (state why in the README).
   - Executor: sonnet
2. **QR component and limit**
   - Change: `QrCode.tsx` (prop `text`, optional `label`), exported `QR_MAX_CHARS = 2300`; a test
     `QrCode.test.ts` for the pure part: matrix dimensions for a known string are the expected QR
     version size (e.g. "hello" is 21×21), and a 2,300-char string encodes without throwing.
   - Depends on: 1
   - Done when: `npm test` passes.
   - Executor: sonnet
3. **Share page integration**
   - Change: button, sheet, too-big message, iPhone note.
   - Depends on: 2
   - Done when: manual check passes; `npm run lint` clean.
   - Executor: sonnet
4. **Version and changelog**
   - Change: bump `package.json` version and add the `CHANGELOG.md` entry.
   - Depends on: 3
   - Done when: `npm test` and `npm run build` pass.
   - Executor: haiku

## Acceptance criteria
- [ ] A small trip (one place) shows a QR code that a phone camera reads and that opens the trip.
- [ ] A trip with a link over 2,300 characters shows the "too big" message, no QR.
- [ ] The QR is readable in dark mode (black on white, quiet zone).
- [ ] Showing it works offline and sends nothing over the network (check the Network tab).
- [ ] Showing it does not change the unsent-changes count.
- [ ] The vendored file is unmodified and its licence is in the repo.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- Manual: scan from a second phone; confirm the trip opens. Repeat with a large trip for the
  message.

## Escalate when
- The vendored library can't be fetched or its licence is not MIT.
- The QR doesn't scan at a size that fits a phone screen at level L.
- A CSP change would be needed.

## Open questions
- None.

## Notes
- 2,300 characters leaves headroom under the ~2,950-byte level-L capacity for URLs with long hosts.
- Marked "in person only" in the backlog: no attempt is made to make big trips fit.
