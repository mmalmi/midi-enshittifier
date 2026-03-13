import type { MidiTrack } from '../midi'
import { addTrack, addNote } from '../midi'
import type { Effect } from './types'

export const shredSolo: Effect = {
  id: 'shredSolo',
  name: 'Shred Solo',
  description: 'Generative virtuoso solo passages',
  emoji: '🎸',
  defaultIntensity: 0.5,
  apply(midi, intensity, rng) {
    // ── Detect key ──────────────────────────────────────
    const histogram = new Array(12).fill(0)
    for (const track of midi.tracks) {
      if (track.channel === 9) continue
      for (const note of track.notes) {
        histogram[note.midi % 12] += note.duration
      }
    }

    // Major/minor templates (intervals from root)
    const majorT = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1]
    const minorT = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]

    let bestRoot = 0
    let bestMode: 'major' | 'minor' = 'major'
    let bestScore = -1
    for (let root = 0; root < 12; root++) {
      for (const [template, mode] of [[majorT, 'major'], [minorT, 'minor']] as const) {
        let score = 0
        for (let i = 0; i < 12; i++) {
          score += histogram[(root + i) % 12] * template[i]
        }
        if (score > bestScore) {
          bestScore = score
          bestRoot = root
          bestMode = mode
        }
      }
    }

    // Build scale pitches for detected key
    const scaleIntervals = bestMode === 'major' ? majorT : minorT
    const scalePCs: number[] = []
    for (let i = 0; i < 12; i++) {
      if (scaleIntervals[i]) scalePCs.push((bestRoot + i) % 12)
    }

    // Pentatonic: degrees 0,1,2,4,5 of the scale (major pentatonic) or 0,2,3,4,6 (minor)
    const pentPCs = bestMode === 'major'
      ? [0, 1, 2, 4, 5].map(i => scalePCs[i])
      : [0, 2, 3, 4, 6].map(i => scalePCs[i])

    const bpm = midi.header.tempos[0]?.bpm ?? 120
    const beatDur = 60 / bpm

    // ── Build chord map (time → pitch classes) ──────────
    type NoteInfo = { midi: number; time: number }
    const allNotes: NoteInfo[] = []
    for (const track of midi.tracks) {
      if (track.channel === 9) continue
      for (const note of track.notes) allNotes.push({ midi: note.midi, time: note.time })
    }
    allNotes.sort((a, b) => a.time - b.time)

    const chordGroups: Array<{ time: number; pcs: number[] }> = []
    {
      let cur: NoteInfo[] = []
      let groupStart = -1
      for (const n of allNotes) {
        if (groupStart < 0 || n.time - groupStart > 0.06) {
          if (cur.length) {
            chordGroups.push({
              time: groupStart,
              pcs: [...new Set(cur.map(c => c.midi % 12))],
            })
          }
          cur = [n]
          groupStart = n.time
        } else {
          cur.push(n)
        }
      }
      if (cur.length) {
        chordGroups.push({
          time: groupStart,
          pcs: [...new Set(cur.map(c => c.midi % 12))],
        })
      }
    }

    function chordAt(t: number): number[] {
      if (chordGroups.length === 0) return scalePCs.slice(0, 3)
      let best = chordGroups[0]
      for (const g of chordGroups) {
        if (g.time > t) break
        best = g
      }
      return best.pcs
    }

    // ── Helpers ─────────────────────────────────────────
    function scalePitchesInRange(low: number, high: number): number[] {
      const result: number[] = []
      for (let m = low; m <= high; m++) {
        if (scalePCs.includes(m % 12)) result.push(m)
      }
      return result
    }

    function clampMidi(n: number): number {
      return Math.max(0, Math.min(127, n))
    }

    // ── Fragment generators ─────────────────────────────
    type Fragment = Array<{ midi: number; timeOff: number; dur: number }>

    function fragmentEndOffset(fragment: Fragment): number {
      let end = 0
      for (const f of fragment) {
        end = Math.max(end, f.timeOff + f.dur)
      }
      return end
    }

    function scaleRun(startTime: number, duration: number): Fragment {
      const nps = 10 + rng() * 6 // notes per second
      const count = Math.max(2, Math.floor(duration * nps))
      const ascending = rng() > 0.5
      const basePitch = 60 + Math.floor(rng() * 24) // 60-83
      const pitches = scalePitchesInRange(basePitch, basePitch + 24)
      if (pitches.length < 2) return []
      const frag: Fragment = []
      for (let i = 0; i < count; i++) {
        const idx = ascending
          ? i % pitches.length
          : (pitches.length - 1) - (i % pitches.length)
        frag.push({
          midi: clampMidi(pitches[idx]),
          timeOff: (i / count) * duration,
          dur: duration / count * 0.85,
        })
      }
      return frag
    }

    function sweepArpeggio(startTime: number, duration: number): Fragment {
      const nps = 8 + rng() * 6
      const count = Math.max(2, Math.floor(duration * nps))
      const chordPCs = chordAt(startTime)
      if (chordPCs.length === 0) return []
      // Build arpeggio pitches across 2 octaves
      const basePitch = 60 + Math.floor(rng() * 12)
      const arpPitches: number[] = []
      for (let oct = 0; oct < 3; oct++) {
        for (const pc of chordPCs) {
          const p = basePitch + oct * 12 + ((pc - basePitch % 12 + 12) % 12)
          if (p >= 48 && p <= 96) arpPitches.push(p)
        }
      }
      arpPitches.sort((a, b) => a - b)
      if (arpPitches.length < 2) return []
      const ascending = rng() > 0.4
      const frag: Fragment = []
      for (let i = 0; i < count; i++) {
        const idx = ascending
          ? i % arpPitches.length
          : (arpPitches.length - 1) - (i % arpPitches.length)
        frag.push({
          midi: clampMidi(arpPitches[idx]),
          timeOff: (i / count) * duration,
          dur: duration / count * 0.85,
        })
      }
      return frag
    }

    function toccataQuotation(_startTime: number, duration: number): Fragment {
      // Stylized BWV 565 opening: tonic-lower-neighbor-tonic, then descent
      // into a low-octave close. D minor yields D-C#-D.
      const tonic5 = 72 + bestRoot // tonic in octave 5
      const frag: Fragment = [
        { midi: tonic5,     timeOff: 0,    dur: 0.30 },
        { midi: tonic5 - 1, timeOff: 0.30, dur: 0.07 },
        { midi: tonic5,     timeOff: 0.37, dur: 0.46 },
      ]

      const descentStart = 0.95
      const descentNotes: number[] = []
      let cur = tonic5 - 1
      for (let i = 0; i < 7; i++) {
        descentNotes.push(cur)
        let next = cur - 1
        while (next > 0 && !scalePCs.includes(next % 12)) next--
        cur = next
      }
      const descentSpeed = 0.08
      for (let i = 0; i < descentNotes.length; i++) {
        frag.push({
          midi: descentNotes[i],
          timeOff: descentStart + i * descentSpeed,
          dur: i < descentNotes.length - 1 ? descentSpeed * 0.88 : 0.34,
        })
      }

      const lastOff = descentStart + descentNotes.length * descentSpeed
      frag.push({ midi: tonic5 - 12, timeOff: lastOff, dur: 0.40 })
      frag.push({ midi: tonic5 - 24, timeOff: lastOff, dur: 0.40 })

      // Fit phrase to solo duration so ducking/envelopes stay aligned.
      const phraseEnd = fragmentEndOffset(frag)
      if (phraseEnd <= 0) return frag
      // Keep phrase readable in slower songs instead of over-compressing it.
      const minPhraseDur = beatDur * 2.5
      const targetDur = Math.max(Math.max(0.08, duration), minPhraseDur)
      const scale = targetDur / phraseEnd
      return frag.map((f) => ({
        midi: clampMidi(f.midi),
        timeOff: f.timeOff * scale,
        dur: f.dur * scale,
      }))
    }

    function bumblebeeRun(_startTime: number, duration: number): Fragment {
      const nps = 12 + rng() * 4
      const count = Math.max(4, Math.floor(duration * nps))
      let pitch = 84 + Math.floor(rng() * 12) // start high
      const frag: Fragment = []
      for (let i = 0; i < count; i++) {
        frag.push({
          midi: clampMidi(pitch),
          timeOff: (i / count) * duration,
          dur: duration / count * 0.8,
        })
        // Chromatic zigzag descending
        pitch += (i % 2 === 0) ? -1 : -2
        pitch = Math.max(48, pitch)
      }
      return frag
    }

    function pentatonicLick(startTime: number, duration: number): Fragment {
      const nps = 6 + rng() * 4
      const count = Math.max(2, Math.floor(duration * nps))
      const basePitch = 60 + Math.floor(rng() * 12)
      const pitches: number[] = []
      for (let oct = 0; oct < 2; oct++) {
        for (const pc of pentPCs) {
          const p = basePitch + oct * 12 + ((pc - basePitch % 12 + 12) % 12)
          if (p >= 48 && p <= 96) pitches.push(p)
        }
      }
      pitches.sort((a, b) => a - b)
      if (pitches.length < 2) return []
      const frag: Fragment = []
      for (let i = 0; i < count; i++) {
        // Semi-random pattern with tendency to move stepwise
        const idx = Math.floor(rng() * pitches.length)
        frag.push({
          midi: clampMidi(pitches[idx]),
          timeOff: (i / count) * duration,
          dur: duration / count * 0.9,
        })
      }
      return frag
    }

    const generators = [scaleRun, sweepArpeggio, toccataQuotation, bumblebeeRun, pentatonicLick]
    const TOCCATA_INDEX = 2

    // ── Find duration, place solos ──────────────────────
    let maxTime = 0
    for (const track of midi.tracks) {
      for (const note of track.notes) {
        maxTime = Math.max(maxTime, note.time + note.duration)
      }
    }
    if (maxTime === 0) return

    // Solo instrument pool: [GM program, name context]
    const soloInstruments = [
      30,  // Overdriven Guitar
      81,  // Lead 1 (square)
      80,  // Lead 2 (sawtooth)
      26,  // Jazz Guitar
      73,  // Flute
      71,  // Clarinet
      57,  // Trumpet
      19,  // Church Organ — for toccata especially
      11,  // Vibraphone
      65,  // Alto Sax
    ]

    // Give each solo its own channel so exported program changes do not conflict.
    const usedChannels = new Set(midi.tracks.map(t => t.channel))
    function allocChannel(): number | null {
      for (let c = 0; c < 16; c++) {
        if (c === 9) continue
        if (!usedChannels.has(c)) {
          usedChannels.add(c)
          return c
        }
      }
      return null
    }

    const windowSize = 2 + rng() * 2 // 2-4s
    const numWindows = Math.floor(maxTime / windowSize)

    // Dynamics envelope shapes: 0=crescendo, 1=decrescendo, 2=swell, 3=flat
    function envelopeAt(shape: number, t: number): number {
      switch (shape) {
        case 0: return 0.5 + 0.5 * t          // crescendo
        case 1: return 1.0 - 0.5 * t          // decrescendo
        case 2: return 0.6 + 0.4 * Math.sin(t * Math.PI) // swell
        default: return 1.0                    // flat
      }
    }

    const soloTracks: MidiTrack[] = []

    function placeSolo(soloStart: number, soloDur: number, genIndex?: number) {
      const gi = genIndex ?? Math.floor(rng() * generators.length)
      const gen = generators[gi]
      const fragment = gen(soloStart, soloDur)
      if (fragment.length === 0) return { start: soloStart, end: soloStart }

      // Pick instrument — toccata gets church organ, others random from pool
      const instrument = gi === TOCCATA_INDEX
        ? 19 // Church Organ for toccata
        : soloInstruments[Math.floor(rng() * soloInstruments.length)]

      // Each solo gets its own track so it can have a different instrument
      const channel = allocChannel()
      if (channel === null) return { start: soloStart, end: soloStart }

      const track = addTrack(midi, channel)
      track.instrument = instrument
      soloTracks.push(track)

      // Per-fragment base velocity: 0.45–0.95
      const baseVel = 0.45 + rng() * 0.5
      const envShape = Math.floor(rng() * 4)
      const fragmentEnd = fragmentEndOffset(fragment)
      if (fragmentEnd <= 0) return { start: soloStart, end: soloStart }

      for (const f of fragment) {
        const progress = f.timeOff / fragmentEnd
        const env = envelopeAt(envShape, progress)
        const jitter = 1.0 + (rng() - 0.5) * 0.15
        const vel = Math.max(0.1, Math.min(1, baseVel * env * jitter))
        addNote(track, {
          midi: f.midi,
          time: soloStart + f.timeOff,
          duration: f.dur,
          velocity: vel,
        })
      }
      return { start: soloStart, end: soloStart + fragmentEnd }
    }

    const soloSpans: Array<{ start: number; end: number }> = []

    let soloCount = 0
    for (let w = 0; w < numWindows; w++) {
      if (rng() >= intensity * 0.3) continue
      soloCount++

      const windowStart = w * windowSize
      const soloStart = windowStart + rng() * windowSize * 0.5
      const soloDur = 0.5 + rng() * 2.0 * intensity
      soloSpans.push(placeSolo(soloStart, soloDur))
    }

    // Guarantee at least one solo passage
    if (soloCount === 0) {
      const soloStart = rng() * maxTime * 0.8
      const soloDur = 0.5 + rng() * 2.0 * intensity
      soloSpans.push(placeSolo(soloStart, soloDur))
    }

    // Duck existing tracks under solo passages (reduce velocity by 30-50%)
    if (soloSpans.length > 0) {
      const soloTrackSet = new Set(soloTracks)
      const duckAmount = 0.5 + rng() * 0.2 // keep 50-70% of original velocity
      for (const track of midi.tracks) {
        if (soloTrackSet.has(track) || track.channel === 9) continue
        for (const note of track.notes) {
          const noteEnd = note.time + note.duration
          for (const span of soloSpans) {
            if (note.time < span.end && noteEnd > span.start) {
              note.velocity = Math.max(0.05, note.velocity * duckAmount)
              break
            }
          }
        }
      }
    }
  },
}
