<script lang="ts">
  import { onMount } from 'svelte'
  import { nip19 } from 'nostr-tools'
  import { getNostrState } from '$lib/nostr/store'
  import { getFollowsForPubkey } from '$lib/nostr/follows'
  import { listUserSongs, type SongSummary } from '$lib/songs'
  import PublishedSongRow from './PublishedSongRow.svelte'

  interface Props {
    onPlaybackState?: (playing: boolean) => void
  }

  let { onPlaybackState }: Props = $props()

  const DEFAULT_FEED_PUBKEYS = ['3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d']

  let items = $state<SongSummary[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let activePlaybackId = $state<string | null>(null)

  function interleaveByOwner(rows: SongSummary[]): SongSummary[] {
    const groups = new Map<string, SongSummary[]>()
    for (const item of rows) {
      const owner = item.ownerPubkey
      const list = groups.get(owner) ?? []
      list.push(item)
      groups.set(owner, list)
    }

    for (const list of groups.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt)
    }

    const ordered: SongSummary[] = []
    const keys = Array.from(groups.keys())
    let added = true

    while (added) {
      added = false
      for (const key of keys) {
        const list = groups.get(key)
        if (!list || list.length === 0) continue
        const next = list.shift()
        if (!next) continue
        ordered.push(next)
        added = true
      }
    }

    return ordered
  }

  async function loadFeed() {
    loading = true
    error = null

    try {
      const state = getNostrState()
      if (!state.pubkey) {
        items = []
        loading = false
        return
      }

      const follows = await getFollowsForPubkey(state.pubkey)
      const targets = new Set<string>([state.pubkey, ...follows])

      if (follows.length < 5) {
        for (const seed of DEFAULT_FEED_PUBKEYS) targets.add(seed)
      }

      const rows: SongSummary[] = []

      await Promise.all(
        Array.from(targets).map(async (pubkey) => {
          let npub = ''
          try {
            npub = nip19.npubEncode(pubkey)
          } catch {
            return
          }

          const songs = await listUserSongs(npub)
          for (const song of songs) {
            rows.push(song)
          }
        }),
      )

      items = interleaveByOwner(rows)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load feed'
      items = []
    } finally {
      loading = false
    }
  }

  onMount(() => {
    void loadFeed()
  })

  function handleActivatePlayback(id: string) {
    activePlaybackId = id
  }

  function handleSongPlayback(id: string, playing: boolean) {
    if (playing) {
      activePlaybackId = id
      onPlaybackState?.(true)
      return
    }

    if (activePlaybackId === id) {
      activePlaybackId = null
      onPlaybackState?.(false)
    }
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-semibold">Feed</h2>
    <button class="btn-ghost px-3 py-1 text-xs" onclick={loadFeed} disabled={loading}>Refresh</button>
  </div>

  {#if loading}
    <div class="card text-gray-400">Loading feed...</div>
  {:else if error}
    <div class="card text-red-400">{error}</div>
  {:else if items.length === 0}
    <div class="card text-gray-400">No songs in your feed yet.</div>
  {:else}
    <div class="grid gap-3">
      {#each items as item (item.ownerNpub + ':' + item.id)}
        <PublishedSongRow
          song={item}
          showOwner
          {activePlaybackId}
          onActivatePlayback={handleActivatePlayback}
          onPlaybackState={handleSongPlayback}
        />
      {/each}
    </div>
  {/if}
</div>
