<script lang="ts">
  import type { NDKUserProfile } from '@nostr-dev-kit/ndk'
  import Avatar from './Avatar.svelte'
  import Name from './Name.svelte'
  import { deleteSong, listUserSongs, reorderSongs, type SongSummary } from '$lib/songs'
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
  let reorderError = $state<string | null>(null)
  let reorderBusy = $state(false)
  let draggedSongId = $state<string | null>(null)
  let dropTarget = $state<{ songId: string; position: 'before' | 'after' } | null>(null)
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
    reorderError = null
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
    if (!isOwn || deleteBusySongId || reorderBusy) return
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

  function clearDragState() {
    draggedSongId = null
    dropTarget = null
  }

  function reorderLocally(items: SongSummary[], movingId: string, targetId: string, position: 'before' | 'after'): SongSummary[] {
    if (movingId === targetId) return items

    const next = [...items]
    const fromIndex = next.findIndex((song) => song.id === movingId)
    if (fromIndex < 0) return items

    const [movingSong] = next.splice(fromIndex, 1)
    if (!movingSong) return items

    let targetIndex = next.findIndex((song) => song.id === targetId)
    if (targetIndex < 0) return items
    if (position === 'after') targetIndex += 1

    next.splice(targetIndex, 0, movingSong)
    return next
  }

  function handleReorderDragStart(song: SongSummary, event: DragEvent) {
    if (!isOwn || reorderBusy) {
      event.preventDefault()
      return
    }

    draggedSongId = song.id
    dropTarget = null
    reorderError = null

    event.dataTransfer?.setData('text/plain', song.id)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
    }
  }

  function handleReorderDragOver(song: SongSummary, event: DragEvent) {
    if (!isOwn || reorderBusy || !draggedSongId || draggedSongId === song.id) return
    event.preventDefault()

    const row = event.currentTarget
    if (!(row instanceof HTMLElement)) return

    const rect = row.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    dropTarget = { songId: song.id, position }

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  async function handleReorderDrop(song: SongSummary, event: DragEvent) {
    if (!isOwn || reorderBusy || !draggedSongId) return
    event.preventDefault()

    const row = event.currentTarget
    if (!(row instanceof HTMLElement)) return

    const rect = row.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    const nextSongs = reorderLocally(songs, draggedSongId, song.id, position)

    if (nextSongs === songs || nextSongs.every((entry, index) => entry.id === songs[index]?.id)) {
      clearDragState()
      return
    }

    const previousSongs = songs
    songs = nextSongs
    reorderBusy = true
    reorderError = null

    try {
      const saved = await reorderSongs(nextSongs.map((entry) => entry.id))
      if (!saved) {
        songs = previousSongs
        reorderError = 'Failed to save song order.'
      }
    } catch (e) {
      songs = previousSongs
      reorderError = e instanceof Error ? e.message : 'Failed to save song order.'
    } finally {
      reorderBusy = false
      clearDragState()
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

  {#if reorderError}
    <div class="card text-red-400">{reorderError}</div>
  {/if}

  {#if loading}
    <div class="card text-gray-400">Loading profile...</div>
  {:else if error}
    <div class="card text-red-400">{error}</div>
  {:else if songs.length === 0}
    <div class="card text-gray-400">No songs published yet.</div>
  {:else}
    <div class="grid gap-3" data-testid="profile-song-list" role="list">
      {#each songs as song (song.id)}
        <div
          class="relative min-w-0 transition-opacity duration-150 active:cursor-grabbing"
          class:opacity-60={draggedSongId === song.id}
          class:cursor-grab={isOwn && !reorderBusy}
          data-testid="profile-song-row"
          role="listitem"
          draggable={isOwn && !reorderBusy}
          aria-label={isOwn ? `Drag to reorder ${song.title}` : undefined}
          ondragstart={(event) => handleReorderDragStart(song, event)}
          ondragend={clearDragState}
          ondragover={(event) => handleReorderDragOver(song, event)}
          ondrop={(event) => handleReorderDrop(song, event)}
        >
          {#if dropTarget?.songId === song.id}
            {#if dropTarget.position === 'before'}
              <div class="pointer-events-none absolute -top-1 left-4 right-4 z-20 h-1 rounded-full bg-primary shadow-[0_0_14px_rgba(255,78,168,0.5)]"></div>
            {:else}
              <div class="pointer-events-none absolute -bottom-1 left-4 right-4 z-20 h-1 rounded-full bg-primary shadow-[0_0_14px_rgba(255,78,168,0.5)]"></div>
            {/if}
          {/if}

          <PublishedSongRow
            {song}
            showDelete={isOwn}
            deleteBusy={deleteBusySongId !== null || reorderBusy}
            {activePlaybackId}
            onActivatePlayback={handleActivatePlayback}
            onPlaybackState={handleSongPlayback}
            onDelete={handleDeleteSong}
          />
        </div>
      {/each}
    </div>
  {/if}
</div>
