<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    onfile,
    children,
  }: { onfile: (file: File) => void; children?: Snippet } = $props()
  let dragging = $state(false)
  let dragDepth = $state(0)
  let inputEl: HTMLInputElement

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    dragDepth = 0
    dragging = false
    const file = e.dataTransfer?.files[0]
    if (file) onfile(file)
  }

  function handleChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) onfile(file)
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault()
    dragDepth += 1
    dragging = true
  }

  function handleDragLeave() {
    dragDepth = Math.max(0, dragDepth - 1)
    dragging = dragDepth > 0
  }
</script>

<div
  class="dropzone border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 hover:bg-white/5 hover:border-gray-500"
  class:border-primary={dragging}
  class:border-surface-lighter={!dragging}
  class:bg-primary-op10={dragging}
  class:dropzone-dragging={dragging}
  ondrop={handleDrop}
  ondragenter={handleDragEnter}
  ondragover={(e) => e.preventDefault()}
  ondragleave={handleDragLeave}
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
    <div class="dropzone-signal" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <p class="dropzone-glyph text-4xl mb-3">{dragging ? '☯' : '🎵'}</p>
    <p class="dropzone-copy text-gray-300">
      {dragging ? 'Release the cursed MIDI relic' : 'Drop a MIDI file here or click to upload'}
    </p>
    <p class="dropzone-subtle text-gray-600 text-sm mt-1">
      {dragging ? 'signal stable enough for .mid / .midi' : '.mid / .midi'}
    </p>
  {/if}
</div>
