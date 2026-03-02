import { afterEach, describe, expect, it } from 'vitest'
import { cid, fromHex, toHex } from '@hashtree/core'
import { nip19 } from 'nostr-tools'
import {
  __resetResolverForTests,
  __setResolverAdapterForTests,
  getResolver,
  resolverKeyForSongs,
} from './resolver'

describe('resolver integration', () => {
  afterEach(() => {
    __resetResolverForTests()
  })

  it('builds songs key', () => {
    expect(resolverKeyForSongs('npub1abc')).toBe('npub1abc/songs')
  })

  it('maps resolver subscribe events into CIDs', () => {
    const pubkey = '1'.repeat(64)
    const npub = nip19.npubEncode(pubkey)
    const hashHex = 'ab'.repeat(32)

    let pushedEvent: ((event: {
      id?: string
      pubkey: string
      kind: number
      content: string
      tags: string[][]
      created_at: number
    }) => void) | undefined

    __setResolverAdapterForTests({
      subscribe: (_filter, onEvent) => {
        pushedEvent = onEvent
        return () => {}
      },
      publish: async () => true,
      getPubkey: () => pubkey,
    })

    const resolver = getResolver()

    let seenHex: string | null = null
    const unsub = resolver.subscribe(`${npub}/songs`, (value) => {
      if (value) {
        seenHex = toHex(value.hash)
      }
    })

    ;(pushedEvent as ((event: { pubkey: string; kind: number; content: string; tags: string[][]; created_at: number }) => void) | undefined)?.({
      pubkey,
      kind: 30078,
      content: '',
      tags: [
        ['d', 'songs'],
        ['hash', hashHex],
      ],
      created_at: 1,
    })

    unsub()
    expect(seenHex).toBe(hashHex)
  })

  it('publishes resolver update through adapter', async () => {
    const pubkey = '2'.repeat(64)
    const npub = nip19.npubEncode(pubkey)
    const published: Array<{ kind: number; tags: string[][]; content: string }> = []

    __setResolverAdapterForTests({
      subscribe: () => () => {},
      publish: async (event) => {
        published.push({ kind: event.kind, tags: event.tags, content: event.content })
        return true
      },
      getPubkey: () => pubkey,
    })

    const resolver = getResolver()
    const hash = fromHex('cd'.repeat(32))
    const result = await resolver.publish?.(`${npub}/songs`, cid(hash), {
      visibility: 'public',
      labels: ['songs'],
    })

    expect(result?.success).toBe(true)
    expect(published).toHaveLength(1)
    expect(published[0].kind).toBe(30078)
    expect(published[0].tags.find((t) => t[0] === 'd')?.[1]).toBe('songs')
  })
})
