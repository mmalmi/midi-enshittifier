<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    body: Snippet
    actions?: Snippet
    href?: string | null
    onactivate?: (() => void) | null
    showPlaybackTrack?: boolean
    playbackActive?: boolean
    playbackLoading?: boolean
    playbackProgress?: number
    playbackInteractive?: boolean
    onPlaybackSeek?: ((ratio: number) => void) | null
  }

  let {
    body,
    actions,
    href = null,
    onactivate = null,
    showPlaybackTrack = false,
    playbackActive = false,
    playbackLoading = false,
    playbackProgress = 0,
    playbackInteractive = false,
    onPlaybackSeek = null,
  }: Props = $props()

  let barEl = $state<HTMLButtonElement | HTMLDivElement | null>(null)
  let clampedProgress = $derived(Math.max(0, Math.min(100, playbackProgress)))

  function ratioFromClientX(clientX: number): number {
    if (!barEl) return 0
    const rect = barEl.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  function handleSeek(clientX: number) {
    if (!playbackInteractive || !onPlaybackSeek) return
    onPlaybackSeek(ratioFromClientX(clientX))
  }
</script>

<div class="group relative overflow-hidden rounded-2xl border border-surface-lighter bg-surface select-none transform-gpu transition-all duration-200 hover:scale-[1.012] hover:border-primary-op50">
  <div class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(255,78,168,0.18),transparent_26%),radial-gradient(circle_at_82%_76%,rgba(84,214,255,0.14),transparent_28%)] blur-2xl"></div>
  </div>

  <div class="relative z-10 flex items-center gap-3 p-3">
    {#if href}
      <a class="min-w-0 flex-1 select-none no-underline text-white" {href}>
        {@render body()}
      </a>
    {:else}
      <button
        type="button"
        class="min-w-0 flex-1 cursor-pointer border-none bg-transparent p-0 text-left text-white select-none"
        onclick={() => onactivate?.()}
      >
        {@render body()}
      </button>
    {/if}

    {#if actions}
      <div class="flex shrink-0 items-center gap-2">
        {@render actions()}
      </div>
    {/if}
  </div>

  {#if showPlaybackTrack}
    {#if playbackInteractive}
      <button
        type="button"
        bind:this={barEl}
        class="absolute inset-x-0 bottom-0 h-2.5 overflow-hidden border-none border-t border-white/14 bg-black/35 p-0 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        aria-label="Seek playback"
        title="Seek playback"
        onclick={(e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          handleSeek(e.clientX)
        }}
        onkeydown={(e) => {
          if (!onPlaybackSeek) return
          const step = e.shiftKey ? 0.1 : 0.03
          const current = clampedProgress / 100
          if (e.key === 'ArrowRight') {
            onPlaybackSeek(Math.min(1, current + step))
            e.preventDefault()
            e.stopPropagation()
          }
          if (e.key === 'ArrowLeft') {
            onPlaybackSeek(Math.max(0, current - step))
            e.preventDefault()
            e.stopPropagation()
          }
        }}
      >
        {#if playbackLoading}
          <div class="absolute inset-0 bg-primary-op10 opacity-70"></div>
          <div class="absolute inset-y-0 w-12 animate-[row-progress-scan_1.1s_ease-in-out_infinite] rounded-full bg-primary shadow-[0_0_18px_rgba(255,78,168,0.45)]"></div>
        {:else}
          <div
            class="h-full rounded-r-full bg-primary transition-[width] duration-150 ease-out shadow-[0_0_18px_rgba(255,78,168,0.45)]"
            style:width={`${clampedProgress}%`}
          ></div>
          <div
            class="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/25 bg-primary shadow-[0_0_12px_rgba(255,78,168,0.45)] transition-opacity duration-150"
            class:opacity-100={playbackActive || playbackInteractive}
            class:opacity-0={!playbackActive && !playbackInteractive}
            style:left={`calc(${clampedProgress}% - 7px)`}
          ></div>
        {/if}
      </button>
    {:else}
      <div
        bind:this={barEl}
        class="absolute inset-x-0 bottom-0 h-2.5 overflow-hidden border-t border-white/14 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        aria-hidden="true"
      >
        {#if playbackLoading}
          <div class="absolute inset-0 bg-primary-op10 opacity-70"></div>
          <div class="absolute inset-y-0 w-12 animate-[row-progress-scan_1.1s_ease-in-out_infinite] rounded-full bg-primary shadow-[0_0_18px_rgba(255,78,168,0.45)]"></div>
        {:else}
          <div
            class="h-full rounded-r-full bg-primary transition-[width] duration-150 ease-out shadow-[0_0_18px_rgba(255,78,168,0.45)]"
            style:width={`${clampedProgress}%`}
          ></div>
          <div
            class="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/25 bg-primary shadow-[0_0_12px_rgba(255,78,168,0.45)] transition-opacity duration-150"
            class:opacity-100={playbackActive}
            class:opacity-0={!playbackActive}
            style:left={`calc(${clampedProgress}% - 7px)`}
          ></div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  @keyframes row-progress-scan {
    0% { transform: translateX(-160%); }
    100% { transform: translateX(960%); }
  }
</style>
