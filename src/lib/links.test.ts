import { describe, expect, it } from 'vitest'
import { LINKS } from './links'

describe('LINKS', () => {
  it('every link is https', () => {
    for (const url of Object.values(LINKS)) {
      expect(url.startsWith('https://')).toBe(true)
    }
  })

  it('guide points at GUIDE.md on GitHub', () => {
    expect(LINKS.guide).toBe('https://github.com/waypoints-pwa/waypoints/blob/main/GUIDE.md')
  })

  it('donate points at the Ko-fi page', () => {
    expect(LINKS.donate).toBe('https://ko-fi.com/ricardoalmeida59690')
  })
})
