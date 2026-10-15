/*
 * The built-in lists of cities and airports (src/data, made by scripts/places-data.mjs from GeoNames
 * and OurAirports), and searching them as someone types. They ship with the app, so this works
 * offline and asks no API. Picking one also gives its time zone.
 */

export interface City {
  name: string
  /** ISO 3166 country code. */
  country: string
  /** State, province or region: tells apart cities with the same name. */
  region?: string
  timeZone: string
  /** Where it is, when city-points.tsv was read too. */
  lat?: number
  lon?: number
}

export interface Airport {
  /** IATA code: "LIS". */
  code: string
  name: string
  /** The city it serves: Tokyo for Narita. */
  city: string
  country: string
  timeZone: string
  /** Other words to find it by: "Lisboa, Portela". */
  keywords?: string
}

// Letters that don't decompose into a base letter and an accent.
const SPECIAL: Record<string, string> = { ø: 'o', ł: 'l', ß: 'ss', æ: 'ae', œ: 'oe', đ: 'd', ð: 'd', þ: 'th', ı: 'i' }

/** For matching what people type: "São Paulo" → "sao paulo", "Frankfurt-am-Main" → "frankfurt am main". */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[øłßæœđðþı]/g, (ch) => SPECIAL[ch])
    .replace(/[\s'’.,()/-]+/g, ' ')
    .trim()
}

let regionNames: Intl.DisplayNames | null | undefined

/** "PT" → "Portugal", in English like the rest of the app. */
export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
    } catch {
      regionNames = null
    }
  }
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

/** "Oregon, United States": what tells a city apart from others with its name. */
export const cityDetail = (city: City) => [...new Set([city.region, countryName(city.country)])].filter(Boolean).join(', ')

/** "Lisbon (LIS)": how a picked airport reads in the trip. */
export const airportLabel = (airport: Airport) => `${airport.city} (${airport.code})`

/** The airport code in "Lisbon (LIS)" or "LIS", if there is one. */
export function airportCode(text: string | undefined): string | undefined {
  const match = /^(?:.*\(([A-Z]{3})\)|([A-Z]{3}))$/.exec(text?.trim() ?? '')
  return match ? (match[1] ?? match[2]) : undefined
}

const lines = (text: string) => text.split('\n').filter(Boolean)

/**
 * Parses cities.tsv (see the script for its layout): biggest first. `points` is city-points.tsv: one
 * line per city line, in the same order, paired before sorting.
 */
export function parseCities(text: string, points?: string): City[] {
  const [zoneLine, ...rest] = lines(text)
  const zones = zoneLine.split('\t')
  const where = points === undefined ? undefined : lines(points)
  const sized: { city: City; size: number }[] = []
  let country = ''
  let region: string | undefined
  let zone = ''
  let n = 0
  for (const line of rest) {
    const f = line.split('\t')
    if (line.startsWith('>')) {
      country = f[0].slice(1)
      region = f[1] || undefined
      zone = zones[Number(f[2])]
    } else {
      const city: City = { name: f[0], country, region, timeZone: f[2] ? zones[Number(f[2])] : zone }
      const point = where?.[n++]?.split('\t')
      if (point) {
        city.lat = Number(point[0])
        city.lon = Number(point[1])
      }
      sized.push({ city, size: Number(f[1]) })
    }
  }
  return sized.sort((a, b) => b.size - a.size).map((s) => s.city)
}

/** Parses airports.tsv: the big airports first. */
export function parseAirports(text: string): Airport[] {
  const [zoneLine, ...rest] = lines(text)
  const zones = zoneLine.split('\t')
  return rest.map((line) => {
    const [code, name, city, country, zone, keywords] = line.split('\t')
    return { code, name, city, country, timeZone: zones[Number(zone)], keywords: keywords || undefined }
  })
}

export interface CityIndex {
  cities: City[]
  /** Each city's folded name. */
  names: string[]
}

export const cityIndex = (cities: City[]): CityIndex => ({ cities, names: cities.map((c) => fold(c.name)) })

