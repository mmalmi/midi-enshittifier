import { BlossomStore, FallbackStore, HashTree, LinkType, type CID, type RefResolver, type TreeEntry } from '@hashtree/core'
import { DexieStore } from '@hashtree/dexie'
import { nip19 } from 'nostr-tools'
import type { EnabledEffect } from './effects'
import { buildSongRoute } from './router'
import { getNostrState } from './nostr/store'
import { getNdk } from './nostr/ndk'
import { getResolver, resolverKeyForSongs } from './nostr/resolver'
import { ensureNdkConnected } from './nostr/ndk'
import { createBlossomStore } from './blossom'

export interface SongManifest {
  version: 1
  id: string
  title: string
  createdAt: number
  ownerPubkey: string
  ownerNpub: string
  sourceFileName: string
  seed: number
  effects: EnabledEffect[]
}

export interface SongSummary extends SongManifest {
  rootNpub: string
}

export interface LoadedSong {
  manifest: SongManifest
  original: Uint8Array
  enshittified: Uint8Array
}

export interface PublishSongInput {
  title: string
  sourceFileName: string
  originalData: Uint8Array
  enshittifiedData: Uint8Array
  seed: number
  effects: EnabledEffect[]
}

export interface PublishSongResult {
  songId: string
  ownerNpub: string
  route: string
  manifest: SongManifest
  rootCid: CID
}

interface SongOrderFile {
  version: 1
  songIds: string[]
}

interface SongsTree {
  putFile(data: Uint8Array): Promise<{ cid: CID; size: number }>
  putDirectory(entries: Array<{ name: string; cid: CID; size: number; type: LinkType; meta?: Record<string, unknown> }>): Promise<{ cid: CID; size: number }>
  setEntry(
    root: CID,
    path: string[],
    name: string,
    entry: CID,
    size: number,
    type?: LinkType,
    meta?: Record<string, unknown>,
  ): Promise<CID>
  removeEntry(root: CID, path: string[], name: string): Promise<CID>
  isDirectory(id: CID): Promise<boolean>
  listDirectory(id: CID): Promise<TreeEntry[]>
  resolvePath(root: CID, path: string): Promise<{ cid: CID; type: LinkType } | null>
  readFile(id: CID): Promise<Uint8Array | null>
  push?(id: CID, store: unknown): Promise<unknown>
}

interface SongsDeps {
  tree: SongsTree
  resolver: RefResolver
  getOwner: () => Promise<{ pubkey: string; npub: string } | null> | { pubkey: string; npub: string } | null
  nowUnix: () => number
  makeSongId: (title: string) => string
  pushTarget?: unknown
  beforeResolve?: () => Promise<void>
}

let defaultTree: HashTree | null = null
let defaultBlossomStore: BlossomStore | null = null
const SONG_ORDER_FILE = 'order.json'

function getDefaultContext(): { tree: HashTree; blossomStore: BlossomStore } {
  if (defaultTree && defaultBlossomStore) {
    return { tree: defaultTree, blossomStore: defaultBlossomStore }
  }

  const dexie = new DexieStore('midi-enshittifier')
  const blossom = createBlossomStore()

  const fallback = new FallbackStore({
    primary: dexie,
    fallbacks: [blossom],
  })

  defaultTree = new HashTree({ store: fallback })
  defaultBlossomStore = blossom
  return { tree: defaultTree, blossomStore: defaultBlossomStore }
}

async function defaultOwner(): Promise<{ pubkey: string; npub: string } | null> {
  const state = getNostrState()
  if (state.pubkey && state.npub) return { pubkey: state.pubkey, npub: state.npub }

  // Fallback: recover identity from active signer if store update lagged.
  const signer = getNdk().signer as { user?: () => Promise<{ pubkey?: string | undefined } | null | undefined> } | undefined
  if (!signer?.user) return null

  try {
    const user = await signer.user()
    const pubkey = user?.pubkey
    if (!pubkey || pubkey.length !== 64) return null
    return { pubkey, npub: nip19.npubEncode(pubkey) }
  } catch {
    return null
  }
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim()
  return trimmed || 'Untitled song'
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function defaultSongId(title: string): string {
  const base = slugify(title) || 'song'
  const rand = Math.random().toString(36).slice(2, 8)
  return `${base}-${rand}`
}

function encodeManifest(manifest: SongManifest): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(manifest))
}

function normalizeSongIds(songIds: string[]): string[] {
  const unique: string[] = []
  const seen = new Set<string>()

  for (const value of songIds) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    unique.push(trimmed)
  }

  return unique
}

