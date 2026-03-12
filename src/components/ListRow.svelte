<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    body: Snippet
    actions?: Snippet
    href?: string | null
    onactivate?: (() => void) | null
    playbackActive?: boolean
    playbackLoading?: boolean
    playbackProgress?: number
  }

  let {
    body,
    actions,
    href = null,
    onactivate = null,
    playbackActive = false,
    playbackLoading = false,
    playbackProgress = 0,
  }: Props = $props()
</script>

<div class="group relative overflow-hidden rounded-2xl border border-surface-lighter bg-surface transform-gpu transition-all duration-200 hover:scale-[1.012] hover:border-primary-op50">
  <div class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(255,78,168,0.18),transparent_26%),radial-gradient(circle_at_82%_76%,rgba(84,214,255,0.14),transparent_28%)] blur-2xl"></div>
  </div>

  <div class="relative z-10 flex items-center gap-3 p-3">
    {#if href}
      <a class="min-w-0 flex-1 no-underline text-white" {href}>
        {@render body()}
      </a>
    {:else}
      <button
        type="button"
        class="min-w-0 flex-1 cursor-pointer border-none bg-transparent p-0 text-left text-white"
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

  {#if playbackActive || playbackLoading}
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 overflow-hidden bg-black/20">
      {#if playbackLoading}
        <div class="h-full w-1/3 animate-[row-progress-scan_1.1s_ease-in-out_infinite] rounded-r-full bg-primary shadow-[0_0_18px_rgba(255,78,168,0.45)]"></div>
      {:else}
        <div
          class="h-full rounded-r-full bg-primary transition-[width] duration-150 ease-out shadow-[0_0_18px_rgba(255,78,168,0.45)]"
          style:width={`${Math.max(0, Math.min(100, playbackProgress))}%`}
        ></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  @keyframes row-progress-scan {
    0% { transform: translateX(-120%); }
    100% { transform: translateX(360%); }
  }
</style>
