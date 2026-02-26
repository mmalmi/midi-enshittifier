/**
 * Minimal MIDI parser/serializer. Zero dependencies.
 * Replaces @tonejs/midi to avoid vitest CJS interop deadlocks.
 */

export interface MidiNote {
  midi: number
  velocity: number
  time: number      // seconds
  duration: number  // seconds
  ticks: number
  durationTicks: number
}

export interface MidiTrack {
  channel: number
  instrument: number
  notes: MidiNote[]
}

export interface TempoEvent {
  bpm: number
  ticks: number
}

export interface MidiFile {
  header: {
    ppq: number
    tempos: TempoEvent[]
  }
  tracks: MidiTrack[]
}

// ── Variable-length quantity ─────────────────────────────

function readVarInt(data: Uint8Array, offset: number): [number, number] {
  let value = 0
  let i = offset
  let byte: number
  do {
    byte = data[i++]
    value = (value << 7) | (byte & 0x7f)
  } while (byte & 0x80)
  return [value, i]
}

function writeVarInt(value: number): number[] {
  if (value < 0) value = 0
  const bytes: number[] = []
  bytes.push(value & 0x7f)
  value >>= 7
  while (value > 0) {
    bytes.push((value & 0x7f) | 0x80)
    value >>= 7
  }
  return bytes.reverse()
}

// ── Tempo map helpers ────────────────────────────────────

function ticksToSeconds(ticks: number, tempos: TempoEvent[], ppq: number): number {
  if (tempos.length === 0) return (ticks / ppq) * 0.5 // 120 BPM default

  let seconds = 0
  let prevTick = 0
  let secsPerTick = 60 / (tempos[0].bpm * ppq)

  for (const t of tempos) {
    if (t.ticks >= ticks) break
    seconds += (Math.min(t.ticks, ticks) - prevTick) * secsPerTick
    prevTick = t.ticks
    secsPerTick = 60 / (t.bpm * ppq)
  }
  seconds += (ticks - prevTick) * secsPerTick
  return seconds
}

function secondsToTicks(seconds: number, tempos: TempoEvent[], ppq: number): number {
  if (tempos.length === 0) return Math.round(seconds * ppq * 2) // 120 BPM

  let remainSec = seconds
  let prevTick = 0
  let secsPerTick = 60 / (tempos[0].bpm * ppq)

  for (let i = 1; i < tempos.length; i++) {
    const segTicks = tempos[i].ticks - prevTick
    const segSec = segTicks * secsPerTick
    if (remainSec <= segSec) break
    remainSec -= segSec
    prevTick = tempos[i].ticks
    secsPerTick = 60 / (tempos[i].bpm * ppq)
  }
  return prevTick + Math.round(remainSec / secsPerTick)
}

// ── Parse ────────────────────────────────────────────────

function readUint16(d: Uint8Array, o: number) { return (d[o] << 8) | d[o + 1] }
function readUint32(d: Uint8Array, o: number) { return (d[o] << 24 | d[o + 1] << 16 | d[o + 2] << 8 | d[o + 3]) >>> 0 }

