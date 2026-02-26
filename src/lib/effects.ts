import type { MidiFile, MidiTrack } from './midi'
import { cloneMidi, addTrack, addNote } from './midi'
import { mulberry32, randomSeed } from './rng'

export interface Effect {
  id: string
  name: string
  description: string
  emoji: string
  defaultIntensity: number
  apply: (midi: MidiFile, intensity: number, rng: () => number) => void
}

// ── Effects ──────────────────────────────────────────────

const panFlute: Effect = {
  id: 'panFlute',
  name: 'Pan Flute Apocalypse',
  description: 'Instruments shall become pan flute',
  emoji: '🎺',
  defaultIntensity: 0.7,
  apply(midi, intensity, rng) {
    for (const track of midi.tracks) {
      if (track.channel === 9) continue // skip percussion
      if (rng() < intensity) {
        track.instrument = 75 // Pan Flute
      }
    }
  },
}

const drunkNotes: Effect = {
  id: 'drunkNotes',
  name: 'Drunk Musician',
  description: 'Randomly detune notes',
  emoji: '🍺',
  defaultIntensity: 0.4,
  apply(midi, intensity, rng) {
    for (const track of midi.tracks) {
      if (track.channel === 9) continue
      for (const note of track.notes) {
        if (rng() < intensity * 0.3) {
          const shift = Math.floor(rng() * 5) - 2 // -2 to +2
          note.midi = Math.max(0, Math.min(127, note.midi + shift))
        }
      }
    }
  },
}

const tempoTantrum: Effect = {
  id: 'tempoTantrum',
  name: 'Tempo Tantrum',
  description: 'Erratic tempo changes throughout',
  emoji: '⏱️',
  defaultIntensity: 0.5,
  apply(midi, intensity, rng) {
    let maxTime = 0
    for (const track of midi.tracks) {
      for (const note of track.notes) {
        maxTime = Math.max(maxTime, note.time + note.duration)
      }
    }
    if (maxTime === 0) return

    // Create random breakpoints along the timeline with speed multipliers
    const numBreaks = Math.floor(intensity * 8) + 2
    const breaks: Array<{ time: number; speed: number }> = [{ time: 0, speed: 1 }]
    for (let i = 0; i < numBreaks; i++) {
      const t = rng() * maxTime
      // Speed range: higher intensity → more extreme (0.4x–2.2x)
      const speed = 1 + (rng() - 0.5) * 2 * intensity * 0.8
      breaks.push({ time: t, speed: Math.max(0.4, Math.min(2.2, speed)) })
    }
    breaks.sort((a, b) => a.time - b.time)

    // Build cumulative time warp map: original time → warped time
    function warp(t: number): number {
      let warped = 0
      let prevT = 0
      let prevSpeed = breaks[0].speed
      for (let i = 1; i < breaks.length; i++) {
        if (t <= breaks[i].time) {
          return warped + (t - prevT) / prevSpeed
        }
        warped += (breaks[i].time - prevT) / prevSpeed
        prevT = breaks[i].time
        prevSpeed = breaks[i].speed
      }
      return warped + (t - prevT) / prevSpeed
    }

    function localSpeed(t: number): number {
      let speed = breaks[0].speed
      for (let i = 1; i < breaks.length; i++) {
        if (breaks[i].time > t) break
        speed = breaks[i].speed
      }
      return speed
    }

    // Apply warp to all notes
    for (const track of midi.tracks) {
      if (track.channel === 9) continue
      for (const note of track.notes) {
        const speed = localSpeed(note.time)
        const endWarped = warp(note.time + note.duration)
        note.time = Math.max(0, warp(note.time))
        note.duration = Math.max(0.01, endWarped - note.time)
      }
    }
  },
}

