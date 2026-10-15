import type { Tables } from '../db/types.ts'
import type { GooglePlace } from './googleMaps.ts'

/*
 * Wire format between the app and the optional waypoints sync server (server/). Shared by both sides:
 * the server runs this file directly, so it has no runtime dependencies. Keep it backward compatible
 * both ways: phones with older versions of the app keep talking to newer servers, and the other way
 * round. Add optional fields and new endpoints rather than changing existing ones.
 *
 * Model: the server has members (people), each with their own devices (one token per phone).
 * Members who joined with the server code are admins: only they invite new people. A trip on the
 * server can be seen and changed only by the members linked to its travellers (`Traveller.memberId`),
 * which the server checks on every request. That link merges on its own clock (`linkedAt`), apart
 * from the rest of the traveller, on both sides (see withNewerLink in ./sync.ts).
 */

export const PROTOCOL_VERSION = 1
export const SERVER_APP = 'waypoints-server'

/** Public, unauthenticated: GET /api/server */
export interface ServerHello {
  app: typeof SERVER_APP
  version: string
  protocol: number
}

export interface MemberSummary {
  id: string
  name: string
  admin: boolean
}

/**
 * POST /api/register (public). Either the server code, which only the server's admin knows, or a
 * one-time invite. With the server code: a new admin member named `name`, or, with `memberId`, a
 * new phone for that existing member (a lost phone). With an invite: a new member named `name`, or
 * a new phone for the member the invite was made for (then `name` is ignored).
 */
export interface RegisterRequest {
  serverCode?: string
  inviteCode?: string
  name?: string
  memberId?: string
  deviceLabel: string
}

/** POST /api/admin/members (public, needs the server code): who's on the server, to sign in as one of them. */
export interface AdminMembersRequest {
  serverCode: string
}

/** Response to register: this phone's credentials. The token is shown once and stored only hashed. */
export interface Credentials {
  token: string
  deviceId: string
  member: MemberSummary
}

/** GET /api/me */
export interface MeResponse extends ServerHello {
  member: MemberSummary
  deviceId: string
}

/**
 * POST /api/invites. Without `memberId`: an invite for someone new (admins only). With it: a
 * sign-in code for another phone of that member (your own, or anyone's for an admin).
 */
export interface InviteRequest {
  memberId?: string
}

export interface InviteResponse {
  code: string
  expiresAt: string
  /** Set for a sign-in code: whose phone it adds. */
  memberName?: string
}

/** GET /api/devices: this member's phones. */
export interface DeviceSummary {
  id: string
  label: string
  createdAt: string
  lastSeenAt?: string
  current: boolean
}

/** POST /api/devices/remove */
export interface RemoveDeviceRequest {
  deviceId: string
}

/** POST /api/members/remove (admins only): revokes all of a member's phones. */
export interface RemoveMemberRequest {
  memberId: string
}

/** POST /api/google-maps (server 0.5.0+): the server reads a Google Maps link, since phones can't. */
export interface GoogleMapsRequest {
  url: string
}

/** A place (from a place link) or a shared list's places (from a list link). Only names, notes, addresses, coordinates and links. */
export type GoogleMapsAnswer = { kind: 'place'; place: GooglePlace } | { kind: 'list'; name: string; places: GooglePlace[] }

/** A file the server has for one of a trip's photos or documents (attachments). */
export interface FileInfo {
  /** The attachment's id. */
  id: string
  /** Whether it has the small preview too. */
  thumb?: boolean
}

/** One trip's side of a sync. */
export interface TripChanges {
  /** The trip's id, the same on every phone and on the server. */
  id: string
  /** The server's change number for this trip that the phone has pulled up to (0: nothing yet). */
  cursor: number
  /** Records by table, all of this trip (`tripId`, or the trip's own id for `trips`). */
  records: Partial<Tables>
  /**
   * Responses only, from servers that keep files: the trip's attachments whose file the server has.
   * Phones send what's missing from it and fetch what they lack, so failed transfers, a phone added
   * later or a server restored from an older copy all sort themselves out.
   */
  files?: FileInfo[]
}

/*
 * Files of photos and documents (servers from 0.2.0, which send `fileLimit`). An attachment's record
 * goes first, in a sync. Then:
 *
 *   POST /api/files?trip=<tripId>&id=<attachmentId>          the file, as the request body
 *   POST /api/files?trip=<tripId>&id=<attachmentId>&thumb=1  its preview: a JPEG, up to THUMB_MAX_BYTES
 *   GET  /api/files?trip=<tripId>&id=<attachmentId>[&thumb=1]  downloads either
 *
 * Only members on the trip can do either. The server takes a file only for a live, shared attachment
 * it has, and only if it matches the record's `size` and `sha256`; files never change after that.
 * It deletes them when the attachment is deleted.
 */
export const THUMB_MAX_BYTES = 512 * 1024

/**
 * POST /api/sync. The phone sends every trip it keeps on the server, with what changed on the phone
 * (everything, the first time). A trip the server doesn't have yet is created, if its travellers
 * include the member sending it.
 */
export interface SyncRequest {
  trips: TripChanges[]
}

export interface RejectedRecord {
  tripId: string
  table: string
  id: string
  reason: string
}

export interface SyncResponse {
  /**
   * Every trip this member is on: the records changed since the request's cursor, and the server's
   * copy of any sent record that lost the merge (so both sides converge even with clock skew). Trips
   * the phone didn't send come with all their records.
   */
  trips: TripChanges[]
  /** Trips sent that this member isn't on (any more): they stay on the phone, but stop syncing. */
  gone: string[]
  /**
   * Trips the server needs in full again, because it's behind the phone (restored from an older
   * backup). The next sync sends every record the phone has of them. When the server still has the
   * trip, `trips` brings all of its records back.
   */
  resend: string[]
  /** Records the server refused, left out of the merge. */
  rejected: RejectedRecord[]
  /** Everyone on the server, so trips can be shared with them while offline. */
  members: MemberSummary[]
  /** The largest file the server takes, in bytes. Absent: an older server, which keeps no files. */
  fileLimit?: number
}

/** Codes are shown to people: uppercase, no ambiguous characters, dashes ignored when typed. */
export const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')
