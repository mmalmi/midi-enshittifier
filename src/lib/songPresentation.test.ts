import { describe, expect, it } from 'vitest'
import type { MidiFile } from './midi'
import { defaultRecordName, formatRelativeTime, trackInfo } from './songPresentation'

function midiFixture(): MidiFile {
  return {
    header: {
      ppq: 480,
      tempos: [{ bpm: 120, ticks: 0 }],
    },
    tracks: [
      {
        channel: 0,
        instrument: 0,
        notes: [
          { midi: 60, velocity: 1, time: 0, duration: 1, ticks: 0, durationTicks: 480 },
          { midi: 64, velocity: 1, time: 62, duration: 1, ticks: 0, durationTicks: 480 },
        ],
      },
      {
        channel: 1,
        instrument: 0,
        notes: [],
      },
    ],
  }
}

describe('defaultRecordName', () => {
  it('strips one file extension from the end', () => {
    expect(defaultRecordName(' anthem.mid ')).toBe('anthem')
  })

  it('returns an empty string for blank input', () => {
    expect(defaultRecordName('   ')).toBe('')
  })
})

describe('trackInfo', () => {
  it('formats track, note, and duration summary', () => {
    expect(trackInfo(midiFixture())).toBe('1 tracks · 2 notes · 1:03')
  })
})

describe('formatRelativeTime', () => {
  it('formats recent timestamps across units', () => {
    expect(formatRelativeTime(995, 1000)).toBe('5s ago')
    expect(formatRelativeTime(940, 1000)).toBe('1m ago')
    expect(formatRelativeTime(1000 - 3 * 3600, 1000)).toBe('3h ago')
    expect(formatRelativeTime(1000 - 2 * 86400, 1000)).toBe('2d ago')
  })

  it('clamps future timestamps to zero seconds ago', () => {
    expect(formatRelativeTime(1010, 1000)).toBe('0s ago')
  })
})
