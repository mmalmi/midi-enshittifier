import type { NDKUserProfile } from '@nostr-dev-kit/ndk'
import { nip19 } from 'nostr-tools'
import { ensureNdkConnected, getNdk } from './ndk'

const profileCache = new Map<string, NDKUserProfile | null>()
const inFlightProfiles = new Map<string, Promise<NDKUserProfile | null>>()

function isHexPubkey(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value)
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return null
}

export function pubkeyFromProfileInput(value: string | null | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null
  if (isHexPubkey(trimmed)) return trimmed.toLowerCase()

  try {
    const decoded = nip19.decode(trimmed)
    if (decoded.type !== 'npub') return null
    return (decoded.data as string).toLowerCase()
  } catch {
    return null
  }
}

export async function fetchUserProfile(pubkey: string, force = false): Promise<NDKUserProfile | null> {
  const normalized = pubkeyFromProfileInput(pubkey)
  if (!normalized) return null

  if (!force && profileCache.has(normalized)) {
    return profileCache.get(normalized) ?? null
  }

  if (!force) {
    const pending = inFlightProfiles.get(normalized)
    if (pending) return pending
  }

  const task = (async () => {
    try {
      await ensureNdkConnected()
      const user = getNdk().getUser({ pubkey: normalized })
      return await user.fetchProfile()
    } catch {
      return null
    }
  })()

  inFlightProfiles.set(normalized, task)

  try {
    const profile = await task
    profileCache.set(normalized, profile)
    return profile
  } finally {
    inFlightProfiles.delete(normalized)
  }
}

export function profileDisplayName(profile: NDKUserProfile | null | undefined, fallback = 'Anonymous Animal'): string {
  return firstNonEmpty([
    profile?.displayName,
    profile?.name,
    typeof profile?.display_name === 'string' ? profile.display_name : null,
    typeof profile?.username === 'string' ? profile.username : null,
    typeof profile?.nip05 === 'string' ? profile.nip05.split('@')[0] : null,
    fallback,
  ]) ?? fallback
}

export function profileAbout(profile: NDKUserProfile | null | undefined): string | null {
  return firstNonEmpty([
    profile?.about,
    typeof profile?.bio === 'string' ? profile.bio : null,
  ])
}

export function normalizeProfileImageUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^(data:image\/|blob:)/i.test(trimmed)) {
    return trimmed
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : trimmed.startsWith('//')
      ? `https:${trimmed}`
      : `https://${trimmed.replace(/^\/+/, '')}`

  try {
    const url = new URL(withScheme)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString()
    }
    return null
  } catch {
    return null
  }
}

export function profilePictureUrl(profile: NDKUserProfile | null | undefined): string | null {
  return normalizeProfileImageUrl(
    typeof profile?.picture === 'string'
      ? profile.picture
      : typeof profile?.image === 'string'
        ? profile.image
        : null,
  )
}

export function clearProfileCache(): void {
  profileCache.clear()
  inFlightProfiles.clear()
}
