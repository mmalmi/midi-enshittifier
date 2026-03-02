import { nip19 } from 'nostr-tools'
import { createNostrRefResolver, type NostrEvent, type NostrFilter, type NostrRefResolverConfig } from '@hashtree/nostr'
import type { RefResolver } from '@hashtree/core'
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk'
import { getNdk } from './ndk'
import { getNostrState } from './store'

export interface ResolverAdapter {
  subscribe: (filter: NostrFilter, onEvent: (event: NostrEvent) => void) => () => void
  publish: NostrRefResolverConfig['publish']
  getPubkey: () => string | null
}

function createDefaultAdapter(): ResolverAdapter {
  return {
    subscribe: (filter, onEvent) => {
      const ndk = getNdk()
      const ndkFilter: NDKFilter = {
        kinds: filter.kinds,
        authors: filter.authors,
      }
      if (filter['#d']) ndkFilter['#d'] = filter['#d']
      if (filter['#l']) ndkFilter['#l'] = filter['#l']

      const sub = ndk.subscribe(ndkFilter, { closeOnEose: false })
      sub.on('event', (e: NDKEvent) => {
        onEvent({
          id: e.id,
          pubkey: e.pubkey,
          kind: e.kind ?? 30078,
          content: e.content,
          tags: e.tags,
          created_at: e.created_at ?? 0,
        })
      })

      return () => {
        sub.stop()
      }
    },
    publish: async (event) => {
      try {
        const ndk = getNdk()
        const ndkEvent = new NDKEvent(ndk)
        ndkEvent.kind = event.kind
        ndkEvent.content = event.content
        ndkEvent.tags = event.tags
        if (event.created_at) ndkEvent.created_at = event.created_at
        await ndkEvent.publish()
        return true
      } catch {
        return false
      }
    },
    getPubkey: () => getNostrState().pubkey,
  }
}

let resolverSingleton: RefResolver | null = null
let adapterForTests: ResolverAdapter | null = null

function createResolver(configAdapter: ResolverAdapter): RefResolver {
  const config: NostrRefResolverConfig = {
    subscribe: configAdapter.subscribe,
    publish: configAdapter.publish,
    getPubkey: configAdapter.getPubkey,
    nip19,
  }
  return createNostrRefResolver(config)
}

export function getResolver(): RefResolver {
  if (resolverSingleton) return resolverSingleton
  const adapter = adapterForTests ?? createDefaultAdapter()
  resolverSingleton = createResolver(adapter)
  return resolverSingleton
}

export function resolverKeyForSongs(npub: string): string {
  return `${npub}/songs`
}

export function __setResolverAdapterForTests(adapter: ResolverAdapter): void {
  adapterForTests = adapter
  resolverSingleton = null
}

export function __resetResolverForTests(): void {
  adapterForTests = null
  resolverSingleton = null
}