function encodeSongOrder(songIds: string[]): Uint8Array {
  const payload: SongOrderFile = {
    version: 1,
    songIds: normalizeSongIds(songIds),
  }
  return new TextEncoder().encode(JSON.stringify(payload))
}

function decodeManifest(bytes: Uint8Array): SongManifest {
  const raw = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
  return parseSongManifest(raw)
}

function decodeSongOrder(bytes: Uint8Array): string[] {
  const raw = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>

  if (raw.version !== 1 || !Array.isArray(raw.songIds)) {
    throw new Error('Invalid song order file')
  }

  return normalizeSongIds(raw.songIds.filter((value): value is string => typeof value === 'string'))
}

export function parseSongManifest(value: unknown): SongManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid song manifest: expected object')
  }

  const raw = value as Record<string, unknown>
  if (raw.version !== 1) throw new Error('Invalid song manifest: unsupported version')
  if (typeof raw.id !== 'string' || !raw.id) throw new Error('Invalid song manifest: id missing')
  if (typeof raw.title !== 'string') throw new Error('Invalid song manifest: title missing')
  if (typeof raw.createdAt !== 'number') throw new Error('Invalid song manifest: createdAt missing')
  if (typeof raw.ownerPubkey !== 'string') throw new Error('Invalid song manifest: ownerPubkey missing')
  if (typeof raw.ownerNpub !== 'string') throw new Error('Invalid song manifest: ownerNpub missing')
  if (typeof raw.sourceFileName !== 'string') throw new Error('Invalid song manifest: sourceFileName missing')
  if (typeof raw.seed !== 'number') throw new Error('Invalid song manifest: seed missing')
  if (!Array.isArray(raw.effects)) throw new Error('Invalid song manifest: effects missing')

  const effects: EnabledEffect[] = []
  for (const item of raw.effects) {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid song manifest: malformed effect')
    }
    const effect = item as { id?: unknown; intensity?: unknown }
    if (typeof effect.id !== 'string' || typeof effect.intensity !== 'number') {
      throw new Error('Invalid song manifest: malformed effect')
    }
    effects.push({ id: effect.id, intensity: effect.intensity })
  }

  return {
    version: 1,
    id: raw.id,
    title: raw.title,
    createdAt: raw.createdAt,
    ownerPubkey: raw.ownerPubkey,
    ownerNpub: raw.ownerNpub,
    sourceFileName: raw.sourceFileName,
    seed: raw.seed,
    effects,
  }
}

function summaryMeta(manifest: SongManifest): Record<string, unknown> {
  return {
    id: manifest.id,
    title: manifest.title,
    createdAt: manifest.createdAt,
    ownerPubkey: manifest.ownerPubkey,
    ownerNpub: manifest.ownerNpub,
    sourceFileName: manifest.sourceFileName,
    seed: manifest.seed,
    effects: manifest.effects,
  }
}

async function resolveRootOrNull(resolver: RefResolver, key: string): Promise<CID | null> {
  if (!resolver.resolve) return null
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800))
  return Promise.race([resolver.resolve(key), timeout])
}

async function readManifestFromEntry(tree: SongsTree, rootCid: CID, songId: string): Promise<SongManifest | null> {
  const manifestEntry = await tree.resolvePath(rootCid, `${songId}/song.json`)
  if (!manifestEntry || manifestEntry.type !== LinkType.File) return null
  const bytes = await tree.readFile(manifestEntry.cid)
  if (!bytes) return null

  try {
    return decodeManifest(bytes)
  } catch {
    return null
  }
}

async function readSongOrder(tree: SongsTree, rootCid: CID): Promise<string[] | null> {
  const orderEntry = await tree.resolvePath(rootCid, SONG_ORDER_FILE)
  if (!orderEntry || orderEntry.type !== LinkType.File) return null

  const bytes = await tree.readFile(orderEntry.cid)
  if (!bytes) return null

  try {
    return decodeSongOrder(bytes)
  } catch {
    return null
  }
}

