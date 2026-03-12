<script lang="ts">
  import type { NDKUserProfile } from '@nostr-dev-kit/ndk'
  import Avatar from './Avatar.svelte'
  import Name from './Name.svelte'
  import { deleteSong, listUserSongs, type SongSummary } from '$lib/songs'
  import { getNostrState } from '$lib/nostr/store'
  import { followPubkey, getFollowsForPubkey, unfollowPubkey } from '$lib/nostr/follows'
  import { getFollowers } from '$lib/nostr/socialGraph'
  import { animalNameFromNpub, pubkeyFromNpub } from '$lib/animalName'
  import { fetchUserProfile, profileAbout, profileDisplayName } from '$lib/nostr/profiles'
  import PublishedSongRow from './PublishedSongRow.svelte'

  interface Props {
    npub: string
    onPlaybackState?: (playing: boolean) => void
  }

  let { npub, onPlaybackState }: Props = $props()

  let songs = $state<SongSummary[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let followingCount = $state(0)
  let followerCount = $state(0)
  let isFollowing = $state(false)
  let followBusy = $state(false)
  let deleteBusySongId = $state<string | null>(null)
  let deleteError = $state<string | null>(null)
  let profile = $state<NDKUserProfile | null>(null)
  let refreshRequest = 0
  let activePlaybackId = $state<string | null>(null)

  let myNpub = $derived(getNostrState().npub)
  let isOwn = $derived(myNpub === npub)
  let profilePubkey = $derived(pubkeyFromNpub(npub))
  let fallbackName = $derived(animalNameFromNpub(npub))
  let displayName = $derived(profileDisplayName(profile, fallbackName))
  let about = $derived(profileAbout(profile))

  async function refresh() {
    const requestId = ++refreshRequest
    loading = true
    error = null
    deleteError = null
    profile = null
    songs = []
    followingCount = 0
    followerCount = 0
    isFollowing = false

    if (!profilePubkey) {
      error = 'Invalid profile'
      loading = false
      return
    }

    try {
      const [loadedSongs, loadedProfile, followedPubkeys] = await Promise.all([
        listUserSongs(npub),
        fetchUserProfile(profilePubkey),
        getFollowsForPubkey(profilePubkey),
      ])

      if (requestId !== refreshRequest) return

      songs = loadedSongs
      profile = loadedProfile
      followingCount = followedPubkeys.length
      followerCount = getFollowers(profilePubkey).size

      const myPubkey = getNostrState().pubkey
      if (myPubkey && !isOwn) {
        const myFollows = await getFollowsForPubkey(myPubkey)
        if (requestId !== refreshRequest) return
        isFollowing = myFollows.includes(profilePubkey)
      }
    } catch (e) {
      if (requestId !== refreshRequest) return
      error = e instanceof Error ? e.message : 'Failed to load profile'
      songs = []
    } finally {
      if (requestId !== refreshRequest) return
      loading = false
    }
  }

  async function toggleFollow() {
    if (followBusy || isOwn || !profilePubkey) return
    followBusy = true

    try {
      if (isFollowing) {
        const ok = await unfollowPubkey(profilePubkey)
        if (ok) {
          isFollowing = false
          followerCount = Math.max(0, followerCount - 1)
        }
      } else {
        const ok = await followPubkey(profilePubkey)
        if (ok) {
          isFollowing = true
          followerCount += 1
        }
      }
    } finally {
      followBusy = false
    }
  }

  async function handleDeleteSong(song: SongSummary) {
    if (!isOwn || deleteBusySongId) return
    if (!window.confirm(`Delete "${song.title}" from your profile?`)) return

    deleteBusySongId = song.id
    deleteError = null

    try {
      const deleted = await deleteSong(song.id)
      if (!deleted) {
        await refresh()
        deleteError = 'Song not found.'
        return
      }

      songs = songs.filter((entry) => entry.id !== song.id)
    } catch (e) {
      deleteError = e instanceof Error ? e.message : 'Failed to delete song'
    } finally {
      deleteBusySongId = null
    }
  }

  $effect(() => {
    npub
    void refresh()
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

<div class="space-y-4">
  <div class="card">
    <div class="flex items-start gap-4">
      {#if profilePubkey}
        <Avatar
          pubkey={profilePubkey}
          {profile}
          size={72}
          title={displayName}
          wrapperClass="border border-surface-lighter shadow-lg"
        />
      {/if}

      <div class="min-w-0 flex-1">
        <Name npub={npub} {profile} class="text-lg font-semibold break-words" />

        <div class="text-xs text-gray-400 mt-2">
          {songs.length} songs · {followingCount} following · {followerCount} followers
        </div>

        {#if !isOwn}
          <button class="btn-secondary mt-3 px-3 py-1 text-xs" onclick={toggleFollow} disabled={followBusy}>
            {followBusy ? '...' : isFollowing ? 'Unfollow' : 'Follow'}
          </button>
        {/if}
      </div>
    </div>

    {#if about}
      <div class="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{about}</div>
    {/if}
  </div>

  {#if deleteError}
    <div class="card text-red-400">{deleteError}</div>
  {/if}

  {#if loading}
    <div class="card text-gray-400">Loading profile...</div>
  {:else if error}
    <div class="card text-red-400">{error}</div>
  {:else if songs.length === 0}
    <div class="card text-gray-400">No songs published yet.</div>
  {:else}
    <div class="grid gap-3">
      {#each songs as song (song.id)}
        <PublishedSongRow
          {song}
          showDelete={isOwn}
          deleteBusy={deleteBusySongId !== null}
          {activePlaybackId}
          onActivatePlayback={handleActivatePlayback}
          onPlaybackState={handleSongPlayback}
          onDelete={handleDeleteSong}
        />
      {/each}
    </div>
  {/if}
</div>
