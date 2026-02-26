import type { MidiFile, MidiNote } from './midi'
import Soundfont from 'soundfont-player'

type ProgressCb = (time: number, duration: number) => void

const LOOKAHEAD = 0.3
const INTERVAL = 100
const MAX_VOICES = 128

// GM program number → soundfont instrument name
const GM_NAMES: string[] = [
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano',
  'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavinet',
  'celesta', 'glockenspiel', 'music_box', 'vibraphone',
  'marimba', 'xylophone', 'tubular_bells', 'dulcimer',
  'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ',
  'reed_organ', 'accordion', 'harmonica', 'tango_accordion',
  'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean',
  'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics',
  'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass',
  'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2',
  'violin', 'viola', 'cello', 'contrabass',
  'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani',
  'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2',
  'choir_aahs', 'voice_oohs', 'synth_choir', 'orchestra_hit',
  'trumpet', 'trombone', 'tuba', 'muted_trumpet',
  'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2',
  'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax',
  'oboe', 'english_horn', 'bassoon', 'clarinet',
  'piccolo', 'flute', 'recorder', 'pan_flute',
  'blown_bottle', 'shakuhachi', 'whistle', 'ocarina',
  'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff',
  'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass__lead',
  'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir',
  'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep',
  'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere',
  'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi',
  'sitar', 'banjo', 'shamisen', 'koto',
  'kalimba', 'bagpipe', 'fiddle', 'shanai',
  'tinkle_bell', 'agogo', 'steel_drums', 'woodblock',
  'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal',
  'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet',
  'telephone_ring', 'helicopter', 'applause', 'gunshot',
]

type SFInstrument = { play: (note: number | string, time: number, opts?: { duration?: number; gain?: number }) => { stop: (time?: number) => void } }

const SF_CDN = 'https://paulrosen.github.io/midi-js-soundfonts'

// Global instrument cache across player instances
const instrumentCache = new Map<string, Promise<SFInstrument>>()

function sfUrl(name: string, sf: string, format: string): string {
  return `${SF_CDN}/${sf || 'FluidR3_GM'}/${name}-${format || 'mp3'}.js`
}

function loadInstrument(ctx: AudioContext, name: string, dest: AudioNode): Promise<SFInstrument> {
  const key = name
  if (!instrumentCache.has(key)) {
    instrumentCache.set(key, Soundfont.instrument(ctx, name as any, {
      soundfont: 'FluidR3_GM',
      destination: dest,
      nameToUrl: sfUrl,
    }) as Promise<SFInstrument>)
  }
  return instrumentCache.get(key)!
}

