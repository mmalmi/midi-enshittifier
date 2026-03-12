<script lang="ts">
  import type { RecentShare } from '$lib/recents'
  import { formatRelativeTime } from '$lib/songPresentation'
  import ListRow from './ListRow.svelte'

  let {
    recents,
    onload,
    onremove,
  }: {
    recents: RecentShare[]
    onload: (entry: RecentShare) => void
    onremove: (nhash: string) => void
  } = $props()

</script>

{#if recents.length > 0}
  <div class="mb-4" data-testid="recents">
    <div class="text-xs text-gray-500 mb-2">Recent shares</div>
    <div class="flex flex-col gap-2">
      {#each recents as entry (entry.nhash)}
        <ListRow onactivate={() => onload(entry)}>
          {#snippet body()}
            <div class="min-w-0">
              <div class="truncate text-sm font-medium">{entry.recordName || entry.fileName}</div>
              <div class="mt-1 text-xs text-gray-500">
                {#if entry.recordName && entry.recordName !== entry.fileName}
                  {entry.fileName} ·
                {/if}
                {entry.config.effects.length} effects · seed {entry.config.seed} · {formatRelativeTime(Math.floor(entry.timestamp / 1000))}
              </div>
            </div>
          {/snippet}

          {#snippet actions()}
            <button
              type="button"
              class="btn-ghost px-2 py-2 text-gray-400 hover:text-red-300"
              onclick={() => onremove(entry.nhash)}
              aria-label={`Remove ${entry.recordName || entry.fileName} from recents`}
              title="Remove recent share"
            >
              ✕
            </button>
          {/snippet}
        </ListRow>
      {/each}
    </div>
  </div>
{/if}
