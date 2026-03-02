import { describe, expect, it } from 'vitest'
import { nip19 } from 'nostr-tools'
import { animalName, animalNameFromNpub, animalNameFromPubkey, pubkeyFromNpub } from './animalName'

describe('animalName', () => {
  it('is deterministic for same seed', () => {
    const first = animalName('a'.repeat(64))
    const second = animalName('a'.repeat(64))
    expect(first).toBe(second)
  })

  it('decodes npub and derives same name as pubkey', () => {
    const pubkey = 'f'.repeat(64)
    const npub = nip19.npubEncode(pubkey)

    expect(pubkeyFromNpub(npub)).toBe(pubkey)
    expect(animalNameFromNpub(npub)).toBe(animalNameFromPubkey(pubkey))
  })

  it('handles invalid identifiers safely', () => {
    expect(animalNameFromNpub('not-npub')).toBe('Anonymous Animal')
    expect(animalNameFromPubkey(null)).toBe('Anonymous Animal')
  })
})
