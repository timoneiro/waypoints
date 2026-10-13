import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { photonAddresses, photonUrl } from './addresses'
import {
  airportCode,
  airportIndex,
  airportLabel,
  cityDetail,
  cityIndex,
  cityNamed,
  fold,
  parseAirports,
  parseCities,
  searchAirports,
  searchCities,
} from './places'
import { isTimeZone } from './time'

// The lists the app ships (scripts/places-data.mjs makes them).
const cities = cityIndex(parseCities(readFileSync(new URL('../data/cities.tsv', import.meta.url), 'utf8')))
const airports = airportIndex(parseAirports(readFileSync(new URL('../data/airports.tsv', import.meta.url), 'utf8')))
const names = (found: { name: string }[]) => found.map((f) => f.name)
const codes = (found: { code: string }[]) => found.map((f) => f.code)

describe('the built-in lists', () => {
  it('have the world in them, with time zones every browser knows', () => {
    expect(cities.cities.length).toBeGreaterThan(30_000)
    expect(airports.airports.length).toBeGreaterThan(3_500)
    const zones = new Set([...cities.cities, ...airports.airports].map((p) => p.timeZone))
    expect([...zones].filter((z) => !isTimeZone(z))).toEqual([])
  })

  it('parse cities with their region, country and time zone', () => {
    expect(cityNamed(cities, 'Lisbon')).toEqual({ name: 'Lisbon', country: 'PT', region: 'Lisbon', timeZone: 'Europe/Lisbon' })
    expect(cityNamed(cities, 'tokyo')?.timeZone).toBe('Asia/Tokyo')
    expect(cityNamed(cities, 'Sao Paulo')?.name).toBe('São Paulo')
    expect(cityNamed(cities, 'Nowhere at all')).toBeUndefined()
  })

  it('name airports after the city they serve', () => {
    const at = (code: string) => airports.byCode.get(code)!
    expect(at('LIS')).toMatchObject({ city: 'Lisbon', country: 'PT', timeZone: 'Europe/Lisbon' })
    expect(airportLabel(at('LIS'))).toBe('Lisbon (LIS)')
    expect(airportLabel(at('NRT'))).toBe('Tokyo (NRT)')
    expect(airportLabel(at('MXP'))).toBe('Milan (MXP)')
    expect(at('NRT').timeZone).toBe('Asia/Tokyo')
    expect(at('JFK').timeZone).toBe('America/New_York')
    expect(at('LAX').timeZone).toBe('America/Los_Angeles')
  })
})

describe('searchCities', () => {
  it('puts the exact name first, then names starting with it, bigger cities first', () => {
    expect(names(searchCities(cities, 'lisbon')).at(0)).toBe('Lisbon')
    expect(names(searchCities(cities, 'Tok')).at(0)).toBe('Tokyo')
    expect(names(searchCities(cities, 'porto'))[0]).toBe('Porto')
    // Three letters are more likely the start of a bigger city's name than a small town's whole name.
    expect(names(searchCities(cities, 'San'))[0]).toBe('Santiago')
  })

  it('ignores accents and case, and finds a word inside the name', () => {
    expect(names(searchCities(cities, 'sao paulo'))[0]).toBe('São Paulo')
    expect(names(searchCities(cities, 'MUNICH'))[0]).toBe('Munich')
    expect(names(searchCities(cities, 'york'))).toContain('New York City')
  })

  it('narrows same-named cities by region or country after a comma', () => {
    const portlands = searchCities(cities, 'Portland', 20).filter((c) => c.name === 'Portland')
    expect(portlands.length).toBeGreaterThan(1)
    const maine = searchCities(cities, 'Portland, maine')
    expect(maine.map(cityDetail)).toEqual(maine.map(() => 'Maine, United States'))
    expect(maine[0]).toMatchObject({ name: 'Portland', timeZone: 'America/New_York' })
    expect(searchCities(cities, 'Portland, oregon')[0].timeZone).toBe('America/Los_Angeles')
  })

  it('returns nothing for nothing', () => {
    expect(searchCities(cities, '  ')).toEqual([])
    expect(searchCities(cities, ', Portugal')).toEqual([])
  })
})

