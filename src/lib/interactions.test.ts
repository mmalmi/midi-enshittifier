import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetInteractionsRuntimeForTests,
  __setInteractionsRuntimeForTests,
  buildCommentTags,
  buildLikeTags,
  publishComment,
  subscribeLikes,
  toggleLike,
} from './interactions'

describe('interactions', () => {
  afterEach(() => {
    __resetInteractionsRuntimeForTests()
  })

  it('builds like and comment tags', () => {
    expect(buildLikeTags('npub1/songs/song1', { ownerPubkey: 'a', nhash: 'nhash1x' })).toEqual([
      ['i', 'npub1/songs/song1'],
      ['k', 'song'],
      ['i', 'nhash1x'],
      ['p', 'a'],
    ])

    expect(buildCommentTags('npub1/songs/song1', { ownerPubkey: 'b' })).toEqual([
      ['i', 'npub1/songs/song1'],
      ['k', 'song'],
      ['p', 'b'],
    ])
  })

  it('dedupes likes by pubkey in subscription stream', () => {
    let eventHandler: ((event: {
      id?: string
      pubkey: string
      content: string
      tags: string[][]
      created_at?: number
    }) => void) | undefined

    __setInteractionsRuntimeForTests({
      subscribe: (_filter, onEvent) => {
        eventHandler = onEvent
        return () => {}
      },
      publish: async () => {},
      currentUserPubkey: () => 'me',
      nowUnix: () => 123,
    })

    const counts: number[] = []
    const unsub = subscribeLikes('npub1/songs/song1', (snapshot) => {
      counts.push(snapshot.count)
    })

    ;(eventHandler as ((event: { pubkey: string; content: string; tags: string[][] }) => void) | undefined)?.({
      pubkey: 'alice',
      content: '+',
      tags: [],
    })
    ;(eventHandler as ((event: { pubkey: string; content: string; tags: string[][] }) => void) | undefined)?.({
      pubkey: 'alice',
      content: '+',
      tags: [],
    })
    ;(eventHandler as ((event: { pubkey: string; content: string; tags: string[][] }) => void) | undefined)?.({
      pubkey: 'bob',
      content: '',
      tags: [],
    })

    unsub()

    expect(counts[counts.length - 1]).toBe(2)
  })

  it('publishes like and comment events with expected kinds', async () => {
    const published: Array<{ kind: number; content: string; tags: string[][] }> = []

    __setInteractionsRuntimeForTests({
      subscribe: () => () => {},
      publish: async (event) => {
        published.push({ kind: event.kind, content: event.content, tags: event.tags })
      },
      currentUserPubkey: () => 'me',
      nowUnix: () => 456,
    })

    await toggleLike('npub1/songs/song1', {
      ownerPubkey: 'owner',
      nhash: 'nhash1song',
      currentlyLiked: false,
    })

    await publishComment('npub1/songs/song1', 'hello', {
      ownerPubkey: 'owner',
      nhash: 'nhash1song',
    })

    expect(published).toHaveLength(2)
    expect(published[0].kind).toBe(17)
    expect(published[0].content).toBe('+')
    expect(published[1].kind).toBe(1111)
    expect(published[1].content).toBe('hello')
  })
})