const ghostDrums: Effect = {
  id: 'ghostDrums',
  name: 'Ghost Drums',
  description: 'Phantom percussion from beyond',
  emoji: '👻',
  defaultIntensity: 0.4,
  apply(midi, intensity, rng) {
    let maxTime = 0
    for (const track of midi.tracks) {
      for (const note of track.notes) {
        maxTime = Math.max(maxTime, note.time + note.duration)
      }
    }
    if (maxTime === 0) return

    const drumTrack = addTrack(midi, 9)
    const drumNotes = [36, 38, 42, 46, 49, 51] // kick, snare, hihat, open-hh, crash, ride
    const numHits = Math.floor(intensity * maxTime * 2)

    for (let i = 0; i < numHits; i++) {
      const hitTime = rng() * maxTime
      const hitDrum = drumNotes[Math.floor(rng() * drumNotes.length)]

      if (rng() < 0.15 * intensity) {
        // Fill: rapid sequence of 4-8 hits
        const fillLen = 4 + Math.floor(rng() * 5)
        const spacing = 0.06 + rng() * 0.06
        for (let f = 0; f < fillLen; f++) {
          addNote(drumTrack, {
            midi: drumNotes[Math.floor(rng() * drumNotes.length)],
            time: hitTime + f * spacing,
            duration: spacing * 0.7,
            velocity: 0.4 + rng() * 0.5,
          })
        }
      } else {
        addNote(drumTrack, {
          midi: hitDrum,
          time: hitTime,
          duration: 0.1,
          velocity: 0.3 + rng() * 0.6,
        })
      }
    }

    // Basic beat: 1-2 moments of sudden rhythmic order
    const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120
    const beatDur = 60 / bpm
    const barDur = beatDur * 4
    const numBeats = 1 + (rng() < 0.4 ? 1 : 0) // 1 or 2 insertions
    // Patterns: [beat-offset-in-bar, drum-midi, velocity-scale]
    const patterns = [
      // Standard rock: kick on 1&3, snare on 2&4, hihat on every 8th
      [
        [0, 36, 1], [0, 42, 0.7], [0.5, 42, 0.5],
        [1, 38, 0.9], [1, 42, 0.7], [1.5, 42, 0.5],
        [2, 36, 0.95], [2, 42, 0.7], [2.5, 42, 0.5],
        [3, 38, 0.9], [3, 42, 0.7], [3.5, 42, 0.5],
      ],
      // Four-on-floor: kick every beat, open-hh on offbeats
      [
        [0, 36, 1], [0.5, 46, 0.6],
        [1, 36, 0.9], [1.5, 46, 0.6],
        [2, 36, 0.95], [2.5, 46, 0.6],
        [3, 36, 0.9], [3, 38, 0.7], [3.5, 46, 0.6],
      ],
    ]

    for (let b = 0; b < numBeats; b++) {
      const beatStart = (rng() * (maxTime - barDur * 2))
      if (beatStart < 0) continue
      const bars = 1 + Math.floor(rng() * 2) // 1-2 bars
      const pattern = patterns[Math.floor(rng() * patterns.length)]
      const vel = 0.55 + rng() * 0.3
      for (let bar = 0; bar < bars; bar++) {
        for (const [offset, drum, vScale] of pattern) {
          addNote(drumTrack, {
            midi: drum,
            time: beatStart + bar * barDur + offset * beatDur,
            duration: beatDur * 0.4,
            velocity: vel * vScale,
          })
        }
      }
    }
  },
}

const cpuThrottle: Effect = {
  id: 'cpuThrottle',
  name: 'CPU Throttle',
  description: 'Simulates a 1998 Pentium II struggling',
  emoji: '💻',
  defaultIntensity: 0.4,
  apply(midi, intensity, rng) {
    for (const track of midi.tracks) {
      if (track.channel === 9) continue
      for (let i = track.notes.length - 1; i >= 0; i--) {
        const note = track.notes[i]

        // drop notes (CPU can't keep up)
        if (rng() < intensity * 0.15) {
          track.notes.splice(i, 1)
          continue
        }

        // delay notes (CPU lag)
        if (rng() < intensity * 0.3) {
          note.time = Math.max(0, note.time + rng() * 0.12 * intensity)
        }

        // truncate notes (buffer underrun)
        if (rng() < intensity * 0.2) {
          note.duration *= 0.2 + rng() * 0.5
        }
      }
    }
  },
}

