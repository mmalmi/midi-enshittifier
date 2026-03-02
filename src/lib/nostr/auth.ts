import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { getNdk, NDKNip07Signer, NDKPrivateKeySigner, ensureNdkConnected } from './ndk'
import { clearSession, setSession } from './store'

const STORAGE_LOGIN_TYPE = 'midi-enshittifier:nostr:login-type'
const STORAGE_NSEC = 'midi-enshittifier:nostr:nsec'
const STORAGE_LOCAL_NSEC = 'midi-enshittifier:nostr:local-nsec'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface AuthDeps {
  storage: () => StorageLike | null
  getNdk: typeof getNdk
  ensureConnected: typeof ensureNdkConnected
  createNip07Signer: () => NDKNip07Signer
  createPrivateSigner: (nsec: string) => NDKPrivateKeySigner
  generateSecretKey: typeof generateSecretKey
  getPublicKey: typeof getPublicKey
  nip19: typeof nip19
}

const defaultDeps: AuthDeps = {
  storage: () => {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  },
  getNdk,
  ensureConnected: ensureNdkConnected,
  createNip07Signer: () => new NDKNip07Signer(),
  createPrivateSigner: (nsec: string) => new NDKPrivateKeySigner(nsec),
  generateSecretKey,
  getPublicKey,
  nip19,
}

let deps: AuthDeps = defaultDeps

function setLoginType(type: 'local' | 'nsec' | 'extension'): void {
  deps.storage()?.setItem(STORAGE_LOGIN_TYPE, type)
}

function getLoginType(): string | null {
  return deps.storage()?.getItem(STORAGE_LOGIN_TYPE) ?? null
}

function setStoredNsec(value: string): void {
  deps.storage()?.setItem(STORAGE_NSEC, value)
}

function getStoredNsec(): string | null {
  return deps.storage()?.getItem(STORAGE_NSEC) ?? null
}

function setStoredLocalNsec(value: string): void {
  deps.storage()?.setItem(STORAGE_LOCAL_NSEC, value)
}

function getStoredLocalNsec(): string | null {
  return deps.storage()?.getItem(STORAGE_LOCAL_NSEC) ?? null
}

function applySession(pubkey: string, loginType: 'local' | 'nsec' | 'extension'): void {
  const npub = deps.nip19.npubEncode(pubkey)
  setSession(pubkey, npub, loginType)
  setLoginType(loginType)
}

function ensureValidNsec(nsec: string): string {
  const decoded = deps.nip19.decode(nsec)
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec value')
  }
  return nsec
}

function connectInBackground(): void {
  deps.ensureConnected().catch((e) => {
    console.warn('[nostr/auth] relay connect failed:', e)
  })
}

export async function loginWithExtension(): Promise<boolean> {
  try {
    const signer = deps.createNip07Signer()
    const user = await signer.user()
    if (!user?.pubkey) throw new Error('Extension did not return pubkey')

    const ndk = deps.getNdk()
    ndk.signer = signer

    deps.storage()?.removeItem(STORAGE_NSEC)
    applySession(user.pubkey, 'extension')
    connectInBackground()
    return true
  } catch (e) {
    console.error('[nostr/auth] extension login failed:', e)
    return false
  }
}

export async function loginWithNsec(nsec: string): Promise<boolean> {
  try {
    const validNsec = ensureValidNsec(nsec.trim())
    const decoded = deps.nip19.decode(validNsec)
    const secret = decoded.data as Uint8Array
    const pubkey = deps.getPublicKey(secret)

    const signer = deps.createPrivateSigner(validNsec)
    const ndk = deps.getNdk()
    ndk.signer = signer

    setStoredNsec(validNsec)
    applySession(pubkey, 'nsec')
    connectInBackground()
    return true
  } catch (e) {
    console.error('[nostr/auth] nsec login failed:', e)
    return false
  }
}

export async function switchToLocalAutologin(): Promise<boolean> {
  try {
    let localNsec = getStoredLocalNsec()
    if (!localNsec) {
      const secret = deps.generateSecretKey()
      localNsec = deps.nip19.nsecEncode(secret)
      setStoredLocalNsec(localNsec)
    }

    const decoded = deps.nip19.decode(localNsec)
    if (decoded.type !== 'nsec') throw new Error('Invalid local key')
    const pubkey = deps.getPublicKey(decoded.data as Uint8Array)

    const signer = deps.createPrivateSigner(localNsec)
    const ndk = deps.getNdk()
    ndk.signer = signer

    applySession(pubkey, 'local')
    connectInBackground()
    return true
  } catch (e) {
    console.error('[nostr/auth] local autologin failed:', e)
    return false
  }
}

export async function restoreOrBootstrapSession(): Promise<boolean> {
  const loginType = getLoginType()

  if (loginType === 'extension') {
    const ok = await loginWithExtension()
    if (ok) return true
  }

  if (loginType === 'nsec') {
    const nsec = getStoredNsec()
    if (nsec) {
      const ok = await loginWithNsec(nsec)
      if (ok) return true
    }
  }

  return switchToLocalAutologin()
}

export function logout(): void {
  const ndk = deps.getNdk()
  ndk.signer = undefined
  clearSession()
}

export function __setAuthDepsForTests(overrides: Partial<AuthDeps>): void {
  deps = { ...deps, ...overrides }
}

export function __resetAuthDepsForTests(): void {
  deps = defaultDeps
}

export const authStorageKeys = {
  loginType: STORAGE_LOGIN_TYPE,
  nsec: STORAGE_NSEC,
  localNsec: STORAGE_LOCAL_NSEC,
}