export class MidiPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private activeVoices = 0
  private startTs = 0
  private intervalId: ReturnType<typeof setInterval> | null = null
  private rafId: number | null = null
  private progressCbs: ProgressCb[] = []
  private endCbs: Array<() => void> = []
  private _playing = false
  private _duration = 0
  private _time = 0
  private noteQueue: Array<{ note: MidiNote; instrument: string }> = []
  private queueIdx = 0
  private currentMidi: MidiFile | null = null
  private loadedInstruments = new Map<string, SFInstrument>()
  private _loading = false

  get playing() { return this._playing }
  get loading() { return this._loading }
  get duration() { return this._duration }
  get currentTime() {
    if (!this._playing || !this.ctx) return this._time
    return Math.min(this.ctx.currentTime - this.startTs, this._duration)
  }

  onProgress(cb: ProgressCb) { this.progressCbs.push(cb) }
  onEnd(cb: () => void) { this.endCbs.push(cb) }

  async play(midi: MidiFile, from = 0) {
    this.stop()
    this.currentMidi = midi
    this._loading = true

    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(this.ctx.destination)

    this._duration = calcDuration(midi)

    // Determine which instruments we need
    const needed = new Set<string>()
    for (const track of midi.tracks) {
      if (track.channel === 9) {
        needed.add('percussion')
      } else {
        needed.add(GM_NAMES[track.instrument] ?? 'acoustic_grand_piano')
      }
    }

    // Load soundfont instruments in parallel
    instrumentCache.clear()
    this.loadedInstruments.clear()
    const entries = await Promise.all(
      [...needed].map(async (name) => {
        try {
          const inst = await loadInstrument(this.ctx!, name, this.master!)
          return [name, inst] as const
        } catch {
          try {
            const inst = await loadInstrument(this.ctx!, 'acoustic_grand_piano', this.master!)
            return [name, inst] as const
          } catch {
            return null
          }
        }
      }),
    )
    for (const entry of entries) {
      if (entry) this.loadedInstruments.set(entry[0], entry[1])
    }

    this._loading = false

    // Check if stopped during loading
    if (!this.ctx) return

    this.startTs = this.ctx.currentTime - from
    this._playing = true
    this.activeVoices = 0

    // Build sorted note queue
    this.noteQueue = []
    for (const track of midi.tracks) {
      const instName = track.channel === 9 ? 'percussion' : (GM_NAMES[track.instrument] ?? 'acoustic_grand_piano')
      for (const note of track.notes) {
        if (note.time + note.duration < from) continue
        this.noteQueue.push({ note, instrument: instName })
      }
    }
    this.noteQueue.sort((a, b) => a.note.time - b.note.time)
    this.queueIdx = 0

    this.scheduleNotes()
    this.intervalId = setInterval(() => this.scheduleNotes(), INTERVAL)
    this.tick()
  }

  stop() {
    this._playing = false
    this._loading = false
    if (this.intervalId != null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.noteQueue = []
    this.queueIdx = 0
    this.ctx?.close()
    this.ctx = null
    this.master = null
    this._time = 0
    this.activeVoices = 0
  }

  fullStop() {
    this.stop()
    this.currentMidi = null
  }

  setVolume(v: number) {
    if (this.master) this.master.gain.value = v
  }

  seek(time: number) {
    if (!this.currentMidi) return
    const midi = this.currentMidi
    const wasPlaying = this._playing
    if (wasPlaying) {
      this.play(midi, Math.max(0, Math.min(time, this._duration)))
    } else {
      this._time = Math.max(0, Math.min(time, this._duration))
      for (const cb of this.progressCbs) cb(this._time, this._duration)
    }
  }

  // ── scheduler ──────────────────────────────────

  private scheduleNotes() {
    if (!this.ctx || !this._playing) return
    const now = this.ctx.currentTime - this.startTs
    const until = now + LOOKAHEAD

    while (this.queueIdx < this.noteQueue.length) {
      const { note, instrument: instName } = this.noteQueue[this.queueIdx]
      if (note.time > until) break
      if (this.activeVoices >= MAX_VOICES) break

      const entry = this.loadedInstruments.get(instName)
      if (entry) {
        const t0 = Math.max(this.startTs + note.time, this.ctx.currentTime + 0.005)
        const dur = note.duration
        if (dur > 0) {
          entry.play(note.midi, t0, {
            duration: dur,
            gain: note.velocity,
          })
          this.activeVoices++
          const ms = Math.max(0, (t0 - this.ctx.currentTime + Math.min(dur, 0.3) + 0.1) * 1000)
          setTimeout(() => { this.activeVoices = Math.max(0, this.activeVoices - 1) }, ms)
        }
      }
      this.queueIdx++
    }
  }

  private tick = () => {
    if (!this._playing) return
    const t = this.currentTime
    this._time = t
    for (const cb of this.progressCbs) cb(t, this._duration)
    if (t >= this._duration) {
      for (const cb of this.endCbs) cb()
      this.stop()
      return
    }
    this.rafId = requestAnimationFrame(this.tick)
  }
}

function calcDuration(midi: MidiFile): number {
  let max = 0
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      max = Math.max(max, note.time + note.duration)
    }
  }
  return max
}
