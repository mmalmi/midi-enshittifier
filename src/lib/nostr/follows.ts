import { NDKEvent, type NDKFilter, type NDKSubscription } from '@nostr-dev-kit/ndk'
import { getNdk } from './ndk'
import { getNostrState } from './store'

export interface FollowListSnapshot {
  pubkey: string
  follows: string[]
  createdAt: number
}

export interface FollowEventLike {
  pubkey: string
  tags: string[][]
  created_at?: number
}

interface FollowsRuntime {
  subscribe: (
    filter: NDKFilter,
    onEvent: (event: FollowEventLike) => void,
    onEose?: () => void,
  ) => () => void
  publish: (event: { kind: number; content: string; tags: string[][]; created_at?: number }) => Promise<void>
  currentPubkey: () => string | null
  now: () => number
}

function createDefaultRuntime(): FollowsRuntime {
  return {
    subscribe: (filter, onEvent, onEose) => {
      const ndk = getNdk()
      const sub: NDKSubscription = ndk.subscribe(filter, { closeOnEose: false })
      sub.on('event', (event: NDKEvent) => {
        onEvent({
          pubkey: event.pubkey,
          tags: event.tags,
          created_at: event.created_at,
        })
      })
      if (onEose) sub.on('eose', onEose)
      return () => sub.stop()
    },
    publish: async (event) => {
      const ndk = getNdk()
      const ndkEvent = new NDKEvent(ndk)
      ndkEvent.kind = event.kind
      ndkEvent.content = event.content
      ndkEvent.tags = event.tags
      if (event.created_at) ndkEvent.created_at = event.created_at
      await ndkEvent.publish()
    },
    currentPubkey: () => getNostrState().pubkey,
    now: () => Math.floor(Date.now() / 1000),
  }
}

let runtime: FollowsRuntime = createDefaultRuntime()
let lastFollowTimestamp = 0

export function extractFollowPubkeys(tags: string[][]): string[] {
  const seen = new Set<string>()
  for (const tag of tags) {
    if (tag[0] !== 'p' || !tag[1]) continue
    seen.add(tag[1])
  }
  return Array.from(seen)
}

export function buildFollowListEvent(follows: string[], createdAt?: number): {
  kind: 3
  content: ''
  tags: string[][]
  created_at?: number
} {
  return {
    kind: 3,
    content: '',
    tags: follows.map((p) => ['p', p]),
    ...(createdAt ? { created_at: createdAt } : {}),
  }
}

export function pickLatestFollowSnapshot(
  current: FollowListSnapshot | null,
  event: FollowEventLike,
): FollowListSnapshot {
  const createdAt = event.created_at ?? 0
  const next: FollowListSnapshot = {
    pubkey: event.pubkey,
    follows: extractFollowPubkeys(event.tags),
    createdAt,
  }

  if (!current || next.createdAt >= current.createdAt) return next
  return current
}

export function subscribeFollows(
  pubkey: string,
  onUpdate: (snapshot: FollowListSnapshot) => void,
): () => void {
  let latest: FollowListSnapshot | null = null

  return runtime.subscribe(
    { kinds: [3], authors: [pubkey] },
    (event) => {
      latest = pickLatestFollowSnapshot(latest, event)
      if (latest) onUpdate(latest)
    },
  )
}

export async function getFollowsForPubkey(pubkey: string, timeoutMs = 2000): Promise<string[]> {
  return new Promise((resolve) => {
    let resolved = false
    let latest: FollowListSnapshot | null = null

    const done = () => {
      if (resolved) return
      resolved = true
      unsub()
      resolve(latest?.follows ?? [])
    }

    const unsub = runtime.subscribe(
      { kinds: [3], authors: [pubkey] },
      (event) => {
        latest = pickLatestFollowSnapshot(latest, event)
      },
      done,
    )

    setTimeout(done, timeoutMs)
  })
}

export async function publishFollowList(pubkey: string, follows: string[]): Promise<boolean> {
  try {
    const now = runtime.now()
    const createdAt = Math.max(now, lastFollowTimestamp + 1)
    lastFollowTimestamp = createdAt
    const event = buildFollowListEvent(follows, createdAt)
    await runtime.publish(event)
    return true
  } catch {
    return false
  }
}

export async function followPubkey(targetPubkey: string): Promise<boolean> {
  const me = runtime.currentPubkey()
  if (!me) return false

  const current = await getFollowsForPubkey(me)
  if (current.includes(targetPubkey)) return true
  return publishFollowList(me, [...current, targetPubkey])
}

export async function unfollowPubkey(targetPubkey: string): Promise<boolean> {
  const me = runtime.currentPubkey()
  if (!me) return false

  const current = await getFollowsForPubkey(me)
  if (!current.includes(targetPubkey)) return true
  return publishFollowList(me, current.filter((pk) => pk !== targetPubkey))
}

export function __setFollowsRuntimeForTests(next: FollowsRuntime): void {
  runtime = next
  lastFollowTimestamp = 0
}

export function __resetFollowsRuntimeForTests(): void {
  runtime = createDefaultRuntime()
  lastFollowTimestamp = 0
}
