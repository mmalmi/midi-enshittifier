<script lang="ts">
  import { onMount } from 'svelte'
  import { parseMidi, writeMidi, type MidiFile } from '$lib/midi'
  import { loadSong } from '$lib/songs'
  import { buildProfileRoute } from '$lib/router'
  import Player from './Player.svelte'
  import {
    publishComment,
    subscribeComments,
    subscribeLikes,
    toggleLike,
    type CommentItem,
  } from '$lib/interactions'
  import { getNostrState } from '$lib/nostr/store'
  import { followPubkey, getFollowsForPubkey, unfollowPubkey } from '$lib/nostr/follows'
  import { animalNameFromPubkey } from '$lib/animalName'

  interface Props {
    npub: string
    songId: string
  }

  let { npub, songId }: Props = $props()

  let loading = $state(true)
  let error = $state<string | null>(null)
  let originalMidi = $state<MidiFile | null>(null)
  let enshittifiedMidi = $state<MidiFile | null>(null)
  let title = $state('')
  let seed = $state(0)
  let effectsCount = $state(0)
  let ownerPubkey = $state<string | null>(null)

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

  function relTime(ts: number): string {
    const diff = Math.floor(Date.now() / 1000) - ts
    if (diff < 60) return `${diff}s ago`
    const mins = Math.floor(diff / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  async function refreshSong() {
    loading = true
    error = null

    try {
      const loaded = await loadSong(npub, songId)
      if (!loaded) {
        error = 'Song not found'
        return
      }

      originalMidi = parseMidi(loaded.original)
      enshittifiedMidi = parseMidi(loaded.enshittified)
      title = loaded.manifest.title
      seed = loaded.manifest.seed
      effectsCount = loaded.manifest.effects.length
      ownerPubkey = loaded.manifest.ownerPubkey

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

    const data = writeMidi(midi)
    const blob = new Blob([data as BlobPart], { type: 'audio/midi' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${kind}_${songId}.mid`
    a.click()
    URL.revokeObjectURL(url)
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
      <div class="text-xs text-gray-400 mt-1">{effectsCount} effects · seed {seed}</div>

      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        <a class="btn-ghost px-3 py-1 no-underline text-white" href={buildProfileRoute(npub)}>Profile</a>
        {#if ownerPubkey && ownerPubkey !== getNostrState().pubkey}
          <button class="btn-secondary px-3 py-1" onclick={toggleFollowOwner} disabled={followBusy}>
            {followBusy ? '...' : isFollowingOwner ? 'Unfollow' : 'Follow'}
          </button>
        {/if}
        <button class="btn-ghost px-3 py-1" onclick={doLike} disabled={likeBusy}>{userLiked ? 'Liked' : 'Like'} ({likeCount})</button>
        <button class="btn-secondary px-3 py-1" onclick={() => download('original')}>Download Original</button>
        <button class="btn-secondary px-3 py-1" onclick={() => download('enshittified')}>Download Enshittified</button>
      </div>
    </div>

    <Player original={originalMidi} enshittified={enshittifiedMidi} />

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
              <div class="text-xs text-gray-400">{animalNameFromPubkey(comment.pubkey)} · {relTime(comment.createdAt)}</div>
              <div class="text-sm mt-1">{comment.content}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
