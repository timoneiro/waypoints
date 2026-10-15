import { describe, expect, it } from 'vitest'
import { photonAddresses, photonReverseUrl } from './addresses'

describe('photonReverseUrl', () => {
  it('asks Photon for the address at a point, rounded to 6 decimals', () => {
    const url = new URL(photonReverseUrl(41.1456705, -8.6145977))
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/reverse')
    expect(url.searchParams.get('lat')).toBe('41.145671')
    expect(url.searchParams.get('lon')).toBe('-8.614598')
    expect(url.searchParams.get('lang')).toBe('en')
  })
})

describe('photonAddresses on a reverse answer', () => {
  it('reads the address of the place', () => {
    const answer = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-8.6145977, 41.1456705] },
          properties: {
            name: 'Clérigos Tower',
            street: 'Rua da Assunção',
            postcode: '4050-546',
            city: 'Porto',
            countrycode: 'PT',
            type: 'house',
          },
        },
      ],
    }
    expect(photonAddresses(answer)).toEqual([
      { address: 'Clérigos Tower, Rua da Assunção, 4050-546 Porto', city: 'Porto', country: 'PT' },
    ])
  })
})