export function createSongsApi(deps: SongsDeps) {
  async function resolveSongsRootOrNull(key: string): Promise<CID | null> {
    await deps.beforeResolve?.()
    return resolveRootOrNull(deps.resolver, key)
  }

  async function pushRootIfConfigured(rootCid: CID): Promise<void> {
    if (!deps.tree.push || !deps.pushTarget) return
    await deps.tree.push(rootCid, deps.pushTarget)
  }

  async function writeSongOrder(rootCid: CID, songIds: string[]): Promise<CID> {
    const orderFile = await deps.tree.putFile(encodeSongOrder(songIds))
    return deps.tree.setEntry(
      rootCid,
      [],
      SONG_ORDER_FILE,
      orderFile.cid,
      orderFile.size,
      LinkType.File,
    )
  }

  async function publishRoot(key: string, rootCid: CID): Promise<void> {
    if (!deps.resolver.publish) {
      throw new Error('Resolver publish is not available')
    }

    await pushRootIfConfigured(rootCid)

    const result = await deps.resolver.publish(key, rootCid, {
      visibility: 'public',
      labels: ['songs'],
    })

    if (!result.success) {
      throw new Error('Failed to publish songs root')
    }
  }

  async function publishSong(input: PublishSongInput): Promise<PublishSongResult> {
    const owner = await deps.getOwner()
    if (!owner) throw new Error('Must be logged in to publish')

    const title = normalizeTitle(input.title)
    const songId = deps.makeSongId(title)
    const key = resolverKeyForSongs(owner.npub)

    const manifest: SongManifest = {
      version: 1,
      id: songId,
      title,
      createdAt: deps.nowUnix(),
      ownerPubkey: owner.pubkey,
      ownerNpub: owner.npub,
      sourceFileName: input.sourceFileName,
      seed: input.seed,
      effects: input.effects,
    }

    const original = await deps.tree.putFile(input.originalData)
    const enshittified = await deps.tree.putFile(input.enshittifiedData)
    const manifestFile = await deps.tree.putFile(encodeManifest(manifest))

    const songDir = await deps.tree.putDirectory([
      { name: 'original.mid', cid: original.cid, size: original.size, type: LinkType.File },
      { name: 'enshittified.mid', cid: enshittified.cid, size: enshittified.size, type: LinkType.File },
      { name: 'song.json', cid: manifestFile.cid, size: manifestFile.size, type: LinkType.File },
    ])

    const existingRoot = await resolveSongsRootOrNull(key)
    const existingOrder = existingRoot ? (await listUserSongs(owner.npub)).map((song) => song.id) : []
    let nextRoot: CID

    if (existingRoot && (await deps.tree.isDirectory(existingRoot))) {
      nextRoot = await deps.tree.setEntry(
        existingRoot,
        [],
        songId,
        songDir.cid,
        songDir.size,
        LinkType.Dir,
        summaryMeta(manifest),
      )
    } else {
      const root = await deps.tree.putDirectory([
        {
          name: songId,
          cid: songDir.cid,
          size: songDir.size,
          type: LinkType.Dir,
          meta: summaryMeta(manifest),
        },
      ])
      nextRoot = root.cid
    }

    nextRoot = await writeSongOrder(nextRoot, [songId, ...existingOrder])

    await publishRoot(key, nextRoot)

    return {
      songId,
      ownerNpub: owner.npub,
      route: buildSongRoute(owner.npub, songId),
      manifest,
      rootCid: nextRoot,
    }
  }

  async function listUserSongs(npub: string): Promise<SongSummary[]> {
    const rootCid = await resolveSongsRootOrNull(resolverKeyForSongs(npub))
    if (!rootCid) return []
    if (!(await deps.tree.isDirectory(rootCid))) return []

    const entries = await deps.tree.listDirectory(rootCid)
    const summaries: SongSummary[] = []

    for (const entry of entries) {
      if (entry.type !== LinkType.Dir) continue

      let manifest: SongManifest | null = null
      if (entry.meta) {
        try {
          manifest = parseSongManifest({ version: 1, ...entry.meta, id: entry.name, ownerNpub: npub })
        } catch {
          manifest = null
        }
      }

      manifest ||= await readManifestFromEntry(deps.tree, rootCid, entry.name)
      if (!manifest) continue

      summaries.push({
        ...manifest,
        rootNpub: npub,
      })
    }

    const storedOrder = await readSongOrder(deps.tree, rootCid)
    if (!storedOrder) {
      return summaries.sort((a, b) => b.createdAt - a.createdAt)
    }

    const byId = new Map(summaries.map((song) => [song.id, song]))
    const ordered: SongSummary[] = []

    for (const songId of storedOrder) {
      const song = byId.get(songId)
      if (!song) continue
      ordered.push(song)
      byId.delete(songId)
    }

    const remainder = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt)
    return [...ordered, ...remainder]
  }

  async function loadSong(npub: string, songId: string): Promise<LoadedSong | null> {
    const rootCid = await resolveSongsRootOrNull(resolverKeyForSongs(npub))
    if (!rootCid) return null

    const manifest = await readManifestFromEntry(deps.tree, rootCid, songId)
    if (!manifest) return null

    const originalEntry = await deps.tree.resolvePath(rootCid, `${songId}/original.mid`)
    const enshittifiedEntry = await deps.tree.resolvePath(rootCid, `${songId}/enshittified.mid`)
    if (!originalEntry || !enshittifiedEntry) return null
    if (originalEntry.type !== LinkType.File || enshittifiedEntry.type !== LinkType.File) return null

    const original = await deps.tree.readFile(originalEntry.cid)
    const enshittified = await deps.tree.readFile(enshittifiedEntry.cid)
    if (!original || !enshittified) return null

    return {
      manifest,
      original,
      enshittified,
    }
  }

  async function deleteSong(songId: string): Promise<boolean> {
    const owner = await deps.getOwner()
    if (!owner) throw new Error('Must be logged in to delete')

    const key = resolverKeyForSongs(owner.npub)
    const rootCid = await resolveSongsRootOrNull(key)
    if (!rootCid) return false
    if (!(await deps.tree.isDirectory(rootCid))) return false

    const existingEntry = await deps.tree.resolvePath(rootCid, songId)
    if (!existingEntry || existingEntry.type !== LinkType.Dir) return false

    const currentOrder = (await listUserSongs(owner.npub)).map((song) => song.id)

    let nextRoot = await deps.tree.removeEntry(rootCid, [], songId)
    nextRoot = await writeSongOrder(nextRoot, currentOrder.filter((id) => id !== songId))

    await publishRoot(key, nextRoot)

    return true
  }

  async function reorderSongs(songIds: string[]): Promise<boolean> {
    const owner = await deps.getOwner()
    if (!owner) throw new Error('Must be logged in to reorder songs')

    const key = resolverKeyForSongs(owner.npub)
    const rootCid = await resolveSongsRootOrNull(key)
    if (!rootCid) return false
    if (!(await deps.tree.isDirectory(rootCid))) return false

    const currentOrder = (await listUserSongs(owner.npub)).map((song) => song.id)
    if (currentOrder.length === 0) return false

    const requested = normalizeSongIds(songIds).filter((id) => currentOrder.includes(id))
    const nextOrder = [...requested, ...currentOrder.filter((id) => !requested.includes(id))]

    let nextRoot = await writeSongOrder(rootCid, nextOrder)

    await publishRoot(key, nextRoot)

    return true
  }

  async function updateSongTitle(songId: string, title: string): Promise<SongManifest | null> {
    const owner = await deps.getOwner()
    if (!owner) throw new Error('Must be logged in to rename songs')

    const key = resolverKeyForSongs(owner.npub)
    const rootCid = await resolveSongsRootOrNull(key)
    if (!rootCid) return null
    if (!(await deps.tree.isDirectory(rootCid))) return null

    const songEntry = await deps.tree.resolvePath(rootCid, songId)
    if (!songEntry || songEntry.type !== LinkType.Dir) return null

    const manifest = await readManifestFromEntry(deps.tree, rootCid, songId)
    if (!manifest) return null
    if (manifest.ownerPubkey !== owner.pubkey) {
      throw new Error("Cannot rename someone else's song")
    }

    const nextManifest: SongManifest = {
      ...manifest,
      title: normalizeTitle(title),
    }

    if (nextManifest.title === manifest.title) {
      return nextManifest
    }

    const manifestFile = await deps.tree.putFile(encodeManifest(nextManifest))
    const songEntries = await deps.tree.listDirectory(songEntry.cid)
    const nextSongDir = await deps.tree.putDirectory(
      songEntries.map((entry) =>
        entry.name === 'song.json'
          ? {
              name: 'song.json',
              cid: manifestFile.cid,
              size: manifestFile.size,
              type: LinkType.File,
            }
          : {
              name: entry.name,
              cid: entry.cid,
              size: entry.size,
              type: entry.type,
              meta: entry.meta,
            },
      ),
    )
    const nextRoot = await deps.tree.setEntry(
      rootCid,
      [],
      songId,
      nextSongDir.cid,
      nextSongDir.size,
      LinkType.Dir,
      summaryMeta(nextManifest),
    )

    await publishRoot(key, nextRoot)

    return nextManifest
  }

  return {
    publishSong,
    listUserSongs,
    loadSong,
    deleteSong,
    reorderSongs,
    updateSongTitle,
  }
}

const defaultApi = (() => {
  const { tree, blossomStore } = getDefaultContext()
  return createSongsApi({
    tree,
    resolver: getResolver(),
    getOwner: defaultOwner,
    nowUnix: () => Math.floor(Date.now() / 1000),
    makeSongId: defaultSongId,
    pushTarget: blossomStore,
    beforeResolve: ensureNdkConnected,
  })
})()

export const publishSong = defaultApi.publishSong
export const listUserSongs = defaultApi.listUserSongs
export const loadSong = defaultApi.loadSong
export const deleteSong = defaultApi.deleteSong
export const reorderSongs = defaultApi.reorderSongs
export const updateSongTitle = defaultApi.updateSongTitle
