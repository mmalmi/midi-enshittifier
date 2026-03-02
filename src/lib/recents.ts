import { effects, type EnabledEffect } from './effects'

export interface RecentShare {
  nhash: string
  fileName: string
  recordName?: string
  config: { effects: EnabledEffect[]; seed: number }
  timestamp: number
}

const STORAGE_KEY = 'midi-enshittifier:recents'
const MAX_RECENTS = 20

function defaultConfig(): { effects: EnabledEffect[]; seed: number } {
  return {
    effects: effects.map((e) => ({ id: e.id, intensity: e.defaultIntensity })),
    seed: 0,
  }
}

function parseConfig(value: unknown): { effects: EnabledEffect[]; seed: number } | null {
  if (!value || typeof value !== 'object') return null
  const c = value as { effects?: unknown; seed?: unknown }
  if (!Array.isArray(c.effects) || typeof c.seed !== 'number') return null

  const parsedEffects: EnabledEffect[] = []
  for (const effect of c.effects) {
    if (!effect || typeof effect !== 'object') return null
    const e = effect as { id?: unknown; intensity?: unknown }
    if (typeof e.id !== 'string' || typeof e.intensity !== 'number') return null
    parsedEffects.push({ id: e.id, intensity: e.intensity })
  }

  return {
    effects: parsedEffects,
    seed: c.seed,
  }
}

function normalizeRecents(value: unknown): RecentShare[] {
  if (!Array.isArray(value)) return []

  const normalized: RecentShare[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    if (typeof entry.nhash !== 'string' || !entry.nhash) continue
    if (typeof entry.fileName !== 'string' || !entry.fileName) continue

    const config = parseConfig(entry.config) ?? defaultConfig()
    normalized.push({
      nhash: entry.nhash,
      fileName: entry.fileName,
      recordName: typeof entry.recordName === 'string' ? entry.recordName : undefined,
      config,
      timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
    })
  }

  return normalized.slice(0, MAX_RECENTS)
}

export function getRecents(): RecentShare[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return normalizeRecents(parsed)
  } catch {
    return []
  }
}

export function addRecent(entry: Omit<RecentShare, 'timestamp'>): RecentShare[] {
  const recents = getRecents().filter((r) => r.nhash !== entry.nhash)
  const item: RecentShare = { ...entry, timestamp: Date.now() }
  recents.unshift(item)
  const trimmed = recents.slice(0, MAX_RECENTS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  return trimmed
}

export function removeRecent(nhash: string): RecentShare[] {
  const recents = getRecents().filter((r) => r.nhash !== nhash)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recents))
  return recents
}

export function clearRecents(): RecentShare[] {
  localStorage.removeItem(STORAGE_KEY)
  return []
}