const butterFingers: Effect = {
  id: 'butterFingers',
  name: 'Butter Fingers',
  description: 'Sloppy timing like a nervous recital',
  emoji: '🧈',
  defaultIntensity: 0.4,
  apply(midi, intensity, rng) {
    for (const track of midi.tracks) {
      if (track.channel === 9) continue
      for (const note of track.notes) {
        if (rng() < intensity * 0.5) {
          const offset = (rng() - 0.5) * 0.12 * intensity
          note.time = Math.max(0, note.time + offset)
        }
      }
    }
  },
}

const volumeRollercoaster: Effect = {
  id: 'volumeRollercoaster',
  name: 'Volume Rollercoaster',
  description: 'Chaotic dynamics',
  emoji: '🎢',
  defaultIntensity: 0.5,
  apply(midi, intensity, rng) {
    for (const track of midi.tracks) {
      if (track.channel === 9) continue
      for (const note of track.notes) {
        if (rng() < intensity * 0.5) {
          const factor = 0.15 + rng() * 1.85
          note.velocity = Math.max(0.01, Math.min(1, note.velocity * factor))
        }
      }
    }
  },
}

const echoChamber: Effect = {
  id: 'echoChamber',
  name: 'Echo Chamber',
  description: 'Notes haunt you repeatedly',
  emoji: '🔊',
  defaultIntensity: 0.4,
  apply(midi, intensity, rng) {
    const numEchoes = Math.floor(intensity * 3) + 1
    for (const track of midi.tracks) {
      if (track.channel === 9) continue
      const origNotes = [...track.notes]
      for (const note of origNotes) {
        if (rng() < intensity * 0.4) {
          for (let e = 1; e <= numEchoes; e++) {
            const delay = e * (0.06 + rng() * 0.15)
            const decay = Math.pow(0.55, e)
            addNote(track, {
              midi: note.midi,
              time: note.time + delay,
              duration: note.duration * 0.8,
              velocity: note.velocity * decay,
            })
          }
        }
      }
    }
  },
}

const moodSwing: Effect = {
  id: 'moodSwing',
  name: 'Mood Swing',
  description: 'Minor becomes major, major becomes minor',
  emoji: '🎭',
  defaultIntensity: 0.6,
  apply(midi, intensity, rng) {
    for (const track of midi.tracks) {
      if (track.channel === 9) continue

      const sorted = [...track.notes].sort((a, b) => a.time - b.time)
      const groups: (typeof sorted)[] = []
      let cur: typeof sorted = []
      let groupStart = -1

      for (const note of sorted) {
        if (groupStart < 0 || note.time - groupStart > 0.06) {
          if (cur.length) groups.push(cur)
          cur = [note]
          groupStart = note.time
        } else {
          cur.push(note)
        }
      }
      if (cur.length) groups.push(cur)

      for (const group of groups) {
        if (group.length < 2 || rng() > intensity * 0.5) continue
        const byPitch = [...group].sort((a, b) => a.midi - b.midi)
        for (let i = 1; i < byPitch.length; i++) {
          const interval = byPitch[i].midi - byPitch[i - 1].midi
          if (interval === 3) byPitch[i].midi += 1        // minor third -> major
          else if (interval === 4) byPitch[i].midi -= 1   // major third -> minor
        }
      }
    }
  },
}

const devilsInterval: Effect = {
  id: 'devilsInterval',
  name: "Devil's Interval",
  description: 'Surprise tritones from hell',
  emoji: '😈',
  defaultIntensity: 0.3,
  apply(midi, intensity, rng) {
    for (const track of midi.tracks) {
      if (track.channel === 9) continue
      const origNotes = [...track.notes]
      for (const note of origNotes) {
        if (rng() < intensity * 0.25) {
          addNote(track, {
            midi: Math.min(127, note.midi + 6), // tritone
            time: note.time,
            duration: note.duration,
            velocity: note.velocity * 0.7,
          })
        }
      }
    }
  },
}

