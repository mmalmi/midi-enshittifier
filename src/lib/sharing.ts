import { HashTree, FallbackStore, BlossomStore } from '@hashtree/core'
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
  configFragment: string // URL-safe effect config
}

/** Store original MIDI binary (encrypted) and return nhash + config fragment.
 *  Pushes to Blossom in background (fire-and-forget). */
export async function shareMidi(
  data: Uint8Array,
  config: { effects: EnabledEffect[]; seed: number },
): Promise<SharePayload> {
  const { cid } = await tree.putFile(data)
  const nhash = nhashEncode(cid)
  const configFragment = btoa(JSON.stringify(config))

  // Fire-and-forget push to Blossom for cross-device access
  tree.push(cid, blossomStore).catch(() => {})

  return { nhash, configFragment }
}

/** Load MIDI binary from nhash. FallbackStore tries IDB first, then Blossom. */
export async function loadFromNhash(
  nhash: string,
): Promise<Uint8Array | null> {
  try {
    const cid = nhashDecode(nhash)
    const data = await tree.readFile(cid)
    return data instanceof Uint8Array ? data : null
  } catch {
    return null
  }
}

/** Encode sharing state into URL hash fragment. */
export function buildShareUrl(payload: SharePayload): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#${payload.nhash}!${payload.configFragment}`
}

/** Parse URL hash for nhash + optional config. */
export function parseUrlHash(): {
  nhash: string | null
  config: { effects: EnabledEffect[]; seed: number } | null
} {
  const raw = location.hash.slice(1)
  if (!raw) return { nhash: null, config: null }

  const [nhashPart, configPart] = raw.split('!')
  const nhash = nhashPart && isNHash(nhashPart) ? nhashPart : null
  let config: { effects: EnabledEffect[]; seed: number } | null = null

  if (configPart) {
    try {
      config = JSON.parse(atob(configPart))
    } catch {
      /* ignore malformed config */
    }
  }

  return { nhash, config }
}
