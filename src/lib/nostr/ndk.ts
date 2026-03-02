import NDK, {
  NDKEvent,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  type NDKFilter,
  type NDKSubscription,
  type NostrEvent,
} from '@nostr-dev-kit/ndk'

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
]

let ndkSingleton: NDK | null = null
let connectPromise: Promise<void> | null = null

export function getNdk(): NDK {
  if (ndkSingleton) return ndkSingleton

  ndkSingleton = new NDK({
    explicitRelayUrls: DEFAULT_RELAYS,
  })
  return ndkSingleton
}

export function ensureNdkConnected(): Promise<void> {
  if (!connectPromise) {
    const ndk = getNdk()
    connectPromise = Promise.resolve(ndk.connect()).then(() => undefined).catch(() => undefined)
  }
  return connectPromise
}

export async function signEvent(event: NostrEvent): Promise<NostrEvent> {
  const ndk = getNdk()
  if (!ndk.signer) throw new Error('No signer configured')
  const ndkEvent = new NDKEvent(ndk, event)
  await ndkEvent.sign()
  return ndkEvent.rawEvent() as NostrEvent
}

export type { NDKFilter, NDKSubscription, NostrEvent }
export { NDK, NDKEvent, NDKNip07Signer, NDKPrivateKeySigner }
