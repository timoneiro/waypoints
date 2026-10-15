import { describe, expect, it } from 'vitest'
import { checkGoogleMapsAnswer, isGoogleMapsUrl, listIdFromUrl, placeFromUrl, placesFromList } from './googleMaps'
import { pastConsent, placeFromDetails, placeIdFromUrl } from './googleMaps'

const PLACE_URL =
  'https://www.google.com/maps/place/Torre+dos+Cl%C3%A9rigos/@41.1457911,-8.6168211,17z/data=!4m7!3m6!1s0xd2464e251ced649:0x425ec51327127c21!8m2!3d41.1456705!4d-8.6145977!15sABC!16s%2Fg%2F120l7r57!18m1!1e1?entry=tts&g_ep=x'
const LIST_ID = 'AbCdEfGhIjKlMnOp_-12'

const OWNER = ['Some Owner', 'https://photos.example/owner.jpg', '1234567890']
const entry = (name: string, address: string, lat: number, lng: number, ids: string[], note: string) => [
  null,
  [null, null, '', null, address, [null, null, lat, lng], ids, '/g/11b6d5c1kx'],
  name,
  note,
  null,
  null,
  null,
  [],
  [[1], ids],
  [1785070214, 580487000],
  [1785070214, 580487000],
  null,
  OWNER,
]
const PREFIX = ")]}'\n"
const BODY =
  PREFIX +
  JSON.stringify([
    [
      [LIST_ID, 1, null, 1, 1],
      4,
      [2, 1, `https://www.google.com/maps/placelists/list/${LIST_ID}`],
      OWNER,
      'Porto',
      '',
      null,
      null,
      [
        entry('Livraria Lello', 'R. das Carmelitas 144, Porto', 41.1469, -8.6149, ['964166591612806729', '-6017264553893446605'], 'Book tickets online'),
        entry('Ponte Luís I', '', 41.1398, -8.6094, ['1', '2'], ''),
        entry('Sé do Porto', '', 41.1432, -8.6113, ['3', '4'], ''),
        entry('No coordinates', '', 200, 0, ['5', '6'], ''),
      ],
    ],
  ])

describe('placeFromUrl', () => {
  it('reads the name, the place and its link', () => {
    expect(placeFromUrl(PLACE_URL)).toEqual({
      name: 'Torre dos Clérigos',
      link: 'https://www.google.com/maps/place/Torre+dos+Cl%C3%A9rigos/data=!4m2!3m1!1s0xd2464e251ced649:0x425ec51327127c21',
      lat: 41.1456705,
      lng: -8.6145977,
    })
  })

  it('falls back to the map view', () => {
    const place = placeFromUrl('https://www.google.com/maps/place/Somewhere/@41.1,-8.6,17z')
    expect(place).toMatchObject({ name: 'Somewhere', lat: 41.1, lng: -8.6 })
  })

  it('is null for other addresses', () => {
    expect(placeFromUrl('https://evil.com/maps/place/X/@1,2,3z')).toBeNull()
    expect(placeFromUrl('https://www.google.com/maps/search/x')).toBeNull()
  })
})

describe('listIdFromUrl', () => {
  it('reads both forms', () => {
    expect(listIdFromUrl(`https://www.google.com/maps/@/data=!3m1!4b1!4m3!11m2!2s${LIST_ID}!3e3?entry=tts&g_ep=x`)).toBe(LIST_ID)
    expect(listIdFromUrl(`https://www.google.com/maps/placelists/list/${LIST_ID}`)).toBe(LIST_ID)
  })
  it('is null for a place', () => {
    expect(listIdFromUrl(PLACE_URL)).toBeNull()
  })
})

describe('placesFromList', () => {
  const list = placesFromList(BODY)
  it('reads the name and places, skipping ones without a position', () => {
    expect(list?.name).toBe('Porto')
    expect(list?.places.map((p) => p.name)).toEqual(['Livraria Lello', 'Ponte Luís I', 'Sé do Porto'])
    expect(list?.places[0]).toEqual({
      name: 'Livraria Lello',
      link: 'https://www.google.com/maps/place/Livraria+Lello/data=!4m2!3m1!1s0xd6168681d616649:0xac7e61c4e1a1bc33',
      lat: 41.1469,
      lng: -8.6149,
      address: 'R. das Carmelitas 144, Porto',
      note: 'Book tickets online',
    })
    expect(list?.places[1].address).toBeUndefined()
  })
  it('never carries who made the list', () => {
    const text = JSON.stringify(list)
    for (const secret of OWNER) expect(text).not.toContain(secret)
  })
  it('is null for the wrong shape', () => {
    expect(placesFromList('not json')).toBeNull()
    expect(placesFromList(PREFIX + '[[1,2]]')).toBeNull()
    expect(placesFromList(PREFIX + '{"a":1}')).toBeNull()
  })
})

describe('isGoogleMapsUrl', () => {
  it('accepts Google Maps addresses', () => {
    for (const url of [
      'https://maps.app.goo.gl/bAMnDcGU6G1qgZFU8',
      'https://goo.gl/maps/abc',
      'https://www.google.com/maps/place/x',
      'https://google.com/maps',
      'https://www.google.co.uk/maps/@1,2,3z',
      'https://www.google.com.br/maps/x',
      'https://www.google.pt/maps/x',
      'https://maps.google.com/anything',
    ])
      expect(isGoogleMapsUrl(url), url).toBe(true)
  })
  it('refuses everything else', () => {
    for (const url of [
      'http://maps.app.goo.gl/x',
      'https://maps.app.goo.gl.evil.com/x',
      'https://evil.com/maps',
      'https://192.168.1.1/maps',
      'https://www.google.com/search',
      'https://goo.gl/other',
      'not a url',
    ])
      expect(isGoogleMapsUrl(url), url).toBe(false)
  })
})

