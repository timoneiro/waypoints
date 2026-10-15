import {
  isGoogleMapsUrl,
  listIdFromUrl,
  pastConsent,
  placeFromDetails,
  placeFromUrl,
  placeIdFromUrl,
  placesFromList,
} from '../../src/domain/googleMaps.ts'
import type { GoogleMapsAnswer } from '../../src/domain/serverProtocol.ts'

/** An error with the status the server should answer with. Messages never include the link or Google's answer. */
export class LookupError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const MAX_REDIRECTS = 5
const MAX_BYTES = 5 * 1024 * 1024
export const LOOKUP_TIMEOUT_MS = 10_000

const notGoogle = () => new LookupError(400, "That's not a Google Maps link.")
const noAnswer = () => new LookupError(502, "Google Maps didn't answer.")
const unreadable = () => new LookupError(502, "Google Maps answered something this server can't read.")

/**
 * Google sends EU addresses (like a home server in Portugal) to its cookie-consent page before any Maps
 * page; this cookie says the consent page was answered (with "reject all"), so it lets the request through.
 */
export const CONSENT_COOKIE = 'SOCS=CAI'

const listUrl = (id: string) =>
  `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m4!1s${id}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`
const detailsUrl = (placeId: string) => `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&pb=!1m1!1s${placeId}`

async function readText(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_BYTES) {
      void reader.cancel().catch(() => {})
      throw unreadable()
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Reads a Google Maps link: follows its redirects by hand (only to Google Maps addresses, at most 5, plus
 * once past Google's consent page) and answers with the place, or with a shared list's places. A link that
 * only names a place by its id (`?ftid=`, `?cid=`) is read through Google's place details. Never fetches
 * anything but Google Maps.
 */
export async function lookUp(url: string, fetchFn: typeof fetch = fetch, timeoutMs = LOOKUP_TIMEOUT_MS): Promise<GoogleMapsAnswer> {
  if (typeof url !== 'string' || !isGoogleMapsUrl(url)) throw notGoogle()
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(noAnswer())
    }, timeoutMs)
  })
  const get = async (target: string) => {
    try {
      return await fetchFn(target, { redirect: 'manual', signal: controller.signal, headers: { Cookie: CONSENT_COOKIE } })
    } catch {
      throw noAnswer()
    }
  }
  /** The body of an answer that must be a 200. */
  const getBody = async (target: string) => {
    const res = await get(target)
    if (res.status !== 200) throw unreadable()
    try {
      return await readText(res)
    } catch (err) {
      throw err instanceof LookupError ? err : noAnswer()
    }
  }
  const work = async (): Promise<GoogleMapsAnswer> => {
    let current = url
    let consented = false
    for (let hops = 0; ; hops++) {
      const id = listIdFromUrl(current)
      if (id) {
        const list = placesFromList(await getBody(listUrl(id)))
        if (!list || list.places.length === 0) throw new LookupError(422, "This list isn't shared, or doesn't exist.")
        return { kind: 'list', name: list.name, places: list.places }
      }
      const place = placeFromUrl(current)
      if (place) return { kind: 'place', place }
      const placeId = placeIdFromUrl(current)
      if (placeId) {
        const found = placeFromDetails(await getBody(detailsUrl(placeId)))
        if (!found) throw new LookupError(422, "That link isn't a place or a list.")
        return { kind: 'place', place: found }
      }
      if (hops >= MAX_REDIRECTS) throw notGoogle()
      const res = await get(current)
      void res.body?.cancel().catch(() => {})
      const location = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && location) {
        let next: string
        try {
          next = new URL(location, current).toString()
        } catch {
          throw unreadable()
        }
        // Past the consent page once; sent back to it again means the cookie no longer works.
        const afterConsent = pastConsent(next)
        if (afterConsent) {
          if (consented) throw unreadable()
          consented = true
          next = afterConsent
        }
        if (!isGoogleMapsUrl(next)) throw notGoogle()
        current = next
        continue
      }
      throw new LookupError(422, "That link isn't a place or a list.")
    }
  }
  try {
    return await Promise.race([work(), timeout])
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
