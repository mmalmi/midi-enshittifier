<script lang="ts">
  import type { RecentShare } from '$lib/recents'

  let {
    recents,
    onload,
    onremove,
  }: {
    recents: RecentShare[]
    onload: (entry: RecentShare) => void
    onremove: (nhash: string) => void
  } = $props()

  function relativeTime(ts: number): string {
    const delta = Date.now() - ts
    const mins = Math.floor(delta / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }
</script>

{#if recents.length > 0}
  <div class="mb-4" data-testid="recents">
    <div class="text-xs text-gray-500 mb-2">Recent shares</div>
    <div class="flex flex-col gap-1">
      {#each recents as entry (entry.nhash)}
        <div class="group flex items-center gap-2 rounded-lg px-3 py-2 bg-surface-light hover:bg-surface-lighter transition-colors">
          <button
            class="flex-1 text-left cursor-pointer bg-transparent border-none text-inherit p-0"
            onclick={() => onload(entry)}
          >
            <div class="text-sm truncate">{entry.recordName || entry.fileName}</div>
            <div class="text-xs text-gray-500">
              {#if entry.recordName && entry.recordName !== entry.fileName}
                {entry.fileName} ·
              {/if}
              {entry.config.effects.length} effects · seed {entry.config.seed} · {relativeTime(entry.timestamp)}
            </div>
          </button>
          <button
            class="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 bg-transparent border-none cursor-pointer text-sm p-1 transition-opacity"
            onclick={() => onremove(entry.nhash)}
            title="Remove"
          >
            ✕
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}
