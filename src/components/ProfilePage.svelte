<script lang="ts">
  import { onMount } from 'svelte'
  import { nip19 } from 'nostr-tools'
  import { buildSongRoute } from '$lib/router'
  import { listUserSongs, type SongSummary } from '$lib/songs'
  import { getNostrState } from '$lib/nostr/store'
  import { followPubkey, getFollowsForPubkey, unfollowPubkey } from '$lib/nostr/follows'
  import { getFollowers } from '$lib/nostr/socialGraph'
  import { animalNameFromNpub } from '$lib/animalName'

  interface Props {
    npub: string
  }

  let { npub }: Props = $props()

  let songs = $state<SongSummary[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let followingCount = $state(0)
  let followerCount = $state(0)
  let isFollowing = $state(false)
  let followBusy = $state(false)

  let myNpub = $derived(getNostrState().npub)
  let isOwn = $derived(myNpub === npub)

  function relTime(ts: number): string {
    const diff = Math.floor(Date.now() / 1000) - ts
    if (diff < 60) return `${diff}s ago`
    const mins = Math.floor(diff / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  async function refresh() {
    loading = true
    error = null

    try {
      songs = await listUserSongs(npub)

      const decoded = nip19.decode(npub)
      if (decoded.type === 'npub') {
        const profilePubkey = decoded.data as string
        followingCount = (await getFollowsForPubkey(profilePubkey)).length
        followerCount = getFollowers(profilePubkey).size

        const myPubkey = getNostrState().pubkey
        if (myPubkey && !isOwn) {
          const myFollows = await getFollowsForPubkey(myPubkey)
          isFollowing = myFollows.includes(profilePubkey)
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load profile'
      songs = []
    } finally {
      loading = false
    }
  }

  async function toggleFollow() {
    if (followBusy || isOwn) return
    followBusy = true

    try {
      const decoded = nip19.decode(npub)
      if (decoded.type !== 'npub') return
      const profilePubkey = decoded.data as string

      if (isFollowing) {
        const ok = await unfollowPubkey(profilePubkey)
        if (ok) isFollowing = false
      } else {
        const ok = await followPubkey(profilePubkey)
        if (ok) isFollowing = true
      }
    } finally {
      followBusy = false
    }
  }

  onMount(() => {
    void refresh()
  })
</script>

<div class="space-y-4">
  <div class="card">
    <div class="text-lg font-semibold">{animalNameFromNpub(npub)}</div>
    <div class="text-xs text-gray-500 mt-1">{npub}</div>
    <div class="text-xs text-gray-400 mt-1">
      {songs.length} songs · {followingCount} following · {followerCount} followers
    </div>

    {#if !isOwn}
      <button class="btn-secondary mt-3 px-3 py-1 text-xs" onclick={toggleFollow} disabled={followBusy}>
        {followBusy ? '...' : isFollowing ? 'Unfollow' : 'Follow'}
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="card text-gray-400">Loading profile...</div>
  {:else if error}
    <div class="card text-red-400">{error}</div>
  {:else if songs.length === 0}
    <div class="card text-gray-400">No songs published yet.</div>
  {:else}
    <div class="grid gap-3">
      {#each songs as song (song.id)}
        <a class="card no-underline text-white hover:border-primary" href={buildSongRoute(npub, song.id)}>
          <div class="text-sm font-medium">{song.title}</div>
          <div class="text-xs text-gray-400 mt-1">{song.effects.length} effects · seed {song.seed} · {relTime(song.createdAt)}</div>
        </a>
      {/each}
    </div>
  {/if}
</div>
