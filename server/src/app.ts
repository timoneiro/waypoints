import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { isId } from '../../src/domain/records.ts'
import {
  PROTOCOL_VERSION,
  SERVER_APP,
  THUMB_MAX_BYTES,
  type AdminMembersRequest,
  type Credentials,
  type DeviceSummary,
  type GoogleMapsRequest,
  type InviteRequest,
  type InviteResponse,
  type MeResponse,
  type MemberSummary,
  type RegisterRequest,
  type ServerHello,
} from '../../src/domain/serverProtocol.ts'
import type { Config } from './config.ts'
import { FileStore } from './files.ts'
import { lookUp, LookupError, LOOKUP_TIMEOUT_MS } from './googleMaps.ts'
import { codesMatch, hashCode, hashSecret, newCode, newId, newToken } from './secrets.ts'
import type { Device, Member, Store } from './store.ts'
import { applySync, BadRequest, memberList, memberSummary, parseSyncRequest, tripMembers } from './sync.ts'

export const VERSION = '0.5.1'
const MAX_BODY = 10 * 1024 * 1024 // a first sync uploads whole trips
const INVITE_DAYS = 7
const MAX_CODE_FAILURES = 20 // per 10 minutes, across all clients
const LAST_SEEN_RESOLUTION_MS = 60 * 60_000

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function readBody(req: IncomingMessage, max: number, tooLarge = 'Request too large'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > max) {
      reject(new HttpError(413, tooLarge))
      req.resume()
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > max) {
        reject(new HttpError(413, tooLarge))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const body = await readBody(req, MAX_BODY)
  try {
    return JSON.parse(body.toString('utf8') || 'null')
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

/** A file to send back as it is, instead of JSON. */
class FileReply {
  readonly path: string
  readonly size: number
  readonly type: string
  constructor(path: string, size: number, type: string) {
    this.path = path
    this.size = size
    this.type = type
  }
}

/** Types sent as they are; anything else goes as plain bytes (the app knows each file's type). */
const SERVED_TYPES = /^(image\/(jpeg|png|gif|webp|heic|heif|avif)|application\/pdf)$/

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined
  const t = v.trim().slice(0, max)
  return t || undefined
}

interface Session {
  member: Member
  device: Device
}

type Handler = (req: IncomingMessage, session: Session) => Promise<unknown>
type PublicHandler = (req: IncomingMessage) => Promise<unknown>

/** What tests swap out: the `fetch` that reaches Google, and how long a lookup may take. */
export interface AppOptions {
  fetchFn?: typeof fetch
  lookupTimeoutMs?: number
}

export function createApp(config: Config, store: Store, files = new FileStore(join(config.filesDir, 'trips')), options: AppOptions = {}) {
  /** Brute-force brake for the server code and invite codes. */
  let codeFailures: number[] = []
  const guardCodes = () => {
    const now = Date.now()
    codeFailures = codeFailures.filter((t) => now - t < 10 * 60_000)
    if (codeFailures.length >= MAX_CODE_FAILURES) throw new HttpError(429, 'Too many wrong codes. Try again in a few minutes.')
  }
  const codeFailed = (message: string): never => {
    codeFailures.push(Date.now())
    throw new HttpError(403, message)
  }

  const authenticate = (req: IncomingMessage): Session => {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
    if (token) {
      const hash = hashSecret(token)
      for (const member of Object.values(store.data.members)) {
        for (const device of Object.values(member.devices)) {
          if (device.tokenHash === hash) return { member, device }
        }
      }
    }
    throw new HttpError(401, 'This phone is not (or no longer) connected to this server')
  }

  const addDevice = (member: Member, label: string): Credentials => {
    const token = newToken()
    const device: Device = { id: newId(), label, tokenHash: hashSecret(token), createdAt: new Date().toISOString() }
    member.devices[device.id] = device
    return { token, deviceId: device.id, member: memberSummary(member) }
  }

  /** Names are how people pick each other for trips, so they're unique. */
  const checkNewName = (name: string | undefined, ifYou: string): string => {
    if (!name) throw new HttpError(400, 'Your name is needed')
    const taken = Object.values(store.data.members).some((m) => m.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    if (taken) throw new HttpError(409, `There's already someone called ${name} on the server. If that's you, ${ifYou}.`)
    return name
  }

  const addMember = (name: string, admin: boolean): Member => {
    const member: Member = { id: newId(), name, admin, createdAt: new Date().toISOString(), devices: {} }
    store.data.members[member.id] = member
    return member
  }

  const hello = (): ServerHello => ({ app: SERVER_APP, version: VERSION, protocol: PROTOCOL_VERSION })

  /**
   * The photo or document a file request is about. A trip the member isn't on gets the same answer
   * as one that doesn't exist, so trips stay private.
   */
  const fileTarget = (req: IncomingMessage, member: Member) => {
    const params = new URL(req.url ?? '/', 'http://x').searchParams
    const tripId = params.get('trip')
    const id = params.get('id')
    if (!isId(tripId) || !isId(id)) throw new HttpError(400, 'Which photo or document?')
    const trip = store.data.trips[tripId]
    if (!trip || !tripMembers(trip, store.data.members).has(member.id)) throw new HttpError(404, 'No such trip')
    const attachment = trip.records.attachments?.[id]?.rec
    if (!attachment || attachment.deletedAt || attachment.private) throw new HttpError(404, 'No such photo or document')
    return { tripId, id, attachment, thumb: params.get('thumb') === '1' }
  }

  const publicRoutes: Record<string, PublicHandler> = {
    'GET /api/health': async () => ({ ok: true }),
    'GET /api/server': async () => hello(),

    'POST /api/admin/members': async (req): Promise<MemberSummary[]> => {
      guardCodes()
      const b = (await readJson(req)) as Partial<AdminMembersRequest> | null
      if (typeof b?.serverCode !== 'string' || !codesMatch(b.serverCode, config.serverCode)) codeFailed('Wrong server code')
      return memberList(store.data.members)
    },

    'POST /api/register': async (req): Promise<Credentials> => {
      guardCodes()
      const b = (await readJson(req)) as Partial<RegisterRequest> | null
      const label = str(b?.deviceLabel, 60) ?? 'Phone'
      const name = str(b?.name, 60)

      if (typeof b?.serverCode === 'string') {
        if (!codesMatch(b.serverCode, config.serverCode)) codeFailed('Wrong server code')
        let member: Member | undefined
        if (b.memberId !== undefined) {
          member = typeof b.memberId === 'string' ? store.data.members[b.memberId] : undefined
          if (!member) throw new HttpError(404, "That person isn't on the server any more")
        } else {
          member = addMember(checkNewName(name, 'choose your name from the list instead'), true)
        }
        const creds = addDevice(member, label)
        await store.save()
        return creds
      }

      if (typeof b?.inviteCode !== 'string') throw new HttpError(400, 'An invite code or the server code is needed')
      const hash = hashCode(b.inviteCode)
      const invite = store.data.invites[hash]
      if (!invite) return codeFailed('That invite is not valid. Ask for a new one.')
      // Checked before using up the invite.
      const newName = invite.memberId ? undefined : checkNewName(name, 'ask the admin for a sign-in link instead')
      delete store.data.invites[hash] // single use, even if expired
      if (Date.parse(invite.expiresAt) < Date.now()) {
        await store.save()
        throw new HttpError(403, 'That invite has expired. Ask for a new one.')
      }
      let member: Member | undefined
      if (invite.memberId) {
        member = store.data.members[invite.memberId]
        if (!member) {
          await store.save()
          throw new HttpError(404, "The person that code was for isn't on the server any more")
        }
      } else {
        member = addMember(newName!, false)
      }
      const creds = addDevice(member, label)
      await store.save()
      return creds
    },
  }

  const routes: Record<string, Handler> = {
    'GET /api/me': async (_req, { member, device }): Promise<MeResponse> => ({ ...hello(), member: memberSummary(member), deviceId: device.id }),

    'GET /api/members': async () => memberList(store.data.members),

    'POST /api/sync': async (req, { member }) => {
      const { response, changed, removedFiles } = applySync(store.data, member, parseSyncRequest(await readJson(req)))
      if (changed) await store.save()
      for (const { tripId, id } of removedFiles) await files.remove(tripId, id)
      for (const trip of response.trips) trip.files = await files.list(trip.id)
      response.fileLimit = config.maxFileBytes
      return response
    },

    /** The file of a photo or document (or its preview) that the server has the record of. */
    'POST /api/files': async (req, { member }) => {
      const { tripId, id, attachment, thumb } = fileTarget(req, member)
      // Files never change once here: someone sending one again changes nothing.
      if ((await files.size(tripId, id, thumb)) !== undefined) {
        req.resume()
        return { ok: true }
      }
      if (thumb) {
        const bytes = await readBody(req, THUMB_MAX_BYTES, 'The preview is too large')
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new HttpError(400, 'A preview must be a JPEG')
        await files.write(tripId, id, true, bytes)
      } else {
        const tooLarge = `This server takes files up to ${mb(config.maxFileBytes)}`
        if ((attachment.size as number) > config.maxFileBytes) throw new HttpError(413, tooLarge)
        const bytes = await readBody(req, config.maxFileBytes, tooLarge)
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        if (bytes.length !== attachment.size || sha256 !== attachment.sha256) throw new HttpError(422, "The file isn't the one that was added")
        await files.write(tripId, id, false, bytes)
      }
      // Deleted while it was on its way.
      if (store.data.trips[tripId]?.records.attachments?.[id]?.rec.deletedAt) await files.remove(tripId, id)
      return { ok: true }
    },

    'GET /api/files': async (req, { member }) => {
      const { tripId, id, attachment, thumb } = fileTarget(req, member)
      const size = await files.size(tripId, id, thumb)
      if (size === undefined) throw new HttpError(404, "The server doesn't have that file yet")
      const type = thumb ? 'image/jpeg' : SERVED_TYPES.test(String(attachment.type)) ? String(attachment.type) : 'application/octet-stream'
      return new FileReply(files.path(tripId, id, thumb), size, type)
    },

    /** Reads a Google Maps link (a place, or a shared list), as the phone can't. Never logs links or answers. */
    'POST /api/google-maps': async (req) => {
      const b = (await readJson(req)) as Partial<GoogleMapsRequest> | null
      try {
        return await lookUp(typeof b?.url === 'string' ? b.url.trim() : '', options.fetchFn, options.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS)
      } catch (err) {
        if (err instanceof LookupError) throw new HttpError(err.status, err.message)
        throw new HttpError(502, "Google Maps answered something this server can't read.")
      }
    },

    'POST /api/invites': async (req, { member }): Promise<InviteResponse> => {
      const b = (await readJson(req)) as Partial<InviteRequest> | null
      const forId = b?.memberId
      let forMember: Member | undefined
      if (forId === undefined || forId === null) {
        if (!member.admin) throw new HttpError(403, "Only the server's admin can invite new people")
      } else {
        forMember = typeof forId === 'string' ? store.data.members[forId] : undefined
        if (!forMember) throw new HttpError(404, "That person isn't on the server")
        if (forMember.id !== member.id && !member.admin) throw new HttpError(403, "Only the server's admin can sign in someone else's phone")
      }
      const now = new Date()
      // Drop expired invites while we're here.
      for (const [h, inv] of Object.entries(store.data.invites)) if (Date.parse(inv.expiresAt) < now.getTime()) delete store.data.invites[h]
      const code = newCode()
      const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString()
      store.data.invites[hashCode(code)] = { codeHash: hashCode(code), createdAt: now.toISOString(), expiresAt, createdBy: member.id, memberId: forMember?.id }
      await store.save()
      return { code, expiresAt, memberName: forMember?.name }
    },

    'GET /api/devices': async (_req, { member, device }): Promise<DeviceSummary[]> =>
      Object.values(member.devices)
        .map((d) => ({ id: d.id, label: d.label, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt, current: d.id === device.id }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),

    /** Disconnect one of your phones (this one, to leave; another one, if it's lost). */
    'POST /api/devices/remove': async (req, { member }) => {
      const b = (await readJson(req)) as { deviceId?: unknown } | null
      if (typeof b?.deviceId !== 'string' || !member.devices[b.deviceId]) throw new HttpError(404, 'No such phone')
      delete member.devices[b.deviceId]
      await store.save()
      return { ok: true }
    },

    /** Admins: take someone off the server. Their phones stop syncing; their trips keep their travellers. */
    'POST /api/members/remove': async (req, { member }) => {
      if (!member.admin) throw new HttpError(403, "Only the server's admin can remove people")
      const b = (await readJson(req)) as { memberId?: unknown } | null
      if (typeof b?.memberId !== 'string' || !store.data.members[b.memberId]) throw new HttpError(404, "That person isn't on the server")
      if (b.memberId === member.id) throw new HttpError(400, "You can't remove yourself")
      delete store.data.members[b.memberId]
      for (const [h, inv] of Object.entries(store.data.invites)) if (inv.memberId === b.memberId) delete store.data.invites[h]
      await store.save()
      return { ok: true }
    },
  }

  const cors = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin
    if (config.allowedOrigins === '*') res.setHeader('Access-Control-Allow-Origin', '*')
    else if (origin && config.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
  }

  return createServer(async (req, res) => {
    cors(req, res)
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Access-Control-Max-Age', '86400')
      // Chrome's Private/Local Network Access preflight (public site → tailnet/LAN address).
      if (req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true')
      res.writeHead(204).end()
      return
    }

    const url = new URL(req.url ?? '/', 'http://x')
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('waypoints sync server is running. Connect from the waypoints app: Settings → Sync server.\n')
      return
    }

    const route = `${req.method} ${url.pathname}`
    try {
      let result: unknown
      if (publicRoutes[route]) {
        result = await publicRoutes[route](req)
      } else if (routes[route]) {
        const session = authenticate(req)
        const seen = Date.parse(session.device.lastSeenAt ?? '') || 0
        if (Date.now() - seen > LAST_SEEN_RESOLUTION_MS) {
          session.device.lastSeenAt = new Date().toISOString()
          void store.save()
        }
        result = await routes[route](req, session)
      } else {
        throw new HttpError(404, 'Not found')
      }
      if (result instanceof FileReply) {
        res.writeHead(200, {
          'Content-Type': result.type,
          'Content-Length': result.size,
          'Content-Disposition': 'attachment',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        })
        createReadStream(result.path)
          .on('error', () => res.destroy())
          .pipe(res)
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
    } catch (err) {
      const status = err instanceof HttpError ? err.status : err instanceof BadRequest ? 400 : 500
      if (status === 500) console.error(err)
      const message = status === 500 ? 'Internal error' : (err as Error).message
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
    }
  })
}
