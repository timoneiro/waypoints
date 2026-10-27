import { describe, expect, it } from 'vitest'
import { topBarBack } from './tripNav'

describe('topBarBack', () => {
  it.each(['/trips/t1', '/trips/t1/', '/trips/t1/places', '/trips/t1/money', '/trips/t1/photos', '/trips/t1/trip'])(
    '%s goes to the trip list',
    (p) => expect(topBarBack(p, false)).toEqual({ to: '/' }),
  )

  it.each([
    ['/trips/t1/activities/new', '/trips/t1'],
    ['/trips/t1/stays/s1', '/trips/t1'],
    ['/trips/t1/transport/r1/edit', '/trips/t1'],
    ['/trips/t1/reviews', '/trips/t1'],
    ['/trips/t1/places/p1', '/trips/t1/places'],
    ['/trips/t1/places/new', '/trips/t1/places'],
    ['/trips/t1/expenses/e1', '/trips/t1/money'],
    ['/trips/t1/exchanges/new', '/trips/t1/money'],
    ['/trips/t1/files/f1', '/trips/t1/photos'],
    ['/trips/t1/photos/activities', '/trips/t1/photos'],
    ['/trips/t1/share', '/trips/t1/trip'],
    ['/trips/t1/edit', '/trips/t1/trip'],
    ['/trips/t1/server', '/trips/t1/trip'],
  ])('%s falls back to %s', (p, fallback) => expect(topBarBack(p, false)).toEqual({ fallback }))

  it('sends the report to the Plan once the trip is over, the Trip tab before', () => {
    expect(topBarBack('/trips/t1/report', true)).toEqual({ fallback: '/trips/t1' })
    expect(topBarBack('/trips/t1/report', false)).toEqual({ fallback: '/trips/t1/trip' })
  })
})