/** Whether a word in `folded` starts with `query` ("york" in "new york"). */
const wordStarts = (folded: string, query: string) => folded.startsWith(query) || folded.includes(` ${query}`)

/**
 * Cities matching what's typed, best first: the name itself ("porto" before Porto Alegre), then
 * names starting with it, then a word in them ("york" → New York), bigger cities first within each.
 * A name of three letters or less isn't put first: "San" is more likely the start of Santiago than
 * the town in Mali. "Portland, ma" narrows them down by region or country.
 */
export function searchCities(index: CityIndex, query: string, limit = 8): City[] {
  const [name = '', where = ''] = query.split(',').map(fold)
  if (!name) return []
  const tiers: City[][] = [[], [], []]
  const exact = name.length > 3 ? name : undefined
  index.names.forEach((folded, i) => {
    const tier = folded === exact ? 0 : folded.startsWith(name) ? 1 : wordStarts(folded, name) ? 2 : -1
    if (tier < 0 || tiers[tier].length >= limit) return
    const city = index.cities[i]
    if (where && !wordStarts(fold(`${city.region ?? ''} ${countryName(city.country)} ${city.country}`), where)) return
    tiers[tier].push(city)
  })
  return tiers.flat().slice(0, limit)
}

/** A city by its exact name (the biggest of that name, in `country` if given), for its time zone. */
export function cityNamed(index: CityIndex, name: string, country?: string): City | undefined {
  const folded = fold(name)
  if (!folded) return undefined
  const i = index.names.findIndex((n, i) => n === folded && (!country || index.cities[i].country === country))
  return i < 0 ? undefined : index.cities[i]
}

/**
 * The town of a place: the biggest within 10 km, else the nearest within 30 km, else none. Needs an
 * index made with city points.
 */
export function nearestCity(index: CityIndex, lat: number, lng: number): City | undefined {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  let nearest: City | undefined
  let nearestKm = Infinity
  for (const city of index.cities) {
    if (city.lat === undefined || city.lon === undefined) continue
    const dLat = city.lat - lat
    if (Math.abs(dLat) > 0.3) continue
    let dLon = Math.abs(city.lon - lng)
    if (dLon > 180) dLon = 360 - dLon
    const km = Math.hypot(dLon * cosLat, dLat) * 111.2
    // Cities are biggest first, so the first one within 10 km is the biggest.
    if (km <= 10) return city
    if (km <= 30 && km < nearestKm) {
      nearest = city
      nearestKm = km
    }
  }
  return nearest
}

export interface AirportIndex {
  airports: Airport[]
  byCode: Map<string, Airport>
  /** Folded city, and every word to find each airport by. */
  cities: string[]
  words: string[]
  countries: string[]
}

export function airportIndex(airports: Airport[]): AirportIndex {
  return {
    airports,
    byCode: new Map(airports.map((a) => [a.code, a])),
    cities: airports.map((a) => fold(a.city)),
    words: airports.map((a) => fold(`${a.name} ${a.city} ${a.keywords ?? ''}`)),
    countries: airports.map((a) => fold(countryName(a.country))),
  }
}

/**
 * Airports matching what's typed, best first: the code itself ("nrt"), then the city they serve,
 * then any word in their name, city or other names ("narita", "heathrow"), then the country.
 */
export function searchAirports(index: AirportIndex, query: string, limit = 8): Airport[] {
  const folded = fold(query)
  if (!folded) return []
  const code = query.trim().toUpperCase()
  const exact = /^[A-Z]{3}$/.test(code) ? index.byCode.get(code) : undefined
  const tiers: Airport[][] = [exact ? [exact] : [], [], [], []]
  index.airports.forEach((airport, i) => {
    if (airport === exact) return
    const tier = index.cities[i].startsWith(folded)
      ? 1
      : wordStarts(index.words[i], folded) || (code.length < 3 && airport.code.startsWith(code))
        ? 2
        : index.countries[i].startsWith(folded)
          ? 3
          : -1
    if (tier > 0 && tiers[tier].length < limit) tiers[tier].push(airport)
  })
  return tiers.flat().slice(0, limit)
}
