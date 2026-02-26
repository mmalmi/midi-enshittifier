import { HashTree, FallbackStore, BlossomStore, LinkType } from '@hashtree/core'
import { DexieStore } from '@hashtree/dexie'
import { nhashEncode, nhashDecode, isNHash } from '@hashtree/core'
import type { EnabledEffect } from './effects'

const dexieStore = new DexieStore('midi-enshittifier')

const blossomStore = new BlossomStore({
  servers: [
    { url: 'https://cdn.iris.to', read: true, write: false },
    { url: 'https://upload.iris.to', read: false, write: true },
    { url: 'https://blossom.primal.net', read: true, write: true },
  ],
})

const store = new FallbackStore({
  primary: dexieStore,
  fallbacks: [blossomStore],
})

const tree = new HashTree({ store })

export interface SharePayload {
  nhash: string
}

export interface ShareConfig {
  effects: EnabledEffect[]
  seed: number
}

interface ShareManifestV1 {
  version: 1
  config: ShareConfig
  name?: string
}

export interface LoadedShare {
  data: Uint8Array
  config: ShareConfig | null
  name: string | null
}

function parseShareConfig(value: unknown): ShareConfig | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { effects?: unknown; seed?: unknown }
  if (!Array.isArray(v.effects) || typeof v.seed !== 'number') return null
  const effects: EnabledEffect[] = []
  for (const item of v.effects) {
    if (!item || typeof item !== 'object') return null
    const e = item as { id?: unknown; intensity?: unknown }
    if (typeof e.id !== 'string' || typeof e.intensity !== 'number') return null
    effects.push({ id: e.id, intensity: e.intensity })
  }
  return { effects, seed: v.seed }
}

/** Store original MIDI + share metadata as a directory and return nhash.
 *  Pushes to Blossom in background (fire-and-forget). */
export async function shareMidi(
  data: Uint8Array,
  config: ShareConfig,
  options?: { name?: string },
): Promise<SharePayload> {
  const original = await tree.putFile(data)
  const trimmedName = options?.name?.trim()
  const manifest: ShareManifestV1 = {
    version: 1,
    config,
    ...(trimmedName ? { name: trimmedName.slice(0, 120) } : {}),
  }
  const manifestData = new TextEncoder().encode(JSON.stringify(manifest))
  const manifestFile = await tree.putFile(manifestData)
  const dir = await tree.putDirectory([
    { name: 'original.mid', cid: original.cid, size: original.size, type: LinkType.File },
    { name: 'share.json', cid: manifestFile.cid, size: manifestFile.size, type: LinkType.File },
  ])
  const nhash = nhashEncode(dir.cid)

  // Fire-and-forget push to Blossom for cross-device access
  tree.push(dir.cid, blossomStore).catch(() => {})

  return { nhash }
}

/** Load MIDI binary from nhash. FallbackStore tries IDB first, then Blossom. */
export async function loadFromNhash(
  nhash: string,
): Promise<Uint8Array | null> {
  const share = await loadShareFromNhash(nhash, null)
  return share?.data ?? null
}

/** Load a share package (directory) or legacy file-only share. */
export async function loadShareFromNhash(
  nhash: string,
  fallbackConfig: ShareConfig | null,
): Promise<LoadedShare | null> {
  try {
    const cid = nhashDecode(nhash)
    const isDir = await tree.isDirectory(cid)
    if (!isDir) {
      const data = await tree.readFile(cid)
      return data instanceof Uint8Array
        ? { data, config: fallbackConfig, name: null }
        : null
    }

    let data: Uint8Array | null = null
    let config: ShareConfig | null = fallbackConfig
    let name: string | null = null

    const midiEntry = await tree.resolvePath(cid, 'original.mid')
    if (midiEntry?.type === LinkType.File) {
      data = await tree.readFile(midiEntry.cid)
    }
    if (!data) {
      const entries = await tree.listDirectory(cid)
      const fallbackMidi = entries.find((e) => e.type === LinkType.File && /\.mid$/i.test(e.name))
      if (fallbackMidi) data = await tree.readFile(fallbackMidi.cid)
    }

    const manifestEntry = await tree.resolvePath(cid, 'share.json')
    if (manifestEntry?.type === LinkType.File) {
      const manifestBytes = await tree.readFile(manifestEntry.cid)
      if (manifestBytes) {
        try {
          const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
            version?: unknown
            config?: unknown
            name?: unknown
          }
          const parsed = parseShareConfig(manifest.config)
          if (parsed) config = parsed
          if (typeof manifest.name === 'string' && manifest.name.trim()) {
            name = manifest.name.trim()
          }
        } catch {
          /* ignore malformed manifest */
        }
      }
    }

    return data ? { data, config, name } : null
  } catch {
    return null
  }
}

/** Encode sharing state into URL hash fragment. */
export function buildShareUrl(payload: SharePayload): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#${payload.nhash}`
}

/** Parse URL hash for nhash + optional config. */
export function parseUrlHash(): {
  nhash: string | null
  config: ShareConfig | null
} {
  const raw = location.hash.slice(1)
  if (!raw) return { nhash: null, config: null }

  const [nhashPart, configPart] = raw.split('!')
  const nhash = nhashPart && isNHash(nhashPart) ? nhashPart : null
  let config: ShareConfig | null = null

  if (configPart) {
    try {
      config = parseShareConfig(JSON.parse(atob(configPart)))
    } catch {
      /* ignore malformed config */
    }
  }

  return { nhash, config }
}
