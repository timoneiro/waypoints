# 📍 waypoints

A trip companion you install on your phone: bookings, a day-by-day plan, places to see and shared expenses, with no account.

## Get started

**Use it:** https://waypoints-pwa.github.io/waypoints/

- **iPhone:** open it in Safari → Share → **Add to Home Screen**.
- **Android:** open it in Chrome → ⋮ menu → **Add to Home screen** / **Install app**.

**New here? Read the [user guide](GUIDE.md).**

## What it does

- Plan a trip with stays, transport and activities: [before the trip](GUIDE.md#4-before-the-trip).
- Follow the day-by-day plan and split expenses: [during the trip](GUIDE.md#5-during-the-trip).
- Review the trip and get a report: [after the trip](GUIDE.md#6-after-the-trip).
- Share with your group by link or file, or through a sync server: [sharing](GUIDE.md#7-sharing-with-your-group).
- Export backups and keep safety copies: [keeping your trips safe](GUIDE.md#8-keeping-your-trips-safe).
- Works offline, no account: [what waypoints is](GUIDE.md#1-what-waypoints-is).

## Privacy

Everything is stored in your browser (IndexedDB) on your phone. Without a sync server the app makes no network requests. Its Content-Security-Policy (`connect-src`) only allows HTTPS, for the server address you type in. Online address search is off by default: when on, what you type in an address field goes to [Photon](https://photon.komoot.io). Plain version: [Privacy, in plain words](GUIDE.md#9-privacy-in-plain-words).

## Sync server

An optional, self-hosted server (one Docker container) keeps trips in sync for the people on them. Setup is in [server/README.md](server/README.md); links keep working alongside it.

## Updates & security

waypoints updates itself, and updates never touch your trips. Every user-facing change is in the [changelog](CHANGELOG.md). Found a security problem? Report it privately, as described in [SECURITY.md](SECURITY.md).

Completely optional, and much appreciated: if waypoints has helped on your travels, you can
[buy me a coffee on Ko-fi ☕](https://ko-fi.com/ricardoalmeida59690).

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests, the sync server's tests, app↔server tests (Vitest)
npm run lint       # oxlint
npm run typecheck
npm run build      # production build into dist/
npm run guide:screenshots  # with `npm run dev` running: remakes docs/guide/*.png, run it when a pictured screen changes
```

Stack: React + TypeScript + Vite, Dexie (IndexedDB), vite-plugin-pwa, React Router (hash routing, so deep
links work on GitHub Pages and trip links stay in the fragment). Pushes to `main` are tested and deployed to
GitHub Pages by [.github/workflows/deploy.yml](.github/workflows/deploy.yml); the sync server's Docker image
is built by [.github/workflows/server-image.yml](.github/workflows/server-image.yml).

```
src/
  domain/   pure logic: time zones, day-by-day plan, expenses and exchange rates, calendar export,
            link and backup formats, merging, city and airport search (unit-tested)
  data/     the built-in city and airport lists (made by scripts/places-data.mjs)
  db/       Dexie schema (append-only versions), write actions, backup import/export, snapshots
  lib/      browser helpers: trip link encoding, share sheet, app updates, downloads
  sync/     sync server client: syncing, joining, invites, leaving a trip
  ui/       pages, item screens (one file per kind), components
server/     the optional sync server (Node, no dependencies; shares src/domain)
```

## License

[MIT](LICENSE). City and time zone data from [GeoNames](https://www.geonames.org)
([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)); airports from
[OurAirports](https://ourairports.com) (public domain) and [mwgg/Airports](https://github.com/mwgg/Airports)
(MIT). `node scripts/places-data.mjs` downloads them again and rebuilds `src/data/`.
