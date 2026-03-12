import { describe, expect, it } from 'vitest'
import { normalizeProfileImageUrl, profileAbout, profileDisplayName, pubkeyFromProfileInput } from './profiles'

describe('pubkeyFromProfileInput', () => {
  it('accepts raw hex pubkeys', () => {
    expect(pubkeyFromProfileInput('A'.repeat(64))).toBe('a'.repeat(64))
  })

  it('rejects invalid identifiers', () => {
    expect(pubkeyFromProfileInput('not-a-pubkey')).toBeNull()
  })
})

describe('profileDisplayName', () => {
  it('prefers explicit profile names', () => {
    expect(profileDisplayName({ displayName: 'Display Name', name: 'Name' }, 'Fallback')).toBe('Display Name')
    expect(profileDisplayName({ name: 'Name' }, 'Fallback')).toBe('Name')
  })

  it('falls back to nip05 local part before the provided fallback', () => {
    expect(profileDisplayName({ nip05: 'martti@example.com' }, 'Fallback')).toBe('martti')
    expect(profileDisplayName(null, 'Fallback')).toBe('Fallback')
  })
})

describe('profileAbout', () => {
  it('uses about or bio text when present', () => {
    expect(profileAbout({ about: 'about me' })).toBe('about me')
    expect(profileAbout({ bio: 'bio text' })).toBe('bio text')
    expect(profileAbout(null)).toBeNull()
  })
})

describe('normalizeProfileImageUrl', () => {
  it('normalizes bare hosts to https', () => {
    expect(normalizeProfileImageUrl('m.primal.net/QPfK.jpg')).toBe('https://m.primal.net/QPfK.jpg')
  })

  it('preserves supported urls and image data URIs', () => {
    expect(normalizeProfileImageUrl('https://example.com/avatar.png')).toBe('https://example.com/avatar.png')
    expect(normalizeProfileImageUrl('data:image/svg+xml;utf8,<svg/>')).toBe('data:image/svg+xml;utf8,<svg/>')
  })

  it('rejects unsupported protocols', () => {
    expect(normalizeProfileImageUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeProfileImageUrl('ftp://example.com/avatar.png')).toBeNull()
  })
})
