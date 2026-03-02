import { get, writable } from 'svelte/store'

export type LoginType = 'local' | 'nsec' | 'extension' | null

export interface NostrState {
  isLoggedIn: boolean
  pubkey: string | null
  npub: string | null
  loginType: LoginType
}

const initialState: NostrState = {
  isLoggedIn: false,
  pubkey: null,
  npub: null,
  loginType: null,
}

export const nostrStore = writable<NostrState>(initialState)

export function getNostrState(): NostrState {
  return get(nostrStore)
}

export function setSession(pubkey: string, npub: string, loginType: Exclude<LoginType, null>): void {
  nostrStore.set({
    isLoggedIn: true,
    pubkey,
    npub,
    loginType,
  })
}

export function clearSession(): void {
  nostrStore.set(initialState)
}
