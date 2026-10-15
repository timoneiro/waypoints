# waypoints — parked and dropped ideas

Ideas that are not specced yet. To build one, run `/spec <idea>`; it becomes `specs/<name>.md`.
Specced ideas live in their own files in this folder. Shipped features are in `CHANGELOG.md`.

## Parked

### Conflicts with "no APIs unless optional" (optional add-on only, with a working fallback)
- **Map view** of places and stays (Leaflet + OpenStreetMap). Needs network and a CSP change; caching
  tiles offline is tricky (OSM tile policy).
- **Exchange-rate fetch** (keyless ECB rates via frankfurter.dev) to suggest a card-payment rate.
  Needs a CSP `connect-src` entry.
- **Weather per day** (Open-Meteo, keyless).
- **Photon address results** near the trip by coordinates (the city list has no coordinates).

### Larger or uncertain
- Paste a booking email and pre-fill a stay/flight (plain pattern matching, no AI).
- Android share target (Web Share Target; no iPhone). Short maps.app.goo.gl links can't be resolved
  without a server: keep the link, ask for the name.
- Stays on the same booking as journeys (flight + hotel packages) sharing their documents.
- City search on the trip form, to set the trip's own time zone.
- Per-person cash rates (prefer the payer's own withdrawals).
- Private expenses (only on this phone, never in links).
- Photos & documents: download everything for offline per trip; zip of a trip's files; PDF previews
  (pdf.js); videos as documents; storage limits per trip on the server.
- Trip report: share as an image; keep a report on trips not on a server; spending per person by
  category and the trip's countries; photos in the shareable version; a gentler "made again" flow
  that shows what changed.
- Reviews: notes private to your phone; photos in a review.
- Sharing: send only what changed since the last link (risky; keep the full link as default).
- Sync server: "who changed what" history; admin view of all trips; renaming a member.
- Quality: end-to-end browser check (two phones, share and merge, calendar export) in the repo and CI;
  require a PR for every change to `main`; translations (Portuguese first?).

### Manual checks, not features
- `window.print()` in the iPhone Home Screen app (the file is the fallback).
- Opening PDFs in the iPhone Home Screen app.

## Dropped (with the reason, so they are not re-proposed)
- **Uploads only on Wi-Fi**: browsers can't tell reliably on iPhone.
- **HEIC photos on Android**: Chrome can't read them.
- **Background upload / background sync**: only possible while the app is open.
- **Local city names ("Lisboa", "München")**: GeoNames' alternate names are untagged and would double
  the list; the language-tagged file is a 200 MB download.
- **Typing a city without picking it**: a pick sets the time zone by design.
- **Half stars**: records already accept them; no UI wanted.
- **Reviewing for someone without a phone (a child)**: low value.