describe('searchAirports', () => {
  it('finds an airport by its code first', () => {
    expect(codes(searchAirports(airports, 'nrt'))[0]).toBe('NRT')
    expect(codes(searchAirports(airports, 'LIS'))[0]).toBe('LIS')
  })

  it('finds every airport of a city, and airports by their own name', () => {
    expect(codes(searchAirports(airports, 'London'))).toEqual(expect.arrayContaining(['LHR', 'LGW', 'STN', 'LTN', 'LCY']))
    expect(codes(searchAirports(airports, 'tokyo'))).toEqual(expect.arrayContaining(['NRT', 'HND']))
    expect(codes(searchAirports(airports, 'heathrow'))).toEqual(['LHR'])
    expect(codes(searchAirports(airports, 'Lisboa'))).toContain('LIS')
  })

  it('falls back to the country', () => {
    expect(searchAirports(airports, 'Japan').every((a) => a.country === 'JP')).toBe(true)
  })
})

describe('airport labels', () => {
  it('reads the code from what a flight says', () => {
    expect(airportCode('Lisbon (LIS)')).toBe('LIS')
    expect(airportCode('LIS')).toBe('LIS')
    expect(airportCode(' NRT ')).toBe('NRT')
    expect(airportCode('Lisbon')).toBeUndefined()
    expect(airportCode('Rio')).toBeUndefined()
    expect(airportCode(undefined)).toBeUndefined()
  })

  it('folds names for matching', () => {
    expect(fold('Frankfurt-am-Main')).toBe('frankfurt am main')
    expect(fold('Øresund Straße')).toBe('oresund strasse')
    expect(fold("  L'Aquila ")).toBe('l aquila')
  })
})

describe('online address search (Photon)', () => {
  it('searches near the trip’s city unless the query says where', () => {
    expect(photonUrl('Rua Augusta 10', 'Lisbon')).toBe('https://photon.komoot.io/api/?q=Rua+Augusta+10%2C+Lisbon&limit=6&lang=en')
    expect(photonUrl('Rua Augusta 10, Porto', 'Lisbon')).toContain('q=Rua+Augusta+10%2C+Porto&')
    expect(photonUrl('Lisbon cathedral', 'Lisbon')).toContain('q=Lisbon+cathedral&')
    expect(photonUrl('Rua Augusta')).toContain('q=Rua+Augusta&')
  })

  it('turns results into addresses, house numbers where each country puts them', () => {
    const answer = {
      features: [
        { properties: { type: 'house', name: 'Time Out Market', street: 'Avenida 24 de Julho', housenumber: '49', postcode: '1200-479', city: 'Lisbon', countrycode: 'PT' } },
        { properties: { type: 'street', name: 'Rua Augusta', postcode: '1100-050', city: 'Lisbon', countrycode: 'PT' } },
        { properties: { type: 'house', street: 'Downing Street', housenumber: '10', postcode: 'SW1A 2AA', city: 'London', countrycode: 'gb' } },
        { properties: { type: 'city', name: 'Lisbon', countrycode: 'PT' } },
        { properties: { type: 'house', name: 'x'.repeat(500) } },
        { nonsense: true },
        'nonsense',
      ],
    }
    expect(photonAddresses(answer)).toEqual([
      { address: 'Time Out Market, Avenida 24 de Julho 49, 1200-479 Lisbon', city: 'Lisbon', country: 'PT' },
      { address: 'Rua Augusta, 1100-050 Lisbon', city: 'Lisbon', country: 'PT' },
      { address: '10 Downing Street, SW1A 2AA London', city: 'London', country: 'GB' },
    ])
    expect(photonAddresses(null)).toEqual([])
    expect(photonAddresses({ features: 'no' })).toEqual([])
  })
})
