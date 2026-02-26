import type { EnabledEffect } from './effects'

export interface RecentShare {
  nhash: string
  fileName: string
  recordName?: string
  config: { effects: EnabledEffect[]; seed: number }
  timestamp: number
}

const STORAGE_KEY = 'midi-enshittifier:recents'
const MAX_RECENTS = 20

export function getRecents(): RecentShare[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
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
