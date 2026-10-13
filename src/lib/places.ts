import { photonAddresses, photonUrl, type FoundAddress } from '../domain/addresses'
import { airportIndex, cityIndex, parseAirports, parseCities, type AirportIndex, type CityIndex } from '../domain/places'

/*
 * The built-in city and airport lists load the first time a form needs one, as separate files the
 * app keeps for offline use like the rest of it.
 */

let cities: Promise<CityIndex> | undefined
let airports: Promise<AirportIndex> | undefined

/** A load that failed (offline before the file was kept) is tried again next time. */
function once<T>(load: () => Promise<T>, forget: () => void): Promise<T> {
  return load().catch((err: unknown) => {
    forget()
    throw err
  })
}

export const loadCities = () =>
  (cities ??= once(
    () => import('../data/cities.tsv?raw').then((m) => cityIndex(parseCities(m.default))),
    () => (cities = undefined),
  ))

export const loadAirports = () =>
  (airports ??= once(
    () => import('../data/airports.tsv?raw').then((m) => airportIndex(parseAirports(m.default))),
    () => (airports = undefined),
  ))

const found = new Map<string, FoundAddress[]>()

/** Online address search (Photon), for people who turned it on in Settings. Throws when offline. */
export async function searchAddressesOnline(query: string, city: string | undefined, signal: AbortSignal): Promise<FoundAddress[]> {
  const url = photonUrl(query, city)
  const known = found.get(url)
  if (known) return known
  const res = await fetch(url, { signal, credentials: 'omit' })
  if (!res.ok) throw new Error(`Address search: ${res.status}`)
  const results = photonAddresses(await res.json())
  found.set(url, results)
  return results
}
