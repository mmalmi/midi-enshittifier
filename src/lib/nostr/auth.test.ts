import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateSecretKey, nip19 } from 'nostr-tools'
import {
  __resetAuthDepsForTests,
  __setAuthDepsForTests,
  authStorageKeys,
  loginWithNsec,
  restoreOrBootstrapSession,
} from './auth'
import { clearSession, getNostrState } from './store'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    dump: () => data,
  }
}

describe('nostr auth', () => {
  beforeEach(() => {
    clearSession()
  })

  afterEach(() => {
    __resetAuthDepsForTests()
    clearSession()
  })

  it('bootstraps local autologin on first run', async () => {
    const storage = memoryStorage()
    const ndk = { signer: undefined as unknown }

    __setAuthDepsForTests({
      storage: () => storage,
      getNdk: () => ndk as never,
      ensureConnected: async () => {},
      createPrivateSigner: (nsec) => ({ nsec }) as never,
      createNip07Signer: () => ({ user: async () => ({ pubkey: 'x' }) }) as never,
    })

    const ok = await restoreOrBootstrapSession()
    expect(ok).toBe(true)

    const state = getNostrState()
    expect(state.isLoggedIn).toBe(true)
    expect(state.loginType).toBe('local')
    expect(storage.getItem(authStorageKeys.localNsec)).toMatch(/^nsec1/)
  })

  it('restores extension login when configured', async () => {
    const storage = memoryStorage({
      [authStorageKeys.loginType]: 'extension',
    })
    const ndk = { signer: undefined as unknown }

    __setAuthDepsForTests({
      storage: () => storage,
      getNdk: () => ndk as never,
      ensureConnected: async () => {},
      createPrivateSigner: (nsec) => ({ nsec }) as never,
      createNip07Signer: () =>
        ({
          user: async () => ({
            pubkey: 'f'.repeat(64),
          }),
        }) as never,
    })

    const ok = await restoreOrBootstrapSession()
    expect(ok).toBe(true)

    const state = getNostrState()
    expect(state.loginType).toBe('extension')
    expect(state.pubkey).toBe('f'.repeat(64))
  })

  it('restores nsec login and overrides autologin state', async () => {
    const nsec = nip19.nsecEncode(generateSecretKey())
    const storage = memoryStorage({
      [authStorageKeys.loginType]: 'nsec',
      [authStorageKeys.nsec]: nsec,
    })
    const ndk = { signer: undefined as unknown }

    __setAuthDepsForTests({
      storage: () => storage,
      getNdk: () => ndk as never,
      ensureConnected: async () => {},
      createPrivateSigner: (value) => ({ value }) as never,
      createNip07Signer: () => ({ user: async () => ({ pubkey: 'x' }) }) as never,
    })

    const ok = await restoreOrBootstrapSession()
    expect(ok).toBe(true)

    const state = getNostrState()
    expect(state.isLoggedIn).toBe(true)
    expect(state.loginType).toBe('nsec')
    expect(state.npub?.startsWith('npub1')).toBe(true)
  })

  it('persists nsec when logging in with one directly', async () => {
    const nsec = nip19.nsecEncode(generateSecretKey())
    const storage = memoryStorage()
    const ndk = { signer: undefined as unknown }

    __setAuthDepsForTests({
      storage: () => storage,
      getNdk: () => ndk as never,
      ensureConnected: async () => {},
      createPrivateSigner: (value) => ({ value }) as never,
      createNip07Signer: () => ({ user: async () => ({ pubkey: 'x' }) }) as never,
    })

    const ok = await loginWithNsec(nsec)
    expect(ok).toBe(true)

    const state = getNostrState()
    expect(state.isLoggedIn).toBe(true)
    expect(state.loginType).toBe('nsec')
    expect(storage.getItem(authStorageKeys.nsec)).toBe(nsec)
    expect(storage.getItem(authStorageKeys.loginType)).toBe('nsec')
  })
})
