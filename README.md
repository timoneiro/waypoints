# 📍 waypoints

A trip companion you install on your phone: the bookings, a day-by-day plan, the places you want to see
and the shared expenses of every trip, in one place. Works offline, needs **no account and no API keys**,
and connects to nothing unless you set up its optional, self-hosted sync server (or turn on online address
search).

**Use it:** https://waypoints-pwa.github.io/waypoints/ → open it on your phone → *Add to Home Screen*.

## Features

- **Trips** with the people going, the dates, the time zone and the currency you count in.
- **Stays, transport and activities**: booking references (tap to copy at the desk), addresses, phone
  numbers and booking links. Times are kept in their own time zone, so overnight flights and trips across
  time zones come out right.
- **Cities and airports as you type**, offline: every town of 15,000 people or more and every airport with
  scheduled flights come with the app. Picking one sets the time zone, and new bookings follow your
  journeys: the day after a flight to Tokyo is in Tokyo time. Address fields suggest the addresses already
  in the trip, and can also search online (OpenStreetMap, through Photon) if you turn that on in Settings.
- **Day-by-day plan**: every day of the trip with where you sleep that night. During the trip it shows
  which day you're on, what's next, and directions to tonight's stay. A *Bookings* view lists every
  reservation with its reference.
- **Places to see**, grouped by city: must-sees, a visited tick, and one tap to put a place in the plan.
  Paste a Google or Apple Maps link to open it again later.
- **Reviews**: everyone rates the activities, places, stays and journeys they did, with 1 to 5 stars and a
  note, or says they didn't go. Things show up on your list to review once they're over, and everyone's
  reviews sit side by side.
- **Trip report** once the trip is over: what it cost (by category, by day, who paid what, who still owes
  whom), the best and worst of the trip with everyone's notes, the stays and journeys, places saved but
  never visited, a photo a day and a few numbers to remember it by. Print it, save it as a PDF or a file,
  or send a shareable version without names, notes or photos. On a trip on the sync server, it's made
  once and kept there, so everyone sees the same report.
- **Shared expenses**, Splitwise-style: any currency, split equally or by exact amounts, with balances
  and the fewest payments to settle up, paid back in full or in part. Each expense says whether it was
  paid in cash or by card.
- **Exchange rates from your own money**: note a cash withdrawal or a money exchange once ("10,000 JPY for
  €62.50") and every cash expense in that currency is converted at the rate you actually got, fees
  included. Several exchanges are averaged. Card payments use what the bank charged, and can be added
  before the bank shows it: they're marked "cost pending" and estimated until then.
- **Calendar export**: one `.ics` file with the whole trip for Google or Apple Calendar, or *Add to Google
  Calendar* for a single booking. Importing an updated file updates the events instead of copying them.
- **Share with your group** through any chat app, without a server (see below), or through an optional
  [sync server](server/README.md) you host yourself, so changes reach everyone by themselves.
- **Backups**: export all trips to a file and import them on another phone. Safety copies are kept
  automatically before anything gets overwritten.

## Sharing a trip without a server

Everyone in the group keeps their own copy of the trip on their phone.

1. Tap 🔗 in a trip and send the link to your group chat. The whole trip travels inside the link, in the
   part after `#`, which browsers never send to a server.
2. Opening the link adds the trip. Each person says which traveller they are.
3. Anyone can add things (places, expenses…) and send a link back the same way. Opening it merges the
   changes into your copy, item by item: new things are added, the newest edit of each item wins, and
   deletions are passed on. Merging the same link twice changes nothing, and links can arrive in any order.

The app reminds you when you've changed things the group hasn't had yet. Trips with lots in them make long
links, which some chat apps cut short: you can send the trip as a file instead.

Anyone with a link can see everything in that trip, and a sent link can't be taken back.

## Optional sync server

For groups who'd rather not send a link after every change, waypoints has a small
[self-hosted server](server/README.md) (one Docker container, for a home NAS for example). Trips put
on it reach everyone on them by themselves, and changes made offline go up once the server can be
reached. Each trip is visible only to the people on it. Joining is by invite from whoever runs the
server. It's optional: links keep working alongside it, also for people who aren't on the server.

## Privacy & data

Everything is stored in your browser (IndexedDB) on your phone. waypoints has no server of its own (the
sync server is one you run yourself, if you want it), no accounts, no analytics and no ads. The app is a
static website. Without a sync server it makes no network requests at all, and its Content-Security-Policy
only lets it reach HTTPS addresses, for the server address you type in. The one exception is online address
search, off unless you turn it on in Settings: then what you type in an address field is sent to
[Photon](https://photon.komoot.io), komoot's free OpenStreetMap search. Searching for cities and airports
never leaves the phone. Maps, calendars and booking sites are ordinary links that open in their own apps
when you tap them.

Browsers can clear website data when space runs low (especially on iPhone), so add the app to your Home
Screen and export a backup now and then.

## Updates & security

waypoints updates itself, like any website: a new version is picked up the next time it's opened, and your
trips are never touched by an update. All the code is public here, changes reach the app only through
pull requests that pass the automated tests, and every user-facing change is in the
[changelog](CHANGELOG.md) and in the app's *What's new*. Found a security problem? Please report it
privately, as described in [SECURITY.md](SECURITY.md).

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests, the sync server's tests, app↔server tests (Vitest)
npm run lint       # oxlint
npm run typecheck
npm run build      # production build into dist/
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