describe('checkGoogleMapsAnswer', () => {
  const place = { name: 'A', link: 'https://www.google.com/maps/place/A/data=!4m2!3m1!1s0x1:0x2', lat: 1, lng: 2 }
  it('accepts good answers', () => {
    expect(checkGoogleMapsAnswer({ kind: 'place', place })).toEqual({ kind: 'place', place })
    expect(checkGoogleMapsAnswer({ kind: 'list', name: 'L', places: [place] })).toEqual({ kind: 'list', name: 'L', places: [place] })
  })
  it('refuses odd ones', () => {
    expect(checkGoogleMapsAnswer(null)).toBeNull()
    expect(checkGoogleMapsAnswer({ kind: 'other' })).toBeNull()
    expect(checkGoogleMapsAnswer({ kind: 'place', place: { ...place, lat: 91 } })).toBeNull()
    expect(checkGoogleMapsAnswer({ kind: 'place', place: { ...place, link: 'https://evil.com/x' } })).toBeNull()
    expect(checkGoogleMapsAnswer({ kind: 'place', place: { ...place, name: 'x'.repeat(201) } })).toBeNull()
    expect(checkGoogleMapsAnswer({ kind: 'list', name: 'L', places: [place, 'x'] })).toBeNull()
  })
})

describe('pastConsent', () => {
  it("answers where Google's consent page leads back to, when that's Google Maps", () => {
    const place = 'https://www.google.com/maps?q=Torre+dos+Cl%C3%A9rigos&ftid=0xd2464e251ced649:0x425ec51327127c21'
    expect(pastConsent(`https://consent.google.com/ml?continue=${encodeURIComponent(place)}&gl=PT&hl=pt-PT&pc=m&src=1`)).toBe(
      'https://www.google.com/maps?q=Torre+dos+Cl%C3%A9rigos&ftid=0xd2464e251ced649:0x425ec51327127c21',
    )
    expect(pastConsent('https://consent.google.pt/ml?continue=https://www.google.pt/maps/@1,2,3z')).toBe('https://www.google.pt/maps/@1,2,3z')
  })

  it('answers null for anything else', () => {
    expect(pastConsent('https://consent.google.com/ml?continue=https://evil.com/maps')).toBeNull()
    expect(pastConsent('https://consent.google.com/ml')).toBeNull()
    expect(pastConsent('https://consent.evil.com/ml?continue=https://www.google.com/maps/@1,2,3z')).toBeNull()
    expect(pastConsent('http://consent.google.com/ml?continue=https://www.google.com/maps/@1,2,3z')).toBeNull()
    expect(pastConsent('not a url')).toBeNull()
  })
})

describe('placeIdFromUrl', () => {
  it('reads ftid and cid', () => {
    expect(placeIdFromUrl('https://www.google.com/maps?q=Torre&ftid=0xd2464e251ced649:0x425ec51327127c21&entry=gps')).toBe('0xd2464e251ced649:0x425ec51327127c21')
    expect(placeIdFromUrl('https://www.google.com/maps?cid=4782476540364618785')).toBe('0x0:0x425ec51327127c21')
    expect(placeIdFromUrl('https://maps.google.com/?cid=18446744073709551615')).toBe('0x0:0xffffffffffffffff')
  })

  it('answers null for anything else', () => {
    expect(placeIdFromUrl('https://www.google.com/maps?ftid=0x1:0x2!evil')).toBeNull()
    expect(placeIdFromUrl('https://www.google.com/maps?cid=18446744073709551616')).toBeNull()
    expect(placeIdFromUrl('https://www.google.com/maps?cid=-1')).toBeNull()
    expect(placeIdFromUrl('https://www.google.com/maps/@1,2,3z')).toBeNull()
    expect(placeIdFromUrl('https://evil.com/maps?ftid=0x1:0x2')).toBeNull()
  })
})

describe('placeFromDetails', () => {
  const details = (info: unknown[]) => `)]}'\n${JSON.stringify([null, null, null, null, [], null, info])}`
  const info = () => {
    const a: unknown[] = new Array(40).fill(null)
    a[9] = [null, null, 41.1456705, -8.6145977]
    a[10] = '0xd2464e251ced649:0x425ec51327127c21'
    a[11] = 'Torre dos Clérigos'
    a[39] = 'R. de São Filipe de Nery, 4050-546 Porto, Portugal'
    return a
  }

  it("reads the place's name, coordinates, link and address", () => {
    expect(placeFromDetails(details(info()))).toEqual({
      name: 'Torre dos Clérigos',
      link: 'https://www.google.com/maps/place/Torre+dos+Cl%C3%A9rigos/data=!4m2!3m1!1s0xd2464e251ced649:0x425ec51327127c21',
      lat: 41.1456705,
      lng: -8.6145977,
      address: 'R. de São Filipe de Nery, 4050-546 Porto, Portugal',
    })
  })

  it('answers null for anything else', () => {
    expect(placeFromDetails(`)]}'\n[null,null,null,null,[],null]`)).toBeNull()
    expect(placeFromDetails('not json')).toBeNull()
    const noName = info()
    noName[11] = '  '
    expect(placeFromDetails(details(noName))).toBeNull()
    const badPoint = info()
    badPoint[9] = [null, null, 91, 0]
    expect(placeFromDetails(details(badPoint))).toBeNull()
  })

  it('links by coordinates when the id is missing or odd', () => {
    const odd = info()
    odd[10] = 'javascript:x'
    expect(placeFromDetails(details(odd))?.link).toBe('https://www.google.com/maps/place/Torre+dos+Cl%C3%A9rigos/@41.1456705,-8.6145977,17z')
  })
})