const tremoloTerror: Effect = {
  id: 'tremoloTerror',
  name: 'Tremolo Terror',
  description: 'Notes vibrate uncontrollably',
  emoji: '〰️',
  defaultIntensity: 0.35,
  apply(midi, intensity, rng) {
    for (const track of midi.tracks) {
      if (track.channel === 9) continue
      const toSplit: Array<{ idx: number; note: MidiTrack['notes'][0] }> = []

      for (let i = track.notes.length - 1; i >= 0; i--) {
        const note = track.notes[i]
        if (rng() < intensity * 0.2 && note.duration > 0.12) {
          toSplit.push({ idx: i, note })
        }
      }

      for (const { idx, note } of toSplit) {
        const speed = 0.04 + rng() * 0.08
        const hits = Math.floor(note.duration / speed)
        if (hits <= 1) continue

        track.notes.splice(idx, 1)
        for (let h = 0; h < hits; h++) {
          addNote(track, {
            midi: note.midi,
            time: note.time + h * speed,
            duration: speed * 0.75,
            velocity: note.velocity * (0.4 + rng() * 0.6),
          })
        }
      }
    }
  },
}

const melodyHijack: Effect = {
  id: 'melodyHijack',
  name: 'Melody Hijack',
  description: 'Novelty instrument cameos mostly on melody lines',
  emoji: '🎪',
  defaultIntensity: 0.35,
  apply(midi, intensity, rng) {
    let maxTime = 0
    for (const track of midi.tracks) {
      for (const note of track.notes) {
        maxTime = Math.max(maxTime, note.time + note.duration)
      }
    }
    if (maxTime <= 0) return

    const bpm = midi.header.tempos[0]?.bpm ?? 120
    const beatDur = 60 / bpm
    const barDur = beatDur * 4

    type Profile = {
      track: MidiTrack
      avgPitch: number
      melodyScore: number
      noteCount: number
    }
    const profiles: Profile[] = []
    for (const track of midi.tracks) {
      if (track.channel === 9 || track.notes.length === 0) continue
      const sorted = [...track.notes].sort((a, b) => a.time - b.time)
      let pitchSum = 0
      let overlaps = 0
      let prevEnd = -1
      for (const note of sorted) {
        pitchSum += note.midi
        if (note.time < prevEnd - 0.001) overlaps++
        prevEnd = Math.max(prevEnd, note.time + note.duration)
      }
      const avgPitch = pitchSum / sorted.length
      const overlapRatio = overlaps / sorted.length
      const density = sorted.length / Math.max(1, maxTime)
      const melodyScore = avgPitch - overlapRatio * 22 + Math.min(8, density * 1.5)
      profiles.push({ track, avgPitch, melodyScore, noteCount: sorted.length })
    }
    if (profiles.length === 0) return

    // Keep bass mostly stable: avoid very low-average tracks in cameo sources.
    const sourceProfiles = profiles.filter((p) => p.avgPitch >= 50)
    if (sourceProfiles.length === 0) return

    const ranked = [...sourceProfiles].sort((a, b) => b.melodyScore - a.melodyScore)
    const melodyPoolSize = Math.max(1, Math.min(2, ranked.length))
    const melodyPool = ranked.slice(0, melodyPoolSize)
    const melodyTrackSet = new Set(melodyPool.map((p) => p.track))
    const nonMelodyPool = ranked.filter((p) => !melodyTrackSet.has(p.track))

    const noveltyPrograms = [
      105, // Banjo
      109, // Bagpipe
      108, // Kalimba
      112, // Tinkle Bell
      21,  // Accordion
      13,  // Xylophone
      110, // Fiddle
      78,  // Whistle
      114, // Steel Drums
    ]

    function clampMidi(n: number): number {
      return Math.max(0, Math.min(127, n))
    }

    const usedChannels = new Set(midi.tracks.map((t) => t.channel))
    function allocChannel(): number {
      for (let c = 0; c < 16; c++) {
        if (c === 9) continue
        if (!usedChannels.has(c)) {
          usedChannels.add(c)
          return c
        }
      }
      let c = Math.floor(rng() * 15)
      if (c >= 9) c++
      return c
    }

    const chancePerBar = 0.03 + intensity * 0.09 // ~3-12% each bar
    const maxCameos = Math.max(1, 2 + Math.floor(intensity * 6))
    let cameoCount = 0

    for (let barStart = 0; barStart < maxTime && cameoCount < maxCameos; barStart += barDur) {
      if (rng() >= chancePerBar) continue

      const chooseMelody = nonMelodyPool.length === 0 || rng() < 0.85
      const pool = chooseMelody ? melodyPool : nonMelodyPool
      if (pool.length === 0) continue
      const src = pool[Math.floor(rng() * pool.length)]

      const windowStart = barStart + rng() * barDur * 0.35
      const windowDur = barDur * (0.4 + rng() * 0.8)
      const windowEnd = Math.min(maxTime, windowStart + windowDur)

      const clippedNotes: Array<{ midi: number; time: number; duration: number; velocity: number; srcIdx: number }> = []
      for (let i = 0; i < src.track.notes.length; i++) {
        const note = src.track.notes[i]
        const noteEnd = note.time + note.duration
        if (note.time >= windowEnd || noteEnd <= windowStart) continue

        const start = Math.max(note.time, windowStart)
        const end = Math.min(noteEnd, windowEnd)
        const octaveShift = rng() < 0.2 ? (rng() < 0.5 ? -12 : 12) : 0
        clippedNotes.push({
          midi: clampMidi(note.midi + octaveShift),
          time: start,
          duration: Math.max(0.03, end - start),
          velocity: Math.max(0.1, Math.min(1, note.velocity * (0.75 + rng() * 0.45))),
          srcIdx: i,
        })
      }
      if (clippedNotes.length === 0) continue

      const cameoTrack = addTrack(midi, allocChannel())
      cameoTrack.instrument = noveltyPrograms[Math.floor(rng() * noveltyPrograms.length)]
      for (const n of clippedNotes) {
        addNote(cameoTrack, {
          midi: n.midi,
          time: n.time,
          duration: n.duration,
          velocity: n.velocity,
        })
      }

      // Make cameo audible without deleting source notes.
      for (const n of clippedNotes) {
        const srcNote = src.track.notes[n.srcIdx]
        const duck = chooseMelody ? (0.2 + rng() * 0.2) : (0.6 + rng() * 0.2)
        srcNote.velocity = Math.max(0.05, srcNote.velocity * duck)
      }

      cameoCount++
    }
  },
}

