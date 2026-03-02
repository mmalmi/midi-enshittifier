import { writable, get } from 'svelte/store'
import { SocialGraph, type NostrEvent } from 'nostr-social-graph'

export const UNKNOWN_DISTANCE = 1000

interface SocialGraphState {
  rootPubkey: string | null
  version: number
}

const socialGraphStore = writable<SocialGraphState>({
  rootPubkey: null,
  version: 0,
})

let graph: SocialGraph | null = null

function bumpVersion(): void {
  socialGraphStore.update((state) => ({ ...state, version: state.version + 1 }))
}

export function initSocialGraph(rootPubkey: string): void {
  if (!graph) {
    graph = new SocialGraph(rootPubkey)
    socialGraphStore.set({ rootPubkey, version: 0 })
    return
  }

  if (get(socialGraphStore).rootPubkey !== rootPubkey) {
    void graph.setRoot(rootPubkey)
    socialGraphStore.set({ rootPubkey, version: get(socialGraphStore).version + 1 })
  }
}

export function ingestFollowEvent(event: NostrEvent): void {
  if (!graph) return
  graph.handleEvent(event, true)
  bumpVersion()
}

export function ingestFollowEvents(events: NostrEvent[]): void {
  if (!graph || events.length === 0) return
  graph.handleEvent(events, true)
  bumpVersion()
}

export function getFollowDistance(pubkey: string | null | undefined): number {
  if (!pubkey || !graph) return UNKNOWN_DISTANCE
  return graph.getFollowDistance(pubkey)
}

export function getFollows(pubkey: string | null | undefined): Set<string> {
  if (!pubkey || !graph) return new Set()
  return graph.getFollowedByUser(pubkey)
}

export function getFollowers(pubkey: string | null | undefined): Set<string> {
  if (!pubkey || !graph) return new Set()
  return graph.getFollowersByUser(pubkey)
}

export { socialGraphStore }

export function __resetSocialGraphForTests(): void {
  graph = null
  socialGraphStore.set({ rootPubkey: null, version: 0 })
}
