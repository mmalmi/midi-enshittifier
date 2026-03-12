import { describe, expect, it } from 'vitest'
import { HashTree, MemoryStore, type CID, type PublishResult, type RefResolver } from '@hashtree/core'
import { createSongsApi, parseSongManifest } from './songs'

function createTestSongsApi() {
  const tree = new HashTree({ store: new MemoryStore() })
  const roots = new Map<string, CID>()
  let seq = 0

  const resolver: RefResolver = {
    resolve: async (key) => roots.get(key) ?? null,
    subscribe: () => () => {},
    publish: async (key, cid): Promise<PublishResult> => {
      roots.set(key, cid)
      return { success: true }
    },
  }

  const api = createSongsApi({
    tree,
    resolver,
    getOwner: () => ({ pubkey: 'a'.repeat(64), npub: 'npub1owner' }),
    nowUnix: () => 1000 + seq,
    makeSongId: () => `song-${++seq}`,
  })

  return { api }
}

describe('songs api', () => {
  it('creates songs root from empty and roundtrips load', async () => {
    const { api } = createTestSongsApi()

    const result = await api.publishSong({
      title: 'My Song',
      sourceFileName: 'foo.mid',
      originalData: new Uint8Array([1, 2, 3]),
      enshittifiedData: new Uint8Array([4, 5, 6]),
      seed: 42,
      effects: [{ id: 'drunkNotes', intensity: 0.4 }],
    })

    expect(result.songId).toBe('song-1')

    const list = await api.listUserSongs('npub1owner')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('song-1')
    expect(list[0].title).toBe('My Song')

    const loaded = await api.loadSong('npub1owner', 'song-1')
    expect(loaded?.manifest.id).toBe('song-1')
    expect(Array.from(loaded?.original ?? [])).toEqual([1, 2, 3])
    expect(Array.from(loaded?.enshittified ?? [])).toEqual([4, 5, 6])
  })

  it('appends songs without deleting existing entries', async () => {
    const { api } = createTestSongsApi()

    await api.publishSong({
      title: 'First',
      sourceFileName: 'first.mid',
      originalData: new Uint8Array([1]),
      enshittifiedData: new Uint8Array([2]),
      seed: 1,
      effects: [{ id: 'a', intensity: 1 }],
    })

    await api.publishSong({
      title: 'Second',
      sourceFileName: 'second.mid',
      originalData: new Uint8Array([3]),
      enshittifiedData: new Uint8Array([4]),
      seed: 2,
      effects: [{ id: 'b', intensity: 0.5 }],
    })

    const list = await api.listUserSongs('npub1owner')
    expect(list.map((s) => s.id).sort()).toEqual(['song-1', 'song-2'])

    const first = await api.loadSong('npub1owner', 'song-1')
    const second = await api.loadSong('npub1owner', 'song-2')
    expect(first?.manifest.title).toBe('First')
    expect(second?.manifest.title).toBe('Second')
  })

  it('deletes a published song from the owner root', async () => {
    const { api } = createTestSongsApi()

    await api.publishSong({
      title: 'First',
      sourceFileName: 'first.mid',
      originalData: new Uint8Array([1]),
      enshittifiedData: new Uint8Array([2]),
      seed: 1,
      effects: [{ id: 'a', intensity: 1 }],
    })

    await api.publishSong({
      title: 'Second',
      sourceFileName: 'second.mid',
      originalData: new Uint8Array([3]),
      enshittifiedData: new Uint8Array([4]),
      seed: 2,
      effects: [{ id: 'b', intensity: 0.5 }],
    })

    await expect(api.deleteSong('song-1')).resolves.toBe(true)

    const list = await api.listUserSongs('npub1owner')
    expect(list.map((song) => song.id)).toEqual(['song-2'])
    await expect(api.loadSong('npub1owner', 'song-1')).resolves.toBeNull()
    expect((await api.loadSong('npub1owner', 'song-2'))?.manifest.title).toBe('Second')
  })

  it('keeps an empty songs root after deleting the last song', async () => {
    const { api } = createTestSongsApi()

    await api.publishSong({
      title: 'Solo',
      sourceFileName: 'solo.mid',
      originalData: new Uint8Array([1]),
      enshittifiedData: new Uint8Array([2]),
      seed: 3,
      effects: [{ id: 'solo', intensity: 0.9 }],
    })

    await expect(api.deleteSong('song-1')).resolves.toBe(true)
    await expect(api.listUserSongs('npub1owner')).resolves.toEqual([])
    await expect(api.loadSong('npub1owner', 'song-1')).resolves.toBeNull()
  })

  it('returns false when deleting a missing song', async () => {
    const { api } = createTestSongsApi()

    await expect(api.deleteSong('song-404')).resolves.toBe(false)
  })

  it('validates and parses song manifests deterministically', () => {
    const parsed = parseSongManifest({
      version: 1,
      id: 'song-x',
      title: 'Name',
      createdAt: 123,
      ownerPubkey: 'a'.repeat(64),
      ownerNpub: 'npub1x',
      sourceFileName: 'f.mid',
      seed: 9,
      effects: [{ id: 'effect', intensity: 0.2 }],
    })

    expect(parsed.id).toBe('song-x')
    expect(parsed.effects[0].id).toBe('effect')

    expect(() => parseSongManifest({})).toThrow()
    expect(() =>
      parseSongManifest({
        version: 1,
        id: 'x',
        title: 'x',
        createdAt: 1,
        ownerPubkey: 'a'.repeat(64),
        ownerNpub: 'npub1x',
        sourceFileName: 'x.mid',
        seed: 1,
        effects: [{ id: 'ok' }],
      }),
    ).toThrow()
  })
})
