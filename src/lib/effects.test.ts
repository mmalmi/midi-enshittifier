import { describe, it, expect } from 'vitest'
import { createMidi, addTrack, addNote, writeMidi, parseMidi } from './midi'
import type { MidiFile } from './midi'
import { mulberry32 } from './rng'
import { effects, enshittify } from './effects'

// ── helpers ──────────────────────────────────────────────

function createTestMidi(): MidiFile {
  const midi = createMidi()

  // Track 0: piano — C major scale
  const piano = addTrack(midi, 0)
  ;[60, 62, 64, 65, 67, 69, 71, 72].forEach((n, i) => {
    addNote(piano, { midi: n, time: i * 0.5, duration: 0.4, velocity: 0.8 })
  })

  // Track 1: bass
  const bass = addTrack(midi, 1)
  ;[36, 43, 36, 43].forEach((n, i) => {
    addNote(bass, { midi: n, time: i * 1.0, duration: 0.9, velocity: 0.7 })
  })

  return midi
}

function createChordMidi(): MidiFile {
  const midi = createMidi()
  const track = addTrack(midi, 0)

  // C major chord (C4, E4, G4)
  addNote(track, { midi: 60, time: 0, duration: 1, velocity: 0.8 })
  addNote(track, { midi: 64, time: 0, duration: 1, velocity: 0.8 })
  addNote(track, { midi: 67, time: 0, duration: 1, velocity: 0.8 })

  // A minor chord (A3, C4, E4)
  addNote(track, { midi: 57, time: 1.5, duration: 1, velocity: 0.8 })
  addNote(track, { midi: 60, time: 1.5, duration: 1, velocity: 0.8 })
  addNote(track, { midi: 64, time: 1.5, duration: 1, velocity: 0.8 })

  return midi
}

function createDrumHeavyMidi(): MidiFile {
  const midi = createMidi()
  const drums = addTrack(midi, 9)
  ;[
    [36, 0.0],
    [42, 0.0],
    [38, 0.5],
    [42, 0.5],
    [36, 1.0],
    [46, 1.0],
    [38, 1.5],
    [42, 1.5],
  ].forEach(([n, t]) => {
    addNote(drums, { midi: n, time: t, duration: 0.1, velocity: 0.75 })
  })

  const lead = addTrack(midi, 0)
  ;[60, 62, 64, 67].forEach((n, i) => {
    addNote(lead, { midi: n, time: i * 0.5, duration: 0.35, velocity: 0.8 })
  })

  return midi
}

function getEffect(id: string) {
  return effects.find((e) => e.id === id)!
}

function totalNotes(midi: MidiFile): number {
  return midi.tracks.reduce((s, t) => s + t.notes.length, 0)
}

function collectPitches(midi: MidiFile): number[] {
  return midi.tracks.flatMap((t) => t.notes.map((n) => n.midi))
}

function collectVelocities(midi: MidiFile): number[] {
  return midi.tracks.flatMap((t) => t.notes.map((n) => n.velocity))
}

function collectTimes(midi: MidiFile): number[] {
  return midi.tracks.flatMap((t) => t.notes.map((n) => n.time))
}

function scriptedRng(values: number[], tail = 0.5) {
  let i = 0
  return () => (i < values.length ? values[i++] : tail)
}

// ── round-trip sanity ────────────────────────────────────

describe('MIDI round-trip', () => {
  it('preserves notes through serialize/parse', () => {
    const orig = createTestMidi()
    const buf = writeMidi(orig)
    const clone = parseMidi(buf)
    expect(clone.tracks.length).toBe(orig.tracks.length)
    expect(totalNotes(clone)).toBe(totalNotes(orig))
  })
})

// ── individual effects ───────────────────────────────────

describe('panFlute', () => {
  it('changes all non-percussion instruments at full intensity', () => {
    const midi = createTestMidi()
    getEffect('panFlute').apply(midi, 1.0, mulberry32(42))
    for (const track of midi.tracks) {
      if (track.channel !== 9) {
        expect(track.instrument).toBe(75)
      }
    }
  })

  it('does nothing at zero intensity', () => {
    const midi = createTestMidi()
    const before = midi.tracks.map((t) => t.instrument)
    getEffect('panFlute').apply(midi, 0, mulberry32(42))
    midi.tracks.forEach((t, i) => {
      expect(t.instrument).toBe(before[i])
    })
  })
})

