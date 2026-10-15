import { describe, expect, it } from 'vitest'
import { LINKS } from './links'

describe('LINKS', () => {
  it('every link is https', () => {
    for (const url of Object.values(LINKS)) {
      expect(url.startsWith('https://')).toBe(true)
    }
  })

  it('donate points at the Ko-fi page', () => {
    expect(LINKS.donate).toBe('https://ko-fi.com/ricardoalmeida59690')
  })
})
