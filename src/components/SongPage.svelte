<script lang="ts">
  import type { NDKUserProfile } from '@nostr-dev-kit/ndk'
  import { onMount } from 'svelte'
  import { parseMidi, writeMidi, type MidiFile } from '$lib/midi'
  import { downloadBytes } from '$lib/download'
  import { loadSong } from '$lib/songs'
  import { buildProfileRoute } from '$lib/router'
  import type { EnabledEffect } from '$lib/effects'
  import type { RecentShare } from '$lib/recents'
  import { formatRelativeTime, trackInfo } from '$lib/songPresentation'
  import { fetchUserProfile, profileDisplayName } from '$lib/nostr/profiles'
  import Avatar from './Avatar.svelte'
  import Name from './Name.svelte'
  import SongWorkbench from './SongWorkbench.svelte'
  import {
    publishComment,
    subscribeComments,
    subscribeLikes,
    toggleLike,
    type CommentItem,
  } from '$lib/interactions'
  import { getNostrState } from '$lib/nostr/store'
  import { followPubkey, getFollowsForPubkey, unfollowPubkey } from '$lib/nostr/follows'

  interface Props {
    npub: string
    songId: string
    onRecentsChanged?: (next: RecentShare[]) => void
    onPlaybackState?: (playing: boolean) => void
  }

  let { npub, songId, onRecentsChanged, onPlaybackState }: Props = $props()

  let loading = $state(true)
  let error = $state<string | null>(null)
  let originalMidi = $state<MidiFile | null>(null)
  let enshittifiedMidi = $state<MidiFile | null>(null)
  let title = $state('')
  let fileName = $state('')
  let publishedSeed = $state(0)
  let effectsCount = $state(0)
  let ownerPubkey = $state<string | null>(null)
  let ownerProfile = $state<NDKUserProfile | null>(null)
  let ownerProfileRequest = 0
  let editorEnabled = $state<EnabledEffect[]>([])
  let editorSeed = $state<number | null>(null)
  let editorShareName = $state('')

  let likeCount = $state(0)
  let userLiked = $state(false)
  let comments = $state<CommentItem[]>([])
  let commentInput = $state('')
  let postingComment = $state(false)
  let likeBusy = $state(false)

  let isFollowingOwner = $state(false)
  let followBusy = $state(false)

  let likeUnsub: (() => void) | null = null
  let commentUnsub: (() => void) | null = null

  const identifier = $derived(`${npub}/songs/${songId}`)
  const ownerDisplayName = $derived(profileDisplayName(ownerProfile))

  $effect(() => {
    const currentOwnerPubkey = ownerPubkey
    const requestId = ++ownerProfileRequest

    if (!currentOwnerPubkey) {
      ownerProfile = null
      return
    }

    void fetchUserProfile(currentOwnerPubkey).then((nextProfile) => {
      if (requestId !== ownerProfileRequest) return
      ownerProfile = nextProfile
    })
  })

  async function refreshSong() {
    loading = true
    error = null
    ownerProfile = null

    try {
      const loaded = await loadSong(npub, songId)
      if (!loaded) {
        error = 'Song not found'
        return
      }

      originalMidi = parseMidi(loaded.original)
      enshittifiedMidi = parseMidi(loaded.enshittified)
      title = loaded.manifest.title
      fileName = loaded.manifest.sourceFileName
      publishedSeed = loaded.manifest.seed
      effectsCount = loaded.manifest.effects.length
      ownerPubkey = loaded.manifest.ownerPubkey
      editorEnabled = loaded.manifest.effects.map((effect) => ({ ...effect }))
      editorSeed = loaded.manifest.seed
      editorShareName = loaded.manifest.title

      if (ownerPubkey && getNostrState().pubkey) {
        const follows = await getFollowsForPubkey(getNostrState().pubkey!)
        isFollowingOwner = follows.includes(ownerPubkey)
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load song'
    } finally {
      loading = false
    }
  }

  function download(kind: 'original' | 'enshittified') {
    const midi = kind === 'original' ? originalMidi : enshittifiedMidi
    if (!midi) return

    downloadBytes(`${kind}_${songId}.mid`, writeMidi(midi), 'audio/midi')
  }

  async function doLike() {
    if (likeBusy) return
    likeBusy = true
    try {
      await toggleLike(identifier, {
        ownerPubkey,
        currentlyLiked: userLiked,
      })

      if (!userLiked) {
        userLiked = true
        likeCount += 1
      }
    } finally {
      likeBusy = false
    }
  }

  async function postComment() {
    if (postingComment || !commentInput.trim()) return
    postingComment = true

    try {
      await publishComment(identifier, commentInput, { ownerPubkey })
      commentInput = ''
    } finally {
      postingComment = false
    }
  }

  async function toggleFollowOwner() {
    if (!ownerPubkey || followBusy) return
    followBusy = true
    try {
      if (isFollowingOwner) {
        const ok = await unfollowPubkey(ownerPubkey)
        if (ok) isFollowingOwner = false
      } else {
        const ok = await followPubkey(ownerPubkey)
        if (ok) isFollowingOwner = true
      }
    } finally {
      followBusy = false
    }
  }

  onMount(() => {
    void refreshSong()

    likeUnsub = subscribeLikes(identifier, (snapshot) => {
      likeCount = snapshot.count
      userLiked = snapshot.userLiked
    })

    commentUnsub = subscribeComments(identifier, (rows) => {
      comments = rows
    })

    return () => {
      likeUnsub?.()
      commentUnsub?.()
    }
  })
</script>

{#if loading}
  <div class="card text-gray-400">Loading song...</div>
{:else if error}
  <div class="card text-red-400">{error}</div>
  {:else if originalMidi && enshittifiedMidi}
  <div class="space-y-4">
    <div class="card">
      <div class="text-xl font-semibold">{title}</div>
      <div class="text-xs text-gray-400 mt-1">{effectsCount} effects · seed {publishedSeed}</div>
      <div class="mt-3 text-sm font-medium text-white/90 truncate">{fileName || `${songId}.mid`}</div>
      <div class="mt-1 text-xs text-gray-500">{trackInfo(originalMidi)}</div>

      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        {#if ownerPubkey}
          <a
            class="inline-flex max-w-full items-center gap-2 rounded-lg bg-surface px-3 py-1 no-underline text-white transition-colors hover:bg-surface-lighter"
            href={buildProfileRoute(npub)}
            title={`Open ${ownerDisplayName} profile`}
          >
            <Avatar
              pubkey={ownerPubkey}
              profile={ownerProfile}
              size={24}
              title={ownerDisplayName}
              wrapperClass="border border-surface-lighter shadow-sm"
            />
            <Name npub={npub} profile={ownerProfile} class="min-w-0 text-xs font-medium text-white" />
          </a>
        {/if}
        {#if ownerPubkey && ownerPubkey !== getNostrState().pubkey}
          <button class="btn-secondary px-3 py-1" onclick={toggleFollowOwner} disabled={followBusy}>
            {followBusy ? '...' : isFollowingOwner ? 'Unfollow' : 'Follow'}
          </button>
        {/if}
        <button class="btn-ghost px-3 py-1" onclick={doLike} disabled={likeBusy}>
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill={userLiked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20.5 4.9 13.9a4.77 4.77 0 0 1 0-6.82 4.57 4.57 0 0 1 6.66 0L12 7.53l.44-.45a4.57 4.57 0 0 1 6.66 0 4.77 4.77 0 0 1 0 6.82L12 20.5Z" />
          </svg>
          {userLiked ? 'Liked' : 'Like'} ({likeCount})
        </button>
        <button class="btn-secondary px-3 py-1" onclick={() => download('original')}>
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 4.5v10" />
            <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
            <path d="M5 18.5h14" />
          </svg>
          Download Original
        </button>
      </div>
    </div>

    <SongWorkbench
      {originalMidi}
      fileName={fileName || `${songId}.mid`}
      bind:enabled={editorEnabled}
      bind:shareName={editorShareName}
      bind:enshittifiedMidi
      bind:lastSeed={editorSeed}
      showFileCard={false}
      onRecentsChanged={onRecentsChanged}
      {onPlaybackState}
    />

    <div class="card">
      <div class="text-sm font-medium mb-2">Comments ({comments.length})</div>

      <div class="flex gap-2 mb-3">
        <input
          type="text"
          class="flex-1 rounded-lg bg-surface-light border border-surface-lighter px-3 py-2 text-sm text-white outline-none focus:border-primary-op50"
          placeholder="Write a comment"
          bind:value={commentInput}
        />
        <button class="btn-secondary px-3 py-2 text-xs" disabled={postingComment || !commentInput.trim()} onclick={postComment}>Post</button>
      </div>

      {#if comments.length === 0}
        <div class="text-xs text-gray-400">No comments yet.</div>
      {:else}
        <div class="space-y-2">
          {#each comments as comment (comment.id)}
            <div class="rounded-lg bg-surface p-2">
              <div class="text-xs text-gray-400"><Name pubkey={comment.pubkey} /> · {formatRelativeTime(comment.createdAt)}</div>
              <div class="text-sm mt-1">{comment.content}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
