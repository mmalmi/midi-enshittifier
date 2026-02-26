import type { MidiFile } from '../midi'

export interface Effect {
  id: string
  name: string
  description: string
  emoji: string
  defaultIntensity: number
  apply: (midi: MidiFile, intensity: number, rng: () => number) => void
}

export interface EnabledEffect {
  id: string
  intensity: number
}

export interface EnshittifyResult {
  midi: MidiFile
  seed: number
}
