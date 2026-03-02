import { describe, it, expect } from 'vitest'
import { parseHashRoute, buildProfileRoute, buildSongRoute } from './router'

describe('parseHashRoute', () => {
  it('parses home', () => {
    expect(parseHashRoute('')).toEqual({ type: 'home' })
    expect(parseHashRoute('#')).toEqual({ type: 'home' })
    expect(parseHashRoute('#/')).toEqual({ type: 'home' })
  })

  it('parses feed/profile/song routes', () => {
    expect(parseHashRoute('#/feed')).toEqual({ type: 'feed' })
    expect(parseHashRoute('#/u/npub1abc')).toEqual({ type: 'profile', npub: 'npub1abc' })
    expect(parseHashRoute('#/song/npub1abc/song-123')).toEqual({
      type: 'song',
      npub: 'npub1abc',
      songId: 'song-123',
    })
  })

  it('parses legacy nhash shares', () => {
    expect(parseHashRoute('#nhash1xyz')).toEqual({
      type: 'legacy-share',
      nhash: 'nhash1xyz',
      configPart: null,
    })
    expect(parseHashRoute('#nhash1xyz!eyJmb28iOiJiYXIifQ==')).toEqual({
      type: 'legacy-share',
      nhash: 'nhash1xyz',
      configPart: 'eyJmb28iOiJiYXIifQ==',
    })
  })

  it('falls back to unknown for unsupported hash', () => {
    expect(parseHashRoute('#/wat/ever')).toEqual({ type: 'unknown', raw: '/wat/ever' })
    expect(parseHashRoute('#just-text')).toEqual({ type: 'unknown', raw: 'just-text' })
  })
})

describe('route builders', () => {
  it('builds encoded profile/song links', () => {
    expect(buildProfileRoute('npub1abc')).toBe('#/u/npub1abc')
    expect(buildSongRoute('npub1abc', 'my song')).toBe('#/song/npub1abc/my%20song')
  })
})
