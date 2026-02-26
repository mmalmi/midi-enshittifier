/**
 * Generate a test MIDI file for e2e tests.
 * Run: npx tsx e2e/generate-fixture.ts
 */
import { createMidi, addTrack, addNote, writeMidi } from '../src/lib/midi'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const midi = createMidi()

// Piano track - C major scale
const piano = addTrack(midi, 0)
piano.instrument = 0
;[60, 62, 64, 65, 67, 69, 71, 72].forEach((n, i) => {
  addNote(piano, { midi: n, time: i * 0.5, duration: 0.4, velocity: 0.8 })
})

// Bass track
const bass = addTrack(midi, 1)
bass.instrument = 32
;[36, 43, 36, 43].forEach((n, i) => {
  addNote(bass, { midi: n, time: i * 1.0, duration: 0.9, velocity: 0.7 })
})

const out = join(dirname(new URL(import.meta.url).pathname), 'fixtures', 'test.mid')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, writeMidi(midi))
console.log(`wrote ${out}`)
