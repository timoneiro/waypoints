import { isGoogleMapsUrl, listIdFromUrl, placeFromUrl, placesFromList } from '../../src/domain/googleMaps.ts'
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

const listUrl = (id: string) =>
  `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m4!1s${id}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`

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
 * Reads a Google Maps link: follows its redirects by hand (only to Google Maps addresses, at most 5) and
 * answers with the place, or with a shared list's places. Never fetches anything but Google Maps.
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
      return await fetchFn(target, { redirect: 'manual', signal: controller.signal })
    } catch {
      throw noAnswer()
    }
  }
  const work = async (): Promise<GoogleMapsAnswer> => {
    let current = url
    for (let hops = 0; ; hops++) {
      const id = listIdFromUrl(current)
      if (id) {
        const res = await get(listUrl(id))
        if (res.status !== 200) throw unreadable()
        let body: string
        try {
          body = await readText(res)
        } catch (err) {
          throw err instanceof LookupError ? err : noAnswer()
        }
        const list = placesFromList(body)
        if (!list || list.places.length === 0) throw new LookupError(422, "This list isn't shared, or doesn't exist.")
        return { kind: 'list', name: list.name, places: list.places }
      }
      const place = placeFromUrl(current)
      if (place) return { kind: 'place', place }
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
