/*
 * Builds the app's built-in lists of cities and airports (src/data/cities.tsv, src/data/airports.tsv),
 * so that searching for them works offline and needs no API. Sources:
 * - GeoNames (https://www.geonames.org, CC BY 4.0): towns with 15,000+ people, their regions and
 *   time zones, and which time zones each country has.
 * - OurAirports (https://ourairports.com, public domain): airports with scheduled flights and an
 *   IATA code.
 * - mwgg/Airports (https://github.com/mwgg/Airports, MIT): the city each airport serves, and its
 *   time zone. Where it's missing or doesn't belong to the airport's country, the nearest GeoNames
 *   town's time zone is used instead.
 *
 * Run it now and then to pick up new airports: node scripts/places-data.mjs
 */
import { writeFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const GEONAMES = 'https://download.geonames.org/export/dump'
const OURAIRPORTS = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
const MWGG = 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json'
const OUT = new URL('../src/data/', import.meta.url)

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** One file out of a zip archive (GeoNames zips hold a single deflated text file). */
function unzipFile(zip, name) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const entries = zip.readUInt16LE(end + 10)
  let p = zip.readUInt32LE(end + 16)
  for (let i = 0; i < entries; i++) {
    const nameLength = zip.readUInt16LE(p + 28)
    const entryName = zip.toString('utf8', p + 46, p + 46 + nameLength)
    if (entryName === name) {
      const size = zip.readUInt32LE(p + 20)
      const local = zip.readUInt32LE(p + 42)
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      return inflateRawSync(zip.subarray(start, start + size)).toString('utf8')
    }
    p += 46 + nameLength + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32)
  }
  throw new Error(`${name} not in the archive`)
}

const tsvRows = (text) =>
  text
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('\t'))

function csvRows(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') endCell()
    else if (ch === '\n') endRow()
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) endRow()
  const [head, ...rest] = rows
  return rest.map((r) => Object.fromEntries(head.map((key, i) => [key, r[i] ?? ''])))
}

/** For comparing names: "Frankfurt-am-Main" and "Frankfurt am Main", "Bâle" and "bale" are the same. */
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s'’.-]+/g, ' ')
    .trim()
const clean = (s) => s.replace(/[\t\n\r]/g, ' ').replace(/\s+/g, ' ').trim()

/** Index of each value in a table that's written once, at the top of the file. */
function table() {
  const values = []
  const index = new Map()
  const of = (value) => {
    if (!index.has(value)) index.set(value, values.push(value) - 1)
    return index.get(value)
  }
  return { values, of }
}

console.log('Downloading…')
const [citiesZip, admin1Text, zonesText, airportsCsv, mwggJson] = await Promise.all([
  download(`${GEONAMES}/cities15000.zip`),
  download(`${GEONAMES}/admin1CodesASCII.txt`).then(String),
  download(`${GEONAMES}/timeZones.txt`).then(String),
  download(OURAIRPORTS).then(String),
  download(MWGG).then(String),
])

// GeoNames columns: https://download.geonames.org/export/dump/readme.txt
const towns = tsvRows(unzipFile(citiesZip, 'cities15000.txt'))
  .filter((r) => r[6] === 'P')
  .map((r) => ({
    name: clean(r[1]),
    ascii: r[2],
    alternates: r[3] ? r[3].split(',') : [],
    lat: Number(r[4]),
    lon: Number(r[5]),
    country: r[8],
    admin1: r[10],
    population: Number(r[14]),
    zone: r[17],
  }))
  .filter((t) => t.name && t.zone && t.country)
  .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name))
const regions = new Map(tsvRows(admin1Text).map((r) => [r[0], clean(r[1])]))
const countryZones = new Set(tsvRows(zonesText).slice(1).map((r) => `${r[0]} ${r[1]}`))

// Cities, grouped by country and region (which keeps the file small once compressed):
//   line 1: the time zones, by number
//   >PT	Lisbon	148     a region: country, region name, its time zone
//   Lisbon	15           a city: name, size (higher is bigger, it ranks searches), its time zone if not the region's
// Other names, like "Lisboa" for Lisbon, would make the list twice as big: GeoNames has dozens per
// city, in every language, without saying which is which.
{
  const zones = table()
  const size = (population) => Math.max(0, Math.floor(Math.log10(population) * 4) - 16)
  const grouped = Map.groupBy(towns, (t) => `${t.country}.${t.admin1}`)
  const lines = []
  const points = []
  for (const [key, group] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    const zone = zones.of(group[0].zone)
    lines.push(`>${[group[0].country, regions.get(key) ?? '', zone].join('\t')}`)
    for (const t of group) {
      lines.push([t.name, size(t.population), zones.of(t.zone) === zone ? '' : zones.of(t.zone)].join('\t').trimEnd())
      points.push(`${t.lat.toFixed(2)}\t${t.lon.toFixed(2)}`)
    }
  }
  const text = [zones.values.join('\t'), ...lines].join('\n') + '\n'
  writeFileSync(new URL('cities.tsv', OUT), text)
  console.log(`cities.tsv: ${towns.length} cities, ${(text.length / 1024).toFixed(0)} KB`)
  // Where each city is (lat, lon): one line per city line above, in the same order. Kept apart so city
  // search doesn't get bigger; only "the nearest town" of a Google Maps place reads it.
  writeFileSync(new URL('city-points.tsv', OUT), points.join('\n') + '\n')
}

