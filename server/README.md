# waypoints sync server (optional)

A small self-hosted server that a trip can be put on, so everyone on the trip gets the group's changes
by themselves instead of someone sending a link after every change. The waypoints app works fully
without it, and links keep working alongside it: a group can mix people on the server with people who
only use links.

- **People, not accounts.** Whoever has the **server code** (printed in the server's log) joins as an
  **admin**. The admin invites everyone else with **one-time invite links**. Each phone gets its own
  access token, which can be disconnected on its own (a lost phone), and a **sign-in link** puts a new
  phone back in as the same person.
- **Each trip is private to its travellers.** A trip on the server can be seen and changed only by the
  people linked to its travellers. The server checks this on every request, not just the app. With
  four people on the server and a trip for two of them, the other two can't see that it exists.
- **Photos and documents too.** A trip's photos and documents reach everyone on it: the files are
  kept in `FILES_DIR`, a folder per trip. The app makes photos smaller (about 1 MB) before adding them,
  and anything someone marks "only on this phone" never comes here.
- **One trip report for everyone.** Once a trip is over, the first phone to open its report keeps it
  here, and everyone on the trip opens that same report from then on (until someone makes it again).
  It needs version 0.4.0 or later: an older server turns reports away, and they wait on the phone.
- **Nothing from outside.** No third-party services or keys, and no dependencies besides Node.
- **Your data stays with you.** The trips are in one JSON file, with a daily copy kept for 30 days,
  and the photos and documents are plain files. The copies and the files can live on another disk
  (`FILES_DIR`): back that folder up with the rest of your files.

## Run it

```yaml
# docker-compose.yml
services:
  waypoints:
    image: ghcr.io/waypoints-pwa/waypoints-server:latest
    pull_policy: always
    ports: ["8788:8788"]
    volumes:
      - ./data:/data              # trip database + server code (small)
      - /path/on/big/disk:/files  # photos and documents, daily copies of the database
    environment:
      - ALLOWED_ORIGINS=https://waypoints-pwa.github.io   # the app's origin
    restart: unless-stopped
```

On every start the server prints its **server code** in the log (it's also in `data/secrets.json`).
Keep it to yourself: it makes whoever has it an admin, able to sign in as anyone on the server.

1. **You (the admin):** in the app, Settings → Sync server → **I run the server** → server address and
   server code → your name.
2. **Everyone else:** you tap **Invite someone** and send them the link. Opening it fills in the server
   and asks for their name. Invites work once, for 7 days.
3. **Trips:** a new trip asks where it's kept (on the server, or only on the phone), and the people on
   the server are added with a tap. An existing trip goes up with Trip → **Put it on the server**. People
   who aren't on the server are added by name, as before, and get links.

Device tokens are stored only as hashes. As the server's owner you can still read the data file
(everything in the trips): trips are protected from other members, not from the server admin.

### It must be served over HTTPS

The app runs on `https://waypoints-pwa.github.io`, and browsers won't let an HTTPS page call a plain
`http://` server. Put the server behind HTTPS, for example:

- **Tailscale (tailnet only):** `tailscale serve --bg --https=13443 localhost:8788`
  → `https://<machine>.<tailnet>.ts.net:13443`. Needs HTTPS certificates enabled in the Tailscale
  admin console (DNS → HTTPS Certificates). Friends can reach it without joining your tailnet if you
  share a machine with them that proxies it.
- **Tailscale Funnel (reachable from anywhere):** `tailscale funnel --bg --https=10000 localhost:8788`.
  The server is then on the public internet, guarded by per-phone tokens (256 random bits), invite
  codes and a brake on repeated wrong codes. Only do this if you're comfortable with that.
- Any reverse proxy with a certificate (Caddy, Traefik, Nginx Proxy Manager…).

Don't move the *app* to your server: browsers keep each website's data separately, so opening
waypoints from a different address would start with no trips.

## When a phone can't reach the server

Changes are kept on the phone and sent the next time the server can be reached (the app shows how many
are waiting). Nothing else stops working: the trips are on the phone, and links still work.

## If the server is restored from an older copy

Phones notice that the server is behind them and send their whole copy of each trip again, so
nothing they had is lost.

## Configuration

| Variable | Default | |
|---|---|---|
| `PORT` | `8788` | |
| `DATA_DIR` | `/data` | The trip database (`store.json`) and the server code (`secrets.json`) |
| `FILES_DIR` | `/files` | Photos and documents in `trips/`, daily copies of the database in `backups/` |
| `MAX_FILE_MB` | `25` | The largest photo or document the server takes |
| `ALLOWED_ORIGINS` | `*` | Comma-separated origins allowed to call the API from a browser |
| `WAYPOINTS_SERVER_CODE` | generated | Use your own server code instead of the generated one |

## API

The wire format lives in [`src/domain/serverProtocol.ts`](../src/domain/serverProtocol.ts). Endpoints
marked *public* need no token; all others need `Authorization: Bearer <device token>`.

| | |
|---|---|
| `GET /api/health` · `GET /api/server` | Liveness · version and protocol (*public*) |
| `POST /api/register` | Join with the server code or an invite → this phone's token (*public*) |
| `POST /api/admin/members` | Who's on the server, with the server code (*public*) |
| `GET /api/me` · `GET /api/members` | This phone's member · everyone on the server |
| `POST /api/invites` | An invite for someone new (admins), or a sign-in link for a phone |
| `GET /api/devices` · `POST /api/devices/remove` | Your phones · disconnect one |
| `POST /api/members/remove` | Take someone off the server (admins) |
| `POST /api/sync` | Send each trip's changes, get back what changed since `cursor` (last writer wins per record), and which files the server has |
| `POST /api/files` · `GET /api/files` | A photo or document's file (or its preview), for the people on its trip, after its record has synced |

## Development

```sh
DATA_DIR=./server/data FILES_DIR=./server/files node server/src/main.ts   # Node ≥ 23.6 runs the TypeScript directly
npm test                                                                 # includes server and app↔server tests
```
