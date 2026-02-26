/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module 'soundfont-player' {
  interface Player {
    play(note: number | string, time?: number, opts?: { duration?: number; gain?: number }): { stop(time?: number): void }
    stop(time?: number): void
  }
  interface Options {
    soundfont?: 'MusyngKite' | 'FluidR3_GM'
    format?: 'mp3' | 'ogg'
    destination?: AudioNode
    gain?: number
    only?: string[]
    nameToUrl?: (name: string, sf: string, format: string) => string
  }
  function instrument(ctx: AudioContext, name: string, opts?: Options): Promise<Player>
  function nameToUrl(name: string, sf?: string, format?: string): string
  export default { instrument, nameToUrl }
}