// Airports with scheduled flights, the big ones first (which is how they rank):
//   line 1: the time zones, by number
//   LIS	Lisbon Humberto Delgado Airport	Lisbon	PT	148	Lisboa, Portela
//   code, name, the city it serves, country, time zone, other words to find it by
{
  const served = new Map(
    Object.values(JSON.parse(mwggJson))
      .filter((a) => a.iata)
      .map((a) => [a.iata, a]),
  )
  const byCountry = Map.groupBy(towns, (t) => t.country)
  const rad = Math.PI / 180
  const distanceKm = (a, b) => {
    const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * rad)
    const y = b.lat - a.lat
    return Math.sqrt(x * x + y * y) * 111.2
  }
  const nearest = (at, towns) => towns.reduce((best, t) => (distanceKm(at, t) < distanceKm(at, best) ? t : best))
  /**
   * A town within 100 km of the airport going by this name, in any country (Basel's airport is in
   * France), spelled as GeoNames does in English: "Venezia" → "Venice", "Bale" → "Basel".
   */
  const townNamed = (name, at) => {
    const key = fold(name)
    if (!key) return undefined
    return towns.find(
      (t) =>
        Math.abs(t.lat - at.lat) < 1 &&
        distanceKm(at, t) < 100 &&
        (fold(t.name) === key || fold(t.ascii) === key || t.alternates.some((a) => fold(a) === key)),
    )
  }
  // "Paris (Roissy-en-France, Val-d'Oise)", "London, Essex", "Bâle / Mulhouse" → their first place.
  const firstPlace = (s) => clean(s.split(/\s*[(,/]\s*/)[0] ?? '')
  // Other words to find an airport by: short, in Latin letters, no ICAO codes ("LPPT"). City codes
  // that cover several airports ("LON", "TYO") stay.
  const searchable = (s) => s.length <= 40 && /^[\p{Script=Latin}\p{N}\s'’.,()&/-]+$/u.test(s) && !/^[A-Z0-9]{4}$/.test(s)

  const RANK = { large_airport: 0, medium_airport: 1 }
  const airports = csvRows(airportsCsv)
    .filter((a) => /^[A-Z]{3}$/.test(a.iata_code) && a.scheduled_service === 'yes' && a.type !== 'closed')
    .sort((a, b) => (RANK[a.type] ?? 2) - (RANK[b.type] ?? 2) || a.iata_code.localeCompare(b.iata_code))
  const zones = table()
  const seen = new Set()
  let zoneFromTown = 0
  const lines = []
  for (const a of airports) {
    if (seen.has(a.iata_code)) continue
    seen.add(a.iata_code)
    const at = { lat: Number(a.latitude_deg), lon: Number(a.longitude_deg) }
    // mwgg's entry for the code, if it's the same airport (a few codes there point elsewhere).
    const other = served.get(a.iata_code)
    const same = other && distanceKm(at, { lat: other.lat, lon: other.lon }) < 30 ? other : undefined
    let zone = same?.tz
    if (!zone || !countryZones.has(`${a.iso_country} ${zone}`)) {
      zone = nearest(at, byCountry.get(a.iso_country) ?? towns).zone
      zoneFromTown++
    }
    // The city it serves: mwgg's ("Milan" for Malpensa, "Tokyo" for Narita), else the municipality.
    const names = [same?.city, same?.city?.split('-')[0], a.municipality].filter(Boolean).map(firstPlace)
    const city = names.map((n) => townNamed(n, at)?.name).find(Boolean) || firstPlace(a.municipality) || clean(a.name)
    const name = clean(a.name)
    const known = new Set([fold(name), fold(city)])
    const keywords = [a.municipality, same?.city, ...a.keywords.split(',')]
      .map((k) => clean(k ?? ''))
      .filter((k) => k && searchable(k) && !known.has(fold(k)) && known.add(fold(k)))
    lines.push([a.iata_code, name, city, a.iso_country, zones.of(zone), keywords.join(', ')].join('\t').trimEnd())
  }
  const text = [zones.values.join('\t'), ...lines].join('\n') + '\n'
  writeFileSync(new URL('airports.tsv', OUT), text)
  console.log(`airports.tsv: ${lines.length} airports (${zoneFromTown} with the nearest town's time zone), ${(text.length / 1024).toFixed(0)} KB`)
}
