# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub:
**[Report a vulnerability](https://github.com/waypoints-pwa/waypoints/security/advisories/new)**
(the repo's *Security* tab → *Report a vulnerability*). Don't open a public issue for them.

Include what you found and how to reproduce it. waypoints is a one-person project, so replies can take
a few days.

## Supported versions

Only the latest version is supported. The app updates itself.

## How releases reach users

- The app is a static site on GitHub Pages. Its code is built from `main` by GitHub Actions, and
  installed phones pick up the new version automatically, as with any website.
- Changes reach `main` only through pull requests that pass CI (lint, type check, tests, build).
- Dependencies are kept up to date by Dependabot, also through reviewed pull requests.
- Every user-facing change is listed in [CHANGELOG.md](CHANGELOG.md) and shown in the app.

## What the app trusts

Nothing that arrives from outside the phone. Trip links and files can be crafted by anyone, so they're
validated and size-limited before anything is shown or stored, and only `http(s)` addresses ever become
clickable links. Records from a sync server go through the same checks. The Content-Security-Policy
allows only the app's own scripts and styles, and network requests only to HTTPS addresses (the sync
server's, which people type in). Without a server, the app makes none, unless someone turns on online
address search in Settings: then address fields send what's typed to Photon (photon.komoot.io), and only
plain-text fields of its answers are used.

## The optional sync server

The server ([server/](server/README.md)) checks on every request that a phone's member is on the trip
it reads or writes; the app's own checks aren't relied on. Phone tokens are 256 random bits, stored
only as hashes. Joining needs the server code (admins) or a one-time invite that expires after 7
days, and repeated wrong codes are slowed down. Records sent to it are validated with the same rules
as links. Whoever runs a server can read everything on it.
