<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    onfile,
    children,
  }: { onfile: (file: File) => void; children?: Snippet } = $props()
  let dragging = $state(false)
  let inputEl: HTMLInputElement

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    dragging = false
    const file = e.dataTransfer?.files[0]
    if (file) onfile(file)
  }

  function handleChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) onfile(file)
  }
</script>

<div
  class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 hover:bg-white/5 hover:border-gray-500"
  class:border-primary={dragging}
  class:border-surface-lighter={!dragging}
  class:bg-primary-op10={dragging}
  ondrop={handleDrop}
  ondragover={(e) => {
    e.preventDefault()
    dragging = true
  }}
  ondragleave={() => (dragging = false)}
  onclick={() => inputEl.click()}
  role="button"
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && inputEl.click()}
>
  <input
    bind:this={inputEl}
    type="file"
    accept=".mid,.midi"
    class="hidden"
    onchange={handleChange}
  />
  {#if children}
    {@render children()}
  {:else}
    <p class="text-4xl mb-3">🎵</p>
    <p class="text-gray-400">Drop a MIDI file here or click to upload</p>
    <p class="text-gray-600 text-sm mt-1">.mid / .midi</p>
  {/if}
</div>