const shredSolo: Effect = {
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

    // Find a free channel (skip 9)
    const usedChannels = new Set(midi.tracks.map(t => t.channel))
    let soloCh = 0
    for (let c = 0; c < 16; c++) {
      if (c === 9) continue
      if (!usedChannels.has(c)) { soloCh = c; break }
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
      const instrument = gi === 2
        ? 19 // Church Organ for toccata
        : soloInstruments[Math.floor(rng() * soloInstruments.length)]

      // Each solo gets its own track so it can have a different instrument
      const track = addTrack(midi, soloCh)
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

// ── Registry & pipeline ──────────────────────────────────

export const effects: Effect[] = [
  panFlute,
  drunkNotes,
  tempoTantrum,
  ghostDrums,
  cpuThrottle,
  butterFingers,
  volumeRollercoaster,
  echoChamber,
  moodSwing,
  devilsInterval,
  tremoloTerror,
  melodyHijack,
  shredSolo,
]

export interface EnabledEffect {
  id: string
  intensity: number
}

export interface EnshittifyResult {
  midi: MidiFile
  seed: number
}

/**
 * Clone original MIDI and apply enabled effects.
 * Uses a random seed by default so each run produces different results.
 * Pass a seed for deterministic replay (e.g. sharing).
 */
export function enshittify(
  original: MidiFile,
  enabled: EnabledEffect[],
  seed: number = randomSeed(),
): EnshittifyResult {
  const midi = cloneMidi(original)
  const rng = mulberry32(seed)

  for (const { id, intensity } of enabled) {
    if (intensity <= 0) continue
    const effect = effects.find((e) => e.id === id)
    effect?.apply(midi, intensity, rng)
  }

  return { midi, seed }
}
