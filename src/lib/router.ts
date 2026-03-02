export type AppRoute =
  | { type: 'home' }
  | { type: 'feed' }
  | { type: 'profile'; npub: string }
  | { type: 'song'; npub: string; songId: string }
  | { type: 'legacy-share'; nhash: string; configPart: string | null }
  | { type: 'unknown'; raw: string }

function normalizeHash(hash: string): string {
  if (!hash) return ''
  return hash.startsWith('#') ? hash.slice(1) : hash
}

export function parseHashRoute(hash: string): AppRoute {
  const raw = normalizeHash(hash)
  if (!raw || raw === '/') return { type: 'home' }

  // Legacy share format: #nhash1... or #nhash1...!<base64>
  if (raw.startsWith('nhash1')) {
    const [nhash, configPart] = raw.split('!')
    if (nhash) return { type: 'legacy-share', nhash, configPart: configPart ?? null }
  }

  // Hash router format: #/path/segments
  if (!raw.startsWith('/')) return { type: 'unknown', raw }

  const parts = raw
    .slice(1)
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p))

  if (parts.length === 0) return { type: 'home' }

  if (parts[0] === 'feed' && parts.length === 1) {
    return { type: 'feed' }
  }

  if (parts[0] === 'u' && parts.length === 2) {
    return { type: 'profile', npub: parts[1] }
  }

  if (parts[0] === 'song' && parts.length === 3) {
    return { type: 'song', npub: parts[1], songId: parts[2] }
  }

  return { type: 'unknown', raw }
}

export function buildSongRoute(npub: string, songId: string): string {
  return `#/song/${encodeURIComponent(npub)}/${encodeURIComponent(songId)}`
}

export function buildProfileRoute(npub: string): string {
  return `#/u/${encodeURIComponent(npub)}`
}
