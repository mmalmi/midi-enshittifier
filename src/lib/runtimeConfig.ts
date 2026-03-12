import type { BlossomServer } from '@hashtree/core'

export const DEFAULT_NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
]

export const DEFAULT_BLOSSOM_SERVERS: BlossomServer[] = [
  { url: 'https://cdn.iris.to', read: true, write: false },
  { url: 'https://upload.iris.to', read: false, write: true },
  { url: 'https://blossom.primal.net', read: true, write: true },
]

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function getNostrRelayUrls(): string[] {
  const configured = splitList(import.meta.env.VITE_NOSTR_RELAYS)
  return configured.length > 0 ? configured : DEFAULT_NOSTR_RELAYS
}

export function getBlossomServers(): BlossomServer[] {
  const singleServer = import.meta.env.VITE_BLOSSOM_URL?.trim()
  if (singleServer) {
    return [{ url: singleServer, read: true, write: true }]
  }

  return DEFAULT_BLOSSOM_SERVERS
}
