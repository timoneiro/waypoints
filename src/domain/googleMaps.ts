/*
 * Reading Google Maps links and shared lists. A sync server fetches them (the phone can't: Google
 * sends no CORS header), so everything here is plain parsing of what came back. None of it is a
 * public API and Google may change it, so every reader answers `null` instead of throwing.
 *
 * What comes back is untrusted: names, notes and addresses are cut to a size, coordinates checked,
 * and who made a list (their name, photo or account) is never read at all.
 */

import type { Place } from '../db/types.ts'
import { fold } from './places.ts'

export type GooglePlace = { name: string; link: string; lat: number; lng: number; address?: string; note?: string }

const MAX_NAME = 200
const MAX_NOTE = 10_000
const MAX_ADDRESS = 500
const MAX_PLACES = 1000

const TLD = '(?:com|co\\.[a-z]{2}|com\\.[a-z]{2}|[a-z]{2})'
const GOOGLE_HOST = new RegExp(`^(?:www\\.)?google\\.${TLD}$`)
const MAPS_HOST = new RegExp(`^maps\\.google\\.${TLD}$`)

/** Only these addresses are ever fetched by the server, redirects included. */
export function isGoogleMapsUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return false
  const host = u.hostname
  if (host === 'maps.app.goo.gl') return true
  if (host === 'goo.gl') return u.pathname.startsWith('/maps/')
  if (MAPS_HOST.test(host)) return true
  return GOOGLE_HOST.test(host) && /^\/maps(?:[/@]|$)/.test(u.pathname)
}

const validLat = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= -90 && n <= 90
const validLng = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= -180 && n <= 180

const placeLink = (segment: string, id: string | undefined, lat: number, lng: number) =>
  id
    ? `https://www.google.com/maps/place/${segment}/data=!4m2!3m1!1s${id}`
    : `https://www.google.com/maps/place/${segment}/@${lat},${lng},17z`

/** A place out of the address Google's short link leads to (`/maps/place/<name>/@…/data=…`). */
export function placeFromUrl(url: string): GooglePlace | null {
  if (!isGoogleMapsUrl(url)) return null
  try {
    const path = new URL(url).pathname
    const segment = /\/maps\/place\/([^/]+)/.exec(path)?.[1]
    if (!segment) return null
    const name = decodeURIComponent(segment.replace(/\+/g, ' ')).trim().slice(0, MAX_NAME)
    if (!name) return null
    const exact = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(path)
    const view = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(path)
    const found = exact ?? view
    if (!found) return null
    const lat = Number(found[1])
    const lng = Number(found[2])
    if (!validLat(lat) || !validLng(lng)) return null
    const id = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(path)?.[1]
    return { name, link: placeLink(segment, id, lat, lng), lat, lng }
  } catch {
    return null
  }
}

const LIST_ID = /^[A-Za-z0-9_-]{10,40}$/