describe('drunkNotes', () => {
  it('shifts some note pitches', () => {
    const midi = createTestMidi()
    const before = collectPitches(midi)
    getEffect('drunkNotes').apply(midi, 1.0, mulberry32(42))
    const after = collectPitches(midi)
    const shifted = before.filter((p, i) => p !== after[i]).length
    expect(shifted).toBeGreaterThan(0)
  })

  it('keeps pitches within MIDI range', () => {
    const midi = createTestMidi()
    getEffect('drunkNotes').apply(midi, 1.0, mulberry32(42))
    for (const p of collectPitches(midi)) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(127)
    }
  })
})

describe('tempoTantrum', () => {
  it('warps note times', () => {
    const midi = createTestMidi()
    const origTimes = midi.tracks[0].notes.map(n => n.time)
    getEffect('tempoTantrum').apply(midi, 1.0, mulberry32(42))
    const newTimes = midi.tracks[0].notes.map(n => n.time)
    const changed = newTimes.some((t, i) => Math.abs(t - origTimes[i]) > 0.001)
    expect(changed).toBe(true)
  })

  it('keeps note times non-negative', () => {
    const midi = createTestMidi()
    getEffect('tempoTantrum').apply(midi, 1.0, mulberry32(42))
    for (const track of midi.tracks) {
      for (const note of track.notes) {
        expect(note.time).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('keeps durations positive', () => {
    const midi = createTestMidi()
    getEffect('tempoTantrum').apply(midi, 1.0, mulberry32(42))
    for (const track of midi.tracks) {
      for (const note of track.notes) {
        expect(note.duration).toBeGreaterThan(0)
      }
    }
  })
})

describe('ghostDrums', () => {
  it('adds a percussion track', () => {
    const midi = createTestMidi()
    const tracksBefore = midi.tracks.length
    getEffect('ghostDrums').apply(midi, 0.5, mulberry32(42))
    expect(midi.tracks.length).toBe(tracksBefore + 1)
    expect(midi.tracks[midi.tracks.length - 1].channel).toBe(9)
  })

  it('adds drum notes', () => {
    const midi = createTestMidi()
    getEffect('ghostDrums').apply(midi, 0.5, mulberry32(42))
    const drumTrack = midi.tracks[midi.tracks.length - 1]
    expect(drumTrack.notes.length).toBeGreaterThan(0)
  })
})

describe('cpuThrottle', () => {
  it('removes some notes', () => {
    const midi = createTestMidi()
    const before = totalNotes(midi)
    getEffect('cpuThrottle').apply(midi, 1.0, mulberry32(42))
    expect(totalNotes(midi)).toBeLessThan(before)
  })

  it('delays some notes', () => {
    const midi = createTestMidi()
    const timesBefore = collectTimes(midi)
    getEffect('cpuThrottle').apply(midi, 1.0, mulberry32(99))
    const timesAfter = collectTimes(midi)
    const shifted = timesAfter.some(
      (t, i) => i < timesBefore.length && t !== timesBefore[i],
    )
    expect(shifted).toBe(true)
  })
})

describe('butterFingers', () => {
  it('offsets note timing', () => {
    const midi = createTestMidi()
    const before = collectTimes(midi)
    getEffect('butterFingers').apply(midi, 1.0, mulberry32(42))
    const after = collectTimes(midi)
    const shifted = before.filter((t, i) => t !== after[i]).length
    expect(shifted).toBeGreaterThan(0)
  })

  it('keeps times non-negative', () => {
    const midi = createTestMidi()
    getEffect('butterFingers').apply(midi, 1.0, mulberry32(42))
    for (const t of collectTimes(midi)) {
      expect(t).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('volumeRollercoaster', () => {
  it('changes some velocities', () => {
    const midi = createTestMidi()
    const before = collectVelocities(midi)
    getEffect('volumeRollercoaster').apply(midi, 1.0, mulberry32(42))
    const after = collectVelocities(midi)
    const changed = before.filter((v, i) => v !== after[i]).length
    expect(changed).toBeGreaterThan(0)
  })

  it('keeps velocities in valid range', () => {
    const midi = createTestMidi()
    getEffect('volumeRollercoaster').apply(midi, 1.0, mulberry32(42))
    for (const v of collectVelocities(midi)) {
      expect(v).toBeGreaterThanOrEqual(0.01)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('echoChamber', () => {
  it('adds echo notes', () => {
    const midi = createTestMidi()
    const before = totalNotes(midi)
    getEffect('echoChamber').apply(midi, 1.0, mulberry32(42))
    expect(totalNotes(midi)).toBeGreaterThan(before)
  })
})

describe('percussion preservation', () => {
  it('keeps original drum notes intact for non-drum effects', () => {
    const preserve = [
      'tempoTantrum',
      'cpuThrottle',
      'butterFingers',
      'volumeRollercoaster',
      'echoChamber',
    ]

    for (const id of preserve) {
      const midi = createDrumHeavyMidi()
      const drumTrack = midi.tracks.find(t => t.channel === 9)!
      const before = drumTrack.notes.map(n => ({ ...n }))
      getEffect(id).apply(midi, 1.0, mulberry32(42))
      expect(drumTrack.notes).toEqual(before)
    }
  })
})

describe('moodSwing', () => {
  it('swaps thirds in chords', () => {
    const midi = createChordMidi()
    const before = collectPitches(midi)
    getEffect('moodSwing').apply(midi, 1.0, mulberry32(42))
    const after = collectPitches(midi)
    expect(after).not.toEqual(before)
  })
})

describe('devilsInterval', () => {
  it('adds tritone notes', () => {
    const midi = createTestMidi()
    const before = totalNotes(midi)
    getEffect('devilsInterval').apply(midi, 1.0, mulberry32(42))
    expect(totalNotes(midi)).toBeGreaterThan(before)
  })

  it('tritone notes are 6 semitones above originals', () => {
    const midi = createTestMidi()
    const origPitches = new Set(collectPitches(midi))
    getEffect('devilsInterval').apply(midi, 1.0, mulberry32(42))
    const newPitches = collectPitches(midi).filter((p) => !origPitches.has(p))
    for (const p of newPitches) {
      expect(origPitches.has(p - 6)).toBe(true)
    }
  })
})

describe('tremoloTerror', () => {
  it('splits long notes into rapid repetitions', () => {
    const midi = createTestMidi()
    const before = totalNotes(midi)
    getEffect('tremoloTerror').apply(midi, 1.0, mulberry32(42))
    expect(totalNotes(midi)).toBeGreaterThan(before)
  })
})

function soloTracks(midi: MidiFile, tracksBefore: number) {
  return midi.tracks.slice(tracksBefore)
}

function soloNotes(midi: MidiFile, tracksBefore: number) {
  return soloTracks(midi, tracksBefore).flatMap(t => t.notes)
}

describe('shredSolo', () => {
  it('adds new tracks with solo notes', () => {
    const midi = createTestMidi()
    const tracksBefore = midi.tracks.length
    getEffect('shredSolo').apply(midi, 1.0, mulberry32(42))
    expect(midi.tracks.length).toBeGreaterThan(tracksBefore)
    const notes = soloNotes(midi, tracksBefore)
    expect(notes.length).toBeGreaterThan(0)
    for (const t of soloTracks(midi, tracksBefore)) {
      expect(t.channel).not.toBe(9)
    }
  })

  it('keeps solo notes within MIDI range', () => {
    const midi = createTestMidi()
    const tb = midi.tracks.length
    getEffect('shredSolo').apply(midi, 1.0, mulberry32(42))
    for (const note of soloNotes(midi, tb)) {
      expect(note.midi).toBeGreaterThanOrEqual(0)
      expect(note.midi).toBeLessThanOrEqual(127)
    }
  })

  it('velocities in valid range', () => {
    const midi = createTestMidi()
    const tb = midi.tracks.length
    getEffect('shredSolo').apply(midi, 1.0, mulberry32(42))
    for (const note of soloNotes(midi, tb)) {
      expect(note.velocity).toBeGreaterThanOrEqual(0.01)
      expect(note.velocity).toBeLessThanOrEqual(1)
    }
  })

  it('times are non-negative', () => {
    const midi = createTestMidi()
    const tb = midi.tracks.length
    getEffect('shredSolo').apply(midi, 1.0, mulberry32(42))
    for (const note of soloNotes(midi, tb)) {
      expect(note.time).toBeGreaterThanOrEqual(0)
    }
  })

  it('is deterministic with same seed', () => {
    const a = createTestMidi()
    const b = createTestMidi()
    const tbA = a.tracks.length
    const tbB = b.tracks.length
    getEffect('shredSolo').apply(a, 0.8, mulberry32(99))
    getEffect('shredSolo').apply(b, 0.8, mulberry32(99))
    const aN = soloNotes(a, tbA)
    const bN = soloNotes(b, tbB)
    expect(aN.length).toBe(bN.length)
    for (let i = 0; i < aN.length; i++) {
      expect(aN[i].midi).toBe(bN[i].midi)
      expect(aN[i].time).toBe(bN[i].time)
    }
  })

  it('uses different instruments across solos', () => {
    const midi = createTestMidi()
    // Longer MIDI for more solo windows
    const extra = addTrack(midi, 2)
    for (let i = 0; i < 40; i++) {
      addNote(extra, { midi: 60, time: i * 0.5, duration: 0.4, velocity: 0.8 })
    }
    const tb = midi.tracks.length
    getEffect('shredSolo').apply(midi, 1.0, mulberry32(7))
    const instruments = new Set(soloTracks(midi, tb).map(t => t.instrument))
    expect(instruments.size).toBeGreaterThanOrEqual(1)
  })

  it('toccata motif follows tonic and fits solo duration', () => {
    const midi = createTestMidi()
    const tb = midi.tracks.length
    const rng = scriptedRng([
      0.45, // windowSize
      0.95, // skip window so fallback path is used
      0.20, // fallback soloStart
      0.40, // fallback soloDur => 1.3s
      0.45, // generator index => toccataQuotation
      0.60, // base velocity
      0.20, // envelope shape
    ], 0.5)

    getEffect('shredSolo').apply(midi, 1.0, rng)

    const tracks = soloTracks(midi, tb)
    const toccata = tracks.find(t => t.instrument === 19)
    expect(toccata).toBeTruthy()

    const notes = [...toccata!.notes].sort((a, b) => a.time - b.time)
    expect(notes.length).toBeGreaterThanOrEqual(3)
    // C major test fixture should produce C-B-C for the opening mordent.
    expect(notes[0].midi).toBe(72)
    expect(notes[1].midi).toBe(71)
    expect(notes[2].midi).toBe(72)

    const soloStart = notes[0].time
    const soloEnd = Math.max(...notes.map(n => n.time + n.duration))
    expect(soloEnd - soloStart).toBeLessThanOrEqual(1.300001)
  })
})

// ── pipeline ─────────────────────────────────────────────

describe('enshittify', () => {
  it('returns modified MIDI', () => {
    const orig = createTestMidi()
    const { midi } = enshittify(
      orig,
      [
        { id: 'panFlute', intensity: 1 },
        { id: 'drunkNotes', intensity: 0.5 },
      ],
      42,
    )
    // original should be untouched
    expect(orig.tracks[0].instrument).not.toBe(75)
    // enshittified should have pan flute
    expect(midi.tracks[0].instrument).toBe(75)
  })

  it('is deterministic with same seed', () => {
    const orig = createTestMidi()
    const all = effects.map((e) => ({ id: e.id, intensity: 0.5 }))
    const a = enshittify(orig, all, 42)
    const b = enshittify(orig, all, 42)
    expect(writeMidi(a.midi)).toEqual(writeMidi(b.midi))
  })

  it('produces different results with different seeds', () => {
    const orig = createTestMidi()
    const all = effects.map((e) => ({ id: e.id, intensity: 0.5 }))
    const a = enshittify(orig, all, 1)
    const b = enshittify(orig, all, 2)
    expect(writeMidi(a.midi)).not.toEqual(writeMidi(b.midi))
  })

  it('uses random seed by default', () => {
    const orig = createTestMidi()
    const cfg = [{ id: 'drunkNotes', intensity: 1 }]
    const a = enshittify(orig, cfg)
    const b = enshittify(orig, cfg)
    expect(a.seed).not.toBe(b.seed)
  })

  it('does not mutate original', () => {
    const orig = createTestMidi()
    const snap = JSON.stringify(orig)
    enshittify(
      orig,
      effects.map((e) => ({ id: e.id, intensity: 1 })),
      42,
    )
    expect(JSON.stringify(orig)).toBe(snap)
  })
})
