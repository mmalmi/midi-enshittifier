<script lang="ts">
  import { onMount } from 'svelte'
  import { nip19 } from 'nostr-tools'
  import Name from './Name.svelte'
  import { getNostrState } from '$lib/nostr/store'
  import { getFollowsForPubkey } from '$lib/nostr/follows'
  import { listUserSongs, type SongSummary } from '$lib/songs'
  import { buildSongRoute } from '$lib/router'

  interface FeedItem extends SongSummary {
    route: string
  }

  const DEFAULT_FEED_PUBKEYS = ['3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d']

  let items = $state<FeedItem[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)

  function interleaveByOwner(rows: FeedItem[]): FeedItem[] {
    const groups = new Map<string, FeedItem[]>()
    for (const item of rows) {
      const owner = item.ownerPubkey
      const list = groups.get(owner) ?? []
      list.push(item)
      groups.set(owner, list)
    }

    for (const list of groups.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt)
    }

    const ordered: FeedItem[] = []
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

  function relTime(ts: number): string {
    const diff = Math.floor(Date.now() / 1000) - ts
    if (diff < 60) return `${diff}s ago`
    const mins = Math.floor(diff / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
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

      const rows: FeedItem[] = []

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
            rows.push({
              ...song,
              route: buildSongRoute(song.ownerNpub, song.id),
            })
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
        <a class="card no-underline text-white hover:border-primary" href={item.route}>
          <div class="text-sm font-medium">{item.title}</div>
          <div class="text-xs text-gray-400 mt-1">
            <Name npub={item.ownerNpub} class="text-primary" />
            · {item.effects.length} effects · seed {item.seed} · {relTime(item.createdAt)}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
