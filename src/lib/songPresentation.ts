import type { MidiFile } from './midi'

export function defaultRecordName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\.[^/.]+$/, '')
}

export function trackInfo(midi: MidiFile): string {
  const tracks = midi.tracks.filter((track) => track.notes.length > 0).length
  const notes = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0)
  let duration = 0

  for (const track of midi.tracks) {
    for (const note of track.notes) {
      duration = Math.max(duration, note.time + note.duration)
    }
  }

  const minutes = Math.floor(duration / 60)
  const seconds = Math.floor(duration % 60)
  return `${tracks} tracks · ${notes} notes · ${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatRelativeTime(ts: number, nowUnix = Math.floor(Date.now() / 1000)): string {
  const diff = Math.max(0, nowUnix - ts)
  if (diff < 60) return `${diff}s ago`

  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m ago`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`

  return `${Math.floor(hours / 24)}d ago`
}
