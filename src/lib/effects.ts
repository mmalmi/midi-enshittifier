import type { MidiFile } from './midi'
import { cloneMidi } from './midi'
import { mulberry32, randomSeed } from './rng'
import { effects } from './effects/registry'
import type { EnabledEffect, EnshittifyResult } from './effects/types'

export { effects }
export type { Effect, EnabledEffect, EnshittifyResult } from './effects/types'

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