/** The id of a shared list, from either of the two addresses Google uses for one. */
export function listIdFromUrl(url: string): string | null {
  if (!isGoogleMapsUrl(url)) return null
  try {
    const u = new URL(url)
    const fromPath = /\/maps\/placelists\/list\/([^/?#]+)/.exec(u.pathname)?.[1]
    const found = fromPath ?? /!2s([A-Za-z0-9_-]+)!3e3/.exec(u.pathname)?.[1]
    return found && LIST_ID.test(found) ? found : null
  } catch {
    return null
  }
}

const hexHalf = (s: string) => `0x${BigInt.asUintN(64, BigInt(s)).toString(16)}`

function hexId(ids: unknown): string | undefined {
  if (!Array.isArray(ids) || ids.length < 2) return undefined
  const [a, b] = ids
  if (typeof a !== 'string' || typeof b !== 'string' || !/^-?\d{1,20}$/.test(a) || !/^-?\d{1,20}$/.test(b)) return undefined
  return `${hexHalf(a)}:${hexHalf(b)}`
}

const asArray = (v: unknown): unknown[] | undefined => (Array.isArray(v) ? v : undefined)

function placeFromEntry(entry: unknown): GooglePlace | null {
  const e = asArray(entry)
  const info = asArray(e?.[1])
  const name = e?.[2]
  if (!e || !info || typeof name !== 'string') return null
  const trimmed = name.trim().slice(0, MAX_NAME)
  const point = asArray(info[5])
  const lat = point?.[2]
  const lng = point?.[3]
  if (!trimmed || !validLat(lat) || !validLng(lng)) return null
  const segment = encodeURIComponent(trimmed).replace(/%20/g, '+')
  const place: GooglePlace = { name: trimmed, link: placeLink(segment, hexId(info[6]), lat, lng), lat, lng }
  const address = typeof info[4] === 'string' ? info[4].trim().slice(0, MAX_ADDRESS) : ''
  if (address) place.address = address
  const note = typeof e[3] === 'string' ? e[3].trim().slice(0, MAX_NOTE) : ''
  if (note) place.note = note
  return place
}

/** A shared list's name and places out of the body of Google's list address; `null` when it isn't one. */
export function placesFromList(body: string): { name: string; places: GooglePlace[] } | null {
  try {
    const data: unknown = JSON.parse(body.replace(/^\s*\)\]\}'/, ''))
    const list = asArray(asArray(data)?.[0])
    const name = list?.[4]
    const entries = asArray(list?.[8])
    if (!list || typeof name !== 'string' || !entries) return null
    const places: GooglePlace[] = []
    for (const entry of entries) {
      const place = placeFromEntry(entry)
      if (place) places.push(place)
      if (places.length >= MAX_PLACES) break
    }
    return { name: name.trim().slice(0, MAX_NAME), places }
  } catch {
    return null
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function checkPlace(v: unknown): GooglePlace | null {
  if (!isObject(v)) return null
  const { name, link, lat, lng, address, note } = v
  if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME) return null
  if (typeof link !== 'string' || !isGoogleMapsUrl(link)) return null
  if (!validLat(lat) || !validLng(lng)) return null
  const place: GooglePlace = { name, link, lat, lng }
  if (address !== undefined) {
    if (typeof address !== 'string' || address.length > MAX_ADDRESS) return null
    if (address) place.address = address
  }
  if (note !== undefined) {
    if (typeof note !== 'string' || note.length > MAX_NOTE) return null
    if (note) place.note = note
  }
  return place
}

/** The server's answer to a lookup, checked again on the phone; `null` when anything is off. */
export function checkGoogleMapsAnswer(
  v: unknown,
): { kind: 'place'; place: GooglePlace } | { kind: 'list'; name: string; places: GooglePlace[] } | null {
  if (!isObject(v)) return null
  if (v.kind === 'place') {
    const place = checkPlace(v.place)
    return place ? { kind: 'place', place } : null
  }
  if (v.kind === 'list') {
    if (typeof v.name !== 'string' || v.name.length > MAX_NAME) return null
    if (!Array.isArray(v.places) || v.places.length > MAX_PLACES) return null
    const places: GooglePlace[] = []
    for (const p of v.places) {
      const place = checkPlace(p)
      if (!place) return null
      places.push(place)
    }
    return { kind: 'list', name: v.name, places }
  }
  return null
}

/**
 * The places of a looked-up list, matched against the trip: a place is `existing` when a live place
 * has the same name (ignoring case and accents) or the same Google link. A place repeated within the
 * list is kept once, the first time it appears.
 */
export function markExisting(found: GooglePlace[], places: Place[]): { place: GooglePlace; existing: boolean }[] {
  const links = new Set(places.map((p) => p.link).filter(Boolean))
  const names = new Set(places.map((p) => fold(p.name)))
  const seenLinks = new Set<string>()
  const seenNames = new Set<string>()
  const rows: { place: GooglePlace; existing: boolean }[] = []
  for (const place of found) {
    const name = fold(place.name)
    if (seenLinks.has(place.link) || seenNames.has(name)) continue
    seenLinks.add(place.link)
    seenNames.add(name)
    rows.push({ place, existing: links.has(place.link) || names.has(name) })
  }
  return rows
}
