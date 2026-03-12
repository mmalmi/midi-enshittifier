import type { MidiTrack } from '../midi'
import { addTrack, addNote } from '../midi'
import type { Effect } from './types'

// ── Effects ──────────────────────────────────────────────

function clampMidi(n: number): number {
  return Math.max(0, Math.min(127, n))
}

type Phrase = MidiTrack['notes']

function phraseGroups(track: MidiTrack): Phrase[] {
  const sorted = [...track.notes].sort((a, b) => a.time - b.time || a.midi - b.midi)
  const groups: Phrase[] = []
  let current: Phrase = []
  let prevEnd = -1

  for (const note of sorted) {
    if (current.length === 0 || note.time - prevEnd <= 0.22) {
      current.push(note)
      prevEnd = Math.max(prevEnd, note.time + note.duration)
      continue
    }

    groups.push(current)
    current = [note]
    prevEnd = note.time + note.duration
  }

  if (current.length) groups.push(current)
  return groups
}

export const drunkNotes: Effect = {
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
          note.midi = clampMidi(note.midi + shift)
        }
      }
    }
  },
}

export const tempoTantrum: Effect = {
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

    // Apply warp to all notes, including drums, so groove stays aligned.
    for (const track of midi.tracks) {
      for (const note of track.notes) {
        const speed = localSpeed(note.time)
        const endWarped = warp(note.time + note.duration)
        note.time = Math.max(0, warp(note.time))
        note.duration = Math.max(0.01, endWarped - note.time)
      }
    }
  },
}

export const ghostDrums: Effect = {
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

export const cpuThrottle: Effect = {
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

export const butterFingers: Effect = {
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

export const volumeRollercoaster: Effect = {
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

export const echoChamber: Effect = {
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

export const octaveOops: Effect = {
  id: 'octaveOops',
  name: 'Octave Oops',
  description: 'Sudden register jumps and doubled octaves',
  emoji: '🪜',
  defaultIntensity: 0.4,
  apply(midi, intensity, rng) {
    const phraseChance = 0.12 + intensity * 0.58
    const duplicateChance = 0.18 + intensity * 0.5

    for (const track of midi.tracks) {
      if (track.channel === 9 || track.notes.length === 0) continue

      for (const phrase of phraseGroups(track)) {
        if (rng() >= phraseChance) continue

        const avgPitch = phrase.reduce((sum, note) => sum + note.midi, 0) / phrase.length
        const duplicate = rng() < duplicateChance
        const directionRoll = rng()
        const direction =
          avgPitch <= 47
            ? directionRoll < 0.88 ? 1 : -1
            : avgPitch >= 79
              ? directionRoll < 0.88 ? -1 : 1
              : directionRoll < 0.5 ? 1 : -1
        const shift = direction * 12

        if (duplicate) {
          for (const note of phrase) {
            addNote(track, {
              midi: clampMidi(note.midi + shift),
              time: note.time,
              duration: note.duration,
              velocity: Math.max(0.08, Math.min(1, note.velocity * (0.55 + rng() * 0.25))),
            })
          }
          continue
        }

        for (const note of phrase) {
          note.midi = clampMidi(note.midi + shift)
        }
      }
    }
  },
}

export const moodSwing: Effect = {
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

export const devilsInterval: Effect = {
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

export const tremoloTerror: Effect = {
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

export const melodyHijack: Effect = {
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
      75,  // Pan Flute
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
