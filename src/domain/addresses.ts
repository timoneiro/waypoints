/*
 * Online address search, an optional add-on (off unless turned on in Settings): Photon
 * (https://photon.komoot.io), a free OpenStreetMap search with no key or account. This file only
 * builds the request and reads the answer, which comes from a third party: untrusted, so only
 * strings of a sane length are used, as plain text.
 */

export const PHOTON = 'https://photon.komoot.io/api/'

export interface FoundAddress {
  /** "Time Out Market, Avenida 24 de Julho 49, 1200-479 Lisbon" */
  address: string
  city?: string
  /** ISO 3166 country code. */
  country?: string
}

/** The search for `query`, near `city` when the trip says which: "Rua Augusta 10, Lisbon". */
export function photonUrl(query: string, city?: string): string {
  const q = city && !query.includes(',') && !query.toLowerCase().includes(city.toLowerCase()) ? `${query}, ${city}` : query
  return `${PHOTON}?${new URLSearchParams({ q: q.slice(0, 200), limit: '6', lang: 'en' })}`
}

// Where the house number goes before the street: "10 Downing Street".
const NUMBER_FIRST = new Set(['US', 'CA', 'GB', 'IE', 'AU', 'NZ', 'FR', 'SG', 'MY', 'PH', 'IN', 'ZA'])
// Results that are areas rather than somewhere to go: they belong in the city field, if anywhere.
const AREAS = new Set(['country', 'state', 'county', 'city', 'region'])

const text = (value: unknown) => (typeof value === 'string' && value.trim() && value.length <= 200 ? value.trim() : undefined)

/** The addresses in Photon's answer (GeoJSON), skipping anything malformed. */
export function photonAddresses(answer: unknown): FoundAddress[] {
  const features = (answer as { features?: unknown })?.features
  if (!Array.isArray(features)) return []
  const found: FoundAddress[] = []
  for (const feature of features.slice(0, 10)) {
    const p = (feature as { properties?: Record<string, unknown> })?.properties
    if (!p || typeof p !== 'object' || AREAS.has(String(p.type))) continue
    const country = text(p.countrycode)?.toUpperCase()
    const street = text(p.street)
    const number = text(p.housenumber)
    const name = text(p.name)
    const city = text(p.city) ?? text(p.town) ?? text(p.village)
    const streetLine = street && number ? (NUMBER_FIRST.has(country ?? '') ? `${number} ${street}` : `${street} ${number}`) : street
    const place = [text(p.postcode), city].filter(Boolean).join(' ')
    const address = [...new Set([name, streetLine, place].filter(Boolean))].join(', ')
    if (address && !found.some((f) => f.address === address)) found.push({ address, city, country: country && /^[A-Z]{2}$/.test(country) ? country : undefined })
  }
  return found
}