export function parseMidi(data: Uint8Array): MidiFile {
  let pos = 0

  // Header
  const headerTag = String.fromCharCode(data[0], data[1], data[2], data[3])
  if (headerTag !== 'MThd') throw new Error('Not a MIDI file')
  pos = 4
  const headerLen = readUint32(data, pos); pos += 4
  /* const format = readUint16(data, pos); */ pos += 2
  const numTracks = readUint16(data, pos); pos += 2
  const ppq = readUint16(data, pos); pos += 2
  pos = 8 + headerLen // skip any extra header bytes

  const tempos: TempoEvent[] = []
  const tracks: MidiTrack[] = []

  for (let t = 0; t < numTracks; t++) {
    // Track header
    pos += 4 // "MTrk"
    const trackLen = readUint32(data, pos); pos += 4
    const trackEnd = pos + trackLen

    let absoluteTick = 0
    let runningStatus = 0

    // Per-channel state for splitting format-0 tracks
    type NoteRaw = { midi: number; velocity: number; tickOn: number; tickOff: number; ch: number }
    const noteOns = new Map<number, { tick: number; velocity: number }[]>() // key = ch*128+pitch
    const notes: NoteRaw[] = []
    const instruments = new Map<number, number>() // channel -> program

    while (pos < trackEnd) {
      let delta: number
      ;[delta, pos] = readVarInt(data, pos)
      absoluteTick += delta

      let status = data[pos]
      if (status < 0x80) {
        status = runningStatus
      } else {
        runningStatus = status
        pos++
      }

      const type = status & 0xf0
      const ch = status & 0x0f

      if (type === 0x90) {
        const pitch = data[pos++]
        const vel = data[pos++]
        const key = ch * 128 + pitch
        if (vel > 0) {
          if (!noteOns.has(key)) noteOns.set(key, [])
          noteOns.get(key)!.push({ tick: absoluteTick, velocity: vel / 127 })
        } else {
          const pending = noteOns.get(key)
          if (pending?.length) {
            const on = pending.shift()!
            notes.push({ midi: pitch, velocity: on.velocity, tickOn: on.tick, tickOff: absoluteTick, ch })
          }
        }
      } else if (type === 0x80) {
        const pitch = data[pos++]
        pos++ // velocity (ignored)
        const key = ch * 128 + pitch
        const pending = noteOns.get(key)
        if (pending?.length) {
          const on = pending.shift()!
          notes.push({ midi: pitch, velocity: on.velocity, tickOn: on.tick, tickOff: absoluteTick, ch })
        }
      } else if (type === 0xa0) { pos += 2 }
      else if (type === 0xb0) { pos += 2 }
      else if (type === 0xc0) {
        instruments.set(ch, data[pos++])
      }
      else if (type === 0xd0) { pos += 1 }
      else if (type === 0xe0) { pos += 2 }
      else if (status === 0xff) {
        const metaType = data[pos++]
        let metaLen: number
        ;[metaLen, pos] = readVarInt(data, pos)
        if (metaType === 0x51 && metaLen === 3) {
          const uspqn = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2]
          tempos.push({ bpm: 60000000 / uspqn, ticks: absoluteTick })
        }
        pos += metaLen
      } else if (status === 0xf0 || status === 0xf7) {
        let sysLen: number
        ;[sysLen, pos] = readVarInt(data, pos)
        pos += sysLen
      }
    }

    // Close unclosed notes
    for (const [key, pending] of noteOns) {
      const ch = (key >> 7) & 0x0f
      const pitch = key & 0x7f
      for (const on of pending) {
        notes.push({ midi: pitch, velocity: on.velocity, tickOn: on.tick, tickOff: absoluteTick, ch })
      }
    }

    pos = trackEnd

    // Group notes by channel → one MidiTrack per channel
    const byChannel = new Map<number, NoteRaw[]>()
    for (const n of notes) {
      if (!byChannel.has(n.ch)) byChannel.set(n.ch, [])
      byChannel.get(n.ch)!.push(n)
    }

    for (const [ch, chNotes] of byChannel) {
      tracks.push({
        channel: ch,
        instrument: instruments.get(ch) ?? 0,
        notes: chNotes.map(n => ({
          midi: n.midi,
          velocity: n.velocity,
          time: 0, duration: 0,
          ticks: n.tickOn,
          durationTicks: n.tickOff - n.tickOn,
        })),
      })
    }
  }

  // Sort tempos
  tempos.sort((a, b) => a.ticks - b.ticks)

  // Compute times from ticks
  for (const track of tracks) {
    for (const note of track.notes) {
      note.time = ticksToSeconds(note.ticks, tempos, ppq)
      const endTime = ticksToSeconds(note.ticks + note.durationTicks, tempos, ppq)
      note.duration = endTime - note.time
    }
  }

  return { header: { ppq, tempos }, tracks }
}

// ── Serialize ────────────────────────────────────────────

