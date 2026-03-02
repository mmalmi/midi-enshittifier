import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addRecent, getRecents, clearRecents } from './recents'

class MemoryStorage {
  private data = new Map<string, string>()

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  clear(): void {
    this.data.clear()
  }
}

describe('recents normalization', () => {
  const storage = new MemoryStorage()

  beforeEach(() => {
    ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage
    storage.clear()
  })

  afterEach(() => {
    storage.clear()
  })

  it('falls back to default config for stale malformed entries', () => {
    storage.setItem(
      'midi-enshittifier:recents',
      JSON.stringify([
        {
          nhash: 'nhash1abc',
          fileName: 'old.mid',
          timestamp: 123,
          config: { bad: true },
        },
      ]),
    )

    const recents = getRecents()
    expect(recents).toHaveLength(1)
    expect(recents[0].config.effects.length).toBeGreaterThan(0)
    expect(typeof recents[0].config.seed).toBe('number')
  })

  it('keeps valid entries intact', () => {
    addRecent({
      nhash: 'nhash1xyz',
      fileName: 'song.mid',
      recordName: 'Song',
      config: {
        effects: [{ id: 'drunkNotes', intensity: 0.7 }],
        seed: 42,
      },
    })

    const recents = getRecents()
    expect(recents).toHaveLength(1)
    expect(recents[0].nhash).toBe('nhash1xyz')
    expect(recents[0].config.seed).toBe(42)
  })

  it('clearRecents removes stored recents', () => {
    addRecent({
      nhash: 'nhash1clear',
      fileName: 'clear.mid',
      config: {
        effects: [{ id: 'drunkNotes', intensity: 0.3 }],
        seed: 1,
      },
    })

    expect(getRecents()).toHaveLength(1)
    clearRecents()
    expect(getRecents()).toHaveLength(0)
  })
})
