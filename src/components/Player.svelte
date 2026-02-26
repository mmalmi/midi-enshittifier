<script lang="ts">
  import type { MidiFile } from '$lib/midi'
  import { MidiPlayer } from '$lib/player'

  let {
    original,
    enshittified,
  }: {
    original: MidiFile | null
    enshittified: MidiFile | null
  } = $props()

  let player = new MidiPlayer()
  let playing = $state(false)
  let loading = $state(false)
  let which = $state<'original' | 'enshittified' | null>(null)
  let currentTime = $state(0)
  let duration = $state(0)
  let seeking = $state(false)
  let seekTime = $state(0)
  let barEl: HTMLDivElement

  player.onProgress((t, d) => {
    if (!seeking) {
      currentTime = t
      duration = d
    }
  })
  player.onEnd(() => {
    playing = false
    which = null
    currentTime = 0
  })

  async function play(version: 'original' | 'enshittified') {
    const midi = version === 'original' ? original : enshittified
    if (!midi) return
    player.stop()
    playing = false
    loading = true
    which = version
    await player.play(midi)
    loading = false
    playing = true
    duration = player.duration
  }

  function stop() {
    player.stop()
    playing = false
    loading = false
    which = null
    currentTime = 0
  }

  function fmt(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // ── seek / scrub ──────────────────────────────

  function timeFromEvent(e: MouseEvent | Touch): number {
    const rect = barEl.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return pct * duration
  }

  function onBarDown(e: MouseEvent) {
    if (duration <= 0) return
    e.preventDefault()
    seeking = true
    seekTime = timeFromEvent(e)
    currentTime = seekTime

    const onMove = (ev: MouseEvent) => {
      seekTime = timeFromEvent(ev)
      currentTime = seekTime
    }
    const onUp = () => {
      seeking = false
      player.seek(seekTime)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function onBarTouch(e: TouchEvent) {
    if (duration <= 0 || !e.touches[0]) return
    seeking = true
    seekTime = timeFromEvent(e.touches[0])
    currentTime = seekTime

    const onMove = (ev: TouchEvent) => {
      if (!ev.touches[0]) return
      seekTime = timeFromEvent(ev.touches[0])
      currentTime = seekTime
    }
    const onEnd = () => {
      seeking = false
      player.seek(seekTime)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onEnd)
  }

  // Stop playback when the active file changes
  $effect(() => {
    original  // track dependency
    stop()
  })

  let displayTime = $derived(seeking ? seekTime : currentTime)
  let pct = $derived(duration > 0 ? (displayTime / duration) * 100 : 0)
</script>

<div class="card space-y-3">
  <div class="flex gap-2">
    <button
      class="flex-1 py-2 rounded-lg font-medium text-sm transition-all duration-150"
      class:bg-primary={which === 'original'}
      class:text-white={which === 'original'}
      class:bg-surface-lighter={which !== 'original'}
      class:text-gray-300={which !== 'original'}
      disabled={!original || loading}
      onclick={() => (which === 'original' && playing ? stop() : play('original'))}
    >
      {#if which === 'original' && loading}
        Loading...
      {:else if which === 'original' && playing}
        ⏹ Original
      {:else}
        ▶ Original
      {/if}
    </button>
    <button
      class="flex-1 py-2 rounded-lg font-medium text-sm transition-all duration-150"
      class:bg-primary={which === 'enshittified'}
      class:text-white={which === 'enshittified'}
      class:bg-surface-lighter={which !== 'enshittified'}
      class:text-gray-300={which !== 'enshittified'}
      disabled={!enshittified || loading}
      onclick={() =>
        which === 'enshittified' && playing ? stop() : play('enshittified')}
    >
      {#if which === 'enshittified' && loading}
        Loading...
      {:else if which === 'enshittified' && playing}
        ⏹ Enshittified
      {:else}
        ▶ Enshittified
      {/if}
    </button>
  </div>

  <!-- seekable progress bar -->
  <div
    bind:this={barEl}
    class="h-3 bg-surface rounded-full overflow-hidden cursor-pointer relative group"
    role="slider"
    tabindex="0"
    aria-valuemin={0}
    aria-valuemax={Math.round(duration)}
    aria-valuenow={Math.round(displayTime)}
    onmousedown={onBarDown}
    ontouchstart={onBarTouch}
    onkeydown={(e) => {
      if (duration <= 0) return
      const step = e.shiftKey ? 10 : 2
      if (e.key === 'ArrowRight') { player.seek(Math.min(duration, currentTime + step)); e.preventDefault() }
      if (e.key === 'ArrowLeft') { player.seek(Math.max(0, currentTime - step)); e.preventDefault() }
    }}
  >
    <div
      class="h-full bg-primary rounded-full pointer-events-none"
      class:transition-[width]={!seeking}
      class:duration-100={!seeking}
      style:width="{pct}%"
    ></div>
    <!-- thumb -->
    <div
      class="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-primary rounded-full shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150"
      class:opacity-100={seeking}
      style:left="{pct}%"
      style:margin-left="-7px"
    ></div>
  </div>

  <div class="flex justify-between text-xs text-gray-500">
    <span>{fmt(displayTime)}</span>
    <span>{fmt(duration)}</span>
  </div>
</div>
