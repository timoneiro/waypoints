import cityPointsUrl from '../data/city-points.tsv?url'
import { photonAddresses, photonReverseUrl, photonUrl, type FoundAddress } from '../domain/addresses'
import { airportIndex, cityIndex, nearestCity, parseAirports, parseCities, type AirportIndex, type CityIndex } from '../domain/places'

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

let cityPoints: Promise<CityIndex> | undefined

/** The cities with where they are. Fetched on its own (not kept for offline use), so city search stays small. */
export const loadCityPoints = () =>
  (cityPoints ??= once(
    async () => {
      const { default: citiesText } = await import('../data/cities.tsv?raw')
      const res = await fetch(cityPointsUrl)
      if (!res.ok) throw new Error(`City points: ${res.status}`)
      return cityIndex(parseCities(citiesText, await res.text()))
    },
    () => (cityPoints = undefined),
  ))

/** The built-in list's town for a place's coordinates, if there's one near. Throws when offline. */
export async function cityAt(lat: number, lng: number): Promise<string | undefined> {
  return nearestCity(await loadCityPoints(), lat, lng)?.name
}

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

/** Online address for a place's coordinates (Photon), for people who turned it on in Settings. Throws when offline. */
export async function reverseAddressOnline(lat: number, lng: number): Promise<string | undefined> {
  const url = photonReverseUrl(lat, lng)
  const known = found.get(url)
  if (known) return known[0]?.address
  const res = await fetch(url, { credentials: 'omit' })
  if (!res.ok) throw new Error(`Address lookup: ${res.status}`)
  const results = photonAddresses(await res.json())
  found.set(url, results)
  return results[0]?.address
}
