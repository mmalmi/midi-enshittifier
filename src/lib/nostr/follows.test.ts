import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetFollowsRuntimeForTests,
  __setFollowsRuntimeForTests,
  buildFollowListEvent,
  extractFollowPubkeys,
  pickLatestFollowSnapshot,
  publishFollowList,
} from './follows'

describe('follows helpers', () => {
  afterEach(() => {
    __resetFollowsRuntimeForTests()
  })

  it('extracts unique follow pubkeys from tags', () => {
    const follows = extractFollowPubkeys([
      ['p', 'a'],
      ['p', 'b'],
      ['x', 'ignore'],
      ['p', 'a'],
    ])

    expect(follows).toEqual(['a', 'b'])
  })

  it('keeps latest follow snapshot by timestamp', () => {
    const first = pickLatestFollowSnapshot(null, {
      pubkey: 'author',
      tags: [['p', 'a']],
      created_at: 10,
    })
    const second = pickLatestFollowSnapshot(first, {
      pubkey: 'author',
      tags: [['p', 'b']],
      created_at: 9,
    })
    const third = pickLatestFollowSnapshot(first, {
      pubkey: 'author',
      tags: [['p', 'c']],
      created_at: 11,
    })

    expect(second.follows).toEqual(['a'])
    expect(third.follows).toEqual(['c'])
  })

  it('publishes kind 3 follow list payload', async () => {
    const published: Array<{ kind: number; content: string; tags: string[][]; created_at?: number }> = []

    __setFollowsRuntimeForTests({
      subscribe: () => () => {},
      publish: async (event) => {
        published.push(event)
      },
      currentPubkey: () => 'a'.repeat(64),
      now: () => 123,
    })

    const event = buildFollowListEvent(['x', 'y'], 123)
    expect(event).toEqual({
      kind: 3,
      content: '',
      tags: [
        ['p', 'x'],
        ['p', 'y'],
      ],
      created_at: 123,
    })

    const ok = await publishFollowList('a'.repeat(64), ['x', 'y'])
    expect(ok).toBe(true)
    expect(published).toHaveLength(1)
    expect(published[0].kind).toBe(3)
    expect(published[0].tags).toEqual([
      ['p', 'x'],
      ['p', 'y'],
    ])
  })
})