function writeUint16(v: number): number[] { return [(v >> 8) & 0xff, v & 0xff] }
function writeUint32(v: number): number[] { return [(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff] }

export function writeMidi(midi: MidiFile): Uint8Array {
  const ppq = midi.header.ppq
  const tempos = [...midi.header.tempos].sort((a, b) => a.ticks - b.ticks)

  // Recompute ticks from seconds for all notes (effects modify time/duration)
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      note.ticks = secondsToTicks(note.time, tempos, ppq)
      const endTicks = secondsToTicks(note.time + note.duration, tempos, ppq)
      note.durationTicks = Math.max(1, endTicks - note.ticks)
    }
  }

  const trackChunks: Uint8Array[] = []

  // Track 0: tempo map
  {
    const events: number[] = []
    let prevTick = 0
    for (const t of tempos) {
      const delta = Math.max(0, t.ticks - prevTick)
      events.push(...writeVarInt(delta))
      const uspqn = Math.round(60000000 / t.bpm)
      events.push(0xff, 0x51, 0x03, (uspqn >> 16) & 0xff, (uspqn >> 8) & 0xff, uspqn & 0xff)
      prevTick = t.ticks
    }
    // End of track
    events.push(0x00, 0xff, 0x2f, 0x00)
    const chunk = new Uint8Array([
      0x4d, 0x54, 0x72, 0x6b, // MTrk
      ...writeUint32(events.length),
      ...events
    ])
    trackChunks.push(chunk)
  }

  // Data tracks
  for (const track of midi.tracks) {
    const events: number[] = []

    // Program change
    events.push(0x00) // delta 0
    events.push(0xc0 | (track.channel & 0x0f), track.instrument & 0x7f)

    // Collect note on/off events
    const noteEvents: { tick: number; type: 'on' | 'off'; midi: number; velocity: number }[] = []
    for (const note of track.notes) {
      noteEvents.push({ tick: note.ticks, type: 'on', midi: note.midi, velocity: Math.round(note.velocity * 127) })
      noteEvents.push({ tick: note.ticks + note.durationTicks, type: 'off', midi: note.midi, velocity: 0 })
    }
    noteEvents.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1))

    let prevTick = 0
    for (const ev of noteEvents) {
      const delta = Math.max(0, ev.tick - prevTick)
      events.push(...writeVarInt(delta))
      if (ev.type === 'on') {
        events.push(0x90 | (track.channel & 0x0f), ev.midi & 0x7f, Math.max(1, Math.min(127, ev.velocity)))
      } else {
        events.push(0x80 | (track.channel & 0x0f), ev.midi & 0x7f, 0)
      }
      prevTick = ev.tick
    }

    // End of track
    events.push(0x00, 0xff, 0x2f, 0x00)

    const chunk = new Uint8Array([
      0x4d, 0x54, 0x72, 0x6b,
      ...writeUint32(events.length),
      ...events
    ])
    trackChunks.push(chunk)
  }

  // Header
  const numTracks = trackChunks.length
  const header = new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // header length
    ...writeUint16(numTracks > 1 ? 1 : 0), // format
    ...writeUint16(numTracks),
    ...writeUint16(ppq),
  ])

  // Concatenate
  const totalLen = header.length + trackChunks.reduce((s, c) => s + c.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  result.set(header, offset); offset += header.length
  for (const chunk of trackChunks) {
    result.set(chunk, offset); offset += chunk.length
  }
  return result
}

// ── Convenience constructors ─────────────────────────────

export function createMidi(): MidiFile {
  return {
    header: { ppq: 480, tempos: [{ bpm: 120, ticks: 0 }] },
    tracks: [],
  }
}

export function addTrack(midi: MidiFile, channel = 0): MidiTrack {
  const track: MidiTrack = { channel, instrument: 0, notes: [] }
  midi.tracks.push(track)
  return track
}

export function addNote(track: MidiTrack, opts: {
  midi: number; time: number; duration: number; velocity: number
}): MidiNote {
  const note: MidiNote = {
    midi: opts.midi,
    velocity: opts.velocity,
    time: opts.time,
    duration: opts.duration,
    ticks: 0,
    durationTicks: 0,
  }
  track.notes.push(note)
  return note
}

/** Deep clone a MidiFile (no shared references). */
export function cloneMidi(midi: MidiFile): MidiFile {
  return {
    header: {
      ppq: midi.header.ppq,
      tempos: midi.header.tempos.map(t => ({ ...t })),
    },
    tracks: midi.tracks.map(t => ({
      channel: t.channel,
      instrument: t.instrument,
      notes: t.notes.map(n => ({ ...n })),
    })),
  }
}
